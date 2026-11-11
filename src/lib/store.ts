import "server-only";
import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";
import { promises as fs } from "node:fs";
import path from "node:path";
import postgres from "postgres";
import type { Connection } from "./types";

/**
 * Credentials are stored in data/connections.json, encrypted with AES-256-GCM.
 * Swap this module for a database (Postgres, Supabase…) when deploying to a
 * serverless host where the filesystem is not persistent.
 */
const FILE = path.join(process.cwd(), "data", "connections.json");

export type Settings = {
  currency: string;
  paymentFeePercent: number;
  paymentFeeFixed: number;
  /** Used when Shopify has no unit cost for a variant. */
  defaultCogsPercent: number;
  /** "traffic" = use each platform's API; "redtrack" = use RedTrack cost for everything. */
  spendSource: "traffic" | "redtrack";
  /** Supplier (Wiio) unit cost by product title. Used when Shopify has no cost per item. */
  productCosts: Record<string, number>;
  /** Supplier shipping: first item of an order, and each extra item. */
  shippingFirstItem: number;
  shippingExtraItem: number;
  /** RedTrack field that counts InitiateCheckout (e.g. "convtype2"); empty hides the IC column. */
  redtrackIcField: string;
  /** Manual links "platform:sourceCampaignId" → campaign key of the RedTrack / utm_campaign it belongs to. */
  campaignLinks: Record<string, string>;
  /**
   * Campaigns whose spend must not count (e.g. other products running in the same account).
   * key: "src:<platform>:<campaignId>" for a source campaign, "rtc:<redtrackCampaignId>" for a RedTrack one.
   */
  excludedCampaigns: { key: string; label: string; platform: string; accountId?: string; campaignId?: string; rtId?: string; at: string }[];
  /** Site / widget blocklists reused when creating campaigns. */
  blocklists: Blocklist[];
  /** Product chosen by hand for a creative: "img:<image key>" / "hl:<headline key>" → product. */
  creativeProducts: Record<string, string>;
  /** Learned from every Wiio upload. */
  supplierModel?: SupplierModel;
};

/** Exact supplier cost of one order, from an imported supplier export. */
export type SupplierCost = {
  product: number;
  shipping: number;
  total: number;
  date?: string;
  /** Products of the order (one entry per unit), to keep learning unit costs across uploads. */
  items?: string[];
};
export type SupplierImport = {
  at: string;
  file: string;
  orders: number;
  /** Order dates covered by this file. */
  from?: string;
  to?: string;
  newOrders?: number;
  updatedOrders?: number;
};

/** What the uploads taught about costs (all files, recent orders weigh more). */
export type SupplierModel = {
  updatedAt: string;
  /** Orders with exact cost that the model learned from. */
  orders: number;
  /** Exact costs exist up to this order date; later orders use the model. */
  coveredFrom?: string;
  coveredTo?: string;
  avgProductPerOrder: number;
  avgShippingPerOrder: number;
  avgTotalPerOrder: number;
  avgProductPerUnit: number;
  avgUnitsPerOrder: number;
};

type FileShape = {
  connections: Record<string, string>;
  settings: Settings;
  /** Keyed by order number ("#1031"). */
  supplierCosts: Record<string, SupplierCost>;
  supplierImports: SupplierImport[];
  /** Library of AI-generated creative variants (metadata; image bytes live in the asset store). */
  variants: CreativeVariant[];
  /** Saved setups for new campaigns, per source. */
  campaignTemplates: CampaignTemplate[];
  /** Every campaign created/duplicated/edited from the CRM. */
  campaignLog: CampaignLogEntry[];
  savedHeadlines?: SavedHeadline[];
  /** Last analyses of the native-ads analyst. */
  analyses?: { id: string; at: string; product: string | null; data: unknown }[];
  /** API session tokens kept between restarts (encrypted), e.g. Outbrain's 30-day OB-TOKEN-V1. */
  tokens?: Record<string, string>;
};

