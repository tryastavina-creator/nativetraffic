"use client";
import Link from "next/link";
import { Fragment, useEffect, useMemo, useState } from "react";
import { PLATFORM_COLOR, int, money, pct } from "@/components/format";
import { BIDS, buildRtName, buildSourceName, DEVICES, SOURCE_NAME } from "@/lib/naming";
import type { TrafficReport, TrafficRow } from "@/lib/traffic";
import { CampaignHistory } from "@/components/campaignParts";
import { CampaignStudio, type StudioMode } from "@/components/CampaignStudio";
import type { CampaignLogEntry } from "@/lib/store";

const PRESETS = [
  ["today", "Hoje"],
  ["yesterday", "Ontem"],
  ["7d", "7 dias"],
  ["14d", "14 dias"],
  ["30d", "30 dias"],
  ["custom", "Personalizado"],
] as const;

type SortKey = "spend" | "profit" | "roi" | "roas" | "sales" | "upsells" | "cpa" | "revenue" | "clicks";

const daysAgo = (n: number) => {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return d.toISOString().slice(0, 10);
};

export default function Trafego() {
  const [preset, setPreset] = useState("7d");
  const [from, setFrom] = useState(daysAgo(6));
  const [to, setTo] = useState(daysAgo(0));
  const [applied, setApplied] = useState(0);
  const [data, setData] = useState<TrafficReport | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [platform, setPlatform] = useState("all");
  const [view, setView] = useState<"api" | "redtrack">("api");
  const [showNaming, setShowNaming] = useState(false);
  const [studio, setStudio] = useState<{ mode: StudioMode; accountId?: string; campaignId?: string } | null>(null);
  const [history, setHistory] = useState<CampaignLogEntry[] | null>(null);
  const openHistory = () =>
    fetch("/api/campaigns/meta")
      .then((r) => r.json())
      .then((d) => setHistory(d.log ?? []));
  const [sort, setSort] = useState<{ key: SortKey; dir: 1 | -1 }>({ key: "spend", dir: -1 });

  const [reload, setReload] = useState(0);
  // Campaigns created by the CRM (they only reach the source reports once they spend).
  const [crmLog, setCrmLog] = useState<CampaignLogEntry[]>([]);
  useEffect(() => {
    fetch("/api/campaigns/meta")
      .then((r) => r.json())
      .then((d) => setCrmLog(d.log ?? []))
      .catch(() => {});
  }, [reload]);

  async function link(source: string, target: string | null) {
    await fetch("/api/traffic/link", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ source, target }),
    });
    setReload((n) => n + 1);
  }

  const [showExcluded, setShowExcluded] = useState(false);
  async function exclude(keys: string[], exclude: boolean, label = "", platform = "") {
    if (!keys.length) return;
    // Optimistic: drop the row right away; the reload brings the recalculated totals.
    if (exclude && data) {
      const ks = new Set(keys);
      const gone = (r: TrafficRow) => r.excludeKeys.some((k) => ks.has(k));
      setData({ ...data, rows: data.rows.filter((r) => !gone(r)), apiRows: data.apiRows.filter((r) => !gone(r)) });
    }
    await fetch("/api/traffic/exclude", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ keys, exclude, label, platform }),
    });
    setReload((n) => n + 1);
  }

  useEffect(() => {
    const q = new URLSearchParams({ preset });
    if (preset === "custom") {
      q.set("from", from);
      q.set("to", to);
    }
    setLoading(true);
    setError("");
    fetch(`/api/traffic?${q}`)
      .then(async (r) => {
        const j = await r.json();
        if (!r.ok) throw new Error(j.error ?? "Erro ao carregar");
        setData(j);
      })
      .catch((e: Error) => setError(e.message))
      .finally(() => setLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [preset, applied, reload]);

  const cur = data?.currency ?? "USD";
  const source = useMemo(() => (view === "api" ? data?.apiRows : data?.rows) ?? [], [data, view]);
  const platforms = useMemo(() => [...new Set(source.map((r) => r.platform))], [source]);
  const rows = useMemo(() => {
    const list = source.filter((r) => platform === "all" || r.platform === platform);
    return [...list].sort((a, b) => (a[sort.key] - b[sort.key]) * sort.dir);
  }, [source, platform, sort]);
  const t = data?.totals;
  const showIc = !!data?.icConfigured;
  const [order, setOrder] = useState<string[]>(COLS.map((c) => c.id));
  const [hidden, setHidden] = useState<string[]>([]);
  const [dragging, setDragging] = useState<string | null>(null);
  const [showCols, setShowCols] = useState(false);
  useEffect(() => {
    try {
      const saved = JSON.parse(localStorage.getItem("nt_traffic_cols") ?? "null");
      if (saved?.order) setOrder([...saved.order.filter((id: string) => COLS.some((c) => c.id === id)), ...COLS.map((c) => c.id).filter((id) => !saved.order.includes(id))]);
      if (saved?.hidden) setHidden(saved.hidden);
    } catch {}
  }, []);
  const persist = (o: string[], h: string[]) => {
    try {
      localStorage.setItem("nt_traffic_cols", JSON.stringify({ order: o, hidden: h }));
    } catch {}
  };
  const moveCol = (from: string, to: string) => {
    if (from === to) return;
    const o = order.filter((x) => x !== from);
    o.splice(o.indexOf(to), 0, from);
    setOrder(o);
    persist(o, hidden);
  };
  const toggleCol = (id: string) => {
    const h = hidden.includes(id) ? hidden.filter((x) => x !== id) : [...hidden, id];
    setHidden(h);
    persist(order, h);
  };
  const resetCols = () => {
    const o = COLS.map((c) => c.id);
    setOrder(o);
    setHidden([]);
    persist(o, []);
  };
  const visibleCols = order
    .map((id) => COLS.find((c) => c.id === id)!)
    .filter((c) => c && !hidden.includes(c.id) && (!c.ic || showIc));

  const Th = ({ k, children }: { k?: SortKey; children: React.ReactNode }) => (
    <th className="whitespace-nowrap text-right">
      {k ? (
        <button
          className={`hover:text-zinc-200 ${sort.key === k ? "text-zinc-200" : ""}`}
          onClick={() => setSort((s) => ({ key: k, dir: s.key === k ? (s.dir === 1 ? -1 : 1) : -1 }))}
        >
          {children}
          {sort.key === k ? (sort.dir === -1 ? " ↓" : " ↑") : ""}
        </button>
      ) : (
        children
      )}
    </th>
  );

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
          <p className="mt-1 text-sm text-muted">
            Lucro real de cada campanha: gasto e cliques do RedTrack, vendas e custos da Shopify e da Wiio.
          </p>
        </div>
        <div className="flex flex-col gap-2 xl:items-end">
          <div className="flex flex-wrap gap-1 rounded-lg border border-line bg-panel p-1">
            {PRESETS.map(([id, label]) => (
              <button key={id} onClick={() => setPreset(id)} className={`chip ${preset === id ? "chip-on" : ""}`}>
                {label}
              </button>
            ))}
          </div>
          {preset === "custom" && (
            <div className="flex flex-wrap items-center gap-1.5 text-xs">
              <input id="t-from" type="date" className="input w-auto py-1.5" value={from} max={to} onChange={(e) => setFrom(e.target.value)} />
              <span className="text-faint">até</span>
              <input id="t-to" type="date" className="input w-auto py-1.5" value={to} min={from} onChange={(e) => setTo(e.target.value)} />
              <button className="btn-primary py-1.5" onClick={() => setApplied((n) => n + 1)}>
                Aplicar
              </button>
            </div>
          )}
        </div>
      </header>

      {error && <div className="mt-5 rounded-lg border border-bad/30 bg-bad/5 px-4 py-2 text-sm text-bad">{error}</div>}
      {!!data?.warnings.length && (
        <p className="mt-3 text-xs text-faint">{data.warnings.join(" · ")}</p>
      )}
      {data && !data.hasRedtrack && (
        <div className="mt-5 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-warn/30 bg-warn/5 px-4 py-3 text-sm text-warn">
          Conecte o RedTrack para ver gasto, cliques e lucro por campanha.
          <Link href="/integrations" className="btn-ghost">
            Conectar RedTrack →
          </Link>
        </div>
      )}

      {!!data?.unlinked && (
        <div className="mt-5 rounded-xl border border-warn/30 bg-warn/5 px-4 py-3 text-sm text-warn">
          {data.unlinked} campanha(s) da fonte ainda não estão ligadas à campanha do RedTrack/Shopify. Use &quot;Ligar a…&quot;
          na linha para o gasto cair na campanha certa. Enquanto isso, o total usa só o gasto da fonte (sem contar duas
          vezes).
        </div>
      )}

      <div className={`transition-opacity ${loading ? "opacity-50" : ""}`}>
        <div className="mt-6 grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
          <Tile label="Gasto" value={t ? money(t.spend, cur) : "—"} />
          <Tile label="Vendas + upsells" value={t ? `${int(t.sales)} + ${int(t.upsells)}` : "—"} hint={t && t.sales ? `${pct(t.upsellRate)} levaram upsell` : ""} />
          <Tile label="Receita" value={t ? money(t.revenue, cur) : "—"} tone="good" hint={t && t.upsellRevenue ? `${money(t.upsellRevenue, cur)} de upsell` : ""} />
          <Tile label="CPA real" value={t && t.sales ? money(t.cpa, cur, 2) : "—"} tone="warn" hint="Gasto ÷ vendas" />
          <Tile label="ROAS real" value={t && t.spend ? `${t.roas.toFixed(2)}x` : "—"} hint="Receita ÷ gasto" />
          <Tile label="Lucro real" value={t ? money(t.profit, cur) : "—"} tone={t && t.profit < 0 ? "bad" : "good"} hint={t && t.spend ? `ROI ${pct(t.roi)}` : ""} />
        </div>

        <div className="mt-6 flex flex-wrap items-center justify-between gap-3">
          <div className="flex gap-1 rounded-lg border border-line bg-panel p-1">
            <button className={`chip ${view === "api" ? "chip-on" : ""}`} onClick={() => setView("api")}>
              Campanhas da API
            </button>
            <button className={`chip ${view === "redtrack" ? "chip-on" : ""}`} onClick={() => setView("redtrack")}>
              Campanhas do RedTrack
            </button>
          </div>
          <button className="btn-ghost py-1.5 text-xs" onClick={() => setShowNaming((v) => !v)}>
            {showNaming ? "Fechar gerador de nomes" : "Gerador de nomes"}
          </button>
          <span className="text-[11px] text-faint">
            {view === "api"
              ? "Cada linha é uma campanha real da Taboola, Revcontent… com as vendas atribuídas a ela."
              : "Cada linha é uma campanha do RedTrack, com o gasto das campanhas da fonte ligadas a ela."}
          </span>
        </div>
        {showNaming && <NamingGenerator />}
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
        <div className="relative mt-3 flex flex-wrap items-center gap-1">
          <button className="btn-ghost order-last ml-auto py-1 text-xs" onClick={() => setShowCols((v) => !v)}>
            Colunas ({visibleCols.length})
          </button>
          {showCols && (
            <div className="absolute right-0 top-9 z-20 w-64 rounded-xl border border-line bg-panel p-3 shadow-xl">
              <div className="mb-2 flex items-center justify-between text-xs">
                <span className="text-zinc-300">Mostrar colunas</span>
                <button className="text-info hover:underline" onClick={resetCols}>
                  restaurar
                </button>
              </div>
              <div className="grid grid-cols-2 gap-1">
                {COLS.filter((c) => !c.ic || showIc).map((c) => (
                  <label key={c.id} className="flex items-center gap-1.5 text-xs">
                    <input type="checkbox" checked={!hidden.includes(c.id)} onChange={() => toggleCol(c.id)} />
                    {c.label}
                  </label>
                ))}
              </div>
              <p className="mt-2 text-[10px] text-faint">Arraste o título da coluna na tabela para mudar a ordem. Fica salvo neste navegador.</p>
            </div>
          )}
          {["all", ...platforms].map((p) => (
            <button key={p} onClick={() => setPlatform(p)} className={`chip border border-line ${platform === p ? "chip-on" : ""}`}>
              {p === "all" ? "Todas" : (source.find((r) => r.platform === p)?.label ?? p)}
            </button>
          ))}
        </div>

        <NoSpendYet
          log={crmLog}
          known={new Set((data?.apiRows ?? []).flatMap((r) => r.sourceKeys.map((k) => k.split(":").slice(1).join(":"))))}
          onOpen={(accountId, campaignId) => setStudio({ mode: "edit", accountId, campaignId })}
        />
        <div className="card mt-3 overflow-x-auto">
          <table className="tbl w-full" style={{ minWidth: 380 + visibleCols.length * 96 }}>
            <thead>
              <tr>
                <th className="text-left">Campanha</th>
                {visibleCols.map((c) => (
                  <th
                    key={c.id}
                    draggable
                    onDragStart={(e) => {
                      setDragging(c.id);
                      e.dataTransfer.effectAllowed = "move";
                    }}
                    onDragOver={(e) => e.preventDefault()}
                    onDrop={() => dragging && moveCol(dragging, c.id)}
                    onDragEnd={() => setDragging(null)}
                    className={`cursor-grab whitespace-nowrap text-right select-none ${dragging === c.id ? "opacity-40" : ""}`}
                    title="Arraste para mudar a ordem"
                  >
                    {c.sort ? (
                      <button
                        className={`hover:text-zinc-200 ${sort.key === c.sort ? "text-zinc-200" : ""}`}
                        onClick={() => setSort((st) => ({ key: c.sort!, dir: st.key === c.sort ? (st.dir === 1 ? -1 : 1) : -1 }))}
                      >
                        {c.label}
                        {sort.key === c.sort ? (sort.dir === -1 ? " ↓" : " ↑") : ""}
                      </button>
                    ) : (
                      c.label
                    )}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <Row
                  key={r.key}
                  r={r}
                  cur={cur}
                  cols={visibleCols}
                  onAction={(mode) => r.accountId && r.sourceId && setStudio({ mode, accountId: r.accountId, campaignId: r.sourceId })}
                  targets={(data?.linkTargets ?? []).filter((t) => t.platform === r.platform)}
                  onLink={link}
                  onExclude={() => exclude(r.excludeKeys, true, r.campaign, r.platform)}
                />
              ))}
              {rows.length === 0 && (
                <tr>
                  <td colSpan={visibleCols.length + 1} className="py-8 text-center text-muted">
                    Nenhuma campanha com gasto ou venda no período.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
        {!!data?.excluded?.length && (
          <div className="card mt-3 px-4 py-3 text-sm">
            <button className="flex w-full items-center justify-between text-left" onClick={() => setShowExcluded((v) => !v)}>
              <span>
                <span className="text-zinc-200">Campanhas ignoradas ({data.excluded.length})</span>
                <span className="ml-2 text-[12px] text-muted">
                  {money(
                    data.excluded.reduce((a, e) => a + e.spend, 0),
                    cur,
                  )}{" "}
                  de gasto fora de todos os números (Tráfego e Dashboard)
                </span>
              </span>
              <span className="text-muted">{showExcluded ? "▲" : "▼"}</span>
            </button>
            {showExcluded && (
              <ul className="mt-3 divide-y divide-line">
                {data.excluded.map((e) => (
                  <li key={e.key} className="flex items-center justify-between gap-3 py-2">
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="h-2 w-2 shrink-0 rounded-full" style={{ background: PLATFORM_COLOR[e.platform] ?? "#888" }} />
                        <span className="truncate" title={e.label}>
                          {e.label}
                        </span>
                      </div>
                      <div className="pl-4 text-[11px] text-faint">
                        {e.key.startsWith("rtc:") ? "campanha do RedTrack" : "campanha da fonte"} · {money(e.spend, cur)} no período
                      </div>
                    </div>
                    <button
                      className="shrink-0 rounded-md border border-line px-2 py-0.5 text-[11px] text-muted hover:text-zinc-100"
                      onClick={() => exclude([e.key], false)}
                    >
                      Voltar a contar
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}
        <p className="mt-3 text-[11px] text-faint">
          Gasto vem da API da fonte quando ela está conectada (senão, do RedTrack). Vendas e upsells vêm da Shopify. Campanhas
          ligam sozinhas pela nomenclatura: RedTrack &quot;[PRODUTO] [FONTE] [PAÍS]&quot; e fonte &quot;[PRODUTO] [DEVICE] [LANCE] [PAÍS] [DATA]&quot;.
          CPA real = gasto ÷ vendas. Lucro real = receita − custo Wiio − taxas − reembolsos − gasto. Checkouts = InitiateCheckout
          do RedTrack. O RedTrack conta 1 compra por venda e mais 1 por upsell.
          {!!data?.hidden && ` ${data.hidden} campanha(s) sem gasto e sem venda ocultas.`}
        </p>
      </div>
    </div>
  );
}

type Col = { id: string; label: string; sort?: SortKey; ic?: boolean; cell: (r: TrafficRow, cur: string) => React.ReactNode };

const COLS: Col[] = [
  {
    id: "spend",
    label: "Gasto",
    sort: "spend",
    cell: (r, cur) => (
      <td className={`text-right ${r.counted ? "text-bad" : "text-warn italic"}`}>
        {r.spend ? money(r.spend, cur) : "—"}
        {r.spendSource && (
          <div className="text-[10px] not-italic text-faint">
            {r.spendSource === "fonte" ? `API ${r.label}` : r.counted ? "RedTrack" : "RedTrack · fora do total"}
          </div>
        )}
      </td>
    ),
  },
  { id: "clicks", label: "Cliques", sort: "clicks", cell: (r) => <td className="text-right">{int(r.clicks)}</td> },
  { id: "cpc", label: "CPC", cell: (r, cur) => <td className="text-right text-muted">{r.clicks && r.spend ? money(r.cpc, cur, 3) : "—"}</td> },
  {
    id: "checkouts",
    label: "Checkouts",
    ic: true,
    cell: (r) => (
      <td className="text-right">
        {r.ic === null ? "—" : int(r.ic)}
        {r.icRate !== null && r.ic ? <div className="text-[10px] text-faint">{pct(r.icRate)} dos cliques</div> : null}
      </td>
    ),
  },
  {
    id: "checkoutConv",
    label: "Conv. checkout",
    ic: true,
    cell: (r) => <td className={`text-right ${r.ic && r.sales / r.ic < 0.2 ? "text-warn" : "text-muted"}`}>{r.ic ? pct((r.sales / r.ic) * 100) : "—"}</td>,
  },
  { id: "sales", label: "Vendas", sort: "sales", cell: (r) => <td className="text-right font-medium">{int(r.sales)}</td> },
  {
    id: "upsells",
    label: "Upsells",
    sort: "upsells",
    cell: (r) => (
      <td className="text-right">
        {int(r.upsells)}
        {r.sales > 0 && <div className="text-[10px] text-faint">{pct(r.upsellRate, 0)}</div>}
      </td>
    ),
  },
  { id: "cvr", label: "Conv. %", cell: (r) => <td className="text-right text-muted">{r.clicks ? pct(r.cvr, 2) : "—"}</td> },
  { id: "cpa", label: "CPA real", sort: "cpa", cell: (r, cur) => <td className="text-right text-warn">{r.sales && r.spend ? money(r.cpa, cur, 2) : "—"}</td> },
  { id: "aov", label: "Ticket médio", cell: (r, cur) => <td className="text-right">{r.sales ? money(r.aov, cur, 2) : "—"}</td> },
  { id: "revenue", label: "Receita", sort: "revenue", cell: (r, cur) => <td className="text-right text-accent">{money(r.revenue, cur)}</td> },
  {
    id: "roas",
    label: "ROAS real",
    sort: "roas",
    cell: (r) => <td className={`text-right ${r.spend && r.roas < 1 ? "text-bad" : ""}`}>{r.spend ? `${r.roas.toFixed(2)}x` : "—"}</td>,
  },
  {
    id: "profit",
    label: "Lucro real",
    sort: "profit",
    cell: (r, cur) => <td className={`text-right font-medium ${r.profit < 0 ? "text-bad" : "text-accent"}`}>{money(r.profit, cur)}</td>,
  },
  {
    id: "margin",
    label: "Margem",
    cell: (r) => (
      <td className={`text-right ${r.revenue && r.profit < 0 ? "text-bad" : "text-muted"}`}>{r.revenue ? pct((r.profit / r.revenue) * 100) : "—"}</td>
    ),
  },
  { id: "roi", label: "ROI", sort: "roi", cell: (r) => <td className={`text-right ${r.roi < 0 ? "text-bad" : "text-accent"}`}>{r.spend ? pct(r.roi, 0) : "—"}</td> },
];

function Row({
  r,
  cur,
  cols,
  onAction,
  targets,
  onLink,
  onExclude,
}: {
  r: TrafficRow;
  cur: string;
  cols: Col[];
  onAction: (mode: StudioMode) => void;
  targets: { key: string; name: string }[];
  onLink: (source: string, target: string | null) => void;
  onExclude: () => void;
}) {
  const editable = !!(r.accountId && r.sourceId && (r.platform === "taboola" || r.platform === "revcontent"));
  const rtOk = r.rtConversions === r.rtExpected;
  return (
    <tr className={r.needsLink ? "bg-warn/[0.03]" : ""}>
      <td className="max-w-[380px]">
        <div className="flex items-center gap-2">
          <span className="h-2 w-2 shrink-0 rounded-full" style={{ background: PLATFORM_COLOR[r.platform] ?? "#888" }} />
          <span className="truncate" title={r.campaign}>
            {r.campaign}
          </span>
        </div>
        <div className="space-x-2 pl-4 text-[11px] text-faint">
          <span>{r.label}</span>
          {!r.namingOk && (
            <span className="text-faint" title="RedTrack: [PRODUTO] [FONTE] [PAÍS] · Fonte: [PRODUTO] [DEVICE] [LANCE] [PAÍS] [DATA]">
              · nome fora do padrão
            </span>
          )}
          {r.attribution && r.attribution !== "sem-ligacao" && (
            <span className={r.attribution === "conversoes" || r.attribution === "cliques" ? "text-warn" : ""}>
              {r.attribution === "exata"
                ? `vendas da campanha ${r.linkedBy === "manual" ? "(ligada manualmente)" : r.linkedBy === "link" ? "(ligada pelo link do RedTrack)" : r.linkedBy === "padrao" ? "(ligada pela nomenclatura)" : "(ligada pelo código)"}`
                : r.attribution === "conversoes"
                  ? "vendas divididas pelas conversões da fonte (estimado)"
                  : r.attribution === "cliques"
                    ? "vendas divididas pelos cliques (estimado)"
                    : r.counted
                      ? "dados do RedTrack (fonte sem API)"
                      : "campanha do RedTrack sem campanha da API ligada"}
              {r.linkedBy === "manual" && r.sourceKeys.length > 0 && (
                <button className="ml-1 text-info hover:underline" onClick={() => r.sourceKeys.forEach((k) => onLink(k, null))}>
                  desfazer
                </button>
              )}
            </span>
          )}
          {!r.attribution && r.linkedBy && r.sourceNames.length > 0 && (
            <span title={r.sourceNames.join(" · ")}>
              {r.linkedBy === "link" ? "ligada pelo link do RedTrack" : r.linkedBy === "manual" ? "ligada manualmente" : r.linkedBy === "padrao" ? "ligada pela nomenclatura" : "ligada pelo código"}
              {r.linkedBy === "manual" && (
                <button className="ml-1 text-info hover:underline" onClick={() => r.sourceKeys.forEach((k) => onLink(k, null))}>
                  desfazer
                </button>
              )}
            </span>
          )}
          {r.missingCost && <span className="text-bad">sem custo: conecte a API do {r.label} em Integrações ou envie o custo ao RedTrack</span>}
          {!r.counted && <span className="text-warn">gasto do RedTrack, falta ligar à campanha da fonte</span>}
          {r.matched && r.rtConversions > 0 && (
            <span className={rtOk ? "" : "text-warn"}>
              RedTrack {int(r.rtConversions)} {rtOk ? "✓" : `(esperado ${int(r.rtExpected)})`}
            </span>
          )}
        </div>
        {r.linkSource && (
          <div className="mt-1 pl-4">
            <select
              aria-label="Ligar a campanha"
              className="input w-auto max-w-full py-1 text-[11px]"
              value=""
              onChange={(e) => e.target.value && onLink(r.linkSource!, e.target.value)}
            >
              <option value="">Ligar a… (campanha no RedTrack / UTM)</option>
              {targets.map((t) => (
                <option key={t.key} value={t.key}>
                  {t.name}
                </option>
              ))}
            </select>
          </div>
        )}
        {(editable || r.excludeKeys.length > 0) && (
          <div className="mt-1.5 flex gap-1.5 pl-4">
            {editable && (
              <>
                <button className="rounded-md border border-line px-2 py-0.5 text-[11px] text-muted hover:text-zinc-100" onClick={() => onAction("edit")}>
                  Editar
                </button>
                <button className="rounded-md border border-line px-2 py-0.5 text-[11px] text-muted hover:text-zinc-100" onClick={() => onAction("duplicate")}>
                  Duplicar
                </button>
              </>
            )}
            {r.excludeKeys.length > 0 && (
              <button
                className="rounded-md border border-line px-2 py-0.5 text-[11px] text-muted hover:border-bad/40 hover:text-bad"
                title="Tira o gasto desta campanha de todos os números (ex.: campanha de outro produto). Dá para voltar depois."
                onClick={onExclude}
              >
                Ignorar gasto
              </button>
            )}
          </div>
        )}
      </td>
      {cols.map((c) => (
        <Fragment key={c.id}>{c.cell(r, cur)}</Fragment>
      ))}
    </tr>
  );
}

function Tile({ label, value, tone, hint }: { label: string; value: string; tone?: "good" | "bad" | "warn"; hint?: string }) {
  const c = tone === "good" ? "text-accent" : tone === "bad" ? "text-bad" : tone === "warn" ? "text-warn" : "text-zinc-100";
  return (
    <div className="card card-pad">
      <div className="label">{label}</div>
      <div className={`mt-2 text-xl font-semibold ${c}`}>{value}</div>
      {hint && <div className="mt-1 text-[11px] text-faint">{hint}</div>}
    </div>
  );
}

function NamingGenerator() {
  const [product, setProduct] = useState("OMNIPRO");
  const [source, setSource] = useState("taboola");
  const [country, setCountry] = useState("US");
  const [device, setDevice] = useState("DESKTOP");
  const [bid, setBid] = useState<string>("MAXCONV");
  const [copied, setCopied] = useState("");
  const rt = buildRtName(product, source, country);
  const src = buildSourceName(product, device, bid, country);
  const copy = async (t: string) => {
    try {
      await navigator.clipboard.writeText(t);
      setCopied(t);
      setTimeout(() => setCopied(""), 1500);
    } catch {}
  };
  const sel = "input w-auto py-1.5 text-xs";
  return (
    <div className="card card-pad mt-3 space-y-3 text-xs">
      <div className="flex flex-wrap items-end gap-2">
        <label className="block">
          <span className="mb-1 block text-faint">Produto</span>
          <input id="nm-product" className={sel} value={product} onChange={(e) => setProduct(e.target.value.toUpperCase())} />
        </label>
        <label className="block">
          <span className="mb-1 block text-faint">Fonte</span>
          <select id="nm-source" className={sel} value={source} onChange={(e) => setSource(e.target.value)}>
            {Object.entries(SOURCE_NAME).map(([id, n]) => (
              <option key={id} value={id}>
                {n}
              </option>
            ))}
          </select>
        </label>
        <label className="block">
          <span className="mb-1 block text-faint">País</span>
          <input id="nm-country" className={`${sel} w-16`} maxLength={2} value={country} onChange={(e) => setCountry(e.target.value.toUpperCase())} />
        </label>
        <label className="block">
          <span className="mb-1 block text-faint">Device</span>
          <select id="nm-device" className={sel} value={device} onChange={(e) => setDevice(e.target.value)}>
            {Object.keys(DEVICES).map((d) => (
              <option key={d}>{d}</option>
            ))}
          </select>
        </label>
        <label className="block">
          <span className="mb-1 block text-faint">Lance</span>
          <select id="nm-bid" className={sel} value={bid} onChange={(e) => setBid(e.target.value)}>
            {BIDS.map((b) => (
              <option key={b}>{b}</option>
            ))}
          </select>
        </label>
      </div>
      {[
        ["Campanha no RedTrack", rt],
        ["Campanha na fonte", src],
      ].map(([label, name]) => (
        <div key={label} className="flex flex-wrap items-center gap-2">
          <span className="w-44 text-faint">{label}</span>
          <code className="rounded bg-bg px-2 py-1 text-accent">{name}</code>
          <button className="text-info hover:underline" onClick={() => copy(name)}>
            {copied === name ? "copiado ✓" : "copiar"}
          </button>
        </div>
      ))}
      <p className="text-faint">
        Mesmo produto, fonte e país nos dois nomes: a campanha da fonte liga sozinha à do RedTrack e às vendas da Shopify.
      </p>
    </div>
  );
}

/** Campaigns created/duplicated by the CRM that have no spend or clicks yet (paused, new or in review). */
function NoSpendYet({ log, known, onOpen }: { log: CampaignLogEntry[]; known: Set<string>; onOpen: (accountId: string, campaignId: string) => void }) {
  const [open, setOpen] = useState(true);
  const since = Date.now() - 30 * 86400_000;
  const seen = new Set<string>();
  const list = log.filter((l) => {
    if (!l.campaignId || l.action === "criativos" || !l.ok || new Date(l.at).getTime() < since) return false;
    if (known.has(l.campaignId) || seen.has(l.campaignId)) return false;
    seen.add(l.campaignId);
    return true;
  });
  if (!list.length) return null;
  return (
    <div className="card mt-3 px-4 py-3 text-sm">
      <button className="flex w-full items-center justify-between text-left" onClick={() => setOpen((v) => !v)}>
        <span>
          <span className="text-zinc-200">Criadas pelo CRM, ainda sem gasto ({list.length})</span>
          <span className="ml-2 text-[12px] text-muted">pausadas, em revisão ou recém-ativadas — entram na tabela quando começarem a gastar</span>
        </span>
        <span className="text-muted">{open ? "▲" : "▼"}</span>
      </button>
      {open && (
        <ul className="mt-3 divide-y divide-line">
          {list.map((l) => {
            const fails = l.failed?.length ?? l.steps.filter((x) => /^Falhou/.test(x)).length;
            return (
              <li key={l.id} className="flex items-center justify-between gap-3 py-2">
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="h-2 w-2 shrink-0 rounded-full" style={{ background: PLATFORM_COLOR[l.platform] ?? "#888" }} />
                    <span className="truncate font-mono text-xs" title={l.campaignName}>
                      {l.campaignName}
                    </span>
                  </div>
                  <div className="pl-4 text-[11px] text-faint">
                    {l.action} em {new Date(l.at).toLocaleString("pt-BR")} · id {l.campaignId} · {l.items} anúncio(s)
                    {fails > 0 && <span className="text-bad"> · {fails} criativo(s) falharam (veja em Histórico)</span>}
                  </div>
                </div>
                <button
                  className="shrink-0 rounded-md border border-line px-2 py-0.5 text-[11px] text-muted hover:text-zinc-100"
                  onClick={() => onOpen(l.accountId, l.campaignId)}
                >
                  Ver configurações e anúncios
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
