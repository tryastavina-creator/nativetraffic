"use client";
/* eslint-disable @next/next/no-img-element */
/** Shared pieces of the campaign studio (setup form, creative picker, history). */
import { useEffect, useState } from "react";
import { COUNTRY_TZ } from "@/lib/campaignRules";
import { normProduct } from "@/lib/naming";
import type { Blocklist, CampaignLogEntry, CampaignSchedule, CampaignSetup, CreativeVariant } from "@/lib/store";

export type Platform = "taboola" | "revcontent";
export type Pick = { key: string; kind: "variant" | "ad"; variantId?: string; imageUrl: string; headline: string; label: string };
type Ad = { platform: string; itemId: string; title: string; thumbnail: string; campaignName: string; spend: number; roas: number; key: string };

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
      <Field label="Início">
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

export function CreativePicker({ platform, picks, onChange }: { platform: Platform; picks: Pick[]; onChange: (p: Pick[]) => void }) {
  const [data, setData] = useState<{ variants: CreativeVariant[]; combos: Ad[] } | null>(null);
  const [view, setView] = useState<"variants" | "ads">("variants");
  useEffect(() => {
    fetch("/api/creatives?preset=30d")
      .then((r) => r.json())
      .then(setData);
  }, []);
  const toggle = (p: Pick) => onChange(picks.some((x) => x.key === p.key) ? picks.filter((x) => x.key !== p.key) : [...picks, p]);
  const variants = (data?.variants ?? []).filter((v) => v.status !== "archived");
  const ads = [...(data?.combos ?? [])].sort((a, b) => b.roas - a.roas);

  return (
    <div>
      <div className="flex gap-1">
        <button className={`chip border border-line ${view === "variants" ? "chip-on" : ""}`} onClick={() => setView("variants")}>
          Variações geradas ({variants.length})
        </button>
        <button className={`chip border border-line ${view === "ads" ? "chip-on" : ""}`} onClick={() => setView("ads")}>
          Anúncios que já rodam ({ads.length})
        </button>
      </div>
      <div className="mt-3 grid max-h-[420px] gap-2 overflow-y-auto pr-1 sm:grid-cols-3">
        {view === "variants" &&
          variants.map((v) => {
            const p: Pick = { key: `v:${v.id}`, kind: "variant", variantId: v.id, imageUrl: `/api/assets/${v.assetId}`, headline: v.headline, label: v.source.campaignName };
            const on = picks.some((x) => x.key === p.key);
            return (
              <button key={v.id} onClick={() => toggle(p)} className={`overflow-hidden rounded-lg border text-left ${on ? "border-accent" : "border-line"}`}>
                <img src={p.imageUrl} alt="" className="aspect-[16/9] w-full object-cover" loading="lazy" />
                <div className="line-clamp-2 p-2 text-[11px]">{v.headline}</div>
              </button>
            );
          })}
        {view === "ads" &&
          ads.map((a) => {
            const p: Pick = { key: `a:${a.key}`, kind: "ad", imageUrl: a.thumbnail, headline: a.title, label: `${PLATFORM_LABEL[a.platform] ?? a.platform} · ROAS ${a.roas.toFixed(2)}x` };
            const on = picks.some((x) => x.key === p.key);
            return (
              <button key={a.key} onClick={() => toggle(p)} className={`overflow-hidden rounded-lg border text-left ${on ? "border-accent" : "border-line"}`}>
                <img src={a.thumbnail} alt="" className="aspect-[16/9] w-full object-cover" loading="lazy" />
                <div className="p-2 text-[11px]">
                  <div className="line-clamp-2">{a.title}</div>
                  <div className="text-faint">{p.label}</div>
                </div>
              </button>
            );
          })}
        {data && view === "variants" && !variants.length && <p className="text-xs text-muted sm:col-span-3">Nenhuma variação. Gere na aba Criativos.</p>}
      </div>
      {picks.length > 0 && (
        <div className="mt-3 space-y-2">
          <div className="label">Headlines dos escolhidos</div>
          {picks.map((p, i) => (
            <div key={p.key} className="flex items-center gap-2">
              <img src={p.imageUrl} alt="" className="h-9 w-16 shrink-0 rounded object-cover" />
              <input
                aria-label="Headline"
                className="input py-1.5 text-xs"
                maxLength={platform === "revcontent" ? 80 : 100}
                value={p.headline}
                onChange={(e) => onChange(picks.map((x, j) => (j === i ? { ...x, headline: e.target.value } : x)))}
              />
              <button className="text-xs text-bad" onClick={() => onChange(picks.filter((_, j) => j !== i))} aria-label="Remover">
                ✕
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export function CampaignHistory({ log }: { log: CampaignLogEntry[] }) {
  if (!log.length) return <div className="card card-pad mt-4 text-sm text-muted">Nenhuma campanha criada pelo CRM ainda.</div>;
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
          {log.map((l) => (
            <tr key={l.id} title={l.steps.join("\n")}>
              <td className="text-muted">{new Date(l.at).toLocaleString("pt-BR")}</td>
              <td>{l.action}</td>
              <td>{PLATFORM_LABEL[l.platform] ?? l.platform}</td>
              <td className="font-mono text-xs">
                {l.campaignName}
                {l.campaignId && <div className="text-[10px] text-faint">id {l.campaignId}</div>}
              </td>
              <td className="text-muted">{l.rtCampaign ?? "—"}</td>
              <td className="text-right">{l.items}</td>
              <td className={`text-right ${l.ok ? "text-accent" : "text-bad"}`}>{l.ok ? "ok" : "erro"}</td>
            </tr>
          ))}
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
