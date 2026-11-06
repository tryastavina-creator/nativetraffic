import "server-only";
import { randomBytes } from "node:crypto";
import {
  revcontentCampaigns,
  revcontentConversions,
  revcontentCreateCampaign,
  revcontentTemplateBlocks,
  taboolaFromTemplate,
  taboolaActivate,
  revcontentActivate,
  taboolaAdvertisers,
  revcontentDetail,
  revcontentDuplicate,
  revcontentUpdate,
  revcontentUpdateItem,
  taboolaCampaigns,
  taboolaCreateCampaign,
  taboolaCreateGroup,
  taboolaGroup,
  taboolaDetail,
  taboolaDuplicate,
  taboolaDuplicateWith,
  taboolaGroups,
  taboolaUpdate,
  taboolaUpdateItem,
  type NewGroup,
} from "./connectors/campaignBuilder";
import { isoCountry, parseSourceName } from "./naming";
import { listCampaigns as listRtCampaigns } from "./connectors/redtrack";
import { publishRevcontent, publishTaboola } from "./connectors/taboolaCreatives";
import { friendlyError } from "./cache";
import { checkSetup } from "./campaignRules";
import { computeTraffic } from "./traffic";
import {
  addCampaignLog,
  getAsset,
  getConnection,
  getSettings,
  listConnections,
  uniqueAccounts,
  listCampaignLog,
  updateCampaignLog,
  listTemplates,
  listVariants,
  updateVariant,
  type CampaignLogEntry,
  type CampaignSetup,
} from "./store";

export type Platform = "taboola" | "revcontent";

/** A creative to put in a campaign: a generated variant from the library, or an ad that is already running. */
export type CreativeInput = (
  | { kind: "variant"; variantId: string; headline?: string }
  | { kind: "ad"; imageUrl: string; headline: string }
) & { description?: string; cta?: string };

/** Bid label used in the source campaign name (PRODUTO DEVICE LANCE PAÍS DATA). */
export function bidLabel(platform: Platform, s: CampaignSetup): string {
  if (platform === "revcontent") return s.bidStrategy === "cpa" ? "CPA" : "CPC";
  return { MAX_CONVERSIONS: "MAXCONV", TARGET_CPA: "TCPA", SMART: "SMARTBID", FIXED: "CPC" }[s.bidStrategy] ?? s.bidStrategy;
}

/** Hosts the server may download an existing ad image from (to re-upload it). Prevents fetching arbitrary URLs. */
const IMAGE_HOSTS = /(^|\.)taboola\.com$|(^|\.)revcontent\.com$|^revcontent\.s3\.amazonaws\.com$|(^|\.)fal\.media$|^storage\.googleapis\.com$/;

/**
 * Account ids are a connection id, or "connectionId::advertiserAccountId" for an advertiser inside a Taboola
 * network connection (campaigns can only be created in advertiser accounts).
 */
export async function resolveAccount(id: string) {
  const [connId, adv] = id.split("::");
  const conn = await getConnection(connId);
  if (!conn) return undefined;
  return adv ? { ...conn, id, credentials: { ...conn.credentials, accountId: adv } } : conn;
}

/** Every account a campaign can be created in (Taboola networks expanded into their advertisers). */
export async function campaignAccounts() {
  const conns = uniqueAccounts(await listConnections()).filter((c) => c.provider === "taboola" || c.provider === "revcontent");
  const out: { id: string; label: string; platform: Platform }[] = [];
  for (const c of conns) {
    if (c.provider !== "taboola") {
      out.push({ id: c.id, label: c.label ?? c.provider, platform: "revcontent" });
      continue;
    }
    const advs = await taboolaAdvertisers(c.credentials).catch(() => []);
    if (!advs.length || !advs[0].network) out.push({ id: c.id, label: c.label ?? "Taboola", platform: "taboola" });
    else for (const a of advs) out.push({ id: `${c.id}::${a.accountId}`, label: `${a.name} (${c.label ?? "rede"})`, platform: "taboola" });
  }
  return out;
}

