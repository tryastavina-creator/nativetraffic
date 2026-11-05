/**
 * Image variants through fal.ai. Models (specs from https://fal.ai/models/<id>/llms.txt):
 *  - fal-ai/nano-banana/edit           Gemini 2.5 Flash Image, $0.04/img
 *  - fal-ai/nano-banana-pro/edit       Gemini Pro image, $0.15/img (4K = 2x), resolution 1K/2K/4K
 *  - fal-ai/bytedance/seedream/v4/edit Seedream 4, $0.03/img
 * All take { prompt, image_urls[], num_images } and return { images: [{ url }] }.
 */
import { IMAGE_MODELS, type ImageModelId } from "../creativeOptions";
import type { Credentials, TestResult } from "../types";
import { http } from "./http";

export async function test(c: Credentials): Promise<TestResult> {
  if ((c.apiKey ?? "").trim().length < 20) {
    return { ok: false, message: "A chave parece incompleta. Copie a chave inteira em fal.ai → API Keys." };
  }
  return { ok: true, message: "Chave salva. Ela é usada quando você gerar a primeira variação." };
}

export async function generate(
  c: Credentials,
  opts: { model: ImageModelId; imageUrl: string; prompt: string; count: number; quality?: string },
): Promise<string[]> {
  // NT_FAKE_IMAGE_GEN: return this image URL instead of calling fal.ai (tests).
  if (process.env.NT_FAKE_IMAGE_GEN) return Array.from({ length: opts.count }, () => process.env.NT_FAKE_IMAGE_GEN!);
  const model = IMAGE_MODELS.find((m) => m.id === opts.model) ?? IMAGE_MODELS[0];
  const body: Record<string, unknown> = {
    prompt: opts.prompt,
    image_urls: [opts.imageUrl],
    num_images: Math.max(1, Math.min(4, opts.count)),
  };
  if (model.id === "nano-banana") Object.assign(body, { output_format: "jpeg", aspect_ratio: "auto" });
  if (model.id === "nano-banana-pro") Object.assign(body, { output_format: "jpeg", aspect_ratio: "auto", resolution: opts.quality || "1K" });
  const r = await http<{ images: { url: string }[] }>(model.endpoint, {
    method: "POST",
    headers: { Authorization: `Key ${c.apiKey.trim()}`, "Content-Type": "application/json" },
    body: JSON.stringify(body),
  }).catch((e: Error) => {
    if (/\b40[13]\b/.test(e.message)) throw new Error("A fal.ai recusou a chave. Confira a chave e se a conta tem créditos.");
    if (/\b422\b/.test(e.message)) throw new Error("A fal.ai não aceitou a imagem de origem. Tente outro criativo.");
    throw e;
  });
  return r.images.map((i) => i.url);
}
