/**
 * Ads (creatives) of Taboola and Revcontent: list with performance, and publish new ones PAUSED.
 *
 * Taboola (official Backstage docs):
 *  - Top Campaign Content report, dimension item_breakdown
 *  - POST {account}/campaigns/{id}/items/ → CRAWLING until Taboola reads the URL
 *  - POST operations/upload-image (multipart "file") → { value: CDN url }
 *  - POST {account}/campaigns/{id}/items/{item}/ with title, thumbnail_url, is_active, ai_disclosure
 * Revcontent (official Stats API spec):
 *  - GET  /boosts/content (headline, image_url, target_url, cost, clicks, conversions per content)
 *  - POST /boosts/:id/content/add { target_url, image (public URL), headline ≤80, brand_name ≤30 }
 *  - POST /boosts/:id/content { id, enabled: "off" }
 */
import type { Credentials, DateRange } from "../types";
import { http, num } from "./http";
import { RC, rcGet, revcontentToken, taboolaToken } from "./traffic";

const API = "https://backstage.taboola.com/backstage/api/1.0";

/** Ad text beyond the headline: description (Taboola + Revcontent, ≤250) and Taboola's CTA button (empty = none). */
export type AdExtra = { description?: string; cta?: string };

export type Creative = {
  platform: "taboola" | "revcontent";
  itemId: string;
  campaignId: string;
  campaignName: string;
  title: string;
  thumbnail: string;
  url: string;
  brand: string;
  spend: number;
  clicks: number;
  impressions: number;
  /** Conversions the source itself recorded for this ad. */
  conversions: number;
  ctr: number;
  status: string;
};

