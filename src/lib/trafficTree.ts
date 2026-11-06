import "server-only";
import { promises as fs } from "node:fs";
import { cached, friendlyError, hashKey } from "./cache";
import { campaignAccounts, resolveAccount } from "./campaigns";
import { revcontentCampaigns, taboolaCampaigns, type SourceCampaignInfo } from "./connectors/campaignBuilder";
import { PLATFORM_LABEL } from "./registry";
import { getSettings, listCampaignLog, listConnections } from "./store";
import { computeTraffic, type ExcludedCampaign, type TrafficRow } from "./traffic";
import type { DateRange } from "./types";

/**
 * Tráfego as a tree: traffic source → account → campaign, only campaigns of the sources' APIs.
 * Every number is real: spend from the source, sales/revenue from Shopify, costs from Wiio/settings.
 */

export type Perf = {
  spend: number;
  clicks: number;
  sales: number;
  upsells: number;
  revenue: number;
  profit: number;
  cpa: number;
  roas: number;
  /** InitiateCheckout (RedTrack); null when not configured. */
  ic: number | null;
  /** Sum of daily budgets of the active campaigns. */
  budget: number;
};

export type TreeCampaign = Perf & {
  key: string;
  id: string;
  name: string;
  platform: string;
  accountId: string;
  status: string;
  active: boolean | null;
  dailyBudget?: number;
  attribution?: TrafficRow["attribution"];
  linkSource?: string;
  needsLink: boolean;
  excludeKeys: string[];
  editable: boolean;
};
export type TreeAccount = Perf & { id: string; label: string; platform: string; campaigns: TreeCampaign[] };
export type TreePlatform = Perf & { platform: string; label: string; accounts: TreeAccount[] };

export type TrafficTree = {
  range: DateRange;
  days: number;
  currency: string;
  platforms: TreePlatform[];
  totals: Perf & { campaigns: number };
  linkTargets: { key: string; name: string; platform: string }[];
  excluded: ExcludedCampaign[];
  icConfigured: boolean;
  warnings: string[];
};

const div = (a: number, b: number) => (b ? a / b : 0);
const EDITABLE = new Set(["taboola", "revcontent"]);

function sum(list: Perf[]): Perf {
  const t = list.reduce(
    (a, x) => ({
      spend: a.spend + x.spend,
      clicks: a.clicks + x.clicks,
      sales: a.sales + x.sales,
      upsells: a.upsells + x.upsells,
      revenue: a.revenue + x.revenue,
      profit: a.profit + x.profit,
      ic: x.ic === null ? a.ic : (a.ic ?? 0) + x.ic,
      budget: a.budget + x.budget,
    }),
    { spend: 0, clicks: 0, sales: 0, upsells: 0, revenue: 0, profit: 0, ic: null as number | null, budget: 0 },
  );
  return { ...t, cpa: div(t.spend, t.sales), roas: div(t.revenue, t.spend) };
}

async function campaignList(accountId: string, platform: string, warnings: string[]): Promise<SourceCampaignInfo[]> {
  if (process.env.NT_SNAPSHOT_BUILDER_META) {
    const m = JSON.parse(await fs.readFile(process.env.NT_SNAPSHOT_BUILDER_META, "utf8")) as { campaigns?: SourceCampaignInfo[] };
    return m.campaigns ?? [];
  }
  const acc = await resolveAccount(accountId);
  if (!acc) return [];
  try {
    return (
      await cached(hashKey("camp-list", accountId, acc.credentials), () =>
        platform === "taboola" ? taboolaCampaigns(acc.credentials) : revcontentCampaigns(acc.credentials),
      { ttl: 2 * 60_000 })
    ).value;
  } catch (e) {
    warnings.push(friendlyError(acc.label ?? platform, e));
    return [];
  }
}

/** Resolves with the fallback after `ms`; the work keeps running (and fills its cache for the next load). */
function within<T>(p: Promise<T>, ms: number, fallback: T): Promise<T> {
  return Promise.race([p.catch(() => fallback), new Promise<T>((r) => setTimeout(() => r(fallback), ms))]);
}

/**
 * Served from a stale-while-revalidate cache: the screen gets the last result at once and a fresh one is built
 * in the background. The key includes the settings that change the result (ignored / linked campaigns).
 */
export async function computeTrafficTree(range: DateRange): Promise<TrafficTree & { cachedAt: string }> {
  const st = await getSettings();
  const version = hashKey(st.excludedCampaigns, st.campaignLinks, st.creativeProducts ?? {});
  const r = await cached(hashKey("tree", range, version), () => buildTree(range), { ttl: 90_000, maxStale: 24 * 3600_000 });
  return { ...r.value, cachedAt: new Date(r.at).toISOString() };
}