/** Campaign setup saved once and reused. Fields not used by a platform are ignored. */
export type CampaignSetup = {
  product: string;
  countries: string[];
  devices: ("DESKTOP" | "MOBILE" | "TABLET")[];
  /** Taboola: MAX_CONVERSIONS | TARGET_CPA | SMART | FIXED · Revcontent: cpc | cpa */
  bidStrategy: string;
  cpc?: number;
  cpaGoal?: number;
  /** Taboola: MONTHLY | ENTIRE | NONE */
  spendingLimitModel?: string;
  spendingLimit?: number;
  dailyCap?: number;
  marketingObjective?: string;
  brandingText: string;
  trackingCode?: string;
  /** Revcontent */
  budget?: number;
  pacing?: boolean;
  bidAppleNews?: number;
  bidEmail?: number;
  /** Revcontent: conversion pixel id (required when optimizing for CPA). */
  conversionId?: string;
  /** YYYY-MM-DD; empty = today. */
  startDate?: string;
  /** YYYY-MM-DD; empty = no end date. */
  endDate?: string;
  /** Dayparting: same hours on the chosen days, in the given time zone. */
  schedule?: CampaignSchedule;
  /** Taboola: OPTIMIZED (prioritize top performing ads) | EVEN (A/B testing). */
  trafficAllocation?: "OPTIMIZED" | "EVEN";
  /** Sites (Taboola) / widget ids (Revcontent) to block, on top of what the template campaign already blocks. */
  blockedSites?: string[];
  /** Saved blocklists applied to the campaign. */
  blocklistIds?: string[];
  /** Successful campaign used as the base: its settings, blocks and tracking are copied. */
  templateCampaign?: { accountId: string; campaignId: string; name: string };
  /** With a template campaign: keep its blocked sites (default yes) and per-site bid adjustments (default no). */
  inheritBlocks?: boolean;
  inheritBidModifiers?: boolean;
  /** Taboola: the campaign goes into a group whose budget is shared (it then has no budget of its own). */
  groupShared?: boolean;
  /** Read-only info about the template (shown in the form). */
  templateInfo?: { blockedSites: number; bidModifiers: number; timeZone?: string };
};

export type CampaignSchedule = {
  mode: "ALWAYS" | "CUSTOM";
  days: string[];
  fromHour: number;
  untilHour: number;
  timeZone?: string;
};

export type Blocklist = { id: string; name: string; platform: "taboola" | "revcontent"; sites: string[]; updatedAt: string };

export type CampaignTemplate = { id: string; name: string; platform: "taboola" | "revcontent"; setup: CampaignSetup; updatedAt: string };

export type CampaignLogEntry = {
  id: string;
  at: string;
  action: "criada" | "duplicada" | "criativos";
  platform: string;
  accountId: string;
  campaignId: string;
  campaignName: string;
  rtCampaign?: string;
  url?: string;
  items: number;
  steps: string[];
  ok: boolean;
  /** Creatives that did not go up, with the reason (and the ad id when Taboola created it but was still crawling). */
  failed?: { creative: { kind: "variant"; variantId: string; headline?: string } | { kind: "ad"; imageUrl: string; headline: string }; error: string; itemId?: string; label: string }[];
};

/** Where a variant came from: the ad it was generated from. */
export type VariantSource = {
  platform: "taboola" | "revcontent";
  accountId: string;
  campaignId: string;
  campaignName: string;
  itemId: string;
  title: string;
  imageUrl: string;
  url: string;
  /** Brand name shown on the original ad (Revcontent requires one). */
  brand?: string;
};

export type CreativeVariant = {
  id: string;
  createdAt: string;
  source: VariantSource;
  assetId: string;
  headline: string;
  model: string;
  mode: string;
  style: string;
  prompt: string;
  status: "new" | "published" | "archived";
  published?: { platform: string; itemId: string; at: string; status: string }[];
  /** "ai" = generated here · "spy" = found in a spy tool / elsewhere and added by hand. */
  origin?: "ai" | "spy";
  /** Product the creative is for (e.g. OMNIPRO). */
  product?: string;
  description?: string;
  /** Where it came from (spy tool, competitor, link…). */
  note?: string;
};

