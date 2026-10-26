import Link from "next/link";
export default function NotFound() {
  return (
    <main className="page-wrap">
      <h1 className="section-title">Không tìm thấy trang</h1>
      <p className="mt-4">Kiểm tra lại đường dẫn hoặc trở về khu vực chính.</p>
      <Link href="/" className="primary-button mt-6">
        Về trang chính
      </Link>
    </main>
  );
}
