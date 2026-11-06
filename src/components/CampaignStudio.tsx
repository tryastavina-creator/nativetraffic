"use client";
/* eslint-disable @next/next/no-img-element */
/**
 * Campaign studio, opened from the Tráfego tab:
 *  - create:    new campaign on any connected account
 *  - edit:      settings + ads of an existing campaign (pause/activate, headlines, add new)
 *  - duplicate: copy to the same account, another account or another traffic source, editing on the way
 * Everything new is created paused.
 */
import { useEffect, useMemo, useState } from "react";
import { checkSetup } from "@/lib/campaignRules";
import { buildRtName, buildSourceName, normProduct, parseRtName } from "@/lib/naming";
import { translateSetup } from "@/lib/setupTranslate";
import type { Blocklist, CampaignSetup, CampaignTemplate } from "@/lib/store";
import {
  BID_LABEL,
  CTAS,
  CreativePicker,
  generateDescriptions,
  TITLE_MAX,
  DEFAULT_SETUP,
  Field,
  PLATFORM_LABEL,
  Section,
  SetupForm,
  SummaryRow,
  type Pick,
  type Platform,
} from "./campaignParts";

type Account = { id: string; label: string; platform: Platform };
type Group = { id: string; name: string; status: string };
type RtCampaign = { id: string; title: string; status: string; url: string };
type Meta = {
  campaigns: unknown[];
  groups: Group[];
  rtCampaigns: RtCampaign[];
  templates: CampaignTemplate[];
  conversions?: { id: string; name: string }[];
  blocklists?: Blocklist[];
  warnings: string[];
};
type Winner = { accountId: string; campaignId: string; name: string; spend: number; sales: number; cpa: number; roas: number; profit: number };
type Item = { id: string; title: string; thumbnail: string; url: string; active: boolean; status: string; description?: string; cta?: string };
type Detail = { platform: Platform; campaignId: string; name: string; setup: CampaignSetup; groupId?: string; items: Item[]; url: string; accountId: string };

export type StudioMode = "create" | "edit" | "duplicate";

const deviceLabel = (d: string[]) =>
  d.length === 1 ? d[0] : d.length >= 3 ? "ALL" : ["DESKTOP", "MOBILE", "TABLET"].filter((x) => d.includes(x)).join("/");
const usd = (n: number) => `$${Math.round(n).toLocaleString("en-US")}`;
const autoName = (s: CampaignSetup) => buildSourceName(s.product || "PRODUTO", deviceLabel(s.devices), BID_LABEL[s.bidStrategy] ?? s.bidStrategy, s.countries[0] ?? "US");

