"use client";

import Link from "next/link";
import Image from "next/image";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  type ChangeEvent,
} from "react";
import {
  ApiError,
  listPublicCategories,
  searchServices,
  type PublicCategory,
  type ServiceKind,
  type ServiceSearchQuery,
  type ServiceSearchResponse,
} from "@/lib/api-client";

const DEFAULT_LIMIT = 12;
const FILTER_KEYS = [
  "q",
  "kind",
  "category",
  "from",
  "to",
  "minPrice",
  "maxPrice",
  "province",
  "district",
  "ward",
  "page",
] as const;

function positiveInteger(value: string | null, fallback: number): number {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed >= 1 ? parsed : fallback;
}

function absoluteDate(value: string): string | undefined {
  if (!value) return undefined;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? undefined : date.toISOString();
}

function localDateTime(value: string | null): string {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  const offset = date.getTimezoneOffset() * 60_000;
  return new Date(date.getTime() - offset).toISOString().slice(0, 16);
}

function formatMoney(amount: string): string {
  return `${new Intl.NumberFormat("vi-VN").format(BigInt(amount))} ₫`;
}

function formatSlot(value: string): string {
  return new Intl.DateTimeFormat("vi-VN", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}

function locationLabel(district: string | null, province: string | null) {
  return [district, province].filter(Boolean).join(", ") || "Địa điểm đang cập nhật";
}

export function ServicesSearch() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const urlKeyword = searchParams.get("q") ?? "";
  const [categories, setCategories] = useState<PublicCategory[]>([]);
  const [categoryError, setCategoryError] = useState(false);
  const [searchState, setSearchState] = useState<{
    key: string;
    result: ServiceSearchResponse | null;
    error: string | null;
  }>({ key: "", result: null, error: null });
  const [retry, setRetry] = useState(0);
  const [filtersOpen, setFiltersOpen] = useState(false);

  const page = positiveInteger(searchParams.get("page"), 1);
  const limit = positiveInteger(searchParams.get("limit"), DEFAULT_LIMIT);
  const kindValue = searchParams.get("kind");
  const kind: ServiceKind | undefined =
    kindValue === "SERVICE" || kindValue === "EVENT" ? kindValue : undefined;

  const apiQuery = useMemo<ServiceSearchQuery>(
    () => ({
      q: urlKeyword || undefined,
      kind,
      categorySlug: searchParams.get("category") || undefined,
      from: searchParams.get("from") || undefined,
      to: searchParams.get("to") || undefined,
      minPrice: searchParams.get("minPrice") || undefined,
      maxPrice: searchParams.get("maxPrice") || undefined,
      province: searchParams.get("province") || undefined,
      district: searchParams.get("district") || undefined,
      ward: searchParams.get("ward") || undefined,
      page,
      limit,
    }),
    [kind, limit, page, searchParams, urlKeyword],
  );

  const updateUrl = useCallback(
    (updates: Record<string, string | undefined>, resetPage = true) => {
      const params = new URLSearchParams(searchParams.toString());
      for (const [key, value] of Object.entries(updates)) {
        if (value) params.set(key, value);
        else params.delete(key);
      }
      if (resetPage) params.delete("page");
      const query = params.toString();
      router.replace(query ? `${pathname}?${query}` : pathname, { scroll: false });
    },
    [pathname, router, searchParams],
  );

  useEffect(() => {
    const controller = new AbortController();
    listPublicCategories(controller.signal)
      .then(setCategories)
      .catch((reason: unknown) => {
        if (!(reason instanceof DOMException && reason.name === "AbortError")) {
          setCategoryError(true);
        }
      });
    return () => controller.abort();
  }, []);

  const requestKey = `${JSON.stringify(apiQuery)}:${retry}`;
  const loading = searchState.key !== requestKey;
  const result = searchState.result;
  const error = searchState.key === requestKey ? searchState.error : null;

  useEffect(() => {
    const controller = new AbortController();
    searchServices(apiQuery, controller.signal)
      .then((nextResult) =>
        setSearchState({ key: requestKey, result: nextResult, error: null }),
      )
      .catch((reason: unknown) => {
        if (reason instanceof DOMException && reason.name === "AbortError") return;
        setSearchState((current) => ({
          key: requestKey,
          result: current.result,
          error:
            reason instanceof ApiError
              ? reason.message
              : "Không thể tải kết quả lúc này.",
        }));
      });
    return () => controller.abort();
  }, [apiQuery, requestKey]);

  const clearFilters = () => {
    const params = new URLSearchParams(searchParams.toString());
    for (const key of FILTER_KEYS) params.delete(key);
    const query = params.toString();
    router.replace(query ? `${pathname}?${query}` : pathname, { scroll: false });
  };

  const setDate = (key: "from" | "to") => (event: ChangeEvent<HTMLInputElement>) =>
    updateUrl({ [key]: absoluteDate(event.target.value) });

  return (
    <main className="min-h-screen bg-slate-950 text-slate-100">
      <header className="border-b border-white/10 bg-slate-950/90 px-5 py-4 backdrop-blur">
        <div className="mx-auto flex max-w-7xl items-center justify-between">
          <Link href="/" className="text-lg font-bold tracking-tight text-white">
            GoBook<span className="text-teal-300">Now</span>
          </Link>
          <span className="text-sm text-slate-400">Khám phá không cần đăng nhập</span>
        </div>
      </header>

      <section className="border-b border-white/10 bg-[radial-gradient(circle_at_top_left,_rgba(45,212,191,0.16),_transparent_35%)] px-5 py-12 sm:py-16">
        <div className="mx-auto max-w-7xl">
          <p className="eyebrow">Khám phá GoBook</p>
          <h1 className="mt-4 max-w-3xl text-4xl font-semibold tracking-tight sm:text-6xl">
            Tìm đúng trải nghiệm cho lịch trình của bạn.
          </h1>
          <DebouncedSearch
            key={urlKeyword}
            value={urlKeyword}
            onSearch={(value) => updateUrl({ q: value || undefined })}
          />
        </div>
      </section>

      <div className="mx-auto max-w-7xl px-5 py-8">
        <div className="mb-5 flex items-center justify-between gap-4 lg:hidden">
          <button
            type="button"
            className="secondary-button"
            aria-expanded={filtersOpen}
            aria-controls="service-filters"
            onClick={() => setFiltersOpen((open) => !open)}
          >
            {filtersOpen ? "Ẩn bộ lọc" : "Mở bộ lọc"}
          </button>
          <button type="button" className="text-sm text-teal-300" onClick={clearFilters}>
            Xóa bộ lọc
          </button>
        </div>

        <div className="grid items-start gap-7 lg:grid-cols-[280px_minmax(0,1fr)]">
          <aside
            id="service-filters"
            className={`${filtersOpen ? "block" : "hidden"} panel p-5 lg:sticky lg:top-5 lg:block`}
          >
            <div className="flex items-center justify-between">
              <h2 className="font-semibold">Bộ lọc</h2>
              <button
                type="button"
                className="hidden text-sm text-teal-300 hover:text-teal-200 lg:block"
                onClick={clearFilters}
              >
                Xóa tất cả
              </button>
            </div>
            <div className="mt-6 space-y-5">
              <FilterSelect
                label="Danh mục"
                value={searchParams.get("category") ?? ""}
                onChange={(value) => updateUrl({ category: value || undefined })}
              >
                <option value="">Tất cả danh mục</option>
                {categories.map((category) => (
                  <option key={category.id} value={category.slug}>
                    {category.name}
                  </option>
                ))}
              </FilterSelect>
              {categoryError && (
                <p className="text-xs text-amber-300">Không tải được danh mục.</p>
              )}

              <FilterSelect
                label="Loại"
                value={kind ?? ""}
                onChange={(value) => updateUrl({ kind: value || undefined })}
              >
                <option value="">Tất cả</option>
                <option value="SERVICE">Dịch vụ</option>
                <option value="EVENT">Sự kiện</option>
              </FilterSelect>

              <FilterInput
                label="Từ thời điểm"
                type="datetime-local"
                value={localDateTime(searchParams.get("from"))}
                onChange={setDate("from")}
              />
              <FilterInput
                label="Đến thời điểm"
                type="datetime-local"
                value={localDateTime(searchParams.get("to"))}
                onChange={setDate("to")}
              />

              <div className="grid grid-cols-2 gap-3">
                <FilterInput
                  label="Giá từ"
                  type="number"
                  min="0"
                  step="1"
                  inputMode="numeric"
                  value={searchParams.get("minPrice") ?? ""}
                  onChange={(event) =>
                    updateUrl({ minPrice: event.target.value || undefined })
                  }
                />
                <FilterInput
                  label="Giá đến"
                  type="number"
                  min="0"
                  step="1"
                  inputMode="numeric"
                  value={searchParams.get("maxPrice") ?? ""}
                  onChange={(event) =>
                    updateUrl({ maxPrice: event.target.value || undefined })
                  }
                />
              </div>

              <FilterInput
                label="Tỉnh / thành phố"
                type="text"
                value={searchParams.get("province") ?? ""}
                placeholder="Ví dụ: Hà Nội"
                onChange={(event) =>
                  updateUrl({ province: event.target.value || undefined })
                }
              />
              <FilterInput
                label="Quận / huyện"
                type="text"
                value={searchParams.get("district") ?? ""}
                placeholder="Ví dụ: Ba Đình"
                onChange={(event) =>
                  updateUrl({ district: event.target.value || undefined })
                }
              />
            </div>
          </aside>

          <section aria-live="polite" aria-busy={loading}>
            <div className="mb-5 flex min-h-8 items-center justify-between gap-4">
              <p className="text-sm text-slate-400">
                {result ? `${result.total} kết quả phù hợp` : "Đang tìm kiếm..."}
              </p>
              {loading && result && (
                <span className="text-xs font-medium text-teal-300">Đang cập nhật…</span>
              )}
            </div>

            {error && (
              <div className="panel mb-6 border-rose-400/30 p-6" role="alert">
                <h2 className="font-semibold text-rose-200">Không thể tải kết quả</h2>
                <p className="mt-2 text-sm text-slate-400">{error}</p>
                <button
                  type="button"
                  className="secondary-button mt-4"
                  onClick={() => setRetry((value) => value + 1)}
                >
                  Thử lại
                </button>
              </div>
            )}

            {loading && !result ? (
              <ResultSkeleton />
            ) : result && result.items.length === 0 && !error ? (
              <div className="panel grid min-h-80 place-items-center p-8 text-center">
                <div>
                  <p className="text-4xl" aria-hidden="true">⌕</p>
                  <h2 className="mt-4 text-xl font-semibold">
                    Không có dịch vụ phù hợp với bộ lọc.
                  </h2>
                  <p className="mt-2 text-sm text-slate-400">
                    Thử mở rộng thời gian, mức giá hoặc địa điểm.
                  </p>
                  <button type="button" className="primary-button mt-6" onClick={clearFilters}>
                    Xóa bộ lọc
                  </button>
                </div>
              </div>
            ) : result ? (
              <>
                <div className="grid gap-5 sm:grid-cols-2 xl:grid-cols-3">
                  {result.items.map((service) => (
                    <article
                      key={service.id}
                      className="group overflow-hidden rounded-3xl border border-white/10 bg-slate-900 transition hover:-translate-y-1 hover:border-teal-300/40"
                    >
                      <div className="relative aspect-[4/3] overflow-hidden bg-gradient-to-br from-slate-800 to-slate-950">
                        {service.thumbnail ? (
                          <Image
                            src={service.thumbnail.url}
                            alt=""
                            fill
                            unoptimized
                            sizes="(min-width: 1280px) 280px, (min-width: 640px) 45vw, 90vw"
                            className="object-cover transition duration-500 group-hover:scale-105"
                          />
                        ) : (
                          <div className="grid h-full place-items-center text-sm text-slate-500">
                            GoBook experience
                          </div>
                        )}
                        <span className="absolute left-4 top-4 rounded-full bg-slate-950/85 px-3 py-1 text-xs font-semibold text-teal-200 backdrop-blur">
                          {service.kind === "SERVICE" ? "DỊCH VỤ" : "SỰ KIỆN"}
                        </span>
                      </div>
                      <div className="p-5">
                        <p className="text-xs font-medium text-teal-300">
                          {service.category.name}
                        </p>
                        <h2 className="mt-2 line-clamp-2 text-xl font-semibold text-white">
                          {service.title}
                        </h2>
                        <p className="mt-2 truncate text-sm text-slate-400">
                          {service.vendor.displayName} ·{" "}
                          {locationLabel(service.vendor.district, service.vendor.province)}
                        </p>
                        <div className="mt-5 border-t border-white/10 pt-4">
                          <p className="font-semibold text-white">
                            Từ {formatMoney(service.startingPrice.amount)}
                          </p>
                          <p className="mt-1 text-xs text-slate-500">
                            {service.nextAvailableSlot
                              ? `Lịch gần nhất: ${formatSlot(service.nextAvailableSlot.startAt)}`
                              : "Lịch đang được cập nhật"}
                          </p>
                        </div>
                      </div>
                    </article>
                  ))}
                </div>
                <Pagination
                  page={result.page}
                  totalPages={result.totalPages}
                  onPage={(nextPage) =>
                    updateUrl(
                      { page: nextPage === 1 ? undefined : String(nextPage) },
                      false,
                    )
                  }
                />
              </>
            ) : null}
          </section>
        </div>
      </div>
    </main>
  );
}

