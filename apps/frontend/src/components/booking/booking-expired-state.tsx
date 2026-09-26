export function BookingExpiredState({
  onRetry,
  onChooseAnother,
}: {
  onRetry: () => void;
  onChooseAnother: () => void;
}) {
  return (
    <section className="panel mx-auto max-w-2xl p-7 text-center sm:p-10" role="status">
      <div className="mx-auto grid size-14 place-items-center rounded-full bg-amber-300/10 text-2xl text-amber-200">
        00
      </div>
      <p className="eyebrow mt-6">Reservation EXPIRED</p>
      <h1 className="mt-3 text-3xl font-semibold text-white">
        Thời gian giữ chỗ đã hết.
      </h1>
      <p className="mx-auto mt-3 max-w-lg text-sm leading-6 text-slate-400">
        Deadline từ backend đã qua nên thanh toán không còn khả dụng. Bạn có thể thử
        lại bằng một request mới hoặc chọn khung giờ khác.
      </p>
      <div className="mt-7 flex flex-col justify-center gap-3 sm:flex-row">
        <button type="button" className="primary-button" onClick={onRetry}>
          Thử booking lại
        </button>
        <button type="button" className="secondary-button" onClick={onChooseAnother}>
          Chọn khung giờ khác
        </button>
      </div>
      <button type="button" className="primary-button mt-5 w-full" disabled>
        Thanh toán không còn khả dụng
      </button>
    </section>
  );
}
