"use client";
/* eslint-disable @next/next/no-img-element */
/** Shared pieces of the campaign studio (setup form, creative picker, history). */
import { Fragment, useEffect, useState } from "react";
import { COUNTRY_TZ } from "@/lib/campaignRules";
import { normProduct } from "@/lib/naming";
import type { Blocklist, CampaignLogEntry, CampaignSchedule, CampaignSetup, CreativeVariant } from "@/lib/store";

export type Platform = "taboola" | "revcontent";
export type Pick = {
  key: string;
  kind: "variant" | "ad";
  variantId?: string;
  imageUrl: string;
  headline: string;
  label: string;
  description?: string;
  /** Taboola CTA button ("" = none). */
  cta?: string;
};
type Perf = { spend: number; roas: number; profit: number; cpa: number; sales: number; ctr: number };
type Ad = Perf & { platform: string; itemId: string; title: string; thumbnail: string; campaignName: string; key: string; product?: string };
type Group = Perf & { key: string; image: string; title: string; ads: number; platforms: string[]; product?: string };
type Saved = { id: string; text: string; product: string; description?: string };

/** Taboola call-to-action buttons. */
export const CTAS: [string, string][] = [
  ["", "Sem CTA"],
  ["LEARN_MORE", "Learn More"],
  ["SHOP_NOW", "Shop Now"],
  ["READ_MORE", "Read More"],
  ["GET_OFFER", "Get Offer"],
  ["CLICK_HERE", "Click Here"],
  ["TRY_NOW", "Try Now"],
  ["SIGN_UP", "Sign Up"],
  ["SEE_MORE", "See More"],
  ["BUY_NOW", "Buy Now"],
  ["ORDER_NOW", "Order Now"],
];
export const TITLE_MAX: Record<string, number> = { taboola: 150, revcontent: 80 };

/** Direct-response descriptions for the niche of each ad (headline + image + product), keyed by headline. */
export async function generateDescriptions(
  items: { headline: string; imageUrl?: string }[],
  ctx: { product?: string; campaign?: string; variant?: number } = {},
): Promise<Record<string, string>> {
  const abs = (u?: string) => (u && u.startsWith("/") ? `${location.origin}${u}` : u);
  const r = await fetch("/api/creatives/describe", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ items: items.map((i) => ({ headline: i.headline, imageUrl: abs(i.imageUrl) })), ...ctx }),
  })
    .then((x) => x.json())
    .catch(() => ({ results: [] }));
  return Object.fromEntries(((r.results ?? []) as { headline: string; description: string }[]).map((x) => [x.headline, x.description]));
}

const money0 = (n: number) => `${n < 0 ? "-" : ""}$${Math.abs(Math.round(n)).toLocaleString("en-US")}`;
const perfLine = (x: Perf) =>
  `lucro ${money0(x.profit)} · ROAS ${x.roas.toFixed(2)}x${x.sales ? ` · CPA ${money0(x.cpa)}` : ""} · CTR ${x.ctr.toFixed(2)}%`;

export const PLATFORM_LABEL: Record<string, string> = { taboola: "Taboola", revcontent: "Revcontent" };

export const DEFAULT_SETUP: Record<Platform, CampaignSetup> = {
  taboola: {
    product: "OMNIPRO",
    countries: ["US"],
    devices: ["DESKTOP"],
    bidStrategy: "MAX_CONVERSIONS",
    spendingLimitModel: "NONE",
    dailyCap: 100,
    marketingObjective: "ONLINE_PURCHASES",
    brandingText: "PrevenMD",
    trackingCode: "utm_source=taboola&utm_medium=referral",
    trafficAllocation: "OPTIMIZED",
  },
  revcontent: {
    product: "OMNIPRO",
    countries: ["US"],
    devices: ["DESKTOP"],
    bidStrategy: "cpc",
    cpc: 0.25,
    budget: 100,
    pacing: true,
    brandingText: "PrevenMD",
  },
};

export const BID_LABEL: Record<string, string> = { MAX_CONVERSIONS: "MAXCONV", TARGET_CPA: "TCPA", SMART: "SMARTBID", FIXED: "CPC", cpc: "CPC", cpa: "CPA" };

const DAYS: [string, string][] = [
  ["MONDAY", "Seg"],
  ["TUESDAY", "Ter"],
  ["WEDNESDAY", "Qua"],
  ["THURSDAY", "Qui"],
  ["FRIDAY", "Sex"],
  ["SATURDAY", "Sáb"],
  ["SUNDAY", "Dom"],
];
const TIMEZONES = [...new Set(["America/New_York", "America/Chicago", "America/Los_Angeles", ...Object.values(COUNTRY_TZ), "UTC"])];
const hours = Array.from({ length: 25 }, (_, h) => h);

