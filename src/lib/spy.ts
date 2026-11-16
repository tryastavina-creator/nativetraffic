import "server-only";
import { cached, dropCache, hashKey } from "./cache";

/**
 * Competitor spy (Anstrex) collected by the Grok bot and pushed to the `spy-inbox` branch of this (public)
 * repository: spy/players/<nicho>_movimentos.json (players + all ads), spy/entradas/*.json (curated finds),
 * spy/relatorios/*.md (patterns and angles), spy/mapa/*. Read straight from GitHub, so every new collection
 * shows up without a deploy. Cached 10 minutes; the last good copy is served if GitHub is unreachable.
 */

const REPO = process.env.SPY_REPO || "tryastavina-creator/nativetraffic";
const BRANCH = process.env.SPY_BRANCH || "spy-inbox";
const TTL = { ttl: 10 * 60_000, maxStale: 7 * 24 * 3600_000 };

export type SpyAd = {
  adId: string;
  nicho: string;
  network: string;
  headline: string;
  thumbnail: string;
  landerDomain: string;
  gravity: number;
  adStrength: number;
  firstSeen: string;
  lastSeen: string;
  days: number;
  movimento: string;
  /** Last collection that saw this ad (older = it dropped out of Anstrex). */
  lastCollected: string;
  angleId: string;
  idioma: string;
  geo: string;
  tags: string;
  anstrexUrl: string;
  playerStatus: string;
  playerType: string;
  /** From the curated finds (spy/entradas), when the ad is one of them. */
  porQue?: string;
  prioridade?: string;
  tipo?: string;
};

export type SpyPlayer = {
  nicho: string;
  domain: string;
  status: string;
  active: boolean;
  type: string;
  typeNote: string;
  networks: string[];
  ads: number;
  headlines: string[];
  angles: string[];
  firstSeen: string;
  lastSeen: string;
  maxGravity: number;
  gravityByNetwork: Record<string, number>;
  linkedDomains: string[];
  funnel: Record<string, string>;
};

export type SpyNiche = {
  nicho: string;
  collectedAt: string;
  totalAds: number;
  update: string;
  diff: string;
  rules: Record<string, string>;
  summary: Record<string, string[]>;
  trends: string[];
  promising: { adId: string; network: string; landerDomain: string; gravity: number; why: string }[];
  players: SpyPlayer[];
  ads: SpyAd[];
  report?: { date: string; path: string; markdown: string };
  /** Every report the bot has sent for this niche, newest first (markdown loaded on demand). */
  reports: { date: string; path: string }[];
  /** What changed against the previous collection. */
  changes: {
    against: string;
    newAds: number;
    updatedAds: number;
    newPlayers: { domain: string; status: string; type: string; maxGravity: number; networks: string[]; ads: number }[];
    statusMoves: { domain: string; from: string; to: string; gravity: number }[];
    gravityMoves: { domain: string; status: string; from: number; to: number; delta: number }[];
  };
  myStore: string;
};

export type SpyData = {
  repo: string;
  branch: string;
  fetchedAt: string;
  /** When the bot last pushed, and what it said. */
  lastPush?: { at: string; message: string };
  niches: SpyNiche[];
  playbook?: string;
  warnings: string[];
};

