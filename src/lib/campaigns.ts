import "server-only";
import { randomBytes } from "node:crypto";
import {
  revcontentCampaigns,
  revcontentCreateCampaign,
  revcontentDuplicate,
  taboolaCampaigns,
  taboolaCreateCampaign,
  taboolaCreateGroup,
  taboolaDuplicate,
  taboolaGroups,
  type NewGroup,
} from "./connectors/campaignBuilder";
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
