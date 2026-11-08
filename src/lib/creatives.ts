import "server-only";
import { promises as fs } from "node:fs";
import { cached, friendlyError, hashKey } from "./cache";
import { listRevcontent, listTaboola, type Creative } from "./connectors/taboolaCreatives";
import { computeTraffic } from "./traffic";
import { normProduct, parseRtName, parseSourceName } from "./naming";
import { getSettings, listConnections, listSavedHeadlines, listVariants, uniqueAccounts } from "./store";
import type { DateRange } from "./types";

/** Performance of an ad, an image or a headline, with sales attributed from Shopify. */
export type Perf = {
  spend: number;
  clicks: number;
  impressions: number;
  /** Conversions recorded by the source for these ads. */
  conversions: number;
  /** Shopify sales attributed (can be fractional when several ads share a campaign). */
  sales: number;
  revenue: number;
  profit: number;
  ctr: number;
  cpa: number;
  roas: number;
  /** true when the split used clicks because the source recorded no conversions. */
  estimated: boolean;
};

export type CreativeRow = Creative &
  Perf & { accountId: string; accountLabel: string; key: string; product: string };

export type GroupRow = Perf & {
  key: string;
  /** Product of the creative: chosen by hand, else read from the campaign names ("" = unknown). */
  product: string;
  /** Image URL (images, combos) or headline text (headlines). */
  image: string;
  title: string;
  ads: number;
  campaigns: string[];
  platforms: string[];
  /** One ad to generate variants from. */
  sample: CreativeRow;
};

