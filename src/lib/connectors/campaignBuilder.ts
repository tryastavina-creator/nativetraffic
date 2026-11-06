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
import type { CampaignSchedule, CampaignSetup } from "../store";
import type { Credentials } from "../types";
import { isoCountry } from "../naming";
import { http, num } from "./http";
import { RC, rcGet, revcontentToken, taboolaToken } from "./traffic";

const TB = "https://backstage.taboola.com/backstage/api/1.0";

const tbHeaders = async (c: Credentials) => ({ Authorization: `Bearer ${await taboolaToken(c)}`, "Content-Type": "application/json" });

/** Accounts a campaign can be created in. A network account only holds advertiser accounts. */
export type TbAccount = { accountId: string; name: string; network: boolean; timeZone?: string };
const tbAccounts = new Map<string, { at: number; list: TbAccount[] }>();

export async function taboolaAdvertisers(c: Credentials): Promise<TbAccount[]> {
  const key = `${c.clientId}:${c.accountId}`;
  const hit = tbAccounts.get(key);
  if (hit && Date.now() - hit.at < 3600_000) return hit.list;
  let list: TbAccount[];
  try {
    const r = await http<{ results?: { account_id?: string; name?: string; type?: string; time_zone_name?: string }[] }>(
      `${TB}/${c.accountId}/advertisers`,
      { headers: await tbHeaders(c) },
    );
    list = (r.results ?? [])
      .filter((a) => a.account_id && a.type !== "NETWORK")
      .map((a) => ({ accountId: String(a.account_id), name: String(a.name ?? a.account_id), network: true, timeZone: a.time_zone_name }));
  } catch {
    list = [];
  }
  if (!list.length) list = [{ accountId: String(c.accountId), name: String(c.accountId), network: false }];
  tbAccounts.set(key, { at: Date.now(), list });
  return list;
}

const tzCache = new Map<string, string>();
/** Time zone of a Taboola account (dates like start_date are read in it). */
export async function taboolaTimeZone(c: Credentials): Promise<string | undefined> {
  const k = String(c.accountId);
  if (tzCache.has(k)) return tzCache.get(k) || undefined;
  let tz: string | undefined;
  for (const a of tbAccounts.values()) tz ??= a.list.find((x) => x.accountId === k)?.timeZone;
  if (!tz) {
    const me = await http<{ account_id?: string; time_zone_name?: string }>(`${TB}/users/current/account`, { headers: await tbHeaders(c) }).catch(() => ({}) as { account_id?: string; time_zone_name?: string });
    tz = me.time_zone_name;
  }
  tzCache.set(k, tz ?? "");
  return tz;
}

/** YYYY-MM-DD "today" in a time zone (falls back to UTC). */
export function todayIn(tz?: string, plusDays = 0) {
  const d = new Date(Date.now() + plusDays * 86400_000);
  try {
    return new Intl.DateTimeFormat("en-CA", { timeZone: tz || "UTC", year: "numeric", month: "2-digit", day: "2-digit" }).format(d);
  } catch {
    return d.toISOString().slice(0, 10);
  }
}

/**
 * Start date Taboola accepts: the chosen day, never before today in the account's time zone. Sent explicitly
 * because a campaign in an older group would otherwise inherit a start in the past.
 */
async function startDates(c: Credentials, chosen?: string): Promise<string[]> {
  const tz = await taboolaTimeZone(c).catch(() => undefined);
  // Known zone: today there. Unknown: earliest possible "today" first, moving forward only if refused.
  const base = tz ? [todayIn(tz), todayIn(tz, 1)] : [todayIn("Etc/GMT+12"), todayIn("UTC"), todayIn("Pacific/Kiritimati")];
  // "Today" (in the user's own calendar) means now: only a later day is a real scheduled start.
  const later = chosen && chosen > todayIn("Pacific/Kiritimati") ? chosen : undefined;
  return [...new Set(base.map((d) => (later && later > d ? later : d)))].sort();
}
const pastStart = (e: unknown) => /^400\b/.test(String((e as Error).message)) && /start.?date/i.test(String((e as Error).message)) && /past/i.test(String((e as Error).message));

/** POST with start_date, moving it forward only if Taboola says it is in its past (time zone drift). */
async function withStart<T>(c: Credentials, chosen: string | undefined, send: (start: string) => Promise<T>): Promise<T> {
  const dates = await startDates(c, chosen);
  let last: unknown;
  for (const d of dates) {
    try {
      return await send(d);
    } catch (e) {
      last = e;
      if (!pastStart(e)) throw e;
    }
  }
  throw last;
}

export type SourceCampaignInfo = {
  id: string;
  name: string;
  status: string;
  active: boolean;
  groupId?: string;
  /** Daily budget (US$); undefined when the budget lives in a shared group or is unlimited. */
  dailyBudget?: number;
};
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
    dailyBudget: num(x.daily_cap) > 0 ? num(x.daily_cap) : undefined,
  }));
}

