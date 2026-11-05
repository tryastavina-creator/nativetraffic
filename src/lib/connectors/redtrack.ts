import { platformFromUtm } from "../registry";
import type { Credentials, DateRange, SpendRow, TestResult } from "../types";
import { http, num } from "./http";

const BASE = "https://api.redtrack.io";

type Row = {
  date?: string;
  source?: string;
  source_title?: string;
  cost?: number | string;
  revenue?: number | string;
  clicks?: number | string;
  conversions?: number | string;
  impressions?: number | string;
};

export async function test(c: Credentials): Promise<TestResult> {
  const today = new Date().toISOString().slice(0, 10);
  await report(c, { from: today, to: today }, "date");
  return { ok: true, message: "API key válida" };
}

async function report(c: Credentials, range: DateRange, group: string): Promise<Row[]> {
  const qs = new URLSearchParams({
    api_key: c.apiKey,
    date_from: range.from,
    date_to: range.to,
    group,
    per: "1000",
  });
  const res = await http<Row[] | { items?: Row[] }>(`${BASE}/report?${qs}`);
  return Array.isArray(res) ? res : (res.items ?? []);
}

/** Cost/revenue per day and traffic source as seen by RedTrack. */
export async function fetchSpend(c: Credentials, range: DateRange): Promise<SpendRow[]> {
  const rows = await report(c, range, "date,source");
  return rows.map((r) => ({
    date: (r.date ?? range.from).slice(0, 10),
    platform: platformFromUtm(r.source_title ?? r.source),
    spend: num(r.cost),
    revenue: num(r.revenue),
    clicks: num(r.clicks),
    conversions: num(r.conversions),
    impressions: num(r.impressions),
  }));
}
