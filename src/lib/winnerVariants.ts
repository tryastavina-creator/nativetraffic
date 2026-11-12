import "server-only";
import { randomBytes } from "node:crypto";
import { describe, detectNiche } from "./adCopy";
import { fal } from "./connectors";
import { cachedCreatives, type GroupRow } from "./creatives";
import type { ImageModelId } from "./creativeOptions";
import { normProduct } from "./naming";
import { listConnections, putAsset, saveVariants, type CreativeVariant } from "./store";
import type { DateRange } from "./types";

/**
 * "Variações agressivas dos vencedores": takes the images that made the most real profit, has a vision model
 * read why each one works, and generates new versions in clearly different styles that keep the product
 * recognizable, then saves them in the library with a proven headline and a new description.
 */

/** Different looks to test; each variant of a winner gets a different one. */
const STYLES = [
  { id: "ugc", label: "Foto de celular (UGC)", hint: "candid smartphone photo taken by a family member, natural light, slightly imperfect framing, authentic and unposed" },
  { id: "studio", label: "Produto em estúdio", hint: "clean premium product photo, soft studio light, simple light background, crisp detail, magazine quality" },
  { id: "news", label: "Reportagem / clínica", hint: "documentary news-feature photo, realistic clinic or home setting, credible and serious, like a health article" },
  { id: "contrast", label: "Contraste antes × agora", hint: "strong visual contrast that tells the story at a glance (old vs new, problem vs relief), no body shaming, no split-screen text" },
  { id: "emotion", label: "Emoção em close", hint: "tight close-up on a face showing strong genuine emotion (relief, surprise, joy) with the product clearly visible, shallow depth of field" },
  { id: "lifestyle", label: "Cena de família", hint: "warm lifestyle scene with family, golden light, the product clearly visible on the main person" },
] as const;

const RULES =
  "The product must be clearly visible and instantly recognizable (in hand, in use or shown next to something for size). Photorealistic. Absolutely no text, no captions, no logos, no watermarks, no real brand names, no arrows or graphic overlays. 16:9 landscape, high resolution, sharp focus.";

type Plan = { subject: string; why: string; prompts: { style: string; prompt: string }[] };

async function falKey() {
  return (await listConnections()).find((c) => c.provider === "fal")?.credentials;
}

/** Vision model reads the winner and writes one prompt per style; falls back to fixed templates. */
async function planFor(key: string, imageUrl: string, headline: string, styles: (typeof STYLES)[number][], niche: string): Promise<Plan> {
  const system = `You are a native-ads creative director (Taboola). You write prompts for Google Gemini image editing that create new, more aggressive versions of a proven winning ad image.
Return ONLY valid JSON: {"subject": "...", "why": "...", "prompts": [{"style": "<style id>", "prompt": "..."}]}.
"subject": what the image shows, one sentence. "why": in Brazilian Portuguese, one or two sentences on why it wins (emotion, curiosity, product visibility, composition).
For each requested style write a detailed English prompt (subject, age, expression, action, product appearance, setting, light, camera feel) that keeps the winning idea but pushes it harder (stronger emotion, curiosity, contrast) and keeps the product clearly visible. Never add text to the image.`;
  const prompt = `Niche: ${niche}. Winning headline: "${headline}".
Styles (one prompt each, in this order): ${styles.map((s) => `${s.id} = ${s.hint}`).join(" | ")}`;
  try {
    const res = await fetch("https://fal.run/fal-ai/any-llm/vision", {
      method: "POST",
      headers: { Authorization: `Key ${key}`, "Content-Type": "application/json" },
      body: JSON.stringify({ system_prompt: system, prompt, image_url: imageUrl }),
      cache: "no-store",
      signal: AbortSignal.timeout(60_000),
    });
    const out = String(((await res.json().catch(() => ({}))) as { output?: string }).output ?? "");
    const json = JSON.parse(out.slice(out.indexOf("{"), out.lastIndexOf("}") + 1)) as Plan;
    const byStyle = new Map((json.prompts ?? []).map((p) => [p.style, p.prompt]));
    if (styles.every((s) => (byStyle.get(s.id) ?? "").length > 40)) {
      return { subject: json.subject ?? "", why: json.why ?? "", prompts: styles.map((s) => ({ style: s.id, prompt: byStyle.get(s.id)! })) };
    }
  } catch {
    /* fall through to templates */
  }
  return {
    subject: "",
    why: "",
    prompts: styles.map((s) => ({
      style: s.id,
      prompt: `Create a new version of this winning ad image with the same product and the same core idea, pushed harder for attention: ${s.hint}. Ad headline it must match: "${headline}".`,
    })),
  };
}

