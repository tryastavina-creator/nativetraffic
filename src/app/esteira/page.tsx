"use client";
/**
 * Ofertas e CRO › Esteira de produtos: every product from "found it running" to "scaling" (or discarded),
 * as a kanban (drag between columns) or a grid, plus the page references saved while spying.
 */
import { useEffect, useMemo, useRef, useState } from "react";
import {
  hostOf,
  PRIORITIES,
  SOURCES,
  STAGES,
  stageOf,
  thumbSrc,
  type Esteira,
  type PageRef,
  type Priority,
  type Product,
  type Stage,
} from "@/lib/esteiraShared";

type View = "kanban" | "grid";

async function api<T = unknown>(body: Record<string, unknown>): Promise<T> {
  const r = await fetch("/api/esteira", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  const d = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(d.error || "Erro ao salvar.");
  return d as T;
}

const fmtDay = (iso: string) => `${iso.slice(8, 10)}/${iso.slice(5, 7)}`;

function Icon({ d, size = 16, className = "" }: { d: string; size?: number; className?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" className={className} aria-hidden>
      <path d={d} />
    </svg>
  );
}
const IC = {
  kanban: "M5 4v16M12 4v10M19 4v6",
  grid: "M4 4h7v7H4zM13 4h7v7h-7zM4 13h7v7H4zM13 13h7v7h-7z",
  upload: "M12 16V4M7 9l5-5 5 5M4 20h16",
  download: "M12 4v12M7 11l5 5 5-5M4 20h16",
  plus: "M12 5v14M5 12h14",
  search: "M11 19a8 8 0 100-16 8 8 0 000 16zM21 21l-4.3-4.3",
  link: "M10 14a5 5 0 007 0l3-3a5 5 0 00-7-7l-1 1M14 10a5 5 0 00-7 0l-3 3a5 5 0 007 7l1-1",
  chevron: "M6 9l6 6 6-6",
  trash: "M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13",
  close: "M6 6l12 12M18 6L6 18",
  ext: "M14 4h6v6M20 4l-9 9M18 14v5a1 1 0 01-1 1H5a1 1 0 01-1-1V7a1 1 0 011-1h5",
};

function Badge({ children, cls }: { children: React.ReactNode; cls: string }) {
  return <span className={`rounded-md px-1.5 py-0.5 text-[11px] font-semibold uppercase tracking-wide ${cls}`}>{children}</span>;
}

function Thumb({ p, size = "h-14 w-16" }: { p: Product; size?: string }) {
  const src = thumbSrc(p.thumb);
  return src ? (
    // eslint-disable-next-line @next/next/no-img-element
    <img src={src} alt="" className={`${size} shrink-0 rounded-lg border border-line object-cover`} />
  ) : (
    <div className={`${size} flex shrink-0 items-center justify-center rounded-lg border border-line bg-bg text-[10px] text-faint`}>sem thumb</div>
  );
}

function Tags({ p }: { p: Product }) {
  const pr = PRIORITIES.find((x) => x.id === p.priority);
  if (!pr && !p.country && !p.source && !p.niche) return null;
  return (
    <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
      {pr && <Badge cls={pr.cls}>{pr.label}</Badge>}
      {p.country && <Badge cls="bg-info/15 text-info">{p.country}</Badge>}
      {p.source && <span className="text-xs text-muted">{p.source}</span>}
      {p.niche && <span className="text-xs text-faint">{p.source ? "· " : ""}{p.niche}</span>}
    </div>
  );
}

function Card({
  p,
  onOpen,
  dragging,
  onDragStart,
  onDragEnd,
  onDropBefore,
}: {
  p: Product;
  onOpen: () => void;
  dragging?: boolean;
  onDragStart?: () => void;
  onDragEnd?: () => void;
  onDropBefore?: () => void;
}) {
  const [over, setOver] = useState(false);
  return (
    <div
      draggable={!!onDragStart}
      onDragStart={(e) => {
        e.dataTransfer.effectAllowed = "move";
        e.dataTransfer.setData("text/plain", p.id);
        onDragStart?.();
      }}
      onDragEnd={onDragEnd}
      onDragOver={(e) => {
        if (!onDropBefore) return;
        e.preventDefault();
        setOver(true);
      }}
      onDragLeave={() => setOver(false)}
      onDrop={(e) => {
        if (!onDropBefore) return;
        e.preventDefault();
        e.stopPropagation();
        setOver(false);
        onDropBefore();
      }}
      onClick={onOpen}
      onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && (e.preventDefault(), onOpen())}
      role="button"
      aria-label={`${p.name} — abrir`}
      tabIndex={0}
      className={`flex cursor-pointer gap-3 rounded-xl border bg-panel2/60 p-2.5 text-left transition hover:border-zinc-600 ${
        over ? "border-accent/60 shadow-[0_-2px_0_0_rgba(61,220,132,0.6)]" : "border-line"
      } ${dragging ? "opacity-40" : ""}`}
    >
      <Thumb p={p} />
      <div className="min-w-0 flex-1">
        <div className="line-clamp-2 text-sm font-semibold leading-snug text-zinc-100">{p.name}</div>
        <Tags p={p} />
      </div>
    </div>
  );
}

