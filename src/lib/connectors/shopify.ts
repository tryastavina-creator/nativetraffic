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
  if (c.accessToken) return c.accessToken;
  if (!c.clientId || !c.clientSecret) throw new Error("Informe o access token ou Client ID + Secret");
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
  );
  tokenCache.set(c.clientId, {
    token: res.access_token,
    expires: Date.now() + ((res.expires_in ?? 86_400) - 300) * 1000,
  });
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
      customerJourneySummary { lastVisit { utmParameters { source campaign } } }
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
    lastVisit: { utmParameters: { source: string | null; campaign: string | null } | null } | null;
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

export async function fetchOrders(c: Credentials, range: DateRange): Promise<Order[]> {
  const q = `created_at:>=${range.from}T00:00:00Z created_at:<=${range.to}T23:59:59Z -status:cancelled`;
  const out: Order[] = [];
  let after: string | null = null;
  for (let page = 0; page < 200; page++) {
    const d: { orders: { pageInfo: { hasNextPage: boolean; endCursor: string }; nodes: RawOrder[] } } =
      await gql(c, ORDERS_QUERY, { q, after });
    for (const o of d.orders.nodes) {
      const utm = o.customerJourneySummary?.lastVisit?.utmParameters;
      out.push({
        id: o.id,
        createdAt: o.createdAt,
        date: o.createdAt.slice(0, 10),
        total: num(o.totalPriceSet.shopMoney.amount),
        refunded: num(o.totalRefundedSet.shopMoney.amount),
        country: o.shippingAddress?.countryCodeV2,
        utmSource: utm?.source ?? undefined,
        utmCampaign: utm?.campaign ?? undefined,
        isSubscription: o.tags.some((t) => /subscription|recurring|kaching/i.test(t)),
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
