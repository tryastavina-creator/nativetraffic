import "server-only";
import { randomBytes } from "node:crypto";
import { deleteAsset, putAsset, readDoc, writeDoc } from "./store";
import {
  normalizeImport,
  parsePriority,
  STAGES,
  type Esteira,
  type PageRef,
  type Product,
  type Stage,
} from "./esteiraShared";

const KEY = "esteira";
const EMPTY: Esteira = { products: [], refs: [] };
const newId = () => randomBytes(8).toString("hex");
const now = () => new Date().toISOString();
const isStage = (s: unknown): s is Stage => STAGES.some((x) => x.id === s);
const isAsset = (t?: string) => !!t && /^[a-f0-9]{32}$/.test(t);

/** Writes are serialized so two quick drags never overwrite each other. */
let chain: Promise<unknown> = Promise.resolve();
function mutate<T>(fn: (d: Esteira) => T | Promise<T>): Promise<T> {
  const run = chain.then(async () => {
    const d = await readDoc<Esteira>(KEY, EMPTY);
    d.products ??= [];
    d.refs ??= [];
    const out = await fn(d);
    await writeDoc(KEY, d);
    return out;
  });
  chain = run.catch(() => {});
  return run;
}

export async function getEsteira(): Promise<Esteira> {
  const d = await readDoc<Esteira>(KEY, EMPTY);
  return { products: d.products ?? [], refs: d.refs ?? [] };
}

const str = (v: unknown, max = 2000) => (typeof v === "string" ? v.trim().slice(0, max) || undefined : undefined);
const url = (v: unknown) => {
  const s = str(v, 2000);
  return s && /^https?:\/\//i.test(s) ? s : undefined;
};

/** Only the fields a person can edit, cleaned. */
function clean(p: Record<string, unknown>): Partial<Product> {
  const out: Partial<Product> = {};
  if ("name" in p) out.name = str(p.name, 200) ?? "";
  if ("stage" in p && isStage(p.stage)) out.stage = p.stage;
  if ("priority" in p) out.priority = parsePriority(str(p.priority));
  if ("country" in p) out.country = str(p.country, 2)?.toUpperCase();
  if ("niche" in p) out.niche = str(p.niche, 80);
  if ("source" in p) out.source = str(p.source, 40);
  if ("thumb" in p) out.thumb = isAsset(str(p.thumb)) ? str(p.thumb) : url(p.thumb);
  if ("adUrl" in p) out.adUrl = url(p.adUrl);
  if ("lpUrl" in p) out.lpUrl = url(p.lpUrl);
  if ("offerUrl" in p) out.offerUrl = url(p.offerUrl);
  if ("notes" in p) out.notes = str(p.notes, 5000);
  return out;
}

const lastOrder = (d: Esteira, stage: Stage) =>
  d.products.filter((x) => x.stage === stage).reduce((m, x) => Math.max(m, x.order), 0);

export function createProduct(input: Record<string, unknown>) {
  return mutate((d) => {
    const fields = clean(input);
    if (!fields.name) throw new Error("Dê um nome ao produto.");
    const stage = fields.stage ?? "minerado";
    const p: Product = { ...fields, name: fields.name, stage, id: newId(), order: lastOrder(d, stage) + 1, createdAt: now(), updatedAt: now() };
    d.products.push(p);
    return p;
  });
}

export function updateProduct(id: string, patch: Record<string, unknown>) {
  return mutate(async (d) => {
    const p = d.products.find((x) => x.id === id);
    if (!p) throw new Error("Produto não encontrado.");
    const fields = clean(patch);
    if ("name" in fields && !fields.name) throw new Error("O nome não pode ficar vazio.");
    const oldThumb = p.thumb;
    Object.assign(p, fields, { updatedAt: now() });
    if (oldThumb !== p.thumb && isAsset(oldThumb)) await deleteAsset(oldThumb!);
    return p;
  });
}

/** Drag & drop: put the product in `stage` right before `beforeId` (or at the end), renumbering that column. */
export function moveProduct(id: string, stage: Stage, beforeId?: string) {
  return mutate((d) => {
    const p = d.products.find((x) => x.id === id);
    if (!p || !isStage(stage)) throw new Error("Produto não encontrado.");
    const col = d.products.filter((x) => x.stage === stage && x.id !== id).sort((a, b) => a.order - b.order);
    const at = beforeId ? col.findIndex((x) => x.id === beforeId) : -1;
    col.splice(at < 0 ? col.length : at, 0, p);
    if (p.stage !== stage) p.updatedAt = now();
    p.stage = stage;
    col.forEach((x, i) => (x.order = i + 1));
    return p;
  });
}

export function deleteProduct(id: string) {
  return mutate(async (d) => {
    const p = d.products.find((x) => x.id === id);
    d.products = d.products.filter((x) => x.id !== id);
    if (isAsset(p?.thumb)) await deleteAsset(p!.thumb!);
  });
}

export async function uploadThumb(dataUrl: string): Promise<string> {
  const m = /^data:(image\/(?:png|jpe?g|webp|gif));base64,(.+)$/.exec(dataUrl);
  if (!m) throw new Error("Imagem inválida (use JPG, PNG, WebP ou GIF).");
  const bytes = Buffer.from(m[2], "base64");
  if (bytes.length > 2 * 1024 * 1024) throw new Error("Imagem maior que 2 MB.");
  return putAsset(bytes, m[1]);
}

export function addRef(input: Record<string, unknown>) {
  return mutate((d) => {
    const u = url(input.url);
    if (!u) throw new Error("Cole o link completo da página (https://…).");
    const r: PageRef = { id: newId(), url: u, title: str(input.title, 200), note: str(input.note, 2000), createdAt: now() };
    d.refs.unshift(r);
    return r;
  });
}

export function deleteRef(id: string) {
  return mutate((d) => {
    d.refs = d.refs.filter((r) => r.id !== id);
  });
}

/** Import: products matched by id, then by name (case-insensitive), are updated; the rest are added. Refs dedupe by URL. */
export function importJson(raw: unknown) {
  const { products, refs } = normalizeImport(raw);
  if (!products.length && !refs.length) throw new Error("Não achei produtos nem referências nesse JSON.");
  return mutate((d) => {
    let added = 0;
    let updated = 0;
    for (const ip of products) {
      const { id, ...rest } = ip;
      const fields = clean(rest as Record<string, unknown>);
      const hit =
        (id && d.products.find((x) => x.id === id)) ||
        d.products.find((x) => x.name.toLowerCase() === (fields.name ?? "").toLowerCase());
      if (hit) {
        for (const [k, v] of Object.entries(fields)) if (v !== undefined) (hit as Record<string, unknown>)[k] = v;
        hit.updatedAt = now();
        updated++;
      } else {
        const stage = fields.stage ?? "minerado";
        d.products.push({ ...fields, name: fields.name!, stage, id: newId(), order: lastOrder(d, stage) + 1, createdAt: now(), updatedAt: now() });
        added++;
      }
    }
    let refsAdded = 0;
    const seen = new Set(d.refs.map((r) => r.url));
    for (const r of refs) {
      if (seen.has(r.url)) continue;
      seen.add(r.url);
      d.refs.push({ id: newId(), url: r.url, title: r.title, note: r.note, createdAt: now() });
      refsAdded++;
    }
    return { added, updated, refsAdded };
  });
}
