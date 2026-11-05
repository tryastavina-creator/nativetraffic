import { NextResponse } from "next/server";
import { SHOPIFY_SCOPES, STATE_COOKIE, isValidShop, newState, normalizeShop, redirectUri } from "@/lib/shopifyOAuth";
import { getConnection } from "@/lib/store";

export const dynamic = "force-dynamic";

/** Starts the install: redirects the logged-in user to Shopify's approval screen. */
export async function GET(req: Request) {
  const conn = await getConnection("shopify");
  const c = conn?.credentials;
  if (!c?.shop || !c.clientId || !c.clientSecret) {
    return NextResponse.redirect(new URL("/integrations?shopify=missing", req.url));
  }
  const shop = normalizeShop(c.shop);
  if (!isValidShop(shop)) return NextResponse.redirect(new URL("/integrations?shopify=badshop", req.url));

  const state = newState();
  const url = new URL(`https://${shop}/admin/oauth/authorize`);
  url.searchParams.set("client_id", c.clientId);
  url.searchParams.set("scope", SHOPIFY_SCOPES);
  url.searchParams.set("redirect_uri", redirectUri(req));
  url.searchParams.set("state", state);

  const res = NextResponse.redirect(url);
  res.cookies.set(STATE_COOKIE, state, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/api/shopify",
    maxAge: 600,
  });
  return res;
}
