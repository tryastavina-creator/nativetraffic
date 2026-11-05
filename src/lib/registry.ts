import type { Category, ProviderDef } from "./types";

export const CATEGORY_LABEL: Record<Category, string> = {
  store: "Loja",
  traffic: "Fontes de tráfego",
  tracker: "Tracker / Atribuição",
  payments: "Processador de pedidos",
  fulfillment: "Fulfillment / Estoque",
  ai: "Inteligência artificial",
  mcp: "Servidores MCP",
};

export const PROVIDERS: ProviderDef[] = [
  {
    id: "shopify",
    name: "Shopify",
    category: "store",
    description: "Pedidos, receita, reembolsos, produtos e custo (COGS) via Admin GraphQL API.",
    docsUrl: "https://shopify.dev/docs/apps/build/authentication-authorization/access-tokens/client-credentials-grant",
    color: "#95bf47",
    initials: "S",
    fields: [
      {
        key: "shop",
        label: "Domínio .myshopify.com",
        placeholder: "minhaloja.myshopify.com",
        help: "O domínio interno da loja, não o domínio público (.com).",
      },
      {
        key: "clientId",
        label: "Client ID",
        optional: true,
        help: "Dev Dashboard → seu app → Settings. O painel renova o acesso sozinho a cada 24h.",
      },
      { key: "clientSecret", label: "Client secret", type: "password", optional: true },
      {
        key: "accessToken",
        label: "Ou: Admin API access token",
        type: "password",
        placeholder: "shpat_…",
        optional: true,
        help: "Só para apps antigos criados no admin antes de 2026.",
      },
    ],
  },
  {
    id: "redtrack",
    name: "RedTrack",
    category: "tracker",
    description: "Custo, cliques e conversões por fonte/campanha para cruzar com a Shopify.",
    docsUrl: "https://api.redtrack.io/docs/index.html",
    color: "#e5484d",
    initials: "RT",
    fields: [{ key: "apiKey", label: "API key", type: "password", help: "RedTrack → Tools → Integrations → API" }],
  },
  {
    id: "taboola",
    name: "Taboola",
    category: "traffic",
    description: "Gasto diário via Backstage API (campaign-summary).",
    docsUrl: "https://developers.taboola.com/backstage-api/reference",
    color: "#2d6cdf",
    initials: "T",
    fields: [
      { key: "clientId", label: "Client ID" },
      { key: "clientSecret", label: "Client secret", type: "password" },
      { key: "accountId", label: "Account ID", placeholder: "minha-conta-sc" },
    ],
  },
  {
    id: "outbrain",
    name: "Outbrain",
    category: "traffic",
    description: "Gasto diário via Amplify API.",
    docsUrl: "https://amplifyv01.docs.apiary.io/",
    color: "#f5a524",
    initials: "O",
    fields: [
      { key: "username", label: "Usuário" },
      { key: "password", label: "Senha", type: "password" },
      { key: "marketerId", label: "Marketer ID" },
    ],
  },
  {
    id: "mediago",
    name: "MediaGo",
    category: "traffic",
    description: "Gasto diário via Reporting API (token gerado pelo gerente de conta).",
    color: "#4f6bed",
    initials: "M",
    status: "beta",
    fields: [
      { key: "apiToken", label: "API token", type: "password" },
      { key: "accountId", label: "Account ID", optional: true },
      { key: "baseUrl", label: "Base URL", type: "url", placeholder: "https://api.mediago.io", optional: true },
    ],
  },
  {
    id: "mgid",
    name: "MGID",
    category: "traffic",
    description: "Gasto por campanha via MGID API.",
    docsUrl: "https://api.mgid.com/",
    color: "#1f8fff",
    initials: "MG",
    status: "beta",
    fields: [
      { key: "email", label: "E-mail" },
      { key: "password", label: "Senha", type: "password" },
    ],
  },
  {
    id: "revcontent",
    name: "Revcontent",
    category: "traffic",
    description: "Gasto diário e por campanha via Revcontent Stats API.",
    docsUrl: "https://api.revcontent.io/docs/stats/index.html",
    color: "#ff4f64",
    initials: "RC",
    fields: [
      {
        key: "clientId",
        label: "Client ID",
        help: "Revcontent → Account Settings → Stats API Credentials (fim da página).",
      },
      { key: "clientSecret", label: "Client secret", type: "password", help: "40 caracteres, na mesma seção." },
    ],
  },
  {
    id: "meta",
    name: "Meta Ads",
    category: "traffic",
    description: "Insights de gasto via Graph API.",
    docsUrl: "https://developers.facebook.com/docs/marketing-api/insights",
    color: "#0866ff",
    initials: "f",
    fields: [
      { key: "accessToken", label: "System user token", type: "password" },
      { key: "adAccountId", label: "Ad account ID", placeholder: "act_1234567890" },
    ],
  },
  {
    id: "googleads",
    name: "Google Ads",
    category: "traffic",
    description: "Custo diário via Google Ads API (GAQL).",
    docsUrl: "https://developers.google.com/google-ads/api/docs/start",
    color: "#34a853",
    initials: "G",
    fields: [
      { key: "developerToken", label: "Developer token", type: "password" },
      { key: "clientId", label: "OAuth client ID" },
      { key: "clientSecret", label: "OAuth client secret", type: "password" },
      { key: "refreshToken", label: "Refresh token", type: "password" },
      { key: "customerId", label: "Customer ID", placeholder: "1234567890" },
      { key: "loginCustomerId", label: "MCC (login customer ID)", optional: true },
    ],
  },
  {
    id: "wio",
    name: "Wiio",
    category: "fulfillment",
    description:
      "Fornecedor e envio dos pedidos. O custo de produto e frete é calculado pela tabela em Configurações; a API só é necessária se a Wiio liberar acesso.",
    docsUrl: "https://app.wiio.io",
    color: "#a78bfa",
    initials: "W",
    status: "beta",
    fields: [
      { key: "baseUrl", label: "Base URL da API", type: "url", placeholder: "https://…", optional: true, help: "Só se a Wiio liberar acesso à API." },
      { key: "apiKey", label: "API key", type: "password", optional: true },
      { key: "ordersPath", label: "Endpoint de pedidos", placeholder: "/v1/orders", optional: true },
      { key: "webhookSecret", label: "Webhook secret", type: "password", optional: true },
    ],
  },
  {
    id: "cj",
    name: "CJ Dropshipping",
    category: "fulfillment",
    description: "Estoque por SKU e custo de produto.",
    docsUrl: "https://developers.cjdropshipping.com/",
    color: "#ff6a00",
    initials: "CJ",
    status: "beta",
    fields: [
      { key: "email", label: "E-mail" },
      { key: "apiKey", label: "API key", type: "password" },
    ],
  },
];

