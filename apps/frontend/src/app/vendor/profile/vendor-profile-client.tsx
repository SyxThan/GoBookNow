"use client";

import { FormEvent, ReactNode, useCallback, useEffect, useState } from "react";
import { ApiError, apiRequest, login, logout } from "@/lib/api-client";

type VendorStatus = "DRAFT" | "PENDING" | "APPROVED" | "REJECTED" | "SUSPENDED";
type VendorType =
  "INDIVIDUAL" | "HOUSEHOLD_BUSINESS" | "COMPANY" | "ORGANIZATION";

type Vendor = {
  id: string;
  displayName: string;
  slug: string;
  description: string | null;
  logoUrl: string | null;
  legalName: string | null;
  vendorType: VendorType | null;
  taxCode: string | null;
  businessRegistrationNumber: string | null;
  legalRepresentativeName: string | null;
  contactEmail: string | null;
  contactPhone: string | null;
  addressLine: string | null;
  ward: string | null;
  district: string | null;
  province: string | null;
  countryCode: string;
  status: VendorStatus;
  createdAt: string;
  updatedAt: string;
};

type VendorForm = {
  displayName: string;
  description: string;
  logoUrl: string;
  legalName: string;
  vendorType: "" | VendorType;
  taxCode: string;
  businessRegistrationNumber: string;
  legalRepresentativeName: string;
  contactEmail: string;
  contactPhone: string;
  addressLine: string;
  ward: string;
  district: string;
  province: string;
  countryCode: string;
};

const EMPTY_FORM: VendorForm = {
  displayName: "",
  description: "",
  logoUrl: "",
  legalName: "",
  vendorType: "",
  taxCode: "",
  businessRegistrationNumber: "",
  legalRepresentativeName: "",
  contactEmail: "",
  contactPhone: "",
  addressLine: "",
  ward: "",
  district: "",
  province: "",
  countryCode: "VN",
};

const STATUS_LABELS: Record<VendorStatus, string> = {
  DRAFT: "Bản nháp",
  PENDING: "Đang chờ duyệt",
  APPROVED: "Đã phê duyệt",
  REJECTED: "Cần chỉnh sửa",
  SUSPENDED: "Tạm ngưng",
};

const TYPE_LABELS: Record<VendorType, string> = {
  INDIVIDUAL: "Cá nhân",
  HOUSEHOLD_BUSINESS: "Hộ kinh doanh",
  COMPANY: "Doanh nghiệp",
  ORGANIZATION: "Tổ chức",
};

function vendorToForm(vendor: Vendor): VendorForm {
  return {
    displayName: vendor.displayName,
    description: vendor.description ?? "",
    logoUrl: vendor.logoUrl ?? "",
    legalName: vendor.legalName ?? "",
    vendorType: vendor.vendorType ?? "",
    taxCode: vendor.taxCode ?? "",
    businessRegistrationNumber: vendor.businessRegistrationNumber ?? "",
    legalRepresentativeName: vendor.legalRepresentativeName ?? "",
    contactEmail: vendor.contactEmail ?? "",
    contactPhone: vendor.contactPhone ?? "",
    addressLine: vendor.addressLine ?? "",
    ward: vendor.ward ?? "",
    district: vendor.district ?? "",
    province: vendor.province ?? "",
    countryCode: vendor.countryCode,
  };
}

function cleanPayload(
  form: VendorForm,
  includeEmpty: boolean,
): Record<string, string | null> {
  const payload: Record<string, string | null> = {};
  for (const [key, rawValue] of Object.entries(form)) {
    const value = rawValue.trim();
    if (value) {
      payload[key] = value;
      continue;
    }
    if (key === "displayName" || key === "countryCode") {
      payload[key] = value;
    } else if (includeEmpty) {
      payload[key] = null;
    }
  }
  return payload;
}

function errorMessage(error: unknown): string {
  if (error instanceof ApiError) {
    if (error.status === 403) {
      return "Bạn không có quyền quản lý hồ sơ Vendor này.";
    }
    return error.message;
  }
  return "Không thể kết nối đến GoBook API. Vui lòng thử lại.";
}