async function connection(platform: Platform, accountId: string) {
  const conn = await resolveAccount(accountId);
  if (!conn || conn.provider !== platform) throw new Error("Conta da fonte não encontrada.");
  return conn;
}

export async function builderMeta(platform: Platform, accountId: string) {
  // NT_SNAPSHOT_BUILDER_META: JSON standing in for the source + RedTrack APIs (tests).
  if (process.env.NT_SNAPSHOT_BUILDER_META) {
    const m = JSON.parse(await (await import("node:fs")).promises.readFile(process.env.NT_SNAPSHOT_BUILDER_META, "utf8"));
    return { ...m, templates: (await listTemplates()).filter((t) => t.platform === platform) };
  }
  const warnings: string[] = [];
  const conn = await connection(platform, accountId);
  const rt = (await listConnections()).find((c) => c.provider === "redtrack");
  const [campaigns, groups, rtCampaigns, templates, conversions, settings] = await Promise.all([
    (platform === "taboola" ? taboolaCampaigns(conn.credentials) : revcontentCampaigns(conn.credentials)).catch((e) => {
      warnings.push(friendlyError(conn.label ?? platform, e));
      return [];
    }),
    platform === "taboola"
      ? taboolaGroups(conn.credentials).catch((e) => {
          warnings.push(friendlyError("Grupos da Taboola", e));
          return [];
        })
      : Promise.resolve([]),
    rt
      ? listRtCampaigns(rt.credentials).catch((e) => {
          warnings.push(friendlyError("RedTrack", e));
          return [];
        })
      : Promise.resolve([]),
    listTemplates(),
    platform === "revcontent" ? revcontentConversions(conn.credentials) : Promise.resolve([]),
    getSettings(),
  ]);
  return {
    campaigns,
    groups,
    rtCampaigns,
    conversions,
    blocklists: (settings.blocklists ?? []).filter((b) => b.platform === platform),
    templates: templates.filter((t) => t.platform === platform),
    warnings,
  };
}

/** Campaigns that worked (last 30 days, by real profit), to use as the template of a new one. */
export async function winners(platform: Platform) {
  const to = new Date().toISOString().slice(0, 10);
  const from = new Date(Date.now() - 29 * 86400_000).toISOString().slice(0, 10);
  const r = await computeTraffic({ from, to });
  return r.apiRows
    .filter((x) => x.platform === platform && x.accountId && x.sourceId && x.spend > 0)
    .map((x) => ({
      accountId: x.accountId!,
      campaignId: x.sourceId!,
      name: x.campaign,
      spend: x.spend,
      sales: x.sales,
      cpa: x.cpa,
      roas: x.roas,
      profit: x.profit,
    }))
    .sort((a, b) => b.profit - a.profit || b.roas - a.roas)
    .slice(0, 40);
}

/** Saved blocklists + typed sites, deduplicated. */
async function resolveBlocks(platform: Platform, s: CampaignSetup): Promise<CampaignSetup> {
  const lists = ((await getSettings()).blocklists ?? []).filter((b) => b.platform === platform && s.blocklistIds?.includes(b.id));
  const sites = [...new Set([...(s.blockedSites ?? []), ...lists.flatMap((b) => b.sites)].map((x) => x.trim()).filter(Boolean))];
  return { ...s, blockedSites: sites };
}

type Failed = NonNullable<CampaignLogEntry["failed"]>[number];
/** Failures of the last addCreatives per campaign, picked up by log(). */
const pendingFailures = new Map<string, Failed[]>();

