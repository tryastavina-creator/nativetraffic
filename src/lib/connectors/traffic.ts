/**
 * Ad-spend connectors for each traffic source. Every one returns the same
 * normalized SpendRow[] so the dashboard does not care where data came from.
 */
import type { Credentials, DateRange, SpendRow, TestResult } from "../types";
import { http, num } from "./http";

/** Spend of one campaign, as reported by the traffic source itself. */
export type SourceCampaign = {
  id: string;
  name: string;
  spend: number;
  clicks: number;
  conversions: number;
  status?: string;
  /** Landing URLs of the campaign's ads (RedTrack tracking links) — used to link it to the RedTrack campaign. */
  urls?: string[];
};

/** Group ad landing URLs by campaign id. */
const groupUrls = (rows: { campaign: string; url: string }[]) => {
  const m = new Map<string, Set<string>>();
  for (const r of rows) if (r.url) m.set(r.campaign, (m.get(r.campaign) ?? new Set()).add(r.url));
  return m;
};

type Connector = {
  test: (c: Credentials) => Promise<TestResult>;
  fetchSpend: (c: Credentials, r: DateRange) => Promise<SpendRow[]>;
  /** Per-campaign spend for the period (sources that support it). */
  campaigns?: (c: Credentials, r: DateRange) => Promise<SourceCampaign[]>;
};

const today = () => new Date().toISOString().slice(0, 10);

/* ---------------------------------- Taboola --------------------------------- */
const tbTokens = new Map<string, { token: string; expires: number }>();

export async function taboolaToken(c: Credentials) {
  const cached = tbTokens.get(c.clientId);
  if (cached && cached.expires > Date.now()) return cached.token;
  const r = await http<{ access_token: string; expires_in?: number }>("https://backstage.taboola.com/backstage/oauth/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: c.clientId,
      client_secret: c.clientSecret,
      grant_type: "client_credentials",
    }),
  });
  tbTokens.set(c.clientId, { token: r.access_token, expires: Date.now() + ((r.expires_in ?? 3600) - 120) * 1000 });
  return r.access_token;
}

const taboola: Connector = {
  async campaigns(c, range) {
    const token = await taboolaToken(c);
    const qs = new URLSearchParams({ start_date: range.from, end_date: range.to });
    const base = `https://backstage.taboola.com/backstage/api/1.0/${c.accountId}/reports`;
    const [r, items, camps] = await Promise.all([
      http<{ results: Record<string, unknown>[] }>(`${base}/campaign-summary/dimensions/campaign_breakdown?${qs}`, {
        headers: { Authorization: `Bearer ${token}` },
      }),
      http<{ results: Record<string, unknown>[] }>(`${base}/top-campaign-content/dimensions/item_breakdown?${qs}`, {
        headers: { Authorization: `Bearer ${token}` },
      }).catch(() => ({ results: [] as Record<string, unknown>[] })),
      // Campaign objects carry tracking_code (appended to every ad URL; usually holds the RedTrack campaign id).
      http<{ results: { id: string | number; tracking_code?: string }[] }>(
        `https://backstage.taboola.com/backstage/api/1.0/${c.accountId}/campaigns/`,
        { headers: { Authorization: `Bearer ${token}` } },
      ).catch(() => ({ results: [] as { id: string | number; tracking_code?: string }[] })),
    ]);
    const urls = groupUrls([
      ...(items.results ?? []).map((x) => ({ campaign: String(x.campaign ?? ""), url: String(x.url ?? "") })),
      ...(camps.results ?? []).map((x) => ({ campaign: String(x.id), url: String(x.tracking_code ?? "") })),
    ]);
    return (r.results ?? []).map((x) => ({
      urls: [...(urls.get(String(x.campaign ?? "")) ?? [])],
      id: String(x.campaign ?? ""),
      name: String(x.campaign_name ?? x.campaign ?? ""),
      spend: num(x.spent),
      clicks: num(x.clicks),
      conversions: num(x.cpa_actions_num),
    }));
  },
  async test(c) {
    const token = await taboolaToken(c);
    const r = await http<{ name?: string }>(
      `https://backstage.taboola.com/backstage/api/1.0/${c.accountId}/advertisers/${c.accountId}`,
      { headers: { Authorization: `Bearer ${token}` } },
    ).catch(() => ({ name: c.accountId }));
    return { ok: true, message: `Conectado (${r.name ?? c.accountId})` };
  },
  async fetchSpend(c, range) {
    const token = await taboolaToken(c);
    const qs = new URLSearchParams({ start_date: range.from, end_date: range.to });
    const r = await http<{ results: { date: string; spent: number; clicks: number; impressions: number }[] }>(
      `https://backstage.taboola.com/backstage/api/1.0/${c.accountId}/reports/campaign-summary/dimensions/day?${qs}`,
      { headers: { Authorization: `Bearer ${token}` } },
    );
    return r.results.map((x) => ({
      date: x.date.slice(0, 10),
      platform: "taboola",
      spend: num(x.spent),
      clicks: num(x.clicks),
      impressions: num(x.impressions),
    }));
  },
};

