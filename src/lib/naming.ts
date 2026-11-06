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
const COUNTRY_ALIAS: Record<string, string> = { GB: "UK", GBR: "UK", USA: "US", AUS: "AU", CAN: "CA", NZL: "NZ", DEU: "DE", GER: "DE", IRL: "IE", BRA: "BR" };
/** Country as written in names: 2 letters, UK for Great Britain (AUS → AU, GB → UK…). */
export const nameCountry = (c: string) => {
  const u = c.toUpperCase();
  return COUNTRY_ALIAS[u] ?? u;
};
/** ISO code the ad platforms expect for targeting (UK → GB). */
export const isoCountry = (c: string) => {
  const u = nameCountry(c);
  return u === "UK" ? "GB" : u;
};
const isCountry = (t: string) => COUNTRIES.has(nameCountry(t));
const MONTHS = /^(JAN|FEB|FEV|MAR|APR|ABR|MAY|MAI|JUN|JUL|AUG|AGO|SEP|SET|OCT|OUT|NOV|DEC|DEZ)[A-Z]*$/;

const tokens = (name: string) =>
  name
    .toUpperCase()
    .replace(/[[\]|_]+/g, " ")
    .replace(/\s+-\s+/g, " ")
    .trim()
    .split(/\s+/)
    .filter(Boolean);

const sourceOf = (t: string) => Object.entries(SOURCES).find(([, alias]) => alias.includes(t))?.[0];
const oneDevice = (t: string) => Object.entries(DEVICES).find(([, alias]) => alias.includes(t))?.[0];
/** "DESK" → DESKTOP; combos like "DESK/TAB" → "DESKTOP/TABLET". */
const deviceOf = (t: string) => {
  if (!t.includes("/")) return oneDevice(t);
  const parts = t.split("/").map(oneDevice);
  return parts.every(Boolean) ? parts.join("/") : undefined;
};
const isDate = (t: string) =>
  /^\d{2}[./-]?\d{2}[./-]?\d{2,4}$|^\d{4}-\d{2}-\d{2}$/.test(t) || (/^\d{1,2}[./-][A-Z]{3,9}$/.test(t) && MONTHS.test(t.replace(/^\d+[./-]/, "")));
export const normProduct = (p: string) => p.toUpperCase().replace(/[^A-Z0-9]/g, "");

export type RtName = { product: string; source: string; country: string };
export type SourceName = { product: string; device: string; bid: string; country: string; date: string };

/** "OMNIPRO TABOOLA US" → { product: OMNIPRO, source: taboola, country: US } */
export function parseRtName(name: string): RtName | null {
  const t = tokens(name);
  if (t.length < 3) return null;
  const country = nameCountry(t[t.length - 1]);
  const source = sourceOf(t[t.length - 2]);
  if (!isCountry(country) || !source) return null;
  const product = normProduct(t.slice(0, -2).join(""));
  return product ? { product, source, country } : null;
}

/** "OMNIPRO DESKTOP MAXCONV US 05.11.26" → product, device, bid, country, date */
export function parseSourceName(name: string): SourceName | null {
  const t = tokens(name);
  if (t.length < 4) return null;
  let i = t.length - 1;
  let date = "";
  if (MONTHS.test(t[i]) && /^\d{1,2}$/.test(t[i - 1] ?? "")) {
    date = `${t[i - 1]} ${t[i]}`; // "6 NOV", "20 OUT"
    i -= 2;
  } else if (isDate(t[i])) date = t[i--];
  // Extra tags may sit between the country and the date ("[UK] [CP02] 29.Aug").
  let k = i;
  while (k > 1 && i - k < 2 && !isCountry(t[k])) k--;
  if (!isCountry(t[k])) return null;
  const country = nameCountry(t[k]);
  i = k - 1;
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
export const namingKey = (product: string, platform: string, country: string) => `pc:${normProduct(product)}|${platform}|${nameCountry(country)}`;

const bracket = (parts: string[]) => parts.map((p) => `[${p}]`).join(" ");

export function buildRtName(product: string, platform: string, country: string) {
  return bracket([normProduct(product), SOURCE_NAME[platform] ?? platform.toUpperCase(), nameCountry(country)]);
}

export function buildSourceName(product: string, device: string, bid: string, country: string, date: Date = new Date()) {
  const dd = String(date.getDate()).padStart(2, "0");
  const mm = String(date.getMonth() + 1).padStart(2, "0");
  const yy = String(date.getFullYear()).slice(2);
  return bracket([normProduct(product), device.toUpperCase(), bid.toUpperCase(), nameCountry(country), `${dd}.${mm}.${yy}`]);
}
