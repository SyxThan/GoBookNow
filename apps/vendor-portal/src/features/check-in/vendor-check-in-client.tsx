"use client";
import { setPortalToken } from "@gobook/auth/use-session";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  ApiError,
  checkInVendorTicket,
  type TicketCheckInResult,
  type TicketValidationReason,
  type VendorTicketValidation,
  validateVendorTicket,
} from "@/lib/api-client";
import QrScanner from "./qr-scanner";

const REASON_MESSAGES: Record<TicketValidationReason, string> = {
  VALID: "Vé hợp lệ",
  INVALID_TOKEN: "Mã QR không hợp lệ.",
  TICKET_NOT_FOUND: "Không tìm thấy vé.",
  TICKET_VOIDED: "Vé đã bị vô hiệu hóa.",
  ALREADY_CHECKED_IN: "Vé đã được check-in.",
  BOOKING_NOT_CONFIRMED: "Đơn đặt chỗ chưa được xác nhận.",
  BOOKING_CANCELLED: "Đơn đặt chỗ đã bị hủy.",
  BOOKING_EXPIRED: "Đơn đặt chỗ đã hết hạn.",
  SLOT_CANCELLED: "Lịch dịch vụ đã bị hủy.",
  SLOT_EXPIRED: "Đã quá thời gian sử dụng vé.",
  SLOT_NOT_STARTED: "Chưa đến thời gian check-in.",
  INCONSISTENT_TICKET_DATA: "Không thể xác thực dữ liệu vé.",
};

function formatDateTime(value: string): string {
  return new Intl.DateTimeFormat("vi-VN", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "Asia/Ho_Chi_Minh",
  }).format(new Date(value));
}

function isTicketReason(
  value: string | undefined,
): value is TicketValidationReason {
  return Boolean(value && value in REASON_MESSAGES);
}

