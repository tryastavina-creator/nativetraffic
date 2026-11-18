import "server-only";
import type { Creative } from "./connectors/taboolaCreatives";
import { readDoc, writeDoc } from "./store";
import type { DateRange, SpendRow } from "./types";

/**
 * Spend history per account, kept in the database so the month's numbers stay right after an account is
 * disconnected, banned or loses API access. Every successful read of a source writes its days here; reports
 * fall back to these days whenever the source can't be read anymore.
 *  - history_spend: account → day → spend, clicks, impressions, conversions.
 *  - history_creatives: account → day → ad → the same numbers (plus each ad's title, image, campaign).
 */

type Nums = [spend: number, clicks: number, impressions: number, conversions: number];
type Account = { provider: string; label: string; updatedAt: string };
export type SpendBook = Record<string, Account & { days: Record<string, Nums> }>;
type Meta = Omit<Creative, "spend" | "clicks" | "impressions" | "conversions" | "ctr">;
export type CreativeBook = Record<string, Account & { backfilled?: boolean; ads: Record<string, Meta>; days: Record<string, Record<string, Nums>> }>;

const SPEND = "history_spend";
const CREATIVES = "history_creatives";
const r2 = (n: number) => Math.round(n * 100) / 100;

// One write at a time per process (several reports can finish together).
let chain: Promise<unknown> = Promise.resolve();
function serial<T>(fn: () => Promise<T>): Promise<T> {
  const p = chain.then(fn, fn);
  chain = p.catch(() => {});
  return p;
}

export const readSpendBook = () => readDoc<SpendBook>(SPEND, {});
export const readCreativeBook = () => readDoc<CreativeBook>(CREATIVES, {});

type Acc = { id: string; provider: string; label?: string };

/** Store the days a source just returned for one account (each day is replaced by the newer read). */
export function recordSpend(acc: Acc, rows: SpendRow[], range: DateRange) {
  return serial(async () => {
    const book = await readSpendBook();
    const cur = book[acc.id] ?? { provider: acc.provider, label: acc.label ?? acc.provider, updatedAt: "", days: {} };
    const days: Record<string, Nums> = {};
    for (const r of rows) {
      const d = (days[r.date] ??= [0, 0, 0, 0]);
      d[0] += r.spend;
      d[1] += r.clicks ?? 0;
      d[2] += r.impressions ?? 0;
      d[3] += r.conversions ?? 0;
    }
    // Days in the range with no row had no spend.
    for (let t = Date.parse(range.from); t <= Date.parse(range.to); t += 86400_000) {
      const d = new Date(t).toISOString().slice(0, 10);
      days[d] ??= [0, 0, 0, 0];
    }
    let changed = !book[acc.id] || cur.label !== (acc.label ?? cur.label);
    for (const [d, n] of Object.entries(days)) {
      const v = n.map(r2) as Nums;
      if (JSON.stringify(cur.days[d]) !== JSON.stringify(v)) {
        cur.days[d] = v;
        changed = true;
      }
    }
    if (!changed) return;
    book[acc.id] = { ...cur, label: acc.label ?? cur.label, updatedAt: new Date().toISOString() };
    await writeDoc(SPEND, book);
  });
}

/** Spend rows from the history for the given accounts and range. */
export function spendFromBook(book: SpendBook, ids: string[], range: DateRange, archived: boolean): SpendRow[] {
  const out: SpendRow[] = [];
  for (const id of ids) {
    const a = book[id];
    if (!a) continue;
    for (const [date, [spend, clicks, impressions, conversions]] of Object.entries(a.days)) {
      if (date < range.from || date > range.to || !(spend || clicks)) continue;
      out.push({ date, platform: a.provider, spend, clicks, impressions, conversions, account: a.label, archived });
    }
  }
  return out;
}

/** Move an account's history to a new id (used when it is archived). */
export function renameHistory(from: string, to: string) {
  if (from === to) return Promise.resolve();
  return serial(async () => {
    for (const key of [SPEND, CREATIVES] as const) {
      const book = await readDoc<Record<string, unknown>>(key, {});
      if (!book[from]) continue;
      book[to] = book[from];
      delete book[from];
      await writeDoc(key, book);
    }
  });
}

/** Store one day of ads for one account. */
export function recordCreativesDay(acc: Acc, date: string, list: Creative[], opts: { backfilled?: boolean } = {}) {
  return serial(async () => {
    const book = await readCreativeBook();
    const cur = book[acc.id] ?? { provider: acc.provider, label: acc.label ?? acc.provider, updatedAt: "", ads: {}, days: {} };
    const day: Record<string, Nums> = {};
    for (const c of list) {
      if (!(c.spend || c.clicks || c.impressions)) continue;
      const { spend, clicks, impressions, conversions, ctr: _ctr, ...meta } = c;
      void _ctr;
      cur.ads[c.itemId] = meta;
      day[c.itemId] = [r2(spend), clicks, impressions, conversions];
    }
    cur.days[date] = day;
    if (opts.backfilled) cur.backfilled = true;
    book[acc.id] = { ...cur, label: acc.label ?? cur.label, updatedAt: new Date().toISOString() };
    await writeDoc(CREATIVES, book);
  });
}

/** Ads of one account summed over the range, from the history. */
export function creativesFromBook(book: CreativeBook, id: string, range: DateRange): Creative[] {
  const a = book[id];
  if (!a) return [];
  const sum = new Map<string, Nums>();
  for (const [date, ads] of Object.entries(a.days)) {
    if (date < range.from || date > range.to) continue;
    for (const [itemId, n] of Object.entries(ads)) {
      const s = sum.get(itemId) ?? [0, 0, 0, 0];
      sum.set(itemId, s.map((v, i) => v + n[i]) as Nums);
    }
  }
  return [...sum].flatMap(([itemId, [spend, clicks, impressions, conversions]]) => {
    const m = a.ads[itemId];
    if (!m) return [];
    return [{ ...m, spend: r2(spend), clicks, impressions, conversions, ctr: impressions ? (clicks / impressions) * 100 : 0 }];
  });
}
