"use client";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { PLATFORM_COLOR, int, money, pct } from "@/components/format";
import type { TrafficReport, TrafficRow } from "@/lib/traffic";

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
  const [sort, setSort] = useState<{ key: SortKey; dir: 1 | -1 }>({ key: "spend", dir: -1 });

  const [reload, setReload] = useState(0);

  async function link(source: string, target: string | null) {
    await fetch("/api/traffic/link", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ source, target }),
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
  const platforms = useMemo(() => [...new Set((data?.rows ?? []).map((r) => r.platform))], [data]);
  const rows = useMemo(() => {
    const list = (data?.rows ?? []).filter((r) => platform === "all" || r.platform === platform);
    return [...list].sort((a, b) => (a[sort.key] - b[sort.key]) * sort.dir);
  }, [data, platform, sort]);
  const t = data?.totals;
  const showIc = !!data?.icConfigured;

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
          <h1 className="text-2xl font-semibold tracking-tight">Tráfego</h1>
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

        <div className="mt-6 flex flex-wrap gap-1">
          {["all", ...platforms].map((p) => (
            <button key={p} onClick={() => setPlatform(p)} className={`chip border border-line ${platform === p ? "chip-on" : ""}`}>
              {p === "all" ? "Todas" : (data?.rows.find((r) => r.platform === p)?.label ?? p)}
            </button>
          ))}
        </div>

        <div className="card mt-3 overflow-x-auto">
          <table className="tbl w-full min-w-[1100px]">
            <thead>
              <tr>
                <th className="text-left">Campanha</th>
                <Th k="spend">Gasto</Th>
                <Th k="clicks">Cliques</Th>
                <Th>CPC</Th>
                {showIc && <Th>IC</Th>}
                {showIc && <Th>IC %</Th>}
                <Th k="sales">Vendas</Th>
                <Th k="upsells">Upsells</Th>
                <Th>Conv. %</Th>
                <Th k="cpa">CPA real</Th>
                <Th k="revenue">Receita</Th>
                <Th k="roas">ROAS real</Th>
                <Th k="profit">Lucro real</Th>
                <Th k="roi">ROI</Th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <Row
                  key={r.key}
                  r={r}
                  cur={cur}
                  showIc={showIc}
                  targets={(data?.linkTargets ?? []).filter((t) => t.platform === r.platform)}
                  onLink={link}
                />
              ))}
              {rows.length === 0 && (
                <tr>
                  <td colSpan={15} className="py-8 text-center text-muted">
                    Nenhuma campanha com gasto ou venda no período.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
        <p className="mt-3 text-[11px] text-faint">
          Gasto vem da API da fonte quando ela está conectada (senão, do RedTrack). Vendas e upsells vêm da Shopify pelo
          código da campanha. CPA real = gasto ÷ vendas. Lucro real = receita − custo Wiio − taxas − reembolsos − gasto. O
          RedTrack conta 1 compra por venda e mais 1 por upsell.
          {!!data?.hidden && ` ${data.hidden} campanha(s) sem gasto e sem venda ocultas.`}
          {!showIc && (
            <>
              {" "}
              Para ver o IC (InitiateCheckout), informe em <Link href="/settings" className="text-info hover:underline">Configurações</Link> qual tipo
              de conversão do RedTrack é o InitiateCheckout.
            </>
          )}
        </p>
      </div>
    </div>
  );
}

function Row({
  r,
  cur,
  showIc,
  targets,
  onLink,
}: {
  r: TrafficRow;
  cur: string;
  showIc: boolean;
  targets: { key: string; name: string }[];
  onLink: (source: string, target: string | null) => void;
}) {
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
          {r.linkedBy && r.sourceNames.length > 0 && (
            <span title={r.sourceNames.join(" · ")}>
              {r.linkedBy === "link" ? "ligada pelo link do RedTrack" : r.linkedBy === "manual" ? "ligada manualmente" : "ligada pelo código"}
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
      </td>
      <td className={`text-right ${r.counted ? "text-bad" : "text-warn italic"}`}>
        {r.spend ? money(r.spend, cur) : "—"}
        {r.spendSource && (
          <div className="text-[10px] not-italic text-faint">
            {r.spendSource === "fonte" ? `API ${r.label}` : r.counted ? "RedTrack" : "RedTrack · fora do total"}
          </div>
        )}
      </td>
      <td className="text-right">{int(r.clicks)}</td>
      <td className="text-right text-muted">{r.clicks && r.spend ? money(r.cpc, cur, 3) : "—"}</td>
      {showIc && <td className="text-right">{r.ic === null ? "—" : int(r.ic)}</td>}
      {showIc && <td className="text-right text-muted">{r.icRate === null ? "—" : pct(r.icRate)}</td>}
      <td className="text-right font-medium">{int(r.sales)}</td>
      <td className="text-right">
        {int(r.upsells)}
        {r.sales > 0 && <div className="text-[10px] text-faint">{pct(r.upsellRate, 0)}</div>}
      </td>
      <td className="text-right text-muted">{r.clicks ? pct(r.cvr, 2) : "—"}</td>
      <td className="text-right text-warn">{r.sales && r.spend ? money(r.cpa, cur, 2) : "—"}</td>
      <td className="text-right text-accent">{money(r.revenue, cur)}</td>
      <td className={`text-right ${r.spend && r.roas < 1 ? "text-bad" : ""}`}>{r.spend ? `${r.roas.toFixed(2)}x` : "—"}</td>
      <td className={`text-right font-medium ${r.profit < 0 ? "text-bad" : "text-accent"}`}>{money(r.profit, cur)}</td>
      <td className={`text-right ${r.roi < 0 ? "text-bad" : "text-accent"}`}>{r.spend ? pct(r.roi, 0) : "—"}</td>
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