export default function VendorProfileClient() {
  const [accessToken, setAccessTokenState] = useState<string | null>(() =>
    typeof window === "undefined"
      ? null
      : sessionStorage.getItem("gobook.accessToken"),
  );
  const [authRequired, setAuthRequired] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [vendor, setVendor] = useState<Vendor | null>(null);
  const [mode, setMode] = useState<"view" | "create" | "edit">("view");
  const [form, setForm] = useState<VendorForm>(EMPTY_FORM);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const setAccessToken = useCallback((token: string | null) => {
    setAccessTokenState(token);
    if (token) sessionStorage.setItem("gobook.accessToken", token);
    else sessionStorage.removeItem("gobook.accessToken");
  }, []);

  const loadVendor = useCallback(
    async (token: string | null) => {
      await Promise.resolve();
      setLoading(true);
      setError(null);
      try {
        const result = await apiRequest<Vendor>(
          "/vendors/me",
          { method: "GET" },
          token,
          setAccessToken,
        );
        setVendor(result);
        setForm(vendorToForm(result));
        setMode("view");
        setAuthRequired(false);
      } catch (loadError) {
        if (loadError instanceof ApiError && loadError.status === 404) {
          setVendor(null);
          setForm(EMPTY_FORM);
          setMode("view");
          setAuthRequired(false);
        } else if (loadError instanceof ApiError && loadError.status === 401) {
          setAuthRequired(true);
        } else {
          setError(errorMessage(loadError));
        }
      } finally {
        setLoading(false);
      }
    },
    [setAccessToken],
  );

  useEffect(() => {
    const token = sessionStorage.getItem("gobook.accessToken");
    const timer = window.setTimeout(() => void loadVendor(token), 0);
    return () => window.clearTimeout(timer);
  }, [loadVendor]);

  const handleLogin = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    setSaving(true);
    setError(null);
    try {
      const token = await login(
        String(data.get("email") ?? ""),
        String(data.get("password") ?? ""),
      );
      setAccessToken(token);
      await loadVendor(token);
    } catch (loginError) {
      setError(errorMessage(loginError));
    } finally {
      setSaving(false);
    }
  };

  const handleLogout = async () => {
    await logout();
    setAccessToken(null);
    setVendor(null);
    setAuthRequired(true);
    setNotice(null);
  };

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setSaving(true);
    setError(null);
    setNotice(null);
    try {
      const creating = mode === "create";
      const result = await apiRequest<Vendor>(
        creating ? "/vendors" : `/vendors/${vendor?.id}`,
        {
          method: creating ? "POST" : "PATCH",
          body: JSON.stringify(cleanPayload(form, !creating)),
        },
        accessToken,
        setAccessToken,
      );
      setVendor(result);
      setForm(vendorToForm(result));
      setMode("view");
      setNotice(creating ? "Đã tạo hồ sơ Vendor." : "Đã lưu thay đổi.");
    } catch (saveError) {
      if (saveError instanceof ApiError && saveError.status === 401) {
        setAuthRequired(true);
      }
      setError(errorMessage(saveError));
    } finally {
      setSaving(false);
    }
  };

  if (loading) return <LoadingState />;
  if (authRequired) {
    return <LoginState error={error} saving={saving} onSubmit={handleLogin} />;
  }

  return (
    <main className="min-h-screen bg-slate-950 text-slate-100">
      <div className="mx-auto max-w-6xl px-5 py-8 sm:px-8 lg:py-12">
        <header className="flex flex-col gap-6 border-b border-white/10 pb-8 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="eyebrow">GoBook Workspace</p>
            <h1 className="mt-3 text-3xl font-semibold tracking-tight sm:text-5xl">
              Hồ sơ Vendor
            </h1>
            <p className="mt-3 max-w-2xl text-sm leading-6 text-slate-400 sm:text-base">
              Thông tin tổ chức được tách biệt với tài khoản cá nhân và là nền
              tảng cho quy trình xét duyệt Vendor.
            </p>
          </div>
          <button
            type="button"
            onClick={() => void handleLogout()}
            className="secondary-button self-start"
          >
            Đăng xuất
          </button>
        </header>

        {error && <Banner tone="error">{error}</Banner>}
        {notice && <Banner tone="success">{notice}</Banner>}

        {!vendor && mode === "view" ? (
          <EmptyState
            onCreate={() => {
              setForm(EMPTY_FORM);
              setMode("create");
              setError(null);
            }}
          />
        ) : mode === "view" && vendor ? (
          <VendorView
            vendor={vendor}
            onEdit={() => {
              setForm(vendorToForm(vendor));
              setMode("edit");
              setError(null);
              setNotice(null);
            }}
          />
        ) : (
          <VendorFormView
            form={form}
            mode={mode === "create" ? "create" : "edit"}
            saving={saving}
            onChange={(field, value) =>
              setForm((current) => ({ ...current, [field]: value }))
            }
            onCancel={() => setMode("view")}
            onSubmit={handleSubmit}
          />
        )}
      </div>
    </main>
  );
}

