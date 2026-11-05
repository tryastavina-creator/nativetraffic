"use client";
/* eslint-disable @next/next/no-img-element */
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { int, money, pct } from "@/components/format";
import type { Creative } from "@/lib/connectors/taboolaCreatives";

type Item = Creative & { accountId: string; accountLabel: string; platform: string };
type Payload = { items: Item[]; warnings: string[]; accounts: { id: string; label: string }[]; hasImageAi: boolean };

const PRESETS = [
  ["yesterday", "Ontem"],
  ["7d", "7 dias"],
  ["14d", "14 dias"],
  ["30d", "30 dias"],
] as const;

const IDEAS = [
  "mudar o cenário para uma sala de estar aconchegante",
  "trocar a pessoa por um homem de 65 anos sorrindo",
  "close-up do produto na mão, fundo desfocado",
  "luz natural de manhã, tons mais quentes",
  "cena ao ar livre, parque, final de tarde",
];

export default function Criativos() {
  const [preset, setPreset] = useState("7d");
  const [data, setData] = useState<Payload | null>(null);
  const [loading, setLoading] = useState(true);
  const [account, setAccount] = useState("all");
  const [open, setOpen] = useState<Item | null>(null);

  useEffect(() => {
    setLoading(true);
    fetch(`/api/creatives?preset=${preset}`)
      .then((r) => r.json())
      .then(setData)
      .finally(() => setLoading(false));
  }, [preset]);

  const items = useMemo(
    () => (data?.items ?? []).filter((i) => (account === "all" || i.accountId === account) && (i.spend > 0 || i.impressions > 0)),
    [data, account],
  );

  return (
    <div className="mx-auto max-w-[1400px]">
      <header className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Criativos</h1>
          <p className="mt-1 text-sm text-muted">
            Anúncios rodando na Taboola com o resultado de cada um. Gere variações com IA e suba na mesma campanha, sempre
            pausadas.
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

      {data && data.accounts.length === 0 && (
        <Notice href="/integrations" action="Conectar Taboola →">
          Conecte uma conta Taboola para ver os criativos.
        </Notice>
      )}
      {data && data.accounts.length > 0 && !data.hasImageAi && (
        <Notice href="/integrations" action="Conectar fal.ai →">
          Para gerar variações, conecte a fal.ai (modelo de imagem do Gemini) em Integrações.
        </Notice>
      )}
      {!!data?.warnings.length && <p className="mt-3 text-xs text-faint">{data.warnings.join(" · ")}</p>}

      {data && data.accounts.length > 1 && (
        <div className="mt-5 flex flex-wrap gap-1">
          {[{ id: "all", label: "Todas as contas" }, ...data.accounts].map((a) => (
            <button key={a.id} onClick={() => setAccount(a.id)} className={`chip border border-line ${account === a.id ? "chip-on" : ""}`}>
              {a.label}
            </button>
          ))}
        </div>
      )}

      <div className={`mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 ${loading ? "opacity-50" : ""}`}>
        {items.map((i) => (
          <div key={`${i.accountId}-${i.itemId}`} className="card overflow-hidden">
            <div className="aspect-[16/9] bg-panel2">
              {i.thumbnail && <img src={i.thumbnail} alt="" className="h-full w-full object-cover" loading="lazy" />}
            </div>
            <div className="space-y-3 p-4">
              <div>
                <div className="line-clamp-2 text-sm font-medium" title={i.title}>
                  {i.title || "(sem título)"}
                </div>
                <div className="mt-0.5 truncate text-[11px] text-faint" title={i.campaignName}>
                  {i.campaignName} · {i.accountLabel}
                </div>
              </div>
              <dl className="grid grid-cols-3 gap-2 text-xs">
                <Stat label="Gasto" value={money(i.spend, "USD")} />
                <Stat label="Cliques" value={int(i.clicks)} />
                <Stat label="CTR" value={pct(i.ctr, 2)} />
                <Stat label="Conv." value={int(i.conversions)} />
                <Stat label="CPA" value={i.conversions ? money(i.cpa, "USD", 2) : "—"} />
                <Stat label="Status" value={i.learning ? i.learning.replace(/_/g, " ").toLowerCase() : "—"} />
              </dl>
              <button className="btn-primary w-full justify-center" disabled={!data?.hasImageAi || !i.thumbnail} onClick={() => setOpen(i)}>
                Criar variações
              </button>
            </div>
          </div>
        ))}
        {data && data.accounts.length > 0 && items.length === 0 && !loading && (
          <div className="card card-pad col-span-full text-sm text-muted">Nenhum criativo com gasto no período.</div>
        )}
      </div>

      {open && <VariantStudio item={open} onClose={() => setOpen(null)} />}
    </div>
  );
}

type Draft = { url: string; title: string; selected: boolean; state?: "sending" | "done" | "error"; note?: string };

