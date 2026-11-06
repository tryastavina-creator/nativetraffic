import "server-only";
import { cached, hashKey } from "./cache";
import { resolveAccount } from "./campaigns";
import { revcontentBlock, revcontentBlocked, taboolaRaw } from "./connectors/campaignBuilder";
import { http, num } from "./connectors/http";
import { RC, rcGet, revcontentToken, taboolaToken } from "./connectors/traffic";
import type { Credentials, DateRange } from "./types";

/**
 * Inside one campaign: its ads and the sites (Taboola) / widgets (Revcontent) it runs on, with the source's
 * own numbers, and on/off for each (pause an ad, block a site).
 */

const TB = "https://backstage.taboola.com/backstage/api/1.0";
const https = (u: string) => u.replace(/^http:\/\//, "https://");
const div = (a: number, b: number) => (b ? a / b : 0);

export type AdInsight = {
  id: string;
  title: string;
  /** Approval by the source (approved / pending / rejected). */
  approval?: string;
  rejectReason?: string;
  /** The source accepts pause / edits now (Taboola: only RUNNING or PAUSED ads). */
  editable: boolean;
  description: string;
  thumbnail: string;
  status: string;
  active: boolean;
  spend: number;
  clicks: number;
  impressions: number;
  ctr: number;
  cpc: number;
  conversions: number;
  cpa: number;
};
export type SiteInsight = {
  id: string;
  name: string;
  spend: number;
  clicks: number;
  impressions: number;
  ctr: number;
  cpc: number;
  conversions: number;
  cpa: number;
  blocked: boolean;
};

async function account(accountId: string) {
  const acc = await resolveAccount(accountId);
  if (!acc || (acc.provider !== "taboola" && acc.provider !== "revcontent")) throw new Error("Conta não encontrada.");
  return acc as typeof acc & { provider: "taboola" | "revcontent" };
}

/** Taboola: the advertiser account that owns the campaign (a network connection reads across accounts). */
async function tbOwner(c: Credentials, campaignId: string) {
  const raw = await taboolaRaw(c, campaignId);
  const owner = raw.advertiser_id ? String(raw.advertiser_id) : String(c.accountId);
  return { c: { ...c, accountId: owner }, raw };
}

const tbGet = async <T>(c: Credentials, path: string) => http<T>(`${TB}/${c.accountId}${path}`, { headers: { Authorization: `Bearer ${await taboolaToken(c)}` } });

export async function campaignAds(accountId: string, campaignId: string, range: DateRange): Promise<AdInsight[]> {
  const acc = await account(accountId);
  return (
    await cached(hashKey("ads-in", accountId, campaignId, range), async () => {
      if (acc.provider === "taboola") {
        const { c } = await tbOwner(acc.credentials, campaignId);
        const qs = new URLSearchParams({ start_date: range.from, end_date: range.to, campaign: campaignId });
        const [items, rep] = await Promise.all([
          tbGet<{ results: Record<string, unknown>[] }>(c, `/campaigns/${campaignId}/items/`),
          tbGet<{ results: Record<string, unknown>[] }>(c, `/reports/top-campaign-content/dimensions/item_breakdown?${qs}`).catch(() => ({
            results: [] as Record<string, unknown>[],
          })),
        ]);
        const perf = new Map((rep.results ?? []).map((x) => [String(x.item ?? ""), x]));
        return (items.results ?? []).map((i) => {
          const p = perf.get(String(i.id)) ?? {};
          const spend = num(p.spent);
          const clicks = num(p.clicks);
          const impressions = num(p.visible_impressions ?? p.impressions);
          const conversions = num(p.cpa_actions_num ?? p.actions);
          return {
            id: String(i.id),
            title: String(i.title ?? ""),
            description: String(i.description ?? ""),
            thumbnail: https(String(i.thumbnail_url ?? "")),
            status: String(i.status ?? ""),
            approval: String(i.approval_state ?? ""),
            rejectReason: (i.policy_review as { reject_reason?: string } | null)?.reject_reason ?? undefined,
            editable: ["RUNNING", "PAUSED"].includes(String(i.status ?? "").toUpperCase()),
            active: i.is_active === true,
            spend,
            clicks,
            impressions,
            ctr: div(clicks, impressions) * 100,
            cpc: div(spend, clicks),
            conversions,
            cpa: div(spend, conversions),
          };
        });
      }
      const c = acc.credentials;
      const [content, stats] = await Promise.all([
        rcGet<Record<string, unknown>[]>(c, `/stats/api/v1.0/boosts/${campaignId}/content`, { limit: "1000" }),
        rcGet<Record<string, unknown>[]>(c, "/stats/api/v1.0/boosts/content", { date_from: range.from, date_to: range.to, boost_id: campaignId }).catch(() => ({
          success: false,
          data: [] as Record<string, unknown>[],
        })),
      ]);
      const perf = new Map(stats.data.filter((x) => String(x.boost_id ?? campaignId) === campaignId).map((x) => [String(x.content_id), x]));
      return content.data
        .filter((i) => i.admin_status !== "deleted")
        .map((i) => {
          const p = perf.get(String(i.content_id)) ?? {};
          const spend = num(p.cost);
          const clicks = num(p.clicks);
          const impressions = num(p.impressions);
          const conversions = num(p.conversions);
          return {
            id: String(i.content_id),
            title: String(i.headline ?? ""),
            description: String(i.description ?? ""),
            thumbnail: https(String(i.image_url ?? "")),
            status: String(i.admin_status ?? ""),
            approval: String(i.admin_status ?? ""),
            editable: i.admin_status !== "rejected",
            active: i.enabled === "active" || i.enabled === "on",
            spend,
            clicks,
            impressions,
            ctr: div(clicks, impressions) * 100,
            cpc: div(spend, clicks),
            conversions,
            cpa: div(spend, conversions),
          };
        });
    }, { ttl: 60_000 })
  ).value.sort((a, b) => b.spend - a.spend || Number(b.active) - Number(a.active));
}

export async function campaignSites(accountId: string, campaignId: string, range: DateRange): Promise<SiteInsight[]> {
  const acc = await account(accountId);
  return (
    await cached(hashKey("sites-in", accountId, campaignId, range), async () => {
      if (acc.provider === "taboola") {
        const { c, raw } = await tbOwner(acc.credentials, campaignId);
        const pt = raw.publisher_targeting as { type?: string; value?: string[] } | null;
        const blocked = new Set(pt?.type === "EXCLUDE" ? (pt.value ?? []) : []);
        const qs = new URLSearchParams({ start_date: range.from, end_date: range.to, campaign: campaignId });
        const rep = await tbGet<{ results: Record<string, unknown>[] }>(c, `/reports/campaign-summary/dimensions/site_breakdown?${qs}`);
        const rows: SiteInsight[] = (rep.results ?? []).map((x) => {
          const spend = num(x.spent);
          const clicks = num(x.clicks);
          const impressions = num(x.visible_impressions ?? x.impressions);
          const conversions = num(x.cpa_actions_num ?? x.actions);
          const id = String(x.site ?? x.site_id ?? "");
          return {
            id,
            name: String(x.site_name ?? x.site ?? id),
            spend,
            clicks,
            impressions,
            ctr: div(clicks, impressions) * 100,
            cpc: div(spend, clicks),
            conversions,
            cpa: div(spend, conversions),
            blocked: blocked.has(id),
          };
        });
        // Blocked sites with no traffic in the period still show (to unblock them).
        const listed = new Set(rows.map((r) => r.id));
        for (const id of blocked)
          if (!listed.has(id)) rows.push({ id, name: id, spend: 0, clicks: 0, impressions: 0, ctr: 0, cpc: 0, conversions: 0, cpa: 0, blocked: true });
        return rows;
      }
      const c = acc.credentials;
      const [stats, blocked] = await Promise.all([
        rcGet<Record<string, unknown>[]>(c, `/stats/api/v1.0/boosts/${campaignId}/widgets/stats`, { date_from: range.from, date_to: range.to, limit: "1000" }),
        revcontentBlocked(c, campaignId),
      ]);
      const b = new Set(blocked);
      const seen = new Set(stats.data.map((x) => String(x.id ?? x.widget_id ?? "")));
      const extra = blocked
        .filter((id) => !seen.has(id))
        .map((id) => ({ id, name: `widget ${id}`, spend: 0, clicks: 0, impressions: 0, ctr: 0, cpc: 0, conversions: 0, cpa: 0, blocked: true }));
      return [...extra, ...stats.data.map((x) => {
        const spend = num(x.spend);
        const clicks = num(x.clicks);
        const impressions = num(x.viewable_impressions ?? x.impressions);
        const conversions = num(x.conversions);
        const id = String(x.id ?? x.widget_id ?? "");
        return {
          id,
          name: `${x.domain ?? "widget"} · ${id}${x.placement_type ? ` · ${x.placement_type}` : ""}`,
          spend,
          clicks,
          impressions,
          ctr: div(clicks, impressions) * 100,
          cpc: div(spend, clicks),
          conversions,
          cpa: div(spend, conversions),
          blocked: b.has(id),
        };
      })];
    }, { ttl: 60_000 })
  ).value.sort((a, b) => b.spend - a.spend);
}

/** Pause / activate one ad. */
export async function setAdActive(accountId: string, campaignId: string, adId: string, active: boolean) {
  const acc = await account(accountId);
  if (acc.provider === "taboola") {
    const { c } = await tbOwner(acc.credentials, campaignId);
    await http(`${TB}/${c.accountId}/campaigns/${campaignId}/items/${adId}/`, {
      method: "POST",
      headers: { Authorization: `Bearer ${await taboolaToken(c)}`, "Content-Type": "application/json" },
      body: JSON.stringify({ is_active: active }),
    }).catch((e) => {
      if (/status=RUNNING or status=PAUSED/i.test(String((e as Error).message)))
        throw Object.assign(new Error("esse anúncio ainda está em revisão ou foi reprovado — a Taboola só deixa pausar depois de aprovado"), { friendly: true });
      throw e;
    });
  } else {
    await http(`${RC}/stats/api/v1.0/boosts/${campaignId}/content`, {
      method: "POST",
      headers: { Authorization: `Bearer ${await revcontentToken(acc.credentials)}`, "Content-Type": "application/json" },
      body: JSON.stringify({ boost_id: Number(campaignId), id: Number(adId), enabled: active ? "on" : "off" }),
    });
  }
}

/** Block / unblock one site (Taboola) or widget (Revcontent) on the campaign. */
export async function setSiteBlocked(accountId: string, campaignId: string, site: string, blocked: boolean) {
  const acc = await account(accountId);
  if (acc.provider === "taboola") {
    const { c, raw } = await tbOwner(acc.credentials, campaignId);
    const pt = raw.publisher_targeting as { type?: string; value?: string[] } | null;
    if (pt?.type === "INCLUDE") throw new Error("Essa campanha só roda numa lista fechada de sites (whitelist); edite a lista na Taboola.");
    const current = new Set(pt?.type === "EXCLUDE" ? (pt.value ?? []) : []);
    if (blocked) current.add(site);
    else current.delete(site);
    await http(`${TB}/${c.accountId}/campaigns/${campaignId}/`, {
      method: "POST",
      headers: { Authorization: `Bearer ${await taboolaToken(c)}`, "Content-Type": "application/json" },
      body: JSON.stringify({ publisher_targeting: current.size ? { type: "EXCLUDE", value: [...current] } : { type: "ALL", value: [] } }),
    });
  } else if (blocked) {
    await revcontentBlock(acc.credentials, campaignId, [site]);
  } else {
    await http(`${RC}/stats/api/v1.0/boosts/${campaignId}/targets/blacklist/widgets/remove`, {
      method: "POST",
      headers: { Authorization: `Bearer ${await revcontentToken(acc.credentials)}`, "Content-Type": "application/json" },
      body: JSON.stringify({ boost_id: Number(campaignId), id: site }),
    });
  }
}

/** New daily budget of a campaign (Taboola daily cap · Revcontent daily budget, min US$50). */
export async function setDailyBudget(accountId: string, campaignId: string, daily: number) {
  const acc = await account(accountId);
  if (!(daily > 0)) throw Object.assign(new Error("informe um valor maior que zero"), { friendly: true });
  if (acc.provider === "taboola") {
    const { c, raw } = await tbOwner(acc.credentials, campaignId);
    const body: Record<string, unknown> = { daily_cap: daily, daily_ad_delivery_model: raw.daily_ad_delivery_model ?? "STRICT" };
    // A total/monthly limit below the new daily budget would block it: raise it along.
    const model = String(raw.spending_limit_model ?? "");
    if ((model === "MONTHLY" || model === "ENTIRE") && num(raw.spending_limit) < daily) body.spending_limit = Math.round(daily * 31);
    await http(`${TB}/${c.accountId}/campaigns/${campaignId}/`, {
      method: "POST",
      headers: { Authorization: `Bearer ${await taboolaToken(c)}`, "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
  } else {
    if (daily < 50) throw Object.assign(new Error("na Revcontent o orçamento diário mínimo é US$50"), { friendly: true });
    await http(`${RC}/stats/api/v1.0/boosts/${campaignId}/settings`, {
      method: "POST",
      headers: { Authorization: `Bearer ${await revcontentToken(acc.credentials)}`, "Content-Type": "application/json" },
      body: JSON.stringify({ boost_id: Number(campaignId), budget_type: "daily", budget_amount: daily }),
    });
  }
}
