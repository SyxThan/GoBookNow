"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type FormEvent,
  type ReactNode,
} from "react";
import { BookingExpiredState } from "@/components/booking/booking-expired-state";
import { BookingHeldCard } from "@/components/booking/booking-held-card";
import { BookingSummary } from "@/components/booking/booking-summary";
import { QuantitySelector } from "@/components/booking/quantity-selector";
import {
  createBookingHold,
  getPublicService,
  initiateSePayPayment,
  listPublicSlots,
  login,
  type BookingHoldResponse,
} from "@/lib/api-client";
import { toFriendlyBookingError, type FriendlyBookingError } from "@/lib/booking-errors";
import {
  clearCheckoutDraft,
  clearHeldBooking,
  clearHoldAttempt,
  ensureHoldAttempt,
  readCheckoutDraft,
  readHeldBooking,
  replaceHoldAttempt,
  saveCheckoutDraft,
  saveHeldBooking,
  type CheckoutDraft,
} from "@/lib/booking-storage";
import {
  canInitiateSePay,
  type CheckoutPaymentState,
} from "@/lib/checkout-payment-state";
import { toFriendlyPaymentError } from "@/lib/payment-errors";
import { submitExternalPaymentForm } from "@/lib/payment-form";
import { isFutureOpenSlot } from "@/lib/slots";

type CheckoutState =
  | { step: "SUMMARY" }
  | { step: "CREATING_HOLD" }
  | { step: "ERROR"; error: FriendlyBookingError }
  | { step: "HELD"; booking: BookingHoldResponse; priceChanged: boolean }
  | { step: "EXPIRED"; booking: BookingHoldResponse };

type HoldVariables = {
  draft: CheckoutDraft;
  idempotencyKey: string;
  previewUnitPrice: string;
};

const ACCESS_TOKEN_KEY = "gobook.accessToken";