async function buildTree(range: DateRange): Promise<TrafficTree> {
  // Account / campaign lists only add status and budget: never let them hold the screen for long.
  const [r, accounts, log] = await Promise.all([
    computeTraffic(range),
    within(campaignAccounts(), 4000, [] as Awaited<ReturnType<typeof campaignAccounts>>),
    listCampaignLog().catch(() => []),
  ]);
  const warnings = [...r.warnings];
  const days = Math.max(1, Math.round((Date.parse(range.to) - Date.parse(range.from)) / 86400_000) + 1);

  // Campaign → account, from each account's campaign list (also gives status and budget).
  const lists = await Promise.all(
    accounts.map(async (a) => ({ a, list: await within(campaignList(a.id, a.platform, warnings), 4000, [] as SourceCampaignInfo[]) })),
  );
  const owner = new Map<string, { accountId: string; info: SourceCampaignInfo }>();
  for (const { a, list } of lists) for (const c of list) owner.set(`${a.platform}:${c.id}`, { accountId: a.id, info: c });

  const recent = new Set(
    log.filter((l) => l.campaignId && Date.now() - Date.parse(l.at) < 14 * 86400_000).map((l) => `${l.platform}:${l.campaignId}`),
  );
  const excluded = new Set(r.excluded.map((e) => e.key));

  const byAccount = new Map<string, TreeCampaign[]>();
  const push = (accountId: string, c: TreeCampaign) => byAccount.set(accountId, [...(byAccount.get(accountId) ?? []), c]);
  const seen = new Set<string>();

  // 1) Campaigns with data in the period (source API rows only — no RedTrack-only rows).
  for (const row of r.apiRows) {
    if (row.attribution === "redtrack" || !row.sourceId) continue;
    const k = `${row.platform}:${row.sourceId}`;
    seen.add(k);
    const o = owner.get(k);
    const accountId = o?.accountId ?? row.accountId ?? row.platform;
    const active = o ? o.info.active : null;
    push(accountId, {
      key: k,
      id: row.sourceId,
      name: row.campaign,
      platform: row.platform,
      accountId,
      status: o?.info.status ?? "",
      active,
      dailyBudget: o?.info.dailyBudget,
      spend: row.spend,
      clicks: row.clicks,
      sales: row.sales,
      upsells: row.upsells,
      revenue: row.revenue,
      profit: row.profit,
      cpa: row.cpa,
      roas: row.roas,
      ic: row.ic,
      budget: active !== false ? (o?.info.dailyBudget ?? 0) : 0,
      attribution: row.attribution,
      linkSource: row.linkSource,
      needsLink: row.needsLink,
      excludeKeys: row.excludeKeys,
      editable: EDITABLE.has(row.platform),
    });
  }
  // 2) Running (or just created) campaigns with nothing yet — paused/in review/new.
  for (const { a, list } of lists)
    for (const c of list) {
      const k = `${a.platform}:${c.id}`;
      if (seen.has(k) || excluded.has(`src:${k}`)) continue;
      if (!c.active && !recent.has(k)) continue;
      seen.add(k);
      push(a.id, {
        key: k,
        id: c.id,
        name: c.name,
        platform: a.platform,
        accountId: a.id,
        status: c.status,
        active: c.active,
        dailyBudget: c.dailyBudget,
        spend: 0,
        clicks: 0,
        sales: 0,
        upsells: 0,
        revenue: 0,
        profit: 0,
        cpa: 0,
        roas: 0,
        ic: null,
        budget: c.active ? (c.dailyBudget ?? 0) : 0,
        needsLink: false,
        excludeKeys: [`src:${k}`],
        editable: true,
      });
    }

  const label = new Map(accounts.map((a) => [a.id, a.label]));
  for (const c of await listConnections().catch(() => [])) if (!label.has(c.id)) label.set(c.id, c.label ?? PLATFORM_LABEL[c.provider] ?? c.provider);
  const platforms = new Map<string, TreeAccount[]>();
  for (const [accountId, campaigns] of byAccount) {
    const platform = campaigns[0].platform;
    campaigns.sort((x, y) => y.spend - x.spend || Number(y.active) - Number(x.active) || x.name.localeCompare(y.name));
    const acc: TreeAccount = { id: accountId, label: label.get(accountId) ?? PLATFORM_LABEL[accountId] ?? accountId, platform, campaigns, ...sum(campaigns) };
    platforms.set(platform, [...(platforms.get(platform) ?? []), acc]);
  }
  const tree: TreePlatform[] = [...platforms.entries()]
    .map(([platform, accs]) => {
      accs.sort((x, y) => y.spend - x.spend);
      return { platform, label: PLATFORM_LABEL[platform] ?? platform, accounts: accs, ...sum(accs) };
    })
    .sort((x, y) => y.spend - x.spend);

  return {
    range,
    days,
    currency: r.currency,
    platforms: tree,
    totals: { ...sum(tree), campaigns: tree.reduce((a, p) => a + p.accounts.reduce((b, x) => b + x.campaigns.length, 0), 0) },
    linkTargets: r.linkTargets,
    excluded: r.excluded,
    icConfigured: r.icConfigured,
    warnings: [...new Set(warnings)],
  };
}
