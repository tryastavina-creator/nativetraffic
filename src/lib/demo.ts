/** Deterministic sample data shown until real integrations are connected. */
import { eachDay } from "./connectors/http";
import type { DateRange, Order, SpendRow } from "./types";

function rng(seed: number) {
  return () => {
    seed = (seed * 1664525 + 1013904223) % 4294967296;
    return seed / 4294967296;
  };
}

const PRODUCTS = [
  { product: "SpineEase", price: 69, unitCost: 11, weight: 0.62 },
  { product: "BunionEase", price: 54, unitCost: 9, weight: 0.12 },
  { product: "MagnesiumEase-Knee", price: 59, unitCost: 10, weight: 0.1 },
  { product: "NerveCream", price: 49, unitCost: 7, weight: 0.1 },
  { product: "Magnesium-EDM", price: 62, unitCost: 12, weight: 0.06 },
];

const PLATFORMS = [
  { platform: "mediago", share: 0.42, roas: 1.8 },
  { platform: "outbrain", share: 0.36, roas: 1.5 },
  { platform: "taboola", share: 0.12, roas: 1.7 },
  { platform: "googleads", share: 0.07, roas: 0.85 },
  { platform: "mgid", share: 0.03, roas: 1.35 },
];

const UTM: Record<string, string> = {
  mediago: "mediago",
  outbrain: "outbrain",
  taboola: "taboola",
  googleads: "google",
  mgid: "mgid",
};

export function demoData(range: DateRange): { orders: Order[]; spend: SpendRow[] } {
  const r = rng(42 + range.from.length);
  const orders: Order[] = [];
  const spend: SpendRow[] = [];
  let n = 0;
  for (const date of eachDay(range.from, range.to)) {
    const seed = parseInt(date.replace(/-/g, ""), 10);
    const day = rng(seed);
    const dailyBudget = 7000 + day() * 4000;
    for (const p of PLATFORMS) {
      const s = dailyBudget * p.share * (0.85 + day() * 0.3);
      spend.push({ date, platform: p.platform, spend: Math.round(s * 100) / 100, clicks: Math.round(s / 0.35) });
      let revenueTarget = s * p.roas * (0.75 + day() * 0.5);
      while (revenueTarget > 0) {
        let pick = r();
        const prod = PRODUCTS.find((x) => (pick -= x.weight) <= 0) ?? PRODUCTS[0];
        const qty = r() < 0.7 ? 2 : r() < 0.6 ? 3 : 1;
        const total = prod.price * qty;
        orders.push({
          id: `demo-${++n}`,
          date,
          createdAt: `${date}T12:00:00Z`,
          total,
          refunded: r() < 0.05 ? total : 0,
          country: r() < 0.7 ? "US" : r() < 0.6 ? "UK" : "AU",
          utmSource: UTM[p.platform],
          lines: [{ product: prod.product, quantity: qty, price: prod.price, unitCost: prod.unitCost }],
        });
        revenueTarget -= total;
      }
    }
    // Organic / untracked + subscriptions
    for (let i = 0; i < 6; i++) {
      orders.push({
        id: `demo-${++n}`,
        date,
        createdAt: `${date}T15:00:00Z`,
        total: 120,
        refunded: 0,
        isSubscription: i < 2,
        lines: [{ product: "SpineEase", quantity: 2, price: 60, unitCost: 11 }],
      });
    }
  }
  return { orders, spend };
}