export function BookingCheckoutClient() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const queryClient = useQueryClient();
  const serviceParam = searchParams.get("service");
  const [hydrated, setHydrated] = useState(false);
  const [draft, setDraft] = useState<CheckoutDraft | null>(null);
  const [state, setState] = useState<CheckoutState>({ step: "SUMMARY" });
  const [accessToken, setAccessTokenState] = useState<string | null>(null);
  const [showLogin, setShowLogin] = useState(false);
  const [paymentState, setPaymentState] = useState<CheckoutPaymentState>({
    step: "READY",
  });
  const submitGuard = useRef(false);
  const paymentSubmitGuard = useRef(false);

  const setAccessToken = useCallback((token: string | null) => {
    setAccessTokenState(token);
    if (token) window.sessionStorage.setItem(ACCESS_TOKEN_KEY, token);
    else window.sessionStorage.removeItem(ACCESS_TOKEN_KEY);
  }, []);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      const storedDraft = readCheckoutDraft(window.sessionStorage);
      const held = readHeldBooking(window.sessionStorage);
      const token = window.sessionStorage.getItem(ACCESS_TOKEN_KEY);
      setAccessTokenState(token);

      if (held && (!serviceParam || held.serviceSlug === serviceParam)) {
        const expired =
          !held.booking.expiresAt ||
          new Date(held.booking.expiresAt).getTime() <= Date.now();
        setState(
          expired
            ? { step: "EXPIRED", booking: held.booking }
            : { step: "HELD", booking: held.booking, priceChanged: false },
        );
      }
      if (storedDraft && (!serviceParam || storedDraft.serviceSlug === serviceParam)) {
        setDraft(storedDraft);
      }
      setHydrated(true);
    }, 0);
    return () => window.clearTimeout(timer);
  }, [serviceParam]);

  const serviceQuery = useQuery({
    queryKey: ["public-service", draft?.serviceSlug],
    queryFn: ({ signal }) => getPublicService(draft!.serviceSlug, signal),
    enabled: Boolean(draft?.serviceSlug),
  });
  const slotsQuery = useQuery({
    queryKey: ["public-slots", draft?.serviceId],
    queryFn: ({ signal }) => listPublicSlots(draft!.serviceId, signal),
    enabled: Boolean(draft?.serviceId),
  });
  const slot = slotsQuery.data?.items.find((item) => item.id === draft?.slotId);

  const holdMutation = useMutation({
    mutationFn: (variables: HoldVariables) =>
      createBookingHold(
        {
          idempotencyKey: variables.idempotencyKey,
          items: [
            {
              slotId: variables.draft.slotId,
              quantity: variables.draft.quantity,
            },
          ],
        },
        accessToken,
        setAccessToken,
      ),
    retry: false,
    onSuccess: (booking, variables) => {
      submitGuard.current = false;
      setPaymentState({ step: "READY" });
      clearHoldAttempt(window.sessionStorage);
      saveHeldBooking(
        { serviceSlug: variables.draft.serviceSlug, booking },
        window.sessionStorage,
      );
      const priceChanged =
        booking.items[0]?.unitPriceAmount !== variables.previewUnitPrice;
      const expired =
        !booking.expiresAt || new Date(booking.expiresAt).getTime() <= Date.now();
      setState(
        expired
          ? { step: "EXPIRED", booking }
          : { step: "HELD", booking, priceChanged },
      );
    },
    onError: (error, variables) => {
      submitGuard.current = false;
      const friendly = toFriendlyBookingError(error);
      if (friendly.refetchSlots) {
        void queryClient.invalidateQueries({
          queryKey: ["public-slots", variables.draft.serviceId],
        });
      }
      if (friendly.kind === "AUTH") {
        setAccessToken(null);
        setShowLogin(true);
      }
      setState({ step: "ERROR", error: friendly });
    },
  });

  const paymentMutation = useMutation({
    mutationFn: (bookingId: string) =>
      initiateSePayPayment(bookingId, accessToken, setAccessToken),
    retry: false,
    onSuccess: (payment) => {
      setPaymentState({ step: "REDIRECTING", payment });
    },
    onError: (error) => {
      paymentSubmitGuard.current = false;
      const friendly = toFriendlyPaymentError(error);
      if (friendly.expired) {
        setState((current) =>
          current.step === "HELD"
            ? { step: "EXPIRED", booking: current.booking }
            : current,
        );
        return;
      }
      setPaymentState({
        step: "ERROR",
        message: friendly.message,
        retryable: friendly.retryable,
      });
    },
  });

  useEffect(() => {
    if (paymentState.step !== "REDIRECTING") return;

    const timer = window.setTimeout(() => {
      try {
        submitExternalPaymentForm(paymentState.payment);
      } catch {
        paymentSubmitGuard.current = false;
        setPaymentState({
          step: "ERROR",
          message:
            "Dữ liệu chuyển hướng thanh toán không hợp lệ. Vui lòng thử lại sau.",
          retryable: false,
        });
      }
    }, 50);

    return () => window.clearTimeout(timer);
  }, [paymentState]);

  const submitHold = () => {
    if (!draft || !slot || holdMutation.isPending || submitGuard.current) return;
    if (!accessToken) {
      setShowLogin(true);
      return;
    }
    const attempt = ensureHoldAttempt(draft, window.sessionStorage);
    submitGuard.current = true;
    setState({ step: "CREATING_HOLD" });
    holdMutation.mutate({
      draft,
      idempotencyKey: attempt.key,
      previewUnitPrice: slot.price.amount,
    });
  };

  const submitPayment = (booking: BookingHoldResponse) => {
    const isExpired =
      !booking.expiresAt ||
      new Date(booking.expiresAt).getTime() <= Date.now();
    if (
      paymentSubmitGuard.current ||
      !canInitiateSePay({
        bookingStatus: booking.status,
        totalAmount: booking.totalAmount,
        isExpired,
        paymentState,
      })
    ) {
      return;
    }

    paymentSubmitGuard.current = true;
    setPaymentState({ step: "INITIATING_PAYMENT" });
    paymentMutation.mutate(booking.id);
  };

  const updateQuantity = (quantity: number) => {
    if (!draft) return;
    const next = { ...draft, quantity };
    setDraft(next);
    saveCheckoutDraft(next, window.sessionStorage);
    replaceHoldAttempt(next, window.sessionStorage);
    setState({ step: "SUMMARY" });
  };

  const handleExpired = useCallback(() => {
    paymentSubmitGuard.current = false;
    setState((current) =>
      current.step === "HELD"
        ? { step: "EXPIRED", booking: current.booking }
        : current,
    );
  }, []);

  const retryExpired = () => {
    if (!draft) return;
    clearHeldBooking(window.sessionStorage);
    setPaymentState({ step: "READY" });
    replaceHoldAttempt(draft, window.sessionStorage);
    void queryClient.invalidateQueries({
      queryKey: ["public-slots", draft.serviceId],
    });
    setState({ step: "SUMMARY" });
  };

  const chooseAnother = () => {
    if (!draft) return;
    clearHeldBooking(window.sessionStorage);
    clearHoldAttempt(window.sessionStorage);
    clearCheckoutDraft(window.sessionStorage);
    router.push(`/services/${encodeURIComponent(draft.serviceSlug)}`);
  };

  const startFreshAttempt = () => {
    if (!draft) return;
    replaceHoldAttempt(draft, window.sessionStorage);
    setState({ step: "SUMMARY" });
  };

  if (!hydrated) return <CheckoutLoading />;
  if (state.step === "HELD") {
    return (
      <CheckoutShell>
        <BookingHeldCard
          booking={state.booking}
          priceChanged={state.priceChanged}
          paymentState={paymentState}
          onPay={() => submitPayment(state.booking)}
          onExpired={handleExpired}
        />
      </CheckoutShell>
    );
  }
  if (state.step === "EXPIRED") {
    return (
      <CheckoutShell>
        <BookingExpiredState onRetry={retryExpired} onChooseAnother={chooseAnother} />
      </CheckoutShell>
    );
  }
  if (!draft) {
    return (
      <CheckoutShell>
        <EmptyCheckout />
      </CheckoutShell>
    );
  }
  if (serviceQuery.isPending || slotsQuery.isPending) return <CheckoutLoading />;
  if (serviceQuery.isError || slotsQuery.isError) {
    return (
      <CheckoutShell>
        <section className="panel mx-auto max-w-xl p-8 text-center" role="alert">
          <h1 className="text-2xl font-semibold text-white">Không thể tải tóm tắt booking</h1>
          <p className="mt-3 text-sm text-slate-400">
            Vui lòng tải lại dữ liệu trước khi tạo hold.
          </p>
          <button
            type="button"
            className="primary-button mt-6"
            onClick={() => {
              void serviceQuery.refetch();
              void slotsQuery.refetch();
            }}
          >
            Thử lại
          </button>
        </section>
      </CheckoutShell>
    );
  }
  if (!serviceQuery.data || !slot || !isFutureOpenSlot(slot)) {
    return (
      <CheckoutShell>
        <section className="panel mx-auto max-w-xl p-8 text-center" role="alert">
          <h1 className="text-2xl font-semibold text-white">
            Khung giờ không còn khả dụng
          </h1>
          <p className="mt-3 text-sm text-slate-400">
            Dữ liệu Slot đã thay đổi. Hãy quay lại và chọn một lịch khác.
          </p>
          <button type="button" className="primary-button mt-6" onClick={chooseAnother}>
            Chọn khung giờ khác
          </button>
        </section>
      </CheckoutShell>
    );
  }

  const creating = state.step === "CREATING_HOLD" || holdMutation.isPending;
  const error = state.step === "ERROR" ? state.error : null;

  return (
    <CheckoutShell>
      <div className="mb-7 flex items-center justify-between gap-4">
        <div>
          <p className="eyebrow">Bước 2 / 2</p>
          <p className="mt-2 text-sm text-slate-400">Xác nhận trước khi giữ chỗ</p>
        </div>
        <button type="button" className="secondary-button" onClick={chooseAnother}>
          ← Chọn lại Slot
        </button>
      </div>

      <div className="grid items-start gap-7 lg:grid-cols-[minmax(0,1fr)_340px]">
        <BookingSummary service={serviceQuery.data} slot={slot} quantity={draft.quantity} />

        <aside className="panel p-5 lg:sticky lg:top-5">
          <QuantitySelector
            value={draft.quantity}
            max={slot.capacity}
            disabled={creating}
            onChange={updateQuantity}
          />

          {error && (
            <div
              id="hold-error"
              className="mt-5 rounded-xl border border-rose-300/30 bg-rose-300/10 p-4"
              role="alert"
            >
              <p className="text-sm text-rose-100">{error.message}</p>
              {(error.kind === "CAPACITY" || error.kind === "SLOT_UNAVAILABLE") && (
                <button
                  type="button"
                  className="mt-3 text-sm font-semibold text-teal-200"
                  onClick={chooseAnother}
                >
                  Chọn khung giờ khác
                </button>
              )}
              {error.kind === "IDEMPOTENCY" && (
                <button
                  type="button"
                  className="mt-3 text-sm font-semibold text-teal-200"
                  onClick={startFreshAttempt}
                >
                  Tạo lần thử mới
                </button>
              )}
            </div>
          )}

          {showLogin || !accessToken ? (
            <LoginPanel
              onSuccess={(token) => {
                setAccessToken(token);
                setShowLogin(false);
                setState({ step: "SUMMARY" });
              }}
            />
          ) : (
            <>
              <p className="mt-5 text-xs leading-5 text-slate-500">
                Khi xác nhận, backend kiểm tra lại tình trạng Slot, sức chứa và giá.
              </p>
              <button
                type="button"
                className="primary-button mt-5 w-full"
                disabled={creating}
                aria-describedby={error ? "hold-error" : undefined}
                onClick={submitHold}
              >
                {creating
                  ? "Đang tạo hold…"
                  : error?.kind === "NETWORK"
                    ? "Thử lại cùng request"
                    : "Giữ chỗ"}
              </button>
            </>
          )}
        </aside>
      </div>
    </CheckoutShell>
  );
}

