import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { getToken } from "next-auth/jwt";

export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;

  const isAdminPath = pathname.startsWith("/admin") && pathname !== "/admin/login";
  const isTalentPath = pathname.startsWith("/talent");

  if (!isAdminPath && !isTalentPath) {
    return NextResponse.next();
  }

  const token = await getToken({ req, secret: process.env.NEXTAUTH_SECRET });

  if (isAdminPath) {
    if (!token) {
      const url = new URL("/admin/login", req.url);
      url.searchParams.set("callbackUrl", pathname);
      return NextResponse.redirect(url);
    }
    if (token.role !== "ADMIN") {
      return NextResponse.redirect(new URL("/login", req.url));
    }
  }

  if (isTalentPath) {
    if (!token) {
      const url = new URL("/login", req.url);
      url.searchParams.set("callbackUrl", pathname);
      return NextResponse.redirect(url);
    }
    if (token.role !== "TALENT") {
      return NextResponse.redirect(new URL("/admin", req.url));
    }
    // 他タレントのURLを知っていても閲覧できないよう、常に自分自身のslugへ強制する
    const ownPath = `/talent/${token.slug}`;
    if (pathname !== ownPath && !pathname.startsWith(`${ownPath}/`)) {
      return NextResponse.redirect(new URL(ownPath, req.url));
    }
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/admin/:path*", "/talent/:path*"],
};
