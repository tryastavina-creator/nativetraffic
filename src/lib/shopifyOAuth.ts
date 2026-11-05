import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";

/**
 * Authorization-code install flow. Works for any store the user administers,
 * unlike the client-credentials grant, which Shopify only allows when the app
 * and the store belong to the same organization (otherwise: shop_not_permitted).
 */
export const SHOPIFY_SCOPES = "read_orders,read_products,read_inventory,read_reports";
export const STATE_COOKIE = "nt_shopify_state";

export function normalizeShop(shop: string) {
  return shop.trim().replace(/^https?:\/\//, "").replace(/\/.*$/, "").toLowerCase();
}

export function isValidShop(shop: string) {
  return /^[a-z0-9][a-z0-9-]*\.myshopify\.com$/.test(shop);
}

/** Public base URL of this deployment (Railway sits behind a proxy). */
export function baseUrl(req: Request) {
  if (process.env.APP_URL) return process.env.APP_URL.replace(/\/$/, "");
  const h = req.headers;
  const host = h.get("x-forwarded-host") ?? h.get("host") ?? new URL(req.url).host;
  const proto = h.get("x-forwarded-proto") ?? (host.startsWith("localhost") ? "http" : "https");
  return `${proto}://${host}`;
}

export const redirectUri = (req: Request) => `${baseUrl(req)}/api/shopify/callback`;

export const newState = () => randomBytes(16).toString("hex");

/** Shopify signs the callback query string with the app's client secret. */
export function verifyCallbackHmac(params: URLSearchParams, secret: string) {
  const hmac = params.get("hmac") ?? "";
  const message = [...params.entries()]
    .filter(([k]) => k !== "hmac" && k !== "signature")
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
    .map(([k, v]) => `${k}=${v}`)
    .join("&");
  const digest = createHmac("sha256", secret).update(message).digest("hex");
  return hmac.length === digest.length && timingSafeEqual(Buffer.from(hmac), Buffer.from(digest));
}

export type TokenResponse = {
  access_token: string;
  scope?: string;
  expires_in?: number;
  refresh_token?: string;
  refresh_token_expires_in?: number;
};
