"use client";

import Link from "next/link";
import { FormEvent, ReactNode, useCallback, useEffect, useState } from "react";
import { ApiError, apiRequest, login } from "@/lib/api-client";

type Scope = "SERVICE" | "EVENT";
type Category = {
  id: string;
  code: string;
  name: string;
  slug: string;
  scope: Scope;
  description: string | null;
  icon: string | null;
  sortOrder: number;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
};
type FormState = {
  code: string;
  name: string;
  scope: Scope;
  description: string;
  icon: string;
  sortOrder: string;
};

const emptyForm: FormState = {
  code: "",
  name: "",
  scope: "SERVICE",
  description: "",
  icon: "",
  sortOrder: "0",
};

function errorMessage(error: unknown): string {
  if (error instanceof ApiError && error.status === 403)
    return "Tài khoản này không có quyền ADMIN.";
  if (error instanceof ApiError) return error.message;
  return "Không thể kết nối đến GoBook API.";
}

export default function AdminCategoriesClient() {
  const [accessToken, setAccessTokenState] = useState<string | null>(() =>
    typeof window === "undefined"
      ? null
      : sessionStorage.getItem("gobook.accessToken"),
  );
  const [authRequired, setAuthRequired] = useState(false);
  const [categories, setCategories] = useState<Category[]>([]);
  const [scope, setScope] = useState<"ALL" | Scope>("ALL");
  const [active, setActive] = useState<"ALL" | "ACTIVE" | "INACTIVE">("ALL");
  const [search, setSearch] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<FormState>(emptyForm);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const setAccessToken = useCallback((token: string | null) => {
    setAccessTokenState(token);
    if (token) sessionStorage.setItem("gobook.accessToken", token);
    else sessionStorage.removeItem("gobook.accessToken");
  }, []);

  const loadCategories = useCallback(
    async (
      token: string | null,
      selectedScope: "ALL" | Scope,
      selectedActive: "ALL" | "ACTIVE" | "INACTIVE",
      query: string,
    ) => {
      setLoading(true);
      setError(null);
      const params = new URLSearchParams();
      if (selectedScope !== "ALL") params.set("scope", selectedScope);
      if (selectedActive !== "ALL") {
        params.set("isActive", String(selectedActive === "ACTIVE"));
      }
      if (query.trim()) params.set("search", query.trim());
      try {
        const result = await apiRequest<Category[]>(
          `/admin/categories?${params.toString()}`,
          { method: "GET" },
          token,
          setAccessToken,
        );
        setCategories(result);
        setAuthRequired(false);
      } catch (loadError) {
        if (
          loadError instanceof ApiError &&
          (loadError.status === 401 || loadError.status === 403)
        ) {
          setAuthRequired(true);
        }
        setError(errorMessage(loadError));
      } finally {
        setLoading(false);
      }
    },
    [setAccessToken],
  );

  useEffect(() => {
    const token = sessionStorage.getItem("gobook.accessToken");
    const timer = window.setTimeout(
      () => void loadCategories(token, "ALL", "ALL", ""),
      0,
    );
    return () => window.clearTimeout(timer);
  }, [loadCategories]);

  async function handleLogin(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    setBusy(true);
    setError(null);
    try {
      const token = await login(
        String(data.get("email") ?? ""),
        String(data.get("password") ?? ""),
      );
      setAccessToken(token);
      window.dispatchEvent(new Event("gobook:session"));
      await loadCategories(token, scope, active, search);
    } catch (loginError) {
      setError(errorMessage(loginError));
    } finally {
      setBusy(false);
    }
  }

  async function handleSave(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    setSuccess(null);
    const payload = {
      name: form.name,
      scope: form.scope,
      description: form.description || null,
      icon: form.icon || null,
      sortOrder: Number(form.sortOrder),
      ...(editingId ? {} : { code: form.code }),
    };
    try {
      await apiRequest<Category>(
        editingId ? `/admin/categories/${editingId}` : "/admin/categories",
        { method: editingId ? "PATCH" : "POST", body: JSON.stringify(payload) },
        accessToken,
        setAccessToken,
      );
      setSuccess(editingId ? "Đã cập nhật danh mục." : "Đã tạo danh mục.");
      resetForm();
      await loadCategories(accessToken, scope, active, search);
    } catch (saveError) {
      setError(errorMessage(saveError));
    } finally {
      setBusy(false);
    }
  }

  async function toggle(category: Category) {
    setBusy(true);
    setError(null);
    setSuccess(null);
    try {
      await apiRequest<Category>(
        `/admin/categories/${category.id}/${category.isActive ? "deactivate" : "activate"}`,
        { method: "PATCH" },
        accessToken,
        setAccessToken,
      );
      setSuccess(
        category.isActive ? "Đã ẩn danh mục." : "Đã kích hoạt danh mục.",
      );
      await loadCategories(accessToken, scope, active, search);
    } catch (toggleError) {
      setError(errorMessage(toggleError));
    } finally {
      setBusy(false);
    }
  }

  async function remove(category: Category) {
    if (!window.confirm(`Xóa danh mục “${category.name}”?`)) return;
    setBusy(true);
    setError(null);
    setSuccess(null);
    try {
      await apiRequest<void>(
        `/admin/categories/${category.id}`,
        { method: "DELETE" },
        accessToken,
        setAccessToken,
      );
      if (editingId === category.id) resetForm();
      setSuccess("Đã xóa danh mục.");
      await loadCategories(accessToken, scope, active, search);
    } catch (removeError) {
      setError(errorMessage(removeError));
    } finally {
      setBusy(false);
    }
  }

  function edit(category: Category) {
    setEditingId(category.id);
    setForm({
      code: category.code,
      name: category.name,
      scope: category.scope,
      description: category.description ?? "",
      icon: category.icon ?? "",
      sortOrder: String(category.sortOrder),
    });
    setSuccess(null);
    setError(null);
  }

  function resetForm() {
    setEditingId(null);
    setForm(emptyForm);
  }

  if (authRequired) {
    return <Login busy={busy} error={error} onSubmit={handleLogin} />;
  }

  return (
    <main className="min-h-[70vh] bg-canvas text-ink">
      <div className="mx-auto max-w-7xl px-5 py-10 sm:px-8">
        <header className="flex flex-wrap items-end justify-between gap-5 border-b border-line/10 pb-8">
          <div>
            <p className="eyebrow">GoBook Admin</p>
            <h1 className="mt-3 text-4xl font-bold">Danh mục trải nghiệm</h1>
            <p className="mt-2 text-sm text-muted">
              Sắp xếp danh mục dịch vụ và sự kiện để khách khám phá dễ hơn.
            </p>
          </div>
          <div className="flex gap-2">
            <Link
              href="/admin/vendor-applications"
              className="secondary-button"
            >
              Hồ sơ đối tác
            </Link>
            <Link href="/" className="secondary-button">
              Trang chủ
            </Link>
          </div>
        </header>

        {error && <Banner tone="error">{error}</Banner>}
        {success && <Banner tone="success">{success}</Banner>}

        <div className="mt-8 grid gap-6 2xl:grid-cols-[1.35fr_0.65fr]">
          <section className="panel overflow-hidden">
            <div className="grid gap-3 border-b border-line/10 p-5 sm:grid-cols-3">
              <select
                className="input"
                aria-label="Loại danh mục"
                value={scope}
                onChange={(event) => {
                  const value = event.target.value as "ALL" | Scope;
                  setScope(value);
                  void loadCategories(accessToken, value, active, search);
                }}
              >
                <option value="ALL">Tất cả loại</option>
                <option value="SERVICE">Dịch vụ</option>
                <option value="EVENT">Sự kiện</option>
              </select>
              <select
                className="input"
                aria-label="Trạng thái danh mục"
                value={active}
                onChange={(event) => {
                  const value = event.target.value as typeof active;
                  setActive(value);
                  void loadCategories(accessToken, scope, value, search);
                }}
              >
                <option value="ALL">Tất cả trạng thái</option>
                <option value="ACTIVE">Đang hiện</option>
                <option value="INACTIVE">Đã ẩn</option>
              </select>
              <form
                onSubmit={(event) => {
                  event.preventDefault();
                  void loadCategories(accessToken, scope, active, search);
                }}
              >
                <input
                  className="input"
                  value={search}
                  onChange={(event) => setSearch(event.target.value)}
                  aria-label="Tìm danh mục" placeholder="Tìm mã hoặc tên danh mục"
                />
              </form>
            </div>
            <div className="table-scroll responsive-records" role="region" tabIndex={0} aria-label="Bảng danh mục — cuộn ngang để xem đủ cột">
              <table className="w-full min-w-[720px] text-left text-sm">
                <thead className="bg-canvas text-xs uppercase text-muted">
                  <tr>
                    <th className="px-5 py-4">Tên</th>
                    <th className="px-5 py-4">Mã</th>
                    <th className="px-5 py-4">Loại</th>
                    <th className="px-5 py-4">Đường dẫn</th>
                    <th className="px-5 py-4">Trạng thái</th>
                    <th className="px-5 py-4">Thứ tự</th>
                    <th className="px-5 py-4">Thao tác</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-line/10">
                  {loading ? (
                    <tr>
                      <td colSpan={7} className="px-5 py-8 text-muted">
                        Đang tải…
                      </td>
                    </tr>
                  ) : categories.length === 0 ? (
                    <tr>
                      <td colSpan={7} className="px-5 py-8 text-muted">
                        Không có danh mục phù hợp.
                      </td>
                    </tr>
                  ) : (
                    categories.map((category) => (
                      <tr key={category.id}>
                        <td data-label="Tên danh mục" className="px-5 py-4 font-medium">
                          {category.name}
                        </td>
                        <td data-label="Mã danh mục" className="px-5 py-4 font-mono text-xs text-muted">
                          {category.code}
                        </td>
                        <td data-label="Loại" className="px-5 py-4">{category.scope}</td>
                        <td data-label="Đường dẫn" className="px-5 py-4 text-muted">
                          {category.slug}
                        </td>
                        <td data-label="Trạng thái" className="px-5 py-4">
                          <span
                            className={
                              category.isActive
                                ? "text-info"
                                : "text-muted"
                            }
                          >
                            {category.isActive ? "Đang hiện" : "Đã ẩn"}
                          </span>
                        </td>
                        <td data-label="Thứ tự" className="px-5 py-4">{category.sortOrder}</td>
                        <td data-label="Thao tác" className="px-5 py-4">
                          <div className="flex gap-2">
                            <button
                              className="secondary-button"
                              disabled={busy}
                              onClick={() => edit(category)}
                            >
                              Chỉnh sửa
                            </button>
                            <button
                              className="secondary-button"
                              disabled={busy}
                              onClick={() => void toggle(category)}
                            >
                              {category.isActive ? "Ẩn" : "Hiển thị"}
                            </button>
                            <button
                              className="secondary-button"
                              disabled={busy}
                              onClick={() => void remove(category)}
                            >
                              Xóa
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </section>

          <CategoryForm
            busy={busy}
            editing={Boolean(editingId)}
            form={form}
            onChange={setForm}
            onReset={resetForm}
            onSubmit={handleSave}
          />
        </div>
      </div>
    </main>
  );
}

function CategoryForm({
  busy,
  editing,
  form,
  onChange,
  onReset,
  onSubmit,
}: {
  busy: boolean;
  editing: boolean;
  form: FormState;
  onChange: (value: FormState) => void;
  onReset: () => void;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
}) {
  return (
    <form onSubmit={onSubmit} className="panel h-fit p-6">
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-xl font-bold">
          {editing ? "Chỉnh sửa danh mục" : "Tạo danh mục"}
        </h2>
        {editing && (
          <button type="button" className="secondary-button" onClick={onReset}>
            Hủy
          </button>
        )}
      </div>
      <label className="mt-6 block text-sm text-muted">
        Mã
        <input
          className="input mt-2 font-mono"
          required
          readOnly={editing}
          maxLength={50}
          pattern="[A-Z0-9_]+"
          value={form.code}
          onChange={(event) =>
            onChange({ ...form, code: event.target.value.toUpperCase() })
          }
          placeholder="SPA_BEAUTY"
        />
      </label>
      <label className="mt-4 block text-sm text-muted">
        Tên
        <input
          className="input mt-2"
          required
          minLength={2}
          maxLength={120}
          value={form.name}
          onChange={(event) => onChange({ ...form, name: event.target.value })}
        />
      </label>
      <label className="mt-4 block text-sm text-muted">
        Loại
        <select
          className="input mt-2"
          value={form.scope}
          onChange={(event) =>
            onChange({ ...form, scope: event.target.value as Scope })
          }
        >
          <option value="SERVICE">Dịch vụ</option>
          <option value="EVENT">Sự kiện</option>
        </select>
      </label>
      <label className="mt-4 block text-sm text-muted">
        Mô tả
        <textarea
          className="input mt-2"
          rows={3}
          maxLength={500}
          value={form.description}
          onChange={(event) =>
            onChange({ ...form, description: event.target.value })
          }
        />
      </label>
      <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-1 xl:grid-cols-2">
        <label className="block text-sm text-muted">
          Biểu tượng
          <input
            className="input mt-2"
            maxLength={100}
            value={form.icon}
            onChange={(event) =>
              onChange({ ...form, icon: event.target.value })
            }
          />
        </label>
        <label className="block text-sm text-muted">
          Thứ tự
          <input
            className="input mt-2"
            type="number"
            min={0}
            required
            value={form.sortOrder}
            onChange={(event) =>
              onChange({ ...form, sortOrder: event.target.value })
            }
          />
        </label>
      </div>
      <button className="primary-button mt-6 w-full" disabled={busy}>
        {busy ? "Đang lưu…" : editing ? "Lưu thay đổi" : "Tạo danh mục"}
      </button>
      {editing && (
        <p className="mt-3 text-xs text-muted">
          Code và slug được giữ ổn định sau khi tạo.
        </p>
      )}
    </form>
  );
}

function Login({
  busy,
  error,
  onSubmit,
}: {
  busy: boolean;
  error: string | null;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
}) {
  return (
    <main className="grid min-h-[70vh] place-items-center bg-canvas px-5 text-ink">
      <form onSubmit={onSubmit} className="panel w-full max-w-md p-8">
        <p className="eyebrow">GoBook Admin</p>
        <h1 className="mt-3 text-3xl font-bold">Đăng nhập Admin</h1>
        <input
          name="email"
          aria-label="Email" autoComplete="username"
          type="email"
          required
          className="input mt-6"
          placeholder="Email"
        />
        <input
          name="password"
          aria-label="Mật khẩu" autoComplete="current-password"
          type="password"
          required
          className="input mt-3"
          placeholder="Mật khẩu"
        />
        {error && <Banner tone="error">{error}</Banner>}
        <button className="primary-button mt-6 w-full" disabled={busy}>
          Đăng nhập
        </button>
      </form>
    </main>
  );
}

function Banner({
  children,
  tone,
}: {
  children: ReactNode;
  tone: "error" | "success";
}) {
  return (
    <div
      className={`mt-6 rounded-2xl border px-5 py-4 text-sm ${
        tone === "error"
          ? "border-danger/30 bg-coral/30 text-danger"
          : "border-line/30 bg-sun/30 text-info"
      }`}
    >
      {children}
    </div>
  );
}
