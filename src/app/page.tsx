"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import {
  Area,
  AreaChart,
  CartesianGrid,
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

const PRESETS = [
  ["today", "Hoje"],
  ["yesterday", "Ontem"],
  ["7d", "7 dias"],
  ["14d", "14 dias"],
  ["30d", "30 dias"],
  ["month", "Este mês"],
] as const;

export default function Dashboard() {
  const [preset, setPreset] = useState("14d");
  const [m, setM] = useState<Metrics | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    fetch(`/api/metrics?preset=${preset}`)
      .then((r) => r.json())
      .then(setM)
      .finally(() => setLoading(false));
  }, [preset]);

  const cur = m?.currency ?? "USD";
  const k = m?.kpis;
  const spendOk = m?.dataSources.hasSpend ?? true;
  const noSpend = "Aguardando custo de tráfego";

  return (
    <div className="mx-auto max-w-[1400px]">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Dashboard</h1>
          <p className="mt-1 text-sm text-muted">
            {m ? `${m.range.from} → ${m.range.to}` : "Carregando…"}
            {m && (
              <span className="ml-2">
                · pedidos: <Source name={m.dataSources.orders} /> · custo:{" "}
                {m.dataSources.spend.length ? m.dataSources.spend.map((s) => <Source key={s} name={s} />) : "—"}
              </span>
            )}
          </p>
        </div>
        <div className="flex flex-wrap gap-1 rounded-lg border border-line bg-panel p-1">
          {PRESETS.map(([id, label]) => (
            <button key={id} onClick={() => setPreset(id)} className={`chip ${preset === id ? "chip-on" : ""}`}>
              {label}
            </button>
          ))}
        </div>
      </header>

      {m?.dataSources.demo && (
        <div className="mt-5 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-warn/30 bg-warn/5 px-4 py-3 text-sm">
          <span className="text-warn">
            Modo demonstração — os números abaixo são fictícios até você conectar a Shopify e as fontes de tráfego.
          </span>
          <Link href="/integrations" className="btn-ghost">
            Conectar integrações →
          </Link>
        </div>
      )}
      {m && !m.dataSources.demo && !spendOk && (
        <div className="mt-5 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-info/30 bg-info/5 px-4 py-3 text-sm">
          <span className="text-info">
            Receita vem da Shopify. Investimento, ROAS, CPA e lucro aparecem quando o RedTrack ou as fontes de tráfego
            forem conectados.
          </span>
          <Link href="/integrations" className="btn-ghost">
            Conectar RedTrack →
          </Link>
        </div>
      )}
      {m?.warnings.map((w) => (
        <div key={w} className="mt-3 rounded-lg border border-bad/30 bg-bad/5 px-4 py-2 text-sm text-bad">
          {w}
        </div>
      ))}

      <div className={`transition-opacity ${loading ? "opacity-50" : ""}`}>
        <h2 className="h-section">Resultado operacional</h2>
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
          <Kpi label="Investimento" value={k && spendOk ? money(k.investment, cur) : "—"} hint={spendOk ? "Gasto total em ads" : noSpend} />
          <Kpi label="Receita" value={k ? money(k.revenue, cur) : "—"} hint="Receita bruta Shopify" tone="good" />
          <Kpi
            label={spendOk ? "Lucro líquido" : "Lucro antes dos ads"}
            value={k ? money(k.netProfit, cur) : "—"}
            hint={spendOk ? "Receita − ads − COGS − taxas − reembolsos" : "Receita − COGS − taxas − reembolsos"}
            tone={k && k.netProfit < 0 ? "bad" : "good"}
          />
          <Kpi label="Margem" value={k && spendOk ? pct(k.margin) : "—"} hint={spendOk ? "Lucro ÷ receita" : noSpend} tone={k && k.margin < 0 ? "bad" : "good"} />
          <Kpi label="ROAS" value={k && spendOk ? `${k.roas.toFixed(2)}x` : "—"} hint={spendOk ? "Receita ÷ investimento" : noSpend} />
        </div>

        <div className="mt-3 grid grid-cols-2 gap-3 lg:grid-cols-5">
          <Kpi small label="Vendas" value={k ? int(k.sales) : "—"} hint={k ? `${int(k.trackedSales)} com UTM de tráfego` : ""} />
          <Kpi small label="Ticket médio" value={k ? money(k.aov, cur, 2) : "—"} hint="Valor por pedido" />
          <Kpi small label="CPA real" value={k && spendOk ? money(k.cpa, cur, 2) : "—"} hint={spendOk ? "Investimento ÷ vendas rastreadas" : noSpend} tone="warn" />
          <Kpi small label="Upsell" value={k ? pct(k.upsellRate) : "—"} hint="Pedidos com upsell pós-compra" tone="good" />
          <Kpi
            small
            label="Reembolsos"
            value={k ? pct(k.refundRate, 2) : "—"}
            hint={k ? money(k.refunds, cur) : ""}
            tone={k && k.refundRate > 5 ? "bad" : undefined}
          />
        </div>

        <h2 className="h-section">Histórico P&amp;L</h2>
        <div className="card card-pad">
          <div className="mb-4 flex flex-wrap gap-4 text-xs text-muted">
            <Legend color="#3ddc84" label="Receita" />
            <Legend color="#e5484d" label="Investimento" />
            <Legend color="#5b8def" label="Lucro" />
          </div>
          <div className="h-72">
            <ResponsiveContainer>
              <AreaChart data={m?.daily ?? []} margin={{ left: 0, right: 8, top: 4 }}>
                <defs>
                  {[
                    ["rev", "#3ddc84"],
                    ["inv", "#e5484d"],
                    ["pro", "#5b8def"],
                  ].map(([id, c]) => (
                    <linearGradient key={id} id={id} x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor={c} stopOpacity={0.22} />
                      <stop offset="100%" stopColor={c} stopOpacity={0} />
                    </linearGradient>
                  ))}
                </defs>
                <CartesianGrid stroke="#1f2328" vertical={false} />
                <XAxis
                  dataKey="date"
                  tickFormatter={(d: string) => d.slice(8, 10) + "/" + d.slice(5, 7)}
                  stroke="#5c636d"
                  fontSize={11}
                  tickLine={false}
                  axisLine={false}
                />
                <YAxis stroke="#5c636d" fontSize={11} tickFormatter={(v: number) => compact(v)} tickLine={false} axisLine={false} width={44} />
                <Tooltip
                  contentStyle={{ background: "#16191d", border: "1px solid #1f2328", borderRadius: 8, fontSize: 12 }}
                  formatter={(v: number) => money(v, cur)}
                />
                <Area type="monotone" dataKey="revenue" name="Receita" stroke="#3ddc84" fill="url(#rev)" strokeWidth={2} />
                <Area type="monotone" dataKey="investment" name="Investimento" stroke="#e5484d" fill="url(#inv)" strokeWidth={2} />
                <Area type="monotone" dataKey="profit" name="Lucro" stroke="#5b8def" fill="url(#pro)" strokeWidth={2} />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>

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
                {m?.platforms.map((p) => (
                  <tr key={p.platform}>
                    <td>
                      <span className="flex items-center gap-2">
                        <span className="h-2 w-2 rounded-full" style={{ background: PLATFORM_COLOR[p.platform] ?? "#888" }} />
                        {p.label}
                      </span>
                    </td>
                    <td className="text-right">{int(p.orders)}</td>
                    <td className="text-right text-bad">{p.spend ? money(p.spend, cur) : "—"}</td>
                    <td className="text-right text-accent">{money(p.revenue, cur)}</td>
                    <td className={`text-right ${p.spend && p.roas < 1 ? "text-bad" : ""}`}>{p.spend ? `${p.roas.toFixed(2)}x` : "—"}</td>
                    <td className="text-right text-warn">{p.spend && p.orders ? money(p.cpa, cur, 2) : "—"}</td>
                    <td className="text-right">{p.orders ? money(p.aov, cur) : "—"}</td>
                    <td className="text-right text-muted">{pct(p.refundRate)}</td>
                    <td className={`text-right font-medium ${p.profit < 0 ? "text-bad" : "text-accent"}`}>{spendOk ? money(p.profit, cur) : "—"}</td>
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
                    data={m?.platforms.filter((p) => (spendOk ? p.spend : p.revenue) > 0) ?? []}
                    dataKey={spendOk ? "spend" : "revenue"}
                    nameKey="label"
                    innerRadius={56}
                    outerRadius={76}
                    paddingAngle={2}
                    stroke="none"
                  >
                    {m?.platforms
                      .filter((p) => (spendOk ? p.spend : p.revenue) > 0)
                      .map((p) => <Cell key={p.platform} fill={PLATFORM_COLOR[p.platform] ?? "#888"} />)}
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
                .filter((p) => (spendOk ? p.spend : p.revenue) > 0)
                .map((p) => (
                  <li key={p.platform} className="flex items-center gap-2">
                    <span className="h-2 w-2 rounded-full" style={{ background: PLATFORM_COLOR[p.platform] ?? "#888" }} />
                    <span className="text-zinc-300">{p.label}</span>
                    <span className="ml-auto text-muted">
                      {pct(spendOk ? (p.spend / (k?.investment || 1)) * 100 : (p.revenue / (k?.revenue || 1)) * 100)}
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
                  <td className="max-w-[280px] truncate" title={c.campaign}>{c.campaign}</td>
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
                  <td className="text-right text-muted">{c.lastOrder.slice(8, 10)}/{c.lastOrder.slice(5, 7)}</td>
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
              sub={k ? (k.cogsEstimated ? "Estimado: cadastre o custo por item na Shopify" : pct((k.productCost / (k.revenue || 1)) * 100) + " da receita") : ""}
            />
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
                {m?.products.map((p) => (
                  <tr key={p.product}>
                    <td>{p.product}</td>
                    <td className="text-right">{int(p.orders)}</td>
                    <td className="text-right">{int(p.units)}</td>
                    <td className="text-right text-accent">{money(p.revenue, cur)}</td>
                    <td className="text-right">{money(p.aov, cur)}</td>
                    <td className="text-right text-muted">{money(p.cost, cur)}</td>
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

function Kpi({
  label,
  value,
  hint,
  tone,
  small,
}: {
  label: string;
  value: string;
  hint?: string;
  tone?: "good" | "bad" | "warn";
  small?: boolean;
}) {
  const color = tone === "good" ? "text-accent" : tone === "bad" ? "text-bad" : tone === "warn" ? "text-warn" : "text-zinc-100";
  return (
    <div className="card card-pad">
      <div className="label">{label}</div>
      <div className={`mt-2 font-semibold tracking-tight ${small ? "text-xl" : "text-2xl"} ${color}`}>{value}</div>
      {hint && <div className="mt-1 text-xs text-faint">{hint}</div>}
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
