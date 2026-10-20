import { apiRequest } from "@/lib/api-client";

export type TransactionFilters = {
  search?: string; bookingCode?: string; bookingId?: string; userId?: string; userEmail?: string; paymentStatus?: string;
  attemptStatus?: string; provider?: string; from?: string; to?: string;
  page?: number; limit?: number; sort?: "newest" | "oldest";
};
export type RefundState = { state: "NONE" | "PARTIAL" | "FULL"; succeededAmount: string; pendingAmount: string };
export type TransactionRow = {
  id: string; bookingId: string; bookingCode: string; bookingStatus: string;
  customerId: string; customerEmail: string; vendor: { id: string; displayName: string };
  status: string; amount: string; currency: string; createdAt: string; succeededAt: string | null;
  latestAttempt: { id: string; provider: string; status: string; merchantReference: string; createdAt: string } | null;
  attemptCount: number; refund: RefundState;
};
export type TransactionList = { data: TransactionRow[]; total: number; page: number; limit: number; totalPages: number };
export type TransactionSummary = { total: number; byStatus: Record<string, { count: number; amount: string }>;
  refunds: Record<string, { count: number; amount: string }> };
export type TransactionDetail = {
  id: string; bookingId: string; booking: { bookingCode: string; status: string; customerId: string;
    customer: { email: string }; vendor: { id: string; displayName: string } };
  status: string; amount: string; currency: string; createdAt: string; updatedAt: string;
  succeededAt: string | null; expiredAt: string | null; cancelledAt: string | null; refund: RefundState;
  attempts: { id: string; provider: string; status: string; amount: string; currency: string;
    merchantReference: string; providerTransactionId: string | null; failureCode: string | null;
    createdAt: string; succeededAt: string | null; failedAt: string | null;
    cancelledAt: string | null; expiresAt: string | null }[];
  refunds: { id: string; status: string; kind: string; reason: string; reasonNote: string | null;
    amount: string; currency: string; requestedAt: string; succeededAt: string | null; cancelledAt: string | null }[];
  timeline: { at: string; type: string; reference: string }[];
};

export function transactionQuery(filters: TransactionFilters) {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(filters)) {
    if (value !== undefined && value !== "") params.set(key, String(value));
  }
  return params.toString();
}

export function getTransactions(filters: TransactionFilters, token: string | null,
  onToken: (token: string | null) => void) {
  return apiRequest<TransactionList>(`/admin/transactions?${transactionQuery(filters)}`,
    { method: "GET" }, token, onToken);
}
export function getTransactionSummary(filters: TransactionFilters, token: string | null,
  onToken: (token: string | null) => void) {
  const { page: _page, limit: _limit, sort: _sort, ...summaryFilters } = filters;
  void _page; void _limit; void _sort;
  return apiRequest<TransactionSummary>(`/admin/transactions/summary?${transactionQuery(summaryFilters)}`,
    { method: "GET" }, token, onToken);
}
export function getTransaction(id: string, token: string | null,
  onToken: (token: string | null) => void) {
  return apiRequest<TransactionDetail>(`/admin/transactions/${encodeURIComponent(id)}`,
    { method: "GET" }, token, onToken);
}
