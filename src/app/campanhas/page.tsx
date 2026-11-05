"use client";
/* eslint-disable @next/next/no-img-element */
import { useEffect, useMemo, useState } from "react";
import { buildRtName, buildSourceName, normProduct, parseRtName } from "@/lib/naming";
import type { CampaignLogEntry, CampaignSetup, CampaignTemplate, CreativeVariant } from "@/lib/store";

type Platform = "taboola" | "revcontent";
type Account = { id: string; label: string; platform: Platform };
type SrcCampaign = { id: string; name: string; status: string; active: boolean; groupId?: string };
type Group = { id: string; name: string; status: string };
type RtCampaign = { id: string; title: string; status: string; url: string };
type Meta = { campaigns: SrcCampaign[]; groups: Group[]; rtCampaigns: RtCampaign[]; templates: CampaignTemplate[]; warnings: string[] };
type Ad = { platform: string; itemId: string; title: string; thumbnail: string; campaignName: string; spend: number; roas: number; key: string };
type Pick = { key: string; kind: "variant" | "ad"; variantId?: string; imageUrl: string; headline: string; label: string };
type Tab = "create" | "duplicate" | "add" | "log";

const PLATFORM_LABEL: Record<string, string> = { taboola: "Taboola", revcontent: "Revcontent" };