/** Headline saved to the library (from a spy tool, a competitor, an idea…). */
export type SavedHeadline = { id: string; text: string; product: string; description?: string; note?: string; createdAt: string };

const DEFAULT_SETTINGS: Settings = {
  currency: process.env.CURRENCY || "USD",
  paymentFeePercent: 5.9,
  paymentFeeFixed: 0.3,
  defaultCogsPercent: 18,
  spendSource: "traffic",
  productCosts: {},
  shippingFirstItem: 0,
  shippingExtraItem: 0,
  redtrackIcField: "",
  campaignLinks: {},
  excludedCampaigns: [],
  blocklists: [],
  creativeProducts: {},
};

function key(): Buffer {
  const raw = process.env.ENCRYPTION_KEY;
  if (!raw) {
    if (process.env.NODE_ENV === "production") throw new Error("ENCRYPTION_KEY não definida");
    return createHash("sha256").update("dev-only-insecure-key").digest();
  }
  return createHash("sha256").update(raw).digest();
}

function encrypt(plain: string): string {
  const iv = randomBytes(12);
  const c = createCipheriv("aes-256-gcm", key(), iv);
  const enc = Buffer.concat([c.update(plain, "utf8"), c.final()]);
  return [iv, c.getAuthTag(), enc].map((b) => b.toString("base64")).join(".");
}

function decrypt(payload: string): string {
  const [iv, tag, enc] = payload.split(".").map((s) => Buffer.from(s, "base64"));
  const d = createDecipheriv("aes-256-gcm", key(), iv);
  d.setAuthTag(tag);
  return Buffer.concat([d.update(enc), d.final()]).toString("utf8");
}

/**
 * Two backends:
 *  - DATABASE_URL set → Postgres (Railway, Neon, Supabase…). Required on hosts
 *    whose disk is wiped on every deploy.
 *  - otherwise       → data/connections.json on local disk.
 */
type Sql = ReturnType<typeof postgres>;
let sqlPromise: Promise<Sql> | null = null;

function db(): Promise<Sql> | null {
  const url = process.env.DATABASE_URL;
  if (!url) return null;
  sqlPromise ??= (async () => {
    const sql = postgres(url, { max: 3, ssl: /localhost|127\.0\.0\.1|\.railway\.internal/.test(url) ? false : "require" });
    await sql`CREATE TABLE IF NOT EXISTS app_state (key text PRIMARY KEY, value text NOT NULL)`;
    return sql;
  })();
  return sqlPromise;
}

async function readRaw(): Promise<string | null> {
  const p = db();
  if (p) {
    const sql = await p;
    const rows = await sql<{ value: string }[]>`SELECT value FROM app_state WHERE key = 'state'`;
    return rows[0]?.value ?? null;
  }
  try {
    return await fs.readFile(FILE, "utf8");
  } catch {
    return null;
  }
}

async function read(): Promise<FileShape> {
  const raw = await readRaw();
  const parsed = (raw ? JSON.parse(raw) : {}) as Partial<FileShape>;
  return {
    connections: parsed.connections ?? {},
    settings: { ...DEFAULT_SETTINGS, ...parsed.settings },
    supplierCosts: parsed.supplierCosts ?? {},
    supplierImports: parsed.supplierImports ?? [],
    variants: parsed.variants ?? [],
    campaignTemplates: parsed.campaignTemplates ?? [],
    campaignLog: parsed.campaignLog ?? [],
    tokens: parsed.tokens ?? {},
    savedHeadlines: parsed.savedHeadlines ?? [],
  };
}

// ------------------------------- separate documents -------------------------------
// Data that changes often and has nothing to do with credentials (e.g. the product pipeline) lives in its own
// key, so it neither bloats nor races with the main state. Postgres row in app_state, or data/<key>.json locally.

