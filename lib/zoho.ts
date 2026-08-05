// Server-side only Zoho Inventory client.
// Never import this from a client component — it holds the refresh token flow.
const ACCOUNTS_BASE = "https://accounts.zoho.com/oauth/v2/token";
const API_BASE = "https://www.zohoapis.com/inventory/v1";
let cachedToken: { token: string; expiresAt: number } | null = null;
function env(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`Missing required env var: ${name}`);
  return v;
}
async function getAccessToken(): Promise<string> {
  if (cachedToken && cachedToken.expiresAt > Date.now() + 60_000) {
    return cachedToken.token;
  }
  const params = new URLSearchParams({
    refresh_token: env("ZOHO_REFRESH_TOKEN"),
    client_id: env("ZOHO_CLIENT_ID"),
    client_secret: env("ZOHO_CLIENT_SECRET"),
    grant_type: "refresh_token",
  });
  const res = await fetch(ACCOUNTS_BASE, { method: "POST", body: params });
  if (!res.ok) {
    throw new Error(`Zoho token refresh failed: ${res.status} ${await res.text()}`);
  }
  const data = await res.json();
  if (!data.access_token) {
    throw new Error(`Zoho token refresh response missing access_token: ${JSON.stringify(data)}`);
  }
  cachedToken = {
    token: data.access_token,
    // Zoho tokens last ~3600s; refresh a bit early.
    expiresAt: Date.now() + (data.expires_in ?? 3600) * 1000,
  };
  return cachedToken.token;
}
async function zohoGet<T = any>(
  path: string,
  params: Record<string, string | number | undefined> = {}
): Promise<T> {
  const token = await getAccessToken();
  const orgId = env("ZOHO_ORG_ID");
  const url = new URL(`${API_BASE}${path}`);
  url.searchParams.set("organization_id", orgId);
  for (const [k, v] of Object.entries(params)) {
    if (v !== undefined) url.searchParams.set(k, String(v));
  }
  const res = await fetch(url.toString(), {
    headers: { Authorization: `Zoho-oauthtoken ${token}` },
    // Always hit Zoho fresh — caching happens at our own snapshot layer, not here.
    cache: "no-store",
  });
  if (res.status === 429) {
    throw new Error("Zoho rate limit hit (429) — back off before retrying.");
  }
  if (!res.ok) {
    throw new Error(`Zoho GET ${path} failed: ${res.status} ${await res.text()}`);
  }
  return res.json();
}
export type ZohoItem = {
  item_id: string;
  name: string;
  sku: string;
  status: string;
  stock_on_hand: number;
  available_stock: number;
  actual_available_stock: number;
};
export type ZohoCompositeItem = {
  composite_item_id: string;
  name: string;
  sku: string;
  status: string;
  can_be_sold: boolean;
  stock_on_hand: number;
  available_stock: number;
  actual_available_stock: number;
};
export type ZohoSalesOrder = {
  salesorder_id: string;
  salesorder_number: string;
  customer_name: string;
  date: string;
  quantity: number;
  quantity_shipped: number;
  quantity_invoiced: number;
  quantity_packed: number;
  shipped_status: string;
  status: string;
  is_backorder: boolean;
  // The order's *promised/due* ship date (YYYY-MM-DD), as set/calculated in Zoho —
  // NOT the date it actually shipped. Used as the "on time" benchmark for OTIF; the
  // actual completion date has to come from /packages instead (see ZohoPackage).
  shipment_date: string;
};
export type ZohoSalesOrderLineItem = {
  item_id: string;
  name: string;
  quantity: number;
  quantity_shipped: number;
};
export type ZohoPackage = {
  package_id: string;
  salesorder_id: string;
  status: string; // "shipped" | "not_shipped" | ...
  // The actual date this package went out (YYYY-MM-DD), only meaningful once
  // status is "shipped". Confusingly shares a name with the *different* field on
  // ZohoSalesOrder ("shipment_date" there means "promised/due date", not actual).
  date: string;
  shipment_date: string;
};
/** Fetch every page of /items (leaf, non-composite) items. */
export async function fetchAllItems(): Promise<ZohoItem[]> {
  const all: ZohoItem[] = [];
  let page = 1;
  for (;;) {
    const data = await zohoGet<{ items: ZohoItem[]; page_context: { has_more_page: boolean } }>(
      "/items",
      { per_page: 200, page }
    );
    all.push(...data.items);
    if (!data.page_context?.has_more_page) break;
    page += 1;
  }
  return all;
}
/** Fetch every page of /compositeitems. */
export async function fetchAllCompositeItems(): Promise<ZohoCompositeItem[]> {
  const all: ZohoCompositeItem[] = [];
  let page = 1;
  for (;;) {
    const data = await zohoGet<{
      composite_items: ZohoCompositeItem[];
      page_context: { has_more_page: boolean };
    }>("/compositeitems", { per_page: 200, page });
    all.push(...data.composite_items);
    if (!data.page_context?.has_more_page) break;
    page += 1;
  }
  return all;
}
/** Fetch sales orders whose `date` falls within [startDate, endDate] (inclusive, YYYY-MM-DD). */
export async function fetchSalesOrdersInRange(
  startDate: string,
  endDate: string
): Promise<ZohoSalesOrder[]> {
  const all: ZohoSalesOrder[] = [];
  let page = 1;
  for (;;) {
    const data = await zohoGet<{
      salesorders: ZohoSalesOrder[];
      page_context: { has_more_page: boolean };
    }>("/salesorders", {
      per_page: 200,
      page,
      sort_column: "date",
      sort_order: "D",
      date_start: startDate,
      date_end: endDate,
    });
    all.push(...data.salesorders);
    if (!data.page_context?.has_more_page) break;
    page += 1;
  }
  return all;
}
/** Fetch line items for a single sales order (used for per-product fill rate rollup). */
export async function fetchSalesOrderLineItems(
  salesorderId: string
): Promise<ZohoSalesOrderLineItem[]> {
  const data = await zohoGet<{ salesorder: { line_items: ZohoSalesOrderLineItem[] } }>(
    `/salesorders/${salesorderId}`
  );
  return data.salesorder.line_items ?? [];
}
/** Fetch package (shipment) records for a single sales order — used for OTIF's "actual ship date". */
export async function fetchPackagesForOrder(salesorderId: string): Promise<ZohoPackage[]> {
  const data = await zohoGet<{ packages: ZohoPackage[] }>("/packages", {
    salesorder_id: salesorderId,
  });
  return data.packages ?? [];
}
/** Simple concurrency-limited map, used to avoid hammering Zoho's rate limits. */
export async function mapWithConcurrency<T, R>(
  items: T[],
  limit: number,
  fn: (item: T, index: number) => Promise<R>
): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let next = 0;
  async function worker() {
    while (next < items.length) {
      const i = next++;
      results[i] = await fn(items[i], i);
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, () => worker()));
  return results;
}
