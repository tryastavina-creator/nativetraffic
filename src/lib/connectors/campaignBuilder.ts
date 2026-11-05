/**
 * Create / duplicate campaigns and add ads, per source. Everything is created PAUSED.
 *
 * Taboola (official Backstage docs):
 *  - campaign groups: GET/POST /{account}/campaigns_group (name, marketing_objective, spending_limit_model, spending_limit…)
 *  - campaign: POST /{account}/campaigns/ — campaign_group_id is FINAL (only at creation); bid_strategy
 *    MAX_CONVERSIONS | TARGET_CPA | SMART | FIXED; country_targeting / platform_targeting {type, value[]};
 *    in a shared-budget group, spending_limit can be omitted
 *  - duplicate: POST /{account}/campaigns/{id}/duplicate/ with field overrides + duplicate_settings.include_items
 * Revcontent (official Stats API spec):
 *  - POST /boosts/add (name, budget, default_bids, optimize, country_targeting/codes, device_targeting ids…)
 *  - POST /boosts { id, enabled: "off" } to pause; no duplicate endpoint → new boost with the source's bids/budget
 */
import type { CampaignSetup } from "../store";
import type { Credentials } from "../types";
import { http, num } from "./http";
import { RC, rcGet, revcontentToken, taboolaToken } from "./traffic";

const TB = "https://backstage.taboola.com/backstage/api/1.0";

const tbHeaders = async (c: Credentials) => ({ Authorization: `Bearer ${await taboolaToken(c)}`, "Content-Type": "application/json" });

export type SourceCampaignInfo = { id: string; name: string; status: string; active: boolean; groupId?: string };
export type GroupInfo = { id: string; name: string; status: string };

// ---------------------------------- Taboola ----------------------------------

export async function taboolaCampaigns(c: Credentials): Promise<SourceCampaignInfo[]> {
  const r = await http<{ results: Record<string, unknown>[] }>(`${TB}/${c.accountId}/campaigns/`, { headers: await tbHeaders(c) });
  return (r.results ?? []).map((x) => ({
    id: String(x.id),
    name: String(x.name ?? ""),
    status: String(x.status ?? ""),
    active: x.is_active === true,
    groupId: x.campaign_group_id ? String(x.campaign_group_id) : undefined,
  }));
}

export async function taboolaGroups(c: Credentials): Promise<GroupInfo[]> {
  const r = await http<{ results: { id: number | string; name: string; status: string }[] }>(`${TB}/${c.accountId}/campaigns_group`, {
    headers: await tbHeaders(c),
  });
  return (r.results ?? []).map((g) => ({ id: String(g.id), name: g.name, status: g.status }));
}

export type NewGroup = { name: string; marketingObjective: string; spendingLimitModel: string; spendingLimit: number; dailyCap?: number };

export async function taboolaCreateGroup(c: Credentials, g: NewGroup): Promise<GroupInfo> {
  const r = await http<{ id: number | string; name: string; status: string }>(`${TB}/${c.accountId}/campaigns_group`, {
    method: "POST",
    headers: await tbHeaders(c),
    body: JSON.stringify({
      name: g.name,
      marketing_objective: g.marketingObjective,
      spending_limit_model: g.spendingLimitModel,
      spending_limit: g.spendingLimit,
      ...(g.dailyCap ? { daily_cap: g.dailyCap, daily_ad_delivery_model: "STRICT" } : {}),
    }),
  });
  return { id: String(r.id), name: r.name, status: r.status };
}

const TB_DEVICE: Record<string, string> = { DESKTOP: "DESK", MOBILE: "PHON", TABLET: "TBLT" };

/** Campaign body from a setup (pure, exported for tests). */
export function taboolaCampaignBody(name: string, s: CampaignSetup, groupId?: string): Record<string, unknown> {
  const body: Record<string, unknown> = {
    name,
    branding_text: s.brandingText,
    bid_strategy: s.bidStrategy,
    marketing_objective: s.marketingObjective || "ONLINE_PURCHASES",
    is_active: false,
    country_targeting: s.countries.length ? { type: "INCLUDE", value: s.countries } : { type: "ALL", value: [] },
    platform_targeting:
      s.devices.length && s.devices.length < 3 ? { type: "INCLUDE", value: s.devices.map((d) => TB_DEVICE[d]) } : { type: "ALL", value: [] },
  };
  if (s.bidStrategy === "FIXED" || s.bidStrategy === "SMART") body.cpc = s.cpc;
  if (s.bidStrategy === "TARGET_CPA") body.cpa_goal = s.cpaGoal;
  if (s.trackingCode) body.tracking_code = s.trackingCode;
  if (groupId) body.campaign_group_id = Number(groupId);
  // In a group with shared budget the campaign may omit its own limit.
  if (s.spendingLimitModel && (!groupId || s.spendingLimit)) {
    body.spending_limit_model = s.spendingLimitModel;
    if (s.spendingLimitModel !== "NONE") body.spending_limit = s.spendingLimit;
  }
  if (s.dailyCap) {
    body.daily_cap = s.dailyCap;
    body.daily_ad_delivery_model = "STRICT";
  }
  return body;
}