export function SetupForm({
  platform,
  setup,
  onChange,
  showBudget,
  conversions = [],
  blocklists = [],
  onBlocklists,
}: {
  platform: Platform;
  setup: CampaignSetup;
  onChange: (s: CampaignSetup) => void;
  showBudget: boolean;
  conversions?: { id: string; name: string }[];
  blocklists?: Blocklist[];
  onBlocklists?: (b: Blocklist[]) => void;
}) {
  const set = (p: Partial<CampaignSetup>) => onChange({ ...setup, ...p });
  const toggleDevice = (d: "DESKTOP" | "MOBILE" | "TABLET") =>
    set({ devices: setup.devices.includes(d) ? setup.devices.filter((x) => x !== d) : [...setup.devices, d] });
  const sc: CampaignSchedule = setup.schedule ?? { mode: "ALWAYS", days: DAYS.map((d) => d[0]), fromHour: 6, untilHour: 22 };
  const tz = sc.timeZone || setup.templateInfo?.timeZone || COUNTRY_TZ[setup.countries[0] ?? ""] || "America/New_York";
  const setSc = (p: Partial<CampaignSchedule>) => set({ schedule: { ...sc, timeZone: tz, ...p } });
  return (
    <div className="grid gap-3 sm:grid-cols-3">
      <Field label="Produto">
        <input id="cp-product" className="input" value={setup.product} onChange={(e) => set({ product: normProduct(e.target.value) })} />
      </Field>
      <Field label="Países (vírgula)">
        <input
          id="cp-countries"
          className="input"
          value={setup.countries.join(", ")}
          onChange={(e) => set({ countries: e.target.value.toUpperCase().split(/[,\s]+/).filter((x) => /^[A-Z]{2}$/.test(x)) })}
        />
      </Field>
      <Field label="Marca exibida">
        <input id="cp-brand" className="input" value={setup.brandingText} onChange={(e) => set({ brandingText: e.target.value })} />
      </Field>
      <div className="sm:col-span-3">
        <span className="mb-1.5 block text-xs text-zinc-300">Device</span>
        <div className="flex gap-1">
          {(["DESKTOP", "MOBILE", "TABLET"] as const).map((d) => (
            <button key={d} className={`chip border border-line ${setup.devices.includes(d) ? "chip-on" : ""}`} onClick={() => toggleDevice(d)}>
              {d.toLowerCase()}
            </button>
          ))}
        </div>
      </div>
      {platform === "taboola" ? (
        <>
          <Field label="Estratégia de lance">
            <select id="cp-bid" className="input" value={setup.bidStrategy} onChange={(e) => set({ bidStrategy: e.target.value })}>
              <option value="MAX_CONVERSIONS">Maximizar conversões</option>
              <option value="TARGET_CPA">CPA alvo</option>
              <option value="SMART">CPC aprimorado (Smart)</option>
              <option value="FIXED">CPC fixo</option>
            </select>
          </Field>
          {(setup.bidStrategy === "FIXED" || setup.bidStrategy === "SMART") && (
            <Field label="CPC (US$)">
              <input id="cp-cpc" className="input" type="number" step="0.01" value={setup.cpc ?? ""} onChange={(e) => set({ cpc: Number(e.target.value) })} />
            </Field>
          )}
          {setup.bidStrategy === "TARGET_CPA" && (
            <Field label="CPA alvo (US$)">
              <input id="cp-cpa" className="input" type="number" value={setup.cpaGoal ?? ""} onChange={(e) => set({ cpaGoal: Number(e.target.value) })} />
            </Field>
          )}
          <Field label="Objetivo">
            <select id="cp-objective" className="input" value={setup.marketingObjective} onChange={(e) => set({ marketingObjective: e.target.value })}>
              <option value="ONLINE_PURCHASES">Compras online</option>
              <option value="LEADS_GENERATION">Leads</option>
              <option value="DRIVE_WEBSITE_TRAFFIC">Tráfego</option>
            </select>
          </Field>
          {showBudget && (
            <>
              <Field label="Orçamento diário (US$)">
                <input id="cp-daily" className="input" type="number" value={setup.dailyCap ?? ""} onChange={(e) => set({ dailyCap: Number(e.target.value) })} />
              </Field>
              <Field label="Limite de gasto">
                <select id="cp-model" className="input" value={setup.spendingLimitModel ?? "NONE"} onChange={(e) => set({ spendingLimitModel: e.target.value })}>
                  <option value="NONE">Nenhum (só o diário)</option>
                  <option value="MONTHLY">Mensal</option>
                  <option value="ENTIRE">Total da campanha</option>
                </select>
              </Field>
              {setup.spendingLimitModel && setup.spendingLimitModel !== "NONE" && (
                <Field label="Limite (US$)">
                  <input id="cp-limit" className="input" type="number" value={setup.spendingLimit ?? ""} onChange={(e) => set({ spendingLimit: Number(e.target.value) })} />
                </Field>
              )}
            </>
          )}
          <Field label="Entrega dos anúncios">
            <select
              id="cp-alloc"
              className="input"
              value={setup.trafficAllocation ?? "OPTIMIZED"}
              onChange={(e) => set({ trafficAllocation: e.target.value as "OPTIMIZED" | "EVEN" })}
            >
              <option value="OPTIMIZED">Priorizar os melhores</option>
              <option value="EVEN">Teste A/B (igual entre todos)</option>
            </select>
          </Field>
        </>
      ) : (
        <>
          <Field label="Otimizar por">
            <select id="cp-bid" className="input" value={setup.bidStrategy} onChange={(e) => set({ bidStrategy: e.target.value })}>
              <option value="cpc">CPC</option>
              <option value="cpa">CPA</option>
            </select>
          </Field>
          {setup.bidStrategy === "cpa" && (
            <Field label="Pixel de conversão">
              <select id="cp-conv" className="input" value={setup.conversionId ?? ""} onChange={(e) => set({ conversionId: e.target.value || undefined })}>
                <option value="">Escolha…</option>
                {conversions.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            </Field>
          )}
          <Field label="Lance web (US$)">
            <input id="cp-cpc" className="input" type="number" step="0.01" value={setup.cpc ?? ""} onChange={(e) => set({ cpc: Number(e.target.value) })} />
          </Field>
          {showBudget && (
            <Field label="Orçamento diário (US$, mín. 50)">
              <input id="cp-budget" className="input" type="number" value={setup.budget ?? ""} onChange={(e) => set({ budget: Number(e.target.value) || undefined })} />
            </Field>
          )}
          <label className="flex items-center gap-2 text-sm sm:col-span-3">
            <input type="checkbox" checked={!!setup.pacing} onChange={(e) => set({ pacing: e.target.checked })} /> Distribuir o orçamento ao longo do dia
            (pacing)
          </label>
        </>
      )}

      {/* Dates */}
      <Field label="Início (vazio ou hoje = agora)">
        <input id="cp-start" className="input" type="date" value={setup.startDate ?? ""} onChange={(e) => set({ startDate: e.target.value || undefined })} />
      </Field>
      <Field label="Fim (vazio = sem data final)">
        <input id="cp-end" className="input" type="date" value={setup.endDate ?? ""} onChange={(e) => set({ endDate: e.target.value || undefined })} />
      </Field>
      <div />

      {/* Dayparting */}
      <div className="rounded-lg border border-line p-3 sm:col-span-3">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-xs text-zinc-300">Horário</span>
          <button className={`chip border border-line ${sc.mode === "ALWAYS" ? "chip-on" : ""}`} onClick={() => setSc({ mode: "ALWAYS" })}>
            Sempre ligado
          </button>
          <button className={`chip border border-line ${sc.mode === "CUSTOM" ? "chip-on" : ""}`} onClick={() => setSc({ mode: "CUSTOM" })}>
            Dias e horas
          </button>
        </div>
        {sc.mode === "CUSTOM" && (
          <div className="mt-3 flex flex-wrap items-center gap-2 text-xs">
            {platform === "taboola" &&
              DAYS.map(([d, l]) => (
                <button
                  key={d}
                  className={`chip border border-line ${sc.days.includes(d) ? "chip-on" : ""}`}
                  onClick={() => setSc({ days: sc.days.includes(d) ? sc.days.filter((x) => x !== d) : [...sc.days, d] })}
                >
                  {l}
                </button>
              ))}
            <span className="ml-1 text-muted">das</span>
            <select aria-label="Hora inicial" className="input w-auto py-1" value={sc.fromHour} onChange={(e) => setSc({ fromHour: Number(e.target.value) })}>
              {hours.slice(0, 24).map((h) => (
                <option key={h} value={h}>
                  {String(h).padStart(2, "0")}:00
                </option>
              ))}
            </select>
            <span className="text-muted">às</span>
            <select aria-label="Hora final" className="input w-auto py-1" value={sc.untilHour} onChange={(e) => setSc({ untilHour: Number(e.target.value) })}>
              {hours.slice(1).map((h) => (
                <option key={h} value={h}>
                  {String(h).padStart(2, "0")}:00
                </option>
              ))}
            </select>
            {platform === "taboola" && (
              <select aria-label="Fuso" className="input w-auto py-1" value={tz} onChange={(e) => setSc({ timeZone: e.target.value })}>
                {[...new Set([tz, ...TIMEZONES])].map((z) => (
                  <option key={z} value={z}>
                    {z}
                  </option>
                ))}
              </select>
            )}
          </div>
        )}
        {platform === "revcontent" && sc.mode === "CUSTOM" && (
          <p className="mt-2 text-[11px] text-faint">Na Revcontent o horário vale todos os dias, no fuso da conta.</p>
        )}
      </div>

      <Field label="Código de rastreio (UTM)" className="sm:col-span-3">
        <input
          id="cp-tracking"
          className="input font-mono text-xs"
          placeholder={platform === "taboola" ? "utm_source=taboola&utm_medium=referral" : "utm_source=revcontent"}
          value={setup.trackingCode ?? ""}
          onChange={(e) => set({ trackingCode: e.target.value })}
        />
      </Field>

      <BlocklistField platform={platform} setup={setup} onChange={onChange} blocklists={blocklists} onBlocklists={onBlocklists} />
    </div>
  );
}

function BlocklistField({
  platform,
  setup,
  onChange,
  blocklists,
  onBlocklists,
}: {
  platform: Platform;
  setup: CampaignSetup;
  onChange: (s: CampaignSetup) => void;
  blocklists: Blocklist[];
  onBlocklists?: (b: Blocklist[]) => void;
}) {
  const [text, setText] = useState((setup.blockedSites ?? []).join("\n"));
  const ids = setup.blocklistIds ?? [];
  const parse = (t: string) => [...new Set(t.split(/[\s,;]+/).map((x) => x.trim()).filter(Boolean))];
  const total = new Set([...parse(text), ...blocklists.filter((b) => ids.includes(b.id)).flatMap((b) => b.sites)]).size;
  async function saveList() {
    const name = prompt("Nome da blocklist (ex.: Sites ruins UK):");
    if (!name) return;
    const r = await fetch("/api/campaigns/blocklists", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name, platform, sites: parse(text) }),
    }).then((x) => x.json());
    if (r.blocklists) {
      onBlocklists?.(r.blocklists.filter((b: Blocklist) => b.platform === platform));
      setText("");
      onChange({ ...setup, blockedSites: [], blocklistIds: [...ids, r.blocklist.id] });
    }
  }
  return (
    <div className="rounded-lg border border-line p-3 sm:col-span-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="text-xs text-zinc-300">
          Blocklist {platform === "taboola" ? "(sites)" : "(ids de widget)"} · {total} bloqueio(s) além do modelo
        </span>
        {parse(text).length > 0 && (
          <button className="text-[11px] text-info hover:underline" onClick={saveList}>
            Salvar como lista
          </button>
        )}
      </div>
      {blocklists.length > 0 && (
        <div className="mt-2 flex flex-wrap gap-1">
          {blocklists.map((b) => (
            <button
              key={b.id}
              className={`chip border border-line ${ids.includes(b.id) ? "chip-on" : ""}`}
              onClick={() => onChange({ ...setup, blocklistIds: ids.includes(b.id) ? ids.filter((x) => x !== b.id) : [...ids, b.id] })}
            >
              {b.name} ({b.sites.length})
            </button>
          ))}
        </div>
      )}
      <textarea
        id="cp-blocks"
        className="input mt-2 h-20 font-mono text-xs"
        placeholder={platform === "taboola" ? "Cole os sites para bloquear (um por linha), ex.: msn-uk, aol-android-channel" : "Cole os ids de widget, ex.: 123456, 987654"}
        value={text}
        onChange={(e) => {
          setText(e.target.value);
          onChange({ ...setup, blockedSites: parse(e.target.value) });
        }}
      />
      <p className="mt-1 text-[11px] text-faint">
        {platform === "taboola"
          ? "Use o nome do site como aparece no relatório da Taboola (coluna site). Os bloqueios da conta (nível conta) já valem sozinhos para todas as campanhas."
          : "Ids de widget do relatório da Revcontent."}
      </p>
    </div>
  );
}