/** Uploads each creative as a new PAUSED ad. Returns one log line per creative. */
async function addCreatives(
  platform: Platform,
  accountId: string,
  campaignId: string,
  url: string,
  creatives: CreativeInput[],
  baseUrl: string,
  resume: Record<number, string> = {},
) {
  const conn = await connection(platform, accountId);
  const variants = await listVariants();
  const steps: string[] = [];
  const ids: string[] = [];
  const failed: Failed[] = [];
  let ok = 0;
  for (const [idx, cr] of creatives.entries()) {
    const label = (cr.kind === "variant" ? (cr.headline ?? variants.find((x) => x.id === cr.variantId)?.headline ?? "variação") : cr.headline).slice(0, 70);
    try {
      if (cr.kind === "variant") {
        const v = variants.find((x) => x.id === cr.variantId);
        if (!v) throw new Error("variação não encontrada");
        const headline = (cr.headline ?? v.headline).trim();
        const r =
          platform === "taboola"
            ? await publishTaboola(
                conn.credentials,
                campaignId,
                url,
                headline,
                (await getAsset(v.assetId)) ?? (() => { throw new Error("imagem da variação não encontrada no banco"); })(),
                v.origin !== "spy", // AI disclosure only for images generated here
                resume[idx],
                cr,
              )
            : await publishRevcontent(conn.credentials, campaignId, url, headline, v.source.brand ?? "", `${baseUrl}/api/assets/${v.assetId}`, cr);
        await updateVariant(v.id, {
          status: "published",
          published: [...(v.published ?? []), { platform, itemId: r.itemId, at: new Date().toISOString(), status: r.status }],
        });
        ids.push(r.itemId);
        steps.push(`Anúncio ${r.itemId} (variação) criado`);
      } else {
        let host = "";
        try {
          host = new URL(cr.imageUrl).hostname;
        } catch {}
        if (!IMAGE_HOSTS.test(host)) throw new Error(`a imagem vem de um endereço não permitido (${host || "link inválido"})`);
        let r;
        if (platform === "taboola") {
          if (/(^|\.)taboola\.com$/.test(host)) {
            r = await publishTaboola(conn.credentials, campaignId, url, cr.headline, { hostedUrl: cr.imageUrl }, false, resume[idx], cr);
          } else {
            const img = await fetch(cr.imageUrl, { cache: "no-store" });
            if (!img.ok) throw new Error(`não consegui baixar a imagem (${img.status})`);
            r = await publishTaboola(
              conn.credentials,
              campaignId,
              url,
              cr.headline,
              { bytes: Buffer.from(await img.arrayBuffer()), mime: img.headers.get("content-type") ?? "image/jpeg" },
              false,
              resume[idx],
              cr,
            );
          }
        } else {
          r = await publishRevcontent(conn.credentials, campaignId, url, cr.headline, "", cr.imageUrl, cr);
        }
        ids.push(r.itemId);
        steps.push(`Anúncio ${r.itemId} (criativo existente) criado`);
      }
      ok++;
    } catch (e) {
      const error = friendlyError("", e).replace(/^: /, "");
      const itemId = (e as { itemId?: string }).itemId ?? resume[idx];
      failed.push({ creative: cr, error, itemId, label });
      steps.push(`Falhou o criativo "${label}": ${error}`);
    }
  }
  pendingFailures.set(campaignId, failed);
  return { steps, ok, ids, failed };
}

/** Retries the creatives that failed in a history entry (resuming ads Taboola was still crawling). */
export async function retryFailed(logId: string, baseUrl: string) {
  const e = (await listCampaignLog()).find((x) => x.id === logId);
  if (!e?.failed?.length) return { ok: false, steps: ["Nada para tentar de novo nesse registro."] };
  if (!e.url) return { ok: false, steps: ["Esse registro não tem o link do RedTrack."] };
  const resume: Record<number, string> = {};
  e.failed.forEach((f, i) => f.itemId && (resume[i] = f.itemId));
  const r = await addCreatives(e.platform as Platform, e.accountId, e.campaignId, e.url, e.failed.map((f) => f.creative), baseUrl, resume);
  pendingFailures.delete(e.campaignId);
  const stamp = new Date().toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" });
  await updateCampaignLog(e.id, {
    failed: r.failed,
    items: e.items + r.ok,
    ok: e.ok || r.ok > 0,
    steps: [...e.steps, `Nova tentativa (${stamp}):`, ...r.steps],
  });
  return { ok: r.failed.length === 0, steps: r.steps };
}

