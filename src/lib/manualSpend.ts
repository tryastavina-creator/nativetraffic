import "server-only";
import { readDoc, writeDoc } from "./store";
import type { DateRange, SpendRow } from "./types";

/**
 * Traffic spend typed by hand, per source, for days the APIs don't cover (a source without API, an account that was
 * lost, a correction). An entry covers one day or a period; a period's amount is spread evenly over its days.
 *  - "add": summed to what the APIs returned.
 *  - "replace": that source's API spend on those days is dropped and the typed amount is used instead.
 */
export type ManualSpend = {
  id: string;
  from: string;
  to: string;
  platform: string;
  amount: number;
  mode: "add" | "replace";
  note?: string;
  createdAt: string;
};

const DOC = "manual_spend";
const DAY = 86400_000;
const days = (from: string, to: string) => Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / DAY) + 1;
const isDate = (d: unknown): d is string => typeof d === "string" && /^\d{4}-\d{2}-\d{2}$/.test(d);

export const listManualSpend = () => readDoc<ManualSpend[]>(DOC, []);

export async function addManualSpend(input: Partial<ManualSpend>): Promise<ManualSpend> {
  const from = input.from;
  const to = input.to || input.from;
  if (!isDate(from) || !isDate(to) || to < from) throw new Error("Datas inválidas (use o formato do calendário).");
  if (days(from, to) > 366) throw new Error("Período maior que 1 ano.");
  const amount = Math.round(Number(input.amount) * 100) / 100;
  if (!Number.isFinite(amount) || amount <= 0) throw new Error("Valor precisa ser maior que zero.");
  const platform = String(input.platform ?? "").trim().toLowerCase();
  if (!/^[a-z0-9_-]{2,30}$/.test(platform)) throw new Error("Escolha a fonte.");
  const entry: ManualSpend = {
    id: `m${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`,
    from,
    to,
    platform,
    amount,
    mode: input.mode === "replace" ? "replace" : "add",
    note: String(input.note ?? "").trim().slice(0, 120) || undefined,
    createdAt: new Date().toISOString(),
  };
  const list = await listManualSpend();
  await writeDoc(DOC, [entry, ...list]);
  return entry;
}

export async function deleteManualSpend(id: string) {
  const list = await listManualSpend();
  await writeDoc(
    DOC,
    list.filter((e) => e.id !== id),
  );
}

/** Applies the typed entries to the API spend rows of the range. */
export function applyManualSpend(spend: SpendRow[], entries: ManualSpend[], range: DateRange): SpendRow[] {
  if (!entries.length) return spend;
  let out = spend;
  const manual: SpendRow[] = [];
  for (const e of entries) {
    const n = days(e.from, e.to);
    const perDay = e.amount / n;
    for (let i = 0; i < n; i++) {
      const date = new Date(Date.parse(`${e.from}T00:00:00Z`) + i * DAY).toISOString().slice(0, 10);
      if (date < range.from || date > range.to) continue;
      if (e.mode === "replace") out = out.filter((r) => !(r.platform === e.platform && r.date === date));
      manual.push({ date, platform: e.platform, spend: Math.round(perDay * 100) / 100, clicks: 0, account: "Lançado à mão" });
    }
  }
  return [...out, ...manual];
}
