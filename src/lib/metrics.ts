import "server-only";
import { promises as fs } from "node:fs";
import { TRAFFIC_CONNECTORS, redtrack, shopify } from "./connectors";
import { eachDay } from "./connectors/http";
import { demoData } from "./demo";
import { PLATFORM_LABEL, platformFromOrder } from "./registry";
import { getSettings, listConnections, type Settings } from "./store";
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

export type CampaignRow = {
  campaign: string;
  platform: string;
  label: string;
  orders: number;
  revenue: number;
  aov: number;
  upsellRate: number;
  lastOrder: string;
};

export type Metrics = {
  range: DateRange;
  currency: string;
  dataSources: { orders: string; spend: string[]; demo: boolean; hasSpend: boolean; hasOrders: boolean };
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
    shipping: number;
    fees: number;
    trackedSales: number;
    upsellRate: number;
    cogsEstimated: boolean;
  };
  daily: { date: string; revenue: number; investment: number; profit: number; margin: number }[];
  platforms: PlatformRow[];
  campaigns: CampaignRow[];
  products: { product: string; units: number; orders: number; revenue: number; cost: number; aov: number }[];
  /** Orders whose traffic source could not be identified. */
  untracked: { name: string; date: string; total: number; campaign: string; referrer: string }[];
  upsell: UpsellStats;
  reconciliation: ReconRow[];
  redtrackFields: string[];
};

export type UpsellStats = {
  /** Product most orders start with (the front-end offer). */
  front: string;
  frontOrders: number;
  /** Orders with at least one extra product, and with a post-purchase tag (Zipify, AfterSell…). */
  anyRate: number;
  postPurchaseRate: number;
  items: { product: string; orders: number; rate: number; revenue: number; share: number }[];
  /** How many orders took 0, 1, 2… extra products. */
  depth: { extras: number; orders: number }[];
};

export type ReconRow = {
  platform: string;
  label: string;
  shopifyOrders: number;
  shopifyRevenue: number;
  rtConversions: number;
  rtRevenue: number;
  rtSpend: number;
  /** (RedTrack − Shopify) ÷ Shopify, in % of orders. */
  diffPct: number;
  /** nosales = money spent and no sale on either side. */
  status: "ok" | "warn" | "bad" | "nodata" | "nosales";
};

const sum = (xs: number[]) => xs.reduce((a, b) => a + b, 0);
const div = (a: number, b: number) => (b ? a / b : 0);

/**
 * NT_SNAPSHOT points to a JSON file of Order[] (e.g. exported through the
 * Shopify MCP) and replaces the live Shopify call. Used for previews/tests.
 */
async function snapshotOrders(range: DateRange): Promise<Order[] | null> {
  const file = process.env.NT_SNAPSHOT;
  if (!file) return null;
  const all = JSON.parse(await fs.readFile(file, "utf8")) as Order[];
  return all.filter((o) => o.date >= range.from && o.date <= range.to);
}