/** "Ativada": campaign and its new ads switched on at the end (ads still go through the source's review). */
async function activate(platform: Platform, accountId: string, campaignId: string, itemIds: string[], steps: string[]) {
  const conn = await connection(platform, accountId);
  try {
    if (platform === "taboola") await taboolaActivate(conn.credentials, campaignId, itemIds);
    else await revcontentActivate(conn.credentials, campaignId, itemIds);
    steps.push(`Campanha ativada${itemIds.length ? ` com ${itemIds.length} anúncio(s) ligados (rodam depois da aprovação da fonte)` : ""}`);
  } catch (e) {
    steps.push(`Não consegui ativar (ficou pausada): ${friendlyError("", e).replace(/^: /, "")}`);
  }
}

export type CreateInput = {
  platform: Platform;
  accountId: string;
  name: string;
  setup: CampaignSetup;
  /** Taboola only: existing group id, or a new group to create. */
  group?: { mode: "existing"; id: string } | ({ mode: "new" } & NewGroup) | { mode: "none" };
  url: string;
  rtCampaign?: string;
  creatives: CreativeInput[];
  /** true = switch the campaign and its new ads on at the end; default paused. */
  activate?: boolean;
};

export async function createCampaign(input: CreateInput, baseUrl: string) {
  const conn = await connection(input.platform, input.accountId);
  const steps: string[] = [];
  let campaignId = "";
  let ok = false;
  const tplRef = input.setup.templateCampaign;
  const cross = !!tplRef && tplRef.accountId !== input.accountId;
  const check = checkSetup(input.platform, input.setup, {
    url: input.url,
    name: input.name,
    groupNeeded: input.platform === "taboola" && cross,
    groupChosen: input.group?.mode === "existing" || input.group?.mode === "new",
  });
  if (check.errors.length) {
    return { ok: false, campaignId: "", steps: ["Nada foi criado. Corrija antes:", ...check.errors] };
  }
  input = { ...input, setup: await resolveBlocks(input.platform, input.setup) };
  try {
    let groupId: string | undefined;
    if (input.platform === "taboola" && input.group?.mode === "new") {
      const g = await taboolaCreateGroup(conn.credentials, { ...input.group, active: true });
      groupId = g.id;
      input = { ...input, setup: { ...input.setup, groupShared: input.group.budgetMode === "group" } };
      steps.push(`Grupo "${g.name}" criado (id ${g.id})${g.note ? ` — ${g.note}` : ""}`);
    } else if (input.platform === "taboola" && input.group?.mode === "existing") {
      groupId = input.group.id;
      const g = await taboolaGroup(conn.credentials, groupId).catch(() => undefined);
      input = { ...input, setup: { ...input.setup, groupShared: !!g?.shared } };
      steps.push(`Grupo "${g?.name ?? groupId}"${g?.shared ? " (orçamento do grupo)" : ""}`);
    }
    let camp;
    if (tplRef) {
      const src = await resolveAccount(tplRef.accountId);
      if (!src || src.provider !== input.platform) throw new Error("A campanha modelo é de outra fonte ou de uma conta desconectada.");
      if (input.platform === "taboola") {
        const r = await taboolaFromTemplate(src.credentials, tplRef.campaignId, conn.credentials, input.name, input.setup, groupId);
        camp = r;
        steps.push(`Base: "${tplRef.name}" (${r.how}, sem os anúncios dela)`);
      } else {
        const blocked = await revcontentTemplateBlocks(src.credentials, tplRef.campaignId, input.setup);
        camp = await revcontentCreateCampaign(conn.credentials, input.name, { ...input.setup, blockedSites: blocked });
        steps.push(`Base: "${tplRef.name}" (setup copiado${blocked.length ? `, ${blocked.length} widgets bloqueados` : ""})`);
      }
    } else {
      camp =
        input.platform === "taboola"
          ? await taboolaCreateCampaign(conn.credentials, input.name, input.setup, groupId)
          : await revcontentCreateCampaign(conn.credentials, input.name, input.setup);
    }
    campaignId = camp.id;
    steps.push(`Campanha "${input.name}" criada (id ${camp.id})`);
    if (input.setup.blockedSites?.length) steps.push(`${input.setup.blockedSites.length} site(s) da blocklist bloqueados`);
    const r = await addCreatives(input.platform, input.accountId, camp.id, input.url, input.creatives, baseUrl);
    steps.push(...r.steps);
    if (input.activate) await activate(input.platform, input.accountId, camp.id, r.ids, steps);
    ok = true;
    await log("criada", input.platform, input.accountId, campaignId, input.name, input.rtCampaign, input.url, r.ok, steps, true);
    return { ok, campaignId, steps };
  } catch (e) {
    steps.push(`Erro: ${friendlyError(conn.label ?? input.platform, e)}`);
    await log("criada", input.platform, input.accountId, campaignId, input.name, input.rtCampaign, input.url, 0, steps, false);
    return { ok, campaignId, steps };
  }
}