export async function readDoc<T>(docKey: string, fallback: T): Promise<T> {
  if (!/^[a-z0-9_-]+$/.test(docKey) || docKey === "state") throw new Error("chave inválida");
  const p = db();
  let raw: string | null = null;
  if (p) {
    const sql = await p;
    raw = (await sql<{ value: string }[]>`SELECT value FROM app_state WHERE key = ${docKey}`)[0]?.value ?? null;
  } else {
    raw = await fs.readFile(path.join(process.cwd(), "data", `${docKey}.json`), "utf8").catch(() => null);
  }
  return raw ? (JSON.parse(raw) as T) : fallback;
}

export async function writeDoc(docKey: string, value: unknown) {
  if (!/^[a-z0-9_-]+$/.test(docKey) || docKey === "state") throw new Error("chave inválida");
  const json = JSON.stringify(value);
  const p = db();
  if (p) {
    const sql = await p;
    await sql`INSERT INTO app_state (key, value) VALUES (${docKey}, ${json})
              ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value`;
    return;
  }
  await fs.mkdir(path.join(process.cwd(), "data"), { recursive: true });
  await fs.writeFile(path.join(process.cwd(), "data", `${docKey}.json`), json, { mode: 0o600 });
}

/** Saved API session token (decrypted), or undefined. */
export async function getToken(key: string): Promise<{ token: string; expires: number } | undefined> {
  const blob = (await read()).tokens?.[key];
  if (!blob) return undefined;
  try {
    return JSON.parse(decrypt(blob)) as { token: string; expires: number };
  } catch {
    return undefined;
  }
}

export async function putToken(key: string, value: { token: string; expires: number } | null) {
  const data = await read();
  const tokens = { ...(data.tokens ?? {}) };
  if (value) tokens[key] = encrypt(JSON.stringify(value));
  else delete tokens[key];
  await write({ ...data, tokens });
}

async function write(data: FileShape) {
  const json = JSON.stringify(data, null, 2);
  const p = db();
  if (p) {
    const sql = await p;
    await sql`INSERT INTO app_state (key, value) VALUES ('state', ${json})
              ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value`;
    return;
  }
  await fs.mkdir(path.dirname(FILE), { recursive: true });
  await fs.writeFile(FILE, json, { mode: 0o600 });
}

export async function listConnections(): Promise<Connection[]> {
  return (await storageStatus()).connections;
}

/** Where credentials live, and how many saved entries can't be decrypted (ENCRYPTION_KEY changed). */
export async function storageStatus() {
  const data = await read();
  const connections: Connection[] = [];
  let unreadable = 0;
  for (const blob of Object.values(data.connections)) {
    try {
      connections.push(JSON.parse(decrypt(blob)) as Connection);
    } catch {
      unreadable++;
    }
  }
  return {
    backend: process.env.DATABASE_URL ? ("postgres" as const) : ("disk" as const),
    production: process.env.NODE_ENV === "production",
    unreadable,
    connections,
  };
}

export async function getConnection(id: string): Promise<Connection | undefined> {
  return (await listConnections()).find((c) => c.id === id);
}

export async function saveConnection(conn: Connection) {
  const data = await read();
  data.connections[conn.id] = encrypt(JSON.stringify(conn));
  await write(data);
}

export async function deleteConnection(id: string) {
  const data = await read();
  delete data.connections[id];
  await write(data);
}

export async function getSupplierCosts(): Promise<Record<string, SupplierCost>> {
  return (await read()).supplierCosts;
}

export async function getSupplierImports(): Promise<SupplierImport[]> {
  return (await read()).supplierImports;
}

