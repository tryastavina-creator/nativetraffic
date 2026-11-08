"use client";
import { useEffect, useMemo, useState } from "react";
import { PLATFORM_COLOR, int, money } from "@/components/format";
import { CampaignHistory } from "@/components/campaignParts";
import { CampaignStudio, type StudioMode } from "@/components/CampaignStudio";
import type { CampaignLogEntry } from "@/lib/store";
import type { Perf, TrafficTree, TreeAccount, TreeCampaign, TreePlatform } from "@/lib/trafficTree";

const PRESETS = [
  ["today", "Hoje"],
  ["yesterday", "Ontem"],
  ["7d", "7D"],
  ["14d", "14D"],
  ["30d", "30D"],
  ["month", "Mês"],
  ["custom", "Personalizado"],
] as const;

type ColId = "accounts" | "budget" | "spend" | "revenue" | "sales" | "cpa" | "profit" | "roas" | "ic";
const COLS: { id: ColId; group: string; label: string; w: string }[] = [
  { id: "accounts", group: "", label: "Contas", w: "w-16" },
  { id: "budget", group: "Investimento", label: "Orçamento/dia", w: "w-32" },
  { id: "spend", group: "Investimento", label: "Gasto", w: "w-24" },
  { id: "revenue", group: "Resultado", label: "Receita", w: "w-24" },
  { id: "sales", group: "Conversões", label: "Vendas", w: "w-20" },
  { id: "cpa", group: "Eficiência", label: "CPA", w: "w-24" },
  { id: "profit", group: "Resultado", label: "Lucro real", w: "w-24" },
  { id: "roas", group: "Eficiência", label: "ROAS", w: "w-20" },
  { id: "ic", group: "Conversões", label: "Checkouts", w: "w-20" },
];

const STATUS: Record<string, [string, string]> = {
  RUNNING: ["Ativa", "text-accent"],
  ACTIVE: ["Ativa", "text-accent"],
  PAUSED: ["Pausada", "text-muted"],
  INACTIVE: ["Pausada", "text-muted"],
  PENDING_APPROVAL: ["Em aprovação", "text-warn"],
  PENDING: ["Em aprovação", "text-warn"],
  PENDING_START_DATE: ["Agendada", "text-info"],
  DEPLETED: ["Orçamento esgotado", "text-warn"],
  DEPLETED_MONTHLY: ["Limite do mês atingido", "text-warn"],
  REJECTED: ["Reprovada", "text-bad"],
  EXPIRED: ["Encerrada", "text-muted"],
  TERMINATED: ["Encerrada", "text-muted"],
  FROZEN: ["Congelada", "text-bad"],
};
const statusOf = (c: TreeCampaign): [string, string] =>
  STATUS[c.status.toUpperCase()] ?? (c.active === false ? ["Pausada", "text-muted"] : c.active ? ["Ativa", "text-accent"] : [c.status || "—", "text-muted"]);

const daysAgo = (n: number) => {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return d.toISOString().slice(0, 10);
};
const load = <T,>(k: string, fallback: T): T => {
  try {
    const v = localStorage.getItem(k);
    return v ? (JSON.parse(v) as T) : fallback;
  } catch {
    return fallback;
  }
};
const save = (k: string, v: unknown) => {
  try {
    localStorage.setItem(k, JSON.stringify(v));
  } catch {}
};

