import { NextResponse } from "next/server";
import { COOKIE, authConfigured, checkCredentials, createSession } from "@/lib/auth";

export async function POST(req: Request) {
  if (!authConfigured()) {
    return NextResponse.json(
      { error: "Login não configurado: defina APP_USERS ou APP_PASSWORD nas variáveis do servidor." },
      { status: 503 },
    );
  }
  const { user = "", password = "" } = (await req.json()) as { user?: string; password?: string };
  const who = checkCredentials(user, password);
  if (!who) {
    await new Promise((r) => setTimeout(r, 600)); // slow down guessing
    return NextResponse.json({ error: "Usuário ou senha inválidos" }, { status: 401 });
  }
  const s = await createSession(who);
  const res = NextResponse.json({ ok: true });
  res.cookies.set(COOKIE, s.value, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: s.maxAge,
  });
  return res;
}