export type WinnerResult = { headline: string; roas: number; profit: number; why: string; created: number; failed: number };

export async function winnerVariants(opts: {
  range: DateRange;
  product?: string;
  winners: number;
  perWinner: number;
  model: ImageModelId;
}): Promise<{ results: WinnerResult[]; created: number }> {
  const creds = await falKey();
  if (!creds?.apiKey) throw Object.assign(new Error("Conecte a fal.ai em Integrações para gerar variações."), { friendly: true });
  const data = await cachedCreatives(opts.range);
  const want = normProduct(opts.product ?? "");
  const pool = data.images.filter((g: GroupRow) => (!want || normProduct(g.product ?? "") === want) && /^https:\/\//.test(g.image) && g.spend > 0);
  if (!pool.length) throw Object.assign(new Error("Nenhuma imagem com gasto nesse período/produto."), { friendly: true });
  const minSpend = Math.max(10, pool.reduce((s, g) => s + g.spend, 0) * 0.02);
  const winners = [...pool]
    .filter((g) => g.spend >= minSpend)
    .sort((a, b) => b.profit - a.profit || b.roas - a.roas || b.ctr - a.ctr)
    .slice(0, opts.winners);
  if (!winners.length) throw Object.assign(new Error("Ainda não há imagens com gasto suficiente para saber quem vence."), { friendly: true });

  // Saved once at the end: parallel read-modify-write of the store would drop variants.
  const all: CreativeVariant[] = [];
  const results = await Promise.all(
    winners.map(async (w, wi): Promise<WinnerResult> => {
      const niche = detectNiche(`${w.title} ${w.product ?? ""}`).label;
      // Rotate styles so different winners don't all get the same looks.
      const styles = Array.from({ length: opts.perWinner }, (_, i) => STYLES[(wi * 2 + i) % STYLES.length]);
      const plan = await planFor(creds.apiKey, w.image, w.title, styles, niche);
      const desc = (await describe([{ headline: w.title, imageUrl: w.image }], { product: w.product })).at(0)?.description;
      const s = w.sample;
      const made: CreativeVariant[] = [];
      let failed = 0;
      await Promise.all(
        plan.prompts.map(async (p) => {
          try {
            const [url] = await fal.generate(creds, { model: opts.model, imageUrl: w.image, prompt: `${p.prompt} ${RULES}`, count: 1 });
            const img = await fetch(url, { cache: "no-store" });
            if (!img.ok) throw new Error("download");
            const assetId = await putAsset(Buffer.from(await img.arrayBuffer()), img.headers.get("content-type") ?? "image/jpeg");
            made.push({
              id: randomBytes(8).toString("hex"),
              createdAt: new Date().toISOString(),
              source: {
                platform: s.platform,
                accountId: s.accountId,
                campaignId: s.campaignId,
                campaignName: s.campaignName,
                itemId: s.itemId,
                title: s.title,
                imageUrl: s.thumbnail,
                url: s.url,
                brand: s.brand,
              },
              assetId,
              headline: w.title.slice(0, 150),
              description: desc,
              product: w.product || undefined,
              origin: "ai",
              note: `Agressiva · ${STYLES.find((x) => x.id === p.style)?.label ?? p.style} · vencedor ROAS ${w.roas.toFixed(2)}`,
              model: opts.model,
              mode: "aggressive",
              style: p.style,
              prompt: p.prompt,
              status: "new",
            });
          } catch {
            failed++;
          }
        }),
      );
      all.push(...made);
      return { headline: w.title, roas: w.roas, profit: w.profit, why: plan.why, created: made.length, failed };
    }),
  );
  if (all.length) await saveVariants(all);
  return { results, created: all.length };
}

export const AGGRESSIVE_STYLES = STYLES.map((s) => ({ id: s.id, label: s.label }));
