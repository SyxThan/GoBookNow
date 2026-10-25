import { randomUUID } from "node:crypto";
import { afterEach, describe, expect, it, vi } from "vitest";
import { apiRequest, ApiError } from "./api-client";
import { reportUnexpected } from "./monitoring";

vi.mock("./monitoring", async (original) => ({
  ...(await original<typeof import("./monitoring")>()),
  reportUnexpected: vi.fn(),
}));
describe("API error correlation", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.clearAllMocks();
  });
  it("uses only validated response request IDs and never displays a raw 500 payload", async () => {
    const id = randomUUID();
    const fetch = vi
      .fn()
      .mockResolvedValue(
        new Response(
          JSON.stringify({
            message: "private-database-url-and-jwt",
            stack: "private-stack",
          }),
          { status: 500, headers: { "X-Request-Id": id } },
        ),
      );
    vi.stubGlobal("fetch", fetch);
    const error = await apiRequest("/payments/id", {}, null, vi.fn()).catch(
      (error: unknown) => error,
    );
    expect(error).toBeInstanceOf(ApiError);
    expect(error).toMatchObject({ requestId: id, status: 500 });
    expect((error as Error).message).toContain(`Mã hỗ trợ: ${id}`);
    expect((error as Error).message).not.toContain("private-");
    expect(reportUnexpected).toHaveBeenCalledTimes(1);
    const [, options] = fetch.mock.calls[0] as [string, RequestInit];
    expect(new Headers(options.headers).get("X-Request-Id")).toMatch(
      /^[0-9a-f-]{36}$/,
    );
  });
  it.each([400, 403, 409, 429])(
    "does not report ordinary HTTP %s as an unexpected error",
    async (status) => {
      vi.stubGlobal(
        "fetch",
        vi
          .fn()
          .mockResolvedValue(
            new Response(JSON.stringify({ message: "Expected rejection" }), {
              status,
              headers: { "X-Request-Id": "untrusted-header-value" },
            }),
          ),
      );
      const error = await apiRequest("/expected", {}, null, vi.fn()).catch(
        (error: unknown) => error,
      );
      expect(error).toMatchObject({ requestId: undefined });
      expect(reportUnexpected).not.toHaveBeenCalled();
      if (status === 429)
        expect((error as Error).message).toContain("Quá nhiều yêu cầu");
    },
  );
});
