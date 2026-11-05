export const money = (v: number, currency = "USD", digits = 0) =>
  new Intl.NumberFormat("en-US", {
    style: "currency",
    currency,
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  }).format(v);

export const compact = (v: number) =>
  new Intl.NumberFormat("en-US", { notation: "compact", maximumFractionDigits: 1 }).format(v);

export const pct = (v: number, digits = 1) => `${v.toFixed(digits)}%`;
export const int = (v: number) => new Intl.NumberFormat("en-US").format(Math.round(v));

export const PLATFORM_COLOR: Record<string, string> = {
  mediago: "#5b8def",
  outbrain: "#f5a524",
  taboola: "#3ddc84",
  googleads: "#e5484d",
  mgid: "#a78bfa",
  meta: "#38bdf8",
  untracked: "#5c636d",
  subscription: "#8b929c",
  other: "#3f444b",
};
