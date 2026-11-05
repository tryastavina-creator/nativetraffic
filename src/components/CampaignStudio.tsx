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
import { buildRtName, buildSourceName, parseRtName } from "@/lib/naming";
import { translateSetup } from "@/lib/setupTranslate";
import type { CampaignSetup, CampaignTemplate } from "@/lib/store";
import {
  BID_LABEL,
  CreativePicker,
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
type Meta = { campaigns: unknown[]; groups: Group[]; rtCampaigns: RtCampaign[]; templates: CampaignTemplate[]; warnings: string[] };
type Item = { id: string; title: string; thumbnail: string; url: string; active: boolean; status: string };
type Detail = { platform: Platform; campaignId: string; name: string; setup: CampaignSetup; groupId?: string; items: Item[]; url: string; accountId: string };

export type StudioMode = "create" | "edit" | "duplicate";

const deviceLabel = (d: string[]) => (d.length === 1 ? d[0] : "ALL");
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
  const [items, setItems] = useState<(Item & { keep: boolean; newTitle: string; newActive: boolean })[]>([]);
  const [groupMode, setGroupMode] = useState<"existing" | "new" | "none">("existing");
  const [groupId, setGroupId] = useState("");
  const [groupLimit, setGroupLimit] = useState({ spendingLimitModel: "MONTHLY", spendingLimit: 5000 });
  const [rtId, setRtId] = useState("");
  const [url, setUrl] = useState("");
  const [picks, setPicks] = useState<Pick[]>([]);
  const [templateId, setTemplateId] = useState("");
  const [busy, setBusy] = useState(false);
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
        setItems(j.items.map((i: Item) => ({ ...i, keep: i.active || j.items.length <= 6, newTitle: i.title, newActive: i.active })));
        setUrl(j.url);
        if (mode === "edit") setName(j.name);
      })
      .catch((e: Error) => setLoadError(e.message));
  }, [mode, sourceAccountId, campaignId]);

  const target = accounts.find((a) => a.id === targetId);
  const sourcePlatform = detail?.platform;
  const sameAccount = mode === "duplicate" && targetId === sourceAccountId;
  const nativeDuplicate = sameAccount && target?.platform === "taboola";

  // Meta of the target account (groups, RedTrack campaigns, templates)
  useEffect(() => {
    if (!target) return;
    setMeta(null);
    fetch(`/api/campaigns/meta?platform=${target.platform}&accountId=${encodeURIComponent(target.id)}`)
      .then((r) => r.json())
      .then((m: Meta) => {
        setMeta(m);
        setGroupMode(m.groups.length ? "existing" : "new");
        setGroupId((g) => g || m.groups[0]?.id || "");
      });
  }, [target]);

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
  useEffect(() => {
    if (!rtId && suggestedRt) {
      setRtId(suggestedRt.id);
      if (!url) setUrl(suggestedRt.url);
    }
  }, [suggestedRt, rtId, url]);

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
    p.kind === "variant" ? { kind: "variant", variantId: p.variantId, headline: p.headline } : { kind: "ad", imageUrl: p.imageUrl, headline: p.headline },
  );
  const showGroup = target?.platform === "taboola" && (mode === "create" || (mode === "duplicate" && !nativeDuplicate));

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
          ? { mode: "new", name: buildRtName(setup.product, "taboola", setup.countries[0] ?? "US"), marketingObjective: setup.marketingObjective ?? "ONLINE_PURCHASES", ...groupLimit }
          : { mode: "none" };
    const body =
      mode === "create"
        ? { action: "create", platform: target.platform, accountId: target.id, name, setup, group, url, rtCampaign: rt?.title, creatives }
        : mode === "edit"
          ? {
              action: "update",
              accountId: sourceAccountId,
              campaignId,
              name,
              setup,
              url,
              rtCampaign: rt?.title,
              creatives,
              itemChanges: items
                .filter((i) => i.newTitle !== i.title || i.newActive !== i.active)
                .map((i) => ({
                  id: i.id,
                  ...(i.newTitle !== i.title ? { title: i.newTitle } : {}),
                  ...(i.newActive !== i.active ? { active: i.newActive } : {}),
                })),
            }
          : {
              action: "copy",
              source: { accountId: sourceAccountId, campaignId },
              target: { accountId: target.id },
              name,
              setup,
              group,
              url,
              rtCampaign: rt?.title,
              keepAll: items.length > 0 && items.every((i) => i.keep && i.newTitle === i.title),
              keep: items.filter((i) => i.keep && i.thumbnail).map((i) => ({ title: i.newTitle, thumbnail: i.thumbnail })),
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
            <p className="text-xs text-muted">Tudo que for criado sobe pausado. Revise na fonte e ative quando estiver pronto.</p>
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
                          {mode === "duplicate" && a.id === sourceAccountId ? " (mesma conta)" : ""}
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
                  <SetupForm platform={target.platform} setup={setup} onChange={setSetup} showBudget />
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
                          <input className="input" readOnly value={buildRtName(setup.product, "taboola", setup.countries[0] ?? "US")} />
                        </Field>
                        <Field label="Orçamento do grupo">
                          <select
                            className="input"
                            value={groupLimit.spendingLimitModel}
                            onChange={(e) => setGroupLimit({ ...groupLimit, spendingLimitModel: e.target.value })}
                          >
                            <option value="MONTHLY">Mensal</option>
                            <option value="ENTIRE">Total</option>
                            <option value="NONE">Sem limite</option>
                          </select>
                        </Field>
                        <Field label="Limite (US$)">
                          <input
                            className="input"
                            type="number"
                            value={groupLimit.spendingLimit}
                            onChange={(e) => setGroupLimit({ ...groupLimit, spendingLimit: Number(e.target.value) })}
                          />
                        </Field>
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
                  <Section title={mode === "edit" ? `Anúncios da campanha (${items.length})` : `Anúncios da original (${keptCount} de ${items.length} na cópia)`}>
                    {items.length === 0 && <p className="text-sm text-muted">A campanha não tem anúncios.</p>}
                    <div className="space-y-2">
                      {items.map((i, idx) => (
                        <div key={i.id} className={`flex items-center gap-3 rounded-lg border p-2 ${mode === "duplicate" && !i.keep ? "border-line opacity-50" : "border-line"}`}>
                          {mode === "duplicate" ? (
                            <input
                              type="checkbox"
                              aria-label="Levar para a cópia"
                              checked={i.keep}
                              onChange={(e) => setItems(items.map((x, j) => (j === idx ? { ...x, keep: e.target.checked } : x)))}
                            />
                          ) : null}
                          <img src={i.thumbnail} alt="" className="h-10 w-16 shrink-0 rounded object-cover" />
                          <input
                            aria-label="Headline"
                            className="input py-1.5 text-xs"
                            value={i.newTitle}
                            maxLength={target.platform === "revcontent" ? 80 : 100}
                            onChange={(e) => setItems(items.map((x, j) => (j === idx ? { ...x, newTitle: e.target.value } : x)))}
                          />
                          {mode === "edit" && (
                            <button
                              className={`chip shrink-0 border border-line ${i.newActive ? "chip-on" : ""}`}
                              onClick={() => setItems(items.map((x, j) => (j === idx ? { ...x, newActive: !x.newActive } : x)))}
                            >
                              {i.newActive ? "ativo" : "pausado"}
                            </button>
                          )}
                          <span className="hidden w-20 shrink-0 text-right text-[10px] text-faint sm:block">{i.status.toLowerCase()}</span>
                        </div>
                      ))}
                    </div>
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
                      v={String(items.filter((i) => i.newTitle !== i.title || i.newActive !== i.active).length)}
                    />
                  )}
                  {mode === "duplicate" && <SummaryRow k="Anúncios levados" v={`${keptCount} de ${items.length}`} />}
                  <SummaryRow k="Criativos novos" v={String(picks.length)} />
                  {error && <div className="rounded-lg border border-bad/30 bg-bad/5 px-3 py-2 text-xs text-bad">{error}</div>}
                  <button className="btn-primary w-full justify-center" disabled={busy || !name.trim()} onClick={run}>
                    {busy
                      ? "Enviando… (até 1 min por anúncio)"
                      : mode === "create"
                        ? "Criar campanha pausada"
                        : mode === "edit"
                          ? "Salvar alterações"
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
