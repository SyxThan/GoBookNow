import { reportUnexpected, validRequestId } from "./monitoring";

const correlation = () => ({ "X-Request-Id": crypto.randomUUID() });
const API_BASE_URL =
  process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3001/api/v1";

type ErrorPayload = {
  code?: string;
  message?: string | string[];
  slotId?: string;
  checkedInAt?: string;
};
type AccessTokenPayload = { accessToken: string };

export type ServiceKind = "SERVICE" | "EVENT";

export type ServiceSearchQuery = {
  q?: string;
  kind?: ServiceKind;
  categoryId?: string;
  categorySlug?: string;
  from?: string;
  to?: string;
  minPrice?: string;
  maxPrice?: string;
  province?: string;
  district?: string;
  ward?: string;
  page?: number;
  limit?: number;
};

export type PublicCategory = {
  id: string;
  code: string;
  name: string;
  slug: string;
  scope: ServiceKind;
  description: string | null;
  icon: string | null;
};

export type ServiceSearchItem = {
  id: string;
  kind: ServiceKind;
  title: string;
  slug: string;
  summary: string | null;
  thumbnail: { url: string } | null;
  startingPrice: { amount: string; currency: string };
  category: {
    id: string;
    code: string;
    name: string;
    slug: string;
  };
  vendor: {
    id: string;
    displayName: string;
    slug: string;
    province: string | null;
    district: string | null;
    ward: string | null;
  };
  nextAvailableSlot: {
    id: string;
    startAt: string;
    endAt: string;
  } | null;
};

export type ServiceSearchResponse = {
  items: ServiceSearchItem[];
  page: number;
  limit: number;
  total: number;
  totalPages: number;
};

export type PaymentResult = {
  id: string;
  status: "PENDING" | "SUCCEEDED" | "EXPIRED" | "CANCELLED";
  amount: string;
  currency: string;
  booking: {
    id: string;
    status: "PENDING_PAYMENT" | "CONFIRMED" | "EXPIRED" | "CANCELLED";
  };
  expiresAt: string | null;
};

export type SePayInitiationResponse = {
  paymentId: string;
  attemptId: string;
  provider: "SEPAY";
  status: "PENDING";
  amount: string;
  currency: string;
  merchantReference: string;
  paymentUrl: string;
  method: "POST";
  formFields: Record<string, string>;
  expiresAt: string;
};

export type PublicServiceDetail = {
  id: string;
  kind: ServiceKind;
  title: string;
  slug: string;
  summary: string | null;
  description: string | null;
  thumbnailUrl: string | null;
  priceAmount: string;
  currency: string;
  durationMinutes: number | null;
  status: "PUBLISHED";
  category: {
    id: string;
    code: string;
    name: string;
    slug: string;
  };
  vendor: {
    id: string;
    displayName: string;
    slug: string;
    province: string | null;
    district: string | null;
    ward: string | null;
  };
  images: Array<{
    id: string;
    url: string;
    width: number | null;
    height: number | null;
    sortOrder: number;
    isPrimary: boolean;
  }>;
};

export type PublicSlot = {
  id: string;
  startAt: string;
  endAt: string;
  capacity: number;
  status: "OPEN" | "CLOSED" | "CANCELLED";
  price: {
    amount: string;
    currency: string;
    source: "SERVICE" | "SLOT";
  };
};

export type PublicSlotResponse = {
  items: PublicSlot[];
  page: number;
  limit: number;
  total: number;
  totalPages: number;
};

export type CreateBookingHoldItem = {
  slotId: string;
  quantity: number;
};

export type BookingHoldResponse = {
  id: string;
  bookingCode: string;
  status: "PENDING_PAYMENT" | "CONFIRMED" | "EXPIRED" | "CANCELLED";
  currency: string;
  subtotalAmount: string;
  voucherDiscountAmount?: string;
  voucherCode?: string | null;
  totalAmount: string;
  expiresAt: string | null;
  items: Array<{
    id: string;
    serviceId: string;
    slotId: string;
    serviceTitle: string;
    startAt: string;
    endAt: string;
    quantity: number;
    unitPriceAmount: string;
    subtotalAmount: string;
    voucherDiscountAmount?: string;
    netAmount?: string;
    pricingSource: "SERVICE" | "SLOT";
    reservation: {
      id: string;
      status: "HELD" | "CONFIRMED" | "RELEASED" | "EXPIRED";
      expiresAt: string | null;
    };
  }>;
};