/** Merges exact per-order costs and the derived cost table from a supplier export. */
export async function saveSupplierImport(
  costs: Record<string, SupplierCost>,
  info: SupplierImport,
  table: Partial<Settings>,
  learn?: (all: Record<string, SupplierCost>) => { table: Partial<Settings>; model: SupplierModel } | null,
) {
  const data = await read();
  info.newOrders = Object.keys(costs).filter((k) => !data.supplierCosts[k]).length;
  info.updatedOrders = Object.keys(costs).length - info.newOrders;
  data.supplierCosts = { ...data.supplierCosts, ...costs };
  // Keep the newest 20k orders.
  const keys = Object.keys(data.supplierCosts);
  if (keys.length > 20000) {
    const sorted = keys.sort((a, b) => (data.supplierCosts[a].date ?? "").localeCompare(data.supplierCosts[b].date ?? ""));
    for (const k of sorted.slice(0, keys.length - 20000)) delete data.supplierCosts[k];
  }
  data.supplierImports = [info, ...data.supplierImports].slice(0, 30);
  // Every upload adds to what we know: the cost table is relearned from all stored orders.
  const learned = learn?.(data.supplierCosts);
  const t = learned?.table ?? table;
  data.settings = {
    ...data.settings,
    ...t,
    productCosts: { ...data.settings.productCosts, ...(t.productCosts ?? {}) },
    ...(learned ? { supplierModel: learned.model } : {}),
  };
  await write(data);
  return learned?.model;
}

export async function getSettings(): Promise<Settings> {
  return (await read()).settings;
}

export async function saveSettings(patch: Partial<Settings>) {
  const data = await read();
  data.settings = { ...data.settings, ...patch };
  await write(data);
}

/**
 * Connections of the same provider with identical credentials (the same account added twice) collapse
 * into one, so spend is never counted twice.
 */
