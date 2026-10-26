import { NextRequest, NextResponse } from "next/server";
import { legacyPortalTarget } from "@/lib/legacy-portal";
export async function GET(
  request: NextRequest,
  context: { params: Promise<{ path?: string[] }> },
) {
  const { path = [] } = await context.params;
  const target = legacyPortalTarget(
    "admin",
    path,
    request.nextUrl.searchParams,
    process.env.NEXT_PUBLIC_ADMIN_URL ?? "http://localhost:3003",
  );
  if (!target)
    return new NextResponse("Không tìm thấy trang này.", {
      status: 404,
      headers: { "Cache-Control": "no-store" },
    });
  return NextResponse.redirect(target, {
    status: 307,
    headers: { "Cache-Control": "no-store" },
  });
}