/* --------------------------------- Outbrain --------------------------------- */
async function outbrainToken(c: Credentials) {
  const r = await http<{ "OB-TOKEN-V1": string }>("https://api.outbrain.com/amplify/v0.1/login", {
    headers: { Authorization: `Basic ${Buffer.from(`${c.username}:${c.password}`).toString("base64")}` },
  });
  return r["OB-TOKEN-V1"];
}

const outbrain: Connector = {
  async campaigns(c, range) {
    const token = await outbrainToken(c);
    const qs = new URLSearchParams({ from: range.from, to: range.to, limit: "500" });
    const r = await http<{ results?: { metadata?: { id?: string; name?: string }; metrics?: Record<string, unknown> }[] }>(
      `https://api.outbrain.com/amplify/v0.1/reports/marketers/${c.marketerId}/campaigns?${qs}`,
      { headers: { "OB-TOKEN-V1": token } },
    );
    return (r.results ?? []).map((x) => ({
      id: String(x.metadata?.id ?? ""),
      name: String(x.metadata?.name ?? x.metadata?.id ?? ""),
      spend: num(x.metrics?.spend),
      clicks: num(x.metrics?.clicks),
      conversions: num(x.metrics?.conversions),
    }));
  },
  async test(c) {
    const token = await outbrainToken(c);
    const r = await http<{ name: string }>(`https://api.outbrain.com/amplify/v0.1/marketers/${c.marketerId}`, {
      headers: { "OB-TOKEN-V1": token },
    });
    return { ok: true, message: `Conectado (${r.name})` };
  },
  async fetchSpend(c, range) {
    const token = await outbrainToken(c);
    const qs = new URLSearchParams({ from: range.from, to: range.to, breakdown: "daily", limit: "500" });
    const r = await http<{
      results: { metadata: { id: string }; metrics: { spend: number; clicks: number; impressions: number } }[];
    }>(`https://api.outbrain.com/amplify/v0.1/reports/marketers/${c.marketerId}/periodic?${qs}`, {
      headers: { "OB-TOKEN-V1": token },
    });
    return r.results.map((x) => ({
      date: x.metadata.id.slice(0, 10),
      platform: "outbrain",
      spend: num(x.metrics.spend),
      clicks: num(x.metrics.clicks),
      impressions: num(x.metrics.impressions),
    }));
  },
};

/* ---------------------------------- MediaGo --------------------------------- */
// MediaGo does not publish a public API reference; the account manager provides
// the token and base URL. Adjust the path below to match the docs you receive.
const mediago: Connector = {
  async test(c) {
    await mediago.fetchSpend(c, { from: today(), to: today() });
    return { ok: true, message: "Token válido" };
  },
  async fetchSpend(c, range) {
    const base = c.baseUrl || "https://api.mediago.io";
    const qs = new URLSearchParams({ start_date: range.from, end_date: range.to, dimension: "day" });
    if (c.accountId) qs.set("account_id", c.accountId);
    const r = await http<{ data?: { list?: { date: string; cost: number; clicks: number; impressions: number }[] } }>(
      `${base}/report/v1/account?${qs}`,
      { headers: { Authorization: `Bearer ${c.apiToken}` } },
    );
    return (r.data?.list ?? []).map((x) => ({
      date: x.date.slice(0, 10),
      platform: "mediago",
      spend: num(x.cost),
      clicks: num(x.clicks),
      impressions: num(x.impressions),
    }));
  },
};

/* ----------------------------------- MGID ----------------------------------- */
async function mgidAuth(c: Credentials) {
  return http<{ token: string; idAuth: number }>("https://api.mgid.com/v1/auth/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ email: c.email, password: c.password }),
  });
}