export type GroupDetail = GroupInfo & {
  spendingLimitModel?: string;
  spendingLimit?: number;
  dailyCap?: number;
  distribution?: string;
  kpi?: string;
  kpiGoal?: number;
  /** Budget lives in the group (campaigns may omit theirs). */
  shared: boolean;
};

export async function taboolaGroup(c: Credentials, id: string): Promise<GroupDetail> {
  const g = await http<Record<string, unknown>>(`${TB}/${c.accountId}/campaigns_group/${id}`, { headers: await tbHeaders(c) });
  const model = g.spending_limit_model ? String(g.spending_limit_model) : undefined;
  const limit = g.spending_limit != null ? num(g.spending_limit) : undefined;
  const kd = g.kpi_data as { kpi_goal_value?: number } | undefined;
  return {
    id: String(g.id),
    name: String(g.name ?? ""),
    status: String(g.status ?? ""),
    spendingLimitModel: model,
    spendingLimit: limit,
    dailyCap: g.daily_cap != null ? num(g.daily_cap) : undefined,
    distribution: g.budget_distribution_method ? String(g.budget_distribution_method) : undefined,
    kpi: g.kpi ? String(g.kpi) : undefined,
    kpiGoal: kd?.kpi_goal_value != null ? num(kd.kpi_goal_value) : undefined,
    shared: !!model && model !== "NONE" && !!limit,
  };
}

export async function taboolaGroups(c: Credentials): Promise<GroupInfo[]> {
  const r = await http<{ results: { id: number | string; name: string; status: string }[] }>(`${TB}/${c.accountId}/campaigns_group`, {
    headers: await tbHeaders(c),
  });
  return (r.results ?? []).map((g) => ({ id: String(g.id), name: g.name, status: g.status }));
}

/**
 * New campaign group (official fields): budget either shared by the group (monthly / total limit + daily cap,
 * split by Taboola automatically or by you) or kept in each campaign; optional success KPI (ROAS, CPA…).
 */
export type NewGroup = {
  name: string;
  marketingObjective: string;
  /** "group" = shared budget in the group · "campaign" = each campaign has its own. */
  budgetMode: "group" | "campaign";
  spendingLimitModel: "MONTHLY" | "ENTIRE" | "NONE";
  spendingLimit: number;
  dailyCap?: number;
  /** AUTOMATIC = Taboola splits the group budget across campaigns (needs a limited budget). */
  distribution: "AUTOMATIC" | "CUSTOM";
  kpi?: "" | "ROAS" | "CPA" | "CPC" | "CTR" | "CPM";
  kpiGoal?: number;
  kpiThreshold?: number;
  startDate?: string;
  endDate?: string;
  active?: boolean;
};

export function taboolaGroupBody(g: NewGroup, start: string): Record<string, unknown> {
  const shared = g.budgetMode === "group";
  const body: Record<string, unknown> = {
    name: g.name,
    marketing_objective: g.marketingObjective || "ONLINE_PURCHASES",
    start_date: start,
    is_active: g.active !== false,
  };
  if (g.endDate) body.end_date = g.endDate;
  if (shared) {
    body.spending_limit_model = g.spendingLimitModel === "NONE" ? "MONTHLY" : g.spendingLimitModel;
    body.spending_limit = g.spendingLimit;
    body.budget_distribution_method = g.distribution;
    if (g.dailyCap) {
      body.daily_cap = g.dailyCap;
      body.daily_ad_delivery_model = "STRICT";
    }
  } else {
    body.spending_limit_model = "NONE";
    body.spending_limit = 0;
    body.budget_distribution_method = "CUSTOM";
  }
  if (g.kpi && g.kpiGoal) {
    body.kpi = g.kpi;
    body.kpi_data = { kpi_goal_value: g.kpiGoal, kpi_threshold_value: g.kpiThreshold || g.kpiGoal };
  }
  return body;
}

export async function taboolaCreateGroup(c: Credentials, g: NewGroup): Promise<GroupInfo & { note?: string }> {
  const post = (body: Record<string, unknown>) =>
    tbHeaders(c).then((headers) =>
      http<{ id: number | string; name: string; status: string }>(`${TB}/${c.accountId}/campaigns_group`, { method: "POST", headers, body: JSON.stringify(body) }),
    );
  let note: string | undefined;
  const r = await withStart(c, g.startDate, async (start) => {
    try {
      return await post(taboolaGroupBody(g, start));
    } catch (e) {
      // "No limit" groups are only for eligible accounts: keep budgets per campaign with a monthly cap that never binds first.
      if (g.budgetMode !== "campaign" || !/^400\b/.test(String((e as Error).message)) || !/spending/i.test(String((e as Error).message))) throw e;
      note = "a conta não aceita grupo sem limite: o grupo ficou com limite mensal alto e o orçamento continua em cada campanha";
      return post({ ...taboolaGroupBody(g, start), spending_limit_model: "MONTHLY", spending_limit: 1_000_000 });
    }
  });
  return { id: String(r.id), name: r.name, status: r.status, note };
}

