"use client";

import { useQuery } from "@tanstack/react-query";
import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { BookingSlotSelector } from "@/components/booking/booking-slot-selector";
import { QuantitySelector } from "@/components/booking/quantity-selector";
import {
  getPublicService,
  listPublicSlots,
  type PublicSlot,
} from "@/lib/api-client";
import {
  replaceHoldAttempt,
  saveCheckoutDraft,
} from "@/lib/booking-storage";
import { formatMoney, locationLabel } from "@/lib/format";
import { isFutureOpenSlot } from "@/lib/slots";

export function ServiceDetailClient({ slug }: { slug: string }) {
  const router = useRouter();
  const [selectedSlotId, setSelectedSlotId] = useState<string | null>(null);
  const [quantity, setQuantity] = useState(1);

  const serviceQuery = useQuery({
    queryKey: ["public-service", slug],
    queryFn: ({ signal }) => getPublicService(slug, signal),
  });
  const service = serviceQuery.data;
  const slotsQuery = useQuery({
    queryKey: ["public-slots", service?.id],
    queryFn: ({ signal }) => listPublicSlots(service!.id, signal),
    enabled: Boolean(service?.id),
  });

  const slots = useMemo(
    () =>
      (slotsQuery.data?.items ?? []).filter(isFutureOpenSlot),
    [slotsQuery.data],
  );
  const selectedSlot = slots.find((slot) => slot.id === selectedSlotId) ?? null;

  const selectSlot = (slot: PublicSlot) => {
    setSelectedSlotId(slot.id);
    setQuantity((current) => Math.min(Math.max(current, 1), slot.capacity));
  };

  const continueToCheckout = () => {
    if (!service || !selectedSlot) return;
    const draft = {
      serviceId: service.id,
      serviceSlug: service.slug,
      slotId: selectedSlot.id,
      quantity,
    };
    saveCheckoutDraft(draft, window.sessionStorage);
    replaceHoldAttempt(draft, window.sessionStorage);
    router.push(`/bookings/checkout?service=${encodeURIComponent(service.slug)}`);
  };

  if (serviceQuery.isPending) return <DetailSkeleton />;
  if (serviceQuery.isError || !service) {
    return (
      <ErrorPage
        title="Không thể tải dịch vụ"
        onRetry={() => void serviceQuery.refetch()}
      />
    );
  }

  const heroImage = service.images[0]?.url ?? service.thumbnailUrl;

  return (
    <main className="min-h-screen bg-slate-950 text-slate-100">
      <header className="border-b border-white/10 px-5 py-4">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-4">
          <Link href="/services" className="text-lg font-bold text-white">
            GoBook<span className="text-teal-300">Now</span>
          </Link>
          <Link href="/services" className="text-sm text-slate-400 hover:text-white">
            ← Tất cả dịch vụ
          </Link>
        </div>
      </header>

      <div className="mx-auto max-w-6xl px-5 py-8 sm:py-12">
        <section className="grid overflow-hidden rounded-3xl border border-white/10 bg-slate-900 lg:grid-cols-[1.05fr_0.95fr]">
          <div className="relative min-h-64 bg-gradient-to-br from-teal-950 to-slate-950 lg:min-h-96">
            {heroImage ? (
              <Image
                src={heroImage}
                alt=""
                fill
                priority
                unoptimized
                sizes="(min-width: 1024px) 50vw, 100vw"
                className="object-cover"
              />
            ) : (
              <div className="grid h-full place-items-center text-sm text-slate-500">
                GoBook experience
              </div>
            )}
          </div>
          <div className="p-7 sm:p-10">
            <p className="eyebrow">
              {service.kind === "SERVICE" ? "Dịch vụ" : "Sự kiện"} ·{" "}
              {service.category.name}
            </p>
            <h1 className="mt-4 text-4xl font-semibold tracking-tight text-white">
              {service.title}
            </h1>
            <p className="mt-4 leading-7 text-slate-300">
              {service.summary ?? service.description ?? "Thông tin đang được cập nhật."}
            </p>
            <dl className="mt-7 space-y-3 text-sm">
              <InfoRow label="Đơn vị cung cấp" value={service.vendor.displayName} />
              <InfoRow
                label="Địa điểm"
                value={locationLabel(service.vendor.district, service.vendor.province)}
              />
              <InfoRow
                label="Giá cơ bản"
                value={`Từ ${formatMoney(service.priceAmount, service.currency)}`}
              />
            </dl>
          </div>
        </section>

        <div className="mt-8 grid items-start gap-7 lg:grid-cols-[minmax(0,1fr)_320px]">
          <section className="panel p-5 sm:p-7" aria-busy={slotsQuery.isPending}>
            {slotsQuery.isPending ? (
              <SlotSkeleton />
            ) : slotsQuery.isError ? (
              <div role="alert">
                <h2 className="text-xl font-semibold text-white">Không thể tải lịch trống</h2>
                <p className="mt-2 text-sm text-slate-400">
                  Đây là lỗi tải dữ liệu, không phải trạng thái hết Slot.
                </p>
                <button
                  type="button"
                  className="secondary-button mt-5"
                  onClick={() => void slotsQuery.refetch()}
                >
                  Thử tải lại
                </button>
              </div>
            ) : slots.length === 0 ? (
              <div className="grid min-h-56 place-items-center text-center">
                <div>
                  <p className="text-3xl" aria-hidden="true">◷</p>
                  <h2 className="mt-3 text-xl font-semibold text-white">
                    Hiện chưa có khung giờ khả dụng.
                  </h2>
                  <p className="mt-2 text-sm text-slate-400">
                    Vui lòng quay lại sau để xem lịch mới.
                  </p>
                </div>
              </div>
            ) : (
              <BookingSlotSelector
                slots={slots}
                selectedSlotId={selectedSlotId}
                onSelect={selectSlot}
              />
            )}
          </section>

          {slots.length > 0 && (
            <aside className="panel p-5 lg:sticky lg:top-5">
              <p className="eyebrow">Booking</p>
              <h2 className="mt-3 text-xl font-semibold text-white">
                {selectedSlot ? "Chọn số lượng" : "Chọn một khung giờ"}
              </h2>
              {selectedSlot ? (
                <div className="mt-5">
                  <QuantitySelector
                    value={quantity}
                    max={selectedSlot.capacity}
                    onChange={setQuantity}
                  />
                  <div className="mt-5 border-t border-white/10 pt-5">
                    <p className="text-sm text-slate-400">Tổng dự kiến</p>
                    <p className="mt-1 text-2xl font-semibold text-teal-200">
                      {formatMoney(
                        (BigInt(selectedSlot.price.amount) * BigInt(quantity)).toString(),
                        selectedSlot.price.currency,
                      )}
                    </p>
                  </div>
                </div>
              ) : (
                <p className="mt-3 text-sm leading-6 text-slate-400">
                  Giá chính xác của từng Slot được hiển thị trong danh sách.
                </p>
              )}
              <button
                type="button"
                className="primary-button mt-6 w-full"
                disabled={!selectedSlot}
                onClick={continueToCheckout}
              >
                Tiếp tục
              </button>
            </aside>
          )}
        </div>
      </div>

      {slots.length > 0 && (
        <div className="sticky bottom-0 border-t border-white/10 bg-slate-950/95 p-4 backdrop-blur lg:hidden">
          <button
            type="button"
            className="primary-button w-full"
            disabled={!selectedSlot}
            onClick={continueToCheckout}
          >
            {selectedSlot ? "Tiếp tục đến tóm tắt" : "Chọn một khung giờ"}
          </button>
        </div>
      )}
    </main>
  );
}

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-4 border-b border-white/5 pb-3">
      <dt className="text-slate-500">{label}</dt>
      <dd className="text-right font-medium text-slate-200">{value}</dd>
    </div>
  );
}

