import "server-only";
import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";
import { promises as fs } from "node:fs";
import path from "node:path";
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
};

type FileShape = { connections: Record<string, string>; settings: Settings };

const DEFAULT_SETTINGS: Settings = {
  currency: process.env.CURRENCY || "USD",
  paymentFeePercent: 5.9,
  paymentFeeFixed: 0.3,
  defaultCogsPercent: 18,
  spendSource: "traffic",
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

async function read(): Promise<FileShape> {
  try {
    const parsed = JSON.parse(await fs.readFile(FILE, "utf8")) as Partial<FileShape>;
    return {
      connections: parsed.connections ?? {},
      settings: { ...DEFAULT_SETTINGS, ...parsed.settings },
    };
  } catch {
    return { connections: {}, settings: DEFAULT_SETTINGS };
  }
}

async function write(data: FileShape) {
  await fs.mkdir(path.dirname(FILE), { recursive: true });
  await fs.writeFile(FILE, JSON.stringify(data, null, 2), { mode: 0o600 });
}

export async function listConnections(): Promise<Connection[]> {
  const data = await read();
  const out: Connection[] = [];
  for (const blob of Object.values(data.connections)) {
    try {
      out.push(JSON.parse(decrypt(blob)) as Connection);
    } catch {
      // Unreadable entry (key changed) — skip it.
    }
  }
  return out;
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

export async function getSettings(): Promise<Settings> {
  return (await read()).settings;
}

export async function saveSettings(patch: Partial<Settings>) {
  const data = await read();
  data.settings = { ...data.settings, ...patch };
  await write(data);
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
