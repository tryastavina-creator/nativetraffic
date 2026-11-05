import "server-only";
import { promises as fs } from "node:fs";
import { cached, friendlyError, hashKey } from "./cache";
import { redtrack, TRAFFIC_CONNECTORS } from "./connectors";
import type { RtCampaign } from "./connectors/redtrack";
import type { SourceCampaign } from "./connectors/traffic";
import { computeMetrics, type CampaignRow } from "./metrics";
import { PLATFORM_LABEL, platformFromUtm } from "./registry";
import { getSettings, listConnections } from "./store";
import type { DateRange } from "./types";

export type TrafficRow = {
  campaign: string;
  platform: string;
  label: string;
  /** Where the spend came from: the traffic source's own API, or RedTrack. */
  spendSource: "fonte" | "redtrack" | "";
  spend: number;
  clicks: number;
  cpc: number;
  ic: number | null;
  icRate: number | null;
  /** Front-end sales confirmed in Shopify for this campaign. */
  sales: number;
  /** Post-purchase upsells taken on those sales. */
  upsells: number;
  upsellRate: number;
  /** Purchases RedTrack recorded (one per sale + one per upsell). */
  rtConversions: number;
  rtExpected: number;
  cvr: number;
  /** Spend ÷ front-end sales. */
  cpa: number;
  revenue: number;
  upsellRevenue: number;
  roas: number;
  profit: number;
  roi: number;
  aov: number;
  matched: boolean;
  /** Clicks without any spend found: cost is missing at the source or in RedTrack. */
  missingCost: boolean;
};

export type TrafficReport = {
  range: DateRange;
  currency: string;
  rows: TrafficRow[];
  totals: Omit<TrafficRow, "campaign" | "platform" | "label" | "matched" | "spendSource" | "missingCost">;
  hasRedtrack: boolean;
  icConfigured: boolean;
  hidden: number;
  warnings: string[];
};

const div = (a: number, b: number) => (b ? a / b : 0);
const norm = (s: string) => s.toLowerCase().replace(/\s+/g, " ").trim();

/**
 * Campaigns are named "012 | Taboola | OmniPro | ADV": the leading code identifies
 * the same campaign in the source, in RedTrack and in the utm_campaign, even when
 * the rest of the name differs. Names without a code match on the full name.
 */
