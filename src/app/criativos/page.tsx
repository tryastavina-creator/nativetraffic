"use client";
/* eslint-disable @next/next/no-img-element */
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { int, money, pct } from "@/components/format";
import { estimateCost, IMAGE_MODELS, STYLES, VARY_MODES, type ImageModelId, type StyleId, type VaryMode } from "@/lib/creativeOptions";
import type { CreativeRow, GroupRow, Perf } from "@/lib/creatives";
import type { CreativeVariant, SavedHeadline, VariantSource } from "@/lib/store";
import { generateDescriptions } from "@/components/campaignParts";

type Payload = {
  combos: CreativeRow[];
  images: GroupRow[];
  headlines: GroupRow[];
  variants: CreativeVariant[];
  savedHeadlines: SavedHeadline[];
  products: string[];
  accounts: { id: string; label: string; platform: string }[];
  hasImageAi: boolean;
  warnings: string[];
};

type Tab = "images" | "headlines" | "combos" | "variants";
type SortKey = "spend" | "profit" | "roas" | "cpa" | "ctr" | "sales";

const PRESETS = [
  ["yesterday", "Ontem"],
  ["7d", "7 dias"],
  ["14d", "14 dias"],
  ["30d", "30 dias"],
] as const;

const SORTS: [SortKey, string][] = [
  ["spend", "Gasto"],
  ["profit", "Lucro"],
  ["roas", "ROAS"],
  ["cpa", "CPA (menor)"],
  ["ctr", "CTR"],
  ["sales", "Vendas"],
];

const PLATFORM_LABEL: Record<string, string> = { taboola: "Taboola", revcontent: "Revcontent" };
const fmtSales = (n: number) => (Number.isInteger(Math.round(n * 10) / 10) ? int(n) : n.toFixed(1));

function sortRows<T extends Perf>(rows: T[], key: SortKey): T[] {
  return [...rows].sort((a, b) => {
    if (key === "cpa") {
      // cheapest CPA first; rows without sales go last
      const av = a.sales ? a.cpa : Infinity;
      const bv = b.sales ? b.cpa : Infinity;
      return av - bv;
    }
    return (b[key] as number) - (a[key] as number);
  });
}

function sourceOf(r: CreativeRow): VariantSource {
  return {
    platform: r.platform,
    accountId: r.accountId,
    campaignId: r.campaignId,
    campaignName: r.campaignName,
    itemId: r.itemId,
    title: r.title,
    imageUrl: r.thumbnail,
    url: r.url,
    brand: r.brand,
  };
}

