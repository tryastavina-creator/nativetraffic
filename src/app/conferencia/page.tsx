"use client";
/**
 * Temporary page to reconcile Shopify against RedTrack while the tracking is
 * being validated. Remove it (and its sidebar link) once the numbers match.
 */
import { useEffect, useState } from "react";
import { int, money } from "@/components/format";
import type { Metrics, ReconRow } from "@/lib/metrics";

const PRESETS = [
  ["yesterday", "Ontem"],
  ["7d", "7 dias"],
  ["14d", "14 dias"],
  ["30d", "30 dias"],
  ["custom", "Personalizado"],
] as const;

const STATUS: Record<ReconRow["status"], { label: string; cls: string }> = {
  ok: { label: "Bate", cls: "bg-accent/10 text-accent" },
  warn: { label: "Diferença", cls: "bg-warn/10 text-warn" },
  bad: { label: "Não bate", cls: "bg-bad/10 text-bad" },
  nodata: { label: "Sem dados", cls: "bg-panel2 text-muted" },
  nosales: { label: "Gasto sem venda", cls: "bg-bad/10 text-bad" },
};

const fmtDate = (d: string) => `${d.slice(8, 10)}/${d.slice(5, 7)}`;
const daysAgo = (n: number) => {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return d.toISOString().slice(0, 10);
};

function Diff({ a, b }: { a: number; b: number }) {
  const d = b - a;
  if (!d) return <span className="text-muted">0</span>;
  return <span className={Math.abs(d) <= 1 ? "text-warn" : "text-bad"}>{d > 0 ? `+${int(d)}` : int(d)}</span>;
}

