import "server-only";
import { createHash } from "node:crypto";

/**
 * In-memory stale-while-revalidate cache for external API calls.
 *  - Fresh (age < ttl): returned as is.
 *  - Stale (age < maxStale): returned immediately; a refresh runs in the background.
 *  - On error (e.g. RedTrack 429), the last good value is served instead of failing.
 * Concurrent calls for the same key share one request.
 */
type Entry<T> = { value: T; at: number };

const store = new Map<string, Entry<unknown>>();
const inflight = new Map<string, Promise<unknown>>();

export const hashKey = (...parts: unknown[]) =>
  createHash("sha1").update(JSON.stringify(parts)).digest("hex").slice(0, 24);

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const isRateLimit = (e: unknown) => /\b429\b|too many requests/i.test(String((e as Error)?.message ?? e));

/** Retries rate-limited calls with backoff (1.5s, 4s). */
async function withRetry<T>(fn: () => Promise<T>): Promise<T> {
  for (let attempt = 0; ; attempt++) {
    try {
      return await fn();
    } catch (e) {
      if (!isRateLimit(e) || attempt >= 2) throw e;
      await sleep(attempt === 0 ? 1500 : 4000);
    }
  }
}

function refresh<T>(key: string, fn: () => Promise<T>): Promise<T> {
  const running = inflight.get(key) as Promise<T> | undefined;
  if (running) return running;
  const p = withRetry(fn)
    .then((value) => {
      store.set(key, { value, at: Date.now() });
      return value;
    })
    .finally(() => inflight.delete(key));
  inflight.set(key, p);
  return p;
}

export type Cached<T> = { value: T; at: number; stale: boolean };

/** "Atualizar" button: everything cached before this moment is fetched again (old value kept only as fallback). */
let bustAt = 0;
export function bustCache() {
  bustAt = Date.now();
  inflight.clear();
}

export async function cached<T>(
  key: string,
  fn: () => Promise<T>,
  { ttl = 5 * 60_000, maxStale = 6 * 60 * 60_000 } = {},
): Promise<Cached<T>> {
  const hit = store.get(key) as Entry<T> | undefined;
  const age = hit && hit.at >= bustAt ? Date.now() - hit.at : Infinity;
  if (hit && age < ttl) return { value: hit.value, at: hit.at, stale: false };
  if (hit && age < maxStale) {
    refresh(key, fn).catch(() => {}); // background refresh; keep serving the last value
    return { value: hit.value, at: hit.at, stale: true };
  }
  try {
    const value = await refresh(key, fn);
    return { value, at: Date.now(), stale: false };
  } catch (e) {
    if (hit) return { value: hit.value, at: hit.at, stale: true };
    throw e;
  }
}

/** Short, human message for an API error (never the raw response body). */
export function friendlyError(source: string, e: unknown): string {
  const msg = String((e as Error)?.message ?? e);
  // Messages written for the user by a connector go through as they are.
  if ((e as { friendly?: boolean })?.friendly) return `${source}: ${msg}`;
  if (isRateLimit(msg)) return `${source}: limite de consultas atingido, atualizando em instantes.`;
  if (/\b401\b|\b403\b|invalid_client|unauthorized|forbidden/i.test(msg)) {
    return `${source}: acesso recusado. Confira a conexão em Integrações.`;
  }
  if (/\b5\d\d\b|fetch failed|ECONN|ETIMEDOUT|timeout/i.test(msg)) return `${source}: fora do ar no momento, tentando de novo.`;
  // Messages we wrote ourselves (no HTTP status, no JSON) are safe to show.
  if (!/^\d{3}\b|[{}<]/.test(msg) && msg.length < 200) return `${source}: ${msg}`;
  return `${source}: não foi possível atualizar agora.`;
}