export default function VendorCheckInClient() {
  const [hydrated, setHydrated] = useState(false);
  const [accessToken, setAccessTokenState] = useState<string | null>(null);
  const [authRequired, setAuthRequired] = useState(false);
  const [manualToken, setManualToken] = useState("");
  const [currentToken, setCurrentToken] = useState<string | null>(null);
  const [validation, setValidation] = useState<VendorTicketValidation | null>(
    null,
  );
  const [checkInResult, setCheckInResult] =
    useState<TicketCheckInResult | null>(null);
  const [validating, setValidating] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const validationBusyRef = useRef(false);
  const confirmationBusyRef = useRef(false);

  const setAccessToken = useCallback((token: string | null) => {
    setAccessTokenState(token);
    setPortalToken(token);
  }, []);

  useEffect(() => {
    const token = sessionStorage.getItem("gobook.accessToken");
    setAccessTokenState(token);
    setAuthRequired(!token);
    setHydrated(true);
  }, []);

  const handleCameraError = useCallback((message: string) => {
    setCameraError(message);
  }, []);

  const validateToken = useCallback(
    async (rawToken: string) => {
      const token = rawToken.trim();
      if (!token || validationBusyRef.current) return;

      validationBusyRef.current = true;
      setValidating(true);
      setCurrentToken(token);
      setManualToken("");
      setValidation(null);
      setCheckInResult(null);
      setError(null);
      try {
        const result = await validateVendorTicket(
          token,
          accessToken,
          setAccessToken,
        );
        setValidation(result);
        if (!result.checkInEligible) setCurrentToken(null);
      } catch (validationError) {
        if (validationError instanceof ApiError) {
          if (validationError.status === 401) setAuthRequired(true);
          else if (validationError.status === 403) {
            setError("Bạn không có quyền xác thực vé này.");
          } else setError(validationError.message);
        } else {
          setError("Không thể kết nối đến GoBook API. Vui lòng thử lại.");
        }
      } finally {
        validationBusyRef.current = false;
        setValidating(false);
      }
    },
    [accessToken, setAccessToken],
  );

  const confirmCheckIn = async () => {
    if (
      !currentToken ||
      !validation?.checkInEligible ||
      confirmationBusyRef.current
    ) {
      return;
    }
    confirmationBusyRef.current = true;
    setConfirming(true);
    setError(null);
    try {
      const result = await checkInVendorTicket(
        currentToken,
        accessToken,
        setAccessToken,
      );
      setCheckInResult(result);
      setValidation(null);
      setCurrentToken(null);
    } catch (checkInError) {
      if (checkInError instanceof ApiError) {
        if (checkInError.status === 401) setAuthRequired(true);
        if (checkInError.status === 403) {
          setError("Bạn không có quyền check-in vé này.");
        } else if (isTicketReason(checkInError.code)) {
          const reason = checkInError.code;
          setCurrentToken(null);
          setValidation((current) =>
            current
              ? {
                  ...current,
                  checkInEligible: false,
                  reason,
                  ticket: current.ticket
                    ? {
                        ...current.ticket,
                        checkedInAt:
                          checkInError.details?.checkedInAt ??
                          current.ticket.checkedInAt,
                      }
                    : current.ticket,
                }
              : current,
          );
        } else setError(checkInError.message);
      } else {
        setError("Không thể kết nối đến GoBook API. Vui lòng thử lại.");
      }
    } finally {
      confirmationBusyRef.current = false;
      setConfirming(false);
    }
  };

  const scanNext = () => {
    setCurrentToken(null);
    setManualToken("");
    setValidation(null);
    setCheckInResult(null);
    setError(null);
    setCameraError(null);
  };

  if (!hydrated) {
    return (
      <main className="grid min-h-[70vh] place-items-center bg-canvas text-ink">
        <p className="text-sm text-muted">Đang mở máy quét…</p>
      </main>
    );
  }

  if (authRequired) {
    return <p role="status">Đang chuyển đến đăng nhập…</p>;
  }

  const scannerActive =
    !currentToken && !validation && !checkInResult && !validating;

  return (
    <main className="min-h-[70vh] bg-canvas text-ink">
      <div className="mx-auto max-w-3xl px-4 py-6 sm:px-8 sm:py-10">
        <header className="mb-7">
          <p className="eyebrow">GoBook Vendor</p>
          <h1 className="mt-3 text-3xl font-bold tracking-tight sm:text-5xl">
            Check-in vé
          </h1>
          <p className="mt-3 text-sm leading-6 text-muted">
            Quét mã, kiểm tra thông tin rồi xác nhận check-in. Cho phép sử dụng
            camera để quét, hoặc dán mã vé vào ô bên dưới.
          </p>
        </header>

        {error && <StatusBanner tone="error">{error}</StatusBanner>}

        {scannerActive ? (
          <section className="space-y-6">
            <QrScanner
              active
              onDetected={validateToken}
              onCameraError={handleCameraError}
            />
            {cameraError && (
              <StatusBanner tone="warning">{cameraError}</StatusBanner>
            )}
            <form
              onSubmit={(event) => {
                event.preventDefault();
                void validateToken(manualToken);
              }}
              className="panel p-5 sm:p-6"
            >
              <label className="block text-sm font-medium text-ink">
                Hoặc dán mã QR/token thủ công
                <input
                  value={manualToken}
                  onChange={(event) => setManualToken(event.target.value)}
                  maxLength={512}
                  autoComplete="off"
                  spellCheck={false}
                  className="input mt-3 font-mono text-sm"
                  placeholder="Dán mã vé tại đây"
                />
              </label>
              <button
                type="submit"
                disabled={!manualToken.trim()}
                className="primary-button mt-4 w-full py-4"
              >
                Kiểm tra vé
              </button>
            </form>
          </section>
        ) : validating ? (
          <div className="panel p-10 text-center">
            <p className="text-lg font-medium">Đang xác thực vé…</p>
          </div>
        ) : checkInResult ? (
          <SuccessState result={checkInResult} onNext={scanNext} />
        ) : validation ? (
          <ValidationState
            validation={validation}
            confirming={confirming}
            onConfirm={() => void confirmCheckIn()}
            onNext={scanNext}
          />
        ) : (
          <button
            type="button"
            onClick={scanNext}
            className="primary-button w-full"
          >
            Quét vé tiếp theo
          </button>
        )}
      </div>
    </main>
  );
}

