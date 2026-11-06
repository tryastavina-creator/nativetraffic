import "server-only";
import { listConnections } from "./store";

/**
 * Ad descriptions: short, aggressive (curiosity + urgency), matching the headline's promise and language.
 * Uses an LLM through the fal.ai key when available; otherwise a built-in copy formula, so it always works.
 */

const MAX = 150; // fits Taboola and Revcontent (both accept up to 250) without being cut on mobile

const SYSTEM = `You write descriptions for native ads (Taboola / Revcontent) under a given headline.
Rules:
- Same language as the headline.
- Aggressive direct-response tone: curiosity, urgency, a concrete benefit; push the click.
- Must match the headline's promise; never contradict it, never repeat it word for word.
- 90 to 150 characters, one or two short sentences, no emojis, no hashtags, no quotes, no ALL CAPS words.
- No medical cure claims, no guarantees of results, no fake news-site names.
Answer with the description only.`;

async function llm(apiKey: string, headline: string): Promise<string | undefined> {
  const res = await fetch("https://fal.run/fal-ai/any-llm", {
    method: "POST",
    headers: { Authorization: `Key ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({ system_prompt: SYSTEM, prompt: `Headline: ${headline}\nDescription:` }),
    cache: "no-store",
    signal: AbortSignal.timeout(25_000),
  });
  if (!res.ok) return undefined;
  const j = (await res.json().catch(() => ({}))) as { output?: string };
  const out = (j.output ?? "").replace(/^["'\s]+|["'\s]+$/g, "").replace(/\s+/g, " ").trim();
  return out.length >= 40 ? out.slice(0, 250) : undefined;
}

// ---- built-in formula (English and Portuguese) ----
const isPt = (h: string) => /\b(você|voce|não|nao|isso|para|médicos|medicos|descubra|como|que)\b/i.test(h);
const EN_HOOK = [
  "Thousands are already switching, and it's easier than you think.",
  "Most people find out too late. Don't be one of them.",
  "Experts didn't expect this to work so well.",
  "It takes less than 2 minutes to see why everyone's talking about it.",
  "The reason is simpler than you'd expect.",
];
const EN_PUSH = [
  "See it before it's gone.",
  "Check availability now.",
  "Find out if you qualify today.",
  "Stock is running low. See why now.",
  "Click to see the full story.",
];
const PT_HOOK = [
  "Milhares já estão trocando, e é mais fácil do que parece.",
  "A maioria descobre tarde demais. Não seja um deles.",
  "Nem os especialistas esperavam um resultado assim.",
  "Em menos de 2 minutos você entende por que todo mundo fala disso.",
];
const PT_PUSH = ["Veja antes que acabe.", "Confira a disponibilidade agora.", "Veja se você se qualifica hoje.", "Estoque acabando. Veja agora."];

function hash(s: string) {
  let h = 0;
  for (const ch of s) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return h;
}

export function formulaDescription(headline: string, variant = 0): string {
  const pt = isPt(headline);
  const hooks = pt ? PT_HOOK : EN_HOOK;
  const push = pt ? PT_PUSH : EN_PUSH;
  const h = hash(headline) + variant;
  // Price / age / money in the headline → lean on the offer.
  const pick = (xs: string[]) => xs[h % xs.length];
  let hook = pick(hooks);
  if (/\$\s?\d|\bprice|\bcost|\bcheap|\bsave|\bfree\b|preço|grátis|barato/i.test(headline))
    hook = pick(
      pt
        ? ["O preço pegou o mercado de surpresa, e a oferta é por tempo limitado.", "Por uma fração do preço de sempre, e o estoque está no fim."]
        : [
            "The price caught the industry off guard, and the offer won't last.",
            "A fraction of what you'd normally pay, and supply is running out.",
            "Big brands hate how much less this costs.",
          ],
    );
  else if (/\b(19\d\d|born|seniors?|over \d\d|aposentad|idosos?)\b/i.test(headline))
    hook = pick(pt ? ["Se você se encaixa, vale a pena ver isso hoje.", "Quem nasceu nesses anos está correndo para garantir."] : ["If this is you, you'll want to see this today.", "People in this age group are rushing to claim theirs."]);
  return `${hook} ${push[Math.floor(h / 7) % push.length]}`.slice(0, MAX);
}

export async function describe(headlines: string[]): Promise<{ headline: string; description: string; source: "ia" | "formula" }[]> {
  const fal = (await listConnections()).find((c) => c.provider === "fal")?.credentials.apiKey;
  return Promise.all(
    headlines.map(async (headline, i) => {
      const ai = fal ? await llm(fal, headline).catch(() => undefined) : undefined;
      return ai ? { headline, description: ai, source: "ia" as const } : { headline, description: formulaDescription(headline, i), source: "formula" as const };
    }),
  );
}