type Raw = Record<string, unknown>;
const s = (v: unknown) => (v == null ? "" : String(v));
const n = (v: unknown) => (typeof v === "number" ? v : Number(v) || 0);
/** Arrays, or the bot's "A, B" / "['a','b']" strings. */
const arr = (v: unknown): string[] => {
  if (Array.isArray(v)) return v.map(s).filter(Boolean);
  const t = s(v).trim();
  if (!t || t === "[]") return [];
  if (t.startsWith("[")) {
    try {
      return arr(JSON.parse(t.replace(/'/g, '"')));
    } catch {
      /* fall through */
    }
  }
  return t.split(/[,;]\s*/).map((x) => x.replace(/^\[?['"]?|['"]?\]?$/g, "").trim()).filter(Boolean);
};
const objs = (v: unknown): Raw[] => (Array.isArray(v) ? (v as Raw[]) : []);

async function tree(): Promise<{ sha: string; paths: string[]; at: string; message: string }> {
  return (
    await cached(
      hashKey("spy-tree", REPO, BRANCH),
      async () => {
        const res = await fetch(`https://api.github.com/repos/${REPO}/git/trees/${encodeURIComponent(BRANCH)}?recursive=1`, {
          headers: { Accept: "application/vnd.github+json", "User-Agent": "nativetraffic-crm" },
          cache: "no-store",
        });
        if (!res.ok) throw new Error(`GitHub ${res.status}`);
        const j = (await res.json()) as { sha: string; tree: { path: string; type: string }[] };
        const c = await fetch(`https://api.github.com/repos/${REPO}/commits/${j.sha}`, {
          headers: { Accept: "application/vnd.github+json", "User-Agent": "nativetraffic-crm" },
          cache: "no-store",
        })
          .then((r) => (r.ok ? r.json() : null))
          .catch(() => null);
        return {
          sha: j.sha,
          paths: j.tree.filter((t) => t.type === "blob" && t.path.startsWith("spy/")).map((t) => t.path),
          at: s(c?.commit?.committer?.date),
          message: s(c?.commit?.message).split("\n")[0],
        };
      },
      { ...TTL, ttl: 2 * 60_000 },
    )
  ).value;
}

async function raw(sha: string, path: string): Promise<string> {
  return (
    await cached(
      hashKey("spy-file", REPO, sha, path),
      async () => {
        const res = await fetch(`https://raw.githubusercontent.com/${REPO}/${sha}/${path.split("/").map(encodeURIComponent).join("/")}`, {
          cache: "no-store",
        });
        if (!res.ok) throw new Error(`${path}: ${res.status}`);
        return res.text();
      },
      TTL,
    )
  ).value;
}

async function json(sha: string, path: string): Promise<Raw | null> {
  try {
    return JSON.parse(await raw(sha, path)) as Raw;
  } catch {
    return null;
  }
}

/** One report file (any date), for the history picker. */
export async function getSpyReport(path: string): Promise<string> {
  if (!/^spy\/relatorios\/[\w.-]+\.md$/.test(path)) throw new Error("Relatório inválido.");
  const t = await tree();
  if (!t.paths.includes(path)) throw new Error("Relatório não encontrado.");
  return raw(t.sha, path);
}

export async function getSpy({ fresh = false } = {}): Promise<SpyData> {
  if (fresh) dropCache(hashKey("spy-tree", REPO, BRANCH));
  const warnings: string[] = [];
  const t = await tree();
  const has = (p: string) => t.paths.includes(p);

  // Curated finds, keyed by ad id (they add the "why" and the priority).
  const entryPaths = t.paths.filter((p) => p.startsWith("spy/entradas/") && p.endsWith(".json"));
  const entries = new Map<string, Raw>();
  for (let i = 0; i < entryPaths.length; i += 12) {
    const batch = await Promise.all(entryPaths.slice(i, i + 12).map((p) => json(t.sha, p)));
    for (const e of batch) if (e?.ad_id) entries.set(s(e.ad_id), e);
  }

  const nichos = [...new Set(t.paths.map((p) => /^spy\/players\/(.+)_movimentos\.json$/.exec(p)?.[1]).filter(Boolean) as string[])];
  const niches: SpyNiche[] = [];
  for (const nicho of nichos) {
    const m = await json(t.sha, `spy/players/${nicho}_movimentos.json`);
    if (!m) {
      warnings.push(`Não consegui ler os movimentos de ${nicho}.`);
      continue;
    }
    const players: SpyPlayer[] = ((m.players as Raw[]) ?? []).map((p) => ({
      nicho,
      domain: s(p.lander_domain),
      status: s(p.status),
      active: p.ativo !== false && p.ativo !== "nao" && p.ativo !== "não",
      type: s(p.tipo_player),
      typeNote: s(p.tipo_nota),
      networks: arr(p.redes ?? p.networks),
      ads: n(p.n_anuncios),
      headlines: arr(p.headlines),
      angles: arr(p.angles ?? p.angle_ids),
      firstSeen: s(p.first_seen),
      lastSeen: s(p.last_seen),
      maxGravity: n(p.max_gravity),
      gravityByNetwork: Object.fromEntries(
        Object.entries(((p.gravity_por_rede ?? p.por_rede) as Raw) ?? {}).map(([k, v]) => [
          v && typeof v === "object" ? s((v as Raw).network) || k : k,
          n(v && typeof v === "object" ? (v as Raw).gravity : v),
        ]),
      ),
      linkedDomains: arr(p.dominios_ligados ?? p.linked_domains),
      funnel: Object.fromEntries(
        Object.entries((p.funil as Raw) ?? {})
          .filter(([, v]) => v != null && v !== "")
          .map(([k, v]) => [k, typeof v === "string" ? v : JSON.stringify(v)]),
      ),
    }));
    const seen = new Set<string>();
    const ads: SpyAd[] = [];
    for (const p of (m.players as Raw[]) ?? []) {
      for (const a of (p.anuncios as Raw[]) ?? []) {
        const id = s(a.ad_id);
        if (!id || seen.has(id)) continue;
        seen.add(id);
        const e = entries.get(id);
        ads.push({
          adId: id,
          nicho,
          network: s(a.network ?? e?.rede),
          headline: s(a.headline ?? e?.headline),
          thumbnail: s(a.thumbnail_url ?? e?.thumbnail_url),
          landerDomain: s(p.lander_domain ?? e?.lander_domain),
          gravity: n(a.gravity ?? e?.gravity),
          adStrength: n(a.ad_strength ?? e?.ad_strength),
          firstSeen: s(a.first_seen ?? e?.first_seen),
          lastSeen: s(a.last_seen ?? e?.last_seen),
          days: n(a.dias_entre_primeira_e_ultima ?? e?.dias_entre_primeira_e_ultima),
          movimento: s(a.movimento ?? e?.movimento),
          lastCollected: s(a.data_ultima_coleta ?? e?.data_coleta),
          angleId: s(a.angle_id ?? e?.angle_id),
          idioma: s(a.idioma_inferido ?? e?.idioma_inferido),
          geo: s(a.geo_hint ?? e?.geo_hint),
          tags: s(a.tags ?? e?.tags),
          anstrexUrl: s(e?.ad_url) || `https://native.anstrex.com/creative/panel/${id}`,
          playerStatus: s(p.status),
          playerType: s(p.tipo_player),
          porQue: e ? s(e.por_que) : undefined,
          prioridade: e ? s(e.prioridade) : undefined,
          tipo: e ? s(e.tipo) : undefined,
        });
      }
    }
    // Curated finds that aren't in the players file still show.
    for (const [id, e] of entries) {
      if (seen.has(id) || s(e.nicho) !== nicho) continue;
      ads.push({
        adId: id,
        nicho,
        network: s(e.rede),
        headline: s(e.headline),
        thumbnail: s(e.thumbnail_url),
        landerDomain: s(e.lander_domain),
        gravity: n(e.gravity),
        adStrength: n(e.ad_strength),
        firstSeen: s(e.first_seen),
        lastSeen: s(e.last_seen),
        days: n(e.dias_entre_primeira_e_ultima),
        movimento: s(e.movimento),
        lastCollected: s(e.data_coleta),
        angleId: s(e.angle_id),
        idioma: s(e.idioma_inferido),
        geo: s(e.geo_hint),
        tags: s(e.tags),
        anstrexUrl: s(e.ad_url) || `https://native.anstrex.com/creative/panel/${id}`,
        playerStatus: "",
        playerType: "",
        porQue: s(e.por_que),
        prioridade: s(e.prioridade),
        tipo: s(e.tipo),
      });
    }

    const reportPaths = t.paths.filter((p) => new RegExp(`^spy/relatorios/\\d{4}-\\d{2}-\\d{2}_${nicho}_`).test(p)).sort().reverse();
    const reportPath = reportPaths[0];
    const store = has(`spy/mapa/${nicho}_minha_loja.md`) ? await raw(t.sha, `spy/mapa/${nicho}_minha_loja.md`).catch(() => "") : "";
    // Old format had a ready summary; the new one only has each player's status.
    const summary: Record<string, string[]> = m.resumo
      ? Object.fromEntries(Object.entries(m.resumo as Raw).map(([k, v]) => [k, arr(v)]))
      : {};
    if (!m.resumo)
      for (const p of players) (summary[p.status || "outro"] ??= []).push(p.domain);
    niches.push({
      nicho,
      collectedAt: s(m.data_coleta),
      totalAds: n(m.n_anuncios) || ads.length,
      update:
        s(m.atualizacao) ||
        (m.n_anuncios_master ? `${n(m.n_anuncios_master)} no acumulado · ${n(m.n_anuncios_novos)} novos nesta coleta` : ""),
      diff: s(m.diff_desde_ontem),
      rules: Object.fromEntries(Object.entries((m.regras as Raw) ?? {}).map(([k, v]) => [k, s(v)])),
      summary,
      trends: arr(m.tendencias),
      promising: ((m.testes_promissores ?? m.testes_promissorios) as unknown[] | undefined ?? []).map((x) =>
        typeof x === "string"
          ? { adId: "", network: "", landerDomain: x.split(":")[0].trim(), gravity: 0, why: x.includes(":") ? x.slice(x.indexOf(":") + 1).trim() : x }
          : {
              adId: s((x as Raw).ad_id),
              network: s((x as Raw).rede),
              landerDomain: s((x as Raw).lander_domain),
              gravity: n((x as Raw).gravity),
              why: s((x as Raw).porque ?? (x as Raw).por_que),
            },
      ),
      reports: reportPaths.map((p) => ({ date: p.slice(15, 25), path: p })),
      changes: {
        against: s(m.diff_contra),
        newAds: n(m.n_anuncios_novos),
        updatedAds: n(m.n_anuncios_atualizados),
        newPlayers: objs(m.new_players).map((x) => ({
          domain: s(x.lander_domain),
          status: s(x.status),
          type: s(x.tipo_player),
          maxGravity: n(x.max_gravity),
          networks: arr(x.networks ?? x.redes),
          ads: n(x.n_anuncios),
        })),
        statusMoves: objs(m.class_moves).map((x) => ({
          domain: s(x.lander_domain),
          from: s(x.status_ontem),
          to: s(x.status_hoje),
          gravity: n(x.max_gravity_hoje),
        })),
        gravityMoves: objs(m.gravity_changes_players).map((x) => ({
          domain: s(x.lander_domain),
          status: s(x.status),
          from: n(x.max_gravity_ontem),
          to: n(x.max_gravity_hoje),
          delta: n(x.delta),
        })),
      },
      myStore: store,
      players: players.sort((a, b) => b.maxGravity - a.maxGravity),
      ads: ads.sort((a, b) => b.gravity - a.gravity),
      report: reportPath ? { date: reportPath.slice(15, 25), path: reportPath, markdown: await raw(t.sha, reportPath).catch(() => "") } : undefined,
    });
  }
  const playbook = has("spy/anstrex_playbook.md") ? await raw(t.sha, "spy/anstrex_playbook.md").catch(() => undefined) : undefined;
  const order = ["hearing", "neuropathy"];
  niches.sort((a, b) => (order.indexOf(a.nicho) + 1 || 99) - (order.indexOf(b.nicho) + 1 || 99));
  return {
    repo: REPO,
    branch: BRANCH,
    fetchedAt: new Date().toISOString(),
    lastPush: t.at ? { at: t.at, message: t.message } : undefined,
    niches,
    playbook,
    warnings,
  };
}
