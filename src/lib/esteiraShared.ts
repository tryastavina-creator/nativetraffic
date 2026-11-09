/**
 * Product pipeline (Ofertas e CRO › Esteira de produtos): types, stages and the JSON import mapping.
 * Client-safe: no server imports here.
 */

export const STAGES = [
  { id: "minerado", label: "Minerado", hint: "Achei rodando", icon: "M14 4l6 6-9 9H5v-6zM12 6l6 6" },
  { id: "priorizado", label: "Priorizado", hint: "Decidi testar", icon: "M12 3l2.7 5.6 6.1.9-4.4 4.3 1 6.1L12 17l-5.4 2.9 1-6.1L3.2 9.5l6.1-.9z" },
  { id: "clonando", label: "Clonando", hint: "LP/Ad em clone", icon: "M8 8h11v11H8zM5 16V5h11" },
  { id: "teste", label: "Em teste", hint: "Rodando tráfego", icon: "M9 3h6M10 3v6l-5 9a2 2 0 002 3h10a2 2 0 002-3l-5-9V3M7 15h10" },
  { id: "escalando", label: "Escalando", hint: "Dando lucro", icon: "M3 17l6-6 4 4 8-8M15 7h6v6" },
  { id: "descartado", label: "Descartado", hint: "Não funcionou", icon: "M6 6l12 12M18 6L6 18" },
] as const;

export type Stage = (typeof STAGES)[number]["id"];
export type Priority = "alta" | "media" | "baixa";

export const PRIORITIES: { id: Priority; label: string; cls: string }[] = [
  { id: "alta", label: "Alta", cls: "bg-bad/15 text-bad" },
  { id: "media", label: "Média", cls: "bg-warn/15 text-warn" },
  { id: "baixa", label: "Baixa", cls: "bg-zinc-500/15 text-zinc-300" },
];

export const SOURCES = ["Taboola", "Outbrain", "Revcontent", "MGID", "MediaGo", "Meta", "Google", "TikTok", "Outra"];

export type Product = {
  id: string;
  name: string;
  stage: Stage;
  priority?: Priority;
  /** Two-letter country code (US, GB…). */
  country?: string;
  niche?: string;
  /** Where it was found running (Taboola, Meta…). */
  source?: string;
  /** Asset id (uploaded) or a public image URL. */
  thumb?: string;
  adUrl?: string;
  lpUrl?: string;
  offerUrl?: string;
  notes?: string;
  /** Position inside its column (lower first). */
  order: number;
  createdAt: string;
  updatedAt: string;
};

export type PageRef = { id: string; url: string; title?: string; note?: string; createdAt: string };

export type Esteira = { products: Product[]; refs: PageRef[] };

export const stageOf = (id: string) => STAGES.find((s) => s.id === id);

/** Image src for a product thumb (asset id → /api/assets/…). */
export const thumbSrc = (t?: string) => (!t ? "" : /^[a-f0-9]{32}$/.test(t) ? `/api/assets/${t}` : t);

export const hostOf = (u: string) => {
  try {
    return new URL(u).hostname.replace(/^www\./, "");
  } catch {
    return u;
  }
};

// ----------------------------------- JSON import -----------------------------------
// Accepts this app's own export, or exports from other tools with Portuguese/English field names.

const pick = (o: Record<string, unknown>, ...keys: string[]) => {
  for (const k of keys) {
    const v = o[k];
    if (v !== undefined && v !== null && String(v).trim() !== "") return String(v).trim();
  }
  return undefined;
};

const STAGE_ALIASES: Record<string, Stage> = {
  minerado: "minerado", mined: "minerado", spy: "minerado", achado: "minerado", backlog: "minerado",
  priorizado: "priorizado", prioritized: "priorizado", "a testar": "priorizado", todo: "priorizado",
  clonando: "clonando", clone: "clonando", cloning: "clonando", producao: "clonando", "em producao": "clonando",
  teste: "teste", "em teste": "teste", testing: "teste", test: "teste", rodando: "teste",
  escalando: "escalando", scaling: "escalando", scale: "escalando", vencedor: "escalando", winner: "escalando",
  descartado: "descartado", discarded: "descartado", morto: "descartado", dead: "descartado", pausado: "descartado",
};

const deaccent = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().trim();

export function parseStage(v?: string): Stage {
  return (v && STAGE_ALIASES[deaccent(v)]) || "minerado";
}

export function parsePriority(v?: string): Priority | undefined {
  if (!v) return undefined;
  const s = deaccent(v);
  if (/^(p1|alta|high|1)$/.test(s)) return "alta";
  if (/^(p2|media|medium|2)$/.test(s)) return "media";
  if (/^(p3|baixa|low|3)$/.test(s)) return "baixa";
  return undefined;
}

export type ImportedProduct = Omit<Product, "id" | "order" | "createdAt" | "updatedAt"> & { id?: string };

export function normalizeImport(raw: unknown): { products: ImportedProduct[]; refs: Omit<PageRef, "id" | "createdAt">[] } {
  const root = (raw ?? {}) as Record<string, unknown>;
  const list = Array.isArray(raw)
    ? raw
    : ((root.products ?? root.produtos ?? root.items ?? root.cards ?? []) as unknown[]);
  const refList = Array.isArray(raw) ? [] : ((root.refs ?? root.references ?? root.referencias ?? []) as unknown[]);

  const products = (Array.isArray(list) ? list : [])
    .filter((x): x is Record<string, unknown> => !!x && typeof x === "object")
    .map((o) => {
      const country = pick(o, "country", "pais", "país", "geo");
      return {
        id: pick(o, "id"),
        name: pick(o, "name", "nome", "title", "titulo", "título", "produto", "product") ?? "",
        stage: parseStage(pick(o, "stage", "etapa", "status", "coluna", "column")),
        priority: parsePriority(pick(o, "priority", "prioridade")),
        country: country ? country.toUpperCase().slice(0, 2) : undefined,
        niche: pick(o, "niche", "nicho", "categoria", "category"),
        source: pick(o, "source", "fonte", "plataforma", "platform", "network", "rede"),
        thumb: pick(o, "thumb", "thumbnail", "image", "imagem", "img", "imageUrl"),
        adUrl: pick(o, "adUrl", "ad", "anuncio", "anúncio", "adLink"),
        lpUrl: pick(o, "lpUrl", "lp", "landing", "pagina", "página", "url", "link"),
        offerUrl: pick(o, "offerUrl", "offer", "oferta", "checkout"),
        notes: pick(o, "notes", "notas", "obs", "observacoes", "observações", "description", "descricao", "descrição"),
      };
    })
    .filter((p) => p.name);

  const refs = (Array.isArray(refList) ? refList : [])
    .filter((x): x is Record<string, unknown> => !!x && typeof x === "object")
    .map((o) => ({
      url: pick(o, "url", "link", "href") ?? "",
      title: pick(o, "title", "titulo", "título", "nome", "name"),
      note: pick(o, "note", "nota", "why", "motivo", "porque", "obs"),
    }))
    .filter((r) => /^https?:\/\//i.test(r.url));

  return { products, refs };
}
