/**
 * Turns a supplier export (Wiio OrderList .xls/.csv) into:
 *  - the exact cost of every order in the file (product + shipping), and
 *  - a cost table (cost per product, shipping for the first and each extra
 *    item) that prices new orders until the next export arrives.
 */
import type { Settings, SupplierCost } from "./store";
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
      date: col.time !== undefined ? String(r[col.time] ?? "").slice(0, 10).replace(/\//g, "-") : undefined,
    };
    o.items.push(baseProduct(String(r[col.product] ?? "")));
    byOrder.set(name, o);
  }
  if (!byOrder.size) throw new Error("A planilha não tem pedidos.");

  const orders: Record<string, SupplierCost> = {};
  for (const [name, o] of byOrder) {
    const total = o.total || o.price + o.shipping;
    orders[name] = { product: round2(o.price), shipping: round2(total - o.price), total: round2(total), date: o.date };
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