export type DuplicateInput = {
  platform: Platform;
  accountId: string;
  sourceCampaignId: string;
  name: string;
  /** Keep the source's ads (Taboola) or start empty and add the chosen creatives. */
  keepCreatives: boolean;
  url?: string;
  rtCampaign?: string;
  creatives: CreativeInput[];
  /** Revcontent: targeting comes from this setup (its API doesn't expose the source's targeting). */
  setup?: CampaignSetup;
};

export async function duplicateCampaign(input: DuplicateInput, baseUrl: string) {
  const conn = await connection(input.platform, input.accountId);
  const steps: string[] = [];
  let campaignId = "";
  try {
    if (input.platform === "taboola") {
      const c = await taboolaDuplicate(conn.credentials, input.sourceCampaignId, { name: input.name, includeItems: input.keepCreatives });
      campaignId = c.id;
      steps.push(`Campanha duplicada pausada (id ${c.id})${input.keepCreatives ? " com os anúncios da original" : " sem os anúncios"}`);
    } else {
      if (!input.setup) throw new Error("Escolha um modelo de setup para a cópia na Revcontent.");
      const c = await revcontentDuplicate(conn.credentials, input.sourceCampaignId, input.name, input.setup);
      campaignId = c.id;
      steps.push(`Campanha copiada pausada (id ${c.id}) com o lance, orçamento e pacing da original`);
    }
    let items = 0;
    if (input.creatives.length) {
      if (!input.url) throw new Error("Escolha a campanha do RedTrack (link) para os criativos novos.");
      const r = await addCreatives(input.platform, input.accountId, campaignId, input.url, input.creatives, baseUrl);
      steps.push(...r.steps);
      items = r.ok;
    }
    await log("duplicada", input.platform, input.accountId, campaignId, input.name, input.rtCampaign, input.url, items, steps, true);
    return { ok: true, campaignId, steps };
  } catch (e) {
    steps.push(`Erro: ${friendlyError(conn.label ?? input.platform, e)}`);
    await log("duplicada", input.platform, input.accountId, campaignId, input.name, input.rtCampaign, input.url, 0, steps, false);
    return { ok: false, campaignId, steps };
  }
}

export async function addToCampaign(
  input: { platform: Platform; accountId: string; campaignId: string; campaignName: string; url: string; rtCampaign?: string; creatives: CreativeInput[] },
  baseUrl: string,
) {
  const r = await addCreatives(input.platform, input.accountId, input.campaignId, input.url, input.creatives, baseUrl);
  await log("criativos", input.platform, input.accountId, input.campaignId, input.campaignName, input.rtCampaign, input.url, r.ok, r.steps, r.ok > 0);
  return { ok: r.ok > 0, campaignId: input.campaignId, steps: r.steps };
}

