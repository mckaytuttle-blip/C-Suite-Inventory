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
  // Units of this line fulfilled via drop-shipment rather than Stat's own warehouse.
  // Zoho does NOT add these into quantity_shipped — a fully-fulfilled dropshipped
  // line shows quantity_shipped: 0 and quantity_dropshipped: <full quantity>, even
  // though the customer got their order. Fill rate rollups need to add this in
  // separately (see isDropshipPoClosed below) rather than relying on quantity_shipped
  // alone, or dropshipped products will always look under-fulfilled.
  quantity_dropshipped: number;
};

// A purchase order linked to a sales order for drop-shipment fulfillment (appears
// in salesorder.purchaseorders[]). There's no separate "PO created?" custom field in
// Zoho for this — the presence of an entry here *is* that signal. order_status
// progresses "open" -> "closed" as the PO is received/billed through; treat a
// dropshipped line's units as reliably shipped only once every linked PO is closed.
export type ZohoLinkedPurchaseOrder = {
  purchaseorder_id: string;
  purchaseorder_number: string;
  status: string;
  order_status: string; // "open" | "closed"
  billed_status: string;
  date: string;
};

/**
 * Best-available "this got resolved on X date" signal for a dropship PO, pulled from
 * the PO's own detail record. Dropship POs never go through Stat's warehouse, so
 * `is_received` never flips true and there's no receive-date event to use (confirmed
 * live on PO-00504 for SO-01241: is_received: false, purchasereceives: [] even though
 * the order shipped and was fully billed). The closest thing to an independent,
 * dated confirmation is the vendor bill — falling back to the PO's last-modified date
 * if it hasn't been billed yet. This is a proxy, not a confirmed ship date, so treat
 * it as lower-confidence than an actual package date.
 */
export type ZohoPurchaseOrderDetail = {
  orderStatus: string;
  billDates: string[];
  lastModifiedDate: string | null; // YYYY-MM-DD
};
// Package record as it appears *nested inside a sales order's own detail response*
// (salesorder.packages[]) — NOT from the standalone /packages list endpoint. That
// standalone endpoint's salesorder_id query param is silently ignored by Zoho (it
// just returns the org's most recent packages regardless of the filter), so don't
// use fetchPackagesForOrder-style calls against it. The order-scoped array here is
// the only reliable source for "did THIS order's packages actually ship, and when."
export type ZohoOrderPackage = {
  package_id: string;
  package_number: string;
  status: string; // "shipped" | "not_shipped" | ...
  // The actual date this package went out (YYYY-MM-DD), only meaningful once
  // status is "shipped". Confusingly similar-sounding to the *different* field on
  // ZohoSalesOrder itself ("shipment_date" there means "promised/due date", not
  // actual — this "date" field here is the real one).
  date: string;
};
export type ZohoSalesOrderDetail = {
  lineItems: ZohoSalesOrderLineItem[];
  packages: ZohoOrderPackage[];
  purchaseOrders: ZohoLinkedPurchaseOrder[];
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
/**
 * Fetch a single sales order's detail — line items (for the per-product fill rate
 * rollup) and packages (for OTIF's "actual ship date"), in one call. Both only exist
 * on the detail endpoint, not the list endpoint, so this is one Zoho request either
 * way; fetching them together halves the number of detail calls we used to make.
 */
export async function fetchSalesOrderDetail(salesorderId: string): Promise<ZohoSalesOrderDetail> {
  const data = await zohoGet<{
    salesorder: {
      line_items: ZohoSalesOrderLineItem[];
      packages?: ZohoOrderPackage[];
      purchaseorders?: ZohoLinkedPurchaseOrder[];
    };
  }>(`/salesorders/${salesorderId}`);
  return {
    lineItems: data.salesorder.line_items ?? [],
    packages: data.salesorder.packages ?? [],
    purchaseOrders: data.salesorder.purchaseorders ?? [],
  };
}
/**
 * Fetch a purchase order's own detail — used only as a fallback when a dropshipped
 * order has no package record to pull an actual ship date from (see
 * ZohoPurchaseOrderDetail above for why). Only called for the specific orders that
 * need it, not for every order, to keep this from adding a lot of extra API calls.
 */
export async function fetchPurchaseOrderDetail(
  purchaseOrderId: string
): Promise<ZohoPurchaseOrderDetail> {
  const data = await zohoGet<{
    purchaseorder: {
      order_status: string;
      bills?: { date: string }[];
      last_modified_time?: string;
    };
  }>(`/purchaseorders/${purchaseOrderId}`);
  const po = data.purchaseorder;
  return {
    orderStatus: po.order_status,
    billDates: (po.bills ?? []).map((b) => b.date).filter(Boolean),
    lastModifiedDate: po.last_modified_time ? po.last_modified_time.slice(0, 10) : null,
  };
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
