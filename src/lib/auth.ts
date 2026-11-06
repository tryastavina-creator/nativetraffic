/**
 * Tiny session auth that works in both the Edge middleware and Node routes.
 * Users come from env:
 *   APP_USERS="ana@x.com:senha1,joao@x.com:senha2"   (one login per person)
 *   APP_PASSWORD="senha"                              (or one shared password)
 * Cookie = base64url(user|expiresAt) + "." + HMAC-SHA256(AUTH_SECRET).
 */
export const COOKIE = "nt_session";
const MAX_AGE = 60 * 60 * 24 * 14; // 14 days

const enc = new TextEncoder();
const b64url = (buf: ArrayBuffer | Uint8Array) =>
  btoa(String.fromCharCode(...new Uint8Array(buf))).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
const fromB64url = (s: string) => atob(s.replace(/-/g, "+").replace(/_/g, "/"));

function secret() {
  return process.env.AUTH_SECRET || process.env.ENCRYPTION_KEY || "dev-only-auth-secret";
}

async function hmac(data: string) {
  const key = await crypto.subtle.importKey("raw", enc.encode(secret()), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  return b64url(await crypto.subtle.sign("HMAC", key, enc.encode(data)));
}

export function authConfigured() {
  return Boolean(process.env.APP_USERS || process.env.APP_PASSWORD);
}

/** In local dev with no users configured, the app stays open. */
export function authRequired() {
  return authConfigured() || process.env.NODE_ENV === "production";
}

function safeEqual(a: string, b: string) {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

export function checkCredentials(user: string, password: string): string | null {
  const list = (process.env.APP_USERS ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean)
    .map((s) => {
      const i = s.indexOf(":");
      return { user: s.slice(0, i).trim().toLowerCase(), pass: s.slice(i + 1) };
    });
  const u = user.trim().toLowerCase();
  for (const entry of list) {
    if (safeEqual(entry.user, u) && safeEqual(entry.pass, password)) return entry.user;
  }
  const shared = process.env.APP_PASSWORD;
  if (shared && safeEqual(shared, password)) return u || "admin";
  return null;
}

export async function createSession(user: string) {
  const payload = b64url(enc.encode(`${user}|${Date.now() + MAX_AGE * 1000}`));
  return { value: `${payload}.${await hmac(payload)}`, maxAge: MAX_AGE };
}

export async function readSession(token?: string): Promise<string | null> {
  if (!token) return null;
  const [payload, sig] = token.split(".");
  if (!payload || !sig || !safeEqual(sig, await hmac(payload))) return null;
  const [user, exp] = fromB64url(payload).split("|");
  return Number(exp) > Date.now() ? user : null;
}

/**
 * Login check for the few API routes that run outside the middleware (large uploads: Next's Node middleware
 * can break request bodies bigger than a few hundred KB). Returns a 401 response, or null when allowed.
 */
export async function guardRoute(req: Request): Promise<Response | null> {
  if (!authRequired()) return null;
  const raw = new RegExp(`(?:^|;\\s*)${COOKIE}=([^;]+)`).exec(req.headers.get("cookie") ?? "")?.[1];
  const user = await readSession(raw ? decodeURIComponent(raw) : undefined);
  return user ? null : Response.json({ error: "não autenticado" }, { status: 401 });
}
