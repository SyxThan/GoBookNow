"use client";

import { ServiceCard } from "@/components/discovery/service-card";
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
    <main className="min-h-[70vh] bg-canvas text-ink">


      <section className="border-b border-line/10 bg-lavender/25 px-5 py-12 sm:py-16">
        <div className="mx-auto max-w-7xl">
          <p className="eyebrow">Khám phá GoBook</p>
          <h1 className="mt-4 max-w-3xl text-4xl font-bold tracking-tight sm:text-6xl">
            Lịch trống của bạn. Trải nghiệm của riêng bạn.
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
          <button type="button" className="text-sm text-info" onClick={clearFilters}>
            Xóa bộ lọc
          </button>
        </div>

        <div className="grid items-start gap-7 lg:grid-cols-[280px_minmax(0,1fr)]">
          <aside
            id="service-filters"
            className={`${filtersOpen ? "block" : "hidden"} panel p-5 lg:sticky lg:top-28 lg:block`}
          >
            <div className="flex items-center justify-between">
              <h2 className="font-bold">Bộ lọc</h2>
              <button
                type="button"
                className="hidden text-sm text-info hover:text-info lg:block"
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
                <p className="text-xs text-warning">Không tải được danh mục.</p>
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
            {FILTER_KEYS.some(key => key !== "page" && searchParams.get(key)) && <div className="mb-5 flex flex-wrap gap-2" aria-label="Bộ lọc đang áp dụng">{FILTER_KEYS.filter(key => key !== "page" && searchParams.get(key)).map(key => <button key={key} className="badge min-h-9 max-w-full bg-sun/40" onClick={() => updateUrl({ [key]: undefined })} aria-label={`Bỏ bộ lọc ${key}`}><span className="max-w-52 truncate">{searchParams.get(key)}</span><span aria-hidden="true">×</span></button>)}</div>}
            <div className="mb-5 flex min-h-8 items-center justify-between gap-4">
              <p className="text-sm text-muted">
                {result ? `${result.total} kết quả phù hợp` : "Đang tìm kiếm..."}
              </p>
              {loading && result && (
                <span className="text-xs font-medium text-info">Đang cập nhật…</span>
              )}
            </div>

            {error && (
              <div className="panel mb-6 border-danger/30 p-6" role="alert">
                <h2 className="font-bold text-danger">Không thể tải kết quả</h2>
                <p className="mt-2 text-sm text-muted">{error}</p>
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
                  <h2 className="mt-4 text-xl font-bold">
                    Không có dịch vụ phù hợp với bộ lọc.
                  </h2>
                  <p className="mt-2 text-sm text-muted">
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
                  {result.items.map((service) => <ServiceCard key={service.id} service={service} />)}
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
        className="input h-14 text-base shadow-[4px_4px_0_var(--border)]"
        placeholder="Tìm workshop, dịch vụ, sự kiện…"
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
        <div key={index} className="h-80 animate-pulse rounded-2xl bg-surface" />
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
      <span className="px-3 text-sm text-muted" aria-current="page">
        Trang <strong className="text-ink">{page}</strong> / {totalPages}
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