async function log(
  action: "criada" | "duplicada" | "criativos",
  platform: string,
  accountId: string,
  campaignId: string,
  campaignName: string,
  rtCampaign: string | undefined,
  url: string | undefined,
  items: number,
  steps: string[],
  ok: boolean,
) {
  const failed = pendingFailures.get(campaignId);
  pendingFailures.delete(campaignId);
  await addCampaignLog({
    ...(failed?.length ? { failed } : {}),
    id: randomBytes(6).toString("hex"),
    at: new Date().toISOString(),
    action,
    platform,
    accountId,
    campaignId,
    campaignName,
    rtCampaign,
    url,
    items,
    steps,
    ok,
  });
}


// ------------------------------ edit / duplicate anywhere ------------------------------

/** Settings + ads of an existing campaign (to edit it or to start a copy). */
export async function campaignDetail(accountId: string, campaignId: string) {
  if (process.env.NT_SNAPSHOT_CAMPAIGN_DETAIL) {
    return { ...JSON.parse(await (await import("node:fs")).promises.readFile(process.env.NT_SNAPSHOT_CAMPAIGN_DETAIL, "utf8")), accountId };
  }
  const conn = await resolveAccount(accountId);
  if (!conn || (conn.provider !== "taboola" && conn.provider !== "revcontent")) throw new Error("Conta da fonte não encontrada.");
  const d = conn.provider === "taboola" ? await taboolaDetail(conn.credentials, campaignId) : await revcontentDetail(conn.credentials, campaignId);
  // Fill product / devices / country from the name when the API doesn't give them.
  const p = parseSourceName(d.name);
  if (p) {
    d.setup.product = p.product;
    if (!d.setup.countries.length) d.setup.countries = [isoCountry(p.country)];
    if (conn.provider === "revcontent" && d.setup.devices.length === 3 && p.device && p.device !== "ALL")
      d.setup.devices = p.device.split("/") as ("DESKTOP" | "MOBILE" | "TABLET")[];
  }
  const owner = d.owner && d.owner !== String(conn.credentials.accountId) ? `${accountId.split("::")[0]}::${d.owner}` : accountId;
  return { ...d, accountId: owner };
}

export type ItemChange = { id: string; title?: string; active?: boolean; description?: string; cta?: string };

export async function updateCampaign(
  input: {
    accountId: string;
    campaignId: string;
    name: string;
    setup: CampaignSetup;
    itemChanges: ItemChange[];
    url?: string;
    rtCampaign?: string;
    creatives: CreativeInput[];
  },
  baseUrl: string,
) {
  const conn = await resolveAccount(input.accountId);
  if (!conn || (conn.provider !== "taboola" && conn.provider !== "revcontent")) throw new Error("Conta da fonte não encontrada.");
  const platform = conn.provider as Platform;
  const steps: string[] = [];
  let ok = true;
  try {
    if (platform === "taboola") await taboolaUpdate(conn.credentials, input.campaignId, input.name, input.setup);
    else await revcontentUpdate(conn.credentials, input.campaignId, input.name, input.setup);
    steps.push("Configurações da campanha salvas");
  } catch (e) {
    ok = false;
    steps.push(`Erro nas configurações: ${friendlyError(conn.label ?? platform, e)}`);
  }
  for (const ch of input.itemChanges) {
    try {
      if (platform === "taboola") await taboolaUpdateItem(conn.credentials, input.campaignId, ch.id, ch);
      else await revcontentUpdateItem(conn.credentials, input.campaignId, ch.id, ch);
      steps.push(
        `Anúncio ${ch.id}: ${[
          ch.title !== undefined ? "headline nova" : "",
          ch.description !== undefined ? "descrição" : "",
          ch.cta !== undefined ? (ch.cta ? `CTA ${ch.cta}` : "sem CTA") : "",
          ch.active !== undefined ? (ch.active ? "ativado" : "pausado") : "",
        ]
          .filter(Boolean)
          .join(", ")}`,
      );
    } catch (e) {
      ok = false;
      steps.push(`Falhou no anúncio ${ch.id}: ${friendlyError("", e).replace(/^: /, "")}`);
    }
  }
  let items = 0;
  if (input.creatives.length) {
    if (!input.url) {
      steps.push("Criativos novos não enviados: falta o link do RedTrack.");
    } else {
      const r = await addCreatives(platform, input.accountId, input.campaignId, input.url, input.creatives, baseUrl);
      steps.push(...r.steps);
      items = r.ok;
    }
  }
  await log("criativos", platform, input.accountId, input.campaignId, input.name, input.rtCampaign, input.url, items, ["Edição", ...steps], ok);
  return { ok, campaignId: input.campaignId, steps };
}