export function CreativePicker({
  platform,
  picks,
  onChange,
  context = {},
}: {
  platform: Platform;
  picks: Pick[];
  onChange: (p: Pick[]) => void;
  /** Product / campaign name: helps find the niche for the descriptions. */
  context?: { product?: string; campaign?: string };
}) {
  const [data, setData] = useState<{ variants: CreativeVariant[]; combos: Ad[]; images: Group[]; headlines: Group[]; savedHeadlines?: Saved[] } | null>(null);
  const campaignProduct = normProduct(context.product ?? "");
  const [onlyProduct, setOnlyProduct] = useState(true);
  const fits = (p?: string) => !onlyProduct || !campaignProduct || !p || normProduct(p) === campaignProduct;
  const [view, setView] = useState<"images" | "headlines" | "ads" | "variants">("images");
  const [target, setTarget] = useState<string | null>(null); // pick that receives a headline from the Headlines tab
  const [genBusy, setGenBusy] = useState(false);
  const [round, setRound] = useState(0);
  const [oneBusy, setOneBusy] = useState<string | null>(null);
  async function redoOne(p: Pick) {
    setOneBusy(p.key);
    const v = round + 1;
    setRound(v);
    const got = await generateDescriptions([{ headline: p.headline, imageUrl: p.imageUrl }], { ...context, variant: v });
    setOneBusy(null);
    if (got[p.headline]) onChange(picks.map((x) => (x.key === p.key ? { ...x, description: got[p.headline] } : x)));
  }
  const [perfLoading, setPerfLoading] = useState(true);
  useEffect(() => {
    // The library (added creatives, variants, saved headlines) is instant; the sources' performance comes after.
    fetch("/api/creatives?only=library")
      .then((r) => r.json())
      .then((lib) => {
        setData((d) => ({ combos: [], images: [], headlines: [], ...d, variants: lib.variants ?? [], savedHeadlines: lib.savedHeadlines ?? [] }));
        // Open on the library while the performance numbers are still loading.
        if ((lib.variants ?? []).some((v: CreativeVariant) => v.status !== "archived")) setView((v) => (v === "images" ? "variants" : v));
      })
      .catch(() => setData((d) => d ?? { variants: [], combos: [], images: [], headlines: [], savedHeadlines: [] }));
    fetch("/api/creatives?preset=30d")
      .then((r) => r.json())
      .then((perf) => setData((d) => ({ ...perf, variants: perf.variants ?? d?.variants ?? [], savedHeadlines: perf.savedHeadlines ?? d?.savedHeadlines ?? [] })))
      .catch(() => {})
      .finally(() => setPerfLoading(false));
  }, []);
  const max = TITLE_MAX[platform] ?? 100;
  const byProfit = <T extends Perf>(xs: T[]) => [...xs].sort((a, b) => b.profit - a.profit || b.roas - a.roas);
  const variants = (data?.variants ?? []).filter((v) => v.status !== "archived" && fits(v.product));
  const hiddenOther = (data?.variants ?? []).filter((v) => v.status !== "archived" && !fits(v.product)).length;
  const images = byProfit((data?.images ?? []).filter((g) => fits(g.product)));
  const saved = (data?.savedHeadlines ?? []).filter((h) => fits(h.product));
  const headlines = byProfit((data?.headlines ?? []).filter((g) => fits(g.product)));
  const ads = byProfit((data?.combos ?? []).filter((a) => fits(a.product)));
  const add = (p: Omit<Pick, "key">) => {
    const key = `${p.kind}:${p.imageUrl}:${Date.now()}:${Math.random().toString(36).slice(2, 6)}`;
    onChange([...picks, { ...p, key, headline: p.headline.slice(0, max), cta: p.cta ?? "" }]);
    setTarget(key);
  };
  const update = (key: string, patch: Partial<Pick>) => onChange(picks.map((x) => (x.key === key ? { ...x, ...patch } : x)));
  const count = (img: string) => picks.filter((x) => x.imageUrl === img).length;

  async function fillDescriptions(all: boolean) {
    const need = picks.filter((p) => all || !p.description?.trim()).map((p) => ({ headline: p.headline, imageUrl: p.imageUrl }));
    if (!need.length) return;
    setGenBusy(true);
    const v = all ? round + 1 : round;
    setRound(v);
    const got = await generateDescriptions(need, { ...context, variant: v });
    setGenBusy(false);
    onChange(picks.map((p) => (all || !p.description?.trim() ? { ...p, description: got[p.headline] ?? p.description } : p)));
  }

  const tabs: [typeof view, string][] = [
    ["images", `Imagens que performam (${images.length})`],
    ["headlines", `Headlines (${headlines.length + saved.length})`],
    ["ads", `Anúncios prontos (${ads.length})`],
    ["variants", `Biblioteca (${variants.length})`],
  ];

  return (
    <div>
      {campaignProduct && (
        <label className="mb-2 flex items-center gap-2 text-[11px] text-muted">
          <input type="checkbox" checked={onlyProduct} onChange={(e) => setOnlyProduct(e.target.checked)} />
          Só criativos do produto {campaignProduct} (e os sem produto)
          {onlyProduct && hiddenOther > 0 && <span className="text-warn">· {hiddenOther} da biblioteca são de outros produtos (desmarque para ver)</span>}
        </label>
      )}
      <div className="flex flex-wrap gap-1">
        {tabs.map(([id, label]) => (
          <button key={id} className={`chip border border-line ${view === id ? "chip-on" : ""}`} onClick={() => setView(id)}>
            {label}
          </button>
        ))}
      </div>
      <p className="mt-2 text-[11px] text-faint">
        {view === "images"
          ? "Clique numa imagem para adicionar (vem com a headline que mais rodou com ela; troque à vontade). Dá para usar a mesma imagem com headlines diferentes."
          : view === "headlines"
            ? picks.length
              ? "Clique numa headline para colocar no criativo marcado abaixo (●)."
              : "Escolha primeiro uma imagem; depois clique aqui para trocar a headline dela."
            : view === "ads"
              ? "Imagem + headline exatamente como já rodam, ordenados por lucro (últimos 30 dias)."
              : "Criativos adicionados (spy) e variações geradas na aba Criativos — já vêm com a descrição salva."}
      </p>
      <div className="mt-2 grid max-h-[380px] gap-2 overflow-y-auto pr-1 sm:grid-cols-3">
        {!data && <p className="text-xs text-muted sm:col-span-3">Carregando a biblioteca…</p>}
        {data && perfLoading && view !== "variants" && (
          <p className="text-xs text-muted sm:col-span-3">Carregando o desempenho dos últimos 30 dias… a Biblioteca já está pronta.</p>
        )}
        {view === "images" &&
          images.map((g) => (
            <button
              key={g.key}
              onClick={() => add({ kind: "ad", imageUrl: g.image, headline: g.title, label: perfLine(g) })}
              className={`relative overflow-hidden rounded-lg border text-left ${count(g.image) ? "border-accent" : "border-line"}`}
            >
              <img src={g.image} alt="" className="aspect-[16/9] w-full object-cover" loading="lazy" />
              {count(g.image) > 0 && <span className="absolute right-1 top-1 rounded bg-accent px-1.5 text-[10px] font-semibold text-black">{count(g.image)}×</span>}
              <div className="p-2 text-[11px]">
                <div className="text-faint">{perfLine(g)}</div>
                <div className="text-faint">{g.ads} anúncio(s)</div>
              </div>
            </button>
          ))}
        {view === "headlines" &&
          headlines.map((g) => (
            <button
              key={g.key}
              disabled={!picks.length}
              onClick={() => target && update(target, { headline: g.title.slice(0, max) })}
              className="rounded-lg border border-line p-2 text-left text-[11px] hover:border-accent disabled:opacity-50 sm:col-span-3"
            >
              <div className="text-zinc-200">{g.title}</div>
              <div className="text-faint">{perfLine(g)}</div>
            </button>
          ))}
        {view === "headlines" &&
          saved.map((h) => (
            <button
              key={h.id}
              disabled={!picks.length}
              onClick={() => target && update(target, { headline: h.text.slice(0, max), ...(h.description ? { description: h.description } : {}) })}
              className="rounded-lg border border-line p-2 text-left text-[11px] hover:border-accent disabled:opacity-50 sm:col-span-3"
            >
              <div className="text-zinc-200">{h.text}</div>
              <div className="text-faint">salva · {h.product}</div>
            </button>
          ))}
        {view === "ads" &&
          ads.map((a) => (
            <button
              key={a.key}
              onClick={() => add({ kind: "ad", imageUrl: a.thumbnail, headline: a.title, label: `${PLATFORM_LABEL[a.platform] ?? a.platform} · ${perfLine(a)}` })}
              className={`overflow-hidden rounded-lg border text-left ${count(a.thumbnail) ? "border-accent" : "border-line"}`}
            >
              <img src={a.thumbnail} alt="" className="aspect-[16/9] w-full object-cover" loading="lazy" />
              <div className="p-2 text-[11px]">
                <div className="line-clamp-2">{a.title}</div>
                <div className="text-faint">{perfLine(a)}</div>
              </div>
            </button>
          ))}
        {view === "variants" &&
          variants.map((v) => (
            <button
              key={v.id}
              onClick={() =>
                add({
                  kind: "variant",
                  variantId: v.id,
                  imageUrl: `/api/assets/${v.assetId}`,
                  headline: v.headline,
                  description: v.description,
                  label: `${v.origin === "spy" ? "adicionado" : "variação"}${v.product ? ` · ${v.product}` : ""} · ${v.source.campaignName}`,
                })
              }
              className={`overflow-hidden rounded-lg border text-left ${count(`/api/assets/${v.assetId}`) ? "border-accent" : "border-line"}`}
            >
              <img src={`/api/assets/${v.assetId}`} alt="" className="aspect-[16/9] w-full object-cover" loading="lazy" />
              <div className="p-2 text-[11px]">
                <div className="line-clamp-2">{v.headline}</div>
                <div className="text-faint">
                  {v.origin === "spy" ? "adicionado" : "variação"}
                  {v.product ? ` · ${v.product}` : ""}
                </div>
              </div>
            </button>
          ))}
        {data && view === "variants" && !variants.length && (
          <p className="text-xs text-muted sm:col-span-3">Nenhuma variação gerada ainda. Use as imagens e headlines que performam, ou gere variações na aba Criativos.</p>
        )}
      </div>

      {picks.length > 0 && (
        <div className="mt-4 space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="label">Criativos escolhidos ({picks.length})</div>
            <div className="flex flex-wrap items-center gap-2 text-[11px]">
              <button className="text-info hover:underline disabled:opacity-50" disabled={genBusy} onClick={() => fillDescriptions(false)}>
                {genBusy ? "Gerando…" : "Gerar descrições que faltam"}
              </button>
              <button className="text-info hover:underline disabled:opacity-50" disabled={genBusy} onClick={() => fillDescriptions(true)}>
                Refazer todas
              </button>
              {platform === "taboola" && (
                <select
                  aria-label="CTA para todos"
                  className="input w-auto py-1 text-[11px]"
                  value=""
                  onChange={(e) => onChange(picks.map((p) => ({ ...p, cta: e.target.value === "-" ? "" : e.target.value })))}
                >
                  <option value="">CTA em todos…</option>
                  {CTAS.map(([v, l]) => (
                    <option key={v || "-"} value={v || "-"}>
                      {l}
                    </option>
                  ))}
                </select>
              )}
            </div>
          </div>
          {picks.map((p) => (
            <div key={p.key} className={`rounded-lg border p-2 ${target === p.key ? "border-accent/60" : "border-line"}`} onClick={() => setTarget(p.key)}>
              <div className="flex items-start gap-2">
                <img src={p.imageUrl} alt="" className="h-14 w-24 shrink-0 rounded object-cover" />
                <div className="min-w-0 flex-1 space-y-1.5">
                  <div className="flex items-center gap-2">
                    <span className={`text-[10px] ${target === p.key ? "text-accent" : "text-faint"}`}>●</span>
                    <input
                      aria-label="Headline"
                      className="input py-1.5 text-xs"
                      maxLength={max}
                      value={p.headline}
                      onChange={(e) => update(p.key, { headline: e.target.value })}
                    />
                    <span className="w-12 shrink-0 text-right text-[10px] text-faint">
                      {p.headline.length}/{max}
                    </span>
                  </div>
                  <div className="flex items-start gap-2">
                    <textarea
                      aria-label="Descrição"
                      className="input h-14 py-1.5 text-xs"
                      maxLength={250}
                      placeholder="Descrição (aparece embaixo da headline) — use “Gerar descrições”"
                      value={p.description ?? ""}
                      onChange={(e) => update(p.key, { description: e.target.value })}
                    />
                    <div className="flex w-12 shrink-0 flex-col items-end gap-1">
                      <span className="text-[10px] text-faint">{(p.description ?? "").length}/250</span>
                      <button
                        className="text-[11px] text-info hover:underline disabled:opacity-50"
                        disabled={oneBusy === p.key}
                        title="Gerar outra descrição para este criativo"
                        onClick={() => redoOne(p)}
                      >
                        {oneBusy === p.key ? "…" : "↻ outra"}
                      </button>
                    </div>
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    {platform === "taboola" && (
                      <select aria-label="CTA" className="input w-auto py-1 text-[11px]" value={p.cta ?? ""} onChange={(e) => update(p.key, { cta: e.target.value })}>
                        {CTAS.map(([v, l]) => (
                          <option key={v || "-"} value={v}>
                            {l}
                          </option>
                        ))}
                      </select>
                    )}
                    <span className="truncate text-[10px] text-faint">{p.label}</span>
                  </div>
                </div>
                <button className="text-xs text-bad" onClick={() => onChange(picks.filter((x) => x.key !== p.key))} aria-label="Remover">
                  ✕
                </button>
              </div>
            </div>
          ))}
          {picks.some((p) => !p.description?.trim()) && <p className="text-[11px] text-warn">Há criativos sem descrição.</p>}
        </div>
      )}
    </div>
  );
}