export async function computeMetrics(range: DateRange): Promise<Metrics> {
  const [connections, settings] = await Promise.all([listConnections(), getSettings()]);
  const byProvider = new Map(connections.map((c) => [c.provider, c]));
  const warnings: string[] = [];

  let orders: Order[] = [];
  let spend: SpendRow[] = [];
  const spendSources: string[] = [];
  let ordersSource = "demo";

  const snap = await snapshotOrders(range);
  const shop = byProvider.get("shopify");
  if (snap) {
    orders = snap;
    ordersSource = "shopify";
  } else if (shop) {
    try {
      orders = await shopify.fetchOrders(shop.credentials, range);
      ordersSource = "shopify";
    } catch (e) {
      warnings.push(`Shopify: ${(e as Error).message}`);
    }
  }

  let rt = byProvider.get("redtrack");
  let rtRows: SpendRow[] = [];
  // NT_SNAPSHOT_REDTRACK: JSON SpendRow[] standing in for the RedTrack API (previews/tests).
  if (process.env.NT_SNAPSHOT_REDTRACK) {
    const all = JSON.parse(await fs.readFile(process.env.NT_SNAPSHOT_REDTRACK, "utf8")) as SpendRow[];
    rtRows = all.filter((r) => r.date >= range.from && r.date <= range.to);
    rt = { id: "redtrack", provider: "redtrack", credentials: {}, createdAt: "" };
  } else if (rt) {
    try {
      rtRows = await redtrack.fetchSpend(rt.credentials, range);
    } catch (e) {
      warnings.push(`RedTrack: ${(e as Error).message}`);
    }
  }
  if (rt && settings.spendSource === "redtrack") {
    spend = rtRows;
    if (rtRows.length) spendSources.push("redtrack");
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
    if (rtRows.length) {
      const covered = new Set(spendSources);
      const extra = rtRows.filter((r) => !covered.has(r.platform));
      if (extra.length) {
        spend.push(...extra);
        spendSources.push("redtrack");
      }
    }
  }

  const demo = ordersSource === "demo" && spendSources.length === 0;
  if (demo) {
    const d = demoData(range);
    orders = d.orders;
    spend = d.spend;
  }

  return aggregate({
    range,
    orders,
    spend,
    rtRows: demo ? [] : rtRows,
    hasRedtrack: !!rt,
    settings,
    warnings,
    dataSources: {
      orders: demo ? "demo" : ordersSource === "demo" ? "" : ordersSource,
      spend: demo ? ["demo"] : spendSources,
      demo,
      hasSpend: demo || spendSources.length > 0,
      hasOrders: demo || ordersSource !== "demo",
    },
  });
}

