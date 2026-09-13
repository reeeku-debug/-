import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { getToken } from "next-auth/jwt";

export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;

  const isAdminPath = pathname.startsWith("/admin") && pathname !== "/admin/login";
  // /talent 単体（slug無し）のみ対象。/talent/[slug] はログイン不要でアクセスできる
  // 専用URL（slugが実質的なアクセストークン）なので、ここでは何もチェックしない。
  const isBareTalentPath = pathname === "/talent";

  if (!isAdminPath && !isBareTalentPath) {
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

  if (isBareTalentPath) {
    // ログイン済みなら自分専用のURLへ、未ログインならログイン画面へ
    if (token?.role === "TALENT" && token.slug) {
      return NextResponse.redirect(new URL(`/talent/${token.slug}`, req.url));
    }
    return NextResponse.redirect(new URL("/login", req.url));
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/admin/:path*", "/talent"],
};