export function CampaignHistory({
  log,
  onOpen,
  onChanged,
}: {
  log: CampaignLogEntry[];
  onOpen?: (accountId: string, campaignId: string) => void;
  onChanged?: () => void;
}) {
  const [open, setOpen] = useState<string | null>(log.find((l) => l.failed?.length || l.steps.some((x) => /Falhou/.test(x)))?.id ?? null);
  const [busy, setBusy] = useState<string | null>(null);
  const [msg, setMsg] = useState<Record<string, string[]>>({});
  if (!log.length) return <div className="card card-pad mt-4 text-sm text-muted">Nenhuma campanha criada pelo CRM ainda.</div>;
  async function retry(id: string) {
    setBusy(id);
    const r = await fetch("/api/campaigns/run", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "retry", logId: id }),
    })
      .then((x) => x.json())
      .catch(() => ({ steps: ["Falha na conexão."] }));
    setBusy(null);
    setMsg((m) => ({ ...m, [id]: r.steps ?? [r.error ?? "Erro"] }));
    onChanged?.();
  }
  return (
    <div className="card mt-4 overflow-x-auto">
      <table className="tbl w-full min-w-[760px]">
        <thead>
          <tr>
            <th>Quando</th>
            <th>Ação</th>
            <th>Fonte</th>
            <th>Campanha</th>
            <th>RedTrack</th>
            <th className="text-right">Criativos</th>
            <th className="text-right">Status</th>
          </tr>
        </thead>
        <tbody>
          {log.map((l) => {
            const fails = l.failed?.length ?? l.steps.filter((x) => /^Falhou/.test(x)).length;
            return (
              <Fragment key={l.id}>
                <tr className="cursor-pointer" onClick={() => setOpen(open === l.id ? null : l.id)}>
                  <td className="text-muted">{new Date(l.at).toLocaleString("pt-BR")}</td>
                  <td>{l.action}</td>
                  <td>{PLATFORM_LABEL[l.platform] ?? l.platform}</td>
                  <td className="font-mono text-xs">
                    {l.campaignName}
                    {l.campaignId && <div className="text-[10px] text-faint">id {l.campaignId}</div>}
                  </td>
                  <td className="text-muted">{l.rtCampaign ?? "—"}</td>
                  <td className="text-right">
                    {l.items}
                    {fails > 0 && <span className="text-bad"> · {fails} falhou</span>}
                  </td>
                  <td className={`text-right ${l.ok && !fails ? "text-accent" : l.ok ? "text-warn" : "text-bad"}`}>
                    {l.ok ? (fails ? "parcial" : "ok") : "erro"} {open === l.id ? "▲" : "▼"}
                  </td>
                </tr>
                {open === l.id && (
                  <tr>
                    <td colSpan={7} className="bg-black/20">
                      <ul className="space-y-1 text-xs">
                        {l.steps.map((x, i) => (
                          <li key={i} className={/Falhou|Erro|Não consegui|não enviados/.test(x) ? "text-bad" : "text-muted"}>
                            {x}
                          </li>
                        ))}
                      </ul>
                      <div className="mt-3 flex flex-wrap gap-2">
                        {!!l.failed?.length && (
                          <button className="btn-primary py-1 text-xs" disabled={busy === l.id} onClick={() => retry(l.id)}>
                            {busy === l.id ? "Enviando… (até 1 min por anúncio)" : `Tentar de novo os ${l.failed.length} que falharam`}
                          </button>
                        )}
                        {l.campaignId && onOpen && (
                          <button className="btn-ghost py-1 text-xs" onClick={() => onOpen(l.accountId, l.campaignId)}>
                            Abrir campanha (configurações e anúncios)
                          </button>
                        )}
                      </div>
                      {!l.failed?.length && fails > 0 && (
                        <p className="mt-2 text-[11px] text-faint">
                          Esse envio é de antes do botão de nova tentativa: abra a campanha e adicione o criativo de novo em &quot;Criativos novos&quot;.
                        </p>
                      )}
                      {msg[l.id] && (
                        <ul className="mt-2 space-y-1 text-xs">
                          {msg[l.id].map((x, i) => (
                            <li key={i} className={/Falhou|Erro|Nada/.test(x) ? "text-bad" : "text-accent"}>
                              {x}
                            </li>
                          ))}
                        </ul>
                      )}
                    </td>
                  </tr>
                )}
              </Fragment>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

export function Section({ title, right, children }: { title: string; right?: React.ReactNode; children: React.ReactNode }) {
  return (
    <div className="card card-pad">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <div className="text-sm font-medium">{title}</div>
        {right}
      </div>
      {children}
    </div>
  );
}

export function Field({ label, className = "", children }: { label: string; className?: string; children: React.ReactNode }) {
  return (
    <label className={`block ${className}`}>
      <span className="mb-1.5 block text-xs text-zinc-300">{label}</span>
      {children}
    </label>
  );
}

export function SummaryRow({ k, v, mono }: { k: string; v: string; mono?: boolean }) {
  return (
    <div className="flex justify-between gap-3">
      <span className="text-faint">{k}</span>
      <span className={`text-right ${mono ? "font-mono text-xs" : ""}`}>{v}</span>
    </div>
  );
}
