"use client";
/* eslint-disable @next/next/no-img-element */
import { useEffect, useMemo, useState } from "react";
import type { SpyAd, SpyData, SpyNiche, SpyPlayer } from "@/lib/spy";

const NICHE_LABEL: Record<string, string> = { hearing: "Audição", neuropathy: "Neuropatia" };
const DEFAULT_PRODUCT: Record<string, string> = { hearing: "OMNIPRO", neuropathy: "NEUROPREV" };
const MOVES: [string, string, string][] = [
  ["escalando", "Escalando", "bg-accent/20 text-accent"],
  ["volumando", "Volumando", "bg-info/20 text-info"],
  ["lancando", "Lançando", "bg-warn/20 text-warn"],
  ["testando", "Testando", "bg-violet-500/20 text-violet-300"],
  ["parado", "Parado", "bg-zinc-700/60 text-zinc-400"],
];
const moveOf = (m: string) => MOVES.find((x) => x[0] === m) ?? [m, m || "—", "bg-zinc-700/60 text-zinc-300"];
const br = (d: string) => (d ? d.split("-").reverse().slice(0, 2).join("/") : "—");
const num = (n: number) => n.toLocaleString("pt-BR");

type Tab = "ads" | "players" | "report" | "trends";

export default function Spy() {
  const [data, setData] = useState<SpyData | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [nicho, setNicho] = useState("hearing");
  const [tab, setTab] = useState<Tab>("ads");
  const [reload, setReload] = useState(0);

  useEffect(() => {
    setLoading(true);
    fetch("/api/spy")
      .then(async (r) => {
        const j = await r.json();
        if (!r.ok) throw new Error(j.error ?? "Erro ao carregar");
        setData(j);
        setError("");
        if (!j.niches.some((n: SpyNiche) => n.nicho === nicho) && j.niches[0]) setNicho(j.niches[0].nicho);
      })
      .catch((e: Error) => setError(e.message))
      .finally(() => setLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [reload]);

  const n = data?.niches.find((x) => x.nicho === nicho);

  return (
    <div className="mx-auto max-w-[1500px]">
      <header className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Spy de concorrentes</h1>
          <p className="mt-1 text-sm text-muted">
            O que os concorrentes estão rodando em native (Anstrex), coletado pelo bot e atualizado sozinho a cada coleta.
          </p>
          {n && (
            <p className="mt-1 text-[11px] text-faint">
              Coleta de {br(n.collectedAt)} · {num(n.totalAds)} anúncios · {n.players.length} players · {n.update}
            </p>
          )}
        </div>
        <div className="flex items-center gap-2">
          <div className="flex gap-1 rounded-lg border border-line bg-panel p-1">
            {(data?.niches ?? []).map((x) => (
              <button key={x.nicho} onClick={() => setNicho(x.nicho)} className={`chip ${nicho === x.nicho ? "chip-on" : ""}`}>
                {NICHE_LABEL[x.nicho] ?? x.nicho} ({x.ads.length})
              </button>
            ))}
          </div>
          <button className="btn-ghost py-1.5 text-xs" disabled={loading} onClick={() => setReload((r) => r + 1)}>
            {loading ? "Carregando…" : "↻ Atualizar"}
          </button>
        </div>
      </header>

      {error && <p className="mt-4 text-sm text-warn">{error}</p>}
      {!data && !error && <p className="mt-6 text-sm text-muted">Lendo a coleta do bot…</p>}

      {n && (
        <>
          <div className="mt-5 grid grid-cols-2 gap-3 md:grid-cols-4">
            {MOVES.filter(([k]) => k !== "testando").map(([k, label, cls]) => (
              <div key={k} className="card card-pad">
                <div className="flex items-center justify-between">
                  <span className="label">{label}</span>
                  <span className={`rounded px-1.5 py-0.5 text-[10px] font-semibold ${cls}`}>players</span>
                </div>
                <div className="mt-1 text-2xl font-semibold">{(n.summary[k] ?? []).length}</div>
                <div className="mt-1 line-clamp-2 text-[11px] text-faint">{(n.summary[k] ?? []).slice(0, 4).join(" · ") || "—"}</div>
              </div>
            ))}
          </div>

          <div className="mt-5 flex flex-wrap gap-1 rounded-lg border border-line bg-panel p-1 text-sm">
            {(
              [
                ["ads", `Anúncios (${n.ads.length})`],
                ["players", `Players (${n.players.length})`],
                ["report", "Padrões e ângulos"],
                ["trends", `Tendências e testes (${n.trends.length + n.promising.length})`],
              ] as [Tab, string][]
            ).map(([id, label]) => (
              <button key={id} onClick={() => setTab(id)} className={`chip ${tab === id ? "chip-on" : ""}`}>
                {label}
              </button>
            ))}
          </div>

          <div className="mt-4">
            {tab === "ads" && <Ads niche={n} />}
            {tab === "players" && <Players niche={n} />}
            {tab === "report" && (n.report ? <Markdown text={n.report.markdown} /> : <p className="text-sm text-muted">Sem relatório para este nicho ainda.</p>)}
            {tab === "trends" && <Trends niche={n} ads={n.ads} />}
          </div>
          <p className="mt-6 text-[11px] text-faint">
            Gravidade e força são do Anstrex e só se comparam dentro da mesma rede. Geo e idioma são pistas. Fonte: branch {data?.branch} do repositório
            {" "}
            {data?.repo}.
          </p>
        </>
      )}
    </div>
  );
}

function Badge({ move }: { move: string }) {
  const [, label, cls] = moveOf(move);
  return <span className={`rounded px-1.5 py-0.5 text-[10px] font-semibold ${cls}`}>{label}</span>;
}

function Ads({ niche }: { niche: SpyNiche }) {
  const [move, setMove] = useState("");
  const [network, setNetwork] = useState("");
  const [q, setQ] = useState("");
  const [onlyWhy, setOnlyWhy] = useState(false);
  const [sort, setSort] = useState<"gravity" | "recent" | "days">("gravity");
  const networks = useMemo(() => [...new Set(niche.ads.map((a) => a.network).filter(Boolean))].sort(), [niche]);
  const list = useMemo(() => {
    const t = q.trim().toLowerCase();
    return niche.ads
      .filter((a) => (!move || a.movimento === move) && (!network || a.network === network) && (!onlyWhy || a.porQue))
      .filter((a) => !t || `${a.headline} ${a.landerDomain} ${a.angleId} ${a.geo} ${a.idioma}`.toLowerCase().includes(t))
      .sort((a, b) =>
        sort === "recent" ? b.firstSeen.localeCompare(a.firstSeen) : sort === "days" ? b.days - a.days : b.gravity - a.gravity,
      );
  }, [niche, move, network, q, onlyWhy, sort]);

  return (
    <div>
      <div className="flex flex-wrap items-center gap-2 text-xs">
        <button className={`chip border border-line ${!move ? "chip-on" : ""}`} onClick={() => setMove("")}>
          Todos
        </button>
        {MOVES.map(([k, label]) => {
          const c = niche.ads.filter((a) => a.movimento === k).length;
          return c ? (
            <button key={k} className={`chip border border-line ${move === k ? "chip-on" : ""}`} onClick={() => setMove(k)}>
              {label} ({c})
            </button>
          ) : null;
        })}
        <select className="input w-auto py-1 text-xs" value={network} onChange={(e) => setNetwork(e.target.value)}>
          <option value="">Todas as redes</option>
          {networks.map((x) => (
            <option key={x} value={x}>
              {x}
            </option>
          ))}
        </select>
        <select className="input w-auto py-1 text-xs" value={sort} onChange={(e) => setSort(e.target.value as typeof sort)}>
          <option value="gravity">Maior gravidade</option>
          <option value="recent">Mais novos</option>
          <option value="days">Mais tempo rodando</option>
        </select>
        <input className="input w-48 py-1 text-xs" placeholder="Buscar headline, domínio, ângulo…" value={q} onChange={(e) => setQ(e.target.value)} />
        <label className="flex items-center gap-1.5 text-muted">
          <input type="checkbox" checked={onlyWhy} onChange={(e) => setOnlyWhy(e.target.checked)} /> só com análise do bot
        </label>
        <span className="ml-auto text-faint">{list.length} anúncios</span>
      </div>
      <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
        {list.map((a) => (
          <AdCard key={a.adId} ad={a} />
        ))}
      </div>
    </div>
  );
}

function AdCard({ ad }: { ad: SpyAd }) {
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState<"" | "busy" | "ok" | string>("");
  async function save() {
    const product = (prompt("Salvar na biblioteca de Criativos como qual produto?", DEFAULT_PRODUCT[ad.nicho] ?? "") ?? "").trim();
    if (!product) return;
    setSaving("busy");
    const r = await fetch("/api/creatives/library", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        kind: "creative",
        imageUrl: ad.thumbnail,
        headlines: [ad.headline],
        product,
        note: `Spy · ${ad.network} · ${ad.landerDomain}`.slice(0, 120),
      }),
    })
      .then((x) => x.json())
      .catch(() => ({ error: "Sem conexão." }));
    setSaving(r.error ? r.error : "ok");
  }
  return (
    <div className="card flex flex-col overflow-hidden">
      <div className="relative aspect-[16/9] bg-panel2">
        {ad.thumbnail && <img src={ad.thumbnail} alt="" referrerPolicy="no-referrer" loading="lazy" className="h-full w-full object-cover" />}
        <div className="absolute left-2 top-2 flex gap-1">
          <Badge move={ad.movimento} />
          {ad.prioridade && <span className="rounded bg-black/70 px-1.5 py-0.5 text-[10px] text-zinc-200">{ad.prioridade.replace(/_/g, " ")}</span>}
        </div>
        <span className="absolute right-2 top-2 rounded bg-black/70 px-1.5 py-0.5 text-[10px] text-zinc-200">{ad.network}</span>
      </div>
      <div className="flex flex-1 flex-col gap-2 p-3 text-xs">
        <div className="line-clamp-3 text-sm font-medium" title={ad.headline}>
          {ad.headline}
        </div>
        <div className="text-[11px] text-muted">
          {ad.landerDomain}
          {ad.geo || ad.idioma ? ` · ${[ad.geo, ad.idioma].filter(Boolean).join("/")}` : ""}
          {ad.angleId ? ` · ${ad.angleId}` : ""}
        </div>
        <dl className="grid grid-cols-3 gap-1 text-[11px]">
          <div>
            <dt className="text-faint">Gravidade</dt>
            <dd className="font-medium">{num(ad.gravity)}</dd>
          </div>
          <div>
            <dt className="text-faint">Rodando</dt>
            <dd>{ad.days ? `${ad.days} dias` : "—"}</dd>
          </div>
          <div>
            <dt className="text-faint">Visto</dt>
            <dd>
              {br(ad.firstSeen)}→{br(ad.lastSeen)}
            </dd>
          </div>
        </dl>
        {ad.porQue && (
          <button className="text-left text-[11px] text-info hover:underline" onClick={() => setOpen((v) => !v)}>
            {open ? "▾ Análise do bot" : "▸ Análise do bot"}
          </button>
        )}
        {open && ad.porQue && <p className="text-[11px] leading-relaxed text-zinc-300">{ad.porQue}</p>}
        <div className="mt-auto flex items-center justify-between gap-2 pt-1 text-[11px]">
          <a href={ad.anstrexUrl} target="_blank" rel="noreferrer" className="text-muted hover:text-zinc-100">
            Abrir no Anstrex ↗
          </a>
          <button className="text-info hover:underline disabled:opacity-50" disabled={saving === "busy" || saving === "ok"} onClick={save}>
            {saving === "busy" ? "Salvando…" : saving === "ok" ? "Na biblioteca ✓" : "Salvar na biblioteca"}
          </button>
        </div>
        {saving && saving !== "busy" && saving !== "ok" && <p className="text-[11px] text-bad">{saving}</p>}
      </div>
    </div>
  );
}

