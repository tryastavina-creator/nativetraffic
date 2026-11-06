import "server-only";
import { listConnections } from "./store";

/**
 * Ad descriptions for native (Taboola / Revcontent), written like direct-response copy:
 *  1. find the niche from the headline + product + campaign (and the image, when a vision model is available);
 *  2. build the text with triggers — self-identification (qualifies the click), pain, curiosity/mechanism,
 *     proof/authority, price anchor, scarcity — and a CTA that tells who should click and what they'll see.
 * Uses an LLM through the fal.ai key when available; the built-in niche engine below always works on its own.
 */

export type CopyInput = { headline: string; imageUrl?: string };
export type CopyContext = { product?: string; campaign?: string; variant?: number };

const MAX = 160;

// ------------------------------------------------------------------ niches
type Niche = {
  id: string;
  label: string;
  match: RegExp;
  /** Who should click (self-identification qualifies the click). */
  who: string[];
  /** The pain, in the reader's words. */
  pain: string[];
  /** Curiosity / mechanism. */
  hook: string[];
  /** What they get. */
  win: string[];
  /** Product noun used in CTAs. */
  thing: string;
};

const NICHES: Niche[] = [
  {
    id: "hearing",
    label: "audição",
    match: /hear|ear\b|ears\b|deaf|tinnitus|ringing|audi|ouvid|surdez|zumbido/i,
    who: ["If you keep saying “what?”", "Over 50 and turning the TV up?", "If family says you don't listen,", "Tired of nodding along in restaurants?"],
    pain: ["missing half the conversation", "paying $5,000 for hearing aids", "putting up with whistling, uncomfortable hearing aids"],
    hook: [
      "this tiny rechargeable device is quietly replacing $5,000 hearing aids",
      "audiologists don't advertise this nearly invisible alternative",
      "seniors are switching to this crystal-clear device with no fitting needed",
    ],
    win: ["hear every word again", "crystal-clear sound in minutes", "no audiologist visit, no fitting"],
    thing: "device",
  },
  {
    id: "spine",
    label: "coluna",
    match: /spine|spinal|stenosis|sciatica|back pain|lower back|posture|disc|lumbar|coluna|ciática|lombar/i,
    who: ["If your lower back burns when you stand,", "Can't walk 10 minutes without sitting down?", "Over 50 with back pain that won't quit?", "If mornings start with a stiff, aching back,"],
    pain: ["living with pain that pills only mask", "dealing with shooting pain down the leg", "putting up with years of stiffness"],
    hook: [
      "a 15-minute routine is taking pressure off the spine at home",
      "doctors now link it to one daily habit most people never change",
      "this simple at-home tool is helping people stand tall again",
    ],
    win: ["walk without stopping again", "relief you can feel the first week", "no surgery, no injections"],
    thing: "method",
  },
  {
    id: "joints",
    label: "articulações",
    match: /knee|joint|arthritis|hip pain|cartilage|joelho|articula|artrite/i,
    who: ["If stairs hurt your knees,", "Over 50 with stiff, aching joints?", "If your knees crack and swell,"],
    pain: ["dreading the stairs", "buying creams that don't last", "waking up stiff every morning"],
    hook: ["a simple fix is taking the load off sore knees", "people are ditching the creams for this", "this is why your joints still hurt after everything you tried"],
    win: ["climb stairs without wincing", "move freely again", "results without pills"],
    thing: "solution",
  },
  {
    id: "neuropathy",
    label: "neuropatia",
    match: /neuropath|numb|tingl|burning feet|nerve|formigamento|dormência|nervo/i,
    who: ["If your feet burn, tingle or go numb at night,", "Living with nerve pain in your feet?"],
    pain: ["lying awake with burning feet", "feeling pins and needles all day"],
    hook: ["a simple at-home approach is calming nerve pain", "this overlooked cause of tingling feet has an easy fix"],
    win: ["sleep through the night again", "feel your feet again"],
    thing: "method",
  },
  {
    id: "vision",
    label: "visão",
    match: /vision|eyesight|eyes?\b|glasses|cataract|macular|visão|olhos|óculos|catarata/i,
    who: ["If you need your glasses to read the menu,", "Over 50 and your eyesight keeps slipping?"],
    pain: ["squinting at blurry text", "buying stronger glasses every year"],
    hook: ["eye doctors are talking about this simple daily trick", "this is what most people miss about aging eyes"],
    win: ["sharper vision", "read without squinting"],
    thing: "trick",
  },
  {
    id: "sleep",
    label: "sono / ronco",
    match: /snor|sleep|apnea|cpap|insomnia|ronco|sono|insônia|apneia/i,
    who: ["If your partner complains about your snoring,", "Waking up tired every morning?", "Hate your CPAP mask?"],
    pain: ["tossing and turning all night", "waking up exhausted"],
    hook: ["this tiny device stops snoring from the first night", "doctors are recommending this CPAP alternative"],
    win: ["quiet nights again", "wake up rested"],
    thing: "device",
  },
  {
    id: "weight",
    label: "emagrecimento",
    match: /weight|belly|fat|lbs|pounds|slim|ozempic|glp|metabolism|emagrec|barriga|gordura|quilos/i,
    who: ["If stubborn belly fat won't move,", "Over 40 and the scale won't budge?", "Tried every diet and still stuck?"],
    pain: ["starting diets that stop working", "fighting a slow metabolism"],
    hook: ["a simple morning ritual is melting stubborn fat", "this is being called the natural alternative to expensive shots"],
    win: ["flatter belly without starving", "real results in weeks"],
    thing: "ritual",
  },
  {
    id: "sugar",
    label: "glicemia",
    match: /blood sugar|diabet|a1c|glucose|insulin|glicemia|diabete|açúcar no sangue/i,
    who: ["If your blood sugar keeps creeping up,", "Worried about your A1C?"],
    pain: ["riding sugar spikes after every meal", "feeling drained all day"],
    hook: ["this simple kitchen habit is helping keep sugar steady", "doctors are surprised how well this works"],
    win: ["steadier numbers", "more energy all day"],
    thing: "habit",
  },
  {
    id: "teeth",
    label: "dentes",
    match: /teeth|tooth|dentur|gum|dental|implant|dente|dentadura|gengiva/i,
    who: ["If your dentures slip when you eat,", "Embarrassed to smile?"],
    pain: ["paying $4,000 dental bills", "fighting loose, painful dentures"],
    hook: ["dentists hate how simple this alternative is", "people are skipping expensive implants for this"],
    win: ["smile with confidence", "eat what you want again"],
    thing: "option",
  },
  {
    id: "memory",
    label: "memória",
    match: /memory|brain|dementia|alzheimer|focus|forget|memória|cérebro|esquec/i,
    who: ["If you keep forgetting names and words,", "Over 50 and feeling foggy?"],
    pain: ["living in a brain fog", "forgetting names mid-sentence"],
    hook: ["researchers link it to one overlooked daily habit", "this simple routine is sharpening memory fast"],
    win: ["a sharper, clearer mind", "remember what matters"],
    thing: "routine",
  },
  {
    id: "money",
    label: "finanças / benefícios",
    match: /insurance|mortgage|loan|retire|benefit|medicare|savings|credit|seguro|aposentad|benefício|empréstimo/i,
    who: ["If you were born before 1975,", "Homeowners over 50:", "If you're paying too much every month,"],
    pain: ["overpaying every month", "leaving benefits unclaimed"],
    hook: ["most people never claim this", "a little-known program is cutting bills in half"],
    win: ["keep more money each month", "see what you're owed"],
    thing: "offer",
  },
];