function LoginPanel({ onSuccess }: { onSuccess: (token: string) => void }) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      onSuccess(await login(email, password));
    } catch {
      setError("Không thể đăng nhập. Vui lòng kiểm tra tài khoản khách hàng.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <form className="mt-6 border-t border-white/10 pt-5" onSubmit={submit}>
      <h2 className="font-semibold text-white">Đăng nhập để giữ chỗ</h2>
      <label className="mt-4 block">
        <span className="section-label">Email</span>
        <input
          className="input mt-2"
          type="email"
          autoComplete="email"
          required
          value={email}
          onChange={(event) => setEmail(event.target.value)}
        />
      </label>
      <label className="mt-4 block">
        <span className="section-label">Mật khẩu</span>
        <input
          className="input mt-2"
          type="password"
          autoComplete="current-password"
          required
          value={password}
          onChange={(event) => setPassword(event.target.value)}
        />
      </label>
      {error && (
        <p className="mt-3 text-sm text-rose-200" role="alert">
          {error}
        </p>
      )}
      <button type="submit" className="primary-button mt-5 w-full" disabled={submitting}>
        {submitting ? "Đang đăng nhập…" : "Đăng nhập"}
      </button>
    </form>
  );
}

function CheckoutShell({ children }: { children: ReactNode }) {
  return (
    <main className="min-h-screen bg-slate-950 text-slate-100">
      <header className="border-b border-white/10 px-5 py-4">
        <div className="mx-auto flex max-w-5xl items-center justify-between">
          <Link href="/services" className="text-lg font-bold text-white">
            GoBook<span className="text-teal-300">Now</span>
          </Link>
          <span className="text-sm text-slate-400">Checkout an toàn</span>
        </div>
      </header>
      <div className="mx-auto max-w-5xl px-5 py-8 sm:py-12">{children}</div>
    </main>
  );
}

function CheckoutLoading() {
  return (
    <CheckoutShell>
      <div className="animate-pulse">
        <div className="h-6 w-44 rounded bg-slate-800" />
        <div className="mt-8 grid gap-7 lg:grid-cols-[1fr_340px]">
          <div className="h-96 rounded-3xl bg-slate-900" />
          <div className="h-72 rounded-3xl bg-slate-900" />
        </div>
      </div>
    </CheckoutShell>
  );
}

function EmptyCheckout() {
  return (
    <section className="panel mx-auto max-w-xl p-8 text-center">
      <h1 className="text-2xl font-semibold text-white">Chưa có Slot được chọn</h1>
      <p className="mt-3 text-sm text-slate-400">
        Checkout chỉ bắt đầu sau khi bạn chọn một khung giờ từ trang dịch vụ.
      </p>
      <Link href="/services" className="primary-button mt-6 inline-flex">
        Khám phá dịch vụ
      </Link>
    </section>
  );
}
