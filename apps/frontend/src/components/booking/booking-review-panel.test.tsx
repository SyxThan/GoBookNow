import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { BookingReviewPanel } from "./booking-review-panel";

const response = (body: object, status = 200) => new Response(JSON.stringify(body),
  { status, headers: { "Content-Type": "application/json" } });
function panel() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(<QueryClientProvider client={client}>
    <BookingReviewPanel bookingId="booking-a" accessToken="token" onToken={vi.fn()} />
  </QueryClientProvider>);
}
describe("Booking Review panel", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("does not offer creation before all Booking items have ended", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(response({ eligible: false,
      reason: "REVIEW_BOOKING_NOT_COMPLETED", reviewId: null, reviewDeleted: false })));
    panel();
    expect(await screen.findByText(/mọi lịch đã kết thúc/)).toBeVisible();
    expect(screen.queryByRole("button", { name: "Đánh giá trải nghiệm" })).not.toBeInTheDocument();
  });

  it("submits Customer rating/comment and displays success", async () => {
    const fetchMock = vi.fn().mockImplementation((url: string, init: RequestInit) => {
      if (url.endsWith("/eligibility")) return Promise.resolve(response({ eligible: true,
        reason: "ELIGIBLE", reviewId: null, reviewDeleted: false }));
      if (init.method === "POST") return Promise.resolve(response({ id: "review-a", rating: 4, comment: "Tốt" }, 201));
      return Promise.resolve(response({ id: "review-a", rating: 4, comment: "Tốt" }));
    });
    vi.stubGlobal("fetch", fetchMock);
    panel();
    fireEvent.click(await screen.findByRole("button", { name: "Đánh giá trải nghiệm" }));
    fireEvent.click(screen.getByRole("radio", { name: "4 ★" }));
    fireEvent.change(screen.getByRole("textbox", { name: /Nhận xét/ }), { target: { value: "Tốt" } });
    fireEvent.click(screen.getByRole("button", { name: "Lưu đánh giá" }));
    await waitFor(() => expect(fetchMock.mock.calls.some(([url, init]) =>
      String(url).endsWith("/bookings/booking-a/review") && init.method === "POST" &&
      JSON.parse(String(init.body)).rating === 4)).toBe(true));
  });
});