const GENERIC: Niche = {
  id: "generic",
  label: "geral",
  match: /.^/,
  who: ["If this sounds like you,", "Most people miss this:", "If you've tried everything,"],
  pain: ["wasting money on things that don't work"],
  hook: ["thousands are already switching to this", "the reason is simpler than you'd expect"],
  win: ["results you can see", "a better way to fix it"],
  thing: "offer",
};

const PHYSICAL = new Set(["device", "solution", "option", "offer"]);
/** Calls to click that fit what is sold: a product (stock, price) or a method (video, the full story). */
const CTA_PRODUCT = [
  (t: string) => `See the ${t} before it sells out.`,
  () => `Check today's price and availability.`,
  () => `See if you qualify for the discount.`,
  (t: string) => `Watch how the ${t} works.`,
  () => `Limited stock at this price — see it now.`,
];
const CTA_METHOD = [
  () => `Watch the short video before it's taken down.`,
  (t: string) => `See the ${t} step by step.`,
  () => `See if this works for you.`,
  () => `Read the full story while it's still up.`,
];
const PROOF = ["Thousands already switched.", "Rated 4.8/5 by real customers.", "Doctors are taking notice.", "Selling out fast this week."];

export function detectNiche(text: string): Niche {
  return NICHES.find((n) => n.match.test(text)) ?? GENERIC;
}

function hash(s: string) {
  let h = 2166136261;
  for (const ch of s) h = Math.imul(h ^ ch.charCodeAt(0), 16777619) >>> 0;
  return h;
}
const pick = <T,>(xs: T[], n: number) => xs[n % xs.length];
const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

