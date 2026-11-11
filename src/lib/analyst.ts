import "server-only";
import Anthropic from "@anthropic-ai/sdk";
import { betaZodOutputFormat } from "@anthropic-ai/sdk/helpers/beta/zod";
import { z } from "zod";
import { cachedCreatives, type CreativeRow, type GroupRow } from "./creatives";
import { normProduct } from "./naming";
import { listConnections } from "./store";
import type { DateRange } from "./types";

/**
 * Native-ads analyst: reads the real results of every ad (spend, CTR, source conversions, real sales, CPA,
 * ROAS, profit) and the images of the winners and losers, finds what wins, and writes ready-to-use image
 * prompts for Gemini plus headlines and descriptions for a new Taboola campaign.
 */

const MODEL = "claude-opus-5-5";

export const AnalysisSchema = z.object({
  summary: z.string().describe("3-5 frases: o que está ganhando e por quê, em português"),
  winningPatterns: z
    .array(
      z.object({
        pattern: z.string().describe("padrão visual ou de copy que se repete nos vencedores"),
        evidence: z.string().describe("números e anúncios que provam (cite ROAS/CPA/CTR)"),
      }),
    )
    .describe("3 a 6 padrões"),
  losingPatterns: z.array(z.string()).describe("o que evitar, com base nos perdedores"),
  campaignPlan: z.object({
    angle: z.string().describe("ângulo principal da campanha nova"),
    audience: z.string().describe("quem o anúncio deve qualificar"),
    setup: z.string().describe("recomendação de setup Taboola: device, lance, orçamento inicial, quantos criativos, teste A/B"),
  }),
  prompts: z
    .array(
      z.object({
        title: z.string().describe("nome curto do conceito"),
        basedOn: z.string().describe("quais anúncios vencedores inspiraram (headline/ROAS)"),
        geminiPrompt: z
          .string()
          .describe(
            "prompt completo EM INGLÊS para o Gemini gerar a imagem: cena, pessoa (idade, expressão), produto, enquadramento, luz, estilo foto realista UGC/nativo, proporção 16:9, sem texto na imagem, sem logos de marcas reais",
          ),
        headlines: z.array(z.string()).describe("3 headlines em inglês, até 100 caracteres, no estilo dos vencedores"),
        description: z.string().describe("descrição do anúncio em inglês, 100-150 caracteres, agressiva e que qualifica o clique"),
        why: z.string().describe("por que esse criativo deve performar, em português"),
      }),
    )
    .describe("prompts de criativos novos"),
  nextTests: z.array(z.string()).describe("2-4 testes a fazer depois que a campanha rodar"),
});
export type Analysis = z.infer<typeof AnalysisSchema>;

const SYSTEM = `You are a senior native-ads media buyer and creative strategist (Taboola, Outbrain, Revcontent, MediaGo) specialized in health/wellness direct-response offers for US/UK/AU audiences, mostly 50+.
You analyse real ad performance and turn it into creatives that win.

How you judge an ad: real profit and ROAS first (sales come from Shopify, costs are real), then CPA, then CTR (CTR alone is a vanity metric: high CTR with no sales is a losing ad). Small samples (little spend) are hints, not proof — say so.
What you look at in the images: who is in the picture (age, gender, emotion), the product (shown or hidden, in hand, close-up), the setting (home, clinic, outdoors), the composition (curiosity gap, before/after, pointing, arrows, circles), light and photo style (UGC/phone photo vs. studio), and how image and headline work together.

Native-ads rules for the new creatives: look like editorial/UGC photos, not ads; one clear subject; faces with emotion; curiosity without giving everything away; no text, logos, watermarks or real brand names inside the image; nothing gory or shocking; no fake medical claims; Taboola policy-safe (no before/after body shaming, no exaggerated results).
Image prompts are for Google Gemini image generation (Nano Banana): write them in English, concrete and visual (subject, age, expression, action, product appearance, setting, camera/lens feel, lighting, color mood, 16:9 landscape), each a different concept, all derived from what is proven to win.
Headlines and descriptions are in English in the style of the winners. Everything else you write in Brazilian Portuguese, direct and practical.`;

type AdRow = CreativeRow;

async function apiKey() {
  const conn = (await listConnections()).find((c) => c.provider === "anthropic");
  return conn?.credentials.apiKey || process.env.ANTHROPIC_API_KEY || "";
}

const fmt = (a: AdRow, i: number) =>
  `#${i + 1} "${a.title}" — produto ${a.product || "?"} · campanha ${a.campaignName} · gasto $${a.spend.toFixed(0)} · CTR ${a.ctr.toFixed(2)}% · conv. fonte ${a.conversions} · vendas reais ${a.sales.toFixed(1)} · CPA ${a.sales ? `$${a.cpa.toFixed(0)}` : "—"} · ROAS ${a.roas.toFixed(2)} · lucro $${a.profit.toFixed(0)}`;

