import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ApiError } from "@/lib/api-client";
import { CustomerAuthForm } from "./customer-auth-form";

const mocks = vi.hoisted(() => ({
  register: vi.fn(),
  login: vi.fn(),
  replace: vi.fn(),
}));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace: mocks.replace }),
}));
vi.mock("@/lib/api-client", async (original) => ({
  ...(await original<typeof import("@/lib/api-client")>()),
  registerCustomer: mocks.register,
  login: mocks.login,
}));

function fillRegistration(confirm = "synthetic-password") {
  fireEvent.change(screen.getByLabelText("Họ và tên"), {
    target: { value: "Customer Test" },
  });
  fireEvent.change(screen.getByLabelText("Email"), {
    target: { value: "test@example.invalid" },
  });
  fireEvent.change(screen.getByLabelText("Mật khẩu", { exact: true }), {
    target: { value: "synthetic-password" },
  });
  fireEvent.change(screen.getByLabelText("Xác nhận mật khẩu"), {
    target: { value: confirm },
  });
  fireEvent.click(screen.getByRole("button", { name: "Tạo tài khoản" }));
}

describe("Customer auth UI", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    sessionStorage.clear();
  });

  it("registers through the API without client-selected roles and stores the returned session", async () => {
    mocks.register.mockResolvedValue("synthetic-access");
    render(<CustomerAuthForm mode="register" />);
    fillRegistration();
    await waitFor(() =>
      expect(
        screen.getByRole("heading", { name: "Đăng ký thành công" }),
      ).toBeVisible(),
    );
    expect(mocks.register).toHaveBeenCalledWith({
      fullName: "Customer Test",
      email: "test@example.invalid",
      password: "synthetic-password",
    });
    expect(sessionStorage.getItem("gobook.accessToken")).toBe(
      "synthetic-access",
    );
  });

  it("rejects mismatching confirmation before submitting", () => {
    render(<CustomerAuthForm mode="register" />);
    fillRegistration("different-password");
    expect(screen.getByRole("alert")).toHaveTextContent(
      "Mật khẩu xác nhận không khớp",
    );
    expect(mocks.register).not.toHaveBeenCalled();
  });

  it("displays the duplicate-email error without leaking a response payload", async () => {
    mocks.register.mockRejectedValue(new ApiError(409, "internal details"));
    render(<CustomerAuthForm mode="register" />);
    fillRegistration();
    await waitFor(() =>
      expect(screen.getByRole("alert")).toHaveTextContent(
        "Email này đã được đăng ký",
      ),
    );
    expect(screen.queryByText("internal details")).not.toBeInTheDocument();
    expect(sessionStorage.getItem("gobook.accessToken")).toBeNull();
  });

  it("logs in with the real session contract and navigates only to discovery", async () => {
    mocks.login.mockResolvedValue("synthetic-login-access");
    render(<CustomerAuthForm mode="login" />);
    fireEvent.change(screen.getByLabelText("Email"), {
      target: { value: "test@example.invalid" },
    });
    fireEvent.change(screen.getByLabelText("Mật khẩu"), {
      target: { value: "synthetic-password" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Đăng nhập" }));
    await waitFor(() =>
      expect(mocks.replace).toHaveBeenCalledWith("/services"),
    );
    expect(sessionStorage.getItem("gobook.accessToken")).toBe(
      "synthetic-login-access",
    );
  });
});