export type TicketStatus = "ISSUED" | "CHECKED_IN" | "VOIDED";

export type TicketValidationReason =
  | "VALID"
  | "INVALID_TOKEN"
  | "TICKET_NOT_FOUND"
  | "TICKET_VOIDED"
  | "ALREADY_CHECKED_IN"
  | "BOOKING_NOT_CONFIRMED"
  | "BOOKING_CANCELLED"
  | "BOOKING_EXPIRED"
  | "SLOT_CANCELLED"
  | "SLOT_EXPIRED"
  | "SLOT_NOT_STARTED"
  | "INCONSISTENT_TICKET_DATA";

export type VendorTicketValidation = {
  authentic: boolean;
  valid: boolean;
  checkInEligible: boolean;
  reason: TicketValidationReason;
  ticket?: {
    id: string;
    ticketCode: string;
    status: TicketStatus;
    sequenceNo: number;
    checkedInAt: string | null;
  };
  booking?: {
    id: string;
    bookingCode: string;
    status: "PENDING_PAYMENT" | "CONFIRMED" | "EXPIRED" | "CANCELLED";
  };
  service?: { id: string; title: string; kind: ServiceKind };
  slot?: {
    id: string;
    startAt: string;
    endAt: string;
    status: "OPEN" | "CLOSED" | "CANCELLED";
  };
};

export type TicketCheckInResult = {
  success: true;
  ticket: {
    id: string;
    ticketCode: string;
    status: "CHECKED_IN";
    sequenceNo: number;
    checkedInAt: string;
  };
  booking: { bookingCode: string };
  service: { title: string; kind: ServiceKind };
  slot: { startAt: string; endAt: string };
};

export type CustomerTicket = {
  id: string;
  ticketCode: string;
  sequenceNo: number;
  status: TicketStatus;
  issuedAt: string;
  checkedInAt: string | null;
  bookingItem: {
    serviceTitle: string;
    slotStartAt: string;
    slotEndAt: string;
    quantity: number;
  };
};

export type CustomerTicketList = {
  bookingId: string;
  bookingCode: string;
  bookingStatus: "PENDING_PAYMENT" | "CONFIRMED" | "EXPIRED" | "CANCELLED";
  cancellation: BookingCancellationResult | null;
  tickets: CustomerTicket[];
};

export type BookingReview = {
  id: string;
  bookingId: string;
  rating: number;
  comment: string | null;
  createdAt: string;
  updatedAt: string;
};

export type BookingReviewEligibility = {
  eligible: boolean;
  reason:
    | "ELIGIBLE"
    | "REVIEW_BOOKING_NOT_COMPLETED"
    | "REVIEW_BOOKING_CANCELLED"
    | "REVIEW_ALREADY_EXISTS";
  reviewId: string | null;
  reviewDeleted: boolean;
};

export type CancellationReason =
  | "FULL_REFUND"
  | "PARTIAL_REFUND"
  | "NO_REFUND"
  | "PARTIAL_CANCELLATION_REQUIRED"
  | "CANCELLATION_NOT_ALLOWED";

export type BookingCancellationPreview = {
  bookingId: string;
  cancellationAllowed: boolean;
  reason: CancellationReason;
  originalAmount: string;
  refundAmount: string;
  cancellationFeeAmount: string;
  currency: string;
  policyVersion: number;
  items: Array<{
    bookingItemId: string;
    originalAmount: string;
    refundBps: number;
    refundAmount: string;
    cancellationFeeAmount: string;
    cancellationAllowed: boolean;
    reason:
      | "FULL_REFUND"
      | "PARTIAL_REFUND"
      | "NO_REFUND"
      | "CANCELLATION_NOT_ALLOWED";
  }>;
};

export type BookingCancellationResult = {
  cancellationId: string;
  bookingId: string;
  bookingStatus: "CANCELLED";
  requestedAt: string;
  cancelledAt: string;
  originalAmount: string;
  refundAmount: string;
  cancellationFeeAmount: string;
  currency: string;
  policyVersion: number;
  reason: CancellationReason;
  refund: {
    id: string;
    status: "PENDING" | "SUCCEEDED" | "CANCELLED";
    kind: "PARTIAL" | "FULL";
    amount: string;
    currency: string;
  } | null;
};

