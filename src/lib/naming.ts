/**
 * Naming convention (client-safe, no server imports).
 *   RedTrack campaign:  [PRODUTO] [FONTE] [PAÍS]                 e.g. "[OMNIPRO] [TABOOLA] [US]"
 *   Source campaign:    [PRODUTO] [DEVICE] [LANCE] [PAÍS] [DATA] e.g. "[OMNIPRO] [DESKTOP] [MAXCONV] [US] [05.11.26]"
 * Brackets are optional when reading: "OMNIPRO TABOOLA US" is recognized too.
 * Product + source + country identify the same campaign everywhere, so a source campaign
 * links to its RedTrack campaign (and to the utm_campaign in Shopify) automatically.
 */

export const SOURCES: Record<string, string[]> = {
  taboola: ["TABOOLA", "TAB", "TBL"],
  revcontent: ["REVCONTENT", "REV", "RC"],
  outbrain: ["OUTBRAIN", "OB", "OUT"],
  mediago: ["MEDIAGO", "MGO", "MG"],
  mgid: ["MGID"],
  newsbreak: ["NEWSBREAK", "NB"],
  meta: ["META", "FACEBOOK", "FB"],
  googleads: ["GOOGLE", "GADS", "GOOGLEADS"],
};
export const SOURCE_NAME: Record<string, string> = Object.fromEntries(Object.entries(SOURCES).map(([k, v]) => [k, v[0]]));

export const DEVICES: Record<string, string[]> = {
  DESKTOP: ["DESKTOP", "DESK", "DT", "PC"],
  MOBILE: ["MOBILE", "MOB", "MB", "MOBI"],
  TABLET: ["TABLET", "TAB"],
  ALL: ["ALL", "TODOS", "MULTI"],
};

export const BIDS = ["MAXCONV", "TCPA", "TARGETCPA", "CPC", "MAXCLICK", "SMARTBID", "FIXED", "ENHANCED", "TROAS"] as const;

const COUNTRIES = new Set(
  "US UK GB CA AU NZ IE BR PT ES MX AR CL CO FR DE IT NL BE AT CH SE NO DK FI PL ZA IN JP SG PH AE IL".split(" "),
);

const tokens = (name: string) =>
  name
    .toUpperCase()
    .replace(/[[\]|_]+/g, " ")
    .replace(/\s+-\s+/g, " ")
    .trim()
    .split(/\s+/)
    .filter(Boolean);

const sourceOf = (t: string) => Object.entries(SOURCES).find(([, alias]) => alias.includes(t))?.[0];
const deviceOf = (t: string) => Object.entries(DEVICES).find(([, alias]) => alias.includes(t))?.[0];
const isDate = (t: string) => /^\d{2}[./-]?\d{2}[./-]?\d{2,4}$|^\d{4}-\d{2}-\d{2}$/.test(t);
export const normProduct = (p: string) => p.toUpperCase().replace(/[^A-Z0-9]/g, "");

export type RtName = { product: string; source: string; country: string };
export type SourceName = { product: string; device: string; bid: string; country: string; date: string };

/** "OMNIPRO TABOOLA US" → { product: OMNIPRO, source: taboola, country: US } */
export function parseRtName(name: string): RtName | null {
  const t = tokens(name);
  if (t.length < 3) return null;
  const country = t[t.length - 1];
  const source = sourceOf(t[t.length - 2]);
  if (!COUNTRIES.has(country) || !source) return null;
  const product = normProduct(t.slice(0, -2).join(""));
  return product ? { product, source, country } : null;
}

/** "OMNIPRO DESKTOP MAXCONV US 05.11.26" → product, device, bid, country, date */
export function parseSourceName(name: string): SourceName | null {
  const t = tokens(name);
  if (t.length < 4) return null;
  let i = t.length - 1;
  const date = isDate(t[i]) ? t[i--] : "";
  const country = t[i];
  if (!COUNTRIES.has(country)) return null;
  i--;
  // Device and bid can come in either order; both are optional but at least one is expected.
  let device = "";
  let bid = "";
  for (let k = 0; k < 2 && i > 0; k++) {
    const d = deviceOf(t[i]);
    if (d && !device) {
      device = d;
      i--;
    } else if (!bid && !d) {
      bid = t[i];
      i--;
    }
  }
  const product = normProduct(t.slice(0, i + 1).join(""));
  if (!product || (!device && !bid)) return null;
  return { product, device, bid, country, date };
}

/** Key shared by a RedTrack campaign, its utm_campaign and the source campaigns that feed it. */
export const namingKey = (product: string, platform: string, country: string) => `pc:${normProduct(product)}|${platform}|${country}`;

const bracket = (parts: string[]) => parts.map((p) => `[${p}]`).join(" ");

export function buildRtName(product: string, platform: string, country: string) {
  return bracket([normProduct(product), SOURCE_NAME[platform] ?? platform.toUpperCase(), country.toUpperCase()]);
}

export function buildSourceName(product: string, device: string, bid: string, country: string, date: Date = new Date()) {
  const dd = String(date.getDate()).padStart(2, "0");
  const mm = String(date.getMonth() + 1).padStart(2, "0");
  const yy = String(date.getFullYear()).slice(2);
  return bracket([normProduct(product), device.toUpperCase(), bid.toUpperCase(), country.toUpperCase(), `${dd}.${mm}.${yy}`]);
}