const mgid: Connector = {
  async test(c) {
    const a = await mgidAuth(c);
    return { ok: true, message: `Conectado (client ${a.idAuth})` };
  },
  async fetchSpend(c, range) {
    const a = await mgidAuth(c);
    const qs = new URLSearchParams({
      token: a.token,
      dateInterval: "interval",
      startDate: range.from,
      endDate: range.to,
      timeGroup: "day",
    });
    const r = await http<Record<string, Record<string, { spent?: number; clicks?: number }>>>(
      `https://api.mgid.com/v1/goodhits/clients/${a.idAuth}/campaigns-stat?${qs}`,
    );
    const rows: SpendRow[] = [];
    // Shape: { campaignsStat: { [date]: { [campaignId]: { spent, clicks } } } } — sum per date.
    const stat = (r as unknown as { campaignsStat?: Record<string, Record<string, { spent?: number; clicks?: number }>> })
      .campaignsStat ?? {};
    for (const [date, byCampaign] of Object.entries(stat)) {
      let spend = 0;
      let clicks = 0;
      for (const v of Object.values(byCampaign)) {
        spend += num(v.spent);
        clicks += num(v.clicks);
      }
      rows.push({ date: date.slice(0, 10), platform: "mgid", spend, clicks });
    }
    return rows;
  },
};

/* --------------------------------- Meta Ads --------------------------------- */
/* -------------------------------- Revcontent -------------------------------- */
// Official spec: https://api.revcontent.io/docs/stats/api_data.json
export const RC = "https://api.revcontent.io";
const rcTokens = new Map<string, { token: string; expires: number }>();

export async function revcontentToken(c: Credentials) {
  const cached = rcTokens.get(c.clientId);
  if (cached && cached.expires > Date.now()) return cached.token;
  const r = await http<{ access_token: string; expires_in?: number }>(`${RC}/oauth/token`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ grant_type: "client_credentials", client_id: c.clientId, client_secret: c.clientSecret }),
  }).catch((e: Error) => {
    if (/invalid_client/.test(e.message)) {
      throw new Error(
        "Client ID ou Client secret inválidos. Use os dados de Account Settings → Stats API Credentials na Revcontent.",
      );
    }
    throw e;
  });
  rcTokens.set(c.clientId, { token: r.access_token, expires: Date.now() + ((r.expires_in ?? 86_400) - 600) * 1000 });
  return r.access_token;
}

export async function rcGet<T>(c: Credentials, path: string, params: Record<string, string> = {}) {
  const qs = new URLSearchParams(params);
  return http<{ success: boolean; data: T }>(`${RC}${path}${qs.size ? `?${qs}` : ""}`, {
    headers: { Authorization: `Bearer ${await revcontentToken(c)}`, "Content-Type": "application/json" },
  });
}

type RcPerf = { id?: string; date?: string; cost: string; clicks: string; impressions: string; conversions: string };

const revcontent: Connector & {
  campaigns: (c: Credentials, r: DateRange) => Promise<{ id: string; name: string; status: string; spend: number; clicks: number; conversions: number }[]>;
} = {
  async test(c) {
    const r = await rcGet<{ id: string }[]>(c, "/stats/api/v1.0/boosts", { limit: "1000" });
    return { ok: true, message: `Conectado (${r.data.length} campanhas)` };
  },
  async fetchSpend(c, range) {
    const r = await rcGet<RcPerf[]>(c, "/stats/api/v1.0/boosts/performance", {
      date_from: range.from,
      date_to: range.to,
      limit: "1000",
    });
    return r.data.map((x) => ({
      date: (x.date ?? range.from).slice(0, 10),
      platform: "revcontent",
      spend: num(x.cost),
      clicks: num(x.clicks),
      impressions: num(x.impressions),
      conversions: num(x.conversions),
    }));
  },
  async campaigns(c, range) {
    const [perf, list, content] = await Promise.all([
      rcGet<RcPerf[]>(c, "/stats/api/v1.0/boosts/performance", {
        date_from: range.from,
        date_to: range.to,
        all_boosts: "yes",
        limit: "1000",
      }),
      rcGet<{ id: string; name: string; enabled: string; status: string }[]>(c, "/stats/api/v1.0/boosts", { limit: "1000" }),
      rcGet<{ boost_id: string; target_url: string; utm_codes?: string }[]>(c, "/stats/api/v1.0/boosts/content", {
        date_from: range.from,
        date_to: range.to,
      }).catch(() => ({ success: false, data: [] as { boost_id: string; target_url: string; utm_codes?: string }[] })),
    ]);
    const byId = new Map(list.data.map((b) => [String(b.id), b]));
    const urls = groupUrls(
      content.data.flatMap((x) => [
        { campaign: String(x.boost_id), url: String(x.target_url ?? "") },
        { campaign: String(x.boost_id), url: String(x.utm_codes ?? "") },
      ]),
    );
    // all_boosts=yes returns one row per campaign *per day*: add the days up.
    const agg = new Map<string, { spend: number; clicks: number; conversions: number }>();
    for (const x of perf.data) {
      if (!x.id) continue;
      const a = agg.get(String(x.id)) ?? { spend: 0, clicks: 0, conversions: 0 };
      a.spend += num(x.cost);
      a.clicks += num(x.clicks);
      a.conversions += num(x.conversions);
      agg.set(String(x.id), a);
    }
    return [...agg.entries()].map(([id, a]) => ({
      id,
      urls: [...(urls.get(id) ?? [])],
      name: byId.get(id)?.name ?? `Campanha ${id}`,
      status: byId.get(id)?.enabled ?? "",
      ...a,
    }));
  },
};