function LoadingState() {
  return (
    <main className="grid min-h-screen place-items-center bg-slate-950 text-slate-100">
      <div className="text-center">
        <div className="mx-auto mb-4 h-10 w-10 animate-spin rounded-full border-2 border-teal-300 border-t-transparent" />
        <p className="text-sm text-slate-400">Đang tải hồ sơ Vendor…</p>
      </div>
    </main>
  );
}

function LoginState({
  error,
  saving,
  onSubmit,
}: {
  error: string | null;
  saving: boolean;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
}) {
  return (
    <main className="grid min-h-screen place-items-center bg-slate-950 px-6 py-12 text-slate-100">
      <form
        onSubmit={onSubmit}
        className="w-full max-w-md rounded-3xl border border-white/10 bg-slate-900 p-8 shadow-2xl"
      >
        <p className="eyebrow">GoBook Vendor</p>
        <h1 className="mt-3 text-3xl font-semibold">Đăng nhập để tiếp tục</h1>
        <p className="mt-3 text-sm leading-6 text-slate-400">
          Dùng tài khoản CUSTOMER hoặc VENDOR để quản lý hồ sơ tổ chức.
        </p>
        <Field label="Email">
          <input
            name="email"
            type="email"
            required
            autoComplete="email"
            className="input"
          />
        </Field>
        <Field label="Mật khẩu">
          <input
            name="password"
            type="password"
            required
            minLength={8}
            autoComplete="current-password"
            className="input"
          />
        </Field>
        {error && <Banner tone="error">{error}</Banner>}
        <button
          type="submit"
          disabled={saving}
          className="primary-button mt-7 w-full"
        >
          {saving ? "Đang đăng nhập…" : "Đăng nhập"}
        </button>
      </form>
    </main>
  );
}

function EmptyState({ onCreate }: { onCreate: () => void }) {
  return (
    <section className="mt-12 rounded-3xl border border-dashed border-slate-700 bg-slate-900/60 px-6 py-16 text-center">
      <div className="mx-auto grid h-16 w-16 place-items-center rounded-2xl bg-teal-300 text-2xl font-bold text-slate-950">
        V
      </div>
      <h2 className="mt-6 text-2xl font-semibold">Tạo hồ sơ Vendor</h2>
      <p className="mx-auto mt-3 max-w-xl text-sm leading-6 text-slate-400">
        Hồ sơ mới luôn bắt đầu ở trạng thái bản nháp và chưa tự động cấp quyền
        VENDOR.
      </p>
      <button type="button" onClick={onCreate} className="primary-button mt-7">
        Tạo Vendor Profile
      </button>
    </section>
  );
}