function Players({ niche }: { niche: SpyNiche }) {
  const [open, setOpen] = useState<string | null>(null);
  return (
    <div className="card overflow-x-auto">
      <table className="tbl w-full min-w-[900px]">
        <thead>
          <tr>
            <th>Domínio</th>
            <th>Status</th>
            <th>Tipo</th>
            <th>Redes</th>
            <th className="text-right">Anúncios</th>
            <th className="text-right">Maior gravidade</th>
            <th>Ângulos</th>
            <th>Visto</th>
          </tr>
        </thead>
        <tbody>
          {niche.players.map((p) => (
            <PlayerRow key={p.domain} p={p} open={open === p.domain} onToggle={() => setOpen(open === p.domain ? null : p.domain)} />
          ))}
        </tbody>
      </table>
    </div>
  );
}

const FUNNEL_LABEL: Record<string, string> = {
  leitura: "Leitura da lander",
  tipo_presell: "Presell",
  narrador: "Narrador",
  mecanismo: "Mecanismo",
  produto: "Produto",
  preco_e_kits: "Preço e kits",
  garantia: "Garantia",
};

function PlayerRow({ p, open, onToggle }: { p: SpyPlayer; open: boolean; onToggle: () => void }) {
  return (
    <>
      <tr className="cursor-pointer" onClick={onToggle}>
        <td className="font-medium">
          {open ? "▾" : "▸"} {p.domain}
          {p.typeNote && <div className="text-[11px] font-normal text-faint">{p.typeNote}</div>}
        </td>
        <td>
          <Badge move={p.status} />
        </td>
        <td className="text-muted">{p.type.replace(/_/g, " ") || "—"}</td>
        <td className="text-muted">{p.networks.join(", ")}</td>
        <td className="text-right">{p.ads}</td>
        <td className="text-right">{num(p.maxGravity)}</td>
        <td className="text-muted">{p.angles.join(", ") || "—"}</td>
        <td className="text-muted">
          {br(p.firstSeen)}→{br(p.lastSeen)}
        </td>
      </tr>
      {open && (
        <tr>
          <td colSpan={8} className="bg-black/20">
            <div className="grid gap-4 py-2 text-xs md:grid-cols-2">
              <div>
                <div className="label">Headlines</div>
                <ul className="mt-1 list-disc space-y-1 pl-4">
                  {p.headlines.slice(0, 8).map((h, i) => (
                    <li key={i}>{h}</li>
                  ))}
                </ul>
                {Object.keys(p.gravityByNetwork).length > 0 && (
                  <p className="mt-2 text-faint">
                    Gravidade por rede: {Object.entries(p.gravityByNetwork).map(([k, v]) => `${k} ${num(v)}`).join(" · ")}
                  </p>
                )}
                {p.linkedDomains.length > 0 && <p className="mt-1 text-faint">Domínios ligados: {p.linkedDomains.join(", ")}</p>}
              </div>
              <div>
                <div className="label">Funil do concorrente</div>
                <dl className="mt-1 space-y-1">
                  {Object.entries(p.funnel)
                    .filter(([k, v]) => v && k !== "tipo_player")
                    .map(([k, v]) => (
                      <div key={k}>
                        <dt className="text-faint">{FUNNEL_LABEL[k] ?? k.replace(/_/g, " ")}</dt>
                        <dd className="text-zinc-300">{v}</dd>
                      </div>
                    ))}
                  {!Object.keys(p.funnel).length && <dd className="text-faint">Sem leitura de lander.</dd>}
                </dl>
              </div>
            </div>
          </td>
        </tr>
      )}
    </>
  );
}