function QuickAdd({ onAdd }: { onAdd: (name: string) => Promise<void> }) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  if (!open)
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="flex w-full items-center justify-center gap-1.5 rounded-xl border border-dashed border-line py-2 text-sm text-faint transition hover:border-zinc-600 hover:text-zinc-200"
      >
        <Icon d={IC.plus} size={14} /> adicionar
      </button>
    );
  const submit = async () => {
    if (!name.trim()) return setOpen(false);
    setBusy(true);
    try {
      await onAdd(name.trim());
      setName("");
    } finally {
      setBusy(false);
    }
  };
  return (
    <input
      autoFocus
      disabled={busy}
      value={name}
      onChange={(e) => setName(e.target.value)}
      onKeyDown={(e) => {
        if (e.key === "Enter") submit();
        if (e.key === "Escape") (setName(""), setOpen(false));
      }}
      onBlur={() => (name.trim() ? submit() : setOpen(false))}
      placeholder="Nome do produto + Enter"
      className="input"
    />
  );
}

/** Shrinks an image file to ≤480px JPEG so thumbs stay light. */
function shrink(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      const k = Math.min(1, 480 / Math.max(img.width, img.height));
      const c = document.createElement("canvas");
      c.width = Math.round(img.width * k);
      c.height = Math.round(img.height * k);
      c.getContext("2d")!.drawImage(img, 0, 0, c.width, c.height);
      URL.revokeObjectURL(img.src);
      resolve(c.toDataURL("image/jpeg", 0.82));
    };
    img.onerror = () => reject(new Error("Não consegui ler essa imagem."));
    img.src = URL.createObjectURL(file);
  });
}

