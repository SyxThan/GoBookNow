import { describe, expect, it } from "vitest";
import { percentageToBps } from "./catalog-management";
describe("voucher percentage input", () => {
  it("preserves fractional percentages without floating point rounding", () => {
    expect(percentageToBps("0.01")).toBe(1);
    expect(percentageToBps("12.34")).toBe(1234);
    expect(percentageToBps("29.9")).toBe(2990);
    expect(percentageToBps("100")).toBe(10000);
  });
  it.each(["0", "100.01", "12.345", "-1", "1e2", "", "NaN"])(
    "rejects an invalid percentage: %s",
    (value) => expect(() => percentageToBps(value)).toThrow(),
  );
});