export async function runAnalysis(opts: { range: DateRange; product?: string; count: number; notes?: string }): Promise<{ analysis: Analysis; meta: Record<string, unknown> }> {
  const key = await apiKey();
  if (!key) throw Object.assign(new Error("Conecte o Claude (chave da Anthropic) em Integrações para usar o analista."), { friendly: true });

  const data = await cachedCreatives(opts.range);
  const want = normProduct(opts.product ?? "");
  const all = data.combos.filter((a) => !want || normProduct(a.product ?? "") === want);
  if (!all.length) throw Object.assign(new Error("Nenhum anúncio com gasto nesse período/produto para analisar."), { friendly: true });

  const minSpend = Math.max(10, all.reduce((s, a) => s + a.spend, 0) * 0.01);
  const enough = all.filter((a) => a.spend >= minSpend);
  const winners = [...enough].sort((a, b) => b.profit - a.profit || b.roas - a.roas).slice(0, 10);
  const losers = [...enough]
    .filter((a) => !winners.includes(a))
    .sort((a, b) => a.profit - b.profit)
    .slice(0, 6);
  const headlines = (data.headlines as GroupRow[])
    .filter((h) => !want || normProduct(h.product ?? "") === want)
    .sort((a, b) => b.profit - a.profit)
    .slice(0, 15);

  // Images of the best and worst ads, so the analysis covers the visuals, not only the numbers.
  const imageOf = (a: AdRow) => (/^https:\/\//.test(a.thumbnail) ? a.thumbnail : "");
  const pics = [...winners.slice(0, 6).map((a, i) => ({ a, label: `VENCEDOR #${i + 1}` })), ...losers.slice(0, 3).map((a, i) => ({ a, label: `PERDEDOR #${i + 1}` }))].filter(
    (p) => imageOf(p.a),
  );

  const text = `Período: ${opts.range.from} a ${opts.range.to}${want ? ` · produto ${want}` : " · todos os produtos"}.
${all.length} anúncios com gasto (mínimo considerado: $${minSpend.toFixed(0)}).

VENCEDORES (por lucro real):
${winners.map(fmt).join("\n")}

PERDEDORES (mais prejuízo):
${losers.map(fmt).join("\n") || "—"}

HEADLINES (somando todos os anúncios com a mesma headline, por lucro):
${headlines.map((h, i) => `${i + 1}. "${h.title}" — ${h.ads} anúncio(s) · gasto $${h.spend.toFixed(0)} · CTR ${h.ctr.toFixed(2)}% · ROAS ${h.roas.toFixed(2)} · lucro $${h.profit.toFixed(0)}`).join("\n")}

As imagens anexadas seguem a ordem dos rótulos.
${opts.notes ? `\nPedido do gestor: ${opts.notes}\n` : ""}
Analise e entregue ${opts.count} prompts de criativos novos para uma campanha nova na Taboola.`;

  const content: Anthropic.Beta.BetaContentBlockParam[] = [];
  for (const p of pics) {
    content.push({ type: "text", text: `${p.label}: "${p.a.title}" (ROAS ${p.a.roas.toFixed(2)}, CTR ${p.a.ctr.toFixed(2)}%)` });
    content.push({ type: "image", source: { type: "url", url: imageOf(p.a) } });
  }
  content.push({ type: "text", text });

  const client = new Anthropic({ apiKey: key });
  const ask = (blocks: Anthropic.Beta.BetaContentBlockParam[]) =>
    client.beta.messages.parse({
      model: MODEL,
      max_tokens: 16000,
      betas: ["server-side-fallback-2026-07-01"],
      fallbacks: "default",
      thinking: { type: "adaptive" },
      output_config: { effort: "high", format: betaZodOutputFormat(AnalysisSchema) },
      system: SYSTEM,
      messages: [{ role: "user", content: blocks }],
    });

  let res;
  let usedImages = pics.length;
  try {
    try {
      res = await ask(content);
    } catch (e) {
      // An image URL the API can't download fails the whole request: retry with the numbers only.
      if (e instanceof Anthropic.BadRequestError && pics.length && /image|url|download|fetch/i.test(e.message)) {
        usedImages = 0;
        res = await ask([{ type: "text", text }]);
      } else throw e;
    }
  } catch (e) {
    throw Object.assign(new Error(apiProblem(e)), { friendly: true });
  }
  if (res.stop_reason === "refusal") throw Object.assign(new Error("O modelo recusou essa análise. Tente de novo com outro produto ou período."), { friendly: true });
  if (res.stop_reason === "max_tokens" || !res.parsed_output)
    throw Object.assign(new Error("A análise veio incompleta. Peça menos prompts e tente de novo."), { friendly: true });
  return {
    analysis: res.parsed_output,
    meta: {
      model: res.model,
      ads: all.length,
      winners: winners.length,
      losers: losers.length,
      images: usedImages,
      product: want || null,
      range: opts.range,
      at: new Date().toISOString(),
      inputTokens: res.usage.input_tokens,
      outputTokens: res.usage.output_tokens,
    },
  };
}

/** Plain-language reason for an API failure. */
function apiProblem(e: unknown): string {
  if (e instanceof Anthropic.AuthenticationError) return "a chave da Anthropic foi recusada — confira em Integrações";
  if (e instanceof Anthropic.PermissionDeniedError) return "essa chave não tem acesso ao modelo — confira o plano/créditos na Anthropic";
  if (e instanceof Anthropic.RateLimitError) return "limite de uso da Anthropic atingido — tente de novo em alguns minutos";
  if (e instanceof Anthropic.BadRequestError) return /credit|billing|balance/i.test(e.message) ? "sem créditos na conta da Anthropic (Billing)" : `pedido recusado pela API: ${e.message.slice(0, 160)}`;
  if (e instanceof Anthropic.APIError) return `a API da Anthropic falhou (${e.status ?? "rede"}) — tente de novo`;
  return e instanceof Error ? e.message : String(e);
}

/** Quick key check for the Integrations page. */
export async function testAnthropic(key: string) {
  const client = new Anthropic({ apiKey: key });
  const m = await client.models.retrieve(MODEL);
  return { ok: true, message: `Conectado (${m.display_name})` };
}
