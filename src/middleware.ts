import { NextResponse, type NextRequest } from "next/server";
import { COOKIE, authRequired, readSession } from "@/lib/auth";

const PUBLIC = [/^\/login/, /^\/api\/auth\//, /^\/api\/webhooks\//, /^\/api\/health/, /^\/api\/assets\/[a-f0-9]{32}$/];

export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;
  if (!authRequired() || PUBLIC.some((r) => r.test(pathname))) return NextResponse.next();
  if (await readSession(req.cookies.get(COOKIE)?.value)) return NextResponse.next();
  if (pathname.startsWith("/api/")) return NextResponse.json({ error: "não autenticado" }, { status: 401 });
  const url = req.nextUrl.clone();
  url.pathname = "/login";
  url.search = pathname === "/" ? "" : `?next=${encodeURIComponent(pathname)}`;
  return NextResponse.redirect(url);
}

// Upload routes (and public webhooks) stay out of the middleware: Next's Node middleware can break large
// request bodies. They check the login themselves with guardRoute().
export const config = {
  runtime: "nodejs",
  matcher: ["/((?!_next/|favicon.ico|api/creatives/library|api/supplier|api/esteira|api/webhooks/).*)"],
};