function Trends({ niche, ads }: { niche: SpyNiche; ads: SpyAd[] }) {
  const byId = new Map(ads.map((a) => [a.adId, a]));
  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <div className="card card-pad">
        <div className="label">Tendências</div>
        <ul className="mt-2 list-disc space-y-2 pl-4 text-sm">
          {niche.trends.map((t, i) => (
            <li key={i}>{t}</li>
          ))}
        </ul>
        {niche.diff && <p className="mt-3 text-[11px] text-faint">Desde a última coleta: {niche.diff}</p>}
      </div>
      <div className="card card-pad">
        <div className="label">Testes promissores</div>
        <ul className="mt-2 space-y-3 text-sm">
          {niche.promising.map((p) => {
            const a = byId.get(p.adId);
            return (
              <li key={p.adId} className="flex gap-3">
                {a?.thumbnail && <img src={a.thumbnail} alt="" referrerPolicy="no-referrer" className="h-14 w-24 shrink-0 rounded object-cover" />}
                <div>
                  <div className="font-medium">
                    {p.landerDomain} <span className="text-faint">· {p.network}</span>
                  </div>
                  {a?.headline && <div className="text-xs text-zinc-300">{a.headline}</div>}
                  <div className="text-xs text-muted">{p.why}</div>
                </div>
              </li>
            );
          })}
        </ul>
        <div className="label mt-4">Como o bot classifica</div>
        <ul className="mt-1 space-y-1 text-[11px] text-muted">
          {Object.entries(niche.rules).map(([k, v]) => (
            <li key={k}>
              <b className="text-zinc-300">{k.replace(/_/g, " ")}:</b> {v}
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}

/** Minimal markdown: headings, lists, tables, bold, code, paragraphs. */
function Markdown({ text }: { text: string }) {
  const inline = (s: string) =>
    s
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/\*\*(.+?)\*\*/g, "<b>$1</b>")
      .replace(/`([^`]+)`/g, '<code class="rounded bg-black/30 px-1">$1</code>');
  const out: string[] = [];
  const lines = text.split("\n");
  for (let i = 0; i < lines.length; i++) {
    const l = lines[i];
    if (/^\|/.test(l)) {
      const rows: string[] = [];
      while (i < lines.length && /^\|/.test(lines[i])) rows.push(lines[i++]);
      i--;
      const cells = (r: string) => r.replace(/^\||\|$/g, "").split("|").map((c) => c.trim());
      const body = rows.filter((r) => !/^\|[\s:|-]+\|$/.test(r));
      out.push(
        `<div class="overflow-x-auto my-3"><table class="tbl w-full text-xs"><thead><tr>${cells(body[0]).map((c) => `<th>${inline(c)}</th>`).join("")}</tr></thead><tbody>${body
          .slice(1)
          .map((r) => `<tr>${cells(r).map((c) => `<td>${inline(c)}</td>`).join("")}</tr>`)
          .join("")}</tbody></table></div>`,
      );
    } else if (/^### /.test(l)) out.push(`<h4 class="mt-4 font-semibold">${inline(l.slice(4))}</h4>`);
    else if (/^## /.test(l)) out.push(`<h3 class="mt-6 text-base font-semibold">${inline(l.slice(3))}</h3>`);
    else if (/^# /.test(l)) out.push(`<h2 class="text-lg font-semibold">${inline(l.slice(2))}</h2>`);
    else if (/^\s*[-*] /.test(l)) out.push(`<li class="ml-5 list-disc">${inline(l.replace(/^\s*[-*] /, ""))}</li>`);
    else if (l.trim()) out.push(`<p class="mt-2">${inline(l)}</p>`);
  }
  return <div className="card card-pad text-sm leading-relaxed text-zinc-300" dangerouslySetInnerHTML={{ __html: out.join("") }} />;
}
