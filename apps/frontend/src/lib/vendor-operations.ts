import { apiRequest } from './api-client';

export type VendorBookingStatus = 'ALL' | 'UPCOMING' | 'COMPLETED' | 'CANCELLED';
export type VendorBookingRow = {
  bookingId: string; bookingCode: string; status: string; operationalStatus: string;
  currency: string; grossAmount: string; discountAmount: string; totalAmount: string;
  platformFeeAmount: string | null; vendorAmount: string | null; createdAt: string;
  itemCount: number; totalQuantity: number;
  itemsSummary: { serviceId: string; serviceTitle: string; startAt: string; endAt: string; quantity: number }[];
};
export type VendorBookingList = { data: VendorBookingRow[]; pagination: { page: number; limit: number; total: number; totalPages: number } };
export type VendorBookingDetail = {
  bookingId: string; bookingCode: string; status: string; operationalStatus: string; createdAt: string;
  currency: string; grossAmount: string; discountAmount: string; netAmount: string;
  commissionBps: number | null; platformFeeAmount: string | null; vendorAmount: string | null;
  commissionCovered: boolean;
  payment: { status: string; amount: string; succeededAt: string | null } | null;
  refunds: { succeededAmount: string; pendingAmount: string };
  retained: { netAmount: string; projectedNetAfterPending: string;
    platformFeeAmount: string | null; vendorAmount: string | null } | null;
  cancellation: { requestedAt: string; reasonCode: string; refundAmount: string; cancellationFeeAmount: string } | null;
  items: { id: string; serviceId: string; slotId: string; serviceTitle: string; startAt: string; endAt: string;
    quantity: number; grossAmount: string; discountAmount: string; netAmount: string;
    platformFeeAmount: string | null; vendorAmount: string | null;
    tickets: { issued: number; checkedIn: number; voided: number } }[];
};
export type VendorDashboard = {
  period: { from: string; to: string; bookingBasis: string; financialBasis: string; occupancyBasis: string };
  bookings: { total: number; confirmed: number; cancelled: number; paid: number; paidCancelled: number; cancellationRateBps: number };
  financial: { paidRevenue: string; succeededRefunds: string; pendingRefunds: string; netRetainedRevenue: string;
    estimatedPlatformFee: string; estimatedVendorEarnings: string;
    commissionCoveredBookingCount: number; commissionUnknownBookingCount: number };
  occupancy: { confirmedQuantity: number; activeHeldQuantity: number; totalCapacity: number; rateBps: number };
  revenueTrend: { day: string; paidRevenue: string; paymentCount: number }[];
};

export function vendorQueryString(values: Record<string, string | number | undefined>): string {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(values)) if (value !== undefined && value !== '') params.set(key, String(value));
  return params.toString();
}

export function getVendorBookings(query: Record<string, string | number | undefined>, token: string | null,
  onToken: (token: string | null) => void, signal?: AbortSignal) {
  return apiRequest<VendorBookingList>(`/vendor/bookings?${vendorQueryString(query)}`, { method: 'GET', signal }, token, onToken);
}
export function getVendorBooking(id: string, token: string | null,
  onToken: (token: string | null) => void, signal?: AbortSignal) {
  return apiRequest<VendorBookingDetail>(`/vendor/bookings/${encodeURIComponent(id)}`, { method: 'GET', signal }, token, onToken);
}
export function getVendorDashboard(query: Record<string, string | number | undefined>, token: string | null,
  onToken: (token: string | null) => void, signal?: AbortSignal) {
  return apiRequest<VendorDashboard>(`/vendor/dashboard/overview?${vendorQueryString(query)}`, { method: 'GET', signal }, token, onToken);
}

export function localDateToInstant(value: string, exclusiveEnd = false): string | undefined {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return undefined;
  const date = new Date(`${value}T00:00:00+07:00`);
  if (Number.isNaN(date.getTime())) return undefined;
  if (exclusiveEnd) date.setUTCDate(date.getUTCDate() + 1);
  return date.toISOString();
}