const DEFAULT_SETUP: Record<Platform, CampaignSetup> = {
  taboola: {
    product: "OMNIPRO",
    countries: ["US"],
    devices: ["DESKTOP"],
    bidStrategy: "MAX_CONVERSIONS",
    spendingLimitModel: "MONTHLY",
    spendingLimit: 3000,
    dailyCap: 100,
    marketingObjective: "ONLINE_PURCHASES",
    brandingText: "PrevenMD",
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

const BID_LABEL: Record<string, string> = { MAX_CONVERSIONS: "MAXCONV", TARGET_CPA: "TCPA", SMART: "SMARTBID", FIXED: "CPC", cpc: "CPC", cpa: "CPA" };
const deviceLabel = (d: string[]) => (d.length === 1 ? d[0] : "ALL");
const autoName = (s: CampaignSetup) => buildSourceName(s.product, deviceLabel(s.devices), BID_LABEL[s.bidStrategy] ?? s.bidStrategy, s.countries[0] ?? "US");

export default function Campanhas() {
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [log, setLog] = useState<CampaignLogEntry[]>([]);
  const [accountId, setAccountId] = useState("");
  const [meta, setMeta] = useState<Meta | null>(null);
  const [tab, setTab] = useState<Tab>("create");
  const [reload, setReload] = useState(0);

  useEffect(() => {
    fetch("/api/campaigns/meta")
      .then((r) => r.json())
      .then((d) => {
        setAccounts(d.accounts);
        setLog(d.log);
        setAccountId((cur) => cur || d.accounts[0]?.id || "");
      });
  }, [reload]);

  const account = accounts.find((a) => a.id === accountId);
  useEffect(() => {
    if (!account) return;
    setMeta(null);
    fetch(`/api/campaigns/meta?platform=${account.platform}&accountId=${encodeURIComponent(account.id)}`)
      .then((r) => r.json())
      .then(setMeta);
  }, [account, reload]);

  return (
    <div className="mx-auto max-w-[1200px]">
      <header className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Campanhas</h1>
          <p className="mt-1 text-sm text-muted">
            Crie, duplique ou adicione criativos. Tudo sobe pausado, com o nome no padrão e o link do RedTrack.
          </p>
        </div>
        <label className="flex items-center gap-2 text-xs text-muted">
          Conta
          <select id="cp-account" className="input w-auto py-1.5" value={accountId} onChange={(e) => setAccountId(e.target.value)}>
            {accounts.map((a) => (
              <option key={a.id} value={a.id}>
                {PLATFORM_LABEL[a.platform]} · {a.label}
              </option>
            ))}
          </select>
        </label>
      </header>

      {accounts.length === 0 && (
        <div className="card card-pad mt-6 text-sm text-muted">Conecte uma conta Taboola ou Revcontent em Integrações.</div>
      )}
      {!!meta?.warnings.length && <p className="mt-3 text-xs text-faint">{meta.warnings.join(" · ")}</p>}

      <div className="mt-6 flex gap-1 rounded-lg border border-line bg-panel p-1">
        {(
          [
            ["create", "Nova campanha"],
            ["duplicate", "Duplicar campanha"],
            ["add", "Adicionar criativos"],
            ["log", `Histórico${log.length ? ` (${log.length})` : ""}`],
          ] as [Tab, string][]
        ).map(([id, label]) => (
          <button key={id} onClick={() => setTab(id)} className={`chip flex-1 ${tab === id ? "chip-on" : ""}`}>
            {label}
          </button>
        ))}
      </div>

      {account && meta && tab !== "log" && (
        <Builder key={`${account.id}-${tab}`} mode={tab} account={account} meta={meta} onDone={() => setReload((n) => n + 1)} />
      )}
      {account && !meta && tab !== "log" && <div className="card card-pad mt-4 text-sm text-muted">Carregando campanhas da conta…</div>}
      {tab === "log" && <History log={log} />}
    </div>
  );
}

/* ------------------------------- builder -------------------------------- */

function Builder({ mode, account, meta, onDone }: { mode: Exclude<Tab, "log">; account: Account; meta: Meta; onDone: () => void }) {
  const platform = account.platform;
  const [setup, setSetup] = useState<CampaignSetup>(DEFAULT_SETUP[platform]);
  const [templateId, setTemplateId] = useState("");
  const [name, setName] = useState(autoName(DEFAULT_SETUP[platform]));
  const [nameEdited, setNameEdited] = useState(false);
  const [groupMode, setGroupMode] = useState<"existing" | "new" | "none">(meta.groups.length ? "existing" : "new");
  const [groupId, setGroupId] = useState(meta.groups[0]?.id ?? "");
  const [newGroup, setNewGroup] = useState({ name: buildRtName("OMNIPRO", "taboola", "US"), spendingLimitModel: "MONTHLY", spendingLimit: 5000 });
  const [rtId, setRtId] = useState("");
  const [url, setUrl] = useState("");
  const [sourceId, setSourceId] = useState(meta.campaigns[0]?.id ?? "");
  const [keepCreatives, setKeepCreatives] = useState(false);
  const [picks, setPicks] = useState<Pick[]>([]);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<{ ok: boolean; steps: string[] } | null>(null);
  const [error, setError] = useState("");

  // Name follows the setup until the user edits it.
  useEffect(() => {
    if (!nameEdited) setName(autoName(setup));
  }, [setup, nameEdited]);

  // Suggest the RedTrack campaign "PRODUTO FONTE PAÍS" for this setup.
  const suggestedRt = useMemo(() => {
    const want = buildRtName(setup.product, platform, setup.countries[0] ?? "US");
    return meta.rtCampaigns.find((c) => {
      const p = parseRtName(c.title);
      return p && buildRtName(p.product, p.source, p.country) === want;
    });
  }, [setup.product, setup.countries, platform, meta.rtCampaigns]);
  useEffect(() => {
    if (!rtId && suggestedRt) {
      setRtId(suggestedRt.id);
      setUrl(suggestedRt.url);
    }
  }, [suggestedRt, rtId]);

  const applyTemplate = (id: string) => {
    setTemplateId(id);
    const t = meta.templates.find((x) => x.id === id);
    if (t) setSetup({ ...DEFAULT_SETUP[platform], ...t.setup });
  };

  async function saveAsTemplate() {
    const n = prompt("Nome do modelo (ex.: Taboola Desktop US MaxConv):");
    if (!n) return;
    const existing = meta.templates.find((t) => t.id === templateId);
    await fetch("/api/campaigns/templates", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: existing?.name === n ? existing.id : undefined, name: n, platform, setup }),
    });
    onDone();
  }

  const rt = meta.rtCampaigns.find((c) => c.id === rtId);
  const creatives = picks.map((p) =>
    p.kind === "variant" ? { kind: "variant", variantId: p.variantId, headline: p.headline } : { kind: "ad", imageUrl: p.imageUrl, headline: p.headline },
  );

  async function run() {
    setBusy(true);
    setError("");
    setResult(null);
    const base = { platform, accountId: account.id, url, rtCampaign: rt?.title, creatives };
    const body =
      mode === "create"
        ? {
            action: "create",
            ...base,
            name,
            setup,
            group:
              platform !== "taboola"
                ? undefined
                : groupMode === "existing"
                  ? { mode: "existing", id: groupId }
                  : groupMode === "new"
                    ? { mode: "new", ...newGroup, marketingObjective: setup.marketingObjective ?? "ONLINE_PURCHASES" }
                    : { mode: "none" },
          }
        : mode === "duplicate"
          ? { action: "duplicate", ...base, sourceCampaignId: sourceId, name, keepCreatives, setup }
          : {
              action: "add",
              ...base,
              campaignId: sourceId,
              campaignName: meta.campaigns.find((c) => c.id === sourceId)?.name ?? sourceId,
            };
    const r = await fetch("/api/campaigns/run", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) })
      .then((r) => r.json())
      .catch(() => ({ error: "Falha na conexão." }));
    setBusy(false);
    if (r.error) return setError(r.error);
    setResult(r);
    onDone();
  }

  const needsCreatives = mode !== "duplicate";
  const canRun =
    !busy &&
    (mode === "add" ? !!sourceId && !!url && picks.length > 0 : mode === "duplicate" ? !!sourceId && !!name && (keepCreatives || !!url) : !!name && !!url);

  return (
    <div className="mt-4 grid gap-4 lg:grid-cols-[1fr_380px]">
      <div className="space-y-4">
        {/* 1. Campaign to duplicate / to add to */}
        {mode !== "create" && (
          <Section title={mode === "duplicate" ? "1. Campanha original" : "1. Campanha que recebe os criativos"}>
            <select id="cp-source" className="input" value={sourceId} onChange={(e) => setSourceId(e.target.value)}>
              {meta.campaigns.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name} · {c.active ? "ativa" : "pausada"} · id {c.id}
                </option>
              ))}
            </select>
            {mode === "duplicate" && platform === "taboola" && (
              <label className="mt-3 flex items-center gap-2 text-sm">
                <input type="checkbox" checked={keepCreatives} onChange={(e) => setKeepCreatives(e.target.checked)} />
                Manter os anúncios da original (desmarcado = sobe só os criativos escolhidos abaixo)
              </label>
            )}
            {mode === "duplicate" && platform === "revcontent" && (
              <p className="mt-2 text-[11px] text-faint">
                A Revcontent não tem &quot;duplicar&quot;: a cópia leva o lance, o orçamento e o pacing da original, e país/device do setup
                abaixo.
              </p>
            )}
          </Section>
        )}

        {/* 2. Setup */}
        {mode !== "add" && (
          <Section
            title={mode === "create" ? "1. Setup" : "2. Setup e nome da cópia"}
            right={
              <div className="flex items-center gap-2">
                <select id="cp-template" className="input w-auto py-1 text-xs" value={templateId} onChange={(e) => applyTemplate(e.target.value)}>
                  <option value="">Modelo salvo…</option>
                  {meta.templates.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.name}
                    </option>
                  ))}
                </select>
                <button className="text-xs text-info hover:underline" onClick={saveAsTemplate}>
                  Salvar como modelo
                </button>
              </div>
            }
          >
            <SetupForm platform={platform} setup={setup} onChange={setSetup} showBudget={mode === "create" || platform === "revcontent"} />
            <label className="mt-4 block">
              <span className="mb-1.5 block text-xs text-zinc-300">Nome da campanha na fonte</span>
              <input
                id="cp-name"
                className="input font-mono text-sm"
                value={name}
                onChange={(e) => {
                  setName(e.target.value);
                  setNameEdited(true);
                }}
              />
              <span className="mt-1 block text-[11px] text-faint">Padrão: PRODUTO DEVICE LANCE PAÍS DATA. Ele liga a campanha ao RedTrack sozinho.</span>
            </label>
          </Section>
        )}

        {/* Taboola group */}
        {mode === "create" && platform === "taboola" && (
          <Section title="2. Grupo de campanhas (Taboola)">
            <div className="flex flex-wrap gap-1">
              {(
                [
                  ["existing", "Usar um existente"],
                  ["new", "Criar novo"],
                  ["none", "Sem grupo"],
                ] as const
              ).map(([id, label]) => (
                <button key={id} className={`chip border border-line ${groupMode === id ? "chip-on" : ""}`} onClick={() => setGroupMode(id)}>
                  {label}
                </button>
              ))}
            </div>
            {groupMode === "existing" && (
              <select id="cp-group" className="input mt-3" value={groupId} onChange={(e) => setGroupId(e.target.value)}>
                {meta.groups.map((g) => (
                  <option key={g.id} value={g.id}>
                    {g.name} · {g.status.toLowerCase()}
                  </option>
                ))}
              </select>
            )}
            {groupMode === "new" && (
              <div className="mt-3 grid gap-3 sm:grid-cols-3">
                <Field label="Nome do grupo">
                  <input id="cp-gname" className="input" value={newGroup.name} onChange={(e) => setNewGroup({ ...newGroup, name: e.target.value })} />
                </Field>
                <Field label="Orçamento do grupo">
                  <select
                    id="cp-gmodel"
                    className="input"
                    value={newGroup.spendingLimitModel}
                    onChange={(e) => setNewGroup({ ...newGroup, spendingLimitModel: e.target.value })}
                  >
                    <option value="MONTHLY">Mensal</option>
                    <option value="ENTIRE">Total</option>
                    <option value="NONE">Sem limite</option>
                  </select>
                </Field>
                <Field label="Limite (US$)">
                  <input
                    id="cp-glimit"
                    className="input"
                    type="number"
                    value={newGroup.spendingLimit}
                    onChange={(e) => setNewGroup({ ...newGroup, spendingLimit: Number(e.target.value) })}
                  />
                </Field>
              </div>
            )}
            <p className="mt-2 text-[11px] text-faint">Na Taboola a campanha só pode entrar no grupo na criação; depois não dá para trocar.</p>
          </Section>
        )}

        {/* RedTrack link */}
        <Section title={`${mode === "create" ? "3" : mode === "duplicate" ? "3" : "2"}. Link (campanha do RedTrack)`}>
          <select
            id="cp-rt"
            className="input"
            value={rtId}
            onChange={(e) => {
              setRtId(e.target.value);
              setUrl(meta.rtCampaigns.find((c) => c.id === e.target.value)?.url ?? "");
            }}
          >
            <option value="">Escolha a campanha do RedTrack…</option>
            {meta.rtCampaigns.map((c) => (
              <option key={c.id} value={c.id}>
                {c.title}
                {c.id === suggestedRt?.id ? " (sugerida pelo nome)" : ""}
              </option>
            ))}
          </select>
          <input
            id="cp-url"
            className="input mt-2 font-mono text-xs"
            placeholder="https://… link de rastreio da campanha no RedTrack"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
          />
          {mode === "duplicate" && keepCreatives && <p className="mt-1 text-[11px] text-faint">Usado só nos criativos novos que você adicionar.</p>}
        </Section>

        {/* Creatives */}
        {needsCreatives && (
          <Section title={`${mode === "create" ? "4" : "3"}. Criativos (${picks.length})`}>
            <CreativePicker platform={platform} picks={picks} onChange={setPicks} />
          </Section>
        )}
        {mode === "duplicate" && (
          <Section title="4. Criativos novos (opcional)">
            <CreativePicker platform={platform} picks={picks} onChange={setPicks} />
          </Section>
        )}
      </div>

      {/* Summary */}
      <div className="lg:sticky lg:top-6 lg:self-start">
        <div className="card card-pad space-y-3 text-sm">
          <div className="label">Resumo</div>
          <Row k="Fonte" v={`${PLATFORM_LABEL[platform]} · ${account.label}`} />
          {mode !== "create" && <Row k="Campanha" v={meta.campaigns.find((c) => c.id === sourceId)?.name ?? "—"} />}
          {mode !== "add" && <Row k={mode === "duplicate" ? "Nome da cópia" : "Nome"} v={name} mono />}
          {mode === "create" && platform === "taboola" && (
            <Row
              k="Grupo"
              v={groupMode === "existing" ? (meta.groups.find((g) => g.id === groupId)?.name ?? "—") : groupMode === "new" ? `novo: ${newGroup.name}` : "sem grupo"}
            />
          )}
          <Row k="RedTrack" v={rt?.title ?? (url ? "link manual" : "—")} />
          <Row k="Criativos" v={String(picks.length) + (mode === "duplicate" && keepCreatives ? " + os da original" : "")} />
          <div className="rounded-lg bg-bg px-3 py-2 text-[11px] text-muted">Tudo é criado pausado. Revise na fonte e ative quando estiver pronto.</div>
          {error && <div className="rounded-lg border border-bad/30 bg-bad/5 px-3 py-2 text-xs text-bad">{error}</div>}
          <button className="btn-primary w-full justify-center" disabled={!canRun} onClick={run}>
            {busy
              ? "Criando… (pode levar 1 min por criativo)"
              : mode === "create"
                ? "Criar campanha pausada"
                : mode === "duplicate"
                  ? "Duplicar pausada"
                  : `Adicionar ${picks.length} criativo(s) pausados`}
          </button>
          {result && (
            <ul className={`space-y-1 rounded-lg border px-3 py-2 text-xs ${result.ok ? "border-accent/30 text-accent" : "border-bad/30 text-bad"}`}>
              {result.steps.map((s, i) => (
                <li key={i} className={/Falhou|Erro/.test(s) ? "text-bad" : ""}>
                  {s}
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}

/* ------------------------------- setup form ------------------------------ */

function SetupForm({
  platform,
  setup,
  onChange,
  showBudget,
}: {
  platform: Platform;
  setup: CampaignSetup;
  onChange: (s: CampaignSetup) => void;
  showBudget: boolean;
}) {
  const set = (p: Partial<CampaignSetup>) => onChange({ ...setup, ...p });
  const toggleDevice = (d: "DESKTOP" | "MOBILE" | "TABLET") =>
    set({ devices: setup.devices.includes(d) ? setup.devices.filter((x) => x !== d) : [...setup.devices, d] });
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
              <Field label="Orçamento">
                <select id="cp-model" className="input" value={setup.spendingLimitModel} onChange={(e) => set({ spendingLimitModel: e.target.value })}>
                  <option value="MONTHLY">Mensal</option>
                  <option value="ENTIRE">Total</option>
                  <option value="NONE">Sem limite</option>
                </select>
              </Field>
              {setup.spendingLimitModel !== "NONE" && (
                <Field label="Limite (US$)">
                  <input
                    id="cp-limit"
                    className="input"
                    type="number"
                    value={setup.spendingLimit ?? ""}
                    onChange={(e) => set({ spendingLimit: Number(e.target.value) })}
                  />
                </Field>
              )}
              <Field label="Limite diário (US$)">
                <input id="cp-daily" className="input" type="number" value={setup.dailyCap ?? ""} onChange={(e) => set({ dailyCap: Number(e.target.value) })} />
              </Field>
            </>
          )}
        </>
      ) : (
        <>
          <Field label="Otimizar por">
            <select id="cp-bid" className="input" value={setup.bidStrategy} onChange={(e) => set({ bidStrategy: e.target.value })}>
              <option value="cpc">CPC</option>
              <option value="cpa">CPA</option>
            </select>
          </Field>
          <Field label="Lance web (US$)">
            <input id="cp-cpc" className="input" type="number" step="0.01" value={setup.cpc ?? ""} onChange={(e) => set({ cpc: Number(e.target.value) })} />
          </Field>
          {showBudget && (
            <Field label="Orçamento (US$)">
              <input id="cp-budget" className="input" type="number" value={setup.budget ?? ""} onChange={(e) => set({ budget: Number(e.target.value) })} />
            </Field>
          )}
          <label className="flex items-center gap-2 text-sm sm:col-span-3">
            <input type="checkbox" checked={!!setup.pacing} onChange={(e) => set({ pacing: e.target.checked })} /> Distribuir o orçamento ao longo do dia
            (pacing)
          </label>
        </>
      )}
      <Field label="Código de rastreio (UTM, opcional)" className="sm:col-span-3">
        <input
          id="cp-tracking"
          className="input font-mono text-xs"
          placeholder="ex.: utm_source=taboola&utm_campaign={campaign_name}"
          value={setup.trackingCode ?? ""}
          onChange={(e) => set({ trackingCode: e.target.value })}
        />
      </Field>
    </div>
  );
}

/* ---------------------------- creative picker ---------------------------- */

function CreativePicker({ platform, picks, onChange }: { platform: Platform; picks: Pick[]; onChange: (p: Pick[]) => void }) {
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

/* -------------------------------- history -------------------------------- */

function History({ log }: { log: CampaignLogEntry[] }) {
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

/* --------------------------------- bits ---------------------------------- */

function Section({ title, right, children }: { title: string; right?: React.ReactNode; children: React.ReactNode }) {
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

function Field({ label, className = "", children }: { label: string; className?: string; children: React.ReactNode }) {
  return (
    <label className={`block ${className}`}>
      <span className="mb-1.5 block text-xs text-zinc-300">{label}</span>
      {children}
    </label>
  );
}

function Row({ k, v, mono }: { k: string; v: string; mono?: boolean }) {
  return (
    <div className="flex justify-between gap-3">
      <span className="text-faint">{k}</span>
      <span className={`text-right ${mono ? "font-mono text-xs" : ""}`}>{v}</span>
    </div>
  );
}