export function CampaignStudio({
  mode,
  accountId: sourceAccountId,
  campaignId,
  onClose,
  onDone,
}: {
  mode: StudioMode;
  accountId?: string;
  campaignId?: string;
  onClose: () => void;
  onDone: () => void;
}) {
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [targetId, setTargetId] = useState(sourceAccountId ?? "");
  const [meta, setMeta] = useState<Meta | null>(null);
  const [detail, setDetail] = useState<Detail | null>(null);
  const [loadError, setLoadError] = useState("");

  const [setup, setSetup] = useState<CampaignSetup | null>(null);
  const [name, setName] = useState("");
  const [nameEdited, setNameEdited] = useState(mode === "edit");
  const [items, setItems] = useState<(Item & { keep: boolean; newTitle: string; newActive: boolean; newDesc: string; newCta: string })[]>([]);
  const [descBusy, setDescBusy] = useState(false);
  const itemChanged = (i: (typeof items)[number]) =>
    i.newTitle !== i.title || i.newActive !== i.active || i.newDesc !== (i.description ?? "") || i.newCta !== (i.cta ?? "");
  const [groupMode, setGroupMode] = useState<"existing" | "new" | "none">("existing");
  const [groupId, setGroupId] = useState("");
  type NewGroupForm = {
    name: string;
    budgetMode: "group" | "campaign";
    spendingLimitModel: "MONTHLY" | "ENTIRE";
    spendingLimit: number;
    dailyCap: number;
    distribution: "AUTOMATIC" | "CUSTOM";
    kpi: "" | "ROAS" | "CPA";
    kpiGoal: number;
    kpiThreshold: number;
  };
  const [newGroup, setNewGroup] = useState<NewGroupForm>({
    name: "",
    budgetMode: "campaign",
    spendingLimitModel: "MONTHLY",
    spendingLimit: 9000,
    dailyCap: 300,
    distribution: "AUTOMATIC",
    kpi: "",
    kpiGoal: 0,
    kpiThreshold: 0,
  });
  const [groupInfo, setGroupInfo] = useState<{ shared: boolean; spendingLimitModel?: string; spendingLimit?: number; dailyCap?: number; distribution?: string; kpi?: string; kpiGoal?: number } | null>(null);
  const [rtId, setRtId] = useState("");
  const [url, setUrl] = useState("");
  const [picks, setPicks] = useState<Pick[]>([]);
  const [templateId, setTemplateId] = useState("");
  const [winners, setWinners] = useState<Winner[] | null>(null);
  const [tplLoading, setTplLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [activate, setActivate] = useState(false);
  const [result, setResult] = useState<{ ok: boolean; steps: string[] } | null>(null);
  const [error, setError] = useState("");

  // Accounts
  useEffect(() => {
    fetch("/api/campaigns/meta")
      .then((r) => r.json())
      .then((d) => {
        setAccounts(d.accounts);
        setTargetId((cur) => cur || d.accounts[0]?.id || "");
      });
  }, []);

  // Source campaign (edit / duplicate)
  useEffect(() => {
    if (mode === "create" || !sourceAccountId || !campaignId) return;
    fetch(`/api/campaigns/detail?accountId=${encodeURIComponent(sourceAccountId)}&campaignId=${encodeURIComponent(campaignId)}`)
      .then(async (r) => {
        const j = await r.json();
        if (!r.ok) throw new Error(j.error);
        setDetail(j);
        setItems(
          j.items.map((i: Item) => ({
            ...i,
            keep: i.active || j.items.length <= 6,
            newTitle: i.title,
            newActive: i.active,
            newDesc: i.description ?? "",
            newCta: i.cta ?? "",
          })),
        );
        setUrl(j.url);
        if (mode === "edit") setName(j.name);
      })
      .catch((e: Error) => setLoadError(e.message));
  }, [mode, sourceAccountId, campaignId]);

  useEffect(() => {
    if (!accounts.length || accounts.some((a) => a.id === targetId)) return;
    const fallback = accounts.find((a) => a.id === detail?.accountId) ?? accounts.find((a) => a.id.startsWith(`${targetId}::`)) ?? accounts[0];
    if (fallback) setTargetId(fallback.id);
  }, [accounts, targetId, detail]);

  const target = accounts.find((a) => a.id === targetId);
  const sourcePlatform = detail?.platform;
  const sourceAcc = detail?.accountId ?? sourceAccountId;
  const sameAccount = mode === "duplicate" && targetId === sourceAcc;
  const nativeDuplicate = sameAccount && target?.platform === "taboola";

  // Meta of the target account (groups, RedTrack campaigns, templates)
  useEffect(() => {
    if (!target) return;
    setMeta(null);
    fetch(`/api/campaigns/meta?platform=${target.platform}&accountId=${encodeURIComponent(target.id)}`)
      .then((r) => r.json())
      .then((m: Meta) => {
        setMeta(m);
        setGroupId((g) => {
          if (g && m.groups.some((x) => x.id === g)) return g;
          return "";
        });
        setGroupMode((cur) => (cur === "none" ? cur : "new"));
      });
  }, [target]);

  // Existing group whose name mentions the product → use it; otherwise create a new one.
  const product = setup?.product ?? "";
  useEffect(() => {
    if (!meta || groupId) return;
    const p = normProduct(product);
    const match = p ? meta.groups.find((g) => normProduct(g.name).includes(p) && !/TERMINATED|EXPIRED/.test(g.status)) : undefined;
    if (match) {
      setGroupMode("existing");
      setGroupId(match.id);
    }
  }, [meta, product, groupId]);
  // Budget / KPI of the chosen existing group
  useEffect(() => {
    setGroupInfo(null);
    if (groupMode !== "existing" || !groupId || !target || target.platform !== "taboola") return;
    fetch(`/api/campaigns/group?accountId=${encodeURIComponent(target.id)}&id=${encodeURIComponent(groupId)}`)
      .then((r) => r.json())
      .then((g) => !g.error && setGroupInfo(g))
      .catch(() => {});
  }, [groupMode, groupId, target]);
  const groupShared = groupMode === "new" ? newGroup.budgetMode === "group" : groupMode === "existing" ? !!groupInfo?.shared : false;
  const groupName = newGroup.name || (setup ? buildRtName(setup.product, "taboola", setup.countries[0] ?? "US") : "");

  // Campaigns that worked (template candidates) for the target source
  const targetPlatform = target?.platform;
  useEffect(() => {
    if (mode !== "create" || !targetPlatform) return;
    setWinners(null);
    fetch(`/api/campaigns/winners?platform=${targetPlatform}`)
      .then((r) => r.json())
      .then((d) => setWinners(d.winners ?? []))
      .catch(() => setWinners([]));
  }, [mode, targetPlatform]);

  async function applyTemplate(w: Winner | null) {
    if (!target) return;
    if (!w) {
      setSetup(DEFAULT_SETUP[target.platform]);
      return;
    }
    setTplLoading(true);
    try {
      const d = await fetch(`/api/campaigns/detail?accountId=${encodeURIComponent(w.accountId)}&campaignId=${encodeURIComponent(w.campaignId)}`).then((r) => r.json());
      if (d.error) throw new Error(d.error);
      setSetup({
        ...DEFAULT_SETUP[target.platform],
        ...d.setup,
        startDate: undefined,
        templateCampaign: { accountId: w.accountId, campaignId: w.campaignId, name: w.name },
        inheritBlocks: true,
        inheritBidModifiers: false,
        blockedSites: [],
        blocklistIds: [],
      });
      if (w.accountId === target.id && d.groupId) {
        setGroupMode("existing");
        setGroupId(d.groupId);
      }
      if (d.url && !url) setUrl(d.url);
      setNameEdited(false);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setTplLoading(false);
    }
  }

  // Setup: from the source (translated to the target source) or the default of the target
  useEffect(() => {
    if (!target) return;
    if (mode === "create") setSetup((s) => (s && !templateId ? s : DEFAULT_SETUP[target.platform]));
    else if (detail) setSetup(translateSetup(detail.platform, target.platform, { ...DEFAULT_SETUP[detail.platform], ...detail.setup }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [target, detail, mode]);

  useEffect(() => {
    if (setup && !nameEdited) setName(autoName(setup));
  }, [setup, nameEdited]);

  // RedTrack campaign suggested by naming (PRODUTO FONTE PAÍS)
  const suggestedRt = useMemo(() => {
    if (!setup || !target || !meta) return undefined;
    const want = buildRtName(setup.product, target.platform, setup.countries[0] ?? "US");
    return meta.rtCampaigns.find((c) => {
      const p = parseRtName(c.title);
      return p && buildRtName(p.product, p.source, p.country) === want;
    });
  }, [setup, target, meta]);
  // Follow the suggestion (product / country changed) until the user picks a RedTrack campaign by hand.
  const [rtAuto, setRtAuto] = useState(true);
  useEffect(() => {
    if (!rtAuto || !suggestedRt || suggestedRt.id === rtId) return;
    setRtId(suggestedRt.id);
    if (mode === "create" || !url) setUrl(suggestedRt.url);
  }, [suggestedRt, rtId, rtAuto, mode, url]);

  // Copying to another traffic source: the link must be the RedTrack campaign of that source.
  useEffect(() => {
    if (mode !== "duplicate" || !target || !detail) return;
    if (target.platform !== detail.platform) {
      setRtId("");
      setUrl("");
    } else {
      setRtId("");
      setUrl(detail.url);
    }
  }, [mode, target, detail]);

  const rt = meta?.rtCampaigns.find((c) => c.id === rtId);
  const creatives = picks.map((p) =>
    p.kind === "variant"
      ? { kind: "variant", variantId: p.variantId, headline: p.headline, description: p.description, cta: p.cta }
      : { kind: "ad", imageUrl: p.imageUrl, headline: p.headline, description: p.description, cta: p.cta },
  );
  const showGroup = target?.platform === "taboola" && (mode === "create" || (mode === "duplicate" && !nativeDuplicate));
  const tpl = setup?.templateCampaign;
  const check =
    setup && target
      ? checkSetup(target.platform, { ...setup, groupShared: showGroup && groupShared }, {
          url: mode === "edit" && !picks.length ? undefined : url,
          creatives: mode === "create" ? picks.length : undefined,
          name,
          groupNeeded: showGroup && (groupMode === "existing" || (mode === "create" && !!tpl && tpl.accountId !== target.id)),
          groupChosen: groupMode === "new" || (groupMode === "existing" && !!groupId),
        })
      : { errors: [] as string[], warnings: [] as string[] };

  async function saveTemplate() {
    if (!setup || !target) return;
    const n = prompt("Nome do modelo (ex.: Taboola Desktop US MaxConv):");
    if (!n) return;
    await fetch("/api/campaigns/templates", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: n, platform: target.platform, setup }),
    });
    const m = await fetch(`/api/campaigns/meta?platform=${target.platform}&accountId=${encodeURIComponent(target.id)}`).then((r) => r.json());
    setMeta(m);
  }

  async function run() {
    if (!setup || !target) return;
    setBusy(true);
    setError("");
    setResult(null);
    const group = !showGroup
      ? undefined
      : groupMode === "existing"
        ? { mode: "existing", id: groupId }
        : groupMode === "new"
          ? {
              mode: "new",
              ...newGroup,
              name: groupName,
              marketingObjective: setup.marketingObjective ?? "ONLINE_PURCHASES",
              startDate: setup.startDate,
              endDate: setup.endDate,
            }
          : { mode: "none" };
    const body =
      mode === "create"
        ? { action: "create", platform: target.platform, accountId: target.id, name, setup: { ...setup, groupShared }, group, url, rtCampaign: rt?.title, creatives, activate }
        : mode === "edit"
          ? {
              action: "update",
              accountId: sourceAcc,
              campaignId,
              name,
              setup,
              url,
              rtCampaign: rt?.title,
              creatives,
              itemChanges: items
                .filter(itemChanged)
                .map((i) => ({
                  id: i.id,
                  ...(i.newTitle !== i.title ? { title: i.newTitle } : {}),
                  ...(i.newDesc !== (i.description ?? "") ? { description: i.newDesc } : {}),
                  ...(i.newCta !== (i.cta ?? "") ? { cta: i.newCta } : {}),
                  ...(i.newActive !== i.active ? { active: i.newActive } : {}),
                })),
            }
          : {
              action: "copy",
              source: { accountId: sourceAcc, campaignId },
              activate,
              target: { accountId: target.id },
              name,
              setup,
              group,
              url,
              rtCampaign: rt?.title,
              keepAll: items.length > 0 && items.every((i) => i.keep && i.newTitle === i.title),
              keep: items
                .filter((i) => i.keep && i.thumbnail)
                .map((i) => ({ title: i.newTitle, thumbnail: i.thumbnail, description: i.newDesc, cta: i.newCta })),
              creatives,
            };
    const r = await fetch("/api/campaigns/run", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) })
      .then((r) => r.json())
      .catch(() => ({ error: "Falha na conexão." }));
    setBusy(false);
    if (r.error) return setError(r.error);
    setResult(r);
    onDone();
  }

  const title =
    mode === "create" ? "Nova campanha" : mode === "edit" ? `Editar · ${detail?.name ?? "…"}` : `Duplicar · ${detail?.name ?? "…"}`;
  const loading = !setup || !target || (mode !== "create" && !detail);
  const keptCount = items.filter((i) => i.keep).length;

  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-black/60 backdrop-blur-sm" onClick={onClose}>
      <div className="h-full w-full max-w-5xl overflow-y-auto border-l border-line bg-bg p-6" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0">
            <h2 className="truncate text-lg font-semibold">{title}</h2>
            <p className="text-xs text-muted">Escolha no resumo se a campanha sobe pausada (padrão) ou já ativada.</p>
          </div>
          <button onClick={onClose} className="text-muted hover:text-zinc-100" aria-label="Fechar">
            ✕
          </button>
        </div>
        {loadError && <div className="mt-4 rounded-lg border border-bad/30 bg-bad/5 px-3 py-2 text-sm text-bad">{loadError}</div>}
        {!!meta?.warnings.length && <p className="mt-3 text-xs text-faint">{meta.warnings.join(" · ")}</p>}

        {loading && !loadError ? (
          <div className="card card-pad mt-6 text-sm text-muted">Carregando campanha e conta…</div>
        ) : (
          setup &&
          target && (
            <div className="mt-5 grid gap-4 lg:grid-cols-[1fr_320px]">
              <div className="space-y-4">
                {/* Destination */}
                {mode !== "edit" && (
                  <Section title={mode === "duplicate" ? "Destino da cópia" : "Conta"}>
                    <select id="st-target" className="input" value={targetId} onChange={(e) => setTargetId(e.target.value)}>
                      {accounts.map((a) => (
                        <option key={a.id} value={a.id}>
                          {PLATFORM_LABEL[a.platform]} · {a.label}
                          {mode === "duplicate" && a.id === sourceAcc ? " (mesma conta)" : ""}
                        </option>
                      ))}
                    </select>
                    {mode === "duplicate" && (
                      <p className="mt-2 text-[11px] text-faint">
                        {nativeDuplicate
                          ? "Mesma conta Taboola: usa a duplicação nativa (mantém sites bloqueados e ajustes de lance) com as configurações abaixo."
                          : sourcePlatform && sourcePlatform !== target.platform
                            ? `Outra fonte: o setup foi adaptado de ${PLATFORM_LABEL[sourcePlatform]} para ${PLATFORM_LABEL[target.platform]} e os anúncios escolhidos são recriados lá.`
                            : "Outra conta: cria uma campanha nova com estas configurações e recria os anúncios escolhidos."}
                      </p>
                    )}
                  </Section>
                )}

                {mode === "create" && (
                  <Section title="Campanha modelo (uma que deu bom)">
                    <select
                      id="st-winner"
                      className="input"
                      value={tpl ? `${tpl.accountId}|${tpl.campaignId}` : ""}
                      onChange={(e) => applyTemplate(winners?.find((w) => `${w.accountId}|${w.campaignId}` === e.target.value) ?? null)}
                    >
                      <option value="">{winners === null ? "Carregando campanhas…" : "Sem modelo (do zero)"}</option>
                      {(winners ?? []).map((w) => (
                        <option key={`${w.accountId}|${w.campaignId}`} value={`${w.accountId}|${w.campaignId}`}>
                          {w.name} · lucro {usd(w.profit)} · ROAS {w.roas.toFixed(2)}x · CPA {w.sales ? usd(w.cpa) : "—"} ·{" "}
                          {accounts.find((a) => a.id === w.accountId)?.label ?? w.accountId}
                        </option>
                      ))}
                    </select>
                    {tplLoading && <p className="mt-2 text-xs text-muted">Lendo o setup da campanha…</p>}
                    {tpl && setup && (
                      <div className="mt-3 space-y-2 text-xs">
                        <p className="text-muted">
                          {target.platform === "taboola"
                            ? "A campanha nova copia o setup do modelo (SpendGuard, regras de conversão, brand safety, horário, rastreio e segmentação), sem os anúncios e sem o histórico. Ajuste abaixo o que muda (país, orçamento, datas…)."
                            : "Copia lance, orçamento, pacing, países, horário, rastreio e pixel do modelo. Ajuste abaixo o que muda."}
                        </p>
                        <label className="flex items-center gap-2">
                          <input
                            type="checkbox"
                            checked={setup.inheritBlocks !== false}
                            onChange={(e) => setSetup({ ...setup, inheritBlocks: e.target.checked })}
                          />
                          Levar os sites bloqueados do modelo ({setup.templateInfo?.blockedSites ?? 0})
                        </label>
                        {target.platform === "taboola" && (
                          <label className="flex items-center gap-2">
                            <input
                              type="checkbox"
                              checked={!!setup.inheritBidModifiers}
                              onChange={(e) => setSetup({ ...setup, inheritBidModifiers: e.target.checked })}
                            />
                            Levar os ajustes de lance por site ({setup.templateInfo?.bidModifiers ?? 0}) — só valem para CPC fixo / Smart
                          </label>
                        )}
                        {target.platform === "taboola" && tpl.accountId !== target.id && (
                          <p className="text-warn">Modelo de outra conta: escolha abaixo o grupo de campanhas da conta destino.</p>
                        )}
                      </div>
                    )}
                    {winners && !winners.length && <p className="mt-2 text-[11px] text-faint">Nenhuma campanha com gasto nos últimos 30 dias nesta fonte.</p>}
                  </Section>
                )}

                <Section
                  title="Configurações"
                  right={
                    <div className="flex items-center gap-2">
                      <select
                        id="st-template"
                        className="input w-auto py-1 text-xs"
                        value={templateId}
                        onChange={(e) => {
                          setTemplateId(e.target.value);
                          const t = meta?.templates.find((x) => x.id === e.target.value);
                          if (t) setSetup({ ...DEFAULT_SETUP[target.platform], ...t.setup });
                        }}
                      >
                        <option value="">Modelo salvo…</option>
                        {meta?.templates.map((t) => (
                          <option key={t.id} value={t.id}>
                            {t.name}
                          </option>
                        ))}
                      </select>
                      <button className="text-xs text-info hover:underline" onClick={saveTemplate}>
                        Salvar como modelo
                      </button>
                    </div>
                  }
                >
                  <SetupForm
                    platform={target.platform}
                    setup={setup}
                    onChange={setSetup}
                    showBudget={!(showGroup && groupShared)}
                    conversions={meta?.conversions ?? []}
                    blocklists={meta?.blocklists ?? []}
                    onBlocklists={(b) => meta && setMeta({ ...meta, blocklists: b })}
                  />
                  <label className="mt-4 block">
                    <span className="mb-1.5 block text-xs text-zinc-300">Nome da campanha na fonte</span>
                    <input
                      id="st-name"
                      className="input font-mono text-sm"
                      value={name}
                      onChange={(e) => {
                        setName(e.target.value);
                        setNameEdited(true);
                      }}
                    />
                    <span className="mt-1 flex justify-between text-[11px] text-faint">
                      <span>Padrão: [PRODUTO] [DEVICE] [LANCE] [PAÍS] [DATA]</span>
                      {nameEdited && mode !== "edit" && (
                        <button className="text-info hover:underline" onClick={() => setNameEdited(false)}>
                          usar nome do padrão
                        </button>
                      )}
                    </span>
                  </label>
                </Section>

                {showGroup && meta && (
                  <Section title="Grupo de campanhas (Taboola)">
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
                      <select id="st-group" className="input mt-3" value={groupId} onChange={(e) => setGroupId(e.target.value)}>
                        <option value="">Escolha o grupo…</option>
                        {meta.groups.map((g) => (
                          <option key={g.id} value={g.id}>
                            {g.name} · {g.status.toLowerCase()}
                          </option>
                        ))}
                      </select>
                    )}
                    {groupMode === "existing" && groupInfo && (
                      <p className="mt-2 text-[11px] text-muted">
                        {groupInfo.shared
                          ? `Orçamento do grupo: ${groupInfo.spendingLimitModel === "ENTIRE" ? "total" : "mensal"} US$${groupInfo.spendingLimit}${groupInfo.dailyCap ? ` · até US$${groupInfo.dailyCap}/dia` : ""} · ${groupInfo.distribution === "AUTOMATIC" ? "a Taboola divide entre as campanhas" : "você define por campanha"}. A campanha nova não leva orçamento próprio.`
                          : "Grupo sem orçamento compartilhado: o orçamento fica em cada campanha (configure acima)."}
                        {groupInfo.kpi ? ` Meta do grupo: ${groupInfo.kpi} ${groupInfo.kpiGoal ?? ""}.` : ""}
                      </p>
                    )}
                    {groupMode === "new" && (
                      <div className="mt-3 space-y-3">
                        <div className="grid gap-3 sm:grid-cols-3">
                          <Field label="Nome do grupo" className="sm:col-span-2">
                            <input className="input font-mono text-xs" value={groupName} onChange={(e) => setNewGroup({ ...newGroup, name: e.target.value })} />
                          </Field>
                          <Field label="Meta do grupo (KPI)">
                            <select className="input" value={newGroup.kpi} onChange={(e) => setNewGroup({ ...newGroup, kpi: e.target.value as NewGroupForm["kpi"] })}>
                              <option value="">Sem meta</option>
                              <option value="ROAS">ROAS</option>
                              <option value="CPA">CPA</option>
                            </select>
                          </Field>
                        </div>
                        {newGroup.kpi && (
                          <div className="grid gap-3 sm:grid-cols-3">
                            <Field label={newGroup.kpi === "ROAS" ? "ROAS alvo (ex.: 1.5)" : "CPA alvo (US$)"}>
                              <input
                                className="input"
                                type="number"
                                step="0.01"
                                value={newGroup.kpiGoal || ""}
                                onChange={(e) => setNewGroup({ ...newGroup, kpiGoal: Number(e.target.value) })}
                              />
                            </Field>
                            <Field label={newGroup.kpi === "ROAS" ? "ROAS mínimo aceitável" : "CPA máximo aceitável (US$)"}>
                              <input
                                className="input"
                                type="number"
                                step="0.01"
                                value={newGroup.kpiThreshold || ""}
                                onChange={(e) => setNewGroup({ ...newGroup, kpiThreshold: Number(e.target.value) })}
                              />
                            </Field>
                          </div>
                        )}
                        <div>
                          <span className="mb-1.5 block text-xs text-zinc-300">Orçamento</span>
                          <div className="flex flex-wrap gap-1">
                            <button
                              className={`chip border border-line ${newGroup.budgetMode === "campaign" ? "chip-on" : ""}`}
                              onClick={() => setNewGroup({ ...newGroup, budgetMode: "campaign" })}
                            >
                              Cada campanha tem o seu
                            </button>
                            <button
                              className={`chip border border-line ${newGroup.budgetMode === "group" ? "chip-on" : ""}`}
                              onClick={() => setNewGroup({ ...newGroup, budgetMode: "group" })}
                            >
                              Compartilhado no grupo
                            </button>
                          </div>
                        </div>
                        {newGroup.budgetMode === "group" && (
                          <div className="grid gap-3 sm:grid-cols-3">
                            <Field label="Limite do grupo">
                              <select
                                className="input"
                                value={newGroup.spendingLimitModel}
                                onChange={(e) => setNewGroup({ ...newGroup, spendingLimitModel: e.target.value as "MONTHLY" | "ENTIRE" })}
                              >
                                <option value="MONTHLY">Mensal</option>
                                <option value="ENTIRE">Total</option>
                              </select>
                            </Field>
                            <Field label="Valor do limite (US$)">
                              <input
                                className="input"
                                type="number"
                                value={newGroup.spendingLimit}
                                onChange={(e) => setNewGroup({ ...newGroup, spendingLimit: Number(e.target.value) })}
                              />
                            </Field>
                            <Field label="Máximo por dia (US$)">
                              <input className="input" type="number" value={newGroup.dailyCap} onChange={(e) => setNewGroup({ ...newGroup, dailyCap: Number(e.target.value) })} />
                            </Field>
                            <Field label="Divisão entre as campanhas" className="sm:col-span-3">
                              <select
                                className="input"
                                value={newGroup.distribution}
                                onChange={(e) => setNewGroup({ ...newGroup, distribution: e.target.value as "AUTOMATIC" | "CUSTOM" })}
                              >
                                <option value="AUTOMATIC">Automática (a Taboola manda o dinheiro para a campanha que performa melhor)</option>
                                <option value="CUSTOM">Manual (você define em cada campanha)</option>
                              </select>
                            </Field>
                          </div>
                        )}
                        <p className="text-[11px] text-faint">
                          {newGroup.budgetMode === "group"
                            ? "Com orçamento no grupo, a campanha não leva orçamento próprio. Na divisão automática a Taboola recomenda Maximizar conversões."
                            : "O grupo só organiza (e pode ter meta); o orçamento diário fica em cada campanha, como configurado acima."}
                        </p>
                      </div>
                    )}
                    <p className="mt-2 text-[11px] text-faint">Na Taboola o grupo só é escolhido na criação; depois não dá para trocar.</p>
                  </Section>
                )}

                <Section title="Link (campanha do RedTrack)">
                  <select
                    id="st-rt"
                    className="input"
                    value={rtId}
                    onChange={(e) => {
                      setRtAuto(false);
                      setRtId(e.target.value);
                      const u = meta?.rtCampaigns.find((c) => c.id === e.target.value)?.url;
                      if (u) setUrl(u);
                    }}
                  >
                    <option value="">Escolha a campanha do RedTrack…</option>
                    {meta?.rtCampaigns.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.title}
                        {c.id === suggestedRt?.id ? " (sugerida pelo nome)" : ""}
                      </option>
                    ))}
                  </select>
                  <input
                    id="st-url"
                    className="input mt-2 font-mono text-xs"
                    placeholder="https://… link de rastreio"
                    value={url}
                    onChange={(e) => setUrl(e.target.value)}
                  />
                  {mode !== "create" && detail?.url && url !== detail.url && (
                    <button className="mt-1 text-[11px] text-info hover:underline" onClick={() => setUrl(detail.url)}>
                      usar o link atual dos anúncios
                    </button>
                  )}
                </Section>

                {mode !== "create" && (
                  <Section
                    title={mode === "edit" ? `Anúncios da campanha (${items.length})` : `Anúncios da original (${keptCount} de ${items.length} na cópia)`}
                    right={
                      items.length > 0 && (
                        <div className="flex flex-wrap items-center gap-2 text-[11px]">
                          <button
                            className="text-info hover:underline disabled:opacity-50"
                            disabled={descBusy}
                            onClick={async () => {
                              const need = items.filter((i) => !i.newDesc.trim()).map((i) => i.newTitle);
                              if (!need.length) return;
                              setDescBusy(true);
                              const got = await generateDescriptions(need);
                              setDescBusy(false);
                              setItems((cur) => cur.map((x) => (!x.newDesc.trim() && got[x.newTitle] ? { ...x, newDesc: got[x.newTitle] } : x)));
                            }}
                          >
                            {descBusy ? "Gerando…" : "Gerar descrições que faltam"}
                          </button>
                          {target.platform === "taboola" && (
                            <select
                              aria-label="CTA em todos os anúncios"
                              className="input w-auto py-1 text-[11px]"
                              value=""
                              onChange={(e) => setItems(items.map((x) => ({ ...x, newCta: e.target.value === "-" ? "" : e.target.value })))}
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
                      )
                    }
                  >
                    {items.length === 0 && <p className="text-sm text-muted">A campanha não tem anúncios.</p>}
                    <div className="space-y-2">
                      {items.map((i, idx) => {
                        const set = (patch: Partial<(typeof items)[number]>) => setItems(items.map((x, j) => (j === idx ? { ...x, ...patch } : x)));
                        const max = TITLE_MAX[target.platform] ?? 100;
                        return (
                          <div key={i.id} className={`rounded-lg border p-2 ${mode === "duplicate" && !i.keep ? "border-line opacity-50" : itemChanged(i) ? "border-info/50" : "border-line"}`}>
                            <div className="flex items-start gap-3">
                              {mode === "duplicate" ? (
                                <input type="checkbox" className="mt-2" aria-label="Levar para a cópia" checked={i.keep} onChange={(e) => set({ keep: e.target.checked })} />
                              ) : null}
                              <img src={i.thumbnail} alt="" className="h-14 w-24 shrink-0 rounded object-cover" />
                              <div className="min-w-0 flex-1 space-y-1.5">
                                <div className="flex items-center gap-2">
                                  <input aria-label="Headline" className="input py-1.5 text-xs" value={i.newTitle} maxLength={max} onChange={(e) => set({ newTitle: e.target.value })} />
                                  <span className="w-12 shrink-0 text-right text-[10px] text-faint">
                                    {i.newTitle.length}/{max}
                                  </span>
                                </div>
                                <div className="flex items-start gap-2">
                                  <textarea
                                    aria-label="Descrição"
                                    className="input h-14 py-1.5 text-xs"
                                    maxLength={250}
                                    placeholder="Sem descrição — use “Gerar descrições que faltam”"
                                    value={i.newDesc}
                                    onChange={(e) => set({ newDesc: e.target.value })}
                                  />
                                  <span className="w-12 shrink-0 text-right text-[10px] text-faint">{i.newDesc.length}/250</span>
                                </div>
                                <div className="flex flex-wrap items-center gap-2">
                                  {target.platform === "taboola" && (
                                    <select aria-label="CTA" className="input w-auto py-1 text-[11px]" value={i.newCta} onChange={(e) => set({ newCta: e.target.value })}>
                                      {CTAS.map(([v, l]) => (
                                        <option key={v || "-"} value={v}>
                                          {l}
                                        </option>
                                      ))}
                                    </select>
                                  )}
                                  {mode === "edit" && (
                                    <button className={`chip shrink-0 border border-line ${i.newActive ? "chip-on" : ""}`} onClick={() => set({ newActive: !i.newActive })}>
                                      {i.newActive ? "ativo" : "pausado"}
                                    </button>
                                  )}
                                  <span className="text-[10px] text-faint">{i.status.toLowerCase().replace(/_/g, " ")}</span>
                                </div>
                              </div>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                    {mode === "edit" && items.some(itemChanged) && (
                      <p className="mt-2 text-[11px] text-info">Alterações nos anúncios são enviadas em “Salvar alterações”. Mudar texto manda o anúncio para revisão de novo.</p>
                    )}
                  </Section>
                )}

                <Section title={`${mode === "create" ? "Criativos" : "Criativos novos"} (${picks.length})`}>
                  <CreativePicker platform={target.platform} picks={picks} onChange={setPicks} />
                </Section>
              </div>

              {/* Summary */}
              <div className="lg:sticky lg:top-0 lg:self-start">
                <div className="card card-pad space-y-3 text-sm">
                  <div className="label">Resumo</div>
                  <SummaryRow k="Destino" v={`${PLATFORM_LABEL[target.platform]} · ${target.label}`} />
                  <SummaryRow k="Nome" v={name} mono />
                  {showGroup && (
                    <SummaryRow
                      k="Grupo"
                      v={
                        groupMode === "existing"
                          ? (meta?.groups.find((g) => g.id === groupId)?.name ?? "—")
                          : groupMode === "new"
                            ? `novo: ${buildRtName(setup.product, "taboola", setup.countries[0] ?? "US")}`
                            : "sem grupo"
                      }
                    />
                  )}
                  <SummaryRow k="RedTrack" v={rt?.title ?? (url ? "link manual" : "—")} />
                  {mode === "edit" && (
                    <SummaryRow
                      k="Anúncios alterados"
                      v={String(items.filter(itemChanged).length)}
                    />
                  )}
                  {mode === "duplicate" && <SummaryRow k="Anúncios levados" v={`${keptCount} de ${items.length}`} />}
                  <SummaryRow k="Criativos novos" v={String(picks.length)} />
                  {tpl && <SummaryRow k="Modelo" v={tpl.name} mono />}
                  {(check.errors.length > 0 || check.warnings.length > 0) && (
                    <ul className="space-y-1 rounded-lg border border-line px-3 py-2 text-xs">
                      {check.errors.map((x) => (
                        <li key={x} className="text-bad">
                          • {x}
                        </li>
                      ))}
                      {check.warnings.map((x) => (
                        <li key={x} className="text-warn">
                          • {x}
                        </li>
                      ))}
                    </ul>
                  )}
                  {error && <div className="rounded-lg border border-bad/30 bg-bad/5 px-3 py-2 text-xs text-bad">{error}</div>}
                  {mode !== "edit" && (
                    <div>
                      <div className="mb-1.5 text-xs text-faint">Subir a campanha</div>
                      <div className="grid grid-cols-2 gap-1">
                        <button className={`chip justify-center border border-line ${!activate ? "chip-on" : ""}`} onClick={() => setActivate(false)}>
                          Pausada
                        </button>
                        <button className={`chip justify-center border border-line ${activate ? "chip-on" : ""}`} onClick={() => setActivate(true)}>
                          Ativada
                        </button>
                      </div>
                      {activate && (
                        <p className="mt-1.5 text-[11px] text-warn">
                          Começa a gastar assim que a fonte aprovar os anúncios. Confira orçamento, link e país.
                        </p>
                      )}
                    </div>
                  )}
                  <button className="btn-primary w-full justify-center" disabled={busy || !name.trim() || check.errors.length > 0} onClick={run}>
                    {busy
                      ? "Enviando… (até 1 min por anúncio)"
                      : mode === "create"
                        ? activate
                          ? "Criar e ativar campanha"
                          : "Criar campanha pausada"
                        : mode === "edit"
                          ? "Salvar alterações"
                          : activate
                            ? "Criar cópia ativada"
                            : "Criar cópia pausada"}
                  </button>
                  {result && (
                    <ul className={`space-y-1 rounded-lg border px-3 py-2 text-xs ${result.ok ? "border-accent/30 text-accent" : "border-bad/30 text-bad"}`}>
                      {result.steps.map((s, i) => (
                        <li key={i} className={/Falhou|Erro|não enviados/.test(s) ? "text-bad" : ""}>
                          {s}
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              </div>
            </div>
          )
        )}
      </div>
    </div>
  );
}