export function campaignKey(name: string): string {
  const m = name.match(/^\s*#?(\d{2,5})\s*[|\-–_]/);
  return m ? `code:${m[1]}` : `name:${norm(name)}`;
}

async function rtCampaigns(range: DateRange, icField: string, warnings: string[]): Promise<RtCampaign[] | null> {
  if (process.env.NT_SNAPSHOT_RT_CAMPAIGNS) {
    return JSON.parse(await fs.readFile(process.env.NT_SNAPSHOT_RT_CAMPAIGNS, "utf8")) as RtCampaign[];
  }
  const rt = (await listConnections()).find((c) => c.provider === "redtrack");
  if (!rt) return null;
  try {
    return await redtrack.fetchCampaigns(rt.credentials, range, icField || undefined);
  } catch (e) {
    warnings.push(friendlyError("RedTrack", e));
    return [];
  }
}

/** Per-campaign spend straight from every connected source account that supports it. */
async function sourceCampaigns(range: DateRange, warnings: string[]) {
  if (process.env.NT_SNAPSHOT_SOURCE_CAMPAIGNS) {
    return JSON.parse(await fs.readFile(process.env.NT_SNAPSHOT_SOURCE_CAMPAIGNS, "utf8")) as (SourceCampaign & {
      platform: string;
    })[];
  }
  const conns = (await listConnections()).filter((c) => TRAFFIC_CONNECTORS[c.provider]?.campaigns);
  const out: (SourceCampaign & { platform: string })[] = [];
  await Promise.all(
    conns.map(async (c) => {
      try {
        const list = (
          await cached(hashKey("src-campaigns", c.id, c.credentials, range), () =>
            TRAFFIC_CONNECTORS[c.provider].campaigns!(c.credentials, range),
          )
        ).value;
        out.push(...list.map((x) => ({ ...x, platform: c.provider })));
      } catch (e) {
        warnings.push(friendlyError(c.label ?? PLATFORM_LABEL[c.provider] ?? c.provider, e));
      }
    }),
  );
  return out;
}

type Bucket = {
  name: string;
  platform: string;
  src?: { spend: number; clicks: number };
  rt?: RtCampaign;
  shop?: CampaignRow;
};

export async function computeTraffic(range: DateRange): Promise<TrafficReport> {
  const [m, settings] = await Promise.all([computeMetrics(range), getSettings()]);
  const warnings = [...m.warnings];
  const [rts, srcs] = await Promise.all([rtCampaigns(range, settings.redtrackIcField, warnings), sourceCampaigns(range, warnings)]);

  // Platforms whose spend comes from their own API (RedTrack cost ignored there to avoid double counting).
  const directPlatforms = new Set(srcs.map((s) => s.platform));
  const buckets = new Map<string, Bucket>();
  const bucket = (name: string, platform: string) => {
    const k = campaignKey(name);
    const b = buckets.get(k) ?? { name, platform };
    if (!buckets.has(k)) buckets.set(k, b);
    return b;
  };

  for (const s of srcs) {
    if (!s.spend && !s.clicks) continue;
    const b = bucket(s.name, s.platform);
    b.src = { spend: (b.src?.spend ?? 0) + s.spend, clicks: (b.src?.clicks ?? 0) + s.clicks };
  }
  for (const r of rts ?? []) {
    const fromSource = platformFromUtm(r.source);
    const p = !["other", "untracked"].includes(fromSource) ? fromSource : platformFromUtm(r.name);
    const b = bucket(r.name, p);
    b.rt = r;
    b.name = r.name; // RedTrack follows the team's naming; the source may add suffixes.
    if (b.platform === "other" || b.platform === "untracked") b.platform = p;
  }
  for (const c of m.campaigns) {
    if (c.campaign === "(sem campanha)") continue;
    const b = bucket(c.campaign, c.platform);
    b.shop = c;
    // Prefer the utm_campaign as display name: it is what Shopify and the team see.
    b.name = c.campaign;
  }

  const rows: TrafficRow[] = [];
  let hidden = 0;
  for (const b of buckets.values()) {
    const direct = directPlatforms.has(b.platform);
    const spend = direct ? (b.src?.spend ?? 0) : (b.rt?.spend ?? 0);
    const clicks = b.rt?.clicks || b.src?.clicks || 0;
    const s = b.shop;
    const sales = s?.orders ?? 0;
    const upsells = s?.upsells ?? 0;
    const revenue = s?.revenue ?? 0;
    const costs = s ? s.refunds + s.supplierCost + s.fees : 0;
    const profit = revenue - costs - spend;
    const ic = b.rt && b.rt.ic !== null ? b.rt.ic : null;
    const missingCost = !spend && clicks >= 100;

    // Noise: no spend, no sale and only a handful of clicks (tests, old campaigns).
    if (!spend && !sales && !missingCost) {
      hidden++;
      continue;
    }
    rows.push({
      campaign: b.name,
      platform: b.platform,
      label: PLATFORM_LABEL[b.platform] ?? b.platform,
      spendSource: spend ? (direct ? "fonte" : "redtrack") : "",
      spend,
      clicks,
      cpc: div(spend, clicks),
      ic,
      icRate: ic === null ? null : div(ic, clicks) * 100,
      sales,
      upsells,
      upsellRate: div(upsells, sales) * 100,
      rtConversions: b.rt?.conversions ?? 0,
      rtExpected: sales + upsells,
      cvr: div(sales, clicks) * 100,
      cpa: div(spend, sales),
      revenue,
      upsellRevenue: s?.upsellRevenue ?? 0,
      roas: div(revenue, spend),
      profit,
      roi: div(profit, spend) * 100,
      aov: div(revenue, sales),
      matched: !!s,
      missingCost,
    });
  }
  rows.sort((a, b) => b.spend - a.spend || b.revenue - a.revenue);

  const t = rows.reduce(
    (a, r) => ({
      spend: a.spend + r.spend,
      clicks: a.clicks + r.clicks,
      ic: r.ic === null ? a.ic : (a.ic ?? 0) + r.ic,
      sales: a.sales + r.sales,
      upsells: a.upsells + r.upsells,
      rtConversions: a.rtConversions + r.rtConversions,
      rtExpected: a.rtExpected + r.rtExpected,
      revenue: a.revenue + r.revenue,
      upsellRevenue: a.upsellRevenue + r.upsellRevenue,
      profit: a.profit + r.profit,
    }),
    { spend: 0, clicks: 0, ic: null as number | null, sales: 0, upsells: 0, rtConversions: 0, rtExpected: 0, revenue: 0, upsellRevenue: 0, profit: 0 },
  );

  return {
    range,
    currency: m.currency,
    rows,
    totals: {
      ...t,
      cpc: div(t.spend, t.clicks),
      icRate: t.ic === null ? null : div(t.ic, t.clicks) * 100,
      upsellRate: div(t.upsells, t.sales) * 100,
      cvr: div(t.sales, t.clicks) * 100,
      cpa: div(t.spend, t.sales),
      roas: div(t.revenue, t.spend),
      roi: div(t.profit, t.spend) * 100,
      aov: div(t.revenue, t.sales),
    },
    hasRedtrack: rts !== null,
    icConfigured: !!settings.redtrackIcField,
    hidden,
    warnings: [...new Set(warnings)],
  };
}
