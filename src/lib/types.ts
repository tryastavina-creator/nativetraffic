export type DateRange = { from: string; to: string }; // YYYY-MM-DD, inclusive

export type Category = "store" | "traffic" | "tracker" | "payments" | "fulfillment" | "mcp";

export type FieldDef = {
  key: string;
  label: string;
  type?: "text" | "password" | "url";
  placeholder?: string;
  help?: string;
  optional?: boolean;
};

export type ProviderDef = {
  id: string;
  name: string;
  category: Category;
  description: string;
  docsUrl?: string;
  fields: FieldDef[];
  /** Short badge shown in the integrations grid. */
  status?: "stable" | "beta";
  color: string;
  initials: string;
};

export type Credentials = Record<string, string>;

export type Connection = {
  id: string; // provider id, or "mcp:<slug>" for custom MCP servers
  provider: string;
  label?: string;
  credentials: Credentials;
  createdAt: string;
  lastTestAt?: string;
  lastTestOk?: boolean;
  lastTestMessage?: string;
};

/** Daily ad spend reported by a traffic source or tracker. */
export type SpendRow = {
  date: string;
  platform: string; // provider id, e.g. "taboola"
  spend: number;
  clicks?: number;
  impressions?: number;
  conversions?: number;
  revenue?: number;
};

export type OrderLine = { product: string; quantity: number; price: number; unitCost: number };

export type Order = {
  id: string;
  /** Human order number, e.g. "#1031". */
  name?: string;
  date: string;
  createdAt: string;
  total: number;
  refunded: number;
  country?: string;
  utmSource?: string;
  utmCampaign?: string;
  /** Last-visit referrer, e.g. "https://nowhealthy.site/". */
  referrer?: string;
  isSubscription?: boolean;
  /** Bought a post-purchase / order-bump upsell (tag set by Zipify OCU, AfterSell…). */
  hasUpsell?: boolean;
  lines: OrderLine[];
};

export type TestResult = { ok: boolean; message: string; details?: unknown };
