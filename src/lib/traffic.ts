import "server-only";
import { promises as fs } from "node:fs";
import { cached, friendlyError, hashKey } from "./cache";
import { redtrack, TRAFFIC_CONNECTORS } from "./connectors";
import type { RtCampaign } from "./connectors/redtrack";
import type { SourceCampaign } from "./connectors/traffic";
import { computeMetrics, type CampaignRow } from "./metrics";
import { buildRtName, namingKey, parseRtName, parseSourceName } from "./naming";
import { PLATFORM_LABEL, platformFromUtm } from "./registry";
import { getSettings, listConnections, uniqueAccounts } from "./store";
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
  /** false = RedTrack spend shown for a platform with API but not linked yet (kept out of totals). */
  counted: boolean;
  /** Name follows the convention (RedTrack: PRODUTO FONTE PAÍS · source: PRODUTO DEVICE LANCE PAÍS DATA). */
  namingOk: boolean;
  key: string;
  linkedBy?: "manual" | "link" | "padrao" | "nome";
  sourceNames: string[];
  sourceKeys: string[];
  linkSource?: string;
  needsLink: boolean;
  /**
   * How sales reached this row in the API view: exact (one source campaign per RedTrack campaign),
   * split by the source's own conversions or by clicks (several source campaigns feeding one), or none.
   */
  attribution?: "exata" | "conversoes" | "cliques" | "sem-ligacao" | "redtrack";
  /** API view: the source account and campaign id (for edit / duplicate). */
  accountId?: string;
  sourceId?: string;
};

export type TrafficReport = {
  range: DateRange;
  currency: string;
  rows: TrafficRow[];
  /** One row per campaign of the traffic sources' APIs (plus RedTrack-only platforms). Same totals as `rows`. */
  apiRows: TrafficRow[];
  totals: Omit<
    TrafficRow,
    "campaign" | "platform" | "label" | "matched" | "spendSource" | "missingCost" | "counted" | "namingOk" | "key" | "linkedBy" | "sourceNames" | "sourceKeys" | "linkSource" | "needsLink" | "attribution" | "accountId" | "sourceId"
  >;
  linkTargets: { key: string; name: string; platform: string }[];
  unlinked: number;
  hasRedtrack: boolean;
  icConfigured: boolean;
  hidden: number;
  warnings: string[];
};

const div = (a: number, b: number) => (b ? a / b : 0);

/** Splits an integer count by shares (largest remainder), so the parts always add up to the total. */
function allocate(total: number, shares: number[]): number[] {
  const raw = shares.map((s) => s * total);
  const out = raw.map(Math.floor);
  let left = total - out.reduce((a, x) => a + x, 0);
  const order = raw.map((r, i) => [r - Math.floor(r), i] as const).sort((a, b) => b[0] - a[0]);
  for (const [, i] of order) {
    if (left <= 0) break;
    out[i]++;
    left--;
  }
  return out;
}
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
  const conns = uniqueAccounts(await listConnections()).filter((c) => TRAFFIC_CONNECTORS[c.provider]?.campaigns);
  const out: (SourceCampaign & { platform: string; accountId?: string })[] = [];
  await Promise.all(
    conns.map(async (c) => {
      try {
        const list = (
          await cached(hashKey("src-campaigns", c.id, c.credentials, range), () =>
            TRAFFIC_CONNECTORS[c.provider].campaigns!(c.credentials, range),
          )
        ).value;
        out.push(...list.map((x) => ({ ...x, platform: c.provider, accountId: c.id })));
      } catch (e) {
        warnings.push(friendlyError(c.label ?? PLATFORM_LABEL[c.provider] ?? c.provider, e));
      }
    }),
  );
  const merged = new Map<string, SourceCampaign & { platform: string; accountId?: string }>();
  for (const x of out) {
    const k = `${x.platform}:${x.id}`;
    const prev = merged.get(k);
    if (!prev) merged.set(k, { ...x, urls: [...(x.urls ?? [])] });
    else {
      prev.spend += x.spend;
      prev.clicks += x.clicks;
      prev.conversions += x.conversions;
      prev.urls = [...new Set([...(prev.urls ?? []), ...(x.urls ?? [])])];
    }
  }
  return [...merged.values()];
}

type Src = SourceCampaign & { platform: string; accountId?: string };