const div = (a: number, b: number) => (b ? a / b : 0);
const imageKey = (u: string) => u.replace(/^https?:\/\//, "").replace(/[?#].*$/, "").toLowerCase();
const titleKey = (t: string) => t.toLowerCase().replace(/\s+/g, " ").trim();

function finish(p: Omit<Perf, "ctr" | "cpa" | "roas">): Perf {
  return { ...p, ctr: div(p.clicks, p.impressions) * 100, cpa: div(p.spend, p.sales), roas: div(p.revenue, p.spend) };
}

export async function computeCreatives(range: DateRange) {
  const warnings: string[] = [];
  const conns = uniqueAccounts(await listConnections()).filter((c) => c.provider === "taboola" || c.provider === "revcontent");

  const items: (Creative & { accountId: string; accountLabel: string })[] = [];
  // NT_SNAPSHOT_CREATIVES: JSON list of ads (with accountId/accountLabel) standing in for the APIs (tests).
  if (process.env.NT_SNAPSHOT_CREATIVES) {
    items.push(...JSON.parse(await fs.readFile(process.env.NT_SNAPSHOT_CREATIVES, "utf8")));
  } else await Promise.all(
    conns.map(async (a) => {
      try {
        const list = (
          await cached(hashKey("creatives", a.id, a.credentials, range), () =>
            a.provider === "taboola" ? listTaboola(a.credentials, range) : listRevcontent(a.credentials, range),
          )
        ).value;
        items.push(...list.map((x) => ({ ...x, accountId: a.id, accountLabel: a.label ?? a.provider })));
      } catch (e) {
        warnings.push(friendlyError(a.label ?? a.provider, e));
      }
    }),
  );

  // Real results per source campaign (sales, revenue, costs) from the Tráfego API view.
  const traffic = await computeTraffic(range);
  warnings.push(...traffic.warnings);
  const camp = new Map(
    traffic.apiRows.map((r) => [r.key.replace(/^api:/, ""), { sales: r.sales, revenue: r.revenue, costs: r.revenue - r.profit - r.spend }]),
  );

  // Split each campaign's results among its ads by the conversions the source recorded (else by clicks).
  const byCampaign = new Map<string, typeof items>();
  for (const it of items) {
    const k = `${it.platform}:${it.campaignId}`;
    byCampaign.set(k, [...(byCampaign.get(k) ?? []), it]);
  }
  // Product of each ad: chosen by hand, else read from the campaign name (naming convention or a known product).
  const [settings, variants, saved] = await Promise.all([getSettings(), listVariants(), listSavedHeadlines()]);
  const overrides = settings.creativeProducts ?? {};
  const known = new Set<string>();
  for (const it of items) {
    const p = parseSourceName(it.campaignName)?.product ?? parseRtName(it.campaignName)?.product;
    if (p) known.add(p);
  }
  for (const v of variants) if (v.product) known.add(normProduct(v.product));
  for (const h of saved) if (h.product) known.add(normProduct(h.product));
  for (const p of Object.values(overrides)) if (p) known.add(normProduct(p));
  const byLength = [...known].sort((a, b) => b.length - a.length);
  const productOf = (campaignName: string) =>
    parseSourceName(campaignName)?.product ??
    parseRtName(campaignName)?.product ??
    byLength.find((p) => normProduct(campaignName).includes(p)) ??
    "";

  const rows: CreativeRow[] = [];
  for (const [k, ads] of byCampaign) {
    const c = camp.get(k);
    const conv = ads.reduce((a, x) => a + x.conversions, 0);
    const clicks = ads.reduce((a, x) => a + x.clicks, 0);
    for (const ad of ads) {
      const share = conv > 0 ? div(ad.conversions, conv) : div(ad.clicks, clicks);
      const revenue = (c?.revenue ?? 0) * share;
      const costs = (c?.costs ?? 0) * share;
      rows.push({
        ...ad,
        key: `${ad.platform}:${ad.itemId}`,
        product: overrides[`img:${imageKey(ad.thumbnail)}`] ?? overrides[`hl:${titleKey(ad.title)}`] ?? productOf(ad.campaignName),
        ...finish({
          spend: ad.spend,
          clicks: ad.clicks,
          impressions: ad.impressions,
          conversions: ad.conversions,
          sales: (c?.sales ?? 0) * share,
          revenue,
          profit: revenue - costs - ad.spend,
          estimated: conv === 0 && (c?.sales ?? 0) > 0,
        }),
      });
    }
  }
  rows.sort((a, b) => b.spend - a.spend);

  const group = (keyOf: (r: CreativeRow) => string, prefix: "img" | "hl") => {
    const g = new Map<string, CreativeRow[]>();
    for (const r of rows) {
      const k = keyOf(r);
      if (k) g.set(k, [...(g.get(k) ?? []), r]);
    }
    return [...g.entries()]
      .map(([key, rs]): GroupRow => {
        const sum = (f: (r: CreativeRow) => number) => rs.reduce((a, r) => a + f(r), 0);
        const top = [...rs].sort((a, b) => b.spend - a.spend)[0];
        // Most frequent product among its ads, unless chosen by hand.
        const votes = new Map<string, number>();
        for (const r of rs) if (r.product) votes.set(r.product, (votes.get(r.product) ?? 0) + r.spend + 0.001);
        const voted = [...votes.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? "";
        return {
          key,
          product: overrides[`${prefix}:${key}`] ?? voted,
          image: top.thumbnail,
          title: top.title,
          ads: rs.length,
          campaigns: [...new Set(rs.map((r) => r.campaignName))],
          platforms: [...new Set(rs.map((r) => r.platform))],
          sample: top,
          ...finish({
            spend: sum((r) => r.spend),
            clicks: sum((r) => r.clicks),
            impressions: sum((r) => r.impressions),
            conversions: sum((r) => r.conversions),
            sales: sum((r) => r.sales),
            revenue: sum((r) => r.revenue),
            profit: sum((r) => r.profit),
            estimated: rs.some((r) => r.estimated),
          }),
        };
      })
      .filter((g) => g.spend > 0 || g.impressions > 0)
      .sort((a, b) => b.spend - a.spend);
  };

  return {
    range,
    currency: "USD",
    combos: rows.filter((r) => r.spend > 0 || r.impressions > 0),
    images: group((r) => imageKey(r.thumbnail), "img"),
    headlines: group((r) => titleKey(r.title), "hl"),
    products: [...known].sort(),
    accounts: process.env.NT_SNAPSHOT_CREATIVES
      ? [...new Map(items.map((i) => [i.accountId, { id: i.accountId, label: i.accountLabel, platform: i.platform }])).values()]
      : conns.map((a) => ({ id: a.id, label: a.label ?? a.provider, platform: a.provider })),
    hasImageAi: (await listConnections()).some((c) => c.provider === "fal"),
    warnings: [...new Set(warnings)],
  };
}

/**
 * Same as computeCreatives, served from a stale-while-revalidate cache (the screen gets the last result at once;
 * a fresh one is built in the background). Product choices are part of the key.
 */
export async function cachedCreatives(range: DateRange) {
  const st = await getSettings();
  const r = await cached(hashKey("creatives-all", range, st.creativeProducts ?? {}, st.supplierModel?.updatedAt ?? "", st.productCosts), () => computeCreatives(range), {
    ttl: 3 * 60_000,
    maxStale: 24 * 3600_000,
  });
  return r.value;
}
