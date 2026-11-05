import { platformFromUtm } from "../registry";
import type { Credentials, DateRange, SpendRow, TestResult } from "../types";
import { http, num } from "./http";

const BASE = "https://api.redtrack.io";

type Row = Record<string, unknown> & { date?: string; source?: string; source_title?: string };

/**
 * RedTrack returns many counters (conversions, total_purchases, convtype1…40).
 * Accounts that track the Shopify "Purchase" event fill total_purchases and
 * leave the generic `conversions` at 0, so for each metric we use the first
 * field, in priority order, that has a value anywhere in the response.
 */
const COST = ["cost", "total_cost", "spend"];
const CONVERSIONS = ["total_purchases", "purchases", "total_orders", "transactions", "total_conversions", "conversions", "approved"];
const REVENUE = ["total_revenue", "revenue", "total_orders_revenue", "pub_revenue"];

function chooseKey(rows: Row[], keys: string[]): string | undefined {
  return (
    keys.find((k) => rows.some((r) => num(r[k]) > 0)) ?? keys.find((k) => rows.some((r) => r[k] !== undefined))
  );
}

/** Which RedTrack field fed each metric in the last report (shown on the Conferência page). */
export let lastMapping: { conversions?: string; revenue?: string; cost?: string } = {};

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
  return Array.isArray(res) ? res : (res.items ?? res.data ?? []);
}

/** Cost/revenue per day and traffic source as seen by RedTrack. */
export async function fetchSpend(c: Credentials, range: DateRange): Promise<SpendRow[]> {
  const rows = await report(c, range, "date,source");
  const k = {
    cost: chooseKey(rows, COST),
    revenue: chooseKey(rows, REVENUE),
    conversions: chooseKey(rows, CONVERSIONS),
  };
  if (rows.length) lastMapping = k;
  const get = (r: Row, key?: string) => (key ? num(r[key]) : 0);
  return rows.map((r) => ({
    date: (r.date ?? range.from).slice(0, 10),
    platform: platformFromUtm(r.source_title ?? r.source),
    spend: get(r, k.cost),
    revenue: get(r, k.revenue),
    clicks: num(r.clicks),
    conversions: get(r, k.conversions),
    impressions: num(r.impressions),
  }));
}

export type RtCampaign = {
  id: string;
  name: string;
  source: string;
  spend: number;
  clicks: number;
  conversions: number;
  revenue: number;
  ic: number | null;
};

const NAME = ["campaign_title", "campaign_name", "campaign", "title", "name"];

/** Cost, clicks, purchases, revenue and (optionally) InitiateCheckout per RedTrack campaign. */
export async function fetchCampaigns(c: Credentials, range: DateRange, icField?: string): Promise<RtCampaign[]> {
  const rows = await report(c, range, "campaign");
  const k = {
    cost: chooseKey(rows, COST),
    revenue: chooseKey(rows, REVENUE),
    conversions: chooseKey(rows, CONVERSIONS),
  };
  const nameKey = NAME.find((n) => rows.some((r) => typeof r[n] === "string" && r[n]));
  return rows.map((r) => ({
    id: String(r.campaign_id ?? r.id ?? r[nameKey ?? "campaign"] ?? ""),
    name: String((nameKey && r[nameKey]) || r.campaign_id || "(sem nome)"),
    source: String(r.source_title ?? r.source ?? ""),
    spend: k.cost ? num(r[k.cost]) : 0,
    clicks: num(r.clicks),
    conversions: k.conversions ? num(r[k.conversions]) : 0,
    revenue: k.revenue ? num(r[k.revenue]) : 0,
    ic: icField ? num(r[icField]) : null,
  }));
}