const meta: Connector = {
  async test(c) {
    const r = await http<{ name: string; currency: string }>(
      `https://graph.facebook.com/v23.0/${c.adAccountId}?fields=name,currency&access_token=${encodeURIComponent(c.accessToken)}`,
    );
    return { ok: true, message: `Conectado (${r.name}, ${r.currency})` };
  },
  async fetchSpend(c, range) {
    const qs = new URLSearchParams({
      fields: "spend,clicks,impressions",
      time_increment: "1",
      time_range: JSON.stringify({ since: range.from, until: range.to }),
      access_token: c.accessToken,
      limit: "500",
    });
    const r = await http<{ data: { date_start: string; spend: string; clicks: string; impressions: string }[] }>(
      `https://graph.facebook.com/v23.0/${c.adAccountId}/insights?${qs}`,
    );
    return r.data.map((x) => ({
      date: x.date_start,
      platform: "meta",
      spend: num(x.spend),
      clicks: num(x.clicks),
      impressions: num(x.impressions),
    }));
  },
};

/* -------------------------------- Google Ads -------------------------------- */
async function googleToken(c: Credentials) {
  const r = await http<{ access_token: string }>("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: c.clientId,
      client_secret: c.clientSecret,
      refresh_token: c.refreshToken,
      grant_type: "refresh_token",
    }),
  });
  return r.access_token;
}

async function gaql<T>(c: Credentials, query: string): Promise<T> {
  const headers: Record<string, string> = {
    Authorization: `Bearer ${await googleToken(c)}`,
    "developer-token": c.developerToken,
    "Content-Type": "application/json",
  };
  if (c.loginCustomerId) headers["login-customer-id"] = c.loginCustomerId.replace(/-/g, "");
  return http<T>(
    `https://googleads.googleapis.com/v21/customers/${c.customerId.replace(/-/g, "")}/googleAds:search`,
    { method: "POST", headers, body: JSON.stringify({ query }) },
  );
}

const googleads: Connector = {
  async test(c) {
    const r = await gaql<{ results?: { customer: { descriptiveName: string } }[] }>(
      c,
      "SELECT customer.descriptive_name FROM customer LIMIT 1",
    );
    return { ok: true, message: `Conectado (${r.results?.[0]?.customer.descriptiveName ?? c.customerId})` };
  },
  async fetchSpend(c, range) {
    const r = await gaql<{
      results?: { segments: { date: string }; metrics: { costMicros: string; clicks: string; impressions: string } }[];
    }>(
      c,
      `SELECT segments.date, metrics.cost_micros, metrics.clicks, metrics.impressions FROM customer WHERE segments.date BETWEEN '${range.from}' AND '${range.to}'`,
    );
    return (r.results ?? []).map((x) => ({
      date: x.segments.date,
      platform: "googleads",
      spend: num(x.metrics.costMicros) / 1_000_000,
      clicks: num(x.metrics.clicks),
      impressions: num(x.metrics.impressions),
    }));
  },
};

export { revcontent };

export const TRAFFIC_CONNECTORS: Record<string, Connector> = {
  taboola,
  outbrain,
  mediago,
  mgid,
  revcontent,
  meta,
  googleads,
};