export async function taboolaCreateCampaign(c: Credentials, name: string, s: CampaignSetup, groupId?: string): Promise<SourceCampaignInfo> {
  const r = await http<{ id: number | string; name: string; status: string }>(`${TB}/${c.accountId}/campaigns/`, {
    method: "POST",
    headers: await tbHeaders(c),
    body: JSON.stringify(taboolaCampaignBody(name, s, groupId)),
  });
  return { id: String(r.id), name: r.name, status: r.status, active: false };
}

export async function taboolaDuplicate(
  c: Credentials,
  sourceId: string,
  overrides: { name: string; includeItems: boolean },
): Promise<SourceCampaignInfo> {
  const r = await http<{ id: number | string; name: string; status: string }>(`${TB}/${c.accountId}/campaigns/${sourceId}/duplicate/`, {
    method: "POST",
    headers: await tbHeaders(c),
    body: JSON.stringify({ name: overrides.name, is_active: false, duplicate_settings: { include_items: overrides.includeItems } }),
  });
  // Make sure the copy is paused even if the account ignores is_active on duplicate.
  await http(`${TB}/${c.accountId}/campaigns/${r.id}/`, {
    method: "POST",
    headers: await tbHeaders(c),
    body: JSON.stringify({ is_active: false }),
  }).catch(() => {});
  return { id: String(r.id), name: r.name, status: r.status, active: false };
}

// -------------------------------- Revcontent ---------------------------------

export async function revcontentCampaigns(c: Credentials): Promise<SourceCampaignInfo[]> {
  const r = await rcGet<{ id: string; name: string; enabled: string; status: string }[]>(c, "/stats/api/v1.0/boosts", { limit: "1000" });
  return r.data.map((b) => ({ id: String(b.id), name: b.name, status: b.status, active: b.enabled === "active" }));
}

/** Revcontent device ids by our names, from the /devices helper. */
async function revcontentDeviceIds(c: Credentials, devices: string[]): Promise<string[]> {
  if (!devices.length || devices.length >= 3) return [];
  type Device = { id: string | number; name?: string; device?: string };
  const r = await rcGet<Device[]>(c, "/stats/api/v1.0/devices").catch(() => ({ success: false, data: [] as Device[] }));
  const want = devices.map((d) => (d === "DESKTOP" ? /desk|pc|computer/i : d === "MOBILE" ? /mobile|phone|smart/i : /tablet/i));
  return r.data.filter((x) => want.some((re) => re.test(String(x.name ?? x.device ?? "")))).map((x) => String(x.id));
}

/** Boost body from a setup (pure, exported for tests). */
export function revcontentBoostBody(name: string, s: CampaignSetup, deviceIds: string[]): Record<string, unknown> {
  const web = s.cpc ?? 0.1;
  return {
    name,
    bid_type: "cpc",
    budget: s.budget ? s.budget : "unlimited",
    pacing: s.pacing ? "on" : "off",
    optimize: s.bidStrategy === "cpa" ? "cpa" : "cpc",
    start_date: "immediately",
    end_date: "never",
    country_targeting: s.countries.length ? "include" : "all",
    ...(s.countries.length ? { country_codes: s.countries } : {}),
    ...(deviceIds.length ? { device_targeting: deviceIds } : {}),
    ...(s.trackingCode ? { tracking_code: s.trackingCode.slice(0, 255) } : {}),
    default_bids: { web, email: s.bidEmail ?? web, apple_news: s.bidAppleNews ?? web },
  };
}

async function rcPost<T>(c: Credentials, path: string, body: unknown): Promise<T> {
  return http<T>(`${RC}${path}`, {
    method: "POST",
    headers: { Authorization: `Bearer ${await revcontentToken(c)}`, "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

export async function revcontentCreateCampaign(c: Credentials, name: string, s: CampaignSetup): Promise<SourceCampaignInfo> {
  const body = revcontentBoostBody(name, s, await revcontentDeviceIds(c, s.devices));
  const r = await rcPost<{ success: boolean; data: { id: string | number }[] | { id: string | number } }>(c, "/stats/api/v1.0/boosts/add", body);
  const id = String(Array.isArray(r.data) ? r.data[0]?.id : r.data?.id);
  if (!id || id === "undefined") throw new Error("A Revcontent não devolveu o id da campanha criada.");
  await rcPost(c, "/stats/api/v1.0/boosts", { id: Number(id), enabled: "off" });
  return { id, name, status: "inactive", active: false };
}

/** Revcontent has no duplicate endpoint: new boost with the source's bid, budget and pacing. */
export async function revcontentDuplicate(c: Credentials, sourceId: string, name: string, fallback: CampaignSetup): Promise<SourceCampaignInfo> {
  const r = await rcGet<{ id: string; default_bid?: string; budget?: string; pacing?: string }[]>(c, "/stats/api/v1.0/boosts", {
    boost_id: sourceId,
  });
  const src = r.data[0];
  const setup: CampaignSetup = {
    ...fallback,
    cpc: src?.default_bid ? num(src.default_bid) : fallback.cpc,
    budget: src?.budget && src.budget !== "unlimited" ? num(src.budget) : fallback.budget,
    pacing: src?.pacing ? src.pacing === "on" || src.pacing === "1" : fallback.pacing,
  };
  return revcontentCreateCampaign(c, name, setup);
}