PROVIDERS.push({
  id: "fal",
  name: "fal.ai (Gemini imagens)",
  category: "ai",
  description: "Gera variações dos seus criativos com o modelo de imagem do Google Gemini (Nano Banana). $0,04 por imagem.",
  docsUrl: "https://fal.ai/models/fal-ai/nano-banana/edit",
  color: "#8b5cf6",
  initials: "AI",
  fields: [
    {
      key: "apiKey",
      label: "API key",
      type: "password",
      help: "fal.ai → entre com Google → Dashboard → API Keys → Create key. Adicione créditos em Billing.",
    },
  ],
});

/** Template used when the user adds any remote MCP server (Shopify, RedTrack, etc.). */
export const MCP_TEMPLATE: ProviderDef = {
  id: "mcp",
  name: "Servidor MCP",
  category: "mcp",
  description: "Qualquer servidor MCP remoto (Streamable HTTP). Lista as ferramentas e permite chamá-las.",
  docsUrl: "https://modelcontextprotocol.io",
  color: "#e4e4e7",
  initials: "MCP",
  fields: [
    { key: "name", label: "Nome", placeholder: "Shopify MCP" },
    { key: "url", label: "URL do servidor", type: "url", placeholder: "https://…/mcp" },
    {
      key: "authHeader",
      label: "Authorization header",
      type: "password",
      placeholder: "Bearer …",
      optional: true,
    },
  ],
};

export const TRAFFIC_IDS = PROVIDERS.filter((p) => p.category === "traffic").map((p) => p.id);

export function getProvider(id: string): ProviderDef | undefined {
  if (id === "mcp" || id.startsWith("mcp:")) return MCP_TEMPLATE;
  return PROVIDERS.find((p) => p.id === id);
}

/**
 * Map an order to a traffic platform. Checks utm_source first, then the
 * campaign name (e.g. "012 | Taboola | OmniPro | ADV"), then the referrer.
 */
export function platformFromOrder(o: { utmSource?: string; utmCampaign?: string; referrer?: string }): string {
  for (const v of [o.utmSource, o.utmCampaign]) {
    const p = platformFromUtm(v);
    if (p !== "untracked" && p !== "other") return p;
  }
  return o.utmSource || o.utmCampaign ? "other" : "untracked";
}

/** Map a raw utm_source / campaign string to a provider id. */
export function platformFromUtm(source?: string): string {
  const s = (source ?? "").toLowerCase();
  if (!s) return "untracked";
  if (s.includes("revcontent")) return "revcontent";
  if (s.includes("newsbreak")) return "newsbreak";
  if (s.includes("taboola")) return "taboola";
  if (s.includes("outbrain")) return "outbrain";
  if (s.includes("mediago")) return "mediago";
  if (s.includes("mgid")) return "mgid";
  if (s.includes("google") || s === "adwords") return "googleads";
  if (s.includes("facebook") || s.includes("meta") || s === "fb" || s === "ig") return "meta";
  return "other";
}

export const PLATFORM_LABEL: Record<string, string> = {
  ...Object.fromEntries(PROVIDERS.map((p) => [p.id, p.name])),
  revcontent: "Revcontent",
  newsbreak: "NewsBreak",
  untracked: "Sem UTM",
  other: "Outros",
  subscription: "Recorrência",
};
