import type { Credentials, DateRange, Order, TestResult } from "../types";
import { http, num } from "./http";

const API_VERSION = "2025-10";

function shopDomain(c: Credentials) {
  return c.shop.replace(/^https?:\/\//, "").replace(/\/.*$/, "");
}

const tokenCache = new Map<string, { token: string; expires: number }>();

/**
 * Accepts either a static Admin API token (shpat_…) or the Client ID / Secret
 * of an app created in the Shopify Dev Dashboard (client-credentials grant,
 * token valid ~24h, cached in memory).
 */
async function accessToken(c: Credentials): Promise<string> {
  if (c.accessToken) {
    const expiresAt = Number(c.tokenExpiresAt || 0);
    if (!expiresAt || expiresAt - 300_000 > Date.now() || !c.refreshToken) return c.accessToken;
    return refreshAccessToken(c);
  }
  if (!c.clientId || !c.clientSecret) throw new Error("Informe o Client ID e o Client secret do app da Shopify");
  const cached = tokenCache.get(c.clientId);
  if (cached && cached.expires > Date.now()) return cached.token;
  const res = await http<{ access_token: string; expires_in?: number }>(
    `https://${shopDomain(c)}/admin/oauth/access_token`,
    {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        grant_type: "client_credentials",
        client_id: c.clientId,
        client_secret: c.clientSecret,
      }),
    },
  ).catch((e: Error) => {
    if (/shop_not_permitted/.test(e.message)) {
      throw new Error(
        "Falta autorizar: o app e a loja estão em organizações diferentes. Clique em \"Autorizar na Shopify\" logo abaixo.",
      );
    }
    throw e;
  });
  tokenCache.set(c.clientId, {
    token: res.access_token,
    expires: Date.now() + ((res.expires_in ?? 86_400) - 300) * 1000,
  });
  return res.access_token;
}

/** Renews an expiring offline token from the install flow and persists it. */
async function refreshAccessToken(c: Credentials): Promise<string> {
  const cached = tokenCache.get(c.refreshToken);
  if (cached && cached.expires > Date.now()) return cached.token;
  const res = await http<{ access_token: string; expires_in?: number; refresh_token?: string }>(
    `https://${shopDomain(c)}/admin/oauth/access_token`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        client_id: c.clientId,
        client_secret: c.clientSecret,
        grant_type: "refresh_token",
        refresh_token: c.refreshToken,
      }),
    },
  );
  const expires = Date.now() + (res.expires_in ?? 3600) * 1000;
  tokenCache.set(c.refreshToken, { token: res.access_token, expires: expires - 300_000 });
  const { getConnection, saveConnection } = await import("../store");
  const conn = await getConnection("shopify");
  if (conn) {
    conn.credentials = {
      ...conn.credentials,
      accessToken: res.access_token,
      refreshToken: res.refresh_token ?? conn.credentials.refreshToken,
      tokenExpiresAt: String(expires),
    };
    await saveConnection(conn);
  }
  return res.access_token;
}

async function gql<T>(c: Credentials, query: string, variables: Record<string, unknown> = {}): Promise<T> {
  const res = await http<{ data?: T; errors?: unknown }>(
    `https://${shopDomain(c)}/admin/api/${API_VERSION}/graphql.json`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-Shopify-Access-Token": await accessToken(c) },
      body: JSON.stringify({ query, variables }),
    },
  );
  if (res.errors) throw new Error(JSON.stringify(res.errors).slice(0, 400));
  return res.data as T;
}

export async function test(c: Credentials): Promise<TestResult> {
  const d = await gql<{ shop: { name: string; currencyCode: string } }>(
    c,
    `{ shop { name currencyCode } }`,
  );
  return { ok: true, message: `Conectado a ${d.shop.name} (${d.shop.currencyCode})` };
}

const ORDERS_QUERY = `
query Orders($q: String!, $after: String) {
  orders(first: 100, after: $after, query: $q, sortKey: CREATED_AT) {
    pageInfo { hasNextPage endCursor }
    nodes {
      id
      createdAt
      totalPriceSet { shopMoney { amount } }
      totalRefundedSet { shopMoney { amount } }
      shippingAddress { countryCodeV2 }
      tags
      customerJourneySummary { lastVisit { source utmParameters { source campaign } } }
      lineItems(first: 30) {
        nodes {
          title
          quantity
          originalUnitPriceSet { shopMoney { amount } }
          variant { inventoryItem { unitCost { amount } } }
        }
      }
    }
  }
}`;

type RawOrder = {
  id: string;
  createdAt: string;
  totalPriceSet: { shopMoney: { amount: string } };
  totalRefundedSet: { shopMoney: { amount: string } };
  shippingAddress: { countryCodeV2: string } | null;
  tags: string[];
  customerJourneySummary: {
    lastVisit: {
      source: string | null;
      utmParameters: { source: string | null; campaign: string | null } | null;
    } | null;
  } | null;
  lineItems: {
    nodes: {
      title: string;
      quantity: number;
      originalUnitPriceSet: { shopMoney: { amount: string } };
      variant: { inventoryItem: { unitCost: { amount: string } | null } } | null;
    }[];
  };
};

/** Calendar day in the shop's timezone, so totals match Shopify Analytics. */
export function localDay(iso: string, timeZone: string) {
  return new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit", day: "2-digit" }).format(
    new Date(iso),
  );
}

export const UPSELL_TAG = /upsell|aftersell|zipify|ocu|order bump/i;

export async function fetchOrders(c: Credentials, range: DateRange): Promise<Order[]> {
  const { shop } = await gql<{ shop: { ianaTimezone: string } }>(c, `{ shop { ianaTimezone } }`);
  const tz = shop.ianaTimezone || "UTC";
  // Widen the UTC window by a day each side, then keep only days inside the range in shop time.
  const pad = (d: string, days: number) => {
    const x = new Date(`${d}T00:00:00Z`);
    x.setUTCDate(x.getUTCDate() + days);
    return x.toISOString().slice(0, 10);
  };
  const q = `created_at:>=${pad(range.from, -1)} created_at:<=${pad(range.to, 1)} -status:cancelled`;
  const out: Order[] = [];
  let after: string | null = null;
  for (let page = 0; page < 200; page++) {
    const d: { orders: { pageInfo: { hasNextPage: boolean; endCursor: string }; nodes: RawOrder[] } } =
      await gql(c, ORDERS_QUERY, { q, after });
    for (const o of d.orders.nodes) {
      const visit = o.customerJourneySummary?.lastVisit;
      const utm = visit?.utmParameters;
      const date = localDay(o.createdAt, tz);
      if (date < range.from || date > range.to) continue;
      out.push({
        id: o.id,
        createdAt: o.createdAt,
        date,
        total: num(o.totalPriceSet.shopMoney.amount),
        refunded: num(o.totalRefundedSet.shopMoney.amount),
        country: o.shippingAddress?.countryCodeV2,
        utmSource: utm?.source ?? undefined,
        utmCampaign: utm?.campaign ?? undefined,
        referrer: visit?.source ?? undefined,
        isSubscription: o.tags.some((t) => /subscription|recurring|kaching/i.test(t)),
        hasUpsell: o.tags.some((t) => UPSELL_TAG.test(t)),
        lines: o.lineItems.nodes.map((l) => ({
          product: l.title,
          quantity: l.quantity,
          price: num(l.originalUnitPriceSet.shopMoney.amount),
          unitCost: num(l.variant?.inventoryItem.unitCost?.amount),
        })),
      });
    }
    if (!d.orders.pageInfo.hasNextPage) break;
    after = d.orders.pageInfo.endCursor;
  }
  return out;
}