export default function Conferencia() {
  const [preset, setPreset] = useState("14d");
  const [from, setFrom] = useState(daysAgo(13));
  const [to, setTo] = useState(daysAgo(0));
  const [applied, setApplied] = useState(0);
  const [m, setM] = useState<Metrics | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const q = new URLSearchParams({ preset });
    if (preset === "custom") {
      q.set("from", from);
      q.set("to", to);
    }
    setLoading(true);
    fetch(`/api/metrics?${q}`)
      .then((r) => r.json())
      .then(setM)
      .finally(() => setLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [preset, applied]);

  const cur = m?.currency ?? "USD";
  const recon = m?.reconciliation ?? [];
  const daily = (m?.reconDaily ?? []).filter((d) => d.shopifyOrders || d.rtConversions);
  const totS = recon.reduce((a, r) => a + r.shopifyOrders, 0);
  const totR = recon.reduce((a, r) => a + r.rtConversions, 0);
  const rtSilent = recon.length > 0 && totR === 0 && totS > 0;
  const map = m?.redtrackMapping ?? {};

  return (
    <div className="mx-auto max-w-[1100px]">
      <header className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Conferência</h1>
          <p className="mt-1 max-w-xl text-sm text-muted">
            Área temporária para bater as vendas da Shopify com as conversões do RedTrack. Quando tudo bater, essa página sai
            do menu.
          </p>
        </div>
        <div className="flex flex-col gap-2 lg:items-end">
          <div className="flex flex-wrap gap-1 rounded-lg border border-line bg-panel p-1">
            {PRESETS.map(([id, label]) => (
              <button key={id} onClick={() => setPreset(id)} className={`chip ${preset === id ? "chip-on" : ""}`}>
                {label}
              </button>
            ))}
          </div>
          {preset === "custom" && (
            <div className="flex flex-wrap items-center gap-1.5 text-xs">
              <input id="cf-from" type="date" className="input w-auto py-1.5" value={from} max={to} onChange={(e) => setFrom(e.target.value)} />
              <span className="text-faint">até</span>
              <input id="cf-to" type="date" className="input w-auto py-1.5" value={to} min={from} onChange={(e) => setTo(e.target.value)} />
              <button className="btn-primary py-1.5" onClick={() => setApplied((n) => n + 1)}>
                Aplicar
              </button>
            </div>
          )}
        </div>
      </header>

      <div className={`transition-opacity ${loading ? "opacity-50" : ""}`}>
        {m && recon.length === 0 && (
          <div className="card card-pad mt-6 text-sm text-muted">Conecte a Shopify e o RedTrack para comparar as vendas.</div>
        )}

        {recon.length > 0 && (
          <>
            <div className="mt-6 grid grid-cols-2 gap-3 md:grid-cols-4">
              <Tile label="Vendas Shopify (com UTM)" value={int(totS)} />
              <Tile label="Conversões RedTrack" value={int(totR)} />
              <Tile label="Diferença" value={`${totR - totS > 0 ? "+" : ""}${int(totR - totS)}`} tone={Math.abs(totR - totS) <= 1 ? "good" : "bad"} />
              <Tile label="Vendas sem UTM" value={int(m?.untracked.length ?? 0)} tone={m?.untracked.length ? "warn" : "good"} />
            </div>

            {rtSilent && (
              <div className="mt-4 rounded-xl border border-warn/30 bg-warn/5 px-4 py-3 text-sm text-warn">
                O RedTrack não trouxe nenhuma compra neste período. Se você vê compras no painel do RedTrack, me avise: o
                campo usado pode precisar de ajuste.
              </div>
            )}

            <h2 className="h-section">Por plataforma</h2>
            <div className="card overflow-x-auto">
              <table className="tbl w-full min-w-[640px]">
                <thead>
                  <tr>
                    <th>Plataforma</th>
                    <th className="text-right">Shopify</th>
                    <th className="text-right">RedTrack</th>
                    <th className="text-right">Diferença</th>
                    <th className="text-right">Receita Shopify</th>
                    <th className="text-right">Receita RedTrack</th>
                    <th className="text-right">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {recon.map((r) => (
                    <tr key={r.platform}>
                      <td>{r.label}</td>
                      <td className="text-right">{int(r.shopifyOrders)}</td>
                      <td className="text-right">{int(r.rtConversions)}</td>
                      <td className="text-right">
                        <Diff a={r.shopifyOrders} b={r.rtConversions} />
                      </td>
                      <td className="text-right">{money(r.shopifyRevenue, cur)}</td>
                      <td className="text-right text-muted">{money(r.rtRevenue, cur)}</td>
                      <td className="text-right">
                        <span className={`whitespace-nowrap rounded px-1.5 py-0.5 text-[11px] ${STATUS[r.status].cls}`}>{STATUS[r.status].label}</span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <h2 className="h-section">Dia a dia</h2>
            <div className="card overflow-x-auto">
              {daily.length === 0 ? (
                <p className="p-4 text-sm text-muted">Nenhuma venda no período.</p>
              ) : (
                <table className="tbl w-full min-w-[560px]">
                  <thead>
                    <tr>
                      <th>Dia</th>
                      <th className="text-right">Shopify</th>
                      <th className="text-right">RedTrack</th>
                      <th className="text-right">Diferença</th>
                      <th className="text-right">Receita Shopify</th>
                      <th className="text-right">Receita RedTrack</th>
                    </tr>
                  </thead>
                  <tbody>
                    {daily.map((d) => (
                      <tr key={d.date}>
                        <td>{fmtDate(d.date)}</td>
                        <td className="text-right">{int(d.shopifyOrders)}</td>
                        <td className="text-right">{int(d.rtConversions)}</td>
                        <td className="text-right">
                          <Diff a={d.shopifyOrders} b={d.rtConversions} />
                        </td>
                        <td className="text-right">{money(d.shopifyRevenue, cur)}</td>
                        <td className="text-right text-muted">{money(d.rtRevenue, cur)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>

            <p className="mt-4 text-xs text-faint">
              Campos do RedTrack usados: compras = <code>{map.conversions ?? "—"}</code>, receita = <code>{map.revenue ?? "—"}</code>,
              custo = <code>{map.cost ?? "—"}</code>. Pequenas diferenças por dia são normais (fuso horário e hora em que o
              RedTrack registra a venda). O que importa é o total do período bater.
            </p>
          </>
        )}
      </div>
    </div>
  );
}

function Tile({ label, value, tone }: { label: string; value: string; tone?: "good" | "bad" | "warn" }) {
  const c = tone === "good" ? "text-accent" : tone === "bad" ? "text-bad" : tone === "warn" ? "text-warn" : "text-zinc-100";
  return (
    <div className="card card-pad">
      <div className="label">{label}</div>
      <div className={`mt-2 text-2xl font-semibold ${c}`}>{value}</div>
    </div>
  );
}
