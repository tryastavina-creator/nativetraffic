import { platformFromUtm } from "../registry";
import type { Credentials, DateRange, SpendRow, TestResult } from "../types";
import { cached, hashKey } from "../cache";
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
export let lastMapping: { conversions?: string; revenue?: string; cost?: string; ic?: string; icAuto?: boolean } = {};

/**
 * InitiateCheckout is one of the custom conversion types (convtype1…40). RedTrack's API doesn't say
 * which, so we read it from the funnel: checkout is the step right before purchase, i.e. the custom type
 * with the smallest volume that is still above front-end purchases and below clicks.
 * An explicit field in Configurações always wins.
 */
function detectIc(rows: Row[], purchaseKey: string | undefined, override?: string): { key?: string; auto: boolean } {
  if (override) return { key: override, auto: false };
  const total = (k: string) => rows.reduce((a, r) => a + num(r[k]), 0);
  const purchases = purchaseKey ? total(purchaseKey) : 0;
  const clicks = total("clicks");
  const candidates = [...new Set(rows.flatMap((r) => Object.keys(r)))]
    .filter((k) => /^convtype\d+$/.test(k))
    .map((k) => ({ k, t: total(k) }))
    .filter((x) => x.t > purchases && (!clicks || x.t <= clicks))
    .sort((a, b) => a.t - b.t);
  return { key: candidates[0]?.k, auto: true };
}

export async function test(c: Credentials): Promise<TestResult> {
  const today = new Date().toISOString().slice(0, 10);
  await reportLive(c, { from: today, to: today }, "date");
  return { ok: true, message: "API key válida" };
}

/** Cached: RedTrack rate-limits hard (429), and the dashboard asks for the same report often. */
async function report(c: Credentials, range: DateRange, group: string): Promise<Row[]> {
  return (await cached(hashKey("rt", c.apiKey, range, group), () => reportLive(c, range, group))).value;
}

async function reportLive(c: Credentials, range: DateRange, group: string): Promise<Row[]> {
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
export async function fetchSpend(c: Credentials, range: DateRange, icField?: string): Promise<SpendRow[]> {
  const rows = await report(c, range, "date,source");
  const k = {
    cost: chooseKey(rows, COST),
    revenue: chooseKey(rows, REVENUE),
    conversions: chooseKey(rows, CONVERSIONS),
  };
  const ic = detectIc(rows, k.conversions, icField);
  if (rows.length) lastMapping = { ...k, ic: ic.key, icAuto: ic.auto };
  const get = (r: Row, key?: string) => (key ? num(r[key]) : 0);
  return rows.map((r) => ({
    date: (r.date ?? range.from).slice(0, 10),
    platform: platformFromUtm(r.source_title ?? r.source),
    spend: get(r, k.cost),
    revenue: get(r, k.revenue),
    clicks: num(r.clicks),
    conversions: get(r, k.conversions),
    impressions: num(r.impressions),
    ic: ic.key ? num(r[ic.key]) : undefined,
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
  const icKey = detectIc(rows, k.conversions, icField).key;
  return rows.map((r) => ({
    id: String(r.campaign_id ?? r.id ?? r[nameKey ?? "campaign"] ?? ""),
    name: String((nameKey && r[nameKey]) || r.campaign_id || "(sem nome)"),
    source: String(r.source_title ?? r.source ?? ""),
    spend: k.cost ? num(r[k.cost]) : 0,
    clicks: num(r.clicks),
    conversions: k.conversions ? num(r[k.conversions]) : 0,
    revenue: k.revenue ? num(r[k.revenue]) : 0,
    ic: icKey ? num(r[icKey]) : null,
  }));
}
