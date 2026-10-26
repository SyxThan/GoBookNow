"use client";

import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { listPublicCategories, searchServices } from "@/lib/api-client";
import { ServiceCard } from "./service-card";
import { Icon } from "@/components/ui/icon";
import { EmptyState, SkeletonCards } from "@/components/ui/primitives";

export function HomeCatalog() {
  const categories = useQuery({
    queryKey: ["public", "categories"],
    queryFn: ({ signal }) => listPublicCategories(signal),
  });
  const services = useQuery({
    queryKey: ["public", "home-services"],
    queryFn: ({ signal }) => searchServices({ limit: 4 }, signal),
  });
  return (
    <>
      {categories.data && categories.data.length > 0 && (
        <section
          className="page-wrap !pb-2 !pt-10"
          aria-labelledby="categories-title"
        >
          <div className="flex flex-wrap items-end justify-between gap-3">
            <h2 id="categories-title" className="text-2xl">
              Hôm nay, bạn muốn thử gì?
            </h2>
            <span className="text-xs text-muted">
              Chọn theo sở thích của bạn
            </span>
          </div>
          <div className="mt-6 flex flex-wrap gap-3">
            {categories.data.map((category, i) => (
              <Link
                key={category.id}
                href={`/services?category=${encodeURIComponent(category.slug)}`}
                className={`secondary-button ${["bg-sun/50", "bg-mint", "bg-lavender/50", "bg-coral/40"][i % 4]}`}
              >
                <Icon
                  name={category.scope === "EVENT" ? "ticket" : "star"}
                  size={18}
                />
                {category.name}
              </Link>
            ))}
          </div>
        </section>
      )}
      <section className="page-wrap" aria-labelledby="catalogue-title">
        <div className="mb-7 flex flex-wrap items-end justify-between gap-4">
          <div>
            <p className="eyebrow mb-3">Thêm màu sắc cho ngày thường</p>
            <h2 id="catalogue-title" className="section-title">
              Một lịch hẹn đáng mong chờ.
            </h2>
          </div>
          <Link href="/services" className="secondary-button">
            Xem tất cả
            <Icon name="arrow" size={18} />
          </Link>
        </div>
        {services.isPending ? (
          <SkeletonCards count={4} />
        ) : services.isError ? (
          <EmptyState
            title="Lịch vui sẽ sớm trở lại"
            action={
              <button
                className="secondary-button"
                onClick={() => services.refetch()}
              >
                Tải lại trải nghiệm
              </button>
            }
          >
            Hiện chưa tải được danh sách. Bạn có thể thử lại hoặc mở trang khám
            phá.
          </EmptyState>
        ) : services.data.items.length === 0 ? (
          <EmptyState
            title="Những trải nghiệm đang được chuẩn bị"
            action={
              <Link href="/services" className="primary-button">
                Đến trang khám phá
              </Link>
            }
          >
            Quay lại để tìm lịch phù hợp, hoặc trở thành đối tác và chia sẻ trải
            nghiệm của bạn.
          </EmptyState>
        ) : (
          <div className="grid gap-5 sm:grid-cols-2 xl:grid-cols-4">
            {services.data.items.map((service) => (
              <ServiceCard
                key={service.id}
                service={service}
                headingLevel="h3"
              />
            ))}
          </div>
        )}
      </section>
    </>
  );
}
