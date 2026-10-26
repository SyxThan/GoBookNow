import Image from "next/image";
import Link from "next/link";
import type { ServiceSearchItem } from "@/lib/api-client";
import { formatDateTime, formatMoney, locationLabel } from "@/lib/format";
import { Icon } from "@/components/ui/icon";

export function ServiceCard({
  service,
  headingLevel: Heading = "h2",
}: {
  service: ServiceSearchItem;
  headingLevel?: "h2" | "h3";
}) {
  return (
    <article className="panel group relative flex h-full flex-col transition-transform duration-150 hover:-translate-y-1 focus-within:outline-3 focus-within:outline-offset-4 focus-within:outline-focus">
      <div className="relative m-2 aspect-[4/3] overflow-hidden rounded-[10px] border-b-2 border-line bg-lavender">
        {service.thumbnail ? (
          <Image
            src={service.thumbnail.url}
            alt=""
            fill
            unoptimized
            sizes="(min-width:1280px) 300px, (min-width:640px) 45vw, 90vw"
            className="object-cover transition-transform duration-200 group-hover:scale-105"
          />
        ) : (
          <div className="graphic-grid flex h-full items-center justify-center bg-mint">
            <div className="rotate-[-12deg] rounded-2xl border-2 border-line bg-canvas p-5 shadow-[5px_5px_0_var(--border)]">
              <Icon
                name={service.kind === "EVENT" ? "ticket" : "star"}
                size={56}
              />
            </div>
            <span className="absolute bottom-3 right-3 text-xs font-semibold">
              Mở một trải nghiệm.
            </span>
          </div>
        )}
        <span className="badge absolute left-3 top-3 bg-canvas">
          {service.kind === "EVENT" ? "Sự kiện" : "Dịch vụ"}
        </span>
        <span className="absolute bottom-3 left-3 grid size-9 place-items-center rounded-full border-2 border-line bg-sun">
          <Icon name="arrow" size={18} />
        </span>
      </div>
      <div className="flex flex-1 flex-col px-5 pb-5 pt-3">
        <p className="eyebrow text-info">{service.category.name}</p>
        <Heading className="mt-2 text-xl">
          <Link
            href={`/services/${encodeURIComponent(service.slug)}`}
            className="after:absolute after:inset-0 focus:outline-none"
          >
            {service.title}
          </Link>
        </Heading>
        <p className="mt-2 text-xs text-muted">{service.vendor.displayName}</p>
        <p className="mt-2 flex items-center gap-1.5 text-xs text-muted">
          <Icon name="pin" size={14} />
          {locationLabel(service.vendor.district, service.vendor.province)}
        </p>
        <div className="mt-auto pt-5">
          <div className="flex items-center justify-between gap-2 border-t border-line/20 pt-4">
            <p className="text-xs text-muted">
              Từ{" "}
              <strong className="ml-1 text-base text-ink">
                {formatMoney(
                  service.startingPrice.amount,
                  service.startingPrice.currency,
                )}
              </strong>
            </p>
            <span className="text-xs font-semibold underline">
              Xem lịch trống
            </span>
          </div>
          <p className="mt-2 text-xs text-muted">
            {service.nextAvailableSlot
              ? formatDateTime(service.nextAvailableSlot.startAt)
              : "Lịch đang được cập nhật"}
          </p>
        </div>
      </div>
    </article>
  );
}
