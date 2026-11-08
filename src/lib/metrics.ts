import "server-only";
import { promises as fs } from "node:fs";
import { TRAFFIC_CONNECTORS, redtrack, shopify } from "./connectors";
import { eachDay } from "./connectors/http";
import { cached, friendlyError, hashKey } from "./cache";
import { demoData } from "./demo";
import type { Funnel } from "./connectors/shopify";
import { PLATFORM_LABEL, platformFromOrder } from "./registry";
import { getSettings, getSupplierCosts, getSupplierImports, listConnections, uniqueAccounts, type Settings, type SupplierCost } from "./store";
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
  /** Costs of these orders, used by the Tráfego page to compute real profit per campaign. */
  refunds: number;
  supplierCost: number;
  fees: number;
  /** Orders that took a post-purchase upsell (RedTrack counts each as an extra purchase). */
  upsells: number;
  /** Revenue from products other than the front-end offer. */
  upsellRevenue: number;
};

export type Metrics = {
  range: DateRange;
  currency: string;
  dataSources: { orders: string; spend: string[]; demo: boolean; hasSpend: boolean; hasOrders: boolean };
  warnings: string[];
  /** Campaigns the user chose to ignore (other products): their spend is left out of every total. */
  excluded: { count: number; spend: number };
  /** Wiio costs: exact up to `coveredTo` (last upload), learned averages after that. */
  supplier: { lastUploadAt?: string; lastFile?: string; coveredTo?: string; daysSinceUpload?: number; model?: Settings["supplierModel"] };
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
    /** How each order's supplier cost was found: exact (imported export), table, or % estimate. */
    costCoverage: { exact: number; table: number; estimated: number };
    /** Checkouts started and checkout → purchase conversion, from the best source available. */
    checkouts: number;
    checkoutConv: number;
    checkoutSource: "shopify" | "redtrack" | "shopify-contato" | "";
    /** InitiateCheckout counted by RedTrack (all tracked traffic). */
    rtCheckouts: number;
  };
  daily: {
    date: string;
    revenue: number;
    investment: number;
    profit: number;
    margin: number;
    checkouts: number;
    sales: number;
    cpa: number;
    roas: number;
  }[];
  /** Store funnel from Shopify reports (null when not available). */
  funnel: { sessions: number; carts: number; checkouts: number; completed: number } | null;
  platforms: PlatformRow[];
  campaigns: CampaignRow[];
  products: { product: string; units: number; orders: number; revenue: number; cost: number; aov: number }[];
  /** Orders whose traffic source could not be identified. */
  untracked: { name: string; date: string; total: number; campaign: string; referrer: string }[];
  upsell: UpsellStats;
  reconciliation: ReconRow[];
  reconDaily: {
    date: string;
    shopifyOrders: number;
    shopifyUpsells: number;
    rtConversions: number;
    shopifyRevenue: number;
    rtRevenue: number;
  }[];
  redtrackMapping: { conversions?: string; revenue?: string; cost?: string };
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
  /** Post-purchase upsells: RedTrack fires one extra purchase per upsell. */
  shopifyUpsells: number;
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
  const [connections, settings, supplierCosts, imports] = await Promise.all([
    listConnections(),
    getSettings(),
    getSupplierCosts(),
    getSupplierImports(),
  ]);
  const lastImport = imports[0];
  const supplierInfo: Metrics["supplier"] = {
    lastUploadAt: lastImport?.at,
    lastFile: lastImport?.file,
    coveredTo: settings.supplierModel?.coveredTo ?? lastImport?.to,
    daysSinceUpload: lastImport ? Math.floor((Date.now() - Date.parse(lastImport.at)) / 86400_000) : undefined,
    model: settings.supplierModel,
  };
  const byProvider = new Map(connections.map((c) => [c.provider, c]));
  const warnings: string[] = [];

  let orders: Order[] = [];
  let spend: SpendRow[] = [];
  const spendSources: string[] = [];
  let ordersSource = "demo";

  const snap = await snapshotOrders(range);
  let funnel: Funnel | null = null;
  if (process.env.NT_SNAPSHOT_FUNNEL) {
    const f = JSON.parse(await fs.readFile(process.env.NT_SNAPSHOT_FUNNEL, "utf8")) as Funnel;
    funnel = { ...f, days: f.days.filter((d) => d.date >= range.from && d.date <= range.to) };
  }
  const shop = byProvider.get("shopify");
  if (snap) {
    orders = snap;
    ordersSource = "shopify";
  } else if (shop) {
    try {
      orders = await shopify.fetchOrders(shop.credentials, range);
      ordersSource = "shopify";
      funnel = await shopify.fetchFunnel(shop.credentials, range).catch(() => null);
    } catch (e) {
      warnings.push(friendlyError("Shopify", e));
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
      rtRows = await redtrack.fetchSpend(rt.credentials, range, settings.redtrackIcField || undefined);
    } catch (e) {
      warnings.push(friendlyError("RedTrack", e));
    }
  }
  if (rt && settings.spendSource === "redtrack") {
    spend = rtRows;
    if (rtRows.length) spendSources.push("redtrack");
  } else {
    // Every connected account of every traffic source (e.g. two Taboola accounts).
    const jobs = uniqueAccounts(connections)
      .filter((c) => TRAFFIC_CONNECTORS[c.provider])
      .map(async (c) => {
        try {
          const rows = (
            await cached(hashKey("spend", c.id, c.credentials, range), () =>
              TRAFFIC_CONNECTORS[c.provider].fetchSpend(c.credentials, range),
            )
          ).value;
          if (!spendSources.includes(c.provider)) spendSources.push(c.provider);
          return rows;
        } catch (e) {
          warnings.push(friendlyError(c.label ?? PLATFORM_LABEL[c.provider] ?? c.provider, e));
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

  // Ignored campaigns (e.g. other products sharing the ad account): subtract their spend day by day.
  const excludedInfo = { count: (settings.excludedCampaigns ?? []).length, spend: 0 };
  if (excludedInfo.count && spend.length) {
    const minus = await excludedSpend(range, connections, settings, rt, new Set(spendSources));
    for (const r of minus) {
      excludedInfo.spend += r.spend;
      spend.push({ ...r, spend: -r.spend, clicks: -(r.clicks ?? 0) });
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
    supplierCosts: demo ? {} : supplierCosts,
    supplier: demo ? {} : supplierInfo,
    funnel: demo ? null : funnel,
    settings,
    warnings,
    excluded: demo ? { count: 0, spend: 0 } : excludedInfo,
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
  supplierCosts?: Record<string, SupplierCost>;
  funnel?: Funnel | null;
  settings: Settings;
  warnings: string[];
  excluded?: Metrics["excluded"];
  supplier?: Metrics["supplier"];
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
  // Unknown product: the average unit cost learned from the Wiio uploads, else the default % of the price.
  const model = settings.supplierModel;
  const lineCost = (l: Order["lines"][number]) =>
    l.quantity * (knownUnitCost(l) ?? (model?.avgProductPerUnit || (l.price * settings.defaultCogsPercent) / 100));
  const exact = (o: Order) => input.supplierCosts?.[o.name ?? o.id];
  const tableShipping = (o: Order) => {
    const units = sum(o.lines.map((l) => l.quantity));
    if (!units || !settings.shippingFirstItem) return 0;
    return settings.shippingFirstItem + (units - 1) * (settings.shippingExtraItem || 0);
  };
  const shippingFor = (o: Order) => exact(o)?.shipping ?? tableShipping(o);
  const productCostFor = (o: Order) => exact(o)?.product ?? sum(o.lines.map(lineCost));
  const feeFor = (o: Order) => o.total * (settings.paymentFeePercent / 100) + settings.paymentFeeFixed;
  const costFor = (o: Order) => productCostFor(o) + shippingFor(o);
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
  const costCoverage = { exact: 0, table: 0, estimated: 0 };
  for (const o of orders) {
    if (exact(o)) costCoverage.exact++;
    else if (o.lines.every((l) => knownUnitCost(l))) costCoverage.table++;
    else costCoverage.estimated++;
  }
  const cogsEstimated = costCoverage.estimated > 0;

  const daily = eachDay(range.from, range.to).map((date) => {
    const os = orders.filter((o) => o.date === date);
    const rev = sum(os.map((o) => o.total));
    const inv = sum(spend.filter((s) => s.date === date).map((s) => s.spend));
    const profit = rev - sum(os.map((o) => o.refunded + costFor(o) + feeFor(o))) - inv;
    const fd = input.funnel?.days.find((d) => d.date === date);
    const rtIc = sum(rtRows.filter((r) => r.date === date).map((r) => r.ic ?? 0));
    const checkouts =
      input.funnel?.source === "analytics" ? (fd?.checkouts ?? 0) : rtIc || (input.funnel ? (fd?.checkouts ?? 0) + os.length : 0);
    const tracked = os.filter((o) => isTracked(platformOf(o))).length;
    return {
      date,
      revenue: rev,
      investment: inv,
      profit,
      margin: div(profit, rev) * 100,
      checkouts,
      sales: os.length,
      cpa: div(inv, tracked || os.length),
      roas: div(rev, inv),
    };
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

  // Front-end offer = product most orders start with; everything else is upsell/bump.
  const firstCount = new Map<string, number>();
  for (const o of orders) {
    const f = o.lines[0]?.product;
    if (f) firstCount.set(f, (firstCount.get(f) ?? 0) + 1);
  }
  const front = [...firstCount.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? "";
  const extraRevenue = (o: Order) => sum(o.lines.filter((l) => l.product !== front).map((l) => l.price * l.quantity));

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
        refunds: sum(os.map((o) => o.refunded)),
        supplierCost: sum(os.map(costFor)),
        fees: sum(os.map(feeFor)),
        upsells: os.filter((o) => o.hasUpsell).length,
        upsellRevenue: sum(os.map(extraRevenue)),
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
          const shopifyUpsells = os.filter((o) => o.hasUpsell).length;
          const expected = shopifyOrders + shopifyUpsells;
          const rtConversions = sum(rs.map((r) => r.conversions ?? 0));
          const diffPct = expected ? ((rtConversions - expected) / expected) * 100 : rtConversions ? 100 : 0;
          const gap = Math.abs(rtConversions - expected);
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
            shopifyUpsells,
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

  // ---------- checkout ----------
  const rtCheckouts = sum(rtRows.map((r) => r.ic ?? 0));
  const f = input.funnel;
  const checkoutKpis = (() => {
    if (f?.source === "analytics") {
      const checkouts = sum(f.days.map((d) => d.checkouts));
      const completed = sum(f.days.map((d) => d.completed));
      return { checkouts, checkoutConv: div(completed, checkouts) * 100, checkoutSource: "shopify" as const, rtCheckouts };
    }
    if (rtCheckouts > 0) {
      return { checkouts: rtCheckouts, checkoutConv: div(trackedSales, rtCheckouts) * 100, checkoutSource: "redtrack" as const, rtCheckouts };
    }
    if (f) {
      const checkouts = sum(f.days.map((d) => d.checkouts)) + orders.length;
      return { checkouts, checkoutConv: div(orders.length, checkouts) * 100, checkoutSource: "shopify-contato" as const, rtCheckouts };
    }
    return { checkouts: 0, checkoutConv: 0, checkoutSource: "" as const, rtCheckouts };
  })();
  const funnelOut =
    f?.source === "analytics"
      ? {
          sessions: sum(f.days.map((d) => d.sessions)),
          carts: sum(f.days.map((d) => d.carts)),
          checkouts: sum(f.days.map((d) => d.checkouts)),
          completed: sum(f.days.map((d) => d.completed)),
        }
      : null;

  return {
    funnel: funnelOut,
    untracked,
    upsell,
    reconciliation,
    reconDaily: input.hasRedtrack
      ? eachDay(range.from, range.to).map((date) => {
          const os = orders.filter((o) => o.date === date && isTracked(platformOf(o)));
          const rs = rtRows.filter((r) => r.date === date);
          return {
            date,
            shopifyOrders: os.length,
            shopifyUpsells: os.filter((o) => o.hasUpsell).length,
            rtConversions: sum(rs.map((r) => r.conversions ?? 0)),
            shopifyRevenue: sum(os.map((o) => o.total)),
            rtRevenue: sum(rs.map((r) => r.revenue ?? 0)),
          };
        })
      : [],
    redtrackMapping: input.hasRedtrack ? redtrack.lastMapping : {},
    range,
    currency: settings.currency,
    dataSources: input.dataSources,
    warnings: input.warnings,
    excluded: input.excluded ?? { count: 0, spend: 0 },
    supplier: input.supplier ?? {},
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
      costCoverage,
      ...checkoutKpis,
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

type Conn = Awaited<ReturnType<typeof listConnections>>[number];
type DayRow = { platform: string; id: string; date: string; spend: number; clicks: number };

/** Daily spend of the ignored campaigns, from the same place the dashboard took that spend from. */
async function excludedSpend(
  range: DateRange,
  connections: Conn[],
  settings: Settings,
  rt: Conn | undefined,
  covered: Set<string>,
): Promise<SpendRow[]> {
  const ex = settings.excludedCampaigns ?? [];
  const srcKeys = new Set(ex.map((e) => e.key).filter((k) => k.startsWith("src:")));
  const rtIds = new Set(ex.map((e) => e.key).filter((k) => k.startsWith("rtc:")).map((k) => k.slice(4).toLowerCase()));
  const rtMode = settings.spendSource === "redtrack";
  const out: SpendRow[] = [];
  const keep = (r: DayRow) => r.date >= range.from && r.date <= range.to;

  if (process.env.NT_SNAPSHOT_CAMPAIGN_DAILY) {
    const all = (JSON.parse(await fs.readFile(process.env.NT_SNAPSHOT_CAMPAIGN_DAILY, "utf8")) as (DayRow & { rt?: boolean })[]).filter(keep);
    for (const r of all) {
      const hit = r.rt
        ? rtIds.has(r.id.toLowerCase()) && (rtMode || !covered.has(r.platform))
        : !rtMode && srcKeys.has(`src:${r.platform}:${r.id}`);
      if (hit) out.push({ date: r.date, platform: r.platform, spend: r.spend, clicks: r.clicks });
    }
    return out;
  }

  if (!rtMode && srcKeys.size) {
    const platforms = new Set([...srcKeys].map((k) => k.split(":")[1]));
    const jobs = uniqueAccounts(connections)
      .filter((c) => platforms.has(c.provider) && TRAFFIC_CONNECTORS[c.provider]?.campaignDaily)
      .map(async (c) => {
        try {
          const rows = (
            await cached(hashKey("src-daily", c.id, c.credentials, range), () =>
              TRAFFIC_CONNECTORS[c.provider].campaignDaily!(c.credentials, range),
            )
          ).value;
          return rows
            .filter((r) => srcKeys.has(`src:${c.provider}:${r.id}`))
            .map((r) => ({ date: r.date, platform: c.provider, spend: r.spend, clicks: r.clicks }));
        } catch {
          return [];
        }
      });
    out.push(...(await Promise.all(jobs)).flat());
  }
  if (rtIds.size && rt && !process.env.NT_SNAPSHOT_REDTRACK) {
    try {
      const rows = await redtrack.fetchCampaignDaily(rt.credentials, range);
      // Only where the dashboard used RedTrack's cost (no direct API for that platform, or RedTrack mode).
      for (const r of rows)
        if (rtIds.has(r.id.toLowerCase()) && (rtMode || !covered.has(r.platform)))
          out.push({ date: r.date, platform: r.platform, spend: r.spend, clicks: r.clicks });
    } catch {
      /* keep the dashboard working; the traffic tab still leaves them out */
    }
  }
  return out;
}