function DebouncedSearch({
  value,
  onSearch,
}: {
  value: string;
  onSearch: (value: string) => void;
}) {
  const [draft, setDraft] = useState(value);
  useEffect(() => {
    if (draft === value) return;
    const timer = window.setTimeout(() => onSearch(draft.trim()), 400);
    return () => window.clearTimeout(timer);
  }, [draft, onSearch, value]);

  return (
    <label className="mt-8 block max-w-3xl">
      <span className="sr-only">Tìm dịch vụ và sự kiện</span>
      <input
        type="search"
        className="input h-14 text-base shadow-2xl shadow-teal-950/30"
        placeholder="Search services and events..."
        value={draft}
        onChange={(event) => setDraft(event.target.value)}
      />
    </label>
  );
}

function FilterSelect({
  label,
  value,
  onChange,
  children,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  children: React.ReactNode;
}) {
  return (
    <label className="block">
      <span className="section-label">{label}</span>
      <select
        className="input mt-2"
        value={value}
        onChange={(event) => onChange(event.target.value)}
      >
        {children}
      </select>
    </label>
  );
}

function FilterInput({ label, ...props }: { label: string } & React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <label className="block">
      <span className="section-label">{label}</span>
      <input className="input mt-2 px-3 py-2.5 text-sm" {...props} />
    </label>
  );
}

function ResultSkeleton() {
  return (
    <div className="grid gap-5 sm:grid-cols-2 xl:grid-cols-3" aria-label="Đang tải kết quả">
      {Array.from({ length: 6 }, (_, index) => (
        <div key={index} className="h-80 animate-pulse rounded-3xl bg-slate-900" />
      ))}
    </div>
  );
}

function Pagination({
  page,
  totalPages,
  onPage,
}: {
  page: number;
  totalPages: number;
  onPage: (page: number) => void;
}) {
  if (totalPages <= 1) return null;
  return (
    <nav className="mt-9 flex items-center justify-center gap-3" aria-label="Phân trang kết quả">
      <button
        type="button"
        className="secondary-button"
        disabled={page <= 1}
        aria-label="Trang trước"
        onClick={() => onPage(page - 1)}
      >
        Trước
      </button>
      <span className="px-3 text-sm text-slate-400" aria-current="page">
        Trang <strong className="text-white">{page}</strong> / {totalPages}
      </span>
      <button
        type="button"
        className="secondary-button"
        disabled={page >= totalPages}
        aria-label="Trang sau"
        onClick={() => onPage(page + 1)}
      >
        Sau
      </button>
    </nav>
  );
}
