/**
 * Adapts a campaign setup from one traffic source to another (client-safe).
 * Taboola bids: MAX_CONVERSIONS | TARGET_CPA | SMART | FIXED (budget = spending limit + daily cap)
 * Revcontent:   optimize cpa | cpc (budget = daily amount, min $50 when limited)
 */
import type { CampaignSetup } from "./store";

export type Platform = "taboola" | "revcontent";

export function translateSetup(from: Platform, to: Platform, s: CampaignSetup): CampaignSetup {
  if (from === to) return s;
  if (from === "taboola" && to === "revcontent") {
    const daily = s.dailyCap || (s.spendingLimitModel === "MONTHLY" && s.spendingLimit ? s.spendingLimit / 30 : 0);
    return {
      ...s,
      bidStrategy: s.bidStrategy === "MAX_CONVERSIONS" || s.bidStrategy === "TARGET_CPA" ? "cpa" : "cpc",
      cpc: s.cpc ?? 0.25,
      budget: daily ? Math.max(50, Math.round(daily)) : undefined,
      pacing: true,
    };
  }
  // revcontent → taboola
  return {
    ...s,
    bidStrategy: s.bidStrategy === "cpa" ? "MAX_CONVERSIONS" : "FIXED",
    cpc: s.cpc ?? 0.25,
    marketingObjective: s.marketingObjective || "ONLINE_PURCHASES",
    spendingLimitModel: s.spendingLimitModel || "MONTHLY",
    spendingLimit: s.spendingLimit || (s.budget ? s.budget * 30 : 3000),
    dailyCap: s.dailyCap || s.budget || 100,
  };
}