type Bucket = {
  key: string;
  name: string;
  platform: string;
  srcs: Src[];
  linkedBy?: "manual" | "link" | "padrao" | "nome";
  /** How each source campaign got linked (key "platform:id"). */
  srcLinkedBy: Map<string, "manual" | "link" | "padrao" | "nome">;
  rt?: RtCampaign;
  shop?: CampaignRow;
};

/** RedTrack / utm_campaign key: the naming convention (PRODUTO FONTE PAÍS) when it parses, else code/name. */
function rtKey(name: string): string {
  const p = parseRtName(name);
  return p ? namingKey(p.product, p.source, p.country) : campaignKey(name);
}

/** Finds the RedTrack campaign whose id appears in one of the ad landing URLs (RedTrack tracking links). */
function rtFromUrls(urls: string[] | undefined, rtById: Map<string, string>): string | undefined {
  if (!urls?.length) return undefined;
  for (const url of urls) {
    let u = url.toLowerCase();
    try {
      u = decodeURIComponent(u);
    } catch {}
    for (const [id, key] of rtById) if (id.length >= 6 && u.includes(id)) return key;
  }
  return undefined;
}

export async function computeTraffic(range: DateRange): Promise<TrafficReport> {
  const [m, settings] = await Promise.all([computeMetrics(range), getSettings()]);
  const warnings = [...m.warnings];
  const [rts, srcs] = await Promise.all([rtCampaigns(range, settings.redtrackIcField, warnings), sourceCampaigns(range, warnings)]);

  // Platforms whose spend comes from their own API.
  const directPlatforms = new Set(srcs.map((s) => s.platform));
  const buckets = new Map<string, Bucket>();
  const bucket = (key: string, name: string, platform: string) => {
    let b = buckets.get(key);
    if (!b) {
      b = { key, name, platform, srcs: [], srcLinkedBy: new Map() };
      buckets.set(key, b);
    }
    return b;
  };

  // 1) RedTrack campaigns (team naming, carry clicks / IC / purchases).
  const rtById = new Map<string, string>();
  for (const r of rts ?? []) {
    const fromSource = platformFromUtm(r.source);
    const p = !["other", "untracked"].includes(fromSource) ? fromSource : platformFromUtm(r.name);
    const key = rtKey(r.name);
    const b = bucket(key, r.name, p);
    b.rt = r;
    if (b.platform === "other" || b.platform === "untracked") b.platform = p;
    if (r.id) rtById.set(r.id.toLowerCase(), key);
  }
  // 2) Shopify sales by utm_campaign.
  for (const c of m.campaigns) {
    if (c.campaign === "(sem campanha)") continue;
    const b = bucket(rtKey(c.campaign), c.campaign, c.platform);
    b.shop = c;
    b.name = c.campaign;
  }
  // 3) Source campaigns: manual link > RedTrack id in the ad URL > same code/name > own row.
  const links = settings.campaignLinks ?? {};
  for (const s of srcs) {
    if (!s.spend && !s.clicks) continue;
    const sk = `${s.platform}:${s.id}`;
    const manual = links[sk];
    const byUrl = rtFromUrls(s.urls, rtById);
    // Naming convention: "PRODUTO DEVICE LANCE PAÍS DATA" on platform X → RedTrack "PRODUTO X PAÍS".
    const ps = parseSourceName(s.name);
    const byNaming = ps ? namingKey(ps.product, s.platform, ps.country) : undefined;
    if (byNaming && !buckets.has(byNaming)) bucket(byNaming, buildRtName(ps!.product, s.platform, ps!.country), s.platform);
    const byName = buckets.has(campaignKey(s.name)) ? campaignKey(s.name) : undefined;
    const target = manual ?? byUrl ?? byNaming ?? byName;
    if (target) {
      const b = buckets.get(target) ?? bucket(target, s.name, s.platform);
      b.srcs.push(s);
      const how = manual ? "manual" : byUrl ? "link" : byNaming ? "padrao" : "nome";
      b.srcLinkedBy.set(sk, how);
      b.linkedBy ??= how;
    } else {
      bucket(`src:${sk}`, s.name, s.platform).srcs.push(s);
    }
  }

  const rows: TrafficRow[] = [];
  let hidden = 0;
  for (const b of buckets.values()) {
    const direct = directPlatforms.has(b.platform);
    const srcSpend = b.srcs.reduce((a, s) => a + s.spend, 0);
    const srcClicks = b.srcs.reduce((a, s) => a + s.clicks, 0);
    // Spend never disappears: source API first; otherwise RedTrack. When the platform has an API but this
    // campaign isn't linked to a source campaign yet, the RedTrack spend is shown but not added to totals
    // (the same money is already in an unlinked source row).
    const spend = b.srcs.length ? srcSpend : (b.rt?.spend ?? 0);
    const spendSource: TrafficRow["spendSource"] = b.srcs.length ? "fonte" : spend ? "redtrack" : "";
    const counted = !(spendSource === "redtrack" && direct);
    const clicks = b.rt?.clicks || srcClicks;
    const s = b.shop;
    const sales = s?.orders ?? 0;
    const upsells = s?.upsells ?? 0;
    const revenue = s?.revenue ?? 0;
    const costs = s ? s.refunds + s.supplierCost + s.fees : 0;
    const profit = revenue - costs - spend;
    const ic = b.rt && b.rt.ic !== null ? b.rt.ic : null;
    const missingCost = !spend && (clicks >= 100 || sales > 0);
    const sourceOnly = b.key.startsWith("src:");

    if (!spend && !sales && !missingCost) {
      hidden++;
      continue;
    }
    rows.push({
      campaign: b.name,
      platform: b.platform,
      label: PLATFORM_LABEL[b.platform] ?? b.platform,
      spendSource,
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
      counted,
      namingOk: !!parseRtName(b.name) && b.srcs.every((x) => !!parseSourceName(x.name)),
      key: b.key,
      linkedBy: b.linkedBy,
      sourceNames: b.srcs.map((x) => x.name),
      sourceKeys: b.srcs.map((x) => `${x.platform}:${x.id}`),
      // A source-only row can be linked to a RedTrack/Shopify campaign; a RedTrack row of a platform with API
      // and no source campaign is waiting for that link.
      linkSource: sourceOnly ? `${b.srcs[0].platform}:${b.srcs[0].id}` : undefined,
      needsLink: sourceOnly || (direct && !b.srcs.length && (spend > 0 || sales > 0)),
    });
  }
  rows.sort((a, b) => b.spend - a.spend || b.revenue - a.revenue);

  // ---------- API view: one row per source campaign ----------
  const apiRows: TrafficRow[] = [];
  const build = (o: {
    key: string;
    name: string;
    platform: string;
    spend: number;
    spendSource: TrafficRow["spendSource"];
    counted: boolean;
    clicks: number;
    share: number;
    shop?: CampaignRow;
    sales: number;
    upsells: number;
    rt?: RtCampaign;
    attribution: TrafficRow["attribution"];
    linkSource?: string;
    linkedBy?: Bucket["linkedBy"];
    sourceKeys: string[];
    accountId?: string;
    sourceId?: string;
  }): TrafficRow => {
    const s = o.shop;
    const revenue = (s?.revenue ?? 0) * o.share;
    const costs = s ? (s.refunds + s.supplierCost + s.fees) * o.share : 0;
    const profit = revenue - costs - o.spend;
    return {
      campaign: o.name,
      platform: o.platform,
      label: PLATFORM_LABEL[o.platform] ?? o.platform,
      spendSource: o.spendSource,
      spend: o.spend,
      clicks: o.clicks,
      cpc: div(o.spend, o.clicks),
      ic: o.rt && o.rt.ic !== null ? Math.round(o.rt.ic * o.share) : null,
      icRate: o.rt && o.rt.ic !== null ? div(o.rt.ic * o.share, o.clicks) * 100 : null,
      sales: o.sales,
      upsells: o.upsells,
      upsellRate: div(o.upsells, o.sales) * 100,
      rtConversions: o.share === 1 ? (o.rt?.conversions ?? 0) : 0,
      rtExpected: o.sales + o.upsells,
      cvr: div(o.sales, o.clicks) * 100,
      cpa: div(o.spend, o.sales),
      revenue,
      upsellRevenue: (s?.upsellRevenue ?? 0) * o.share,
      roas: div(revenue, o.spend),
      profit,
      roi: div(profit, o.spend) * 100,
      aov: div(revenue, o.sales),
      matched: !!s,
      missingCost: !o.spend && (o.clicks >= 100 || o.sales > 0),
      counted: o.counted,
      namingOk: o.attribution === "redtrack" ? !!parseRtName(o.name) : !!parseSourceName(o.name),
      key: o.key,
      linkedBy: o.linkedBy,
      sourceNames: [],
      sourceKeys: o.sourceKeys,
      linkSource: o.linkSource,
      needsLink: o.attribution === "sem-ligacao",
      attribution: o.attribution,
      accountId: o.accountId,
      sourceId: o.sourceId,
    };
  };

  for (const b of buckets.values()) {
    const direct = directPlatforms.has(b.platform);
    if (b.srcs.length) {
      const sourceOnly = b.key.startsWith("src:");
      const salesTotal = b.shop?.orders ?? 0;
      const upsellTotal = b.shop?.upsells ?? 0;
      const conv = b.srcs.map((x) => x.conversions);
      const clicks = b.srcs.map((x) => x.clicks);
      const byConv = conv.reduce((a, x) => a + x, 0) > 0;
      const weights = b.srcs.length === 1 ? [1] : byConv ? conv : clicks;
      const shares = weights.map((w) => div(w, weights.reduce((a, x) => a + x, 0)));
      const sales = allocate(salesTotal, shares);
      const upsells = allocate(upsellTotal, shares);
      b.srcs.forEach((x, i) => {
        apiRows.push(
          build({
            key: `api:${x.platform}:${x.id}`,
            name: x.name,
            platform: x.platform,
            spend: x.spend,
            spendSource: "fonte",
            counted: true,
            clicks: x.clicks,
            share: sourceOnly ? 0 : shares[i],
            shop: sourceOnly ? undefined : b.shop,
            sales: sourceOnly ? 0 : sales[i],
            upsells: sourceOnly ? 0 : upsells[i],
            rt: b.rt,
            attribution: sourceOnly ? "sem-ligacao" : b.srcs.length === 1 ? "exata" : byConv ? "conversoes" : "cliques",
            linkSource: sourceOnly ? `${x.platform}:${x.id}` : undefined,
            linkedBy: sourceOnly ? undefined : b.srcLinkedBy.get(`${x.platform}:${x.id}`),
            sourceKeys: [`${x.platform}:${x.id}`],
            accountId: x.accountId,
            sourceId: x.id,
          }),
        );
      });
      continue;
    }
    // No source campaign: RedTrack campaign of a platform without API (counted), or of a platform with API
    // that still needs a link (its sales show here so they are never lost; its spend stays out of totals).
    const spend = b.rt?.spend ?? 0;
    const sales = b.shop?.orders ?? 0;
    if (!spend && !sales && !(b.rt && b.rt.clicks >= 100)) continue;
    apiRows.push(
      build({
        key: `rt:${b.key}`,
        name: b.name,
        platform: b.platform,
        spend,
        spendSource: spend ? "redtrack" : "",
        counted: !direct,
        clicks: b.rt?.clicks ?? 0,
        share: 1,
        shop: b.shop,
        sales,
        upsells: b.shop?.upsells ?? 0,
        rt: b.rt,
        attribution: "redtrack",
        sourceKeys: [],
      }),
    );
  }
  apiRows.sort((a, b) => b.spend - a.spend || b.revenue - a.revenue);

  // Campaigns a source row can be linked to (RedTrack/Shopify side; several source campaigns may feed one).
  const linkTargets = [...buckets.values()]
    .filter((b) => !b.key.startsWith("src:") && (b.rt || b.shop))
    .map((b) => ({ key: b.key, name: b.name, platform: b.platform }));

  const t = rows.reduce(
    (a, r) => ({
      spend: a.spend + (r.counted ? r.spend : 0),
      clicks: a.clicks + r.clicks,
      ic: r.ic === null ? a.ic : (a.ic ?? 0) + r.ic,
      sales: a.sales + r.sales,
      upsells: a.upsells + r.upsells,
      rtConversions: a.rtConversions + r.rtConversions,
      rtExpected: a.rtExpected + r.rtExpected,
      revenue: a.revenue + r.revenue,
      upsellRevenue: a.upsellRevenue + r.upsellRevenue,
      profit: a.profit + r.profit + (r.counted ? 0 : r.spend),
    }),
    { spend: 0, clicks: 0, ic: null as number | null, sales: 0, upsells: 0, rtConversions: 0, rtExpected: 0, revenue: 0, upsellRevenue: 0, profit: 0 },
  );

  return {
    range,
    currency: m.currency,
    rows,
    apiRows,
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
    linkTargets,
    unlinked: rows.filter((r) => r.needsLink).length,
    hasRedtrack: rts !== null,
    icConfigured: !!settings.redtrackIcField || rows.some((r) => r.ic !== null && r.ic > 0),
    hidden,
    warnings: [...new Set(warnings)],
  };
}