function DetailSkeleton() {
  return (
    <main className="min-h-screen bg-slate-950 px-5 py-10">
      <div className="mx-auto max-w-6xl animate-pulse">
        <div className="h-80 rounded-3xl bg-slate-900" />
        <div className="mt-7 h-96 rounded-3xl bg-slate-900" />
      </div>
    </main>
  );
}

function SlotSkeleton() {
  return (
    <div aria-label="Đang tải khung giờ" className="animate-pulse">
      <div className="h-7 w-48 rounded bg-slate-800" />
      <div className="mt-5 grid gap-3 sm:grid-cols-2">
        {Array.from({ length: 4 }, (_, index) => (
          <div key={index} className="h-36 rounded-2xl bg-slate-800" />
        ))}
      </div>
    </div>
  );
}

function ErrorPage({ title, onRetry }: { title: string; onRetry: () => void }) {
  return (
    <main className="grid min-h-screen place-items-center bg-slate-950 p-5 text-center text-white">
      <div className="panel max-w-lg p-8" role="alert">
        <h1 className="text-2xl font-semibold">{title}</h1>
        <p className="mt-3 text-sm text-slate-400">Vui lòng kiểm tra kết nối và thử lại.</p>
        <button type="button" className="primary-button mt-6" onClick={onRetry}>
          Thử lại
        </button>
      </div>
    </main>
  );
}
