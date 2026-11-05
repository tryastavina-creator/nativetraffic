/**
 * Image variants with Google's Gemini image model ("Nano Banana") through fal.ai.
 * Spec: https://fal.ai/models/fal-ai/nano-banana/edit/llms.txt ($0.0398 per image).
 */
import type { Credentials, TestResult } from "../types";
import { http } from "./http";

const MODEL = "https://fal.run/fal-ai/nano-banana/edit";

/** Guardrails added to every request: native-ad variant, same product, no claims. */
const BASE_PROMPT =
  "Create a new variation of this native advertising image for A/B testing. Keep the product exactly as it is " +
  "(same shape, color and branding) and keep the image photorealistic, like an editorial photo. Do not add text, " +
  "captions, logos, watermarks, arrows, before/after comparisons or medical imagery.";

export async function test(c: Credentials): Promise<TestResult> {
  if (!/^[\w-]+:[\w-]+$/.test(c.apiKey.trim()) && c.apiKey.trim().length < 20) {
    return { ok: false, message: "A chave parece incompleta. Copie a chave inteira em fal.ai → Dashboard → API Keys." };
  }
  return { ok: true, message: "Chave salva. Ela é usada quando você gerar a primeira variação ($0,04 por imagem)." };
}

export async function generateVariants(
  c: Credentials,
  imageUrl: string,
  instruction: string,
  count: number,
): Promise<string[]> {
  const r = await http<{ images: { url: string }[] }>(MODEL, {
    method: "POST",
    headers: { Authorization: `Key ${c.apiKey.trim()}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      prompt: `${BASE_PROMPT} Change: ${instruction.trim() || "a different scene and setting around the product"}.`,
      image_urls: [imageUrl],
      num_images: Math.max(1, Math.min(4, count)),
      output_format: "jpeg",
      aspect_ratio: "auto",
    }),
  }).catch((e: Error) => {
    if (/40[13]/.test(e.message)) throw new Error("A fal.ai recusou a chave. Confira a chave e se a conta tem créditos.");
    throw e;
  });
  return r.images.map((i) => i.url);
}
