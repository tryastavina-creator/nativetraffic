import "server-only";
import { promises as fs } from "node:fs";
import { redtrack } from "./connectors";
import type { RtCampaign } from "./connectors/redtrack";
import { computeMetrics } from "./metrics";
import { PLATFORM_LABEL, platformFromUtm } from "./registry";
import { getSettings, listConnections } from "./store";
import type { DateRange } from "./types";

export type TrafficRow = {
  campaign: string;
  platform: string;
  label: string;
  spend: number;
  clicks: number;
  cpc: number;
  /** InitiateCheckout from RedTrack (null when not configured). */
  ic: number | null;
  icRate: number | null;
  /** Sales confirmed in Shopify for this utm_campaign. */
  sales: number;
  /** Purchases RedTrack attributed to the campaign. */
  rtConversions: number;
  cvr: number;
  cpa: number;
  revenue: number;
  roas: number;
  profit: number;
  roi: number;
  aov: number;
  matched: boolean;
};

export type TrafficReport = {
  range: DateRange;
  currency: string;
  rows: TrafficRow[];
  totals: Omit<TrafficRow, "campaign" | "platform" | "label" | "matched">;
  hasRedtrack: boolean;
  icConfigured: boolean;
  warnings: string[];
};

const key = (s: string) => s.toLowerCase().replace(/\s+/g, " ").trim();
const div = (a: number, b: number) => (b ? a / b : 0);

async function rtCampaigns(range: DateRange, icField: string, warnings: string[]): Promise<RtCampaign[] | null> {
  if (process.env.NT_SNAPSHOT_RT_CAMPAIGNS) {
    return JSON.parse(await fs.readFile(process.env.NT_SNAPSHOT_RT_CAMPAIGNS, "utf8")) as RtCampaign[];
  }
  const rt = (await listConnections()).find((c) => c.provider === "redtrack");
  if (!rt) return null;
  try {
    return await redtrack.fetchCampaigns(rt.credentials, range, icField || undefined);
  } catch (e) {
    warnings.push(`RedTrack: ${(e as Error).message}`);
    return [];
  }
}

/**
 * Real profit per campaign: RedTrack gives spend, clicks and IC per campaign;
 * Shopify gives the sales of the same utm_campaign; Wiio/fees/refunds come
 * from the dashboard's cost model. Joined by campaign name.
 */
export async function computeTraffic(range: DateRange): Promise<TrafficReport> {
  const [m, settings] = await Promise.all([computeMetrics(range), getSettings()]);
  const warnings = [...m.warnings];
  const rts = await rtCampaigns(range, settings.redtrackIcField, warnings);
  const shop = new Map(m.campaigns.map((c) => [key(c.campaign), c]));
  const seen = new Set<string>();
  const rows: TrafficRow[] = [];

  const build = (name: string, platform: string, rt?: RtCampaign): TrafficRow => {
    const s = shop.get(key(name));
    if (s) seen.add(key(name));
    const spend = rt?.spend ?? 0;
    const clicks = rt?.clicks ?? 0;
    const sales = s?.orders ?? 0;
    const revenue = s ? s.revenue : (rt?.revenue ?? 0);
    const costs = s ? s.refunds + s.supplierCost + s.fees : 0;
    const profit = revenue - costs - spend;
    const ic = rt && rt.ic !== null ? rt.ic : null;
    return {
      campaign: name,
      platform,
      label: PLATFORM_LABEL[platform] ?? platform,
      spend,
      clicks,
      cpc: div(spend, clicks),
      ic,
      icRate: ic === null ? null : div(ic, clicks) * 100,
      sales,
      rtConversions: rt?.conversions ?? 0,
      cvr: div(sales, clicks) * 100,
      cpa: div(spend, sales),
      revenue,
      roas: div(revenue, spend),
      profit,
      roi: div(profit, spend) * 100,
      aov: div(revenue, sales),
      matched: !!s,
    };
  };

  for (const r of rts ?? []) {
    if (!r.spend && !r.clicks && !r.conversions && !shop.has(key(r.name))) continue;
    const p = platformFromUtm(r.source) !== "other" && platformFromUtm(r.source) !== "untracked" ? platformFromUtm(r.source) : platformFromUtm(r.name);
    rows.push(build(r.name, p, r));
  }
  // Shopify campaigns RedTrack didn't return (no spend found).
  for (const c of m.campaigns) {
    if (!seen.has(key(c.campaign)) && c.campaign !== "(sem campanha)") rows.push(build(c.campaign, c.platform));
  }
  rows.sort((a, b) => b.spend - a.spend || b.revenue - a.revenue);

  const t = rows.reduce(
    (a, r) => ({
      spend: a.spend + r.spend,
      clicks: a.clicks + r.clicks,
      ic: r.ic === null ? a.ic : (a.ic ?? 0) + r.ic,
      sales: a.sales + r.sales,
      rtConversions: a.rtConversions + r.rtConversions,
      revenue: a.revenue + r.revenue,
      profit: a.profit + r.profit,
    }),
    { spend: 0, clicks: 0, ic: null as number | null, sales: 0, rtConversions: 0, revenue: 0, profit: 0 },
  );

  return {
    range,
    currency: m.currency,
    rows,
    totals: {
      ...t,
      cpc: div(t.spend, t.clicks),
      icRate: t.ic === null ? null : div(t.ic, t.clicks) * 100,
      cvr: div(t.sales, t.clicks) * 100,
      cpa: div(t.spend, t.sales),
      roas: div(t.revenue, t.spend),
      roi: div(t.profit, t.spend) * 100,
      aov: div(t.revenue, t.sales),
    },
    hasRedtrack: rts !== null,
    icConfigured: !!settings.redtrackIcField,
    warnings,
  };
}
