import { describe, expect, it } from "vitest";
import { legacyPortalTarget } from "./legacy-portal";
const id = "11111111-1111-4111-8111-111111111111";
describe("Legacy portal destinations", () => {
  it.each([
    ["vendor", ["services", id, "slots"], `/services/${id}/slots`],
    ["vendor", ["bookings", id], `/bookings/${id}`],
    ["vendor", ["application"], "/onboarding/application"],
    ["admin", ["transactions", id], `/transactions/${id}`],
  ] as const)("preserves %s resource context", (portal, segments, path) => {
    const result = legacyPortalTarget(
      portal,
      [...segments],
      new URLSearchParams(
        "page=2&status=PENDING&accessToken=private&next=https://evil.invalid",
      ),
      "https://portal.example.test",
    );
    expect(result?.pathname).toBe(path);
    expect(result?.search).toBe("?page=2&status=PENDING");
  });
  it.each([
    ["services", "//evil.invalid"],
    ["..", "admin"],
    ["services", id, "unknown"],
    ["login"],
  ])("rejects unknown route segments %j", (...segments) => {
    expect(
      legacyPortalTarget(
        "vendor",
        segments,
        new URLSearchParams(),
        "https://vendor.example.test",
      ),
    ).toBeNull();
  });
  it("rejects credentials or a path in configuration", () => {
    expect(() =>
      legacyPortalTarget(
        "admin",
        [],
        new URLSearchParams(),
        "https://user:password@portal.example.test/path",
      ),
    ).toThrow();
  });
});
