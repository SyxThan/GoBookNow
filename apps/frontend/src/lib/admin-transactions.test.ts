import { afterEach, describe, expect, it, vi } from "vitest";
import { getTransaction, getTransactions, getTransactionSummary, transactionQuery } from "./admin-transactions";

describe("Admin Transaction API client", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("encodes only supplied filters and keeps list pagination out of summary", async () => {
    const fetchMock = vi.fn().mockImplementation(() => Promise.resolve(new Response(JSON.stringify({ data: [] }),
      { status: 200, headers: { "Content-Type": "application/json" } })));
    vi.stubGlobal("fetch", fetchMock);
    const onToken = vi.fn();
    await getTransactions({ search: "sepay 123", paymentStatus: "SUCCEEDED", page: 2, limit: 10 }, "token", onToken);
    await getTransactionSummary({ search: "sepay 123", page: 2, limit: 10 }, "token", onToken);
    const [listUrl, listInit] = fetchMock.mock.calls[0] as [string, RequestInit];
    const [summaryUrl] = fetchMock.mock.calls[1] as [string, RequestInit];
    expect(listUrl).toContain("search=sepay+123");
    expect(listUrl).toContain("page=2");
    expect(listUrl).toContain("paymentStatus=SUCCEEDED");
    expect(new Headers(listInit.headers).get("Authorization")).toBe("Bearer token");
    expect(summaryUrl).toContain("/admin/transactions/summary?");
    expect(summaryUrl).not.toContain("page=");
    expect(summaryUrl).not.toContain("limit=");
    expect(transactionQuery({ search: "", bookingCode: "GBK-1" })).toBe("bookingCode=GBK-1");
  });

  it("loads detail through a read-only GET", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({ id: "payment-id" }),
      { status: 200, headers: { "Content-Type": "application/json" } }));
    vi.stubGlobal("fetch", fetchMock);
    await getTransaction("payment-id", "token", vi.fn());
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toContain("/admin/transactions/payment-id");
    expect(init.method).toBe("GET");
  });
});