const TB_DEVICE: Record<string, string> = { DESKTOP: "DESK", MOBILE: "PHON", TABLET: "TBLT" };
export const WEEK = ["MONDAY", "TUESDAY", "WEDNESDAY", "THURSDAY", "FRIDAY", "SATURDAY", "SUNDAY"];

/** Taboola activity_schedule from our schedule (same hours on each chosen day). */
export function taboolaSchedule(sc?: CampaignSchedule) {
  if (!sc || sc.mode !== "CUSTOM") return { mode: "ALWAYS", rules: [], ...(sc?.timeZone ? { time_zone: sc.timeZone } : {}) };
  const days = sc.days.length ? sc.days : WEEK;
  return {
    mode: "CUSTOM",
    rules: days.map((day) => ({ type: "INCLUDE", day, from_hour: String(sc.fromHour), until_hour: String(sc.untilHour) })),
    ...(sc.timeZone ? { time_zone: sc.timeZone } : {}),
  };
}

/** Our schedule from Taboola's activity_schedule (INCLUDE rules; first rule's hours). */
export function fromTaboolaSchedule(a: unknown): CampaignSchedule | undefined {
  const x = a as { mode?: string; rules?: { type?: string; day?: string; from_hour?: string | number; until_hour?: string | number }[]; time_zone?: string } | undefined;
  if (!x) return undefined;
  const inc = (x.rules ?? []).filter((r) => r.type !== "EXCLUDE" && r.day);
  if (x.mode !== "CUSTOM" || !inc.length) return { mode: "ALWAYS", days: WEEK, fromHour: 0, untilHour: 24, timeZone: x.time_zone };
  return {
    mode: "CUSTOM",
    days: WEEK.filter((d) => inc.some((r) => r.day === d)),
    fromHour: Number(inc[0].from_hour ?? 0),
    untilHour: Number(inc[0].until_hour ?? 24),
    timeZone: x.time_zone,
  };
}

const today = () => new Date().toISOString().slice(0, 10);
const uniq = (xs: string[]) => [...new Set(xs.map((x) => x.trim()).filter(Boolean))];

/** Campaign body from a setup (pure, exported for tests). */
export function taboolaCampaignBody(name: string, s: CampaignSetup, groupId?: string): Record<string, unknown> {
  const body: Record<string, unknown> = {
    name,
    branding_text: s.brandingText,
    bid_strategy: s.bidStrategy,
    marketing_objective: s.marketingObjective || "ONLINE_PURCHASES",
    is_active: false,
    country_targeting: s.countries.length ? { type: "INCLUDE", value: [...new Set(s.countries.map(isoCountry))] } : { type: "ALL", value: [] },
    platform_targeting:
      s.devices.length && s.devices.length < 3 ? { type: "INCLUDE", value: s.devices.map((d) => TB_DEVICE[d]) } : { type: "ALL", value: [] },
  };
  if (s.bidStrategy === "FIXED" || s.bidStrategy === "SMART") body.cpc = s.cpc;
  if (s.bidStrategy === "TARGET_CPA") body.cpa_goal = s.cpaGoal;
  if (s.trackingCode) body.tracking_code = s.trackingCode;
  if (groupId) body.campaign_group_id = Number(groupId);
  // In a group with a shared budget the campaign omits its own (Taboola allocates it).
  if (!(groupId && s.groupShared)) {
    if (s.spendingLimitModel && (!groupId || s.spendingLimit || s.spendingLimitModel === "NONE")) {
      body.spending_limit_model = s.spendingLimitModel;
      if (s.spendingLimitModel !== "NONE") body.spending_limit = s.spendingLimit;
    }
    if (s.dailyCap) {
      body.daily_cap = s.dailyCap;
      body.daily_ad_delivery_model = "STRICT";
    }
  }
  // Only what differs from Taboola's defaults (starts now, no end, always on).
  if (s.startDate && s.startDate > today()) body.start_date = s.startDate;
  if (s.endDate) body.end_date = s.endDate;
  if (s.schedule?.mode === "CUSTOM") body.activity_schedule = taboolaSchedule(s.schedule);
  if (s.trafficAllocation) body.traffic_allocation_mode = s.trafficAllocation;
  if (s.blockedSites?.length) body.publisher_targeting = { type: "EXCLUDE", value: uniq(s.blockedSites) };
  return body;
}