export class ApiError extends Error {
  constructor(
    public readonly status: number,
    message: string,
    public readonly code?: string,
    public readonly details?: { slotId?: string; checkedInAt?: string },
    public readonly requestId?: string,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

async function readError(response: Response): Promise<ApiError> {
  let payload: ErrorPayload | undefined;
  try {
    payload = (await response.json()) as ErrorPayload;
  } catch {
    // Infrastructure failures may have an empty response body.
  }

  const message = Array.isArray(payload?.message)
    ? payload.message.join(". ")
    : payload?.message;
  const requestId = response.headers.get("X-Request-Id");
  const safeId = validRequestId(requestId) ? requestId : undefined;
  const error = new ApiError(
    response.status,
    (response.status === 429
      ? "Quá nhiều yêu cầu. Vui lòng thử lại sau."
      : response.status >= 500
        ? "Đã xảy ra lỗi hệ thống. Vui lòng thử lại sau."
        : (message ?? `Request failed with status ${response.status}`)) +
      (safeId ? ` Mã hỗ trợ: ${safeId}` : ""),
    payload?.code,
    payload?.slotId || payload?.checkedInAt
      ? { slotId: payload.slotId, checkedInAt: payload.checkedInAt }
      : undefined,
    safeId,
  );
  if (response.status >= 500) reportUnexpected(error, safeId);
  return error;
}

function queryString(values: object): string {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(values)) {
    if (value !== undefined && value !== "") params.set(key, String(value));
  }
  return params.toString();
}

async function publicGet<T>(path: string, signal?: AbortSignal): Promise<T> {
  const response = await fetch(`${API_BASE_URL}${path}`, {
    signal,
    headers: correlation(),
  });
  if (!response.ok) throw await readError(response);
  return response.json() as Promise<T>;
}

export function searchServices(
  query: ServiceSearchQuery,
  signal?: AbortSignal,
): Promise<ServiceSearchResponse> {
  const search = queryString(query);
  return publicGet<ServiceSearchResponse>(
    `/services${search ? `?${search}` : ""}`,
    signal,
  );
}

export function listPublicCategories(
  signal?: AbortSignal,
): Promise<PublicCategory[]> {
  return publicGet<PublicCategory[]>("/categories", signal);
}

export function getPublicService(
  slug: string,
  signal?: AbortSignal,
): Promise<PublicServiceDetail> {
  return publicGet<PublicServiceDetail>(
    `/services/${encodeURIComponent(slug)}`,
    signal,
  );
}

export type PublicVendorReviews = {
  reviewCount: number;
  averageRating: number | null;
  ratingDistribution: Record<string, number>;
  data: {
    rating: number;
    comment: string | null;
    createdAt: string;
    author: string;
  }[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
};

export function getPublicVendorReviews(
  vendorId: string,
  page = 1,
  signal?: AbortSignal,
) {
  return publicGet<PublicVendorReviews>(
    `/vendors/${encodeURIComponent(vendorId)}/reviews?page=${page}&limit=5`,
    signal,
  );
}

export function listPublicSlots(
  serviceId: string,
  signal?: AbortSignal,
): Promise<PublicSlotResponse> {
  return publicGet<PublicSlotResponse>(
    `/services/${encodeURIComponent(serviceId)}/slots?limit=100`,
    signal,
  );
}

async function refreshAccessToken(): Promise<string> {
  const response = await fetch(`${API_BASE_URL}/auth/refresh`, {
    method: "POST",
    credentials: "include",
    headers: correlation(),
  });
  if (!response.ok) throw await readError(response);
  return ((await response.json()) as AccessTokenPayload).accessToken;
}

export async function login(email: string, password: string): Promise<string> {
  const response = await fetch(`${API_BASE_URL}/auth/login`, {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json", ...correlation() },
    body: JSON.stringify({ email, password }),
  });
  if (!response.ok) throw await readError(response);
  return ((await response.json()) as AccessTokenPayload).accessToken;
}

export async function registerCustomer(input: {
  fullName: string;
  email: string;
  password: string;
  phone?: string;
}): Promise<string> {
  const response = await fetch(`${API_BASE_URL}/auth/register`, {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json", ...correlation() },
    body: JSON.stringify(input),
  });
  if (!response.ok) throw await readError(response);
  return ((await response.json()) as AccessTokenPayload).accessToken;
}

export async function logout(): Promise<void> {
  await fetch(`${API_BASE_URL}/auth/logout`, {
    method: "POST",
    credentials: "include",
    headers: correlation(),
  });
}

export async function apiRequest<T>(
  path: string,
  init: RequestInit,
  accessToken: string | null,
  onToken: (token: string | null) => void,
  allowRefresh = true,
): Promise<T> {
  const headers = new Headers(init.headers);
  headers.set("X-Request-Id", crypto.randomUUID());
  const isFormData =
    typeof FormData !== "undefined" && init.body instanceof FormData;
  if (init.body && !isFormData && !headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json");
  }
  if (accessToken) headers.set("Authorization", `Bearer ${accessToken}`);

  const response = await fetch(`${API_BASE_URL}${path}`, {
    ...init,
    headers,
    credentials: "include",
  });

  if (response.status === 401 && allowRefresh) {
    try {
      const refreshedToken = await refreshAccessToken();
      onToken(refreshedToken);
      return apiRequest<T>(path, init, refreshedToken, onToken, false);
    } catch {
      onToken(null);
      throw new ApiError(401, "Phiên đăng nhập đã hết hạn.");
    }
  }

  if (!response.ok) throw await readError(response);
  if (response.status === 204) return undefined as T;
  return response.json() as Promise<T>;
}

export function createBookingHold(
  input: {
    idempotencyKey: string;
    items: CreateBookingHoldItem[];
    voucherCode?: string;
  },
  accessToken: string | null,
  onToken: (token: string | null) => void,
): Promise<BookingHoldResponse> {
  return apiRequest<BookingHoldResponse>(
    "/bookings/hold",
    {
      method: "POST",
      headers: { "Idempotency-Key": input.idempotencyKey },
      body: JSON.stringify({
        items: input.items,
        ...(input.voucherCode ? { voucherCode: input.voucherCode } : {}),
      }),
    },
    accessToken,
    onToken,
  );
}

export type VoucherQuote = {
  valid: boolean;
  reason: string;
  code: string;
  type?: "FIXED" | "PERCENTAGE";
  grossSubtotalAmount: string;
  discountAmount: string;
  netTotalAmount: string;
};

export function validateVoucher(
  code: string,
  items: CreateBookingHoldItem[],
  accessToken: string | null,
  onToken: (token: string | null) => void,
): Promise<VoucherQuote> {
  return apiRequest<VoucherQuote>(
    "/vouchers/validate",
    { method: "POST", body: JSON.stringify({ code, items }) },
    accessToken,
    onToken,
  );
}

export function initiateSePayPayment(
  bookingId: string,
  accessToken: string | null,
  onToken: (token: string | null) => void,
): Promise<SePayInitiationResponse> {
  return apiRequest<SePayInitiationResponse>(
    "/payments/sepay",
    {
      method: "POST",
      body: JSON.stringify({ bookingId }),
    },
    accessToken,
    onToken,
  );
}

export async function apiDownload(
  path: string,
  accessToken: string | null,
  onToken: (token: string | null) => void,
  allowRefresh = true,
): Promise<Blob> {
  const headers = new Headers();
  headers.set("X-Request-Id", crypto.randomUUID());
  if (accessToken) headers.set("Authorization", `Bearer ${accessToken}`);
  const response = await fetch(`${API_BASE_URL}${path}`, {
    headers,
    credentials: "include",
  });
  if (response.status === 401 && allowRefresh) {
    try {
      const refreshedToken = await refreshAccessToken();
      onToken(refreshedToken);
      return apiDownload(path, refreshedToken, onToken, false);
    } catch {
      onToken(null);
      throw new ApiError(401, "Phiên đăng nhập đã hết hạn.");
    }
  }
  if (!response.ok) throw await readError(response);
  return response.blob();
}

export function getPaymentResult(
  paymentId: string,
  accessToken: string | null,
  onToken: (token: string | null) => void,
  signal?: AbortSignal,
): Promise<PaymentResult> {
  return apiRequest<PaymentResult>(
    `/payments/${encodeURIComponent(paymentId)}`,
    { method: "GET", signal },
    accessToken,
    onToken,
  );
}

export function getBookingTickets(
  bookingId: string,
  accessToken: string | null,
  onToken: (token: string | null) => void,
  signal?: AbortSignal,
): Promise<CustomerTicketList> {
  return apiRequest<CustomerTicketList>(
    `/bookings/${encodeURIComponent(bookingId)}/tickets`,
    { method: "GET", signal },
    accessToken,
    onToken,
  );
}

export function getBookingReviewEligibility(
  bookingId: string,
  accessToken: string | null,
  onToken: (token: string | null) => void,
  signal?: AbortSignal,
): Promise<BookingReviewEligibility> {
  return apiRequest(
    `/bookings/${encodeURIComponent(bookingId)}/review/eligibility`,
    { method: "GET", signal },
    accessToken,
    onToken,
  );
}

export function getBookingReview(
  bookingId: string,
  accessToken: string | null,
  onToken: (token: string | null) => void,
  signal?: AbortSignal,
): Promise<BookingReview> {
  return apiRequest(
    `/bookings/${encodeURIComponent(bookingId)}/review`,
    { method: "GET", signal },
    accessToken,
    onToken,
  );
}

export function createBookingReview(
  bookingId: string,
  input: { rating: number; comment?: string },
  accessToken: string | null,
  onToken: (token: string | null) => void,
): Promise<BookingReview> {
  return apiRequest(
    `/bookings/${encodeURIComponent(bookingId)}/review`,
    { method: "POST", body: JSON.stringify(input) },
    accessToken,
    onToken,
  );
}

export function updateBookingReview(
  reviewId: string,
  input: { rating: number; comment?: string },
  accessToken: string | null,
  onToken: (token: string | null) => void,
): Promise<BookingReview> {
  return apiRequest(
    `/reviews/${encodeURIComponent(reviewId)}`,
    { method: "PATCH", body: JSON.stringify(input) },
    accessToken,
    onToken,
  );
}

export function deleteBookingReview(
  reviewId: string,
  accessToken: string | null,
  onToken: (token: string | null) => void,
): Promise<void> {
  return apiRequest(
    `/reviews/${encodeURIComponent(reviewId)}`,
    { method: "DELETE" },
    accessToken,
    onToken,
  );
}

export function previewBookingCancellation(
  bookingId: string,
  accessToken: string | null,
  onToken: (token: string | null) => void,
): Promise<BookingCancellationPreview> {
  return apiRequest<BookingCancellationPreview>(
    `/bookings/${encodeURIComponent(bookingId)}/cancellation/preview`,
    { method: "POST" },
    accessToken,
    onToken,
  );
}

export function cancelBooking(
  input: {
    bookingId: string;
    idempotencyKey: string;
    reasonNote?: string;
  },
  accessToken: string | null,
  onToken: (token: string | null) => void,
): Promise<BookingCancellationResult> {
  return apiRequest<BookingCancellationResult>(
    `/bookings/${encodeURIComponent(input.bookingId)}/cancel`,
    {
      method: "POST",
      headers: { "Idempotency-Key": input.idempotencyKey },
      body: JSON.stringify(
        input.reasonNote ? { reasonNote: input.reasonNote } : {},
      ),
    },
    accessToken,
    onToken,
  );
}

export function getTicketQr(
  ticketId: string,
  download: boolean,
  accessToken: string | null,
  onToken: (token: string | null) => void,
): Promise<Blob> {
  return apiDownload(
    `/tickets/${encodeURIComponent(ticketId)}/qr${download ? "?download=true" : ""}`,
    accessToken,
    onToken,
  );
}

export function validateVendorTicket(
  token: string,
  accessToken: string | null,
  onToken: (token: string | null) => void,
): Promise<VendorTicketValidation> {
  return apiRequest<VendorTicketValidation>(
    "/vendor/tickets/validate",
    { method: "POST", body: JSON.stringify({ token }) },
    accessToken,
    onToken,
  );
}

export function checkInVendorTicket(
  token: string,
  accessToken: string | null,
  onToken: (token: string | null) => void,
): Promise<TicketCheckInResult> {
  return apiRequest<TicketCheckInResult>(
    "/vendor/tickets/check-in",
    { method: "POST", body: JSON.stringify({ token }) },
    accessToken,
    onToken,
  );
}