export function aggregate(input: {
  range: DateRange;
  orders: Order[];
  spend: SpendRow[];
  rtRows?: SpendRow[];
  hasRedtrack?: boolean;
  settings: Settings;
  warnings: string[];
  dataSources: Metrics["dataSources"];
}): Metrics {
  const { range, orders, spend, settings } = input;
  const rtRows = input.rtRows ?? [];

  const supplierCost = (product: string): number | undefined => {
    const name = product.toLowerCase();
    let best: [string, number] | undefined;
    for (const [k, v] of Object.entries(settings.productCosts ?? {})) {
      const key = k.toLowerCase().trim();
      if (key && name.includes(key) && (!best || key.length > best[0].length)) best = [key, v];
    }
    return best?.[1];
  };
  const knownUnitCost = (l: Order["lines"][number]) => l.unitCost || supplierCost(l.product);
  const lineCost = (l: Order["lines"][number]) =>
    l.quantity * (knownUnitCost(l) ?? (l.price * settings.defaultCogsPercent) / 100);
  const shippingFor = (o: Order) => {
    const units = sum(o.lines.map((l) => l.quantity));
    if (!units || !settings.shippingFirstItem) return 0;
    return settings.shippingFirstItem + (units - 1) * (settings.shippingExtraItem || 0);
  };
  const feeFor = (o: Order) => o.total * (settings.paymentFeePercent / 100) + settings.paymentFeeFixed;
  const costFor = (o: Order) => sum(o.lines.map(lineCost)) + shippingFor(o);
  const platformOf = (o: Order) => (o.isSubscription ? "subscription" : platformFromOrder(o));
  const isTracked = (p: string) => !["untracked", "subscription", "other"].includes(p);

  const revenue = sum(orders.map((o) => o.total));
  const refunds = sum(orders.map((o) => o.refunded));
  const shipping = sum(orders.map(shippingFor));
  const productCost = sum(orders.map(costFor)) - shipping;
  const fees = sum(orders.map(feeFor));
  const investment = sum(spend.map((s) => s.spend));
  const netProfit = revenue - refunds - productCost - shipping - fees - investment;
  const trackedSales = orders.filter((o) => isTracked(platformOf(o))).length;
  const cogsEstimated = orders.some((o) => o.lines.some((l) => !knownUnitCost(l)));

  const daily = eachDay(range.from, range.to).map((date) => {
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
    .filter((p) => p.orders > 0 || p.spend > 0)
    .sort((a, b) => b.spend - a.spend || b.revenue - a.revenue);

  const campMap = new Map<string, Order[]>();
  for (const o of orders) {
    const key = o.utmCampaign || "(sem campanha)";
    campMap.set(key, [...(campMap.get(key) ?? []), o]);
  }
  const campaigns: CampaignRow[] = [...campMap.entries()]
    .map(([campaign, os]) => {
      const platform = platformOf(os[0]);
      const rev = sum(os.map((o) => o.total));
      return {
        campaign,
        platform,
        label: PLATFORM_LABEL[platform] ?? platform,
        orders: os.length,
        revenue: rev,
        aov: div(rev, os.length),
        upsellRate: div(os.filter((o) => o.hasUpsell).length, os.length) * 100,
        lastOrder: os.map((o) => o.date).sort().at(-1) ?? "",
      };
    })
    .sort((a, b) => b.revenue - a.revenue);

  const prodMap = new Map<string, { units: number; orders: number; revenue: number; cost: number }>();
  for (const o of orders) {
    for (const l of o.lines) {
      const p = prodMap.get(l.product) ?? { units: 0, orders: 0, revenue: 0, cost: 0 };
      p.units += l.quantity;
      p.orders += 1;
      p.revenue += l.quantity * l.price;
      p.cost += lineCost(l);
      prodMap.set(l.product, p);
    }
  }
  const products = [...prodMap.entries()]
    .map(([product, p]) => ({ product, ...p, aov: div(p.revenue, p.orders) }))
    .sort((a, b) => b.revenue - a.revenue);

  // ---------- sales without UTM ----------
  const untracked = orders
    .filter((o) => !isTracked(platformOf(o)) && platformOf(o) !== "subscription")
    .map((o) => ({
      name: o.name ?? o.id,
      date: o.date,
      total: o.total,
      campaign: o.utmCampaign ?? "",
      referrer: o.referrer ?? "",
    }))
    .sort((a, b) => (a.date < b.date ? 1 : -1));

  // ---------- upsell funnel ----------
  const firstCount = new Map<string, number>();
  for (const o of orders) {
    const f = o.lines[0]?.product;
    if (f) firstCount.set(f, (firstCount.get(f) ?? 0) + 1);
  }
  const front = [...firstCount.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? "";
  const extrasOf = (o: Order) => [...new Set(o.lines.map((l) => l.product))].filter((p) => p !== front);
  const upItems = new Map<string, { orders: number; revenue: number }>();
  for (const o of orders) {
    for (const p of extrasOf(o)) {
      const it = upItems.get(p) ?? { orders: 0, revenue: 0 };
      it.orders += 1;
      it.revenue += sum(o.lines.filter((l) => l.product === p).map((l) => l.price * l.quantity));
      upItems.set(p, it);
    }
  }
  const depthMap = new Map<number, number>();
  for (const o of orders) depthMap.set(extrasOf(o).length, (depthMap.get(extrasOf(o).length) ?? 0) + 1);
  const upsell: UpsellStats = {
    front,
    frontOrders: orders.length,
    anyRate: div(orders.filter((o) => extrasOf(o).length > 0).length, orders.length) * 100,
    postPurchaseRate: div(orders.filter((o) => o.hasUpsell).length, orders.length) * 100,
    items: [...upItems.entries()]
      .map(([product, it]) => ({
        product,
        orders: it.orders,
        rate: div(it.orders, orders.length) * 100,
        revenue: it.revenue,
        share: div(it.revenue, revenue) * 100,
      }))
      .sort((a, b) => b.orders - a.orders),
    depth: [...depthMap.entries()].map(([extras, n]) => ({ extras, orders: n })).sort((a, b) => a.extras - b.extras),
  };

  // ---------- Shopify × RedTrack ----------
  const reconIds = new Set<string>([
    ...rtRows.filter((r) => r.conversions || r.revenue || r.spend).map((r) => r.platform),
    ...orders.map(platformOf).filter(isTracked),
  ]);
  const reconciliation: ReconRow[] = input.hasRedtrack
    ? [...reconIds]
        .map((platform) => {
          const os = orders.filter((o) => platformOf(o) === platform);
          const rs = rtRows.filter((r) => r.platform === platform);
          const shopifyOrders = os.length;
          const rtConversions = sum(rs.map((r) => r.conversions ?? 0));
          const diffPct = shopifyOrders ? ((rtConversions - shopifyOrders) / shopifyOrders) * 100 : rtConversions ? 100 : 0;
          const gap = Math.abs(rtConversions - shopifyOrders);
          const rtSpend = sum(rs.map((r) => r.spend));
          const status: ReconRow["status"] =
            !shopifyOrders && !rtConversions
              ? rtSpend > 0
                ? "nosales"
                : "nodata"
              : gap <= 1 || Math.abs(diffPct) <= 10
                ? "ok"
                : Math.abs(diffPct) <= 25
                  ? "warn"
                  : "bad";
          return {
            platform,
            label: PLATFORM_LABEL[platform] ?? platform,
            shopifyOrders,
            shopifyRevenue: sum(os.map((o) => o.total)),
            rtConversions,
            rtRevenue: sum(rs.map((r) => r.revenue ?? 0)),
            rtSpend,
            diffPct,
            status,
          };
        })
        .sort((a, b) => b.shopifyOrders - a.shopifyOrders)
    : [];

  return {
    untracked,
    upsell,
    reconciliation,
    redtrackFields: input.hasRedtrack ? redtrack.lastFields : [],
    range,
    currency: settings.currency,
    dataSources: input.dataSources,
    warnings: input.warnings,
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
      shipping,
      fees,
      trackedSales,
      upsellRate: div(orders.filter((o) => o.hasUpsell).length, orders.length) * 100,
      cogsEstimated,
    },
    daily,
    platforms,
    campaigns,
    products,
  };
}

/** Same-length period right before `range`. */
export function previousRange(range: DateRange): DateRange {
  const d = (s: string) => new Date(`${s}T00:00:00Z`);
  const days = Math.round((d(range.to).getTime() - d(range.from).getTime()) / 86_400_000) + 1;
  const to = d(range.from);
  to.setUTCDate(to.getUTCDate() - 1);
  const from = new Date(to);
  from.setUTCDate(from.getUTCDate() - (days - 1));
  return { from: from.toISOString().slice(0, 10), to: to.toISOString().slice(0, 10) };
}

/** Today's date in the given timezone (defaults to the store timezone env or UTC). */
function today(tz = process.env.STORE_TIMEZONE || "UTC") {
  return new Intl.DateTimeFormat("en-CA", { timeZone: tz, year: "numeric", month: "2-digit", day: "2-digit" }).format(
    new Date(),
  );
}

export function rangeFromPreset(preset: string, from?: string, to?: string): DateRange {
  const now = today();
  const back = (n: number) => {
    const d = new Date(`${now}T00:00:00Z`);
    d.setUTCDate(d.getUTCDate() - n);
    return d.toISOString().slice(0, 10);
  };
  switch (preset) {
    case "today":
      return { from: now, to: now };
    case "yesterday":
      return { from: back(1), to: back(1) };
    case "7d":
      return { from: back(6), to: now };
    case "30d":
      return { from: back(29), to: now };
    case "month":
      return { from: `${now.slice(0, 8)}01`, to: now };
    case "custom":
      if (from && to) return { from, to };
      return { from: back(13), to: now };
    case "14d":
    default:
      return { from: back(13), to: now };
  }
}
