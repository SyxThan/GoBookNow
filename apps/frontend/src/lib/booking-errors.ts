import { ApiError } from "./api-client";

export type BookingErrorKind =
  | "CAPACITY"
  | "SLOT_UNAVAILABLE"
  | "IDEMPOTENCY"
  | "AUTH"
  | "FORBIDDEN"
  | "NETWORK"
  | "UNKNOWN";

export type FriendlyBookingError = {
  kind: BookingErrorKind;
  message: string;
  refetchSlots: boolean;
};

export function toFriendlyBookingError(error: unknown): FriendlyBookingError {
  if (!(error instanceof ApiError)) {
    return {
      kind: "NETWORK",
      message:
        "Kết nối bị gián đoạn. Hãy thử lại; yêu cầu này sẽ dùng cùng mã an toàn.",
      refetchSlots: false,
    };
  }
  if (error.status === 401) {
    return {
      kind: "AUTH",
      message: "Phiên đăng nhập đã hết hạn. Vui lòng đăng nhập lại.",
      refetchSlots: false,
    };
  }
  if (error.status === 403) {
    return {
      kind: "FORBIDDEN",
      message: "Tài khoản này không thể tạo booking khách hàng.",
      refetchSlots: false,
    };
  }
  if (error.code === "INSUFFICIENT_CAPACITY") {
    return {
      kind: "CAPACITY",
      message: "Không còn đủ chỗ cho số lượng bạn chọn.",
      refetchSlots: true,
    };
  }
  if (error.code === "BOOKING_SLOT_UNAVAILABLE") {
    return {
      kind: "SLOT_UNAVAILABLE",
      message: "Khung giờ này không còn khả dụng. Vui lòng chọn giờ khác.",
      refetchSlots: true,
    };
  }
  if (
    error.code === "IDEMPOTENCY_CONFLICT" ||
    error.code === "IDEMPOTENCY_KEY_CONFLICT"
  ) {
    return {
      kind: "IDEMPOTENCY",
      message: "Yêu cầu đặt chỗ đã thay đổi. Hãy tạo một lần thử mới.",
      refetchSlots: false,
    };
  }
  const voucherMessages: Record<string, string> = {
    VOUCHER_NOT_FOUND: "Mã voucher không tồn tại.",
    VOUCHER_INACTIVE: "Voucher đã bị vô hiệu hóa.",
    VOUCHER_NOT_STARTED: "Voucher chưa bắt đầu.",
    VOUCHER_EXPIRED: "Voucher đã hết hạn.",
    VOUCHER_MIN_ORDER_NOT_MET: "Đơn hàng chưa đạt mức tối thiểu của voucher.",
    VOUCHER_LIMIT_REACHED: "Voucher đã hết lượt sử dụng.",
    VOUCHER_NO_DISCOUNT: "Voucher không tạo ra mức giảm giá.",
    FREE_CHECKOUT_UNSUPPORTED:
      "Voucher khiến tổng thanh toán bằng 0; hiện chưa hỗ trợ checkout miễn phí.",
  };
  if (error.code && voucherMessages[error.code]) {
    return {
      kind: "UNKNOWN",
      message: voucherMessages[error.code],
      refetchSlots: false,
    };
  }
  return {
    kind: "UNKNOWN",
    message:
      "Không thể giữ chỗ lúc này. Vui lòng thử lại." +
      (error.requestId ? ` Mã hỗ trợ: ${error.requestId}` : ""),
    refetchSlots: false,
  };
}
