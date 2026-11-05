/**
 * Ad-spend connectors for each traffic source. Every one returns the same
 * normalized SpendRow[] so the dashboard does not care where data came from.
 */
import type { Credentials, DateRange, SpendRow, TestResult } from "../types";
import { http, num } from "./http";

type Connector = {
  test: (c: Credentials) => Promise<TestResult>;
  fetchSpend: (c: Credentials, r: DateRange) => Promise<SpendRow[]>;
};

const today = () => new Date().toISOString().slice(0, 10);

/* ---------------------------------- Taboola --------------------------------- */
async function taboolaToken(c: Credentials) {
  const r = await http<{ access_token: string }>("https://backstage.taboola.com/backstage/oauth/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: c.clientId,
      client_secret: c.clientSecret,
      grant_type: "client_credentials",
    }),
  });
  return r.access_token;
}

const taboola: Connector = {
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

export const TRAFFIC_CONNECTORS: Record<string, Connector> = {
  taboola,
  outbrain,
  mediago,
  mgid,
  meta,
  googleads,
};
