import "server-only";
import { randomBytes } from "node:crypto";
import {
  revcontentCampaigns,
  revcontentCreateCampaign,
  revcontentDetail,
  revcontentDuplicate,
  revcontentUpdate,
  revcontentUpdateItem,
  taboolaCampaigns,
  taboolaCreateCampaign,
  taboolaCreateGroup,
  taboolaDetail,
  taboolaDuplicate,
  taboolaDuplicateWith,
  taboolaGroups,
  taboolaUpdate,
  taboolaUpdateItem,
  type NewGroup,
} from "./connectors/campaignBuilder";
import { parseSourceName } from "./naming";
import { listCampaigns as listRtCampaigns } from "./connectors/redtrack";
import { publishRevcontent, publishTaboola } from "./connectors/taboolaCreatives";
import { friendlyError } from "./cache";
import {
  addCampaignLog,
  getAsset,
  getConnection,
  listConnections,
  listTemplates,
  listVariants,
  updateVariant,
  type CampaignSetup,
} from "./store";

export type Platform = "taboola" | "revcontent";

/** A creative to put in a campaign: a generated variant from the library, or an ad that is already running. */
export type CreativeInput = { kind: "variant"; variantId: string; headline?: string } | { kind: "ad"; imageUrl: string; headline: string };

/** Bid label used in the source campaign name (PRODUTO DEVICE LANCE PAÍS DATA). */
export function bidLabel(platform: Platform, s: CampaignSetup): string {
  if (platform === "revcontent") return s.bidStrategy === "cpa" ? "CPA" : "CPC";
  return { MAX_CONVERSIONS: "MAXCONV", TARGET_CPA: "TCPA", SMART: "SMARTBID", FIXED: "CPC" }[s.bidStrategy] ?? s.bidStrategy;
}

/** Hosts the server may download an existing ad image from (to re-upload it). Prevents fetching arbitrary URLs. */
const IMAGE_HOSTS = /(^|\.)taboola\.com$|(^|\.)revcontent\.com$|^revcontent\.s3\.amazonaws\.com$|(^|\.)fal\.media$|^storage\.googleapis\.com$/;

async function connection(platform: Platform, accountId: string) {
  const conn = await getConnection(accountId);
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
  const [campaigns, groups, rtCampaigns, templates] = await Promise.all([
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
  ]);
  return { campaigns, groups, rtCampaigns, templates: templates.filter((t) => t.platform === platform), warnings };
}

/** Uploads each creative as a new PAUSED ad. Returns one log line per creative. */
async function addCreatives(platform: Platform, accountId: string, campaignId: string, url: string, creatives: CreativeInput[], baseUrl: string) {
  const conn = await connection(platform, accountId);
  const variants = await listVariants();
  const steps: string[] = [];
  let ok = 0;
  for (const cr of creatives) {
    try {
      if (cr.kind === "variant") {
        const v = variants.find((x) => x.id === cr.variantId);
        if (!v) throw new Error("variação não encontrada");
        const headline = (cr.headline ?? v.headline).trim();
        const r =
          platform === "taboola"
            ? await publishTaboola(conn.credentials, campaignId, url, headline, (await getAsset(v.assetId)) ?? (() => { throw new Error("imagem não encontrada"); })())
            : await publishRevcontent(conn.credentials, campaignId, url, headline, v.source.brand ?? "", `${baseUrl}/api/assets/${v.assetId}`);
        await updateVariant(v.id, {
          status: "published",
          published: [...(v.published ?? []), { platform, itemId: r.itemId, at: new Date().toISOString(), status: r.status }],
        });
        steps.push(`Anúncio ${r.itemId} (variação) criado pausado`);
      } else {
        let host = "";
        try {
          host = new URL(cr.imageUrl).hostname;
        } catch {}
        if (!IMAGE_HOSTS.test(host)) throw new Error("imagem de origem não reconhecida");
        let r;
        if (platform === "taboola") {
          if (/(^|\.)taboola\.com$/.test(host)) {
            r = await publishTaboola(conn.credentials, campaignId, url, cr.headline, { hostedUrl: cr.imageUrl }, false);
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
            );
          }
        } else {
          r = await publishRevcontent(conn.credentials, campaignId, url, cr.headline, "", cr.imageUrl);
        }
        steps.push(`Anúncio ${r.itemId} (criativo existente) criado pausado`);
      }
      ok++;
    } catch (e) {
      steps.push(`Falhou um criativo: ${friendlyError("", e).replace(/^: /, "")}`);
    }
  }
  return { steps, ok };
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
};