function VendorView({
  vendor,
  onEdit,
}: {
  vendor: Vendor;
  onEdit: () => void;
}) {
  const address = [
    vendor.addressLine,
    vendor.ward,
    vendor.district,
    vendor.province,
  ]
    .filter(Boolean)
    .join(", ");

  return (
    <section className="mt-10 grid gap-6 lg:grid-cols-[1.15fr_0.85fr]">
      <div className="panel p-6 sm:p-8">
        <div className="flex flex-col gap-5 sm:flex-row sm:justify-between">
          <div>
            <span className="rounded-full bg-amber-300/10 px-3 py-1 text-xs font-semibold text-amber-200">
              {STATUS_LABELS[vendor.status]}
            </span>
            <h2 className="mt-5 text-3xl font-semibold">
              {vendor.displayName}
            </h2>
            <p className="mt-2 font-mono text-xs text-slate-500">
              /{vendor.slug}
            </p>
          </div>
          <button type="button" onClick={onEdit} className="light-button">
            Chỉnh sửa
          </button>
        </div>
        <p className="mt-8 whitespace-pre-wrap leading-7 text-slate-300">
          {vendor.description || "Chưa có mô tả tổ chức."}
        </p>
        <dl className="mt-10 grid gap-6 border-t border-white/10 pt-8 sm:grid-cols-2">
          <Info label="Tên pháp lý" value={vendor.legalName} />
          <Info
            label="Loại hình"
            value={vendor.vendorType ? TYPE_LABELS[vendor.vendorType] : null}
          />
          <Info label="Mã số thuế" value={vendor.taxCode} />
          <Info
            label="Số đăng ký kinh doanh"
            value={vendor.businessRegistrationNumber}
          />
          <Info label="Người đại diện" value={vendor.legalRepresentativeName} />
          <Info label="Quốc gia" value={vendor.countryCode} />
        </dl>
      </div>
      <aside className="space-y-6">
        <div className="panel p-6">
          <h3 className="section-label">Liên hệ</h3>
          <dl className="mt-5 space-y-5">
            <Info label="Email" value={vendor.contactEmail} />
            <Info label="Điện thoại" value={vendor.contactPhone} />
          </dl>
        </div>
        <div className="panel p-6">
          <h3 className="section-label">Địa chỉ</h3>
          <p className="mt-5 leading-7 text-slate-200">
            {address || "Chưa cập nhật"}
          </p>
        </div>
      </aside>
    </section>
  );
}

function Info({ label, value }: { label: string; value: string | null }) {
  return (
    <div>
      <dt className="section-label">{label}</dt>
      <dd className="mt-1.5 text-sm text-slate-200">
        {value || "Chưa cập nhật"}
      </dd>
    </div>
  );
}