export default function Trafego() {
  const [preset, setPreset] = useState("today");
  const [from, setFrom] = useState(daysAgo(6));
  const [to, setTo] = useState(daysAgo(0));
  const [applied, setApplied] = useState(0);
  const [reload, setReload] = useState(0);
  const [data, setData] = useState<TrafficTree | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState<Set<string>>(new Set());
  const [hidden, setHidden] = useState<ColId[]>([]);
  const [showCols, setShowCols] = useState(false);
  const [studio, setStudio] = useState<{ mode: StudioMode; accountId?: string; campaignId?: string } | null>(null);
  const [history, setHistory] = useState<CampaignLogEntry[] | null>(null);
  const [toast, setToast] = useState("");
  const [showExcluded, setShowExcluded] = useState(false);

  useEffect(() => {
    setPreset(load("nt_traffic_preset", "today"));
    setHidden(load<ColId[]>("nt_traffic_hidden", []));
    const o = load<string[] | null>("nt_traffic_open", null);
    if (o) setOpen(new Set(o));
  }, []);

  useEffect(() => {
    const q = new URLSearchParams({ preset, view: "tree" });
    if (preset === "custom") {
      q.set("from", from);
      q.set("to", to);
    }
    let live = true;
    setLoading(true);
    setError("");
    // Last numbers of this period show at once; the fresh ones replace them when they arrive.
    const memo = `nt_tree_${preset}`;
    if (preset !== "custom") {
      const last = load<TrafficTree | null>(memo, null);
      if (last?.platforms) setData(last);
    }
    fetch(`/api/traffic?${q}`)
      .then(async (r) => {
        const j = await r.json();
        if (!r.ok) throw new Error(j.error ?? "Erro ao carregar");
        if (!live) return;
        setData(j);
        if (preset !== "custom") save(memo, j);
        // First visit: open the sources, and the accounts of sources with few accounts.
        setOpen((cur) => {
          if (cur.size || load<string[] | null>("nt_traffic_open", null)) return cur;
          const next = new Set<string>();
          for (const p of (j as TrafficTree).platforms) {
            next.add(`p:${p.platform}`);
            if (p.accounts.length <= 2) p.accounts.forEach((a) => next.add(`a:${a.id}`));
          }
          return next;
        });
      })
      .catch((e: Error) => live && setError(e.message))
      .finally(() => live && setLoading(false));
    return () => {
      live = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [preset, applied, reload]);

  const toggleOpen = (k: string) =>
    setOpen((cur) => {
      const n = new Set(cur);
      if (n.has(k)) n.delete(k);
      else n.add(k);
      save("nt_traffic_open", [...n]);
      return n;
    });
  const rangeQuery = new URLSearchParams(preset === "custom" ? { preset, from, to } : { preset }).toString();
  const cols = COLS.filter((c) => !hidden.includes(c.id) && (c.id !== "ic" || data?.icConfigured));
  const cur = data?.currency ?? "USD";
  const days = data?.days ?? 1;
  const t = data?.totals;

  const openHistory = () =>
    fetch("/api/campaigns/meta")
      .then((r) => r.json())
      .then((d) => setHistory(d.log ?? []));

  async function setActive(c: TreeCampaign, active: boolean) {
    if (!data) return;
    const patch = (fn: (x: TreeCampaign) => TreeCampaign) =>
      setData((d) =>
        d && {
          ...d,
          platforms: d.platforms.map((p) => ({ ...p, accounts: p.accounts.map((a) => ({ ...a, campaigns: a.campaigns.map((x) => (x.key === c.key ? fn(x) : x)) })) })),
        },
      );
    patch((x) => ({ ...x, active, status: active ? "RUNNING" : "PAUSED" }));
    const r = await fetch("/api/campaigns/status", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ accountId: c.accountId, campaignId: c.id, active }),
    })
      .then((x) => x.json())
      .catch(() => ({ error: "Falha na conexão." }));
    if (r.error) {
      patch((x) => ({ ...x, active: c.active, status: c.status }));
      setToast(r.error);
    } else setToast(`${c.name}: ${active ? "ativada" : "pausada"}`);
    setTimeout(() => setToast(""), 4000);
  }

  async function exclude(keys: string[], excludeIt: boolean, label = "", platform = "") {
    await fetch("/api/traffic/exclude", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ keys, exclude: excludeIt, label, platform }),
    });
    setReload((n) => n + 1);
  }
  async function link(source: string, target: string | null) {
    await fetch("/api/traffic/link", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ source, target }) });
    setReload((n) => n + 1);
  }

  return (
    <div className="mx-auto max-w-[1500px]">
      <header className="flex flex-col gap-4 xl:flex-row xl:items-end xl:justify-between">
        <div>
          <div className="flex flex-wrap items-center gap-3">
            <h1 className="text-2xl font-semibold tracking-tight">Tráfego</h1>
            <button className="btn-primary py-1.5 text-xs" onClick={() => setStudio({ mode: "create" })}>
              + Criar campanha
            </button>
            <button className="btn-ghost py-1.5 text-xs" onClick={openHistory}>
              Histórico
            </button>
          </div>
          <p className="mt-1 text-sm text-muted">Gasto das APIs das fontes, vendas e receita da Shopify, custos reais (Wiio, taxas, reembolsos).</p>
        </div>
        <div className="flex flex-col gap-2 xl:items-end">
          <div className="flex flex-wrap gap-1 rounded-lg border border-line bg-panel p-1">
            {PRESETS.map(([id, label]) => (
              <button
                key={id}
                onClick={() => {
                  setPreset(id);
                  save("nt_traffic_preset", id);
                }}
                className={`chip ${preset === id ? "chip-on" : ""}`}
              >
                {label}
              </button>
            ))}
          </div>
          {preset === "custom" && (
            <div className="flex items-center gap-1.5 text-xs">
              <input type="date" className="input w-auto py-1.5" value={from} max={to} onChange={(e) => setFrom(e.target.value)} />
              <span className="text-faint">até</span>
              <input type="date" className="input w-auto py-1.5" value={to} min={from} onChange={(e) => setTo(e.target.value)} />
              <button className="btn-primary py-1.5" onClick={() => setApplied((n) => n + 1)}>
                Aplicar
              </button>
            </div>
          )}
        </div>
      </header>

      {error && <p className="mt-4 text-sm text-warn">{error}</p>}
      {!!data?.warnings.length && <p className="mt-3 text-xs text-faint">{data.warnings.join(" · ")}</p>}

      <div className={`transition-opacity ${loading ? "opacity-50" : ""}`}>
        <div className="mt-5 grid grid-cols-2 gap-3 md:grid-cols-5">
          <Kpi label="Investimento" value={t ? money(t.spend, cur) : "—"} />
          <Kpi label="Receita" value={t ? money(t.revenue, cur) : "—"} tone="good" />
          <Kpi label="Lucro real" value={t ? money(t.profit, cur) : "—"} tone={t && t.profit < 0 ? "bad" : "good"} />
          <Kpi label="ROAS" value={t && t.spend ? `${t.roas.toFixed(2)}x` : "—"} />
          <Kpi label="CPA real" value={t && t.sales ? money(t.cpa, cur, 2) : "—"} hint={t ? `${int(t.sales)} vendas` : ""} />
        </div>

        <div className="relative mt-5 flex items-center justify-end gap-2">
          <button className="btn-ghost py-1 text-xs" onClick={() => setShowCols((v) => !v)}>
            Colunas
          </button>
          {showCols && (
            <div className="absolute right-0 top-9 z-20 w-56 rounded-xl border border-line bg-panel p-3 shadow-xl">
              {COLS.map((c) => (
                <label key={c.id} className="flex items-center gap-2 py-1 text-xs">
                  <input
                    type="checkbox"
                    checked={!hidden.includes(c.id)}
                    onChange={() => {
                      const h = hidden.includes(c.id) ? hidden.filter((x) => x !== c.id) : [...hidden, c.id];
                      setHidden(h);
                      save("nt_traffic_hidden", h);
                    }}
                  />
                  {c.label}
                </label>
              ))}
            </div>
          )}
        </div>

        <div className="card mt-2 overflow-x-auto">
          <table className="w-full text-sm" style={{ minWidth: 340 + cols.length * 92 }}>
            <thead>
              <tr className="text-[10px] uppercase tracking-wider text-faint">
                <th className="px-4 pt-3 text-left font-medium">Fonte</th>
                {cols.map((c) => (
                  <th key={c.id} className="whitespace-nowrap px-2.5 pt-3 text-right font-medium">
                    {c.group}
                  </th>
                ))}
              </tr>
              <tr className="border-b border-line text-[11px] text-muted">
                <th className="px-4 pb-2 text-left font-normal">Fonte · conta · campanha</th>
                {cols.map((c) => (
                  <th key={c.id} className="whitespace-nowrap px-2.5 pb-2 text-right font-normal">
                    {c.label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {data?.platforms.map((p) => (
                <PlatformRows
                  key={p.platform}
                  p={p}
                  cols={cols}
                  cur={cur}
                  days={days}
                  open={open}
                  toggle={toggleOpen}
                  targets={data.linkTargets}
                  rangeQuery={rangeQuery}
                  onActive={setActive}
                  onStudio={(mode, c) => setStudio({ mode, accountId: c.accountId, campaignId: c.id })}
                  onExclude={(c) => exclude(c.excludeKeys, true, c.name, c.platform)}
                  onLink={link}
                />
              ))}
              {data && !data.platforms.length && (
                <tr>
                  <td colSpan={cols.length + 1} className="py-10 text-center text-muted">
                    Nenhuma campanha com gasto ou ativa no período.
                  </td>
                </tr>
              )}
              {t && (
                <tr className="border-t border-line bg-white/[0.02] font-medium">
                  <td className="px-4 py-3">
                    TOTAL <span className="ml-1 text-[11px] font-normal text-faint">{t.campaigns} campanhas</span>
                  </td>
                  <Cells x={t} cols={cols} cur={cur} days={days} count={data?.platforms.reduce((a, p) => a + p.accounts.length, 0)} />
                </tr>
              )}
            </tbody>
          </table>
        </div>
        <p className="mt-2 text-[11px] text-faint">
          Lucro real = receita − custo do produto e frete (Wiio) − taxas − reembolsos − gasto. Só campanhas das APIs das fontes.
          {data?.icConfigured ? " Checkouts = InitiateCheckout do RedTrack." : ""}
          {data?.supplier?.lastUploadAt ? (
            <a href="/settings" className="ml-1 hover:text-zinc-200">
              Custos Wiio exatos até {data.supplier.coveredTo ? data.supplier.coveredTo.split("-").reverse().slice(0, 2).join("/") : "—"} (depois, média
              aprendida).
            </a>
          ) : (
            <a href="/settings" className="ml-1 text-warn hover:text-zinc-200">
              Envie a planilha da Wiio para o custo exato.
            </a>
          )}
        </p>

        {!!data?.excluded.length && (
          <div className="card mt-4 px-4 py-3 text-sm">
            <button className="flex w-full items-center justify-between text-left" onClick={() => setShowExcluded((v) => !v)}>
              <span>
                <span className="text-zinc-200">Campanhas ignoradas ({data.excluded.length})</span>
                <span className="ml-2 text-[12px] text-muted">
                  {money(
                    data.excluded.reduce((a, e) => a + e.spend, 0),
                    cur,
                  )}{" "}
                  fora de todos os números
                </span>
              </span>
              <span className="text-muted">{showExcluded ? "▲" : "▼"}</span>
            </button>
            {showExcluded && (
              <ul className="mt-3 divide-y divide-line">
                {data.excluded.map((e) => (
                  <li key={e.key} className="flex items-center justify-between gap-3 py-2">
                    <span className="truncate">{e.label}</span>
                    <button className="shrink-0 rounded-md border border-line px-2 py-0.5 text-[11px] text-muted hover:text-zinc-100" onClick={() => exclude([e.key], false)}>
                      Voltar a contar
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}
      </div>

      {toast && <div className="fixed bottom-6 right-6 z-50 rounded-lg border border-line bg-panel px-4 py-2 text-sm shadow-xl">{toast}</div>}

      {studio && (
        <CampaignStudio
          mode={studio.mode}
          accountId={studio.accountId}
          campaignId={studio.campaignId}
          onClose={() => setStudio(null)}
          onDone={() => setReload((n) => n + 1)}
        />
      )}
      {history && (
        <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/60 p-6 backdrop-blur-sm" onClick={() => setHistory(null)}>
          <div className="w-full max-w-5xl" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between">
              <h2 className="font-semibold">Histórico de campanhas criadas pelo CRM</h2>
              <button className="text-muted hover:text-zinc-100" onClick={() => setHistory(null)} aria-label="Fechar">
                ✕
              </button>
            </div>
            <CampaignHistory
              log={history}
              onOpen={(accountId, campaignId) => {
                setHistory(null);
                setStudio({ mode: "edit", accountId, campaignId });
              }}
              onChanged={() => openHistory()}
            />
          </div>
        </div>
      )}
    </div>
  );
}

function Kpi({ label, value, tone, hint }: { label: string; value: string; tone?: "good" | "bad"; hint?: string }) {
  const c = tone === "good" ? "text-accent" : tone === "bad" ? "text-bad" : "text-zinc-100";
  return (
    <div className="card card-pad">
      <div className="label">{label}</div>
      <div className={`mt-1 text-2xl font-semibold tabular-nums ${c}`}>{value}</div>
      {hint && <div className="mt-0.5 text-[11px] text-faint">{hint}</div>}
    </div>
  );
}

function RoasPill({ v, spend }: { v: number; spend: number }) {
  if (!spend) return <span className="text-faint">—</span>;
  const cls = v >= 2 ? "bg-accent/90 text-black" : v >= 1.4 ? "bg-accent/25 text-accent" : v >= 1 ? "bg-warn/25 text-warn" : "bg-bad/25 text-bad";
  return <span className={`inline-block min-w-[48px] rounded-full px-2 py-0.5 text-center text-xs font-semibold tabular-nums ${cls}`}>{v.toFixed(2)}</span>;
}

function Budget({
  budget,
  spend,
  days,
  cur,
  onEdit,
  caption,
}: {
  budget: number;
  spend: number;
  days: number;
  cur: string;
  /** Campaign rows: edit the daily budget in place. */
  onEdit?: (daily: number) => Promise<string | null>;
  /** Small caption under the value (e.g. the shared group's name). */
  caption?: string;
}) {
  const [editing, setEditing] = useState(false);
  const [val, setVal] = useState(String(budget || ""));
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  if (onEdit && editing)
    return (
      <div className="ml-auto flex w-32 flex-col items-end gap-1">
        <div className="flex items-center gap-1">
          <span className="text-faint">$</span>
          <input
            autoFocus
            type="number"
            min={1}
            className="input w-20 py-0.5 text-right text-xs"
            value={val}
            onChange={(e) => setVal(e.target.value)}
            onKeyDown={async (e) => {
              if (e.key === "Escape") setEditing(false);
              if (e.key !== "Enter") return;
              setBusy(true);
              const r = await onEdit(Number(val));
              setBusy(false);
              if (r) setErr(r);
              else setEditing(false);
            }}
          />
        </div>
        <div className="flex gap-2 text-[10px]">
          <button
            className="text-accent disabled:opacity-50"
            disabled={busy}
            onClick={async () => {
              setBusy(true);
              const r = await onEdit(Number(val));
              setBusy(false);
              if (r) setErr(r);
              else setEditing(false);
            }}
          >
            {busy ? "salvando…" : "salvar"}
          </button>
          <button className="text-muted" onClick={() => setEditing(false)}>
            cancelar
          </button>
        </div>
        {err && <div className="max-w-[160px] text-right text-[10px] text-bad">{err}</div>}
      </div>
    );
  const edit = onEdit && (
    <button
      className="ml-1 rounded border border-line px-1 text-[10px] text-muted hover:border-info hover:text-info"
      title="Editar orçamento diário"
      onClick={() => {
        setVal(String(budget || ""));
        setErr("");
        setEditing(true);
      }}
    >
      ✎
    </button>
  );
  if (!budget)
    return (
      <span className="text-faint">
        —{edit}
        {caption && <span className="block text-[10px]">{caption}</span>}
      </span>
    );
  const pct = Math.min(100, (spend / (budget * days)) * 100);
  return (
    <div className="ml-auto w-24 text-right">
      <div className="tabular-nums text-info">
        {money(budget, cur)}
        {edit}
      </div>
      <div className="mt-1 h-1 rounded-full bg-white/10">
        <div className={`h-1 rounded-full ${pct >= 90 ? "bg-warn" : "bg-accent"}`} style={{ width: `${pct}%` }} />
      </div>
      <div className="text-[10px] text-faint">
        {pct.toFixed(0)}% usado{caption ? ` · ${caption}` : ""}
      </div>
    </div>
  );
}

function Cells({
  x,
  cols,
  cur,
  days,
  count,
  small,
  onBudget,
  budgetCaption,
}: {
  x: Perf;
  cols: { id: ColId }[];
  cur: string;
  days: number;
  count?: number;
  small?: boolean;
  onBudget?: (daily: number) => Promise<string | null>;
  budgetCaption?: string;
}) {
  const cell = "px-2.5 py-2.5 text-right tabular-nums whitespace-nowrap" + (small ? " text-[13px]" : "");
  return (
    <>
      {cols.map((c) => {
        switch (c.id) {
          case "accounts":
            return (
              <td key={c.id} className={`${cell} text-muted`}>
                {count ?? "–"}
              </td>
            );
          case "budget":
            return (
              <td key={c.id} className={cell}>
                <Budget budget={x.budget} spend={x.spend} days={days} cur={cur} onEdit={onBudget} caption={budgetCaption} />
              </td>
            );
          case "spend":
            return (
              <td key={c.id} className={cell}>
                {money(x.spend, cur)}
              </td>
            );
          case "revenue":
            return (
              <td key={c.id} className={`${cell} text-accent`}>
                {money(x.revenue, cur)}
              </td>
            );
          case "sales":
            return (
              <td key={c.id} className={`${cell} text-info`}>
                {int(x.sales)}
                {x.upsells > 0 && <span className="text-[10px] text-faint"> +{int(x.upsells)}</span>}
              </td>
            );
          case "cpa":
            return (
              <td key={c.id} className={`${cell} text-info`}>
                {x.sales ? money(x.cpa, cur, 2) : "—"}
              </td>
            );
          case "profit":
            return (
              <td key={c.id} className={`${cell} ${x.profit < 0 ? "text-bad" : x.profit > 0 ? "text-accent" : "text-muted"}`}>
                {money(x.profit, cur)}
              </td>
            );
          case "roas":
            return (
              <td key={c.id} className={cell}>
                <RoasPill v={x.roas} spend={x.spend} />
              </td>
            );
          case "ic":
            return (
              <td key={c.id} className={`${cell} text-info`}>
                {x.ic === null ? "—" : int(x.ic)}
              </td>
            );
        }
      })}
    </>
  );
}

function PlatformRows({
  p,
  cols,
  cur,
  days,
  open,
  toggle,
  targets,
  onActive,
  onStudio,
  onExclude,
  onLink,
  rangeQuery,
}: {
  rangeQuery: string;
  p: TreePlatform;
  cols: { id: ColId }[];
  cur: string;
  days: number;
  open: Set<string>;
  toggle: (k: string) => void;
  targets: { key: string; name: string; platform: string }[];
  onActive: (c: TreeCampaign, active: boolean) => void;
  onStudio: (mode: StudioMode, c: TreeCampaign) => void;
  onExclude: (c: TreeCampaign) => void;
  onLink: (source: string, target: string | null) => void;
}) {
  const pk = `p:${p.platform}`;
  const isOpen = open.has(pk);
  const running = p.accounts.some((a) => a.campaigns.some((c) => c.active));
  return (
    <>
      <tr className="cursor-pointer border-b border-line hover:bg-white/[0.02]" onClick={() => toggle(pk)}>
        <td className="px-4 py-3">
          <div className="flex items-center gap-3">
            <span className="w-3 text-muted">{isOpen ? "▾" : "▸"}</span>
            <span
              className="flex h-7 w-7 items-center justify-center rounded-md text-[11px] font-bold text-black"
              style={{ background: PLATFORM_COLOR[p.platform] ?? "#888" }}
            >
              {p.label.slice(0, 1)}
            </span>
            <span className="font-semibold">{p.label}</span>
            <span className={`h-1.5 w-1.5 rounded-full ${running ? "bg-accent" : "bg-zinc-600"}`} title={running ? "Com campanhas ativas" : "Nada ativo"} />
          </div>
        </td>
        <Cells x={p} cols={cols} cur={cur} days={days} count={p.accounts.length} />
      </tr>
      {isOpen && (
        <tr>
          <td colSpan={cols.length + 1} className="px-4 pb-1 pt-2 text-[10px] uppercase tracking-wider text-faint">
            <span className="pl-7">Contas · {p.label}</span> <span className="ml-1">{p.accounts.length}</span>
          </td>
        </tr>
      )}
      {isOpen &&
        p.accounts.map((a) => (
          <AccountRows
            key={a.id}
            a={a}
            cols={cols}
            cur={cur}
            days={days}
            open={open}
            toggle={toggle}
            targets={targets.filter((t) => t.platform === p.platform)}
            onActive={onActive}
            onStudio={onStudio}
            onExclude={onExclude}
            onLink={onLink}
            rangeQuery={rangeQuery}
          />
        ))}
    </>
  );
}

function AccountRows({
  a,
  cols,
  cur,
  days,
  open,
  toggle,
  targets,
  onActive,
  onStudio,
  onExclude,
  onLink,
  rangeQuery,
}: {
  rangeQuery: string;
  a: TreeAccount;
  cols: { id: ColId }[];
  cur: string;
  days: number;
  open: Set<string>;
  toggle: (k: string) => void;
  targets: { key: string; name: string }[];
  onActive: (c: TreeCampaign, active: boolean) => void;
  onStudio: (mode: StudioMode, c: TreeCampaign) => void;
  onExclude: (c: TreeCampaign) => void;
  onLink: (source: string, target: string | null) => void;
}) {
  const ak = `a:${a.id}`;
  const isOpen = open.has(ak);
  const active = a.campaigns.filter((c) => c.active).length;
  return (
    <>
      <tr className="cursor-pointer border-b border-line/60 hover:bg-white/[0.02]" onClick={() => toggle(ak)}>
        <td className="py-2.5 pl-9 pr-3">
          <div className="flex items-center gap-2">
            <span className="w-3 text-muted">{isOpen ? "▾" : "▸"}</span>
            <span className={`h-1.5 w-1.5 rounded-full ${active ? "bg-accent" : "bg-zinc-600"}`} />
            <span className="font-medium">{a.label}</span>
            <span className="rounded border border-line px-1.5 text-[9px] uppercase tracking-wider text-faint">conta</span>
          </div>
          <div className="pl-7 text-[11px] text-faint">
            {a.campaigns.length} campanha(s){active ? ` · ${active} ativa(s)` : ""}
          </div>
        </td>
        <Cells x={a} cols={cols} cur={cur} days={days} count={1} small />
      </tr>
      {isOpen &&
        a.campaigns.map((c) => (
          <CampaignRow
            key={c.key}
            c={c}
            cols={cols}
            cur={cur}
            days={days}
            targets={targets}
            onActive={onActive}
            onStudio={onStudio}
            onExclude={onExclude}
            onLink={onLink}
            rangeQuery={rangeQuery}
          />
        ))}
    </>
  );
}

function CampaignRow({
  c,
  cols,
  cur,
  days,
  targets,
  onActive,
  onStudio,
  onExclude,
  onLink,
  rangeQuery,
}: {
  rangeQuery: string;
  c: TreeCampaign;
  cols: { id: ColId }[];
  cur: string;
  days: number;
  targets: { key: string; name: string }[];
  onActive: (c: TreeCampaign, active: boolean) => void;
  onStudio: (mode: StudioMode, c: TreeCampaign) => void;
  onExclude: (c: TreeCampaign) => void;
  onLink: (source: string, target: string | null) => void;
}) {
  const [label, tone] = statusOf(c);
  const [menu, setMenu] = useState(false);
  const [panel, setPanel] = useState<"ads" | "sites" | null>(null);
  const inGroup = !c.dailyBudget && !!c.group?.shared;
  const [budgetNow, setBudgetNow] = useState<number | undefined>(inGroup ? c.group?.dailyCap : c.dailyBudget);
  const x = useMemo(() => ({ ...c, budget: budgetNow ?? 0 }), [c, budgetNow]);
  const saveBudget = async (daily: number): Promise<string | null> => {
    const r = await fetch("/api/campaigns/insights", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(
        inGroup
          ? { accountId: c.accountId, campaignId: c.id, kind: "groupBudget", id: c.group!.id, daily }
          : { accountId: c.accountId, campaignId: c.id, kind: "budget", daily },
      ),
    })
      .then((x) => x.json())
      .catch(() => ({ error: "Falha na conexão." }));
    if (r.error) return r.error;
    setBudgetNow(daily);
    return null;
  };
  const tab = (k: "ads" | "sites", text: string) => (
    <button
      className={`rounded-md border px-2 py-0.5 text-[11px] ${panel === k ? "border-accent/60 text-accent" : "border-line text-muted hover:text-zinc-100"}`}
      onClick={() => setPanel(panel === k ? null : k)}
    >
      {text} {panel === k ? "▴" : "▾"}
    </button>
  );
  return (
    <>
    <tr className="group border-b border-line/40 bg-white/[0.015] hover:bg-white/[0.03]">
      <td className="py-2 pl-14 pr-3">
        <div className="flex items-center gap-3">
          {c.editable && c.active !== null ? (
            <button
              role="switch"
              aria-checked={!!c.active}
              aria-label={c.active ? "Pausar campanha" : "Ativar campanha"}
              onClick={() => onActive(c, !c.active)}
              className={`relative h-5 w-9 shrink-0 rounded-full transition-colors ${c.active ? "bg-accent" : "bg-zinc-700"}`}
            >
              <span className={`absolute top-0.5 h-4 w-4 rounded-full bg-white transition-all ${c.active ? "left-[18px]" : "left-0.5"}`} />
            </button>
          ) : (
            <span className="w-9" />
          )}
          <div className="min-w-0">
            <div className="max-w-[280px] truncate font-mono text-[12px] xl:max-w-[340px]" title={c.name}>
              {c.name}
            </div>
            <div className="flex items-center gap-2 text-[11px]">
              {label !== "—" && <span className={tone}>● {label}</span>}
              {c.needsLink && (
                <span className="text-warn" title="Vendas ainda não ligadas a esta campanha">
                  sem vendas ligadas
                </span>
              )}
              {(c.attribution === "conversoes" || c.attribution === "cliques") && <span className="text-faint">vendas estimadas</span>}
            </div>
            {c.editable && (
              <div className="mt-1.5 flex gap-1.5">
                {tab("ads", "Criativos")}
                {tab("sites", c.platform === "revcontent" ? "Widgets" : "Portais")}
              </div>
            )}
          </div>
          <div className="relative ml-auto shrink-0">
        <button className="rounded px-2 py-1 text-muted opacity-60 hover:bg-white/5 hover:text-zinc-100 group-hover:opacity-100" onClick={() => setMenu((v) => !v)} aria-label="Ações">
          ⋯
        </button>
        {menu && (
          <div className="absolute left-0 top-8 z-30 w-56 rounded-xl border border-line bg-panel p-1.5 text-left text-xs shadow-xl" onMouseLeave={() => setMenu(false)}>
            {c.editable && (
              <>
                <MenuItem onClick={() => onStudio("edit", c)}>Configurações e anúncios</MenuItem>
                <MenuItem onClick={() => onStudio("duplicate", c)}>Duplicar</MenuItem>
              </>
            )}
            <MenuItem onClick={() => onExclude(c)}>Ignorar gasto (outro produto)</MenuItem>
            {c.linkSource && (
              <div className="px-2 py-1.5">
                <select className="input w-full py-1 text-[11px]" value="" onChange={(e) => e.target.value && onLink(c.linkSource!, e.target.value)}>
                  <option value="">Ligar vendas a…</option>
                  {targets.map((t) => (
                    <option key={t.key} value={t.key}>
                      {t.name}
                    </option>
                  ))}
                </select>
              </div>
            )}
          </div>
        )}
          </div>
        </div>
      </td>
      <Cells
        x={x}
        cols={cols}
        cur={cur}
        days={days}
        small
        onBudget={c.editable ? saveBudget : undefined}
        budgetCaption={inGroup ? `grupo ${c.group!.name}` : undefined}
      />
    </tr>
    {panel && (
      <tr className="border-b border-line/40 bg-black/20">
        <td colSpan={cols.length + 1} className="px-4 py-3 pl-14">
          <InsightPanel c={c} kind={panel} rangeQuery={rangeQuery} cur={cur} />
        </td>
      </tr>
    )}
    </>
  );
}

type Ad = { id: string; title: string; description: string; thumbnail: string; status: string; approval?: string; rejectReason?: string; editable: boolean; active: boolean; spend: number; clicks: number; impressions: number; ctr: number; cpc: number; conversions: number; cpa: number };
type Site = { id: string; name: string; spend: number; clicks: number; impressions: number; ctr: number; cpc: number; conversions: number; cpa: number; blocked: boolean };

/** Ads or sites of one campaign, with the source's numbers and an on/off for each. */
function InsightPanel({ c, kind, rangeQuery, cur }: { c: TreeCampaign; kind: "ads" | "sites"; rangeQuery: string; cur: string }) {
  const [rows, setRows] = useState<(Ad | Site)[] | null>(null);
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [actionErr, setActionErr] = useState("");
  const [onlySpend, setOnlySpend] = useState(true);
  useEffect(() => {
    setRows(null);
    setErr("");
    fetch(`/api/campaigns/insights?${rangeQuery}&kind=${kind}&accountId=${encodeURIComponent(c.accountId)}&campaignId=${encodeURIComponent(c.id)}`)
      .then((r) => r.json())
      .then((j) => (j.error ? setErr(j.error) : setRows(kind === "ads" ? j.ads : j.sites)))
      .catch(() => setErr("Falha na conexão."));
  }, [c.accountId, c.id, kind, rangeQuery]);

  async function toggle(id: string, on: boolean) {
    setBusy(id);
    const r = await fetch("/api/campaigns/insights", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ accountId: c.accountId, campaignId: c.id, kind: kind === "ads" ? "ad" : "site", id, on }),
    })
      .then((x) => x.json())
      .catch(() => ({ error: "Falha na conexão." }));
    setBusy(null);
    if (r.error) return setActionErr(r.error.replace(/^Fonte: /, ""));
    setActionErr("");
    setRows((cur) => cur && cur.map((x) => (x.id !== id ? x : kind === "ads" ? { ...(x as Ad), active: on } : { ...(x as Site), blocked: !on })));
  }

  if (err) return <p className="text-xs text-warn">{err}</p>;
  if (!rows) return <p className="text-xs text-muted">Carregando {kind === "ads" ? "criativos" : "portais"}…</p>;
  // Real sales of the campaign split by the source's conversions (else clicks) — an estimate per ad / site.
  const conv = rows.reduce((a, r) => a + r.conversions, 0);
  const clicks = rows.reduce((a, r) => a + r.clicks, 0);
  const share = (r: Ad | Site) => (conv > 0 ? r.conversions / conv : clicks ? r.clicks / clicks : 0);
  const list = kind === "sites" && onlySpend ? rows.filter((r) => r.spend > 0 || (r as Site).blocked) : rows;
  const th = "px-2 py-1.5 text-right font-normal";
  const td = "px-2 py-1.5 text-right tabular-nums";
  return (
    <div>
      {actionErr && <p className="mb-2 rounded-md border border-warn/30 bg-warn/5 px-2 py-1 text-[11px] text-warn">{actionErr}</p>}
      <div className="mb-2 flex flex-wrap items-center justify-between gap-2 text-[11px] text-faint">
        <span>
          {kind === "ads" ? `${rows.length} criativo(s)` : `${rows.filter((r) => r.spend > 0).length} portal(is) com gasto`} · números da fonte no período · vendas
          reais divididas pelas conversões da fonte (estimado)
        </span>
        {kind === "sites" && (
          <label className="flex items-center gap-1.5">
            <input type="checkbox" checked={onlySpend} onChange={(e) => setOnlySpend(e.target.checked)} /> só com gasto ou bloqueados
          </label>
        )}
      </div>
      <div className="max-h-[420px] overflow-auto rounded-lg border border-line">
        <table className="w-full text-xs">
          <thead className="sticky top-0 bg-panel text-[10px] uppercase tracking-wider text-faint">
            <tr>
              <th className="px-2 py-1.5 text-left font-normal">{kind === "ads" ? "Criativo" : c.platform === "revcontent" ? "Widget" : "Portal"}</th>
              <th className={th}>Gasto</th>
              <th className={th}>Cliques</th>
              <th className={th}>CTR</th>
              <th className={th}>CPC</th>
              <th className={th}>Conv. fonte</th>
              <th className={th}>CPA fonte</th>
              <th className={th}>Vendas reais</th>
              <th className={th}>ROAS</th>
              <th className="px-2 py-1.5 text-right font-normal">{kind === "ads" ? "Ativo" : "Rodando"}</th>
            </tr>
          </thead>
          <tbody>
            {list.map((r) => {
              const on = kind === "ads" ? (r as Ad).active : !(r as Site).blocked;
              const sales = c.sales * share(r);
              const roas = r.spend ? (c.revenue * share(r)) / r.spend : 0;
              const bad = r.conversions === 0 && c.cpa > 0 && r.spend > c.cpa;
              return (
                <tr key={r.id} className={`border-t border-line/50 ${on ? "" : "opacity-50"}`}>
                  <td className="px-2 py-1.5">
                    {kind === "ads" ? (
                      <div className="flex items-center gap-2">
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img src={(r as Ad).thumbnail} alt="" className="h-9 w-16 shrink-0 rounded object-cover" />
                        <div className="min-w-0">
                          <div className="max-w-[340px] truncate" title={(r as Ad).title}>
                            {(r as Ad).title}
                          </div>
                          <div className="max-w-[340px] truncate text-[10px]" title={(r as Ad).rejectReason ?? (r as Ad).description}>
                            <AdStatus ad={r as Ad} />
                            {(r as Ad).description ? <span className="text-faint"> · {(r as Ad).description}</span> : null}
                          </div>
                        </div>
                      </div>
                    ) : (
                      <span className="block max-w-[340px] truncate" title={(r as Site).name}>
                        {(r as Site).name}
                      </span>
                    )}
                  </td>
                  <td className={td}>{money(r.spend, cur)}</td>
                  <td className={td}>{int(r.clicks)}</td>
                  <td className={td}>{r.ctr.toFixed(2)}%</td>
                  <td className={td}>{money(r.cpc, cur, 3)}</td>
                  <td className={td}>{int(r.conversions)}</td>
                  <td className={`${td} ${bad ? "text-bad" : ""}`}>{r.conversions ? money(r.cpa, cur, 2) : bad ? "sem conv." : "—"}</td>
                  <td className={`${td} text-info`}>{sales ? sales.toFixed(1) : "0"}</td>
                  <td className={td}>{r.spend ? `${roas.toFixed(2)}x` : "—"}</td>
                  <td className="px-2 py-1.5 text-right">
                    <button
                      role="switch"
                      aria-checked={on}
                      title={kind === "ads" && !(r as Ad).editable ? "Em revisão ou reprovado: a Taboola só deixa pausar depois de aprovado" : undefined}
                      disabled={busy === r.id || (kind === "ads" && !(r as Ad).editable)}
                      aria-label={kind === "ads" ? (on ? "Pausar criativo" : "Ativar criativo") : on ? "Bloquear portal" : "Desbloquear portal"}
                      onClick={() => toggle(r.id, !on)}
                      className={`relative inline-block h-4 w-8 rounded-full transition-colors disabled:opacity-50 ${on ? "bg-accent" : "bg-zinc-700"}`}
                    >
                      <span className={`absolute top-0.5 h-3 w-3 rounded-full bg-white transition-all ${on ? "left-[18px]" : "left-0.5"}`} />
                    </button>
                  </td>
                </tr>
              );
            })}
            {!list.length && (
              <tr>
                <td colSpan={10} className="py-6 text-center text-muted">
                  {kind === "ads" ? "Nenhum criativo." : "Nenhum portal com gasto no período."}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
      {kind === "sites" && <p className="mt-1.5 text-[10px] text-faint">Desligar = bloquear o portal só nesta campanha.</p>}
    </div>
  );
}

const AD_STATUS: Record<string, [string, string]> = {
  RUNNING: ["rodando", "text-accent"],
  PAUSED: ["pausado", "text-muted"],
  PENDING: ["em revisão", "text-warn"],
  PENDING_APPROVAL: ["em revisão", "text-warn"],
  CRAWLING: ["lendo o link", "text-warn"],
  REJECTED: ["reprovado", "text-bad"],
  STOPPED: ["parado", "text-muted"],
  NEED_TO_EDIT: ["precisa de ajuste", "text-bad"],
  CRAWLING_ERROR: ["erro ao ler o link", "text-bad"],
};
function AdStatus({ ad }: { ad: Ad }) {
  const rejected = /reject/i.test(ad.approval ?? "") || /reject/i.test(ad.status);
  const [label, tone] = rejected ? ["reprovado", "text-bad"] : (AD_STATUS[ad.status.toUpperCase()] ?? [ad.status.toLowerCase().replace(/_/g, " "), "text-faint"]);
  return (
    <span className={tone}>
      {label}
      {ad.rejectReason ? ` — ${ad.rejectReason}` : ""}
    </span>
  );
}

function MenuItem({ onClick, children }: { onClick: () => void; children: React.ReactNode }) {
  return (
    <button className="block w-full rounded-md px-2 py-1.5 text-left hover:bg-white/5" onClick={onClick}>
      {children}
    </button>
  );
}