/** Built-in direct-response description (several structures, rotates with `variant`). */
export function formulaDescription(headline: string, ctx: CopyContext = {}, variant = 0): string {
  const niche = detectNiche(`${headline} ${ctx.product ?? ""} ${ctx.campaign ?? ""}`);
  const h = hash(headline) + variant * 7919;
  // A price in the headline is the offer's price — unless it is what the product replaces (an anchor).
  const m = /(replac\w*|instead of|vs\.?|than|save|skip\w*)?\s*(\$\s?\d[\d,]*(\.\d+)?)/i.exec(headline);
  const anchor = m?.[1] ? m[2].replace(/\s/g, "") : undefined;
  const price = m && !m[1] ? m[2].replace(/\s/g, "") : undefined;
  const pains = anchor ? niche.pain.filter((x) => !x.includes(anchor)) : niche.pain;
  const pain = pick(pains.length ? pains : niche.pain, h >>> 7);
  const who = pick(niche.who, h);
  const hook = pick(niche.hook, h >>> 3);
  const win = pick(niche.win, h >>> 5);
  const cta = pick(PHYSICAL.has(niche.thing) ? CTA_PRODUCT : CTA_METHOD, (h >>> 9) + variant)(niche.thing);
  const proof = pick(PROOF, h >>> 11);
  // Never repeat the headline's main promise word for word.
  const options = [
    `${who} ${hook}. ${cta}`,
    `${cap(win)}${price ? ` for ${price}` : anchor ? ` for a fraction of ${anchor}` : ""} — without ${pain}. ${proof} ${cta}`,
    `${who} this is for you: ${win}${price ? ` for ${price}` : ""}. ${proof} ${cta}`,
    ...(anchor ? [`Why pay ${anchor}? ${cap(hook)}. ${cta}`] : []),
    `${cap(hook)}${price ? ` (now ${price})` : ""}. ${proof} ${cta}`,
    `Stop ${pain}. ${cap(win)}. ${cta}`,
  ];
  const tidy = (o: string) => o.replace(/\s+/g, " ").replace(/([?.!]) ([a-z])/g, (_, p, c) => `${p} ${c.toUpperCase()}`).trim();
  const fits = options.map(tidy).filter((o) => o.length <= MAX);
  return pick(fits.length ? fits : options.map((o) => o.slice(0, MAX)), variant + (h >>> 13));
}

// ------------------------------------------------------------------ LLM (optional)
const SYSTEM = `You are a senior direct-response copywriter for native ads (Taboola, Revcontent, Outbrain).
Write the DESCRIPTION shown under the headline.
Process: 1) identify the niche and the buyer from the headline, product and image; 2) write copy that QUALIFIES the click (calls out exactly who it is for, so only buyers click) and pushes them to the landing page.
Use 2-3 triggers: self-identification, pain agitation, curiosity/mechanism, social proof or authority, price anchor, scarcity/urgency.
Rules: same language as the headline; 100-150 characters; aggressive but credible; complement the headline, never repeat it; end with a clear call to click (e.g. "See the price", "See if it works for you"); no emojis, hashtags, quotes or ALL CAPS; no cure claims, no guaranteed results, no fake news outlets.
Answer with the description only.`;

async function llm(apiKey: string, input: CopyInput, ctx: CopyContext, niche: string): Promise<string | undefined> {
  const prompt = `${ctx.variant ? `Write variation #${ctx.variant + 1}: a different angle and different triggers than the obvious one.\n` : ""}Niche (detected): ${niche}\nProduct: ${ctx.product || "-"}\nCampaign: ${ctx.campaign || "-"}\nHeadline: ${input.headline}\nDescription:`;
  const call = (endpoint: string, body: Record<string, unknown>) =>
    fetch(`https://fal.run/${endpoint}`, {
      method: "POST",
      headers: { Authorization: `Key ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify(body),
      cache: "no-store",
      signal: AbortSignal.timeout(25_000),
    }).then(async (r) => (r.ok ? (((await r.json().catch(() => ({}))) as { output?: string }).output ?? "") : ""));
  let out = "";
  // With the ad image, a vision model reads the product/niche from it too.
  if (input.imageUrl && /^https:\/\//.test(input.imageUrl)) out = await call("fal-ai/any-llm/vision", { system_prompt: SYSTEM, prompt, image_url: input.imageUrl }).catch(() => "");
  if (!out) out = await call("fal-ai/any-llm", { system_prompt: SYSTEM, prompt }).catch(() => "");
  out = out.replace(/^["'\s]+|["'\s]+$/g, "").replace(/^description:\s*/i, "").replace(/\s+/g, " ").trim();
  return out.length >= 60 ? out.slice(0, 250) : undefined;
}

export async function describe(
  inputs: CopyInput[],
  ctx: CopyContext = {},
): Promise<{ headline: string; description: string; niche: string; source: "ia" | "formula" }[]> {
  const fal = (await listConnections()).find((c) => c.provider === "fal")?.credentials.apiKey;
  return Promise.all(
    inputs.map(async (inp, i) => {
      const niche = detectNiche(`${inp.headline} ${ctx.product ?? ""} ${ctx.campaign ?? ""}`);
      const ai = fal ? await llm(fal, inp, ctx, niche.label).catch(() => undefined) : undefined;
      return ai
        ? { headline: inp.headline, description: ai, niche: niche.label, source: "ia" as const }
        : { headline: inp.headline, description: formulaDescription(inp.headline, ctx, (ctx.variant ?? 0) + i), niche: niche.label, source: "formula" as const };
    }),
  );
}