export function uniqueAccounts(conns: Connection[]): Connection[] {
  const seen = new Set<string>();
  return conns.filter((c) => {
    const k = `${c.provider}|${JSON.stringify(Object.entries(c.credentials).sort())}`;
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
}

/** Mask secrets before sending connections to the browser. */
export function redact(conn: Connection): Connection {
  const credentials: Record<string, string> = {};
  for (const [k, v] of Object.entries(conn.credentials)) {
    const secret = /token|secret|key|password|auth/i.test(k);
    credentials[k] = secret && v ? `••••${v.slice(-4)}` : v;
  }
  return { ...conn, credentials };
}

// ------------------------------- campaign builder -------------------------------

export async function listTemplates(): Promise<CampaignTemplate[]> {
  return (await read()).campaignTemplates;
}

export async function saveTemplate(t: CampaignTemplate) {
  const data = await read();
  data.campaignTemplates = [t, ...data.campaignTemplates.filter((x) => x.id !== t.id)];
  await write(data);
}

export async function deleteTemplate(id: string) {
  const data = await read();
  data.campaignTemplates = data.campaignTemplates.filter((x) => x.id !== id);
  await write(data);
}

export async function listCampaignLog(): Promise<CampaignLogEntry[]> {
  return (await read()).campaignLog;
}

export async function updateCampaignLog(id: string, patch: Partial<CampaignLogEntry>) {
  const data = await read();
  data.campaignLog = data.campaignLog.map((e) => (e.id === id ? { ...e, ...patch } : e));
  await write(data);
}

export async function addCampaignLog(e: CampaignLogEntry) {
  const data = await read();
  data.campaignLog = [e, ...data.campaignLog].slice(0, 1000);
  await write(data);
}

// ------------------------------- creative variants -------------------------------

export async function listAnalyses() {
  return (await read()).analyses ?? [];
}

export async function saveAnalysis(a: { id: string; at: string; product: string | null; data: unknown }) {
  const data = await read();
  await write({ ...data, analyses: [a, ...(data.analyses ?? [])].slice(0, 20) });
}

export async function listSavedHeadlines(): Promise<SavedHeadline[]> {
  return (await read()).savedHeadlines ?? [];
}

export async function saveHeadlines(add: SavedHeadline[]) {
  const data = await read();
  await write({ ...data, savedHeadlines: [...add, ...(data.savedHeadlines ?? [])].slice(0, 3000) });
}

export async function updateSavedHeadline(id: string, patch: Partial<SavedHeadline> | null) {
  const data = await read();
  const list = (data.savedHeadlines ?? []).flatMap((h) => (h.id !== id ? [h] : patch ? [{ ...h, ...patch }] : []));
  await write({ ...data, savedHeadlines: list });
}

export async function listVariants(): Promise<CreativeVariant[]> {
  return (await read()).variants;
}

export async function saveVariants(add: CreativeVariant[]) {
  const data = await read();
  data.variants = [...add, ...data.variants].slice(0, 2000);
  await write(data);
}

export async function updateVariant(id: string, patch: Partial<CreativeVariant>): Promise<CreativeVariant | undefined> {
  const data = await read();
  const v = data.variants.find((x) => x.id === id);
  if (!v) return undefined;
  Object.assign(v, patch);
  await write(data);
  return v;
}

export async function deleteVariant(id: string) {
  const data = await read();
  const v = data.variants.find((x) => x.id === id);
  data.variants = data.variants.filter((x) => x.id !== id);
  await write(data);
  if (v) await deleteAsset(v.assetId);
}

// ------------------------------------ assets ------------------------------------
// Image bytes (generated variants). Ids are 32 random hex chars, so a public URL
// (needed by Revcontent, which fetches the image itself) can't be guessed.

const ASSET_DIR = path.join(process.cwd(), "data", "assets");

export async function putAsset(bytes: Buffer, mime: string): Promise<string> {
  const id = randomBytes(16).toString("hex");
  const p = db();
  if (p) {
    const sql = await p;
    await sql`CREATE TABLE IF NOT EXISTS assets (id text PRIMARY KEY, mime text NOT NULL, data bytea NOT NULL, created_at timestamptz NOT NULL DEFAULT now())`;
    await sql`INSERT INTO assets (id, mime, data) VALUES (${id}, ${mime}, ${bytes})`;
    return id;
  }
  await fs.mkdir(ASSET_DIR, { recursive: true });
  await fs.writeFile(path.join(ASSET_DIR, `${id}`), bytes);
  await fs.writeFile(path.join(ASSET_DIR, `${id}.mime`), mime);
  return id;
}

export async function getAsset(id: string): Promise<{ bytes: Buffer; mime: string } | null> {
  if (!/^[a-f0-9]{32}$/.test(id)) return null;
  const p = db();
  if (p) {
    const sql = await p;
    await sql`CREATE TABLE IF NOT EXISTS assets (id text PRIMARY KEY, mime text NOT NULL, data bytea NOT NULL, created_at timestamptz NOT NULL DEFAULT now())`;
    const rows = await sql<{ mime: string; data: Buffer }[]>`SELECT mime, data FROM assets WHERE id = ${id}`;
    return rows[0] ? { bytes: Buffer.from(rows[0].data), mime: rows[0].mime } : null;
  }
  try {
    return {
      bytes: await fs.readFile(path.join(ASSET_DIR, id)),
      mime: await fs.readFile(path.join(ASSET_DIR, `${id}.mime`), "utf8"),
    };
  } catch {
    return null;
  }
}

export async function deleteAsset(id: string) {
  if (!/^[a-f0-9]{32}$/.test(id)) return;
  const p = db();
  if (p) {
    const sql = await p;
    await sql`DELETE FROM assets WHERE id = ${id}`.catch(() => {});
    return;
  }
  await fs.unlink(path.join(ASSET_DIR, id)).catch(() => {});
  await fs.unlink(path.join(ASSET_DIR, `${id}.mime`)).catch(() => {});
}

/** Append an incoming webhook event (keeps the last 5000). */
export async function appendEvent(source: string, payload: unknown) {
  const entry = { source, receivedAt: new Date().toISOString(), payload };
  const p = db();
  if (p) {
    const sql = await p;
    await sql`CREATE TABLE IF NOT EXISTS webhook_events (id bigserial PRIMARY KEY, source text NOT NULL, received_at timestamptz NOT NULL DEFAULT now(), payload text NOT NULL)`;
    await sql`INSERT INTO webhook_events (source, payload) VALUES (${source}, ${JSON.stringify(payload)})`;
    return;
  }
  const file = path.join(process.cwd(), "data", `${source}-events.json`);
  let events: unknown[] = [];
  try {
    events = JSON.parse(await fs.readFile(file, "utf8"));
  } catch {}
  events.push(entry);
  await fs.mkdir(path.dirname(file), { recursive: true });
  await fs.writeFile(file, JSON.stringify(events.slice(-5000)));
}
