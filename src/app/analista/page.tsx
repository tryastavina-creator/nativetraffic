"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import type { Analysis } from "@/lib/analyst";

type Item = { id: string; at: string; product: string | null; data: { analysis: Analysis; meta: Record<string, unknown> } };

const PRESETS = [
  ["7d", "7 dias"],
  ["14d", "14 dias"],
  ["30d", "30 dias"],
] as const;

export default function Analista() {
  const [items, setItems] = useState<Item[]>([]);
  const [connected, setConnected] = useState<boolean | null>(null);
  const [products, setProducts] = useState<string[]>([]);
  const [current, setCurrent] = useState<Item | null>(null);
  const [preset, setPreset] = useState("30d");
  const [product, setProduct] = useState("");
  const [count, setCount] = useState(4);
  const [notes, setNotes] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [copied, setCopied] = useState("");

  useEffect(() => {
    fetch("/api/analyst")
      .then((r) => r.json())
      .then((d) => {
        setItems(d.analyses ?? []);
        setConnected(!!d.connected);
        if (d.analyses?.[0]) setCurrent(d.analyses[0]);
      });
    fetch("/api/creatives?preset=30d")
      .then((r) => r.json())
      .then((d) => setProducts(d.products ?? []))
      .catch(() => {});
  }, []);

  async function run() {
    setBusy(true);
    setError("");
    const r = await fetch("/api/analyst", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ preset, product, count, notes }),
    })
      .then(async (x) => {
        const t = await x.text();
        try {
          return JSON.parse(t);
        } catch {
          return { error: `Erro ${x.status}. Tente de novo.` };
        }
      })
      .catch(() => ({ error: "Sem conexão com o servidor." }));
    setBusy(false);
    if (r.error) return setError(r.error);
    setItems((cur) => [r, ...cur]);
    setCurrent(r);
  }

  const copy = async (key: string, text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(key);
      setTimeout(() => setCopied(""), 1500);
    } catch {}
  };
  async function saveHeadlines(hs: string[], description: string) {
    const p = current?.product || product;
    if (!p) return setError("Escolha um produto para salvar as headlines na biblioteca.");
    await fetch("/api/creatives/library", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ kind: "headlines", headlines: hs, description, product: p, note: "Analista" }),
    });
    setCopied("saved");
    setTimeout(() => setCopied(""), 1500);
  }

  const a = current?.data.analysis;
  const meta = current?.data.meta;

  return (
    <div className="mx-auto max-w-[1200px]">
      <h1 className="text-2xl font-semibold tracking-tight">Analista de native ads</h1>
      <p className="mt-1 text-sm text-muted">
        Um especialista em native ads lê os resultados reais dos seus anúncios (lucro, ROAS, CPA, CTR) e as imagens dos vencedores e perdedores, e
        entrega o diagnóstico mais os prompts prontos para o Gemini criar os criativos de uma campanha nova na Taboola.
      </p>

      {connected === false && (
        <div className="mt-5 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-warn/30 bg-warn/5 px-4 py-3 text-sm text-warn">
          <span>Conecte o Claude (chave da Anthropic) em Integrações para usar o analista.</span>
          <Link href="/integrations" className="btn-ghost">
            Conectar →
          </Link>
        </div>
      )}

      <div className="card card-pad mt-5 grid gap-3 sm:grid-cols-[auto_auto_auto_1fr_auto] sm:items-end">
        <label className="block">
          <span className="mb-1.5 block text-xs text-zinc-300">Período</span>
          <select className="input" value={preset} onChange={(e) => setPreset(e.target.value)}>
            {PRESETS.map(([id, l]) => (
              <option key={id} value={id}>
                {l}
              </option>
            ))}
          </select>
        </label>
        <label className="block">
          <span className="mb-1.5 block text-xs text-zinc-300">Produto</span>
          <select className="input" value={product} onChange={(e) => setProduct(e.target.value)}>
            <option value="">Todos</option>
            {products.map((p) => (
              <option key={p} value={p}>
                {p}
              </option>
            ))}
          </select>
        </label>
        <label className="block">
          <span className="mb-1.5 block text-xs text-zinc-300">Prompts</span>
          <select className="input" value={count} onChange={(e) => setCount(Number(e.target.value))}>
            {[2, 3, 4, 5, 6, 8].map((n) => (
              <option key={n} value={n}>
                {n}
              </option>
            ))}
          </select>
        </label>
        <label className="block">
          <span className="mb-1.5 block text-xs text-zinc-300">Pedido extra (opcional)</span>
          <input className="input" placeholder="ex.: campanha UK, desktop, foco em 60+" value={notes} onChange={(e) => setNotes(e.target.value)} />
        </label>
        <button className="btn-primary" disabled={busy || connected === false} onClick={run}>
          {busy ? "Analisando… (até 2 min)" : "Analisar anúncios"}
        </button>
      </div>
      {error && <p className="mt-3 text-sm text-bad">{error}</p>}

      {items.length > 1 && (
        <div className="mt-4 flex flex-wrap items-center gap-1 text-xs">
          <span className="mr-1 text-faint">Análises anteriores:</span>
          {items.slice(0, 8).map((i) => (
            <button key={i.id} onClick={() => setCurrent(i)} className={`chip border border-line ${current?.id === i.id ? "chip-on" : ""}`}>
              {new Date(i.at).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" })}
              {i.product ? ` · ${i.product}` : ""}
            </button>
          ))}
        </div>
      )}

      {a && (
        <div className="mt-5 space-y-4">
          <div className="card card-pad">
            <div className="label">Diagnóstico</div>
            <p className="mt-2 text-sm leading-relaxed">{a.summary}</p>
            {meta && (
              <p className="mt-2 text-[11px] text-faint">
                {String(meta.ads)} anúncios analisados · {String(meta.images)} imagens lidas
                {meta.product ? ` · produto ${String(meta.product)}` : ""} · {new Date(String(meta.at)).toLocaleString("pt-BR")}
              </p>
            )}
          </div>

          <div className="grid gap-4 md:grid-cols-2">
            <div className="card card-pad">
              <div className="label">O que está ganhando</div>
              <ul className="mt-2 space-y-2 text-sm">
                {a.winningPatterns.map((p, i) => (
                  <li key={i}>
                    <div className="font-medium text-accent">{p.pattern}</div>
                    <div className="text-xs text-muted">{p.evidence}</div>
                  </li>
                ))}
              </ul>
            </div>
            <div className="card card-pad">
              <div className="label">Evitar</div>
              <ul className="mt-2 list-disc space-y-1 pl-4 text-sm text-zinc-300">
                {a.losingPatterns.map((p, i) => (
                  <li key={i}>{p}</li>
                ))}
              </ul>
              <div className="label mt-4">Campanha nova na Taboola</div>
              <div className="mt-2 space-y-1 text-sm">
                <p>
                  <span className="text-faint">Ângulo: </span>
                  {a.campaignPlan.angle}
                </p>
                <p>
                  <span className="text-faint">Público: </span>
                  {a.campaignPlan.audience}
                </p>
                <p>
                  <span className="text-faint">Setup: </span>
                  {a.campaignPlan.setup}
                </p>
              </div>
            </div>
          </div>

          <div className="label pt-2">Prompts para o Gemini ({a.prompts.length})</div>
          <div className="grid gap-4 lg:grid-cols-2">
            {a.prompts.map((p, i) => (
              <div key={i} className="card card-pad space-y-3">
                <div>
                  <div className="font-medium">
                    {i + 1}. {p.title}
                  </div>
                  <div className="text-[11px] text-faint">Baseado em: {p.basedOn}</div>
                </div>
                <div className="relative rounded-lg border border-line bg-bg p-3 font-mono text-xs leading-relaxed">
                  {p.geminiPrompt}
                  <button className="absolute right-2 top-2 rounded border border-line bg-panel px-2 py-0.5 text-[10px] text-muted hover:text-zinc-100" onClick={() => copy(`p${i}`, p.geminiPrompt)}>
                    {copied === `p${i}` ? "copiado ✓" : "copiar prompt"}
                  </button>
                </div>
                <div>
                  <div className="text-[11px] text-faint">Headlines</div>
                  <ul className="mt-1 space-y-1 text-sm">
                    {p.headlines.map((h, j) => (
                      <li key={j} className="flex items-start justify-between gap-2">
                        <span>{h}</span>
                        <button className="shrink-0 text-[10px] text-info hover:underline" onClick={() => copy(`h${i}-${j}`, h)}>
                          {copied === `h${i}-${j}` ? "✓" : "copiar"}
                        </button>
                      </li>
                    ))}
                  </ul>
                </div>
                <div>
                  <div className="text-[11px] text-faint">Descrição</div>
                  <div className="flex items-start justify-between gap-2 text-sm">
                    <span>{p.description}</span>
                    <button className="shrink-0 text-[10px] text-info hover:underline" onClick={() => copy(`d${i}`, p.description)}>
                      {copied === `d${i}` ? "✓" : "copiar"}
                    </button>
                  </div>
                </div>
                <p className="text-xs text-muted">{p.why}</p>
                <button className="text-[11px] text-info hover:underline" onClick={() => saveHeadlines(p.headlines, p.description)}>
                  {copied === "saved" ? "salvas na biblioteca ✓" : "Salvar headlines e descrição na biblioteca de Criativos"}
                </button>
              </div>
            ))}
          </div>

          <div className="card card-pad">
            <div className="label">Próximos testes</div>
            <ul className="mt-2 list-disc space-y-1 pl-4 text-sm text-zinc-300">
              {a.nextTests.map((t, i) => (
                <li key={i}>{t}</li>
              ))}
            </ul>
            <p className="mt-3 text-[11px] text-faint">
              Fluxo: copie o prompt → gere a imagem no Gemini → em Criativos, “+ Adicionar” (imagem + headline) → crie a campanha em Tráfego com esses
              criativos.
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
