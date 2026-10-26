import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import type { AnchorHTMLAttributes, ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { Providers } from "@gobook/auth/providers";
import { PortalGuard } from "@gobook/auth/portal-guard";
import { setPortalToken } from "@gobook/auth/use-session";

const { replace } = vi.hoisted(() => ({ replace: vi.fn() }));
vi.mock("next/navigation", () => ({
  usePathname: () => "/onboarding/application",
  useRouter: () => ({ replace }),
}));
vi.mock("next/link", () => ({
  default: ({
    children,
    ...props
  }: AnchorHTMLAttributes<HTMLAnchorElement>) => <a {...props}>{children}</a>,
}));

const user = {
  id: "vendor-user",
  email: "partner@example.test",
  roles: ["VENDOR"],
  profile: null,
};
const token = (id: string) =>
  `header.${btoa(JSON.stringify({ sub: id, roles: ["VENDOR"] }))}.signature`;
const response = (status: number, body: unknown = {}) =>
  new Response(JSON.stringify(body), { status });
function openPortal(
  children: ReactNode = <p>Hồ sơ đối tác đã mở</p>,
  requireApprovedVendor = false,
) {
  return render(
    <Providers>
      <PortalGuard
        roles={["CUSTOMER", "VENDOR"]}
        requireApprovedVendor={requireApprovedVendor}
      >
        {children}
      </PortalGuard>
    </Providers>,
  );
}

describe("Portal session verification", () => {
  beforeEach(() => {
    sessionStorage.clear();
    replace.mockReset();
    vi.unstubAllGlobals();
  });

  it("redirects a visitor without a vendor session instead of restarting verification", async () => {
    const fetchMock = vi.fn().mockResolvedValue(response(401));
    vi.stubGlobal("fetch", fetchMock);
    openPortal();
    await waitFor(() =>
      expect(replace).toHaveBeenCalledWith(
        "/login?next=%2Fonboarding%2Fapplication",
      ),
    );
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(
      screen.getByRole("link", { name: "Tiếp tục đăng nhập" }),
    ).toHaveAttribute("href", "/login?next=%2Fonboarding%2Fapplication");
  });

  it("clears an expired token and reaches login after refresh is rejected", async () => {
    sessionStorage.setItem("gobook.accessToken", token("expired"));
    const fetchMock = vi.fn().mockImplementation(async () => response(401));
    vi.stubGlobal("fetch", fetchMock);
    openPortal();
    await waitFor(() => expect(replace).toHaveBeenCalled());
    expect(sessionStorage.getItem("gobook.accessToken")).toBeNull();
    expect(fetchMock.mock.calls.length).toBeLessThanOrEqual(4);
  });

  it("restores a valid vendor cookie session without an access token", async () => {
    const renewed = token("vendor-user");
    vi.stubGlobal(
      "fetch",
      vi.fn().mockImplementation(async (url: string, init: RequestInit) => {
        if (url.endsWith("/auth/refresh"))
          return response(200, { accessToken: renewed });
        return new Headers(init.headers).has("Authorization")
          ? response(200, user)
          : response(401);
      }),
    );
    openPortal();
    expect(await screen.findByText("Hồ sơ đối tác đã mở")).toBeInTheDocument();
    expect(sessionStorage.getItem("gobook.accessToken")).toBe(renewed);
    expect(replace).not.toHaveBeenCalled();
  });

  it("preserves the session on a temporary refresh failure and lets the user retry", async () => {
    const existing = token("vendor-user");
    sessionStorage.setItem("gobook.accessToken", existing);
    let available = false;
    vi.stubGlobal(
      "fetch",
      vi.fn().mockImplementation(async (url: string) => {
        if (available) return response(200, user);
        return response(url.endsWith("/auth/refresh") ? 503 : 401);
      }),
    );
    openPortal();
    expect(
      await screen.findByText("Chưa xác minh được tài khoản"),
    ).toBeInTheDocument();
    expect(sessionStorage.getItem("gobook.accessToken")).toBe(existing);
    expect(replace).not.toHaveBeenCalled();
    available = true;
    fireEvent.click(screen.getByRole("button", { name: "Thử lại" }));
    expect(await screen.findByText("Hồ sơ đối tác đã mở")).toBeInTheDocument();
  });

  it("uses the server roles and offers another account for denied access", async () => {
    sessionStorage.setItem("gobook.accessToken", token("vendor-user"));
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(response(200, { ...user, roles: ["ADMIN"] })),
    );
    openPortal();
    expect(
      await screen.findByText("Bạn chưa có quyền truy cập"),
    ).toBeInTheDocument();
    expect(screen.queryByText("Hồ sơ đối tác đã mở")).not.toBeInTheDocument();
    expect(
      screen.getByRole("link", { name: "Đăng nhập tài khoản khác" }),
    ).toBeInTheDocument();
  });

  it("stops waiting when session refresh does not respond", async () => {
    const existing = token("vendor-user");
    sessionStorage.setItem("gobook.accessToken", existing);
    const timeout = AbortSignal.timeout.bind(AbortSignal);
    vi.spyOn(AbortSignal, "timeout").mockImplementation(() => timeout(50));
    vi.stubGlobal(
      "fetch",
      vi.fn().mockImplementation((url: string, init: RequestInit) => {
        if (!url.endsWith("/auth/refresh"))
          return Promise.resolve(response(401));
        return new Promise((_resolve, reject) => {
          const signal = init.signal!;
          if (signal.aborted) reject(signal.reason);
          else
            signal.addEventListener("abort", () => reject(signal.reason), {
              once: true,
            });
        });
      }),
    );
    openPortal();
    expect(
      await screen.findByText("Chưa xác minh được tài khoản"),
    ).toBeInTheDocument();
    expect(sessionStorage.getItem("gobook.accessToken")).toBe(existing);
    expect(replace).not.toHaveBeenCalled();
  });

  it("distinguishes a forbidden account from a connection failure", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockImplementation(async () => response(403)),
    );
    openPortal();
    expect(
      await screen.findByText("Tài khoản chưa thể truy cập"),
    ).toBeInTheDocument();
    expect(
      screen.queryByText("Chưa xác minh được tài khoản"),
    ).not.toBeInTheDocument();
  });

  it("requires approval before opening vendor operations", async () => {
    sessionStorage.setItem("gobook.accessToken", token("vendor-user"));
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockImplementation(async (url: string) =>
          response(
            200,
            url.endsWith("/auth/me") ? user : { status: "PENDING" },
          ),
        ),
    );
    openPortal(<p>Vận hành dịch vụ</p>, true);
    expect(
      await screen.findByText("Tài khoản đối tác chưa sẵn sàng"),
    ).toBeInTheDocument();
    expect(screen.queryByText("Vận hành dịch vụ")).not.toBeInTheDocument();
  });

  it("retries an approval check after an outage without claiming the vendor is unapproved", async () => {
    sessionStorage.setItem("gobook.accessToken", token("vendor-user"));
    let available = false;
    vi.stubGlobal(
      "fetch",
      vi.fn().mockImplementation(async (url: string) => {
        if (url.endsWith("/auth/me")) return response(200, user);
        return available
          ? response(200, { status: "APPROVED" })
          : response(503);
      }),
    );
    openPortal(<p>Vận hành dịch vụ</p>, true);
    expect(
      await screen.findByText("Chưa kiểm tra được trạng thái đối tác"),
    ).toBeInTheDocument();
    expect(
      screen.queryByText("Tài khoản đối tác chưa sẵn sàng"),
    ).not.toBeInTheDocument();
    available = true;
    fireEvent.click(screen.getByRole("button", { name: "Thử lại" }));
    expect(await screen.findByText("Vận hành dịch vụ")).toBeInTheDocument();
  });

  it("does not publish session changes when the stored token is unchanged", () => {
    const listener = vi.fn();
    window.addEventListener("gobook:session", listener);
    setPortalToken(null);
    expect(listener).not.toHaveBeenCalled();
    const existing = token("vendor-user");
    setPortalToken(existing);
    setPortalToken(existing);
    expect(listener).toHaveBeenCalledTimes(1);
    window.removeEventListener("gobook:session", listener);
  });
});
