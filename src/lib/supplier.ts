/**
 * Turns a supplier export (Wiio OrderList .xls/.csv) into:
 *  - the exact cost of every order in the file (product + shipping), and
 *  - a cost table (cost per product, shipping for the first and each extra
 *    item) that prices new orders until the next export arrives.
 */
import type { Settings, SupplierCost, SupplierModel } from "./store";
import { readCsv, readXls } from "./xls";

type Cell = string | number | boolean | null;

const num = (v: Cell | undefined) => {
  if (typeof v === "number") return v;
  const n = parseFloat(String(v ?? "").replace(/[^\d.,-]/g, "").replace(",", "."));
  return Number.isFinite(n) ? n : 0;
};
const round2 = (n: number) => Math.round(n * 100) / 100;

/** "PrevenMD™ OmniPro - Rechargeable" → "PrevenMD™ OmniPro" (Shopify product title). */
export const baseProduct = (name: string) => name.split(" - ")[0].trim();

/** "2026/11/05", "11/05/2026", "2026-11-05 10:22" → "2026-11-05" (undefined when unreadable). */
export function normDate(d?: string): string | undefined {
  if (!d) return undefined;
  const t = d.trim().replace(/\//g, "-");
  const y = /^(\d{4})-(\d{1,2})-(\d{1,2})/.exec(t);
  if (y) return `${y[1]}-${y[2].padStart(2, "0")}-${y[3].padStart(2, "0")}`;
  const m = /^(\d{1,2})-(\d{1,2})-(\d{4})/.exec(t);
  if (m) {
    // Wiio exports month first (US); fall back to day first when the first number can't be a month.
    const [a, b] = [Number(m[1]), Number(m[2])];
    const [mm, dd] = a > 12 ? [b, a] : [a, b];
    return `${m[3]}-${String(mm).padStart(2, "0")}-${String(dd).padStart(2, "0")}`;
  }
  return undefined;
}

/** Most frequent value, with weights (recent orders count more). */
function wmode(xs: { v: number; w: number }[]): number | undefined {
  const count = new Map<number, number>();
  for (const x of xs) count.set(round2(x.v), (count.get(round2(x.v)) ?? 0) + x.w);
  return [...count.entries()].sort((a, b) => b[1] - a[1] || a[0] - b[0])[0]?.[0];
}

function mode(xs: number[]): number | undefined {
  const count = new Map<number, number>();
  for (const x of xs) count.set(round2(x), (count.get(round2(x)) ?? 0) + 1);
  return [...count.entries()].sort((a, b) => b[1] - a[1] || a[0] - b[0])[0]?.[0];
}

// Whole-header matches only: a loose "custo" would also match "Customer Name".
const COLS: Record<string, RegExp> = {
  order: /^(order\s*(number|no\.?|id)|pedido|n[uú]mero do pedido)$/i,
  time: /^(order\s*time|order\s*date|date|data|data do pedido)$/i,
  product: /^(product|product\s*name|produto|nome do produto)$/i,
  price: /^(price|product\s*cost|custo|custo do produto|pre[cç]o)$/i,
  shipping: /^(decimal|shipping|shipping\s*fee|shipping\s*cost|freight|frete)$/i,
  total: /^(final\s*price|amount|total)$/i,
};

export type SupplierParse = {
  orders: Record<string, SupplierCost>;
  table: Pick<Settings, "productCosts" | "shippingFirstItem" | "shippingExtraItem">;
  rows: number;
  unresolved: string[];
};

export function parseSupplierFile(buf: Buffer, filename: string): SupplierParse {
  const rows: Cell[][] = /\.csv$/i.test(filename) ? readCsv(buf.toString("utf8").replace(/^﻿/, "")) : readXls(buf);

  // Header row = first row that has an order-number column.
  const h = rows.findIndex((r) => r?.some((c) => typeof c === "string" && COLS.order.test(c.trim())));
  if (h < 0) throw new Error('Não encontrei a coluna "Order Number" na planilha.');
  const header = rows[h].map((c) => String(c ?? "").trim());
  const col: Record<string, number> = {};
  for (const [key, re] of Object.entries(COLS)) {
    // Prefer an exact "Final Price" over "Amount" for the total.
    const idx = key === "total" ? [header.findIndex((x) => /^final\s*price$/i.test(x)), header.findIndex((x) => re.test(x))].find((i) => i >= 0) : header.findIndex((x) => re.test(x));
    if (idx !== undefined && idx >= 0) col[key] = idx;
  }
  for (const need of ["order", "product", "price"]) {
    if (col[need] === undefined) throw new Error(`Coluna obrigatória não encontrada: ${need}`);
  }

  // One row per line item; order-level money repeats on each line.
  const byOrder = new Map<string, { items: string[]; price: number; shipping: number; total: number; date?: string }>();
  let lines = 0;
  for (const r of rows.slice(h + 1)) {
    const order = String(r?.[col.order] ?? "").trim();
    if (!order) continue;
    lines++;
    const name = order.startsWith("#") ? order : `#${order}`;
    const o = byOrder.get(name) ?? {
      items: [],
      price: num(r[col.price]),
      shipping: col.shipping !== undefined ? num(r[col.shipping]) : 0,
      total: col.total !== undefined ? num(r[col.total]) : 0,
      date: col.time !== undefined ? String(r[col.time] ?? "") : undefined,
    };
    o.items.push(baseProduct(String(r[col.product] ?? "")));
    byOrder.set(name, o);
  }
  if (!byOrder.size) throw new Error("A planilha não tem pedidos.");

  const orders: Record<string, SupplierCost> = {};
  for (const [name, o] of byOrder) {
    const total = o.total || o.price + o.shipping;
    orders[name] = { product: round2(o.price), shipping: round2(total - o.price), total: round2(total), date: normDate(o.date), items: o.items };
  }

  // ---- derive the cost table ----
  const costs: Record<string, number> = {};
  const singles = [...byOrder.values()].filter((o) => o.items.length === 1);
  for (const p of new Set(singles.map((o) => o.items[0]))) {
    const v = mode(singles.filter((o) => o.items[0] === p).map((o) => o.price));
    if (v !== undefined) costs[p] = v;
  }
  // Products never bought alone: subtract the known items from multi-item orders.
  for (let pass = 0; pass < 3; pass++) {
    const guesses = new Map<string, number[]>();
    for (const o of byOrder.values()) {
      const unknown = o.items.filter((p) => costs[p] === undefined);
      if (o.items.length > 1 && new Set(unknown).size === 1) {
        const known = o.items.filter((p) => costs[p] !== undefined).reduce((a, p) => a + costs[p], 0);
        const p = unknown[0];
        guesses.set(p, [...(guesses.get(p) ?? []), (o.price - known) / unknown.length]);
      }
    }
    for (const [p, xs] of guesses) {
      const v = mode(xs);
      if (v !== undefined && v >= 0) costs[p] = v;
    }
  }
  const all = [...byOrder.values()];
  const first = mode(singles.map((o) => o.shipping)) ?? mode(all.map((o) => o.shipping / o.items.length)) ?? 0;
  const extra = mode(all.filter((o) => o.items.length > 1).map((o) => (o.shipping - first) / (o.items.length - 1)));
  const unresolved = [...new Set(all.flatMap((o) => o.items))].filter((p) => costs[p] === undefined);

  return {
    orders,
    table: { productCosts: costs, shippingFirstItem: first, shippingExtraItem: extra ?? 0 },
    rows: lines,
    unresolved,
  };
}

/**
 * Learns the cost table from every order stored so far (all uploads), giving the last 30 days 3× the weight
 * and 31–60 days 2×, so prices that changed recently win, but one odd file doesn't throw the table off.
 */
export function learnCosts(all: Record<string, SupplierCost>, today = new Date()): { table: SupplierParse["table"]; model: SupplierModel } | null {
  const todayStr = today.toISOString().slice(0, 10);
  // Older uploads stored dates like "2026-11-6 ": normalize; dates in the future are typos → unknown.
  const dateOf = (o: SupplierCost) => {
    const d = normDate(o.date);
    return d && d <= todayStr ? d : undefined;
  };
  const day = (d?: string) => (d ? Math.floor((today.getTime() - Date.parse(`${d}T00:00:00Z`)) / 86400_000) : undefined);
  const list = Object.values(all)
    .filter((o) => o.items?.length && o.total > 0)
    .map((o) => {
      const age = day(dateOf(o));
      // Unknown date: normal weight; recent orders weigh more; very old ones drop out.
      return { ...o, items: o.items!, w: age === undefined ? 1 : age <= 30 ? 3 : age <= 60 ? 2 : age <= 180 ? 1 : 0 };
    })
    .filter((o) => o.w > 0);
  if (!list.length) return null;

  const costs: Record<string, number> = {};
  const singles = list.filter((o) => o.items.length === 1);
  for (const p of new Set(singles.map((o) => o.items[0]))) {
    const v = wmode(singles.filter((o) => o.items[0] === p).map((o) => ({ v: o.product, w: o.w })));
    if (v !== undefined) costs[p] = v;
  }
  for (let pass = 0; pass < 3; pass++) {
    const guesses = new Map<string, { v: number; w: number }[]>();
    for (const o of list) {
      const unknown = o.items.filter((p) => costs[p] === undefined);
      if (o.items.length > 1 && new Set(unknown).size === 1) {
        const known = o.items.filter((p) => costs[p] !== undefined).reduce((a, p) => a + costs[p], 0);
        guesses.set(unknown[0], [...(guesses.get(unknown[0]) ?? []), { v: (o.product - known) / unknown.length, w: o.w }]);
      }
    }
    for (const [p, xs] of guesses) {
      const v = wmode(xs);
      if (v !== undefined && v >= 0) costs[p] = v;
    }
  }
  const first = wmode(singles.map((o) => ({ v: o.shipping, w: o.w }))) ?? wmode(list.map((o) => ({ v: o.shipping / o.items.length, w: o.w }))) ?? 0;
  const extra = wmode(list.filter((o) => o.items.length > 1).map((o) => ({ v: (o.shipping - first) / (o.items.length - 1), w: o.w })));

  const W = list.reduce((a, o) => a + o.w, 0);
  const wavg = (f: (o: (typeof list)[number]) => number) => round2(list.reduce((a, o) => a + f(o) * o.w, 0) / W);
  const units = list.reduce((a, o) => a + o.items.length * o.w, 0);
  const dates = Object.values(all)
    .map(dateOf)
    .filter(Boolean)
    .sort() as string[];
  return {
    table: { productCosts: costs, shippingFirstItem: first, shippingExtraItem: extra ?? 0 },
    model: {
      updatedAt: new Date().toISOString(),
      orders: list.length,
      coveredFrom: dates[0],
      coveredTo: dates[dates.length - 1],
      avgProductPerOrder: wavg((o) => o.product),
      avgShippingPerOrder: wavg((o) => o.shipping),
      avgTotalPerOrder: wavg((o) => o.total),
      avgProductPerUnit: round2(list.reduce((a, o) => a + o.product * o.w, 0) / units),
      avgUnitsPerOrder: round2(units / W),
    },
  };
}
