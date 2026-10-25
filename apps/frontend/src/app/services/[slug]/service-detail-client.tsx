"use client";

import { useQuery } from "@tanstack/react-query";
import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { BookingSlotSelector } from "@/components/booking/booking-slot-selector";
import { QuantitySelector } from "@/components/booking/quantity-selector";
import { VendorReviews } from "@/components/reviews/vendor-reviews";
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
import { Burst } from "@/components/ui/icon";

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
    <main className="min-h-[70vh] bg-canvas text-ink">
      <header className="border-b border-line/10 px-5 py-4">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-4">
          <span className="eyebrow">Khám phá / {service.category.name}</span>
          <Link href="/services" className="text-sm text-muted hover:text-ink">
            ← Tất cả dịch vụ
          </Link>
        </div>
      </header>

      <div className="mx-auto max-w-6xl px-5 py-8 sm:py-12">
        <section className="panel grid overflow-hidden lg:grid-cols-[1.05fr_0.95fr]">
          <div className="graphic-grid relative min-h-64 border-b-2 border-line bg-mint lg:min-h-96 lg:border-r-2 lg:border-b-0">
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
              <div className="grid h-full min-h-64 place-items-center px-8 py-12 text-center">
                <div><Burst className="mx-auto mb-5 size-28 text-sun" /><p className="text-2xl font-extrabold">Một trải nghiệm<br />đang chờ bạn.</p><p className="mt-3 text-xs text-muted">Hình ảnh từ đối tác đang được cập nhật.</p></div>
              </div>
            )}
          </div>
          <div className="p-7 sm:p-10">
            <p className="eyebrow">
              {service.kind === "SERVICE" ? "Dịch vụ" : "Sự kiện"} ·{" "}
              {service.category.name}
            </p>
            <h1 className="mt-4 text-3xl font-extrabold tracking-tight text-ink sm:text-4xl">
              {service.title}
            </h1>
            <p className="mt-4 leading-7 text-ink">
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

        {service.images.length > 1 && <section aria-label="Hình ảnh trải nghiệm" className="mt-5 grid grid-cols-2 gap-4 sm:grid-cols-4">{service.images.slice(1, 5).map((photo, index) => <a key={photo.url} href={photo.url} target="_blank" rel="noopener noreferrer" className="overflow-hidden rounded-xl border-2 border-line"><Image src={photo.url} alt={`${service.title} — hình ảnh ${index + 2}`} width={360} height={240} unoptimized className="aspect-[3/2] w-full object-cover" /></a>)}</section>}
        {service.description && service.description !== service.summary && <section className="panel mt-8 p-6 sm:p-8"><h2 className="text-2xl">Về trải nghiệm này</h2><p className="mt-4 whitespace-pre-wrap text-sm leading-7 text-muted">{service.description}</p></section>}
        <div className="mt-8 grid items-start gap-7 lg:grid-cols-[minmax(0,1fr)_320px]">
          <section className="panel p-5 sm:p-7" aria-busy={slotsQuery.isPending}>
            {slotsQuery.isPending ? (
              <SlotSkeleton />
            ) : slotsQuery.isError ? (
              <div role="alert">
                <h2 className="text-xl font-bold text-ink">Không thể tải lịch trống</h2>
                <p className="mt-2 text-sm text-muted">
                  Lịch chưa tải được. Hãy thử lại để xem các khung giờ còn trống.
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
                  <h2 className="mt-3 text-xl font-bold text-ink">
                    Hiện chưa có khung giờ khả dụng.
                  </h2>
                  <p className="mt-2 text-sm text-muted">
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
            <aside className="panel p-5 lg:sticky lg:top-28">
              <p className="eyebrow">Lên lịch trải nghiệm</p>
              <h2 className="mt-3 text-xl font-bold text-ink">
                {selectedSlot ? "Chọn số lượng" : "Chọn một khung giờ"}
              </h2>
              {selectedSlot ? (
                <div className="mt-5">
                  <QuantitySelector
                    value={quantity}
                    max={selectedSlot.capacity}
                    onChange={setQuantity}
                  />
                  <div className="mt-5 border-t border-line/10 pt-5">
                    <p className="text-sm text-muted">Tổng dự kiến</p>
                    <p className="mt-1 text-2xl font-bold text-info">
                      {formatMoney(
                        (BigInt(selectedSlot.price.amount) * BigInt(quantity)).toString(),
                        selectedSlot.price.currency,
                      )}
                    </p>
                  </div>
                </div>
              ) : (
                <p className="mt-3 text-sm leading-6 text-muted">
                  Mỗi khung giờ có giá riêng được hiển thị trong danh sách.
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
        <VendorReviews vendorId={service.vendor.id} />
      </div>

      {slots.length > 0 && (
        <div className="sticky bottom-0 border-t border-line/10 bg-canvas/95 p-4 backdrop-blur lg:hidden">
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
    <div className="flex justify-between gap-4 border-b border-line/5 pb-3">
      <dt className="text-muted">{label}</dt>
      <dd className="text-right font-medium text-ink">{value}</dd>
    </div>
  );
}

function DetailSkeleton() {
  return (
    <main className="min-h-[70vh] bg-canvas px-5 py-10">
      <div className="mx-auto max-w-6xl animate-pulse">
        <div className="h-80 rounded-2xl bg-surface" />
        <div className="mt-7 h-96 rounded-2xl bg-surface" />
      </div>
    </main>
  );
}

function SlotSkeleton() {
  return (
    <div aria-label="Đang tải khung giờ" className="animate-pulse">
      <div className="h-7 w-48 rounded bg-soft" />
      <div className="mt-5 grid gap-3 sm:grid-cols-2">
        {Array.from({ length: 4 }, (_, index) => (
          <div key={index} className="h-36 rounded-2xl bg-soft" />
        ))}
      </div>
    </div>
  );
}

function ErrorPage({ title, onRetry }: { title: string; onRetry: () => void }) {
  return (
    <main className="grid min-h-[70vh] place-items-center bg-canvas p-5 text-center text-ink">
      <div className="panel max-w-lg p-8" role="alert">
        <h1 className="text-2xl font-bold">{title}</h1>
        <p className="mt-3 text-sm text-muted">Vui lòng kiểm tra kết nối và thử lại.</p>
        <button type="button" className="primary-button mt-6" onClick={onRetry}>
          Thử lại
        </button>
      </div>
    </main>
  );
}