const https = (u: string) => u.replace(/^http:\/\//, "https://");

export async function listTaboola(c: Credentials, range: DateRange): Promise<Creative[]> {
  const qs = new URLSearchParams({ start_date: range.from, end_date: range.to });
  const r = await http<{ results: Record<string, unknown>[] }>(
    `${API}/${c.accountId}/reports/top-campaign-content/dimensions/item_breakdown?${qs}`,
    { headers: { Authorization: `Bearer ${await taboolaToken(c)}` } },
  );
  return (r.results ?? []).map((x) => ({
    platform: "taboola" as const,
    itemId: String(x.item ?? ""),
    campaignId: String(x.campaign ?? ""),
    campaignName: String(x.campaign_name ?? ""),
    title: String(x.item_name ?? ""),
    thumbnail: https(String(x.thumbnail_url ?? x.thumbnail ?? "")),
    url: String(x.url ?? ""),
    brand: "",
    spend: num(x.spent),
    clicks: num(x.clicks),
    impressions: num(x.visible_impressions ?? x.impressions),
    conversions: num(x.cpa_actions_num ?? x.actions),
    ctr: num(x.vctr ?? x.ctr),
    status: String(x.learning_display_status ?? ""),
  }));
}

type RcContent = {
  boost_id: string;
  content_id: string;
  headline: string;
  image_url: string;
  target_url: string;
  brand_name?: string;
  enabled?: string;
  admin_status?: string;
  impressions?: string;
  clicks?: string;
  conversions?: string;
  cost?: string;
  ctr?: string;
};

export async function listRevcontent(c: Credentials, range: DateRange): Promise<Creative[]> {
  const [content, boosts] = await Promise.all([
    rcGet<RcContent[]>(c, "/stats/api/v1.0/boosts/content", { date_from: range.from, date_to: range.to }),
    rcGet<{ id: string; name: string }[]>(c, "/stats/api/v1.0/boosts", { limit: "1000" }).catch(() => ({
      success: false,
      data: [] as { id: string; name: string }[],
    })),
  ]);
  const names = new Map(boosts.data.map((b) => [String(b.id), b.name]));
  return content.data.map((x) => ({
    platform: "revcontent" as const,
    itemId: String(x.content_id),
    campaignId: String(x.boost_id),
    campaignName: names.get(String(x.boost_id)) ?? `Campanha ${x.boost_id}`,
    title: x.headline ?? "",
    thumbnail: https(x.image_url ?? ""),
    url: x.target_url ?? "",
    brand: x.brand_name ?? "",
    spend: num(x.cost),
    clicks: num(x.clicks),
    impressions: num(x.impressions),
    conversions: num(x.conversions),
    ctr: num(x.ctr),
    status: [x.enabled, x.admin_status].filter(Boolean).join(" · "),
  }));
}

type Item = { id: string; status: string; is_active: boolean; approval_state: string };

/** New Taboola ad in the same campaign, same landing URL, uploaded image — always paused. */
export async function publishTaboola(
  c: Credentials,
  campaignId: string,
  landingUrl: string,
  title: string,
  image: { bytes: Buffer; mime: string } | { hostedUrl: string },
  aiGenerated = true,
  /** Resume an ad created earlier that was still being crawled. */
  existingItemId?: string,
  extra: AdExtra = {},
): Promise<{ itemId: string; status: string }> {
  const auth = { Authorization: `Bearer ${await taboolaToken(c)}` };
  let thumbnail: string;
  if ("hostedUrl" in image) {
    thumbnail = image.hostedUrl; // already on Taboola's CDN (reusing a running ad)
  } else {
    const form = new FormData();
    form.append("file", new Blob([new Uint8Array(image.bytes)], { type: image.mime }), image.mime.includes("png") ? "variant.png" : "variant.jpg");
    thumbnail = (await http<{ value: string }>(`${API}/operations/upload-image`, { method: "POST", headers: auth, body: form })).value;
  }

  const headers = { ...auth, "Content-Type": "application/json" };
  const base = `${API}/${c.accountId}/campaigns/${campaignId}/items/`;
  const created = existingItemId
    ? await http<Item>(`${base}${existingItemId}/`, { headers })
    : await http<Item>(base, { method: "POST", headers, body: JSON.stringify({ url: landingUrl }) });
  // Pause right away so it never serves before review.
  if (!existingItemId) await http(`${base}${created.id}/`, { method: "POST", headers, body: JSON.stringify({ is_active: false }) }).catch(() => {});

  let item = created;
  for (let i = 0; i < 20 && item.status === "CRAWLING"; i++) {
    await new Promise((r) => setTimeout(r, 3000));
    item = await http<Item>(`${base}${created.id}/`, { headers });
  }
  if (item.status === "CRAWLING") {
    throw Object.assign(new Error(`a Taboola ainda está lendo o link do anúncio ${created.id} (pode levar alguns minutos); use "Tentar de novo"`), {
      itemId: String(created.id),
      friendly: true,
    });
  }
  const done = await http<Item>(`${base}${created.id}/`, {
    method: "POST",
    headers,
    body: JSON.stringify({
      title,
      thumbnail_url: thumbnail,
      is_active: false,
      ...(extra.description?.trim() ? { description: extra.description.trim().slice(0, 250) } : {}),
      ...(extra.cta ? { cta: { cta_type: extra.cta } } : {}),
      ...(aiGenerated ? { ai_disclosure: { status: "AI_GENERATED" } } : {}),
    }),
  });
  return { itemId: done.id, status: `${done.status} · ${String(done.approval_state).toLowerCase()}` };
}

/** New Revcontent ad in the same campaign, then switched off ("pausado"). Revcontent downloads the image from a public URL. */
export async function publishRevcontent(
  c: Credentials,
  campaignId: string,
  landingUrl: string,
  headline: string,
  brand: string,
  publicImageUrl: string,
  extra: AdExtra = {},
): Promise<{ itemId: string; status: string }> {
  const headers = { Authorization: `Bearer ${await revcontentToken(c)}`, "Content-Type": "application/json" };
  const added = await http<{ success: boolean; creative: { id: number | string; status: string } }>(
    `${RC}/stats/api/v1.0/boosts/${campaignId}/content/add`,
    {
      method: "POST",
      headers,
      body: JSON.stringify({
        boost_id: Number(campaignId),
        target_url: landingUrl,
        image: publicImageUrl,
        headline: headline.slice(0, 80),
        ...(extra.description?.trim() ? { description: extra.description.trim().slice(0, 250) } : {}),
        brand_name: (brand || "Sponsored").slice(0, 30),
      }),
    },
  );
  const id = String(added.creative.id);
  await http(`${RC}/stats/api/v1.0/boosts/${campaignId}/content`, {
    method: "POST",
    headers,
    body: JSON.stringify({ boost_id: Number(campaignId), id: Number(id), enabled: "off" }),
  });
  return { itemId: id, status: `pausado · ${added.creative.status}` };
}
