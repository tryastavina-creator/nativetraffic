import { randomBytes } from "node:crypto";
import { NextResponse } from "next/server";
import { fal } from "@/lib/connectors";
import { buildPrompt, IMAGE_MODELS, pickStyles, STYLES, VARY_MODES, type ImageModelId, type StyleId, type VaryMode } from "@/lib/creativeOptions";
import { listConnections, putAsset, saveVariants, type CreativeVariant, type VariantSource } from "@/lib/store";

export const dynamic = "force-dynamic";
export const maxDuration = 180;

type Body = {
  source: VariantSource;
  model: ImageModelId;
  quality?: string;
  mode: VaryMode;
  style: StyleId;
  notes?: string;
  prompt?: string;
  count: number;
  headline?: string;
};

/** Generates variants with fal.ai, stores the images, and saves them in the library. */
export async function POST(req: Request) {
  const b = (await req.json()) as Body;
  if (!b.source?.imageUrl || !/^https?:\/\//.test(b.source.imageUrl)) {
    return NextResponse.json({ error: "Imagem de origem inválida." }, { status: 400 });
  }
  if (!IMAGE_MODELS.some((m) => m.id === b.model)) return NextResponse.json({ error: "Modelo inválido." }, { status: 400 });
  if (!VARY_MODES.some((m) => m.id === b.mode) || !STYLES.some((s) => s.id === b.style)) {
    return NextResponse.json({ error: "Opção inválida." }, { status: 400 });
  }
  const key = (await listConnections()).find((c) => c.provider === "fal");
  if (!key) return NextResponse.json({ error: "Conecte a fal.ai em Integrações para gerar variações." }, { status: 400 });

  const count = Math.max(1, Math.min(4, b.count || 1));
  const styles = pickStyles(b.style, count);
  try {
    // Same style for all → one call with num_images; random styles → one call per image.
    const groups =
      b.style === "random"
        ? styles.map((st) => ({ style: st, n: 1 }))
        : [{ style: b.style, n: count }];
    const results = await Promise.all(
      groups.map(async (g) => {
        const prompt = buildPrompt({ mode: b.mode, style: g.style, notes: b.notes, prompt: b.prompt });
        const urls = await fal.generate(key.credentials, { model: b.model, imageUrl: b.source.imageUrl, prompt, count: g.n, quality: b.quality });
        return urls.map((url) => ({ url, style: g.style, prompt }));
      }),
    );
    const variants: CreativeVariant[] = [];
    for (const r of results.flat()) {
      const img = await fetch(r.url, { cache: "no-store" });
      if (!img.ok) continue;
      const mime = img.headers.get("content-type") ?? "image/jpeg";
      const assetId = await putAsset(Buffer.from(await img.arrayBuffer()), mime);
      variants.push({
        id: randomBytes(8).toString("hex"),
        createdAt: new Date().toISOString(),
        source: b.source,
        assetId,
        headline: (b.headline ?? b.source.title).slice(0, 100),
        model: b.model,
        mode: b.mode,
        style: r.style,
        prompt: b.prompt ?? "",
        status: "new",
      });
    }
    if (!variants.length) throw new Error("A fal.ai não devolveu imagens. Tente de novo.");
    await saveVariants(variants);
    return NextResponse.json({ variants });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 502 });
  }
}