function Editor({
  product,
  onClose,
  onSaved,
  onDeleted,
}: {
  product: Partial<Product> & { stage: Stage };
  onClose: () => void;
  onSaved: (p: Product) => void;
  onDeleted: (id: string) => void;
}) {
  const isNew = !product.id;
  const [f, setF] = useState<Partial<Product>>(product);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const fileRef = useRef<HTMLInputElement>(null);
  const set = (k: keyof Product, v: string) => setF((x) => ({ ...x, [k]: v }));

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  const pickFile = async (file?: File) => {
    if (!file) return;
    setErr("");
    setBusy(true);
    try {
      const { thumb } = await api<{ thumb: string }>({ action: "thumb", data: await shrink(file) });
      setF((x) => ({ ...x, thumb }));
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const save = async () => {
    setErr("");
    if (!f.name?.trim()) return setErr("Dê um nome ao produto.");
    setBusy(true);
    try {
      const fields = {
        name: f.name, stage: f.stage, priority: f.priority ?? "", country: f.country ?? "", niche: f.niche ?? "",
        source: f.source ?? "", thumb: f.thumb ?? "", adUrl: f.adUrl ?? "", lpUrl: f.lpUrl ?? "", offerUrl: f.offerUrl ?? "",
        notes: f.notes ?? "",
      };
      const { product: p } = isNew
        ? await api<{ product: Product }>({ action: "create", product: fields })
        : await api<{ product: Product }>({ action: "update", id: product.id, patch: fields });
      onSaved(p);
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const remove = async () => {
    if (!product.id || !confirm(`Excluir "${product.name}" da esteira?`)) return;
    setBusy(true);
    try {
      await api({ action: "delete", id: product.id });
      onDeleted(product.id);
    } catch (e) {
      setErr((e as Error).message);
      setBusy(false);
    }
  };

  const src = thumbSrc(f.thumb);
  const field = (label: string, k: keyof Product, ph = "", type = "text") => (
    <label className="block">
      <span className="label">{label}</span>
      <input type={type} value={(f[k] as string) ?? ""} onChange={(e) => set(k, e.target.value)} placeholder={ph} className="input mt-1" />
    </label>
  );

  return (
    <div className="fixed inset-0 z-50 flex justify-end" role="dialog" aria-modal="true" aria-label={isNew ? "Novo produto" : product.name}>
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />
      <div className="relative flex h-full w-full max-w-md flex-col border-l border-line bg-[#0c0d10]">
        <div className="flex items-center justify-between border-b border-line px-5 py-4">
          <h2 className="text-lg font-semibold">{isNew ? "Novo produto" : "Editar produto"}</h2>
          <button type="button" onClick={onClose} aria-label="Fechar" className="rounded-md p-1.5 text-faint hover:bg-panel hover:text-zinc-100">
            <Icon d={IC.close} size={18} />
          </button>
        </div>
        <div className="flex-1 space-y-4 overflow-y-auto px-5 py-5">
          <div className="flex items-center gap-3">
            {src ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={src} alt="" className="h-20 w-24 rounded-lg border border-line object-cover" />
            ) : (
              <div className="flex h-20 w-24 items-center justify-center rounded-lg border border-dashed border-line text-[11px] text-faint">sem thumb</div>
            )}
            <div className="flex flex-col gap-1.5">
              <button type="button" className="btn-ghost" disabled={busy} onClick={() => fileRef.current?.click()}>
                <Icon d={IC.upload} size={14} /> Enviar imagem
              </button>
              {f.thumb && (
                <button type="button" className="text-left text-xs text-faint hover:text-bad" onClick={() => setF((x) => ({ ...x, thumb: "" }))}>
                  Remover imagem
                </button>
              )}
              <input ref={fileRef} type="file" accept="image/png,image/jpeg,image/webp,image/gif" hidden onChange={(e) => pickFile(e.target.files?.[0])} />
            </div>
          </div>
          {field("Nome", "name", "Ex.: Magnesium - Edema")}
          <div className="grid grid-cols-2 gap-3">
            <label className="block">
              <span className="label">Etapa</span>
              <select value={f.stage} onChange={(e) => set("stage", e.target.value)} className="input mt-1">
                {STAGES.map((s) => (
                  <option key={s.id} value={s.id}>{s.label}</option>
                ))}
              </select>
            </label>
            <label className="block">
              <span className="label">Prioridade</span>
              <select value={f.priority ?? ""} onChange={(e) => set("priority", e.target.value)} className="input mt-1">
                <option value="">—</option>
                {PRIORITIES.map((p) => (
                  <option key={p.id} value={p.id}>{p.label}</option>
                ))}
              </select>
            </label>
            <label className="block">
              <span className="label">Achei rodando em</span>
              <select value={f.source ?? ""} onChange={(e) => set("source", e.target.value)} className="input mt-1">
                <option value="">—</option>
                {SOURCES.map((s) => (
                  <option key={s} value={s}>{s}</option>
                ))}
              </select>
            </label>
            <label className="block">
              <span className="label">País</span>
              <input value={f.country ?? ""} maxLength={2} onChange={(e) => set("country", e.target.value.toUpperCase())} placeholder="US" className="input mt-1 uppercase" />
            </label>
          </div>
          {field("Nicho", "niche", "Edema, articulações, neuropatia…")}
          {field("Link do anúncio", "adUrl", "https://…", "url")}
          {field("Página (LP / advertorial)", "lpUrl", "https://…", "url")}
          {field("Oferta / checkout", "offerUrl", "https://…", "url")}
          <label className="block">
            <span className="label">Notas</span>
            <textarea value={f.notes ?? ""} onChange={(e) => set("notes", e.target.value)} rows={5} placeholder="Ângulo, mecanismo, preço, o que copiar…" className="input mt-1" />
          </label>
          {!isNew && product.createdAt && (
            <p className="text-xs text-faint">Criado em {fmtDay(product.createdAt)} · atualizado em {fmtDay(product.updatedAt ?? product.createdAt)}</p>
          )}
          {err && <p className="rounded-lg border border-bad/30 bg-bad/5 px-3 py-2 text-sm text-bad">{err}</p>}
        </div>
        <div className="flex items-center gap-2 border-t border-line px-5 py-4">
          {!isNew && (
            <button type="button" onClick={remove} disabled={busy} className="btn text-faint hover:bg-bad/10 hover:text-bad">
              <Icon d={IC.trash} size={14} /> Excluir
            </button>
          )}
          <button type="button" onClick={onClose} className="btn-ghost ml-auto">Cancelar</button>
          <button type="button" onClick={save} disabled={busy} className="btn-primary">{busy ? "Salvando…" : "Salvar"}</button>
        </div>
      </div>
    </div>
  );
}

function References({ refs, setRefs }: { refs: PageRef[]; setRefs: (f: (r: PageRef[]) => PageRef[]) => void }) {
  const [open, setOpen] = useState(true);
  const [url, setUrl] = useState("");
  const [title, setTitle] = useState("");
  const [note, setNote] = useState("");
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    setErr("");
    setBusy(true);
    try {
      const { ref } = await api<{ ref: PageRef }>({ action: "addRef", ref: { url, title, note } });
      setRefs((r) => [ref, ...r]);
      setUrl("");
      setTitle("");
      setNote("");
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  const remove = async (id: string) => {
    if (!confirm("Remover esta referência?")) return;
    setRefs((r) => r.filter((x) => x.id !== id));
    await api({ action: "deleteRef", id }).catch(() => {});
  };

  return (
    <section className="card mt-6">
      <button type="button" onClick={() => setOpen((o) => !o)} aria-expanded={open} className="flex w-full items-center gap-3 px-5 py-4 text-left">
        <Icon d={IC.link} className="text-muted" />
        <span className="font-semibold">Referências de páginas</span>
        <span className="hidden text-sm text-faint sm:inline">links que gostamos durante o spy</span>
        <span className="ml-auto text-sm text-muted">{refs.length}</span>
        <Icon d={IC.chevron} size={14} className={`text-faint transition-transform ${open ? "rotate-180" : ""}`} />
      </button>
      {open && (
        <div className="border-t border-line px-5 pb-5 pt-4">
          <form onSubmit={save} className="grid gap-2 md:grid-cols-[2fr_1.2fr_2fr_auto]">
            <input value={url} onChange={(e) => setUrl(e.target.value)} placeholder="URL da página" className="input" type="url" required />
            <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="título (opcional)" className="input" />
            <input value={note} onChange={(e) => setNote(e.target.value)} placeholder="por que gostamos? (opcional)" className="input" />
            <button type="submit" disabled={busy} className="btn-primary justify-center">
              <Icon d={IC.plus} size={14} /> Salvar
            </button>
          </form>
          {err && <p className="mt-2 text-sm text-bad">{err}</p>}
          <ul className="mt-4 divide-y divide-line">
            {refs.map((r) => (
              <li key={r.id} className="group flex items-start gap-3 py-3">
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-baseline gap-x-2">
                    <a href={r.url} target="_blank" rel="noopener noreferrer" className="font-medium text-info hover:underline">
                      {r.title || hostOf(r.url)}
                    </a>
                    <span className="text-xs text-faint">{hostOf(r.url)} · {fmtDay(r.createdAt)}</span>
                  </div>
                  {r.note && <p className="mt-0.5 break-words text-sm italic text-muted">{r.note}</p>}
                </div>
                <button
                  type="button"
                  onClick={() => remove(r.id)}
                  aria-label="Remover referência"
                  className="rounded-md p-1.5 text-faint opacity-60 transition hover:bg-bad/10 hover:text-bad group-hover:opacity-100"
                >
                  <Icon d={IC.trash} size={14} />
                </button>
              </li>
            ))}
            {!refs.length && <li className="py-3 text-sm text-faint">Nenhuma referência ainda. Cole acima o link de uma página que chamou atenção.</li>}
          </ul>
        </div>
      )}
    </section>
  );
}

const VIEW_KEY = "nt.esteira.view";

export default function EsteiraPage() {
  const [data, setData] = useState<Esteira | null>(null);
  const [loadErr, setLoadErr] = useState("");
  const [view, setView] = useState<View>("kanban");
  const [q, setQ] = useState("");
  const [prio, setPrio] = useState<"" | Priority>("");
  const [country, setCountry] = useState("");
  const [editing, setEditing] = useState<(Partial<Product> & { stage: Stage }) | null>(null);
  const [dragId, setDragId] = useState<string | null>(null);
  const [overCol, setOverCol] = useState<Stage | null>(null);
  const [toast, setToast] = useState("");
  const importRef = useRef<HTMLInputElement>(null);

  const load = () =>
    fetch("/api/esteira")
      .then(async (r) => {
        const d = await r.json();
        if (!r.ok) throw new Error(d.error || "Não consegui carregar a esteira.");
        setData(d);
        setLoadErr("");
      })
      .catch((e) => setLoadErr((e as Error).message));

  useEffect(() => {
    load();
    try {
      const v = localStorage.getItem(VIEW_KEY);
      if (v === "grid" || v === "kanban") setView(v);
    } catch {}
  }, []);
  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(""), 3500);
    return () => clearTimeout(t);
  }, [toast]);

  const changeView = (v: View) => {
    setView(v);
    try {
      localStorage.setItem(VIEW_KEY, v);
    } catch {}
  };

  const products = data?.products ?? [];
  const countries = useMemo(() => [...new Set(products.map((p) => p.country).filter(Boolean) as string[])].sort(), [products]);
  const filtered = useMemo(() => {
    const s = q.trim().toLowerCase();
    return products
      .filter((p) => (!prio || p.priority === prio) && (!country || p.country === country))
      .filter((p) => !s || [p.name, p.niche, p.country, p.source, p.notes].some((x) => x?.toLowerCase().includes(s)))
      .sort((a, b) => a.order - b.order);
  }, [products, q, prio, country]);
  const filtering = !!(q.trim() || prio || country);

  const upsert = (p: Product) => setData((d) => d && { ...d, products: d.products.some((x) => x.id === p.id) ? d.products.map((x) => (x.id === p.id ? p : x)) : [...d.products, p] });

  const move = async (id: string, stage: Stage, beforeId?: string) => {
    if (id === beforeId) return;
    // Optimistic: reorder locally the same way the server does.
    setData((d) => {
      if (!d) return d;
      const p = d.products.find((x) => x.id === id);
      if (!p) return d;
      const moved = { ...p, stage };
      const col = d.products.filter((x) => x.stage === stage && x.id !== id).sort((a, b) => a.order - b.order);
      const at = beforeId ? col.findIndex((x) => x.id === beforeId) : -1;
      col.splice(at < 0 ? col.length : at, 0, moved);
      const order = new Map(col.map((x, i) => [x.id, i + 1]));
      return { ...d, products: d.products.map((x) => (x.id === id ? { ...moved, order: order.get(id)! } : order.has(x.id) ? { ...x, order: order.get(x.id)! } : x)) };
    });
    try {
      await api({ action: "move", id, stage, beforeId });
    } catch (e) {
      setToast((e as Error).message);
      load();
    }
  };

  const quickAdd = async (stage: Stage, name: string) => {
    try {
      const { product } = await api<{ product: Product }>({ action: "create", product: { name, stage } });
      upsert(product);
    } catch (e) {
      setToast((e as Error).message);
    }
  };

  const doImport = async (file?: File) => {
    if (!file) return;
    try {
      const json = JSON.parse(await file.text());
      const r = await api<{ added: number; updated: number; refsAdded: number }>({ action: "import", json });
      setToast(`Importado: ${r.added} novos, ${r.updated} atualizados${r.refsAdded ? `, ${r.refsAdded} referências` : ""}.`);
      load();
    } catch (e) {
      setToast(e instanceof SyntaxError ? "Esse arquivo não é um JSON válido." : (e as Error).message);
    } finally {
      if (importRef.current) importRef.current.value = "";
    }
  };

  const doExport = () => {
    if (!data) return;
    const blob = new Blob([JSON.stringify({ products: data.products, refs: data.refs }, null, 2)], { type: "application/json" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `esteira-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(a.href);
  };

  return (
    <div className="mx-auto max-w-[1400px]">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="label">Ofertas e CRO</p>
          <h1 className="mt-1 text-2xl font-semibold tracking-tight">Esteira de produtos</h1>
          <p className="mt-1 text-sm text-muted">
            {products.length} {products.length === 1 ? "produto" : "produtos"} · minerado → escalando
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex rounded-lg border border-line bg-panel p-1" role="group" aria-label="Visualização">
            {(["kanban", "grid"] as const).map((v) => (
              <button
                key={v}
                type="button"
                onClick={() => changeView(v)}
                aria-pressed={view === v}
                className={`flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm transition ${view === v ? "bg-accent text-black" : "text-muted hover:text-zinc-100"}`}
              >
                <Icon d={IC[v]} size={14} /> {v === "kanban" ? "Kanban" : "Grade"}
              </button>
            ))}
          </div>
          <button type="button" className="btn-ghost" onClick={() => importRef.current?.click()}>
            <Icon d={IC.upload} size={14} /> Importar JSON
          </button>
          <button type="button" className="btn-ghost" onClick={doExport} disabled={!products.length} title="Baixar backup da esteira">
            <Icon d={IC.download} size={14} /> Exportar
          </button>
          <input ref={importRef} type="file" accept="application/json,.json" hidden onChange={(e) => doImport(e.target.files?.[0])} />
          <button type="button" className="btn-primary" onClick={() => setEditing({ stage: "minerado" })}>
            <Icon d={IC.plus} size={14} /> Novo produto
          </button>
        </div>
      </header>

      <div className="card mt-5 flex flex-wrap gap-2 p-3">
        <label className="relative min-w-[200px] flex-1">
          <Icon d={IC.search} size={14} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-faint" />
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Buscar produto, nicho, país…" className="input pl-9" aria-label="Buscar" />
        </label>
        <select value={prio} onChange={(e) => setPrio(e.target.value as "" | Priority)} className="input w-auto" aria-label="Prioridade">
          <option value="">Toda prioridade</option>
          {PRIORITIES.map((p) => (
            <option key={p.id} value={p.id}>{p.label}</option>
          ))}
        </select>
        <select value={country} onChange={(e) => setCountry(e.target.value)} className="input w-auto" aria-label="País">
          <option value="">Todo país</option>
          {countries.map((c) => (
            <option key={c} value={c}>{c}</option>
          ))}
        </select>
      </div>

      {loadErr && (
        <div className="mt-4 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-bad/30 bg-bad/5 px-4 py-3 text-sm text-bad">
          {loadErr}
          <button type="button" className="btn-ghost" onClick={load}>Tentar de novo</button>
        </div>
      )}
      {!data && !loadErr && <div className="mt-6 text-sm text-faint">Carregando…</div>}

      {data && view === "kanban" && (
        <div className="-mx-4 mt-4 overflow-x-auto px-4 pb-3 md:-mx-8 md:px-8">
          <div className="flex gap-3">
            {STAGES.map((s) => {
              const items = filtered.filter((p) => p.stage === s.id);
              return (
                <section
                  key={s.id}
                  aria-label={s.label}
                  onDragOver={(e) => {
                    if (!dragId) return;
                    e.preventDefault();
                    setOverCol(s.id);
                  }}
                  onDragLeave={(e) => !e.currentTarget.contains(e.relatedTarget as Node) && setOverCol(null)}
                  onDrop={(e) => {
                    e.preventDefault();
                    setOverCol(null);
                    if (dragId) move(dragId, s.id);
                    setDragId(null);
                  }}
                  className={`flex w-[264px] shrink-0 flex-col rounded-2xl border bg-panel p-3 transition ${
                    overCol === s.id ? "border-accent/50 bg-accent/5" : "border-line"
                  } ${s.id === "descartado" ? "opacity-80" : ""}`}
                >
                  <div className="mb-3 flex items-start gap-2.5 px-1">
                    <span className={`flex h-8 w-8 items-center justify-center rounded-lg border border-line bg-bg ${s.id === "escalando" ? "text-accent" : s.id === "descartado" ? "text-faint" : "text-zinc-300"}`}>
                      <Icon d={s.icon} size={15} />
                    </span>
                    <div className="min-w-0 flex-1">
                      <div className="text-sm font-semibold">{s.label}</div>
                      <div className="text-xs text-faint">{s.hint}</div>
                    </div>
                    <span className="rounded-md bg-bg px-2 py-0.5 text-xs text-muted">{items.length}</span>
                  </div>
                  <div className="flex min-h-[60px] flex-1 flex-col gap-2">
                    {items.map((p) => (
                      <Card
                        key={p.id}
                        p={p}
                        onOpen={() => setEditing(p)}
                        dragging={dragId === p.id}
                        onDragStart={filtering ? undefined : () => setDragId(p.id)}
                        onDragEnd={() => (setDragId(null), setOverCol(null))}
                        onDropBefore={
                          dragId && !filtering
                            ? () => {
                                move(dragId, s.id, p.id);
                                setDragId(null);
                                setOverCol(null);
                              }
                            : undefined
                        }
                      />
                    ))}
                    <QuickAdd onAdd={(name) => quickAdd(s.id, name)} />
                  </div>
                </section>
              );
            })}
          </div>
          {filtering && <p className="mt-2 text-xs text-faint">Com busca ou filtro ativo, arrastar fica desligado. Limpe os filtros para reordenar.</p>}
        </div>
      )}

      {data && view === "grid" && (
        <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {filtered.map((p) => {
            const st = stageOf(p.stage);
            return (
              <button
                key={p.id}
                type="button"
                onClick={() => setEditing(p)}
                className="card flex flex-col overflow-hidden text-left transition hover:border-zinc-600"
              >
                {thumbSrc(p.thumb) ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={thumbSrc(p.thumb)} alt="" className="h-36 w-full border-b border-line object-cover" />
                ) : (
                  <div className="flex h-36 w-full items-center justify-center border-b border-line bg-bg text-xs text-faint">sem thumb</div>
                )}
                <div className="flex flex-1 flex-col p-3">
                  <div className="flex items-center gap-1.5 text-xs text-muted">
                    <Icon d={st?.icon ?? ""} size={12} /> {st?.label}
                  </div>
                  <div className="mt-1 line-clamp-2 font-semibold">{p.name}</div>
                  <Tags p={p} />
                  {p.lpUrl && (
                    <span className="mt-2 flex items-center gap-1 truncate text-xs text-info">
                      <Icon d={IC.ext} size={12} /> {hostOf(p.lpUrl)}
                    </span>
                  )}
                </div>
              </button>
            );
          })}
          {!filtered.length && (
            <div className="col-span-full rounded-xl border border-dashed border-line py-10 text-center text-sm text-faint">
              {filtering ? "Nenhum produto com esses filtros." : "Nenhum produto ainda. Clique em Novo produto ou importe um JSON."}
            </div>
          )}
        </div>
      )}

      {data && <References refs={data.refs} setRefs={(f) => setData((d) => d && { ...d, refs: f(d.refs) })} />}

      {editing && (
        <Editor
          key={editing.id ?? "new"}
          product={editing}
          onClose={() => setEditing(null)}
          onSaved={(p) => {
            upsert(p);
            setEditing(null);
          }}
          onDeleted={(id) => {
            setData((d) => d && { ...d, products: d.products.filter((x) => x.id !== id) });
            setEditing(null);
          }}
        />
      )}

      {toast && (
        <div role="status" className="fixed bottom-6 left-1/2 z-[60] max-w-[min(420px,calc(100vw-32px))] -translate-x-1/2 rounded-lg border border-line bg-panel2 px-4 py-2.5 text-sm text-zinc-200 shadow-lg">
          {toast}
        </div>
      )}
    </div>
  );
}
