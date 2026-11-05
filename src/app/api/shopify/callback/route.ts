import { NextResponse } from "next/server";
import { testConnection } from "@/lib/connectors";
import {
  STATE_COOKIE,
  type TokenResponse,
  isValidShop,
  normalizeShop,
  verifyCallbackHmac,
} from "@/lib/shopifyOAuth";
import { getConnection, saveConnection } from "@/lib/store";

export const dynamic = "force-dynamic";

function back(req: Request, status: string, detail?: string) {
  const u = new URL("/integrations", req.url);
  u.searchParams.set("shopify", status);
  if (detail) u.searchParams.set("detail", detail.slice(0, 300));
  const res = NextResponse.redirect(u);
  res.cookies.delete(STATE_COOKIE);
  return res;
}

/** Shopify redirects here after the merchant approves the app. */
export async function GET(req: Request) {
  const params = new URL(req.url).searchParams;
  const conn = await getConnection("shopify");
  const c = conn?.credentials;
  if (!conn || !c?.clientId || !c.clientSecret) return back(req, "missing");

  const cookieState = req.headers
    .get("cookie")
    ?.split(/;\s*/)
    .find((p) => p.startsWith(`${STATE_COOKIE}=`))
    ?.split("=")[1];
  if (!cookieState || cookieState !== params.get("state")) return back(req, "error", "state inválido, tente de novo");
  if (!verifyCallbackHmac(params, c.clientSecret)) return back(req, "error", "assinatura da Shopify inválida");

  const shop = normalizeShop(params.get("shop") ?? "");
  if (!isValidShop(shop) || shop !== normalizeShop(c.shop)) return back(req, "error", `loja diferente da configurada (${shop})`);

  const code = params.get("code");
  if (!code) return back(req, "error", "Shopify não enviou o código de autorização");

  let r: Response;
  let text: string;
  try {
    r = await fetch(`https://${shop}/admin/oauth/access_token`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify({ client_id: c.clientId, client_secret: c.clientSecret, code }),
      cache: "no-store",
    });
    text = await r.text();
  } catch (e) {
    return back(req, "error", `não foi possível falar com a Shopify (${(e as Error).message})`);
  }
  if (!r.ok) return back(req, "error", `${r.status}: ${text.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ")}`);
  const tok = JSON.parse(text) as TokenResponse;

  conn.credentials = {
    ...c,
    shop,
    accessToken: tok.access_token,
    refreshToken: tok.refresh_token ?? "",
    tokenExpiresAt: tok.expires_in ? String(Date.now() + tok.expires_in * 1000) : "",
  };
  const result = await testConnection(conn);
  Object.assign(conn, { lastTestAt: new Date().toISOString(), lastTestOk: result.ok, lastTestMessage: result.message });
  await saveConnection(conn);
  return back(req, result.ok ? "ok" : "error", result.ok ? undefined : result.message);
}