export default function Criativos() {
  const [preset, setPreset] = useState("7d");
  const [tab, setTab] = useState<Tab>("images");
  const [sort, setSort] = useState<SortKey>("spend");
  const [data, setData] = useState<Payload | null>(null);
  const [loading, setLoading] = useState(true);
  const [studio, setStudio] = useState<CreativeRow | null>(null);
  const [reload, setReload] = useState(0);
  const [prod, setProd] = useState<string>(""); // "" = todos · "-" = sem produto
  const [adding, setAdding] = useState(false);
  const [winnersOpen, setWinnersOpen] = useState(false);

  useEffect(() => {
    setLoading(true);
    fetch(`/api/creatives?preset=${preset}`)
      .then((r) => r.json())
      .then(setData)
      .finally(() => setLoading(false));
  }, [preset, reload]);

  const allVariants = data?.variants ?? [];
  const products = useMemo(
    () =>
      [
        ...new Set([
          ...(data?.products ?? []),
          ...allVariants.map((v) => v.product ?? "").filter(Boolean),
          ...(data?.savedHeadlines ?? []).map((h) => h.product).filter(Boolean),
        ]),
      ].sort(),
    [data, allVariants],
  );
  const inProd = (p?: string) => !prod || (prod === "-" ? !p : p === prod);
  const variants = allVariants.filter((v) => inProd(v.product));
  const images = (data?.images ?? []).filter((g) => inProd(g.product));
  const combos = (data?.combos ?? []).filter((r) => inProd(r.product));
  const headlines = (data?.headlines ?? []).filter((g) => inProd(g.product));
  const saved = (data?.savedHeadlines ?? []).filter((h) => inProd(h.product));
  const newCount = variants.filter((v) => v.status === "new").length;
  async function setProduct(key: string, product: string) {
    await fetch("/api/creatives/library", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ kind: "product", key, product }) });
    setReload((n) => n + 1);
  }

  return (
    <div className="mx-auto max-w-[1500px]">
      <header className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Criativos</h1>
          <p className="mt-1 text-sm text-muted">
            Resultado por imagem, por headline e pelo combo das duas, separado por produto. Adicione criativos do spy e gere variações.
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            <button className="btn-primary py-1.5 text-xs" disabled={!data?.hasImageAi} onClick={() => setWinnersOpen(true)} title={data?.hasImageAi ? "" : "Conecte a fal.ai em Integrações"}>
              ⚡ Variações agressivas dos vencedores
            </button>
            <button className="btn-ghost py-1.5 text-xs" onClick={() => setAdding(true)}>
              + Adicionar criativo ou headlines
            </button>
          </div>
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
        <Notice href="/integrations" action="Conectar →">
          Conecte uma conta Taboola ou Revcontent para ver os criativos.
        </Notice>
      )}
      {data && data.accounts.length > 0 && !data.hasImageAi && (
        <Notice href="/integrations" action="Conectar fal.ai →">
          Para gerar variações, conecte a fal.ai (modelos de imagem do Gemini e Seedream) em Integrações.
        </Notice>
      )}
      {!!data?.warnings.length && <p className="mt-3 text-xs text-faint">{data.warnings.join(" · ")}</p>}

      <div className="mt-6 flex flex-wrap items-center justify-between gap-3">
        <div className="flex gap-1 rounded-lg border border-line bg-panel p-1">
          {(
            [
              ["images", `Imagens${data ? ` (${images.length})` : ""}`],
              ["headlines", `Headlines${data ? ` (${headlines.length + saved.length})` : ""}`],
              ["combos", `Combos${data ? ` (${combos.length})` : ""}`],
              ["variants", `Biblioteca${newCount ? ` · ${newCount} novos` : ""}`],
            ] as [Tab, string][]
          ).map(([id, label]) => (
            <button key={id} onClick={() => setTab(id)} className={`chip ${tab === id ? "chip-on" : ""}`}>
              {label}
            </button>
          ))}
        </div>
        {tab !== "variants" && (
          <label className="flex items-center gap-2 text-xs text-muted">
            Ordenar por
            <select id="cr-sort" className="input w-auto py-1.5" value={sort} onChange={(e) => setSort(e.target.value as SortKey)}>
              {SORTS.map(([id, label]) => (
                <option key={id} value={id}>
                  {label}
                </option>
              ))}
            </select>
          </label>
        )}
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-1 text-xs">
        <span className="mr-1 text-faint">Produto:</span>
        {[["", "Todos"], ...products.map((p) => [p, p]), ["-", "Sem produto"]].map(([id, label]) => (
          <button key={id || "all"} onClick={() => setProd(id)} className={`chip border border-line ${prod === id ? "chip-on" : ""}`}>
            {label}
          </button>
        ))}
      </div>

      <div className={`mt-4 ${loading ? "opacity-50" : ""}`}>
        {tab === "images" && data && (
          <Grid>
            {sortRows(images, sort).map((g) => (
              <Card
                key={g.key}
                product={g.product}
                products={products}
                onProduct={(p) => setProduct(`img:${g.key}`, p)}
                image={g.image}
                title={g.title}
                meta={`${g.ads} anúncio(s) · ${g.campaigns.slice(0, 2).join(", ")}${g.campaigns.length > 2 ? "…" : ""}`}
                perf={g}
                canGenerate={!!data.hasImageAi}
                onGenerate={() => setStudio(g.sample)}
              />
            ))}
          </Grid>
        )}

        {tab === "combos" && data && (
          <Grid>
            {sortRows(combos, sort).map((r) => (
              <Card
                key={r.key}
                product={r.product}
                products={products}
                onProduct={(p) => setProduct(`img:${imageKey(r.thumbnail)}`, p)}
                image={r.thumbnail}
                title={r.title}
                meta={`${PLATFORM_LABEL[r.platform]} · ${r.campaignName}`}
                perf={r}
                canGenerate={!!data.hasImageAi}
                onGenerate={() => setStudio(r)}
              />
            ))}
          </Grid>
        )}

        {tab === "headlines" && data && (
          <div className="card overflow-x-auto">
            <table className="tbl w-full min-w-[900px]">
              <thead>
                <tr>
                  <th>Headline</th>
                  <th>Produto</th>
                  <th className="text-right">Anúncios</th>
                  <th className="text-right">Gasto</th>
                  <th className="text-right">CTR</th>
                  <th className="text-right">Vendas</th>
                  <th className="text-right">CPA</th>
                  <th className="text-right">ROAS</th>
                  <th className="text-right">Lucro</th>
                </tr>
              </thead>
              <tbody>
                {sortRows(headlines, sort).map((g) => (
                  <tr key={g.key}>
                    <td className="max-w-[460px]">
                      <div className="line-clamp-2">{g.title}</div>
                      <div className="text-[11px] text-faint">{g.platforms.map((p) => PLATFORM_LABEL[p]).join(", ")}</div>
                    </td>
                    <td>
                      <ProductSelect value={g.product} products={products} onChange={(p) => setProduct(`hl:${g.key}`, p)} />
                    </td>
                    <td className="text-right">{int(g.ads)}</td>
                    <td className="text-right text-bad">{money(g.spend, "USD")}</td>
                    <td className="text-right text-muted">{pct(g.ctr, 2)}</td>
                    <td className="text-right">{fmtSales(g.sales)}</td>
                    <td className="text-right text-warn">{g.sales ? money(g.cpa, "USD", 2) : "—"}</td>
                    <td className={`text-right ${g.spend && g.roas < 1 ? "text-bad" : ""}`}>{g.spend ? `${g.roas.toFixed(2)}x` : "—"}</td>
                    <td className={`text-right font-medium ${g.profit < 0 ? "text-bad" : "text-accent"}`}>{money(g.profit, "USD")}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {tab === "headlines" && data && <SavedHeadlines list={saved} products={products} onChanged={() => setReload((n) => n + 1)} />}

        {tab === "variants" && <Library variants={variants} products={products} onChanged={() => setReload((n) => n + 1)} />}

        {data && tab !== "variants" && (
          <p className="mt-3 text-[11px] text-faint">
            Vendas, receita e lucro de cada anúncio vêm da campanha dele (Shopify + custos), divididos pelas conversões que a própria
            fonte registrou em cada anúncio. Sem conversões na fonte, a divisão usa os cliques e o card mostra &quot;estimado&quot;.
          </p>
        )}
      </div>

      {winnersOpen && (
        <WinnersModal
          products={products}
          defaultProduct={prod && prod !== "-" ? prod : ""}
          onClose={() => setWinnersOpen(false)}
          onDone={() => {
            setWinnersOpen(false);
            setTab("variants");
            setReload((n) => n + 1);
          }}
        />
      )}
      {adding && (
        <AddCreative
          products={products}
          defaultProduct={prod && prod !== "-" ? prod : ""}
          onClose={() => setAdding(false)}
          onDone={(kind) => {
            setAdding(false);
            setTab(kind === "headlines" ? "headlines" : "variants");
            setReload((n) => n + 1);
          }}
        />
      )}
      {studio && (
        <Studio
          item={studio}
          onClose={() => setStudio(null)}
          onDone={() => {
            setStudio(null);
            setTab("variants");
            setReload((n) => n + 1);
          }}
        />
      )}
    </div>
  );
}

/* --------------------------------- cards --------------------------------- */

function Grid({ children }: { children: React.ReactNode }) {
  return <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">{children}</div>;
}

function Card({
  image,
  title,
  meta,
  perf,
  canGenerate,
  onGenerate,
  product,
  products,
  onProduct,
}: {
  image: string;
  title: string;
  meta: string;
  perf: Perf;
  canGenerate: boolean;
  onGenerate: () => void;
  product: string;
  products: string[];
  onProduct: (p: string) => void;
}) {
  return (
    <div className="card overflow-hidden">
      <div className="relative aspect-[16/9] bg-panel2">
        {image && <img src={image} alt="" className="h-full w-full object-cover" loading="lazy" />}
        {perf.estimated && <span className="absolute left-2 top-2 rounded bg-black/70 px-1.5 py-0.5 text-[10px] text-warn">estimado</span>}
        <div className="absolute right-2 top-2">
          <ProductSelect value={product} products={products} onChange={onProduct} overlay />
        </div>
      </div>
      <div className="space-y-3 p-4">
        <div>
          <div className="line-clamp-2 text-sm font-medium" title={title}>
            {title || "(sem título)"}
          </div>
          <div className="mt-0.5 truncate text-[11px] text-faint" title={meta}>
            {meta}
          </div>
        </div>
        <dl className="grid grid-cols-3 gap-2 text-xs">
          <Stat label="Gasto" value={money(perf.spend, "USD")} />
          <Stat label="CTR" value={pct(perf.ctr, 2)} />
          <Stat label="Vendas" value={fmtSales(perf.sales)} />
          <Stat label="CPA" value={perf.sales ? money(perf.cpa, "USD", 2) : "—"} tone="warn" />
          <Stat label="ROAS" value={perf.spend ? `${perf.roas.toFixed(2)}x` : "—"} tone={perf.spend && perf.roas < 1 ? "bad" : undefined} />
          <Stat label="Lucro" value={money(perf.profit, "USD")} tone={perf.profit < 0 ? "bad" : "good"} />
        </dl>
        <button className="btn-primary w-full justify-center" disabled={!canGenerate || !image} onClick={onGenerate}>
          Criar variações
        </button>
      </div>
    </div>
  );
}

function Stat({ label, value, tone }: { label: string; value: string; tone?: "good" | "bad" | "warn" }) {
  const c = tone === "good" ? "text-accent" : tone === "bad" ? "text-bad" : tone === "warn" ? "text-warn" : "";
  return (
    <div>
      <dt className="text-[10px] uppercase tracking-wider text-faint">{label}</dt>
      <dd className={`truncate ${c}`}>{value}</dd>
    </div>
  );
}

/* --------------------------------- studio -------------------------------- */

function Studio({ item, onClose, onDone }: { item: CreativeRow; onClose: () => void; onDone: () => void }) {
  const [model, setModel] = useState<ImageModelId>("nano-banana");
  const [quality, setQuality] = useState("1K");
  const [mode, setMode] = useState<VaryMode>("scene");
  const [style, setStyle] = useState<StyleId>("same");
  const [notes, setNotes] = useState("");
  const [prompt, setPrompt] = useState("");
  const [count, setCount] = useState(3);
  const [headline, setHeadline] = useState(item.title);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const m = IMAGE_MODELS.find((x) => x.id === model)!;
  const cost = estimateCost(model, quality, count);

  async function generate() {
    setBusy(true);
    setError("");
    const r = await fetch("/api/creatives/variants", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ source: sourceOf(item), model, quality, mode, style, notes, prompt, count, headline }),
    })
      .then((r) => r.json())
      .catch(() => ({ error: "Falha na conexão. Tente de novo." }));
    setBusy(false);
    if (r.error) return setError(r.error);
    onDone();
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm" onClick={onClose}>
      <div className="max-h-full w-full max-w-lg overflow-y-auto rounded-2xl border border-line bg-panel p-6" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between">
          <h2 className="font-semibold">{count} variações de imagem</h2>
          <button onClick={onClose} className="text-muted hover:text-zinc-100" aria-label="Fechar">
            ✕
          </button>
        </div>
        <div className="mt-4 flex gap-3">
          <img src={item.thumbnail} alt="" className="h-16 w-28 shrink-0 rounded-lg object-cover" />
          <div className="min-w-0 text-sm">
            <div className="line-clamp-2">{item.title}</div>
            <div className="truncate text-[11px] text-faint">
              {PLATFORM_LABEL[item.platform]} · {item.campaignName}
            </div>
          </div>
        </div>

        <div className="mt-5 grid grid-cols-[1fr_130px] gap-3">
          <Field label="Modelo">
            <select id="st-model" className="input py-1.5" value={model} onChange={(e) => setModel(e.target.value as ImageModelId)}>
              {IMAGE_MODELS.map((x) => (
                <option key={x.id} value={x.id}>
                  {x.label} · ${x.price.toFixed(2)}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Qualidade">
            <select id="st-quality" className="input py-1.5" value={quality} disabled={!m.qualities.length} onChange={(e) => setQuality(e.target.value)}>
              {m.qualities.length ? (
                m.qualities.map((q) => (
                  <option key={q.id} value={q.id}>
                    {q.label}
                  </option>
                ))
              ) : (
                <option>Padrão</option>
              )}
            </select>
          </Field>
        </div>
        <p className="mt-1 text-[11px] text-faint">{m.note}</p>

        <Field label="O que variar" className="mt-3">
          <select id="st-mode" className="input py-1.5" value={mode} onChange={(e) => setMode(e.target.value as VaryMode)}>
            {VARY_MODES.map((x) => (
              <option key={x.id} value={x.id}>
                {x.label}
              </option>
            ))}
          </select>
        </Field>

        {mode === "background" ? (
          <Field label="Como deve ser o fundo" className="mt-3">
            <textarea
              id="st-notes"
              className="input min-h-[64px]"
              placeholder="ex.: cozinha clara de manhã; sala com sofá bege; parede lisa verde-claro"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
            />
          </Field>
        ) : (
          <Field label="Estilo" className="mt-3">
            <select id="st-style" className="input py-1.5" value={style} onChange={(e) => setStyle(e.target.value as StyleId)}>
              {STYLES.map((x) => (
                <option key={x.id} value={x.id}>
                  {x.label}
                </option>
              ))}
            </select>
          </Field>
        )}

        <Field label="Prompt (opcional)" className="mt-3">
          <textarea
            id="st-prompt"
            className="input min-h-[64px]"
            placeholder="o que mudar, ex.: pessoa mais velha, luz do dia, cozinha ao fundo. Sem texto e sem logo."
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
          />
        </Field>

        <div className="mt-3 grid grid-cols-[1fr_96px] gap-3">
          <Field label="Headline das variações">
            <input id="st-headline" className="input py-1.5" maxLength={100} value={headline} onChange={(e) => setHeadline(e.target.value)} />
          </Field>
          <Field label="Quantidade">
            <select id="st-count" className="input py-1.5" value={count} onChange={(e) => setCount(Number(e.target.value))}>
              {[1, 2, 3, 4].map((n) => (
                <option key={n} value={n}>
                  {n}
                </option>
              ))}
            </select>
          </Field>
        </div>

        <div className="mt-4 rounded-lg bg-bg px-3 py-2 text-xs text-muted">
          <b className="text-zinc-200">Custo estimado ≈ US$ {cost.toFixed(2)}</b> · {count} × US$ {(cost / count).toFixed(2)} · as imagens ficam
          salvas em Variações para revisar antes de subir.
        </div>
        {error && <div className="mt-3 rounded-lg border border-bad/30 bg-bad/5 px-3 py-2 text-sm text-bad">{error}</div>}

        <div className="mt-5 flex justify-end gap-2">
          <button className="btn-ghost" onClick={onClose}>
            Cancelar
          </button>
          <button className="btn-primary" disabled={busy} onClick={generate}>
            {busy ? "Gerando… (até 1 min)" : `Gerar ${count} imagens (≈ US$ ${cost.toFixed(2)})`}
          </button>
        </div>
      </div>
    </div>
  );
}

function Field({ label, className = "", children }: { label: string; className?: string; children: React.ReactNode }) {
  return (
    <label className={`block ${className}`}>
      <span className="mb-1.5 block text-xs text-zinc-300">{label}</span>
      {children}
    </label>
  );
}

/* -------------------------------- library -------------------------------- */

const STATUS_LABEL = { new: "nova", published: "no ar (pausada)", archived: "arquivada" } as const;
const styleLabel = (id: string) => STYLES.find((s) => s.id === id)?.label ?? id;
const modeLabel = (id: string) => VARY_MODES.find((s) => s.id === id)?.label ?? id;

function Library({ variants, products, onChanged }: { variants: CreativeVariant[]; products: string[]; onChanged: () => void }) {
  const [filter, setFilter] = useState<"new" | "published" | "archived">("new");
  const [busy, setBusy] = useState<string | null>(null);
  const [notes, setNotes] = useState<Record<string, { ok: boolean; text: string }>>({});

  const groups = useMemo(() => {
    const g = new Map<string, CreativeVariant[]>();
    for (const v of variants.filter((x) => x.status === filter)) {
      const k = v.origin === "spy" ? `spy:${v.assetId}` : `${v.source.platform}:${v.source.itemId}`;
      g.set(k, [...(g.get(k) ?? []), v]);
    }
    return [...g.values()];
  }, [variants, filter]);

  async function patch(id: string, body: object) {
    await fetch(`/api/creatives/variants/${id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  }
  async function publish(v: CreativeVariant) {
    setBusy(v.id);
    const r = await fetch("/api/creatives/publish", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ variantId: v.id }),
    })
      .then((r) => r.json())
      .catch(() => ({ error: "Falha na conexão." }));
    setBusy(null);
    setNotes((n) => ({
      ...n,
      [v.id]: r.error ? { ok: false, text: r.error } : { ok: true, text: `Anúncio ${r.result.itemId} criado pausado (${r.result.status}).` },
    }));
    if (!r.error) onChanged();
  }

  return (
    <div>
      <div className="flex flex-wrap gap-1">
        {(["new", "published", "archived"] as const).map((f) => (
          <button key={f} onClick={() => setFilter(f)} className={`chip border border-line ${filter === f ? "chip-on" : ""}`}>
            {f === "new" ? "Novas" : f === "published" ? "Subidas" : "Arquivadas"} ({variants.filter((v) => v.status === f).length})
          </button>
        ))}
      </div>

      {groups.length === 0 && (
        <div className="card card-pad mt-4 text-sm text-muted">
          Nada aqui. Adicione criativos do spy em &quot;+ Adicionar criativo&quot; ou gere variações em Imagens / Combos. Para subir numa campanha, use
          &quot;Criar campanha&quot; ou &quot;Configurações e anúncios&quot; na aba Tráfego (Variações geradas).
        </div>
      )}

      {groups.map((vs) => {
        const s = vs[0].source;
        const spy = vs[0].origin === "spy";
        return (
          <div key={spy ? vs[0].assetId : `${s.platform}:${s.itemId}`} className="mt-6">
            <div className="mb-2 flex flex-wrap items-center gap-2 text-xs text-faint">
              {spy ? (
                <span className="rounded bg-info/15 px-1.5 py-0.5 text-[10px] text-info">ADICIONADO · {s.campaignName}</span>
              ) : (
                <span>
                  {PLATFORM_LABEL[s.platform]} · {s.campaignName}
                </span>
              )}
              <span>· {vs.length} {spy ? "headline(s)" : "variação(ões)"}</span>
              <ProductSelect
                value={vs[0].product ?? ""}
                products={products}
                onChange={async (p) => {
                  for (const v of vs)
                    await fetch("/api/creatives/library", {
                      method: "PATCH",
                      headers: { "Content-Type": "application/json" },
                      body: JSON.stringify({ kind: "variant", id: v.id, product: p }),
                    });
                  onChanged();
                }}
              />
            </div>
            <div className="flex gap-3 overflow-x-auto pb-2">
              <div className={`w-60 shrink-0 overflow-hidden rounded-xl border border-dashed border-accent/50 ${spy ? "hidden" : ""}`}>
                <div className="relative">
                  <img src={s.imageUrl} alt="" className="aspect-[16/9] w-full object-cover" />
                  <span className="absolute right-2 top-2 rounded bg-accent px-1.5 py-0.5 text-[10px] font-semibold text-black">ORIGINAL</span>
                </div>
                <div className="p-3 text-xs">
                  <div className="line-clamp-2">{s.title}</div>
                </div>
              </div>
              {vs.map((v, i) => (
                <div key={v.id} className="w-64 shrink-0 overflow-hidden rounded-xl border border-line bg-panel">
                  <div className="relative">
                    <img src={`/api/assets/${v.assetId}`} alt="" className="aspect-[16/9] w-full object-cover" loading="lazy" />
                    <span className="absolute left-2 top-2 rounded bg-black/70 px-1.5 py-0.5 text-[10px] text-accent">
                      {STATUS_LABEL[v.status]} · {spy ? `headline ${i + 1}` : `variação ${i + 1}`}
                    </span>
                  </div>
                  <div className="space-y-2 p-3 text-xs">
                    <textarea
                      aria-label="Headline"
                      className="input min-h-[52px] py-1.5 text-xs"
                      placeholder="Sem headline — escreva aqui ou na hora de subir"
                      defaultValue={v.headline}
                      maxLength={100}
                      disabled={v.status === "published"}
                      onBlur={(e) => e.target.value !== v.headline && patch(v.id, { headline: e.target.value })}
                    />
                    {v.description && <div className="line-clamp-3 text-[11px] text-muted">{v.description}</div>}
                    {!spy && (
                      <div className="flex flex-wrap gap-1">
                        <span className="rounded bg-info/10 px-1.5 py-0.5 text-[10px] text-info">{modeLabel(v.mode)}</span>
                        <span className="rounded bg-warn/10 px-1.5 py-0.5 text-[10px] text-warn">{styleLabel(v.style)}</span>
                      </div>
                    )}
                    {v.published?.map((p) => (
                      <div key={p.itemId} className="text-[11px] text-accent">
                        Anúncio {p.itemId} · {p.status}
                      </div>
                    ))}
                    {notes[v.id] && <div className={`text-[11px] ${notes[v.id].ok ? "text-accent" : "text-bad"}`}>{notes[v.id].text}</div>}
                    <div className="flex flex-wrap gap-1.5 pt-1">
                      {v.status !== "published" && !spy && (
                        <button className="btn-primary px-2.5 py-1.5 text-xs" disabled={busy === v.id} onClick={() => publish(v)}>
                          {busy === v.id ? "Subindo…" : `Subir pausado na ${PLATFORM_LABEL[s.platform]}`}
                        </button>
                      )}
                      {v.status === "new" && (
                        <button className="btn-ghost px-2.5 py-1.5 text-xs" onClick={async () => (await patch(v.id, { status: "archived" }), onChanged())}>
                          Arquivar
                        </button>
                      )}
                      {v.status === "archived" && (
                        <button className="btn-ghost px-2.5 py-1.5 text-xs" onClick={async () => (await patch(v.id, { status: "new" }), onChanged())}>
                          Restaurar
                        </button>
                      )}
                      {v.status !== "published" && (
                        <button
                          className="btn px-2.5 py-1.5 text-xs text-bad hover:bg-bad/10"
                          onClick={async () => {
                            if (!confirm("Excluir esta variação?")) return;
                            await fetch(`/api/creatives/variants/${v.id}`, { method: "DELETE" });
                            onChanged();
                          }}
                        >
                          Excluir
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        );
      })}
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

const imageKey = (u: string) => u.replace(/^https?:\/\//, "").replace(/[?#].*$/, "").toLowerCase();

function ProductSelect({ value, products, onChange, overlay }: { value: string; products: string[]; onChange: (p: string) => void; overlay?: boolean }) {
  return (
    <select
      aria-label="Produto"
      className={`rounded border px-1.5 py-0.5 text-[10px] font-semibold ${overlay ? "border-black/30 bg-black/70 text-white" : "border-line bg-panel"} ${value ? "" : "text-warn"}`}
      value={value}
      onChange={(e) => {
        let p = e.target.value;
        if (p === "__new") p = (prompt("Nome do produto (ex.: SPINEEASE):") ?? "").trim().toUpperCase();
        if (p !== "__new") onChange(p);
      }}
    >
      <option value="">{value ? "— sem produto —" : "sem produto"}</option>
      {[...new Set([...products, ...(value ? [value] : [])])].map((p) => (
        <option key={p} value={p}>
          {p}
        </option>
      ))}
      <option value="__new">+ novo produto…</option>
    </select>
  );
}

function SavedHeadlines({ list, products, onChanged }: { list: SavedHeadline[]; products: string[]; onChanged: () => void }) {
  if (!list.length) return null;
  return (
    <div className="card mt-4 overflow-x-auto">
      <div className="px-4 pt-3 text-sm font-medium">Headlines salvas ({list.length})</div>
      <table className="tbl w-full min-w-[700px]">
        <thead>
          <tr>
            <th>Headline</th>
            <th>Produto</th>
            <th>Origem</th>
            <th />
          </tr>
        </thead>
        <tbody>
          {list.map((h) => (
            <tr key={h.id}>
              <td className="max-w-[520px]">
                <div>{h.text}</div>
                {h.description && <div className="text-[11px] text-faint">{h.description}</div>}
              </td>
              <td>
                <ProductSelect
                  value={h.product}
                  products={products}
                  onChange={async (p) => {
                    await fetch("/api/creatives/library", {
                      method: "PATCH",
                      headers: { "Content-Type": "application/json" },
                      body: JSON.stringify({ kind: "headline", id: h.id, product: p }),
                    });
                    onChanged();
                  }}
                />
              </td>
              <td className="text-[11px] text-muted">{h.note ?? "—"}</td>
              <td className="text-right">
                <button
                  className="text-xs text-bad hover:underline"
                  onClick={async () => {
                    await fetch(`/api/creatives/library?headline=${h.id}`, { method: "DELETE" });
                    onChanged();
                  }}
                >
                  Excluir
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/** Adds a creative found elsewhere (spy tool, competitor…) or a batch of headlines, tied to a product. */
function AddCreative({
  products,
  defaultProduct,
  onClose,
  onDone,
}: {
  products: string[];
  defaultProduct: string;
  onClose: () => void;
  onDone: (kind: "creative" | "headlines") => void;
}) {
  const [kind, setKind] = useState<"creative" | "headlines">("creative");
  const [imageUrl, setImageUrl] = useState("");
  const [imageData, setImageData] = useState("");
  const [headlines, setHeadlines] = useState("");
  const [description, setDescription] = useState("");
  const [product, setProductName] = useState(defaultProduct || products[0] || "");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [genBusy, setGenBusy] = useState(false);
  const [error, setError] = useState("");
  const preview = imageData || imageUrl;
  const lines = headlines.split("\n").map((x) => x.trim()).filter(Boolean);

  function readFile(f?: File) {
    if (!f) return;
    if (f.size > 25 * 1024 * 1024) return setError("Imagem maior que 25 MB.");
    setError("");
    const r = new FileReader();
    r.onload = () => {
      const src = String(r.result);
      // Resize to at most 1200px wide and re-encode as JPEG (~200 KB): uploads fast and never hits size limits.
      const img = new Image();
      img.onload = () => {
        const scale = Math.min(1, 1200 / img.width);
        const canvas = document.createElement("canvas");
        canvas.width = Math.round(img.width * scale);
        canvas.height = Math.round(img.height * scale);
        const ctx = canvas.getContext("2d");
        if (!ctx) return setImageData(src);
        ctx.fillStyle = "#fff";
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
        setImageData(canvas.toDataURL("image/jpeg", 0.88));
        setImageUrl("");
      };
      img.onerror = () => setError("Não consegui ler essa imagem. Use JPG, PNG ou WebP.");
      img.src = src;
    };
    r.readAsDataURL(f);
  }
  async function save() {
    setBusy(true);
    setError("");
    const r = await fetch("/api/creatives/library", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ kind, imageUrl: imageData ? undefined : imageUrl, imageData: imageData || undefined, headlines: lines, description, product, note }),
    })
      .then(async (x) => {
        const t = await x.text();
        try {
          return JSON.parse(t);
        } catch {
          return { error: x.status === 413 ? "Imagem grande demais para enviar." : `Erro ${x.status} ao salvar. Tente de novo.` };
        }
      })
      .catch(() => ({ error: "Sem conexão com o servidor. Tente de novo." }));
    setBusy(false);
    if (r.error) return setError(r.error);
    onDone(kind);
  }

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/60 p-6 backdrop-blur-sm" onClick={onClose}>
      <div className="card card-pad w-full max-w-2xl space-y-4" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between">
          <h2 className="font-semibold">Adicionar à biblioteca</h2>
          <button className="text-muted hover:text-zinc-100" onClick={onClose} aria-label="Fechar">
            ✕
          </button>
        </div>
        <div className="flex gap-1">
          <button className={`chip border border-line ${kind === "creative" ? "chip-on" : ""}`} onClick={() => setKind("creative")}>
            Imagem (headline opcional)
          </button>
          <button className={`chip border border-line ${kind === "headlines" ? "chip-on" : ""}`} onClick={() => setKind("headlines")}>
            Só headlines
          </button>
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          <label className="block">
            <span className="mb-1.5 block text-xs text-zinc-300">Produto</span>
            <input className="input" list="nt-products" value={product} onChange={(e) => setProductName(e.target.value.toUpperCase())} placeholder="ex.: OMNIPRO" />
            <datalist id="nt-products">
              {products.map((p) => (
                <option key={p} value={p} />
              ))}
            </datalist>
          </label>
          <label className="block">
            <span className="mb-1.5 block text-xs text-zinc-300">De onde veio (opcional)</span>
            <input className="input" value={note} onChange={(e) => setNote(e.target.value)} placeholder="ex.: AdPlexity · concorrente X" />
          </label>
        </div>

        {kind === "creative" && (
          <div className="grid gap-3 sm:grid-cols-[1fr_200px]">
            <div className="space-y-2">
              <label className="block">
                <span className="mb-1.5 block text-xs text-zinc-300">Link da imagem</span>
                <input
                  className="input font-mono text-xs"
                  placeholder="https://… (o link precisa abrir a imagem direto)"
                  value={imageUrl}
                  onChange={(e) => {
                    setImageUrl(e.target.value.trim());
                    setImageData("");
                  }}
                />
              </label>
              <label className="block text-xs text-muted">
                ou envie o arquivo (JPG, PNG, WebP · até 8 MB)
                <input type="file" accept="image/png,image/jpeg,image/webp,image/gif" className="mt-1 block text-xs" onChange={(e) => readFile(e.target.files?.[0])} />
              </label>
            </div>
            <div className="flex aspect-[16/9] items-center justify-center overflow-hidden rounded-lg border border-line bg-panel2 text-[11px] text-faint">
              {preview ? <img src={preview} alt="" className="h-full w-full object-cover" /> : "prévia"}
            </div>
          </div>
        )}

        <label className="block">
          <span className="mb-1.5 block text-xs text-zinc-300">
            {kind === "creative" ? "Headlines (opcional · uma por linha — cada uma vira um criativo com esta imagem)" : "Headlines (uma por linha)"}
          </span>
          <textarea className="input h-28 text-sm" value={headlines} onChange={(e) => setHeadlines(e.target.value)} />
        </label>
        <label className="block">
          <span className="mb-1.5 flex items-center justify-between text-xs text-zinc-300">
            Descrição (opcional)
            <button
              className="text-[11px] text-info hover:underline disabled:opacity-50"
              disabled={!lines.length || genBusy}
              onClick={async () => {
                setGenBusy(true);
                const got = await generateDescriptions([{ headline: lines[0], imageUrl: imageUrl || undefined }], { product });
                setGenBusy(false);
                if (got[lines[0]]) setDescription(got[lines[0]]);
              }}
            >
              {genBusy ? "Gerando…" : "Gerar pela 1ª headline"}
            </button>
          </span>
          <textarea className="input h-16 text-xs" maxLength={250} value={description} onChange={(e) => setDescription(e.target.value)} />
        </label>

        {error && <p className="text-sm text-bad">{error}</p>}
        <div className="flex justify-end gap-2">
          <button className="btn-ghost" onClick={onClose}>
            Cancelar
          </button>
          <button
            className="btn-primary"
            disabled={busy || !product.trim() || (kind === "headlines" ? !lines.length : !preview)}
            onClick={save}
          >
            {busy ? "Salvando…" : kind === "creative" ? (lines.length > 1 ? `Salvar ${lines.length} criativos` : "Salvar criativo") : `Salvar ${lines.length || ""} headline(s)`}
          </button>
        </div>
      </div>
    </div>
  );
}

/** Generates aggressive variants of the images that made the most profit, straight into the library. */
function WinnersModal({ products, defaultProduct, onClose, onDone }: { products: string[]; defaultProduct: string; onClose: () => void; onDone: () => void }) {
  const [product, setProduct] = useState(defaultProduct);
  const [preset, setPreset] = useState("30d");
  const [winners, setWinners] = useState(3);
  const [perWinner, setPerWinner] = useState(3);
  const [model, setModel] = useState<ImageModelId>("nano-banana");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [done, setDone] = useState<{ created: number; results: { headline: string; roas: number; why: string; created: number; failed: number }[] } | null>(null);
  const price = IMAGE_MODELS.find((m) => m.id === model)?.price ?? 0.04;
  const total = winners * perWinner;

  async function run() {
    setBusy(true);
    setError("");
    const r = await fetch("/api/creatives/winners", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ product, preset, winners, perWinner, model }),
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
    setDone(r);
  }

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/60 p-6 backdrop-blur-sm" onClick={busy ? undefined : onClose}>
      <div className="card card-pad w-full max-w-xl space-y-4" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between">
          <h2 className="font-semibold">⚡ Variações agressivas dos vencedores</h2>
          {!busy && (
            <button className="text-muted hover:text-zinc-100" onClick={onClose} aria-label="Fechar">
              ✕
            </button>
          )}
        </div>
        <p className="text-xs text-muted">
          Pega as imagens que mais deram lucro, a IA analisa por que cada uma vence e cria versões mais fortes em estilos diferentes (foto de celular,
          estúdio, reportagem, contraste, emoção em close, família), sempre com o produto bem visível. Tudo vai para a Biblioteca com a headline
          vencedora e uma descrição nova.
        </p>
        {!done && (
          <>
            <div className="grid gap-3 sm:grid-cols-2">
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
                <span className="mb-1.5 block text-xs text-zinc-300">Vencedores dos últimos</span>
                <select className="input" value={preset} onChange={(e) => setPreset(e.target.value)}>
                  <option value="7d">7 dias</option>
                  <option value="14d">14 dias</option>
                  <option value="30d">30 dias</option>
                </select>
              </label>
              <label className="block">
                <span className="mb-1.5 block text-xs text-zinc-300">Quantos vencedores</span>
                <select className="input" value={winners} onChange={(e) => setWinners(Number(e.target.value))}>
                  {[1, 2, 3, 4, 5].map((n) => (
                    <option key={n} value={n}>
                      {n}
                    </option>
                  ))}
                </select>
              </label>
              <label className="block">
                <span className="mb-1.5 block text-xs text-zinc-300">Variações por vencedor</span>
                <select className="input" value={perWinner} onChange={(e) => setPerWinner(Number(e.target.value))}>
                  {[2, 3, 4].map((n) => (
                    <option key={n} value={n}>
                      {n} estilos diferentes
                    </option>
                  ))}
                </select>
              </label>
              <label className="block sm:col-span-2">
                <span className="mb-1.5 block text-xs text-zinc-300">Modelo</span>
                <select className="input" value={model} onChange={(e) => setModel(e.target.value as ImageModelId)}>
                  {IMAGE_MODELS.map((m) => (
                    <option key={m.id} value={m.id}>
                      {m.label} — {m.note} (US${m.price.toFixed(2)}/imagem)
                    </option>
                  ))}
                </select>
              </label>
            </div>
            {error && <p className="text-sm text-bad">{error}</p>}
            <div className="flex items-center justify-between">
              <span className="text-xs text-faint">
                {total} imagens · ~US${(total * price).toFixed(2)} na fal.ai
              </span>
              <button className="btn-primary" disabled={busy} onClick={run}>
                {busy ? "Analisando e gerando… (1–3 min)" : `Gerar ${total} variações`}
              </button>
            </div>
          </>
        )}
        {done && (
          <div className="space-y-3">
            <p className="text-sm text-accent">{done.created} variações criadas na Biblioteca.</p>
            <ul className="space-y-2 text-xs">
              {done.results.map((r, i) => (
                <li key={i} className="rounded-lg border border-line p-2">
                  <div className="font-medium">
                    {r.headline} <span className="text-faint">· ROAS {r.roas.toFixed(2)}</span>
                  </div>
                  {r.why && <div className="mt-0.5 text-muted">Por que vence: {r.why}</div>}
                  <div className="mt-0.5 text-faint">
                    {r.created} criadas{r.failed ? ` · ${r.failed} falharam` : ""}
                  </div>
                </li>
              ))}
            </ul>
            <div className="flex justify-end">
              <button className="btn-primary" onClick={onDone}>
                Ver na Biblioteca
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
