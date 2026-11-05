import "server-only";
import { TRAFFIC_CONNECTORS, redtrack, shopify } from "./connectors";
import { eachDay } from "./connectors/http";
import { demoData } from "./demo";
import { PLATFORM_LABEL, platformFromUtm } from "./registry";
import { getSettings, listConnections } from "./store";
import type { DateRange, Order, SpendRow } from "./types";

export type PlatformRow = {
  platform: string;
  label: string;
  orders: number;
  spend: number;
  revenue: number;
  aov: number;
  refundRate: number;
  profit: number;
  roas: number;
  cpa: number;
};

export type Metrics = {
  range: DateRange;
  currency: string;
  dataSources: { orders: string; spend: string[]; demo: boolean };
  warnings: string[];
  kpis: {
    investment: number;
    revenue: number;
    netProfit: number;
    margin: number;
    roas: number;
    sales: number;
    aov: number;
    cpa: number;
    refunds: number;
    refundRate: number;
    productCost: number;
    fees: number;
    trackedSales: number;
  };
  daily: { date: string; revenue: number; investment: number; profit: number; margin: number }[];
  platforms: PlatformRow[];
  products: { product: string; units: number; orders: number; revenue: number; cost: number; aov: number }[];
};

const sum = (xs: number[]) => xs.reduce((a, b) => a + b, 0);
const div = (a: number, b: number) => (b ? a / b : 0);