function VendorFormView({
  form,
  mode,
  saving,
  onChange,
  onCancel,
  onSubmit,
}: {
  form: VendorForm;
  mode: "create" | "edit";
  saving: boolean;
  onChange: (field: keyof VendorForm, value: string) => void;
  onCancel: () => void;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
}) {
  return (
    <form onSubmit={onSubmit} className="mt-10 space-y-6">
      <FormSection
        title="Thông tin cơ bản"
        description="Tên hiển thị và mô tả về tổ chức."
      >
        <Field label="Tên hiển thị">
          <input
            value={form.displayName}
            onChange={(e) => onChange("displayName", e.target.value)}
            required
            minLength={2}
            maxLength={150}
            className="input"
          />
        </Field>
        <Field label="Logo URL">
          <input
            value={form.logoUrl}
            onChange={(e) => onChange("logoUrl", e.target.value)}
            type="url"
            maxLength={500}
            placeholder="https://…"
            className="input"
          />
        </Field>
        <Field label="Mô tả" wide>
          <textarea
            value={form.description}
            onChange={(e) => onChange("description", e.target.value)}
            maxLength={1000}
            rows={4}
            className="input resize-y"
          />
        </Field>
      </FormSection>

      <FormSection
        title="Thông tin pháp lý"
        description="Thông tin nhận diện cơ bản của tổ chức."
      >
        <TextField
          label="Tên pháp lý"
          field="legalName"
          value={form.legalName}
          maxLength={200}
          onChange={onChange}
        />
        <Field label="Loại hình">
          <select
            value={form.vendorType}
            onChange={(e) => onChange("vendorType", e.target.value)}
            className="input"
          >
            <option value="">Chọn loại hình</option>
            {Object.entries(TYPE_LABELS).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
        </Field>
        <TextField
          label="Mã số thuế"
          field="taxCode"
          value={form.taxCode}
          maxLength={50}
          onChange={onChange}
        />
        <TextField
          label="Số đăng ký kinh doanh"
          field="businessRegistrationNumber"
          value={form.businessRegistrationNumber}
          maxLength={100}
          onChange={onChange}
        />
        <TextField
          label="Người đại diện pháp luật"
          field="legalRepresentativeName"
          value={form.legalRepresentativeName}
          maxLength={150}
          onChange={onChange}
          wide
        />
      </FormSection>

      <FormSection
        title="Liên hệ"
        description="Kênh liên hệ dùng cho vận hành Vendor."
      >
        <TextField
          label="Email"
          field="contactEmail"
          value={form.contactEmail}
          maxLength={320}
          type="email"
          onChange={onChange}
        />
        <TextField
          label="Điện thoại"
          field="contactPhone"
          value={form.contactPhone}
          maxLength={30}
          onChange={onChange}
        />
      </FormSection>

      <FormSection
        title="Địa chỉ"
        description="Địa chỉ hoạt động chính của tổ chức."
      >
        <TextField
          label="Địa chỉ"
          field="addressLine"
          value={form.addressLine}
          maxLength={255}
          onChange={onChange}
          wide
        />
        <TextField
          label="Phường / Xã"
          field="ward"
          value={form.ward}
          maxLength={100}
          onChange={onChange}
        />
        <TextField
          label="Quận / Huyện"
          field="district"
          value={form.district}
          maxLength={100}
          onChange={onChange}
        />
        <TextField
          label="Tỉnh / Thành phố"
          field="province"
          value={form.province}
          maxLength={100}
          onChange={onChange}
        />
        <Field label="Mã quốc gia">
          <input
            value={form.countryCode}
            onChange={(e) =>
              onChange("countryCode", e.target.value.toUpperCase())
            }
            minLength={2}
            maxLength={2}
            className="input uppercase"
          />
        </Field>
      </FormSection>

      <div className="flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
        <button
          type="button"
          onClick={onCancel}
          disabled={saving}
          className="secondary-button"
        >
          Hủy
        </button>
        <button type="submit" disabled={saving} className="primary-button">
          {saving
            ? "Đang lưu…"
            : mode === "create"
              ? "Tạo hồ sơ"
              : "Lưu thay đổi"}
        </button>
      </div>
    </form>
  );
}

function TextField({
  label,
  field,
  value,
  maxLength,
  type = "text",
  wide,
  onChange,
}: {
  label: string;
  field: keyof VendorForm;
  value: string;
  maxLength: number;
  type?: string;
  wide?: boolean;
  onChange: (field: keyof VendorForm, value: string) => void;
}) {
  return (
    <Field label={label} wide={wide}>
      <input
        value={value}
        onChange={(e) => onChange(field, e.target.value)}
        maxLength={maxLength}
        type={type}
        className="input"
      />
    </Field>
  );
}

function FormSection({
  title,
  description,
  children,
}: {
  title: string;
  description: string;
  children: ReactNode;
}) {
  return (
    <section className="panel p-6 sm:p-8">
      <div className="border-b border-white/10 pb-5">
        <h2 className="text-xl font-semibold">{title}</h2>
        <p className="mt-1 text-sm text-slate-400">{description}</p>
      </div>
      <div className="mt-6 grid gap-5 md:grid-cols-2">{children}</div>
    </section>
  );
}

function Field({
  label,
  wide,
  children,
}: {
  label: string;
  wide?: boolean;
  children: ReactNode;
}) {
  return (
    <label
      className={`${wide ? "md:col-span-2 " : ""}mt-5 block first:mt-0 md:mt-0`}
    >
      <span className="mb-2 block text-sm font-medium text-slate-200">
        {label}
      </span>
      {children}
    </label>
  );
}

function Banner({
  tone,
  children,
}: {
  tone: "error" | "success";
  children: ReactNode;
}) {
  const colors =
    tone === "error"
      ? "border-rose-400/30 bg-rose-400/10 text-rose-200"
      : "border-emerald-400/30 bg-emerald-400/10 text-emerald-200";
  return (
    <div className={`mt-6 rounded-2xl border px-5 py-4 text-sm ${colors}`}>
      {children}
    </div>
  );
}
