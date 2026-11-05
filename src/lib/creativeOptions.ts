/**
 * Options of the variant generator, shared by the server (prompt building) and the UI (selects).
 * No server-only imports here.
 */

export const IMAGE_MODELS = [
  {
    id: "nano-banana",
    label: "Gemini Nano Banana",
    endpoint: "https://fal.run/fal-ai/nano-banana/edit",
    price: 0.04,
    note: "rápido, ótimo para variações",
    qualities: [] as { id: string; label: string; factor: number }[],
  },
  {
    id: "nano-banana-pro",
    label: "Gemini Nano Banana Pro",
    endpoint: "https://fal.run/fal-ai/nano-banana-pro/edit",
    price: 0.15,
    note: "mais fiel à referência, alta resolução",
    qualities: [
      { id: "1K", label: "Padrão (1K)", factor: 1 },
      { id: "2K", label: "Alta (2K)", factor: 1 },
      { id: "4K", label: "Máxima (4K)", factor: 2 },
    ],
  },
  {
    id: "seedream-4",
    label: "Seedream 4 (ByteDance)",
    endpoint: "https://fal.run/fal-ai/bytedance/seedream/v4/edit",
    price: 0.03,
    note: "mais barato, bom para volume",
    qualities: [] as { id: string; label: string; factor: number }[],
  },
] as const;

export type ImageModelId = (typeof IMAGE_MODELS)[number]["id"];

/** What changes from the reference image. */
export const VARY_MODES = [
  { id: "scene", label: "Nova cena (mesmo formato)", hint: "outra situação com o mesmo enquadramento e produto" },
  { id: "background", label: "Só o fundo (mantém pessoa e produto)", hint: "troca apenas o cenário atrás" },
  { id: "person", label: "Outra pessoa (mesma cena)", hint: "troca a pessoa, mantém o resto" },
  { id: "angle", label: "Outro ângulo / enquadramento", hint: "mesma cena vista de outro jeito" },
  { id: "style", label: "Mesma cena, outro estilo", hint: "redesenha a imagem no estilo escolhido" },
] as const;

/**
 * Visual styles. The first ones are the formats that historically perform in native
 * (Taboola/Outbrain/Revcontent feeds): low-fi, "real" and curiosity-driven imagery.
 */
export const STYLES = [
  { id: "same", label: "Igual à referência", prompt: "" },
  { id: "amateur", label: "Foto amadora de celular", prompt: "an amateur smartphone photo, slightly imperfect framing, natural home lighting, unedited look" },
  { id: "flash", label: "Flash noturno (low-fi)", prompt: "a candid photo taken with direct on-camera flash at night, harsh shadows, low-fi snapshot look" },
  { id: "humanised", label: "Foto real humanizada", prompt: "a natural, realistic lifestyle photograph of real people, warm and relatable" },
  { id: "closeup", label: "Close-up do detalhe", prompt: "an extreme close-up photo focused on the relevant body area or product detail, shallow depth of field" },
  { id: "editorial", label: "Foto de notícia / editorial", prompt: "a documentary news-style editorial photograph, neutral colors, like a picture from a newspaper article" },
  { id: "vintage", label: "Foto antiga / vintage", prompt: "an old vintage photograph with film grain and faded colors" },
  { id: "wikihow", label: "WikiHow", prompt: "a WikiHow-style flat digital illustration with soft outlines and simple shading" },
  { id: "medical", label: "Ilustração médica", prompt: "a clean medical illustration, anatomical style, educational, no gore" },
  { id: "pencil", label: "Desenho a lápis", prompt: "a pencil sketch drawing on paper, hand-drawn shading" },
  { id: "cartoon", label: "Cartoon", prompt: "a friendly cartoon illustration with bold outlines" },
  { id: "3d", label: "Render 3D", prompt: "a soft 3D render, clay-like materials, studio lighting" },
  { id: "random", label: "Aleatório (um estilo por imagem)", prompt: "" },
] as const;

export type VaryMode = (typeof VARY_MODES)[number]["id"];
export type StyleId = (typeof STYLES)[number]["id"];

/** Guardrails every native ad variant must follow (policy + "looks like content, not an ad"). */
const RULES =
  "Keep the product exactly as it appears in the reference (same shape, color and branding) whenever it is visible. " +
  "Do not add any text, captions, logos, watermarks, arrows, circles or UI elements. " +
  "No before/after comparisons, no blood, wounds or graphic medical imagery, no doctors or lab coats. " +
  "Hands and feet must have natural anatomy (five fingers, correct proportions).";

export function buildPrompt(opts: { mode: VaryMode; style: StyleId; notes?: string; prompt?: string }): string {
  const style = STYLES.find((s) => s.id === opts.style);
  const parts: string[] = [];
  switch (opts.mode) {
    case "background":
      parts.push(
        "Edit this native ad image: keep the person, pose, hands, product and framing exactly the same and replace only the background" +
          (opts.notes?.trim() ? ` with: ${opts.notes.trim()}.` : " with a different, believable setting."),
      );
      break;
    case "person":
      parts.push("Create a new version of this native ad image with a different person of a similar age, same scene, same pose and same product placement.");
      break;
    case "angle":
      parts.push("Create a new version of this native ad image showing the same scene and product from a different camera angle or framing.");
      break;
    case "style":
      parts.push("Redraw this native ad image keeping the same scene, subject and composition.");
      break;
    default:
      parts.push("Create a new variation of this native ad image for A/B testing: a different scene that tells the same story, keeping the same overall format and aspect ratio.");
  }
  if (style?.prompt) parts.push(`Render it as ${style.prompt}.`);
  else if (opts.style === "same") parts.push("Keep the same visual style as the reference (photo stays photo, illustration stays illustration).");
  if (opts.prompt?.trim()) parts.push(`Extra direction: ${opts.prompt.trim()}.`);
  parts.push(RULES);
  return parts.join(" ");
}

/** For "random", one concrete style per image (skips "same" and "random"). */
export function pickStyles(style: StyleId, count: number): StyleId[] {
  if (style !== "random") return Array.from({ length: count }, () => style);
  const pool = STYLES.filter((s) => s.id !== "same" && s.id !== "random").map((s) => s.id);
  const shuffled = [...pool].sort(() => Math.random() - 0.5);
  return Array.from({ length: count }, (_, i) => shuffled[i % shuffled.length]);
}

export function estimateCost(model: ImageModelId, quality: string, count: number): number {
  const m = IMAGE_MODELS.find((x) => x.id === model) ?? IMAGE_MODELS[0];
  const q = m.qualities.find((x) => x.id === quality);
  return m.price * (q?.factor ?? 1) * count;
}
