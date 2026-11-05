import { platformFromUtm } from "../registry";
import type { Credentials, DateRange, SpendRow, TestResult } from "../types";
import { http, num } from "./http";

const BASE = "https://api.redtrack.io";

type Row = Record<string, unknown> & { date?: string; source?: string; source_title?: string };

/** RedTrack's report field names vary by account/version; take the first one present. */
const pick = (r: Row, keys: string[]) => {
  for (const k of keys) if (r[k] !== undefined && r[k] !== null && r[k] !== "") return num(r[k]);
  return 0;
};
const COST = ["cost", "total_cost", "spend"];
const REVENUE = ["revenue", "total_revenue", "pub_revenue", "rev"];
const CONVERSIONS = ["conversions", "total_conversions", "convtype1", "conversion", "approved"];

/** Field names seen in the last RedTrack response (shown on the dashboard to verify the mapping). */
export let lastFields: string[] = [];

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
  const res = await http<Row[] | { items?: Row[]; data?: Row[] }>(`${BASE}/report?${qs}`);
  const rows = Array.isArray(res) ? res : (res.items ?? res.data ?? []);
  if (rows[0]) lastFields = Object.keys(rows[0]);
  return rows;
}

/** Cost/revenue per day and traffic source as seen by RedTrack. */
export async function fetchSpend(c: Credentials, range: DateRange): Promise<SpendRow[]> {
  const rows = await report(c, range, "date,source");
  return rows.map((r) => ({
    date: (r.date ?? range.from).slice(0, 10),
    platform: platformFromUtm(r.source_title ?? r.source),
    spend: pick(r, COST),
    revenue: pick(r, REVENUE),
    clicks: pick(r, ["clicks", "total_clicks"]),
    conversions: pick(r, CONVERSIONS),
    impressions: pick(r, ["impressions", "total_impressions"]),
  }));
}