/**
 * Copies a campaign to the same account, another account or another source.
 * Same Taboola account → native duplicate (keeps blocked sites, bid modifiers…), with the edited setup.
 * Anything else → new campaign with the (translated) setup, re-uploading the kept ads.
 */
export async function copyCampaign(
  input: {
    source: { accountId: string; campaignId: string };
    target: { accountId: string };
    name: string;
    setup: CampaignSetup;
    group?: CreateInput["group"];
    url: string;
    rtCampaign?: string;
    /** Ads of the source to carry over (with possibly edited headlines). */
    keep: { title: string; thumbnail: string; description?: string; cta?: string }[];
    keepAll: boolean;
    creatives: CreativeInput[];
    activate?: boolean;
  },
  baseUrl: string,
) {
  const src = await resolveAccount(input.source.accountId);
  const dst = await resolveAccount(input.target.accountId);
  if (!src || !dst) throw new Error("Conta não encontrada.");
  const platform = dst.provider as Platform;
  const kept: CreativeInput[] = input.keep.map((k) => ({ kind: "ad", imageUrl: k.thumbnail, headline: k.title, description: k.description, cta: k.cta }));

  if (src.id === dst.id && platform === "taboola") {
    const steps: string[] = [];
    let campaignId = "";
    try {
      const c = await taboolaDuplicateWith(dst.credentials, input.source.campaignId, input.name, input.setup, input.keepAll);
      campaignId = c.id;
      steps.push(`Campanha duplicada pausada (id ${c.id})${input.keepAll ? " com todos os anúncios da original" : ""}`);
      const toAdd = [...(input.keepAll ? [] : kept), ...input.creatives];
      let items = 0;
      let ids: string[] = [];
      if (toAdd.length) {
        const r = await addCreatives(platform, dst.id, c.id, input.url, toAdd, baseUrl);
        steps.push(...r.steps);
        items = r.ok;
        ids = r.ids;
      }
      if (input.activate) await activate(platform, dst.id, c.id, ids, steps);
      await log("duplicada", platform, dst.id, campaignId, input.name, input.rtCampaign, input.url, items, steps, true);
      return { ok: true, campaignId, steps };
    } catch (e) {
      steps.push(`Erro: ${friendlyError(dst.label ?? platform, e)}`);
      await log("duplicada", platform, dst.id, campaignId, input.name, input.rtCampaign, input.url, 0, steps, false);
      return { ok: false, campaignId, steps };
    }
  }
  const r = await createCampaign(
    {
      platform,
      accountId: dst.id,
      name: input.name,
      setup: input.setup,
      group: input.group,
      url: input.url,
      rtCampaign: input.rtCampaign,
      creatives: [...kept, ...input.creatives],
      activate: input.activate,
    },
    baseUrl,
  );
  return {
    ...r,
    steps: [`Cópia de ${src.label ?? src.provider} → ${dst.label ?? dst.provider}`, ...r.steps],
  };
}
