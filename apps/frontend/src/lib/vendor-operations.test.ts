import { describe, expect, it } from "vitest";
import { localDateToInstant, vendorQueryString } from "./vendor-operations";

describe("Vendor operations API helpers", () => {
  it("uses Asia/Ho_Chi_Minh calendar boundaries and exclusive end", () => {
    expect(localDateToInstant("2026-10-20")).toBe("2026-10-19T17:00:00.000Z");
    expect(localDateToInstant("2026-10-20", true)).toBe("2026-10-20T17:00:00.000Z");
    expect(localDateToInstant("invalid")).toBeUndefined();
  });
  it("omits unused filters", () => {
    expect(vendorQueryString({ status: "UPCOMING", page: 2, search: "", serviceId: undefined }))
      .toBe("status=UPCOMING&page=2");
  });
});
