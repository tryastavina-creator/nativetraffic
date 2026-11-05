/**
 * Taboola creatives (campaign items). Endpoints from the official Backstage docs:
 * - Top Campaign Content report, dimension item_breakdown
 * - POST {account}/campaigns/{id}/items/ → item is CRAWLING until Taboola reads the URL
 * - POST operations/upload-image (multipart "file") → { value: CDN url }
 * - POST {account}/campaigns/{id}/items/{item}/ to set title, thumbnail, is_active, ai_disclosure
 */
import type { Credentials, DateRange } from "../types";
import { http, num } from "./http";
import { taboolaToken } from "./traffic";

const API = "https://backstage.taboola.com/backstage/api/1.0";

export type Creative = {
  itemId: string;
  campaignId: string;
  campaignName: string;
  title: string;
  thumbnail: string;
  url: string;
  spend: number;
  clicks: number;
  impressions: number;
  conversions: number;
  ctr: number;
  cpa: number;
  learning: string;
};

async function auth(c: Credentials) {
  return { Authorization: `Bearer ${await taboolaToken(c)}` };
}

export async function listCreatives(c: Credentials, range: DateRange): Promise<Creative[]> {
  const qs = new URLSearchParams({ start_date: range.from, end_date: range.to });
  const r = await http<{ results: Record<string, unknown>[] }>(
    `${API}/${c.accountId}/reports/top-campaign-content/dimensions/item_breakdown?${qs}`,
    { headers: await auth(c) },
  );
  return (r.results ?? []).map((x) => {
    const spend = num(x.spent);
    const clicks = num(x.clicks);
    const conversions = num(x.cpa_actions_num ?? x.actions);
    return {
      itemId: String(x.item ?? ""),
      campaignId: String(x.campaign ?? ""),
      campaignName: String(x.campaign_name ?? ""),
      title: String(x.item_name ?? ""),
      // Taboola's CDN answers on https too; http images are blocked on an https site.
      thumbnail: String(x.thumbnail_url ?? x.thumbnail ?? "").replace(/^http:\/\//, "https://"),
      url: String(x.url ?? ""),
      spend,
      clicks,
      impressions: num(x.visible_impressions ?? x.impressions),
      conversions,
      ctr: num(x.vctr ?? x.ctr),
      cpa: conversions ? spend / conversions : 0,
      learning: String(x.learning_display_status ?? ""),
    };
  });
}

async function uploadImage(c: Credentials, imageUrl: string): Promise<string> {
  const img = await fetch(imageUrl, { cache: "no-store" });
  if (!img.ok) throw new Error(`Não consegui baixar a imagem gerada (${img.status})`);
  const type = img.headers.get("content-type") ?? "image/jpeg";
  const form = new FormData();
  form.append("file", new Blob([await img.arrayBuffer()], { type }), `variant.${type.includes("png") ? "png" : "jpg"}`);
  const r = await http<{ value: string }>(`${API}/operations/upload-image`, {
    method: "POST",
    headers: await auth(c),
    body: form,
  });
  return r.value;
}

type Item = { id: string; status: string; is_active: boolean; approval_state: string; title: string | null };

/** Creates a new ad in the same campaign, with the same landing URL, always paused. */
export async function publishVariant(
  c: Credentials,
  campaignId: string,
  landingUrl: string,
  title: string,
  imageUrl: string,
): Promise<Item> {
  const thumbnail = await uploadImage(c, imageUrl);
  const headers = { ...(await auth(c)), "Content-Type": "application/json" };
  const base = `${API}/${c.accountId}/campaigns/${campaignId}/items/`;

  const created = await http<Item>(base, { method: "POST", headers, body: JSON.stringify({ url: landingUrl }) });
  // Pause right away so it never serves before review.
  await http(`${base}${created.id}/`, { method: "POST", headers, body: JSON.stringify({ is_active: false }) }).catch(() => {});

  let item = created;
  for (let i = 0; i < 20 && item.status === "CRAWLING"; i++) {
    await new Promise((r) => setTimeout(r, 3000));
    item = await http<Item>(`${base}${created.id}/`, { headers });
  }
  if (item.status === "CRAWLING") {
    throw new Error(`O anúncio ${created.id} foi criado pausado, mas a Taboola ainda está lendo o link. Tente atualizar em alguns minutos.`);
  }
  return http<Item>(`${base}${created.id}/`, {
    method: "POST",
    headers,
    body: JSON.stringify({
      title,
      thumbnail_url: thumbnail,
      is_active: false,
      ai_disclosure: { status: "AI_GENERATED" },
    }),
  });
}