function VariantStudio({ item, onClose }: { item: Item; onClose: () => void }) {
  const [instruction, setInstruction] = useState("");
  const [count, setCount] = useState(2);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [drafts, setDrafts] = useState<Draft[]>([]);

  async function generate() {
    setBusy(true);
    setError("");
    const r = await fetch("/api/creatives/variants", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ imageUrl: item.thumbnail, instruction, count }),
    }).then((r) => r.json());
    setBusy(false);
    if (r.error) return setError(r.error);
    setDrafts((d) => [...(r.images as string[]).map((url) => ({ url, title: item.title, selected: true })), ...d]);
  }

  async function publish() {
    const chosen = drafts.map((d, i) => [d, i] as const).filter(([d]) => d.selected && d.state !== "done");
    for (const [d, i] of chosen) {
      setDrafts((all) => all.map((x, j) => (j === i ? { ...x, state: "sending", note: undefined } : x)));
      const r = await fetch("/api/creatives/publish", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ accountId: item.accountId, campaignId: item.campaignId, url: item.url, title: d.title, imageUrl: d.url }),
      }).then((r) => r.json());
      setDrafts((all) =>
        all.map((x, j) =>
          j === i
            ? r.error
              ? { ...x, state: "error", note: r.error }
              : { ...x, state: "done", note: `Anúncio ${r.item.id} criado pausado · aprovação: ${String(r.item.approval_state).toLowerCase()}` }
            : x,
        ),
      );
    }
  }

  const selected = drafts.filter((d) => d.selected && d.state !== "done").length;

  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-black/60 backdrop-blur-sm" onClick={onClose}>
      <div className="h-full w-full max-w-2xl overflow-y-auto border-l border-line bg-panel p-6" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-start gap-4">
          <img src={item.thumbnail} alt="" className="h-20 w-32 shrink-0 rounded-lg object-cover" />
          <div className="min-w-0 flex-1">
            <div className="font-semibold">{item.title}</div>
            <div className="mt-0.5 truncate text-xs text-faint">{item.campaignName}</div>
            <div className="mt-0.5 truncate text-[11px] text-faint" title={item.url}>
              Link: {item.url}
            </div>
          </div>
          <button onClick={onClose} className="text-muted hover:text-zinc-100" aria-label="Fechar">
            ✕
          </button>
        </div>

        <div className="mt-6 space-y-3">
          <label className="block">
            <span className="mb-1.5 block text-xs text-zinc-300">O que mudar na imagem</span>
            <textarea
              id="variant-instruction"
              className="input min-h-[80px]"
              placeholder="Ex.: trocar o cenário para uma cozinha iluminada, mesma pessoa e mesmo produto"
              value={instruction}
              onChange={(e) => setInstruction(e.target.value)}
            />
          </label>
          <div className="flex flex-wrap gap-1.5">
            {IDEAS.map((idea) => (
              <button key={idea} className="rounded-md border border-line px-2 py-1 text-[11px] text-muted hover:text-zinc-100" onClick={() => setInstruction(idea)}>
                {idea}
              </button>
            ))}
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <label className="flex items-center gap-2 text-xs text-zinc-300">
              Quantidade
              <select id="variant-count" className="input w-auto py-1.5" value={count} onChange={(e) => setCount(Number(e.target.value))}>
                {[1, 2, 3, 4].map((n) => (
                  <option key={n} value={n}>
                    {n}
                  </option>
                ))}
              </select>
            </label>
            <button className="btn-primary" disabled={busy} onClick={generate}>
              {busy ? "Gerando… (até 1 min)" : `Gerar variações · ~$${(count * 0.04).toFixed(2)}`}
            </button>
          </div>
          {error && <div className="rounded-lg border border-bad/30 bg-bad/5 px-3 py-2 text-sm text-bad">{error}</div>}
        </div>

        {drafts.length > 0 && (
          <>
            <div className="mt-6 grid gap-3 sm:grid-cols-2">
              {drafts.map((d, i) => (
                <div key={d.url} className={`rounded-lg border p-2 ${d.selected ? "border-accent/50" : "border-line"}`}>
                  <img src={d.url} alt="" className="aspect-[16/9] w-full rounded object-cover" />
                  <label className="mt-2 flex items-center gap-2 text-xs">
                    <input
                      type="checkbox"
                      checked={d.selected}
                      disabled={d.state === "done"}
                      onChange={(e) => setDrafts((all) => all.map((x, j) => (j === i ? { ...x, selected: e.target.checked } : x)))}
                    />
                    Subir esta imagem
                  </label>
                  <input
                    id={`variant-title-${i}`}
                    className="input mt-2 py-1.5 text-xs"
                    value={d.title}
                    maxLength={100}
                    disabled={d.state === "done"}
                    onChange={(e) => setDrafts((all) => all.map((x, j) => (j === i ? { ...x, title: e.target.value } : x)))}
                  />
                  {d.state === "sending" && <div className="mt-1 text-[11px] text-info">Enviando para a Taboola…</div>}
                  {d.note && <div className={`mt-1 text-[11px] ${d.state === "error" ? "text-bad" : "text-accent"}`}>{d.note}</div>}
                </div>
              ))}
            </div>
            <div className="sticky bottom-0 mt-4 flex flex-wrap items-center justify-between gap-3 border-t border-line bg-panel py-4">
              <p className="max-w-sm text-[11px] text-faint">
                Os anúncios entram na mesma campanha, com o mesmo link do RedTrack, <b>pausados</b> e marcados como gerados
                por IA. Ative na Taboola depois de revisar.
              </p>
              <button className="btn-primary" disabled={!selected} onClick={publish}>
                Subir {selected} na Taboola (pausado)
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-[10px] uppercase tracking-wider text-faint">{label}</dt>
      <dd className="truncate">{value}</dd>
    </div>
  );
}

function Notice({ href, action, children }: { href: string; action: string; children: React.ReactNode }) {
  return (
    <div className="mt-5 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-warn/30 bg-warn/5 px-4 py-3 text-sm text-warn">
      <span>{children}</span>
      <Link href={href} className="btn-ghost">
        {action}
      </Link>
    </div>
  );
}