export async function computeMetrics(range: DateRange): Promise<Metrics> {
  const [connections, settings] = await Promise.all([listConnections(), getSettings()]);
  const byProvider = new Map(connections.map((c) => [c.provider, c]));
  const warnings: string[] = [];

  let orders: Order[] = [];
  let spend: SpendRow[] = [];
  const spendSources: string[] = [];
  let ordersSource = "demo";

  const shop = byProvider.get("shopify");
  if (shop) {
    try {
      orders = await shopify.fetchOrders(shop.credentials, range);
      ordersSource = "shopify";
    } catch (e) {
      warnings.push(`Shopify: ${(e as Error).message}`);
    }
  }

  const rt = byProvider.get("redtrack");
  const useRedtrack = rt && settings.spendSource === "redtrack";
  if (useRedtrack) {
    try {
      spend = await redtrack.fetchSpend(rt.credentials, range);
      spendSources.push("redtrack");
    } catch (e) {
      warnings.push(`RedTrack: ${(e as Error).message}`);
    }
  } else {
    const jobs = Object.entries(TRAFFIC_CONNECTORS)
      .filter(([id]) => byProvider.has(id))
      .map(async ([id, conn]) => {
        try {
          const rows = await conn.fetchSpend(byProvider.get(id)!.credentials, range);
          spendSources.push(id);
          return rows;
        } catch (e) {
          warnings.push(`${PLATFORM_LABEL[id] ?? id}: ${(e as Error).message}`);
          return [];
        }
      });
    spend = (await Promise.all(jobs)).flat();
    // Fall back to RedTrack cost for platforms without a direct API connection.
    if (rt) {
      try {
        const rtRows = await redtrack.fetchSpend(rt.credentials, range);
        const covered = new Set(spendSources);
        const extra = rtRows.filter((r) => !covered.has(r.platform));
        if (extra.length) {
          spend.push(...extra);
          spendSources.push("redtrack");
        }
      } catch (e) {
        warnings.push(`RedTrack: ${(e as Error).message}`);
      }
    }
  }

  const demo = ordersSource === "demo" && spendSources.length === 0;
  if (demo) {
    const d = demoData(range);
    orders = d.orders;
    spend = d.spend;
  }

  // ---------- aggregate ----------
  const feeFor = (o: Order) => o.total * (settings.paymentFeePercent / 100) + settings.paymentFeeFixed;
  const costFor = (o: Order) =>
    sum(
      o.lines.map(
        (l) => l.quantity * (l.unitCost || (l.price * settings.defaultCogsPercent) / 100),
      ),
    );
  const platformOf = (o: Order) => (o.isSubscription ? "subscription" : platformFromUtm(o.utmSource));

  const revenue = sum(orders.map((o) => o.total));
  const refunds = sum(orders.map((o) => o.refunded));
  const productCost = sum(orders.map(costFor));
  const fees = sum(orders.map(feeFor));
  const investment = sum(spend.map((s) => s.spend));
  const netProfit = revenue - refunds - productCost - fees - investment;
  const trackedSales = orders.filter((o) => {
    const p = platformOf(o);
    return p !== "untracked" && p !== "subscription" && p !== "other";
  }).length;

  const days = eachDay(range.from, range.to);
  const daily = days.map((date) => {
    const os = orders.filter((o) => o.date === date);
    const rev = sum(os.map((o) => o.total));
    const inv = sum(spend.filter((s) => s.date === date).map((s) => s.spend));
    const profit = rev - sum(os.map((o) => o.refunded + costFor(o) + feeFor(o))) - inv;
    return { date, revenue: rev, investment: inv, profit, margin: div(profit, rev) * 100 };
  });

  const platformIds = new Set<string>([...spend.map((s) => s.platform), ...orders.map(platformOf)]);
  const platforms: PlatformRow[] = [...platformIds]
    .map((platform) => {
      const os = orders.filter((o) => platformOf(o) === platform);
      const rev = sum(os.map((o) => o.total));
      const sp = sum(spend.filter((s) => s.platform === platform).map((s) => s.spend));
      const profit = rev - sum(os.map((o) => o.refunded + costFor(o) + feeFor(o))) - sp;
      return {
        platform,
        label: PLATFORM_LABEL[platform] ?? platform,
        orders: os.length,
        spend: sp,
        revenue: rev,
        aov: div(rev, os.length),
        refundRate: div(sum(os.map((o) => o.refunded)), rev) * 100,
        profit,
        roas: div(rev, sp),
        cpa: div(sp, os.length),
      };
    })
    .sort((a, b) => b.spend - a.spend || b.revenue - a.revenue);

  const prodMap = new Map<string, { units: number; orders: number; revenue: number; cost: number }>();
  for (const o of orders) {
    for (const l of o.lines) {
      const p = prodMap.get(l.product) ?? { units: 0, orders: 0, revenue: 0, cost: 0 };
      p.units += l.quantity;
      p.orders += 1;
      p.revenue += l.quantity * l.price;
      p.cost += l.quantity * (l.unitCost || (l.price * settings.defaultCogsPercent) / 100);
      prodMap.set(l.product, p);
    }
  }
  const products = [...prodMap.entries()]
    .map(([product, p]) => ({ product, ...p, aov: div(p.revenue, p.orders) }))
    .sort((a, b) => b.revenue - a.revenue);

  return {
    range,
    currency: settings.currency,
    dataSources: { orders: demo ? "demo" : ordersSource, spend: demo ? ["demo"] : spendSources, demo },
    warnings,
    kpis: {
      investment,
      revenue,
      netProfit,
      margin: div(netProfit, revenue) * 100,
      roas: div(revenue, investment),
      sales: orders.length,
      aov: div(revenue, orders.length),
      cpa: div(investment, trackedSales || orders.length),
      refunds,
      refundRate: div(refunds, revenue) * 100,
      productCost,
      fees,
      trackedSales,
    },
    daily,
    platforms,
    products,
  };
}

export function rangeFromPreset(preset: string, from?: string, to?: string): DateRange {
  const iso = (d: Date) => d.toISOString().slice(0, 10);
  const now = new Date();
  const back = (n: number) => {
    const d = new Date(now);
    d.setUTCDate(d.getUTCDate() - n);
    return iso(d);
  };
  switch (preset) {
    case "today":
      return { from: iso(now), to: iso(now) };
    case "yesterday":
      return { from: back(1), to: back(1) };
    case "7d":
      return { from: back(6), to: iso(now) };
    case "30d":
      return { from: back(29), to: iso(now) };
    case "month":
      return { from: iso(new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1))), to: iso(now) };
    case "custom":
      if (from && to) return { from, to };
      return { from: back(13), to: iso(now) };
    case "14d":
    default:
      return { from: back(13), to: iso(now) };
  }
}
