import Link from "next/link";
import { Burst, Icon } from "@/components/ui/icon";

export default function NotFound() {
  return <main className="page-wrap grid min-h-[65vh] place-items-center text-center"><section className="max-w-lg py-12"><div className="relative mx-auto w-48"><Burst className="text-sun" /><span className="absolute inset-0 grid place-items-center text-6xl font-extrabold">404</span></div><p className="eyebrow mt-8">Lạc đường một chút</p><h1 className="mt-3 text-3xl sm:text-4xl">Trải nghiệm tiếp theo vẫn đang chờ bạn.</h1><p className="mt-5 text-muted">Trang này không tồn tại hoặc đã được chuyển. Cùng quay lại tìm một điều thú vị nhé.</p><Link className="primary-button mt-8" href="/services">Về trang khám phá<Icon name="arrow" /></Link></section></main>;
}