export async function createCampaign(input: CreateInput, baseUrl: string) {
  const conn = await connection(input.platform, input.accountId);
  const steps: string[] = [];
  let campaignId = "";
  let ok = false;
  try {
    let groupId: string | undefined;
    if (input.platform === "taboola" && input.group?.mode === "new") {
      const g = await taboolaCreateGroup(conn.credentials, input.group);
      groupId = g.id;
      steps.push(`Grupo "${g.name}" criado (id ${g.id})`);
    } else if (input.platform === "taboola" && input.group?.mode === "existing") {
      groupId = input.group.id;
      steps.push(`Usando o grupo ${groupId}`);
    }
    const camp =
      input.platform === "taboola"
        ? await taboolaCreateCampaign(conn.credentials, input.name, input.setup, groupId)
        : await revcontentCreateCampaign(conn.credentials, input.name, input.setup);
    campaignId = camp.id;
    steps.push(`Campanha "${input.name}" criada pausada (id ${camp.id})`);
    const r = await addCreatives(input.platform, input.accountId, camp.id, input.url, input.creatives, baseUrl);
    steps.push(...r.steps);
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
  await addCampaignLog({
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
  const conn = await getConnection(accountId);
  if (!conn || (conn.provider !== "taboola" && conn.provider !== "revcontent")) throw new Error("Conta da fonte não encontrada.");
  const d = conn.provider === "taboola" ? await taboolaDetail(conn.credentials, campaignId) : await revcontentDetail(conn.credentials, campaignId);
  // Fill product / devices / country from the name when the API doesn't give them.
  const p = parseSourceName(d.name);
  if (p) {
    d.setup.product = p.product;
    if (!d.setup.countries.length) d.setup.countries = [p.country];
    if (conn.provider === "revcontent" && p.device && p.device !== "ALL") d.setup.devices = [p.device as "DESKTOP"];
  }
  return { ...d, accountId };
}

export type ItemChange = { id: string; title?: string; active?: boolean };

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
  const conn = await getConnection(input.accountId);
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
      steps.push(`Anúncio ${ch.id}: ${[ch.title !== undefined ? "headline nova" : "", ch.active !== undefined ? (ch.active ? "ativado" : "pausado") : ""].filter(Boolean).join(", ")}`);
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
    keep: { title: string; thumbnail: string }[];
    keepAll: boolean;
    creatives: CreativeInput[];
  },
  baseUrl: string,
) {
  const src = await getConnection(input.source.accountId);
  const dst = await getConnection(input.target.accountId);
  if (!src || !dst) throw new Error("Conta não encontrada.");
  const platform = dst.provider as Platform;
  const kept: CreativeInput[] = input.keep.map((k) => ({ kind: "ad", imageUrl: k.thumbnail, headline: k.title }));

  if (src.id === dst.id && platform === "taboola") {
    const steps: string[] = [];
    let campaignId = "";
    try {
      const c = await taboolaDuplicateWith(dst.credentials, input.source.campaignId, input.name, input.setup, input.keepAll);
      campaignId = c.id;
      steps.push(`Campanha duplicada pausada (id ${c.id})${input.keepAll ? " com todos os anúncios da original" : ""}`);
      const toAdd = [...(input.keepAll ? [] : kept), ...input.creatives];
      let items = 0;
      if (toAdd.length) {
        const r = await addCreatives(platform, dst.id, c.id, input.url, toAdd, baseUrl);
        steps.push(...r.steps);
        items = r.ok;
      }
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
    },
    baseUrl,
  );
  return {
    ...r,
    steps: [`Cópia de ${src.label ?? src.provider} → ${dst.label ?? dst.provider}`, ...r.steps],
  };
}
