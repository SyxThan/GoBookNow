import { ApiError } from "./api-client";

export type FriendlyPaymentError = {
  message: string;
  retryable: boolean;
  expired: boolean;
};

export function toFriendlyPaymentError(error: unknown): FriendlyPaymentError {
  if (!(error instanceof ApiError)) {
    return {
      message:
        "Không thể xác nhận việc khởi tạo thanh toán. Vui lòng thử lại.",
      retryable: true,
      expired: false,
    };
  }

  if (error.status === 400) {
    return {
      message: "Yêu cầu thanh toán không hợp lệ.",
      retryable: false,
      expired: false,
    };
  }
  if (error.status === 401) {
    return {
      message: "Phiên đăng nhập đã hết hạn. Vui lòng đăng nhập lại.",
      retryable: false,
      expired: false,
    };
  }
  if (error.status === 403) {
    return {
      message: "Bạn không có quyền thanh toán booking này.",
      retryable: false,
      expired: false,
    };
  }
  if (error.status === 404) {
    return {
      message: "Booking không còn khả dụng.",
      retryable: false,
      expired: false,
    };
  }
  if (error.status === 503 || error.code === "SEPAY_UNAVAILABLE") {
    return {
      message: "SePay hiện tạm thời không khả dụng. Vui lòng thử lại sau.",
      retryable: true,
      expired: false,
    };
  }
  if (error.status === 409) {
    if (
      error.code === "BOOKING_EXPIRED" ||
      error.code === "BOOKING_HOLD_NOT_PAYABLE"
    ) {
      return {
        message: "Phiên giữ chỗ đã hết hạn.",
        retryable: false,
        expired: true,
      };
    }
    if (error.code === "FREE_BOOKING_PAYMENT_NOT_REQUIRED") {
      return {
        message: "Booking miễn phí không cần thanh toán qua SePay.",
        retryable: false,
        expired: false,
      };
    }
    if (error.code === "PAYMENT_INITIATION_CONFLICT") {
      return {
        message: "Chưa thể khởi tạo thanh toán. Vui lòng thử lại.",
        retryable: true,
        expired: false,
      };
    }
    return {
      message:
        "Booking hoặc thanh toán không còn ở trạng thái có thể thanh toán.",
      retryable: false,
      expired: false,
    };
  }

  return {
    message: "Không thể khởi tạo thanh toán. Vui lòng thử lại.",
    retryable: true,
    expired: false,
  };
}