export async function taboolaCreateCampaign(c: Credentials, name: string, s: CampaignSetup, groupId?: string): Promise<SourceCampaignInfo> {
  const post = async (body: Record<string, unknown>) =>
    http<{ id: number | string; name: string; status: string }>(`${TB}/${c.accountId}/campaigns/`, {
      method: "POST",
      headers: await tbHeaders(c),
      body: JSON.stringify(body),
    });
  const r = await withStart(c, s.startDate, async (start) => {
    const body: Record<string, unknown> = { ...taboolaCampaignBody(name, s, groupId), start_date: start };
    try {
      return await post(body);
    } catch (e) {
      // "No spending limit" is only for eligible accounts (new accounts usually aren't): fall back to a monthly
      // limit that never binds before the daily budget does.
      const m = String((e as Error).message);
      if (!/^400\b/.test(m) || !/spending/i.test(m) || !body.spending_limit_model || body.spending_limit_model === "MONTHLY") throw e;
      return post({ ...body, spending_limit_model: "MONTHLY", spending_limit: Math.max(100, Math.round((s.dailyCap || 100) * 31)) });
    }
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

/** Full campaign object as Taboola returns it. */
export async function taboolaRaw(c: Credentials, id: string) {
  return http<Record<string, unknown>>(`${TB}/${c.accountId}/campaigns/${id}/`, { headers: await tbHeaders(c) });
}

/** Fields that mean the same thing in any account (no ids of the source account). */
const PORTABLE = [
  "branding_text",
  "tracking_code",
  "bid_strategy",
  "cpc",
  "cpa_goal",
  "daily_cap",
  "daily_ad_delivery_model",
  "spending_limit",
  "spending_limit_model",
  "marketing_objective",
  "country_targeting",
  "sub_country_targeting",
  "platform_targeting",
  "os_targeting",
  "browser_targeting",
  "connection_type_targeting",
  "activity_schedule",
  "traffic_allocation_mode",
  "external_brand_safety",
];
const cleanTargeting = (v: unknown) => {
  if (!v || typeof v !== "object" || Array.isArray(v)) return v;
  const o = { ...(v as Record<string, unknown>) };
  delete o.href;
  return o;
};

/**
 * New campaign based on a successful one ("template"): Taboola's own duplicate (keeps SpendGuard, conversion
 * rules, brand safety, schedule… everything the API knows), without its ads, with our overrides on top.
 * Works into another account of the same network (destination_account). If the network doesn't allow it,
 * falls back to a new campaign with every portable field of the template.
 */
export async function taboolaFromTemplate(
  src: Credentials,
  templateId: string,
  dst: Credentials,
  name: string,
  s: CampaignSetup,
  groupId: string | undefined,
): Promise<SourceCampaignInfo & { how: string }> {
  const tpl = await taboolaRaw(src, templateId);
  // A campaign read through a network account belongs to one of its advertisers.
  const owner = tpl.advertiser_id ? String(tpl.advertiser_id) : String(src.accountId);
  src = { ...src, accountId: owner };
  const cross = owner !== String(dst.accountId);
  const inheritBlocks = s.inheritBlocks !== false;
  const inheritBids = s.inheritBidModifiers === true;
  if (cross && tpl.campaign_group_id && !groupId) throw new Error("Escolha o grupo de campanhas da conta destino (o grupo da campanha modelo é de outra conta).");

  const overrides = taboolaCampaignBody(name, s, groupId);
  delete overrides.marketing_objective; // follows the template
  // the template's start is in the past: today in the destination account's zone (set below)
  overrides.end_date = s.endDate || "9999-12-31"; // the template may have ended
  overrides.activity_schedule = taboolaSchedule(s.schedule ?? { mode: "ALWAYS", days: [], fromHour: 0, untilHour: 24, timeZone: (tpl.activity_schedule as { time_zone?: string })?.time_zone });
  if (tpl.daily_ad_delivery_model) delete overrides.daily_ad_delivery_model; // keep the template's pacing
  const tplBlocks = ((tpl.publisher_targeting as { type?: string; value?: string[] } | null)?.type === "EXCLUDE"
    ? ((tpl.publisher_targeting as { value?: string[] }).value ?? [])
    : []) as string[];
  if (s.blockedSites?.length) overrides.publisher_targeting = { type: "EXCLUDE", value: uniq([...(inheritBlocks ? tplBlocks : []), ...s.blockedSites]) };

  try {
    const q = cross ? `?destination_account=${encodeURIComponent(String(dst.accountId))}` : "";
    const r = await withStart(dst, s.startDate, async (start) => http<{ id: number | string; name: string; status: string }>(`${TB}/${src.accountId}/campaigns/${templateId}/duplicate/${q}`, {
      method: "POST",
      headers: await tbHeaders(src),
      body: JSON.stringify({
        ...overrides,
        start_date: start,
        is_active: false,
        duplicate_settings: {
          include_items: false,
          include_blocked_publishers: inheritBlocks,
          include_publisher_bid_modifiers: inheritBids,
          include_third_party_tracking: true,
        },
      }),
    }));
    await http(`${TB}/${dst.accountId}/campaigns/${r.id}/`, { method: "POST", headers: await tbHeaders(dst), body: JSON.stringify({ is_active: false }) }).catch(() => {});
    return { id: String(r.id), name: r.name, status: r.status, active: false, how: cross ? "duplicada da campanha modelo para a outra conta" : "duplicada da campanha modelo" };
  } catch (e) {
    if (!cross) throw e;
    // Network doesn't allow cross-account duplicate with these credentials: rebuild from the template's fields.
    const body: Record<string, unknown> = {};
    for (const k of PORTABLE) if (tpl[k] !== undefined && tpl[k] !== null) body[k] = cleanTargeting(tpl[k]);
    Object.assign(body, overrides, { is_active: false });
    body.start_date = (await startDates(dst, s.startDate))[0];
    if (!s.blockedSites?.length && inheritBlocks && tplBlocks.length) body.publisher_targeting = { type: "EXCLUDE", value: tplBlocks };
    if (inheritBids && tpl.publisher_bid_modifier) body.publisher_bid_modifier = tpl.publisher_bid_modifier;
    const r = await http<{ id: number | string; name: string; status: string }>(`${TB}/${dst.accountId}/campaigns/`, {
      method: "POST",
      headers: await tbHeaders(dst),
      body: JSON.stringify(body),
    });
    return { id: String(r.id), name: r.name, status: r.status, active: false, how: "criada na outra conta com o setup da campanha modelo" };
  }
}

// -------------------------------- Revcontent ---------------------------------

export async function revcontentCampaigns(c: Credentials): Promise<SourceCampaignInfo[]> {
  const r = await rcGet<{ id: string; name: string; enabled: string; status: string; budget?: string }[]>(c, "/stats/api/v1.0/boosts", { limit: "1000" });
  return r.data.map((b) => ({
    id: String(b.id),
    name: b.name,
    status: b.status,
    active: b.enabled === "active",
    dailyBudget: b.budget && b.budget !== "unlimited" && num(b.budget) > 0 ? num(b.budget) : undefined,
  }));
}

/** Revcontent device ids by our names, from the /devices helper. */
async function revcontentDeviceIds(c: Credentials, devices: string[]): Promise<string[]> {
  if (!devices.length || devices.length >= 3) return [];
  type Device = { id: string | number; name?: string; device?: string };
  const r = await rcGet<Device[]>(c, "/stats/api/v1.0/devices").catch(() => ({ success: false, data: [] as Device[] }));
  const want = devices.map((d) => (d === "DESKTOP" ? /desk|pc|computer/i : d === "MOBILE" ? /mobile|phone|smart/i : /tablet/i));
  return r.data.filter((x) => want.some((re) => re.test(String(x.name ?? x.device ?? "")))).map((x) => String(x.id));
}

/** Our device names for Revcontent device ids. */
async function revcontentDeviceNames(c: Credentials, ids: string[]): Promise<("DESKTOP" | "MOBILE" | "TABLET")[]> {
  if (!ids.length) return [];
  type Device = { id: string | number; name?: string; device?: string };
  const r = await rcGet<Device[]>(c, "/stats/api/v1.0/devices").catch(() => ({ success: false, data: [] as Device[] }));
  const out = new Set<"DESKTOP" | "MOBILE" | "TABLET">();
  for (const d of r.data) {
    if (!ids.map(String).includes(String(d.id))) continue;
    const n = String(d.name ?? d.device ?? "");
    if (/desk|pc|computer/i.test(n)) out.add("DESKTOP");
    else if (/tablet/i.test(n)) out.add("TABLET");
    else if (/mobile|phone|smart/i.test(n)) out.add("MOBILE");
  }
  return [...out];
}

/** Boost body from a setup (pure, exported for tests). */
/** Revcontent schedule = hours of the day the campaign is on (no per-day rules). */
export function revcontentHours(sc?: CampaignSchedule): number[] | undefined {
  if (!sc || sc.mode !== "CUSTOM") return undefined;
  const out: number[] = [];
  for (let h = sc.fromHour; h < sc.untilHour && h < 24; h++) out.push(h);
  return out.length && out.length < 24 ? out : undefined;
}

export function revcontentBoostBody(name: string, s: CampaignSetup, deviceIds: string[]): Record<string, unknown> {
  const web = s.cpc ?? 0.1;
  const hours = revcontentHours(s.schedule);
  const cpa = s.bidStrategy === "cpa" && !!s.conversionId;
  return {
    name,
    bid_type: "cpc",
    budget: s.budget ? Math.max(50, s.budget) : "unlimited",
    ...(s.budget ? { pacing: s.pacing ? "on" : "off" } : {}),
    optimize: cpa ? "cpa" : "cpc",
    ...(cpa ? { conversion: { id: s.conversionId } } : {}),
    ...(hours ? { schedule: hours } : {}),
    start_date: s.startDate && s.startDate > today() ? `${s.startDate} 00:00:00` : "immediately",
    end_date: s.endDate ? `${s.endDate} 23:59:59` : "never",
    country_targeting: s.countries.length ? "include" : "all",
    ...(s.countries.length ? { country_codes: [...new Set(s.countries.map(isoCountry))] } : {}),
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
  if (s.blockedSites?.length) await revcontentBlock(c, id, s.blockedSites).catch(() => {});
  return { id, name, status: "inactive", active: false };
}

/** Widget ids blocked on a Revcontent campaign. */
export async function revcontentBlocked(c: Credentials, boostId: string): Promise<string[]> {
  const r = await rcGet<{ id: string | number }[]>(c, `/stats/api/v1.0/boosts/${boostId}/targets/blacklist/widgets`).catch(() => ({
    success: false,
    data: [] as { id: string | number }[],
  }));
  return r.data.map((x) => String(x.id));
}

export async function revcontentBlock(c: Credentials, boostId: string, widgets: string[]) {
  const ids = uniq(widgets).filter((w) => /^\d+$/.test(w));
  for (let i = 0; i < ids.length; i += 200) {
    await rcPost(c, `/stats/api/v1.0/boosts/${boostId}/targets/blacklist/widgets/add`, { boost_id: Number(boostId), id: ids.slice(i, i + 200).join(",") });
  }
}

/** Conversion pixels of the Revcontent account (needed to optimize for CPA). */
export async function revcontentConversions(c: Credentials): Promise<{ id: string; name: string }[]> {
  const r = await rcGet<{ id: string | number; name: string }[]>(c, "/stats/api/v1.0/conversions").catch(() => ({
    success: false,
    data: [] as { id: string | number; name: string }[],
  }));
  return r.data.map((x) => ({ id: String(x.id), name: x.name }));
}

/** Revcontent has no duplicate endpoint: new boost with the source's bid, budget and pacing. */
export async function revcontentDuplicate(c: Credentials, sourceId: string, name: string, fallback: CampaignSetup): Promise<SourceCampaignInfo> {
  const d = await revcontentDetail(c, sourceId);
  const blocked = fallback.inheritBlocks === false ? [] : await revcontentBlocked(c, sourceId);
  const setup: CampaignSetup = {
    ...fallback,
    cpc: d.setup.cpc ?? fallback.cpc,
    budget: d.setup.budget ?? fallback.budget,
    pacing: d.setup.pacing,
    countries: fallback.countries.length ? fallback.countries : d.setup.countries,
    conversionId: fallback.conversionId ?? d.setup.conversionId,
    schedule: fallback.schedule ?? d.setup.schedule,
    trackingCode: fallback.trackingCode ?? d.setup.trackingCode,
    blockedSites: uniq([...blocked, ...(fallback.blockedSites ?? [])]),
  };
  return revcontentCreateCampaign(c, name, setup);
}

/** Copies a Revcontent template campaign's blocked widgets into the setup (when asked). */
export async function revcontentTemplateBlocks(c: Credentials, templateId: string, s: CampaignSetup): Promise<string[]> {
  if (s.inheritBlocks === false) return s.blockedSites ?? [];
  return uniq([...(await revcontentBlocked(c, templateId)), ...(s.blockedSites ?? [])]);
}

// ------------------------------ read / edit existing ------------------------------

export type ExistingItem = {
  id: string;
  title: string;
  thumbnail: string;
  url: string;
  active: boolean;
  status: string;
  description?: string;
  /** Taboola CTA type ("" = none). */
  cta?: string;
};
export type CampaignDetail = {
  platform: "taboola" | "revcontent";
  /** Taboola: advertiser account that owns the campaign (differs from the connection when it is a network). */
  owner?: string;
  campaignId: string;
  name: string;
  setup: CampaignSetup;
  groupId?: string;
  items: ExistingItem[];
  /** Landing URL of the ads (the RedTrack link), from the first ad. */
  url: string;
};

const FROM_TB_DEVICE: Record<string, "DESKTOP" | "MOBILE" | "TABLET"> = { DESK: "DESKTOP", PHON: "MOBILE", TBLT: "TABLET" };
const https = (u: string) => u.replace(/^http:\/\//, "https://");

export async function taboolaDetail(c: Credentials, id: string): Promise<CampaignDetail> {
  const h = await tbHeaders(c);
  const x = await http<Record<string, unknown>>(`${TB}/${c.accountId}/campaigns/${id}/`, { headers: h });
  const owner = x.advertiser_id ? String(x.advertiser_id) : String(c.accountId);
  const items = await http<{ results: Record<string, unknown>[] }>(`${TB}/${owner}/campaigns/${id}/items/`, { headers: h }).catch(() => ({
    results: [] as Record<string, unknown>[],
  }));
  const ct = x.country_targeting as { type?: string; value?: string[] } | undefined;
  const pt = x.platform_targeting as { type?: string; value?: string[] } | undefined;
  const list: ExistingItem[] = (items.results ?? []).map((i) => ({
    id: String(i.id),
    title: String(i.title ?? ""),
    description: i.description ? String(i.description) : "",
    cta: (i.cta as { cta_type?: string } | null)?.cta_type && (i.cta as { cta_type?: string }).cta_type !== "NONE" ? String((i.cta as { cta_type?: string }).cta_type) : "",
    thumbnail: https(String(i.thumbnail_url ?? "")),
    url: String(i.url ?? ""),
    active: i.is_active === true,
    status: String(i.status ?? ""),
  }));
  return {
    platform: "taboola",
    owner,
    campaignId: String(x.id),
    name: String(x.name ?? ""),
    groupId: x.campaign_group_id ? String(x.campaign_group_id) : undefined,
    url: list.find((i) => i.url)?.url ?? "",
    items: list,
    setup: {
      product: "",
      countries: ct?.type === "INCLUDE" ? (ct.value ?? []) : [],
      devices: pt?.type === "INCLUDE" ? (pt.value ?? []).map((d) => FROM_TB_DEVICE[d]).filter(Boolean) : ["DESKTOP", "MOBILE", "TABLET"],
      bidStrategy: String(x.bid_strategy ?? "FIXED"),
      cpc: x.cpc != null ? num(x.cpc) : undefined,
      cpaGoal: x.cpa_goal != null ? num(x.cpa_goal) : undefined,
      spendingLimitModel: String(x.spending_limit_model ?? "MONTHLY"),
      spendingLimit: x.spending_limit != null ? num(x.spending_limit) : undefined,
      dailyCap: x.daily_cap != null ? num(x.daily_cap) : undefined,
      marketingObjective: String(x.marketing_objective ?? "ONLINE_PURCHASES"),
      brandingText: String(x.branding_text ?? ""),
      trackingCode: x.tracking_code ? String(x.tracking_code) : undefined,
      schedule: fromTaboolaSchedule(x.activity_schedule),
      trafficAllocation: x.traffic_allocation_mode === "EVEN" ? "EVEN" : "OPTIMIZED",
      endDate: x.end_date && String(x.end_date) < "9999" && String(x.end_date) >= today() ? String(x.end_date) : undefined,
      templateInfo: {
        blockedSites:
          (x.publisher_targeting as { type?: string; value?: string[] } | null)?.type === "EXCLUDE"
            ? ((x.publisher_targeting as { value?: string[] }).value ?? []).length
            : 0,
        bidModifiers: ((x.publisher_bid_modifier as { values?: unknown[] } | null)?.values ?? []).length,
        timeZone: (x.activity_schedule as { time_zone?: string } | undefined)?.time_zone,
      },
    },
  };
}

export async function taboolaUpdate(c: Credentials, id: string, name: string, s: CampaignSetup) {
  const body = taboolaCampaignBody(name, s);
  delete body.is_active; // keep the current on/off state
  delete body.marketing_objective; // fixed after creation on most accounts
  if (!s.startDate || s.startDate <= today()) delete body.start_date; // never move a running campaign's start
  if (!s.blockedSites?.length) delete body.publisher_targeting; // keep the blocks it already has
  await http(`${TB}/${c.accountId}/campaigns/${id}/`, { method: "POST", headers: await tbHeaders(c), body: JSON.stringify(body) });
}

export async function taboolaUpdateItem(
  c: Credentials,
  campaignId: string,
  itemId: string,
  p: { title?: string; active?: boolean; description?: string; cta?: string },
) {
  const body: Record<string, unknown> = {};
  if (p.title !== undefined) body.title = p.title;
  if (p.description !== undefined) body.description = p.description.slice(0, 250);
  if (p.cta !== undefined) body.cta = { cta_type: p.cta || "NONE" };
  if (p.active !== undefined) body.is_active = p.active;
  await http(`${TB}/${c.accountId}/campaigns/${campaignId}/items/${itemId}/`, {
    method: "POST",
    headers: await tbHeaders(c),
    body: JSON.stringify(body),
  });
}

export async function revcontentDetail(c: Credentials, id: string): Promise<CampaignDetail> {
  const [b, content] = await Promise.all([
    rcGet<Record<string, unknown>[]>(c, "/stats/api/v1.0/boosts", { boost_id: id }),
    rcGet<Record<string, unknown>[]>(c, `/stats/api/v1.0/boosts/${id}/content`, { limit: "1000" }).catch(() => ({
      success: false,
      data: [] as Record<string, unknown>[],
    })),
  ]);
  const x = b.data[0] ?? {};
  const items: ExistingItem[] = content.data
    .filter((i) => i.admin_status !== "deleted")
    .map((i) => ({
      id: String(i.content_id),
      title: String(i.headline ?? ""),
      description: i.description ? String(i.description) : "",
      thumbnail: https(String(i.image_url ?? "")),
      url: String(i.target_url ?? ""),
      active: i.enabled === "active",
      status: String(i.admin_status ?? ""),
    }));
  const budget = String(x.budget ?? "");
  const devNames = await revcontentDeviceNames(c, (x.device_targeting as string[] | undefined) ?? []);
  const hours = Array.isArray(x.schedule) ? (x.schedule as (string | number)[]).map(Number).sort((a, b) => a - b) : [];
  const pixels = (x.pixels as { id?: string | number }[] | undefined) ?? [];
  const blocked = await revcontentBlocked(c, id);
  return {
    platform: "revcontent",
    campaignId: id,
    name: String(x.name ?? ""),
    url: items.find((i) => i.url)?.url ?? "",
    items,
    setup: {
      product: "",
      countries: x.country_targeting === "include" ? ((x.country_codes as string[] | undefined) ?? []) : [],
      devices: devNames.length ? devNames : ["DESKTOP", "MOBILE", "TABLET"],
      bidStrategy: x.optimize === "cpa" ? "cpa" : "cpc",
      conversionId: pixels[0]?.id != null ? String(pixels[0].id) : undefined,
      cpc: x.default_bid != null ? num(x.default_bid) : undefined,
      budget: budget && budget !== "unlimited" ? num(budget) : undefined,
      pacing: String(x.pacing ?? "") === "on" || x.pacing === 1 || x.pacing === "1",
      brandingText: "",
      trackingCode: x.utm_codes ? String(x.utm_codes).slice(0, 255) : undefined,
      schedule: hours.length && hours.length < 24 ? { mode: "CUSTOM", days: WEEK, fromHour: hours[0], untilHour: hours[hours.length - 1] + 1 } : undefined,
      templateInfo: { blockedSites: blocked.length, bidModifiers: 0 },
    },
  };
}

export async function revcontentUpdate(c: Credentials, id: string, name: string, s: CampaignSetup) {
  const deviceIds = await revcontentDeviceIds(c, s.devices);
  const web = s.cpc ?? 0.1;
  await rcPost(c, `/stats/api/v1.0/boosts/${id}/settings`, {
    boost_id: Number(id),
    name,
    budget_type: s.budget ? "daily" : "unlimited",
    ...(s.budget ? { budget_amount: Math.max(50, s.budget), pacing: s.pacing ? "on" : "off" } : {}),
    optimize: s.bidStrategy === "cpa" && s.conversionId ? "cpa" : "cpc",
    ...(s.bidStrategy === "cpa" && s.conversionId ? { conversion: { id: s.conversionId } } : {}),
    ...(revcontentHours(s.schedule) ? { schedule: revcontentHours(s.schedule) } : {}),
    ...(s.countries.length ? { country_targeting: "include", country_codes: [...new Set(s.countries.map(isoCountry))] } : { country_targeting: "all" }),
    ...(deviceIds.length ? { device_targeting: deviceIds } : {}),
    default_bids: { web, email: s.bidEmail ?? web, apple_news: s.bidAppleNews ?? web },
  });
}

export async function revcontentUpdateItem(
  c: Credentials,
  boostId: string,
  contentId: string,
  p: { title?: string; active?: boolean; description?: string },
) {
  await rcPost(c, `/stats/api/v1.0/boosts/${boostId}/content`, {
    boost_id: Number(boostId),
    id: Number(contentId),
    ...(p.title !== undefined ? { headline: p.title.slice(0, 80) } : {}),
    ...(p.description !== undefined ? { description: p.description.slice(0, 250) } : {}),
    ...(p.active !== undefined ? { enabled: p.active ? "on" : "off" } : {}),
  });
}

/** Taboola native duplicate with field overrides (same account). */
export async function taboolaDuplicateWith(
  c: Credentials,
  sourceId: string,
  name: string,
  s: CampaignSetup,
  includeItems: boolean,
): Promise<SourceCampaignInfo> {
  const overrides = taboolaCampaignBody(name, s);
  delete overrides.marketing_objective;
  const r = await http<{ id: number | string; name: string; status: string }>(`${TB}/${c.accountId}/campaigns/${sourceId}/duplicate/`, {
    method: "POST",
    headers: await tbHeaders(c),
    body: JSON.stringify({ ...overrides, is_active: false, duplicate_settings: { include_items: includeItems } }),
  });
  await http(`${TB}/${c.accountId}/campaigns/${r.id}/`, {
    method: "POST",
    headers: await tbHeaders(c),
    body: JSON.stringify({ is_active: false }),
  }).catch(() => {});
  return { id: String(r.id), name: r.name, status: r.status, active: false };
}

/** Turns a just-created campaign and its new ads on (when the user chose "ativada"). */
export async function taboolaActivate(c: Credentials, campaignId: string, itemIds: string[]) {
  const h = await tbHeaders(c);
  await http(`${TB}/${c.accountId}/campaigns/${campaignId}/`, { method: "POST", headers: h, body: JSON.stringify({ is_active: true }) });
  for (const id of itemIds)
    await http(`${TB}/${c.accountId}/campaigns/${campaignId}/items/${id}/`, { method: "POST", headers: h, body: JSON.stringify({ is_active: true }) });
}

export async function revcontentActivate(c: Credentials, boostId: string, contentIds: string[]) {
  await rcPost(c, "/stats/api/v1.0/boosts", { id: Number(boostId), enabled: "on" });
  for (const id of contentIds) await rcPost(c, `/stats/api/v1.0/boosts/${boostId}/content`, { boost_id: Number(boostId), id: Number(id), enabled: "on" });
}

/** Turns a campaign on or off (Tráfego toggle). */
export async function setCampaignActive(platform: "taboola" | "revcontent", c: Credentials, campaignId: string, active: boolean) {
  if (platform === "taboola")
    await http(`${TB}/${c.accountId}/campaigns/${campaignId}/`, { method: "POST", headers: await tbHeaders(c), body: JSON.stringify({ is_active: active }) });
  else await rcPost(c, "/stats/api/v1.0/boosts", { id: Number(campaignId), enabled: active ? "on" : "off" });
}
