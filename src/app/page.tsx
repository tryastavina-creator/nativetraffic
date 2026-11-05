"use client";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import {
  Area,
  CartesianGrid,
  ComposedChart,
  Line,
  Cell,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { PLATFORM_COLOR, compact, int, money, pct } from "@/components/format";
import type { Metrics } from "@/lib/metrics";

type Payload = Metrics & { previous: Metrics | null };

const PRESETS = [
  ["today", "Hoje"],
  ["yesterday", "Ontem"],
  ["7d", "7 dias"],
  ["14d", "14 dias"],
  ["30d", "30 dias"],
  ["month", "Este mês"],
  ["custom", "Personalizado"],
] as const;

const COMPARE = [
  ["none", "Sem comparação"],
  ["previous", "Período anterior"],
  ["custom", "Outro período"],
] as const;

const fmtDate = (d: string) => (d ? `${d.slice(8, 10)}/${d.slice(5, 7)}/${d.slice(2, 4)}` : "");
const today = () => new Date().toISOString().slice(0, 10);
const daysAgo = (n: number) => {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return d.toISOString().slice(0, 10);
};

function loadPrefs() {
  try {
    return JSON.parse(localStorage.getItem("nt_dash") ?? "{}") as Record<string, string>;
  } catch {
    return {};
  }
}

export default function Dashboard() {
  const [preset, setPreset] = useState("14d");
  const [from, setFrom] = useState(daysAgo(13));
  const [to, setTo] = useState(today());
  const [compare, setCompare] = useState("previous");
  const [cfrom, setCfrom] = useState(daysAgo(27));
  const [cto, setCto] = useState(daysAgo(14));
  const [applied, setApplied] = useState(0); // bump to refetch custom ranges
  const [m, setM] = useState<Payload | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);

  // Remember the viewer's last choice.
  useEffect(() => {
    const p = loadPrefs();
    if (p.preset) setPreset(p.preset);
    if (p.compare) setCompare(p.compare);
    if (p.from) setFrom(p.from);
    if (p.to) setTo(p.to);
    if (p.cfrom) setCfrom(p.cfrom);
    if (p.cto) setCto(p.cto);
  }, []);

  const query = useMemo(() => {
    const q = new URLSearchParams({ preset, compare });
    if (preset === "custom") {
      q.set("from", from);
      q.set("to", to);
    }
    if (compare === "custom") {
      q.set("cfrom", cfrom);
      q.set("cto", cto);
    }
    return q.toString();
    // custom dates only apply when the user clicks "Aplicar"
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [preset, compare, applied]);

  useEffect(() => {
    setLoading(true);
    setError("");
    try {
      localStorage.setItem("nt_dash", JSON.stringify({ preset, compare, from, to, cfrom, cto }));
    } catch {}
    fetch(`/api/metrics?${query}`)
      .then(async (r) => {
        const j = await r.json();
        if (!r.ok) throw new Error(j.error ?? "Erro ao carregar");
        setM(j);
      })
      .catch((e: Error) => setError(e.message))
      .finally(() => setLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query]);

  const cur = m?.currency ?? "USD";
  const k = m?.kpis;
  const p = m?.previous?.kpis;
  const spendOk = m?.dataSources.hasSpend ?? true;
  const ordersOk = m?.dataSources.hasOrders ?? true;
  const full = spendOk && ordersOk;
  const noOrders = "Conecte a Shopify";
  const noSpend = "Aguardando custo de tráfego";

  /** % change vs comparison period. */
  const ch = (a?: number, b?: number) => (a === undefined || b === undefined ? undefined : { cur: a, prev: b });

  return (
    <div className="mx-auto max-w-[1400px]">
      <header className="flex flex-col gap-4 xl:flex-row xl:items-end xl:justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Dashboard</h1>
          <p className="mt-1 text-sm text-muted">
            {m ? `${fmtDate(m.range.from)} → ${fmtDate(m.range.to)}` : "Carregando…"}
            {m?.previous && (
              <span className="text-faint">
                {" "}
                · comparando com {fmtDate(m.previous.range.from)} → {fmtDate(m.previous.range.to)}
              </span>
            )}
            {m && (
              <span className="ml-2">
                · pedidos: {m.dataSources.orders ? <Source name={m.dataSources.orders} /> : "—"} · custo:{" "}
                {m.dataSources.spend.length ? m.dataSources.spend.map((s) => <Source key={s} name={s} />) : "—"}
                {!!m.excluded?.count && (
                  <Link href="/trafego" className="ml-1 hover:text-zinc-200" title="Campanhas marcadas como &quot;Ignorar gasto&quot; na aba Tráfego">
                    · {m.excluded.count} campanha(s) ignorada(s) (−{money(m.excluded.spend, m.currency)})
                  </Link>
                )}
              </span>
            )}
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
          <div className="flex flex-wrap items-center gap-2 text-xs">
            {preset === "custom" && (
              <span className="flex items-center gap-1.5">
                <input id="d-from" type="date" className="input w-auto py-1.5" value={from} max={to} onChange={(e) => setFrom(e.target.value)} />
                <span className="text-faint">até</span>
                <input id="d-to" type="date" className="input w-auto py-1.5" value={to} min={from} onChange={(e) => setTo(e.target.value)} />
              </span>
            )}
            <select id="d-compare" className="input w-auto py-1.5" value={compare} onChange={(e) => setCompare(e.target.value)}>
              {COMPARE.map(([id, label]) => (
                <option key={id} value={id}>
                  {label}
                </option>
              ))}
            </select>
            {compare === "custom" && (
              <span className="flex items-center gap-1.5">
                <input id="c-from" type="date" className="input w-auto py-1.5" value={cfrom} max={cto} onChange={(e) => setCfrom(e.target.value)} />
                <span className="text-faint">até</span>
                <input id="c-to" type="date" className="input w-auto py-1.5" value={cto} min={cfrom} onChange={(e) => setCto(e.target.value)} />
              </span>
            )}
            {(preset === "custom" || compare === "custom") && (
              <button className="btn-primary py-1.5" onClick={() => setApplied((n) => n + 1)}>
                Aplicar
              </button>
            )}
          </div>
        </div>
      </header>

      {error && <div className="mt-5 rounded-lg border border-bad/30 bg-bad/5 px-4 py-2 text-sm text-bad">{error}</div>}

      {m?.dataSources.demo && (
        <Banner tone="warn" action={{ href: "/integrations", label: "Conectar integrações →" }}>
          Modo demonstração — os números abaixo são fictícios até você conectar a Shopify e as fontes de tráfego.
        </Banner>
      )}
      {m && !m.dataSources.demo && !ordersOk && (
        <Banner tone="warn" action={{ href: "/integrations", label: "Conectar Shopify →" }}>
          O custo de tráfego já está chegando. Falta conectar a Shopify para ver receita, ROAS, CPA e lucro.
        </Banner>
      )}
      {m && !m.dataSources.demo && !spendOk && (
        <Banner tone="info" action={{ href: "/integrations", label: "Conectar RedTrack →" }}>
          Receita vem da Shopify. Investimento, ROAS, CPA e lucro aparecem quando o RedTrack ou as fontes de tráfego forem
          conectados.
        </Banner>
      )}
      {!!m?.warnings.length && <p className="mt-3 text-xs text-faint">{m.warnings.join(" · ")}</p>}

      <div className={`transition-opacity ${loading ? "opacity-50" : ""}`}>
        <h2 className="h-section">Resultado operacional</h2>
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
          <Kpi label="Investimento" value={k && spendOk ? money(k.investment, cur) : "—"} hint={spendOk ? "Gasto total em ads" : noSpend} change={spendOk ? ch(k?.investment, p?.investment) : undefined} invert />
          <Kpi label="Receita" value={k && ordersOk ? money(k.revenue, cur) : "—"} hint={ordersOk ? "Receita bruta Shopify" : noOrders} tone="good" change={ordersOk ? ch(k?.revenue, p?.revenue) : undefined} />
          <Kpi
            label={spendOk ? "Lucro líquido" : "Lucro antes dos ads"}
            value={k && ordersOk ? money(k.netProfit, cur) : "—"}
            hint={spendOk ? "Receita − ads − produto − frete − taxas − reembolsos" : "Receita − produto − frete − taxas − reembolsos"}
            tone={k && k.netProfit < 0 ? "bad" : "good"}
            change={ordersOk ? ch(k?.netProfit, p?.netProfit) : undefined}
          />
          <Kpi label="Margem" value={k && full ? pct(k.margin) : "—"} hint={spendOk ? "Lucro ÷ receita" : noSpend} tone={k && k.margin < 0 ? "bad" : "good"} change={full ? ch(k?.margin, p?.margin) : undefined} points />
          <Kpi label="ROAS" value={k && full ? `${k.roas.toFixed(2)}x` : "—"} hint={spendOk ? "Receita ÷ investimento" : noSpend} change={full ? ch(k?.roas, p?.roas) : undefined} />
        </div>

        <div className="mt-3 grid grid-cols-2 gap-3 lg:grid-cols-5">
          <Kpi small label="Vendas" value={k && ordersOk ? int(k.sales) : "—"} hint={k ? `${int(k.trackedSales)} com UTM de tráfego` : ""} change={ordersOk ? ch(k?.sales, p?.sales) : undefined} />
          <Kpi small label="Ticket médio" value={k && ordersOk ? money(k.aov, cur, 2) : "—"} hint="Valor por pedido" change={ordersOk ? ch(k?.aov, p?.aov) : undefined} />
          <Kpi small label="CPA real" value={k && full ? money(k.cpa, cur, 2) : "—"} hint={spendOk ? "Investimento ÷ vendas rastreadas" : noSpend} tone="warn" change={full ? ch(k?.cpa, p?.cpa) : undefined} invert />
          <Kpi small label="Upsell" value={k && ordersOk && m ? pct(m.upsell.anyRate) : "—"} hint="Pedidos com algum produto extra" tone="good" change={ordersOk && m?.previous ? ch(m.upsell.anyRate, m.previous.upsell.anyRate) : undefined} points />
          <Kpi
            small
            label="Reembolsos"
            value={k ? pct(k.refundRate, 2) : "—"}
            hint={k ? money(k.refunds, cur) : ""}
            tone={k && k.refundRate > 5 ? "bad" : undefined}
            change={ch(k?.refundRate, p?.refundRate)}
            invert
            points
          />
        </div>

        {k && ordersOk && k.checkoutSource && (
          <div className="mt-3 grid gap-3 lg:grid-cols-[1fr_1fr_2fr]">
            <Kpi
              small
              label="Checkouts iniciados"
              value={int(k.checkouts)}
              hint={
                k.checkoutSource === "shopify"
                  ? "Sessões que chegaram ao checkout (Shopify)"
                  : k.checkoutSource === "redtrack"
                    ? "InitiateCheckout do RedTrack"
                    : "Checkouts com contato preenchido (Shopify)"
              }
              change={ch(k.checkouts, p?.checkouts)}
            />
            <Kpi
              small
              label="Conversão do checkout"
              value={pct(k.checkoutConv)}
              hint="Compras ÷ checkouts iniciados"
              tone={k.checkoutConv < 20 ? "warn" : "good"}
              change={ch(k.checkoutConv, p?.checkoutConv)}
              points
            />
            {m?.funnel ? (
              <FunnelCard f={m.funnel} />
            ) : (
              <div className="card card-pad text-xs text-muted">
                {k.rtCheckouts > 0 && k.checkoutSource !== "redtrack" && <div>RedTrack: {int(k.rtCheckouts)} InitiateCheckout no período.</div>}
                <div className="mt-1 text-faint">
                  O funil completo (sessões → carrinho → checkout → compra) aparece quando a Shopify for autorizada de novo com a
                  permissão de relatórios.
                </div>
              </div>
            )}
          </div>
        )}

        {m && ordersOk && m.untracked.length > 0 && <UntrackedSales m={m} cur={cur} />}

        {m && ordersOk && m.upsell.front && <UpsellFunnel m={m} cur={cur} />}

        <h2 className="h-section">Histórico P&amp;L</h2>
        {m && <PnlChart daily={m.daily} cur={cur} />}

        <h2 className="h-section">Canais e plataformas</h2>
        <div className="grid gap-3 xl:grid-cols-[1fr_340px]">
          <div className="card overflow-x-auto">
            <table className="tbl w-full min-w-[760px]">
              <thead>
                <tr>
                  <th>Plataforma</th>
                  <th className="text-right">Pedidos</th>
                  <th className="text-right">Investimento</th>
                  <th className="text-right">Receita</th>
                  <th className="text-right">ROAS</th>
                  <th className="text-right">CPA</th>
                  <th className="text-right">Ticket</th>
                  <th className="text-right">Reemb.</th>
                  <th className="text-right">Lucro</th>
                </tr>
              </thead>
              <tbody>
                {m?.platforms.map((pl) => (
                  <tr key={pl.platform}>
                    <td>
                      <span className="flex items-center gap-2">
                        <span className="h-2 w-2 rounded-full" style={{ background: PLATFORM_COLOR[pl.platform] ?? "#888" }} />
                        {pl.label}
                      </span>
                    </td>
                    <td className="text-right">{int(pl.orders)}</td>
                    <td className="text-right text-bad">{pl.spend ? money(pl.spend, cur) : "—"}</td>
                    <td className="text-right text-accent">{money(pl.revenue, cur)}</td>
                    <td className={`text-right ${ordersOk && pl.spend && pl.roas < 1 ? "text-bad" : ""}`}>{pl.spend && ordersOk ? `${pl.roas.toFixed(2)}x` : "—"}</td>
                    <td className="text-right text-warn">{pl.spend && pl.orders ? money(pl.cpa, cur, 2) : "—"}</td>
                    <td className="text-right">{pl.orders ? money(pl.aov, cur) : "—"}</td>
                    <td className="text-right text-muted">{pct(pl.refundRate)}</td>
                    <td className={`text-right font-medium ${pl.profit < 0 ? "text-bad" : "text-accent"}`}>{full ? money(pl.profit, cur) : "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="card card-pad">
            <div className="label mb-2">{spendOk ? "Distribuição do investimento" : "Distribuição da receita"}</div>
            <div className="relative h-44">
              <ResponsiveContainer>
                <PieChart>
                  <Pie
                    data={m?.platforms.filter((pl) => (spendOk ? pl.spend : pl.revenue) > 0) ?? []}
                    dataKey={spendOk ? "spend" : "revenue"}
                    nameKey="label"
                    innerRadius={56}
                    outerRadius={76}
                    paddingAngle={2}
                    stroke="none"
                  >
                    {m?.platforms
                      .filter((pl) => (spendOk ? pl.spend : pl.revenue) > 0)
                      .map((pl) => <Cell key={pl.platform} fill={PLATFORM_COLOR[pl.platform] ?? "#888"} />)}
                  </Pie>
                </PieChart>
              </ResponsiveContainer>
              <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
                <div className="text-lg font-semibold">{k ? money(spendOk ? k.investment : k.revenue, cur) : "—"}</div>
                <div className="label">total</div>
              </div>
            </div>
            <ul className="mt-3 space-y-2 text-sm">
              {m?.platforms
                .filter((pl) => (spendOk ? pl.spend : pl.revenue) > 0)
                .map((pl) => (
                  <li key={pl.platform} className="flex items-center gap-2">
                    <span className="h-2 w-2 rounded-full" style={{ background: PLATFORM_COLOR[pl.platform] ?? "#888" }} />
                    <span className="text-zinc-300">{pl.label}</span>
                    <span className="ml-auto text-muted">
                      {pct(spendOk ? (pl.spend / (k?.investment || 1)) * 100 : (pl.revenue / (k?.revenue || 1)) * 100)}
                    </span>
                  </li>
                ))}
            </ul>
          </div>
        </div>

        <h2 className="h-section">Campanhas</h2>
        <div className="card overflow-x-auto">
          <table className="tbl w-full min-w-[680px]">
            <thead>
              <tr>
                <th>Campanha (utm_campaign)</th>
                <th>Plataforma</th>
                <th className="text-right">Pedidos</th>
                <th className="text-right">Receita</th>
                <th className="text-right">Ticket</th>
                <th className="text-right">Upsell</th>
                <th className="text-right">Última venda</th>
              </tr>
            </thead>
            <tbody>
              {m?.campaigns.map((c) => (
                <tr key={c.campaign}>
                  <td className="max-w-[280px] truncate" title={c.campaign}>
                    {c.campaign}
                  </td>
                  <td>
                    <span className="flex items-center gap-2 text-muted">
                      <span className="h-2 w-2 rounded-full" style={{ background: PLATFORM_COLOR[c.platform] ?? "#888" }} />
                      {c.label}
                    </span>
                  </td>
                  <td className="text-right">{int(c.orders)}</td>
                  <td className="text-right text-accent">{money(c.revenue, cur)}</td>
                  <td className="text-right">{money(c.aov, cur)}</td>
                  <td className="text-right">{pct(c.upsellRate, 0)}</td>
                  <td className="text-right text-muted">{fmtDate(c.lastOrder)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <h2 className="h-section">Custos e produtos</h2>
        <div className="grid gap-3 lg:grid-cols-[360px_1fr]">
          <div className="card card-pad space-y-3 text-sm">
            <CostRow label="Investimento em ads" value={spendOk ? k?.investment : undefined} cur={cur} sub={spendOk ? "" : noSpend} />
            <CostRow
              label="Custo de produto (COGS)"
              value={k?.productCost}
              cur={cur}
              sub={
                k
                  ? [
                      k.costCoverage.exact ? `${k.costCoverage.exact} pedidos com custo exato da Wiio` : "",
                      k.costCoverage.table ? `${k.costCoverage.table} pela tabela` : "",
                      k.costCoverage.estimated ? `${k.costCoverage.estimated} estimados (envie a planilha da Wiio)` : "",
                    ]
                      .filter(Boolean)
                      .join(" · ") || pct((k.productCost / (k.revenue || 1)) * 100) + " da receita"
                  : ""
              }
            />
            <CostRow label="Frete do fornecedor" value={k?.shipping} cur={cur} sub={k && k.shipping ? "Tabela da Wiio em Configurações" : "Configure a tabela de frete em Configurações"} />
            <CostRow label="Taxas de pagamento" value={k?.fees} cur={cur} sub="Configurável em Configurações" />
            <CostRow label="Reembolsos" value={k?.refunds} cur={cur} sub={k ? pct(k.refundRate, 2) + " da receita" : ""} />
          </div>
          <div className="card overflow-x-auto">
            <table className="tbl w-full min-w-[560px]">
              <thead>
                <tr>
                  <th>Produto</th>
                  <th className="text-right">Pedidos</th>
                  <th className="text-right">Unidades</th>
                  <th className="text-right">Receita</th>
                  <th className="text-right">Ticket</th>
                  <th className="text-right">COGS</th>
                </tr>
              </thead>
              <tbody>
                {m?.products.map((pr) => (
                  <tr key={pr.product}>
                    <td>{pr.product}</td>
                    <td className="text-right">{int(pr.orders)}</td>
                    <td className="text-right">{int(pr.units)}</td>
                    <td className="text-right text-accent">{money(pr.revenue, cur)}</td>
                    <td className="text-right">{money(pr.aov, cur)}</td>
                    <td className="text-right text-muted">{money(pr.cost, cur)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
}

/* ------------------------------- P&L chart ------------------------------- */

type Daily = Metrics["daily"][number];
const SERIES: { key: keyof Daily; label: string; color: string; axis: "money" | "other"; kind: "money" | "count" | "x" | "pct"; area?: boolean }[] = [
  { key: "revenue", label: "Receita", color: "#3ddc84", axis: "money", kind: "money", area: true },
  { key: "investment", label: "Investimento", color: "#e5484d", axis: "money", kind: "money", area: true },
  { key: "profit", label: "Lucro", color: "#5b8def", axis: "money", kind: "money", area: true },
  { key: "cpa", label: "CPA", color: "#f5b544", axis: "money", kind: "money" },
  { key: "sales", label: "Vendas", color: "#e4e4e7", axis: "other", kind: "count" },
  { key: "roas", label: "ROAS", color: "#a78bfa", axis: "other", kind: "x" },
  { key: "margin", label: "Margem", color: "#38bdf8", axis: "other", kind: "pct" },
];
const DEFAULT_SERIES = ["revenue", "investment", "profit"];

function PnlChart({ daily, cur }: { daily: Daily[]; cur: string }) {
  const [on, setOn] = useState<string[]>(DEFAULT_SERIES);
  useEffect(() => {
    try {
      const saved = JSON.parse(localStorage.getItem("nt_pnl_series") ?? "null");
      if (Array.isArray(saved) && saved.length) setOn(saved);
    } catch {}
  }, []);
  const toggle = (k: string) => {
    const next = on.includes(k) ? on.filter((x) => x !== k) : [...on, k];
    if (!next.length) return;
    setOn(next);
    try {
      localStorage.setItem("nt_pnl_series", JSON.stringify(next));
    } catch {}
  };
  const active = SERIES.filter((s) => on.includes(s.key));
  const hasOther = active.some((s) => s.axis === "other");
  const hasMoney = active.some((s) => s.axis === "money");
  const fmt = (kind: string, v: number) =>
    kind === "money" ? money(v, cur) : kind === "x" ? `${v.toFixed(2)}x` : kind === "pct" ? pct(v) : int(v);

  return (
    <div className="card card-pad">
      <div className="mb-4 flex flex-wrap gap-1.5">
        {SERIES.map((s) => {
          const sel = on.includes(s.key);
          return (
            <button
              key={s.key}
              onClick={() => toggle(s.key)}
              className={`flex items-center gap-1.5 rounded-md border px-2.5 py-1 text-xs transition ${sel ? "border-line bg-panel2 text-zinc-100" : "border-transparent text-faint hover:text-muted"}`}
            >
              <span className="h-2 w-2 rounded-full" style={{ background: sel ? s.color : "#3f444b" }} />
              {s.label}
            </button>
          );
        })}
      </div>
      <div className="h-72">
        <ResponsiveContainer>
          <ComposedChart data={daily} margin={{ left: 0, right: hasOther ? 0 : 8, top: 4 }}>
            <defs>
              {SERIES.filter((s) => s.area).map((s) => (
                <linearGradient key={s.key} id={`g-${s.key}`} x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor={s.color} stopOpacity={0.2} />
                  <stop offset="100%" stopColor={s.color} stopOpacity={0} />
                </linearGradient>
              ))}
            </defs>
            <CartesianGrid stroke="#1f2328" vertical={false} />
            <XAxis dataKey="date" tickFormatter={(d: string) => d.slice(8, 10) + "/" + d.slice(5, 7)} stroke="#5c636d" fontSize={11} tickLine={false} axisLine={false} />
            <YAxis yAxisId="money" hide={!hasMoney} stroke="#5c636d" fontSize={11} tickFormatter={(v: number) => compact(v)} tickLine={false} axisLine={false} width={44} />
            <YAxis yAxisId="other" orientation="right" hide={!hasOther} stroke="#5c636d" fontSize={11} tickFormatter={(v: number) => compact(v)} tickLine={false} axisLine={false} width={40} />
            <Tooltip
              contentStyle={{ background: "#16191d", border: "1px solid #1f2328", borderRadius: 8, fontSize: 12 }}
              labelFormatter={(d: string) => `${d.slice(8, 10)}/${d.slice(5, 7)}`}
              formatter={(v: number, _n: string, item: { dataKey?: string | number }) => {
                const s = SERIES.find((x) => x.key === item.dataKey);
                return [fmt(s?.kind ?? "money", v), s?.label ?? ""];
              }}
            />
            {active.map((s) =>
              s.area ? (
                <Area key={s.key} yAxisId={s.axis} type="monotone" dataKey={s.key} name={s.label} stroke={s.color} fill={`url(#g-${s.key})`} strokeWidth={2} />
              ) : (
                <Line key={s.key} yAxisId={s.axis} type="monotone" dataKey={s.key} name={s.label} stroke={s.color} strokeWidth={2} dot={false} />
              ),
            )}
          </ComposedChart>
        </ResponsiveContainer>
      </div>
      {hasOther && <p className="mt-2 text-[11px] text-faint">Valores em dinheiro no eixo da esquerda; vendas, ROAS e margem no da direita.</p>}
    </div>
  );
}

/* --------------------------------- funnel --------------------------------- */

function FunnelCard({ f }: { f: NonNullable<Metrics["funnel"]> }) {
  // Checkout is compared with sessions (links may go straight to checkout, skipping the cart);
  // purchase is compared with checkout.
  const steps = [
    { label: "Sessões", v: f.sessions, base: 0, of: "" },
    { label: "Carrinho", v: f.carts, base: f.sessions, of: "das sessões" },
    { label: "Checkout", v: f.checkouts, base: f.sessions, of: "das sessões" },
    { label: "Compra", v: f.completed, base: f.checkouts, of: "dos checkouts" },
  ];
  return (
    <div className="card card-pad">
      <div className="label mb-3">Funil da loja (Shopify)</div>
      <div className="grid grid-cols-4 gap-2">
        {steps.map((s, i) => (
          <div key={s.label}>
            <div className="text-[11px] text-faint">{s.label}</div>
            <div className="text-lg font-semibold">{int(s.v)}</div>
            {i > 0 && (
              <div className={`text-[11px] ${i === 3 && s.base && s.v / s.base < 0.2 ? "text-warn" : "text-muted"}`}>
                {s.base ? pct((s.v / s.base) * 100) : "—"} {s.of}
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

/* ---------------------------- sales without UTM --------------------------- */

function UntrackedSales({ m, cur }: { m: Payload; cur: string }) {
  return (
    <>
      <h2 className="h-section flex items-center gap-2">
        Vendas sem UTM
        <span className="rounded bg-warn/10 px-1.5 py-0.5 text-[11px] font-normal text-warn">{m.untracked.length}</span>
      </h2>
      <div className="card overflow-x-auto">
        <table className="tbl w-full min-w-[480px]">
          <thead>
            <tr>
              <th>Pedido</th>
              <th>Data</th>
              <th className="text-right">Valor</th>
              <th>Origem</th>
            </tr>
          </thead>
          <tbody>
            {m.untracked.slice(0, 30).map((o) => (
              <tr key={o.name}>
                <td className="font-medium">{o.name}</td>
                <td className="text-muted">{fmtDate(o.date)}</td>
                <td className="text-right">{money(o.total, cur, 2)}</td>
                <td className="max-w-[320px] truncate text-muted" title={o.campaign || o.referrer}>
                  {o.campaign ? `campanha "${o.campaign}"` : o.referrer || "direto / sem referência"}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}

/* ------------------------------ upsell funnel ----------------------------- */

function UpsellFunnel({ m, cur }: { m: Payload; cur: string }) {
  const u = m.upsell;
  const prev = m.previous?.upsell;
  return (
    <>
      <h2 className="h-section">Upsells e funil</h2>
      <div className="grid gap-3 lg:grid-cols-[320px_1fr]">
        <div className="card card-pad space-y-4">
          <div>
            <div className="label">Produto principal (front-end)</div>
            <div className="mt-1 font-medium">{u.front}</div>
            <div className="text-xs text-faint">{int(u.frontOrders)} pedidos no período</div>
          </div>
          <Stat label="Pedidos com algum upsell" value={pct(u.anyRate)} change={prev ? { cur: u.anyRate, prev: prev.anyRate } : undefined} />
          <Stat label="Upsell pós-compra (tag do app)" value={pct(u.postPurchaseRate)} change={prev ? { cur: u.postPurchaseRate, prev: prev.postPurchaseRate } : undefined} />
          <div>
            <div className="label mb-1.5">Produtos extras por pedido</div>
            <div className="flex flex-wrap gap-1.5">
              {u.depth.map((d) => (
                <span key={d.extras} className="rounded bg-panel2 px-2 py-1 text-xs text-muted">
                  {d.extras === 0 ? "só o principal" : `+${d.extras}`}: <b className="text-zinc-200">{int(d.orders)}</b>
                </span>
              ))}
            </div>
          </div>
        </div>

        <div className="card card-pad">
          <div className="label mb-3">Taxa de conversão de cada upsell</div>
          {u.items.length === 0 ? (
            <p className="text-sm text-muted">Nenhum produto extra vendido no período.</p>
          ) : (
            <div className="space-y-4">
              {u.items.map((it, i) => {
                const before = prev?.items.find((x) => x.product === it.product);
                return (
                  <div key={it.product}>
                    <div className="flex flex-wrap items-baseline justify-between gap-2 text-sm">
                      <span>
                        <span className="mr-2 rounded bg-accent/10 px-1.5 py-0.5 text-[11px] text-accent">UP{i + 1}</span>
                        {it.product}
                      </span>
                      <span className="flex items-baseline gap-3">
                        <span className="text-lg font-semibold">{pct(it.rate)}</span>
                        {prev && <Delta change={{ cur: it.rate, prev: before?.rate ?? 0 }} points />}
                      </span>
                    </div>
                    <div className="mt-1.5 h-2 rounded-full bg-panel2">
                      <div className="h-2 rounded-full bg-accent" style={{ width: `${Math.min(100, it.rate)}%` }} />
                    </div>
                    <div className="mt-1 text-xs text-faint">
                      {int(it.orders)} de {int(u.frontOrders)} pedidos · {money(it.revenue, cur)} · {pct(it.share)} da receita
                    </div>
                  </div>
                );
              })}
            </div>
          )}
          <p className="mt-4 text-[11px] text-faint">
            Conversão = pedidos que levaram o produto ÷ pedidos do período. UP1, UP2… seguem a ordem de quem mais converte. Um
            produto novo no funil aparece aqui sozinho.
          </p>
        </div>
      </div>
    </>
  );
}

/* --------------------------------- pieces -------------------------------- */

type Change = { cur: number; prev: number };

/** Change vs previous period. `points` shows percentage points (for rates); `invert` makes a rise red (costs). */
function Delta({ change, invert, points }: { change: Change; invert?: boolean; points?: boolean }) {
  const { cur, prev } = change;
  let text: string;
  let dir: number;
  if (points) {
    const d = cur - prev;
    dir = Math.sign(Math.round(d * 10));
    text = `${d > 0 ? "+" : ""}${d.toFixed(1)} p.p.`;
  } else if (!prev) {
    dir = cur ? 1 : 0;
    text = cur ? "novo" : "0%";
  } else {
    const d = ((cur - prev) / Math.abs(prev)) * 100;
    dir = Math.sign(Math.round(d * 10));
    text = `${d > 0 ? "+" : ""}${d.toFixed(1)}%`;
  }
  const good = invert ? dir < 0 : dir > 0;
  const cls = dir === 0 ? "text-muted" : good ? "text-accent" : "text-bad";
  return (
    <span className={`text-xs font-medium ${cls}`}>
      {dir > 0 ? "▲" : dir < 0 ? "▼" : "•"} {text}
    </span>
  );
}

function Kpi({
  label,
  value,
  hint,
  tone,
  small,
  change,
  invert,
  points,
}: {
  label: string;
  value: string;
  hint?: string;
  tone?: "good" | "bad" | "warn";
  small?: boolean;
  change?: Change;
  invert?: boolean;
  points?: boolean;
}) {
  const color = tone === "good" ? "text-accent" : tone === "bad" ? "text-bad" : tone === "warn" ? "text-warn" : "text-zinc-100";
  return (
    <div className="card card-pad">
      <div className="label">{label}</div>
      <div className={`mt-2 font-semibold tracking-tight ${small ? "text-xl" : "text-2xl"} ${color}`}>{value}</div>
      {change && value !== "—" && (
        <div className="mt-1">
          <Delta change={change} invert={invert} points={points} /> <span className="text-[11px] text-faint">vs comparação</span>
        </div>
      )}
      {hint && <div className="mt-1 text-xs text-faint">{hint}</div>}
    </div>
  );
}

function Stat({ label, value, change }: { label: string; value: string; change?: Change }) {
  return (
    <div>
      <div className="label">{label}</div>
      <div className="mt-1 flex items-baseline gap-2">
        <span className="text-xl font-semibold text-accent">{value}</span>
        {change && <Delta change={change} points />}
      </div>
    </div>
  );
}

function Banner({ tone, action, children }: { tone: "warn" | "info"; action: { href: string; label: string }; children: React.ReactNode }) {
  const cls = tone === "warn" ? "border-warn/30 bg-warn/5 text-warn" : "border-info/30 bg-info/5 text-info";
  return (
    <div className={`mt-5 flex flex-wrap items-center justify-between gap-3 rounded-xl border px-4 py-3 text-sm ${cls}`}>
      <span>{children}</span>
      <Link href={action.href} className="btn-ghost">
        {action.label}
      </Link>
    </div>
  );
}

function CostRow({ label, value, cur, sub }: { label: string; value?: number; cur: string; sub?: string }) {
  return (
    <div className="flex items-start justify-between border-b border-line pb-3 last:border-0 last:pb-0">
      <div>
        <div className="text-zinc-200">{label}</div>
        {sub && <div className="text-xs text-faint">{sub}</div>}
      </div>
      <div className="font-medium">{value === undefined ? "—" : money(value, cur)}</div>
    </div>
  );
}

function Legend({ color, label }: { color: string; label: string }) {
  return (
    <span className="flex items-center gap-1.5">
      <span className="h-2 w-2 rounded-full" style={{ background: color }} />
      {label}
    </span>
  );
}

function Source({ name }: { name: string }) {
  return (
    <span className={`ml-1 rounded px-1.5 py-0.5 text-[11px] ${name === "demo" ? "bg-warn/10 text-warn" : "bg-accent/10 text-accent"}`}>
      {name}
    </span>
  );
}
