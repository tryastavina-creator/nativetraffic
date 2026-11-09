import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { COOKIE, authRequired, readSession } from "@/lib/auth";

export const dynamic = "force-dynamic";

/** Who is logged in (for the sidebar). In local dev without users configured, there is no login. */
export async function GET() {
  const user = await readSession((await cookies()).get(COOKIE)?.value);
  if (user) return NextResponse.json({ user });
  if (!authRequired()) return NextResponse.json({ user: "local" });
  return NextResponse.json({ error: "não autenticado" }, { status: 401 });
}
