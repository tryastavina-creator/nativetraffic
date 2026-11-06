import { randomBytes } from "node:crypto";
import { NextResponse } from "next/server";
import { guardRoute } from "@/lib/auth";
import { normProduct } from "@/lib/naming";
import {
  getSettings,
  listSavedHeadlines,
  putAsset,
  saveHeadlines,
  saveSettings,
  saveVariants,
  updateSavedHeadline,
  updateVariant,
  type CreativeVariant,
  type SavedHeadline,
} from "@/lib/store";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const MAX_BYTES = 8 * 1024 * 1024;
const id = () => randomBytes(8).toString("hex");
const clean = (xs: unknown) =>
  [...new Set((Array.isArray(xs) ? xs : String(xs ?? "").split("\n")).map((x) => String(x).trim()).filter(Boolean))].slice(0, 50);

/** Only public http(s) image URLs (no localhost / private networks). */
function publicUrl(u: string) {
  try {
    const url = new URL(u);
    if (!/^https?:$/.test(url.protocol)) return false;
    const h = url.hostname.toLowerCase();
    return !(h === "localhost" || h.endsWith(".local") || h.endsWith(".internal") || /^(127\.|10\.|192\.168\.|169\.254\.|172\.(1[6-9]|2\d|3[01])\.|0\.|\[)/.test(h));
  } catch {
    return false;
  }
}

async function imageFrom(b: { imageUrl?: string; imageData?: string }): Promise<{ bytes: Buffer; mime: string }> {
  if (b.imageData) {
    const m = /^data:(image\/(?:png|jpe?g|webp|gif));base64,(.+)$/.exec(b.imageData);
    if (!m) throw new Error("Arquivo de imagem inválido (use JPG, PNG, WebP ou GIF).");
    const bytes = Buffer.from(m[2], "base64");
    if (bytes.length > MAX_BYTES) throw new Error("Imagem maior que 8 MB.");
    return { bytes, mime: m[1] };
  }
  if (!b.imageUrl || !publicUrl(b.imageUrl)) throw new Error("Informe o link público da imagem (https://…).");
  const res = await fetch(b.imageUrl, { cache: "no-store", signal: AbortSignal.timeout(20_000), redirect: "follow" });
  const mime = (res.headers.get("content-type") ?? "").split(";")[0];
  if (!res.ok || !mime.startsWith("image/")) throw new Error("Não consegui baixar a imagem desse link (ele precisa abrir a imagem direto).");
  const bytes = Buffer.from(await res.arrayBuffer());
  if (bytes.length > MAX_BYTES) throw new Error("Imagem maior que 8 MB.");
  return { bytes, mime };
}

/**
 * Library of creatives and headlines added by hand (spy tools, competitors, ideas), each tied to a product.
 *  POST { kind: "creative", imageUrl | imageData, headlines[], description?, product, note? } → one creative per headline
 *  POST { kind: "headlines", headlines[], product, description?, note? }
 *  PATCH { kind: "product", key: "img:…" | "hl:…", product } → product of an ad image / headline from the sources
 *  PATCH { kind: "variant", id, product?, headline?, description? } · { kind: "headline", id, product?, text? }
 *  DELETE ?headline=<id>
 */
export async function GET(req: Request) {
  const denied = await guardRoute(req);
  if (denied) return denied;
  return NextResponse.json({ headlines: await listSavedHeadlines() });
}

export async function POST(req: Request) {
  const denied = await guardRoute(req);
  if (denied) return denied;
  const b = (await req.json()) as {
    kind?: string;
    imageUrl?: string;
    imageData?: string;
    headlines?: string[] | string;
    description?: string;
    product?: string;
    note?: string;
  };
  const product = normProduct(b.product ?? "");
  if (!product) return NextResponse.json({ error: "Escolha o produto." }, { status: 400 });
  const headlines = clean(b.headlines);
  const description = (b.description ?? "").trim().slice(0, 250) || undefined;
  const note = (b.note ?? "").trim().slice(0, 120) || undefined;
  const now = new Date().toISOString();

  if (b.kind === "headlines") {
    if (!headlines.length) return NextResponse.json({ error: "Escreva pelo menos uma headline." }, { status: 400 });
    const add: SavedHeadline[] = headlines.map((text) => ({ id: id(), text: text.slice(0, 150), product, description, note, createdAt: now }));
    await saveHeadlines(add);
    return NextResponse.json({ ok: true, added: add.length });
  }

  try {
    const img = await imageFrom(b);
    const assetId = await putAsset(img.bytes, img.mime);
    // Image alone is fine (headline chosen when it goes into a campaign); each headline → one creative.
    const add: CreativeVariant[] = (headlines.length ? headlines : [""]).map((headline) => ({
      id: id(),
      createdAt: now,
      origin: "spy",
      product,
      description,
      note,
      source: { platform: "taboola", accountId: "", campaignId: "", campaignName: note ?? "Adicionado à mão", itemId: "", title: headline, imageUrl: `/api/assets/${assetId}`, url: "" },
      assetId,
      headline: headline.slice(0, 150),
      model: "",
      mode: "",
      style: "",
      prompt: "",
      status: "new",
    }));
    await saveVariants(add);
    // The headlines also go to the headline library of the product.
    if (headlines.length) await saveHeadlines(headlines.map((text) => ({ id: id(), text: text.slice(0, 150), product, description, note, createdAt: now })));
    return NextResponse.json({ ok: true, added: add.length });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 400 });
  }
}

export async function PATCH(req: Request) {
  const denied = await guardRoute(req);
  if (denied) return denied;
  const b = (await req.json()) as { kind?: string; key?: string; id?: string; product?: string; headline?: string; text?: string; description?: string };
  const product = b.product !== undefined ? normProduct(b.product) : undefined;
  if (b.kind === "product" && b.key && /^(img|hl):/.test(b.key)) {
    const map = { ...((await getSettings()).creativeProducts ?? {}) };
    if (product) map[b.key] = product;
    else delete map[b.key];
    await saveSettings({ creativeProducts: map });
    return NextResponse.json({ ok: true });
  }
  if (b.kind === "variant" && b.id) {
    await updateVariant(b.id, {
      ...(product !== undefined ? { product } : {}),
      ...(b.headline !== undefined ? { headline: b.headline.slice(0, 150) } : {}),
      ...(b.description !== undefined ? { description: b.description.slice(0, 250) } : {}),
    });
    return NextResponse.json({ ok: true });
  }
  if (b.kind === "headline" && b.id) {
    await updateSavedHeadline(b.id, { ...(product !== undefined ? { product } : {}), ...(b.text !== undefined ? { text: b.text.slice(0, 150) } : {}) });
    return NextResponse.json({ ok: true });
  }
  return NextResponse.json({ error: "Pedido inválido." }, { status: 400 });
}

export async function DELETE(req: Request) {
  const denied = await guardRoute(req);
  if (denied) return denied;
  const h = new URL(req.url).searchParams.get("headline");
  if (!h) return NextResponse.json({ error: "Pedido inválido." }, { status: 400 });
  await updateSavedHeadline(h, null);
  return NextResponse.json({ ok: true });
}
