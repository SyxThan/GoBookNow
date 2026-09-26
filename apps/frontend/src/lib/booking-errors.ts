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
  if (error.code === "IDEMPOTENCY_CONFLICT") {
    return {
      kind: "IDEMPOTENCY",
      message: "Yêu cầu đặt chỗ đã thay đổi. Hãy tạo một lần thử mới.",
      refetchSlots: false,
    };
  }
  return {
    kind: "UNKNOWN",
    message: "Không thể giữ chỗ lúc này. Vui lòng thử lại.",
    refetchSlots: false,
  };
}