function ValidationState({
  validation,
  confirming,
  onConfirm,
  onNext,
}: {
  validation: VendorTicketValidation;
  confirming: boolean;
  onConfirm: () => void;
  onNext: () => void;
}) {
  const eligible = validation.reason === "VALID" && validation.checkInEligible;
  const warning =
    validation.reason === "ALREADY_CHECKED_IN" ||
    validation.reason === "SLOT_NOT_STARTED";

  return (
    <section
      className={`rounded-2xl border p-6 sm:p-8 ${
        eligible
          ? "border-success/30 bg-mint/30"
          : warning
            ? "border-warning/30 bg-sun/30"
            : "border-danger/30 bg-coral/30"
      }`}
    >
      <p className="text-4xl" aria-hidden="true">
        {eligible ? "✓" : warning ? "⚠" : "×"}
      </p>
      <h2 className="mt-4 text-2xl font-bold">
        {REASON_MESSAGES[validation.reason]}
      </h2>
      {validation.ticket && validation.service && validation.slot && (
        <dl className="mt-7 grid gap-5 rounded-2xl bg-canvas/50 p-5 sm:grid-cols-2">
          <Info label="Mã vé" value={validation.ticket.ticketCode} />
          <Info label="Trạng thái" value={validation.ticket.status} />
          <Info label="Dịch vụ / Sự kiện" value={validation.service.title} />
          <Info
            label="Thời gian"
            value={`${formatDateTime(validation.slot.startAt)} – ${formatDateTime(validation.slot.endAt)}`}
          />
          {validation.reason === "ALREADY_CHECKED_IN" &&
            validation.ticket.checkedInAt && (
              <Info
                label="Đã check-in lúc"
                value={formatDateTime(validation.ticket.checkedInAt)}
              />
            )}
          {validation.reason === "SLOT_NOT_STARTED" && (
            <Info
              label="Bắt đầu lúc"
              value={formatDateTime(validation.slot.startAt)}
            />
          )}
        </dl>
      )}
      {eligible ? (
        <button
          type="button"
          onClick={onConfirm}
          disabled={confirming}
          className="primary-button mt-7 w-full py-4 text-lg"
        >
          {confirming ? "Đang check-in…" : "Xác nhận check-in"}
        </button>
      ) : (
        <button
          type="button"
          onClick={onNext}
          className="secondary-button mt-7 w-full py-4"
        >
          Quét vé tiếp theo
        </button>
      )}
    </section>
  );
}

function SuccessState({
  result,
  onNext,
}: {
  result: TicketCheckInResult;
  onNext: () => void;
}) {
  return (
    <section className="rounded-2xl border border-success/30 bg-mint/30 p-7 text-center sm:p-10">
      <div className="mx-auto grid h-20 w-20 place-items-center rounded-full bg-mint text-4xl font-bold text-ink">
        ✓
      </div>
      <h2 className="mt-6 text-3xl font-bold">Check-in thành công</h2>
      <p className="mt-3 font-mono text-lg text-success">
        {result.ticket.ticketCode}
      </p>
      <p className="mt-2 text-ink">{result.service.title}</p>
      <p className="mt-1 text-sm text-muted">
        {formatDateTime(result.ticket.checkedInAt)}
      </p>
      <button
        type="button"
        onClick={onNext}
        className="primary-button mt-8 w-full py-4"
      >
        Quét vé tiếp theo
      </button>
    </section>
  );
}

function Info({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="section-label">{label}</dt>
      <dd className="mt-1.5 text-sm text-ink">{value}</dd>
    </div>
  );
}

function StatusBanner({
  tone,
  children,
}: {
  tone: "error" | "warning";
  children: React.ReactNode;
}) {
  return (
    <div
      className={`mb-5 rounded-2xl border px-5 py-4 text-sm ${
        tone === "error"
          ? "border-danger/30 bg-coral/30 text-danger"
          : "border-warning/30 bg-sun/30 text-warning"
      }`}
    >
      {children}
    </div>
  );
}
