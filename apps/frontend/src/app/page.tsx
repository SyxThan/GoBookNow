import Link from "next/link";

export default function Home() {
  return (
    <main className="grid min-h-screen place-items-center bg-slate-950 px-6 text-slate-100">
      <section className="max-w-3xl text-center">
        <p className="eyebrow">GoBook</p>
        <h1 className="mt-6 text-5xl font-semibold tracking-tight sm:text-7xl">
          Biến dịch vụ thành trải nghiệm đáng nhớ.
        </h1>
        <p className="mx-auto mt-6 max-w-2xl text-lg leading-8 text-slate-400">
          Quản lý hồ sơ tổ chức, chuẩn bị cho quá trình xét duyệt và bắt đầu xây
          dựng gian hàng của bạn.
        </p>
        <div className="mt-9 flex flex-wrap justify-center gap-3">
          <Link href="/vendor/profile" className="primary-button inline-flex">
            Mở Vendor Profile
          </Link>
          <Link
            href="/vendor/application"
            className="secondary-button inline-flex"
          >
            Vendor Onboarding
          </Link>
          <Link
            href="/admin/vendor-applications"
            className="secondary-button inline-flex"
          >
            Admin Review
          </Link>
        </div>
      </section>
    </main>
  );
}
