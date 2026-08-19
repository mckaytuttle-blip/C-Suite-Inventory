import { Redis } from "@upstash/redis";
// Data model:
//
//   snapshot:{YYYY-MM-DD}      -> ComponentSnapshot     (one per day, components' in-stock status)
//   fillrate:latest            -> FillRateSummary        (most recently completed calendar month, refreshed daily)
//   fillrate:history:{YYYY-MM-DD} -> FillRateHistoryPoint (lightweight daily point, for trend charts)
//   inventory-health:latest    -> InventoryHealthSummary (Aging/Dead Stock + Inventory Turnover, refreshed via /api/cron/aging)
//   meta:last_snapshot_run     -> ISO timestamp string   (for troubleshooting/observability)
//   meta:last_aging_run        -> ISO timestamp string   (separate from the above — aging/turnover runs on its own cron)
export interface ComponentSnapshotEntry {
  itemId: string | null;
  stockOnHand: number | null;
  availableStock: number | null;
  inStock: boolean;
  matched: boolean; // false if this tracked component wasn't found in Zoho at all
}
export interface ComponentSnapshot {
  date: string; // YYYY-MM-DD
  generatedAt: string; // ISO timestamp
  source: "live" | "backfill";
  components: Record<string, ComponentSnapshotEntry>; // keyed by tracked component name
}
export interface AssemblyFillRate {
  name: string;
  ordered: number;
  shipped: number;
  fillRate: number | null; // null if ordered === 0
  // Units within `shipped` above that were fulfilled via drop-shipment (Zoho tracks
  // these separately from quantity_shipped on the line item, so they're folded in
  // here once the linked dropship PO has closed) — optional so pre-migration
  // summaries don't break at read time.
  dropshippedUnits?: number;
  // Units that went out as a dropship but whose PO hasn't closed in Zoho yet —
  // held back from `shipped` until confirmed, so this fill rate isn't overstated.
  dropshipPendingUnits?: number;
}

/**
 * OTIF — On Time In Full. Unlike Fill Rate above (unit-weighted, partial credit for
 * partial shipments), OTIF is order-count-based and binary per order: an order either
 * shipped complete AND by its promised date, or it didn't. "On time" is only knowable
 * once we look at each order's actual package ship date vs. its promised shipment_date
 * (see fetchSalesOrderDetail in lib/zoho.ts) — the order record itself only carries the
 * promise, not the actual outcome.
 *
 * Orders with no `shipment_date` set in Zoho have nothing to measure "on time" against,
 * so they're excluded from the rate entirely (not counted as a fail) — otifRate is
 * otifCount / eligibleOrders, not totalOrders. excludedNoDueDate tracks how many orders
 * got skipped this way, since a rising count is itself a signal CS needs to start
 * setting the promised ship date on orders.
 */
export interface OtifSummary {
  totalOrders: number; // all orders in the window, for context
  eligibleOrders: number; // orders with a shipment_date set — the OTIF denominator
  excludedNoDueDate: number; // orders skipped because shipment_date was blank
  inFullCount: number;
  onTimeCount: number;
  otifCount: number; // orders that were both in full AND on time
  otifRate: number | null; // otifCount / eligibleOrders, null if eligibleOrders === 0
  // Count of eligible orders where "on time" had to be determined from a dropship
  // PO's bill/last-modified date rather than a real package ship date, because Zoho
  // never creates a package record for dropshipped fulfillment. Tracked separately
  // so it's visible how often OTIF is leaning on this lower-confidence proxy.
  dropshipProxyCount: number;
}

export interface FillRateSummary {
  windowStart: string; // YYYY-MM-DD
  windowEnd: string; // YYYY-MM-DD
  // Human-readable label for the reporting period, e.g. "July 2026". Added when Fill
  // Rate switched from a rolling 30-day window to the last fully completed calendar
  // month — optional so old stored summaries (pre-switch) don't break at read time.
  windowLabel?: string;
  generatedAt: string;
  orderCount: number;
  totalOrdered: number;
  totalShipped: number;
  overallFillRate: number | null;
  byAssembly: AssemblyFillRate[];
  // Optional so summaries saved before OTIF was added don't fail to parse.
  otif?: OtifSummary;
}

/**
 * Lightweight daily point derived from a FillRateSummary, kept indefinitely (unlike
 * fillrate:latest, which gets overwritten every run) so the Fill Rate Detail page can
 * chart how the reported month's numbers have moved over time — same pattern as the
 * daily component snapshots use for In-Stock Rate history.
 */
export interface FillRateHistoryPoint {
  date: string; // YYYY-MM-DD — the day this snapshot was taken, not the order date
  overallFillRate: number | null;
  totalOrdered: number;
  totalShipped: number;
  otifRate?: number | null;
  byAssembly: Record<string, { ordered: number; shipped: number }>;
}
/**
 * Per-component Aging + Turnover figures, computed together since both are built on
 * the same leaf-movement rolldown (lib/leaf-movement.ts) and the same daily stock
 * snapshots already collected for In-Stock Rate.
 */
export interface InventoryHealthEntry {
  name: string;
  tier: string;
  matched: boolean;
  purchaseRate: number | null; // null if Zoho has no reliable cost on file
  stockOnHand: number | null; // current, as of the last successful pull
  valueAtCost: number | null; // stockOnHand * purchaseRate, null if either input is missing
  vendorName: string | null; // Zoho's on-file vendor for this component, null if blank

  // --- Aging / Dead Stock ---
  lastMovementDate: string | null; // null = no movement found anywhere in the 180-day lookback
  daysSinceLastMovement: number | null; // null = unknown/beyond the lookback window, treat as "180+"
  noMovement90: boolean;
  noMovement180: boolean;

  // --- Inventory Turnover (trailing 90 days, annualized) ---
  unitsConsumed90: number;
  cogs90: number | null; // unitsConsumed90 * purchaseRate
  avgStockOnHand90: number | null; // average of daily snapshots (live only) over the trailing 90 days
  avgInventoryValue90: number | null; // avgStockOnHand90 * purchaseRate
  daysOfSnapshotData90: number; // how many of the trailing 90 days had a live (non-backfill) snapshot
  turnoverRatioAnnualized: number | null; // (cogs90 * 365/90) / avgInventoryValue90
}

/** One vendor's share of the 83 tracked components' current on-hand value. */
export interface VendorInventoryShare {
  vendorName: string; // "No vendor on file" bucket for blank/missing
  inventoryValue: number; // sum of valueAtCost across this vendor's tracked components
  skuCount: number; // how many tracked components trace to this vendor
}

/** One vendor's share of trailing-window, org-wide purchase order spend. */
export interface VendorSpendShare {
  vendorName: string;
  spend: number;
  poCount: number;
}

/**
 * Org-wide purchase order spend for the current calendar year to date (Jan 1 →
 * today) — deliberately NOT scoped to the 83 tracked components (Stat asked for
 * total company procurement spend, not just hardware). A separate Zoho pull from
 * everything else in InventoryHealthSummary, so it's nullable: if this piece of the
 * aging cron fails, Aging/Turnover/Dead Stock still save successfully and this just
 * reports as unavailable rather than taking down the whole snapshot.
 */
export interface SpendSummary {
  windowDays: number; // days elapsed so far this calendar year (Jan 1 → windowEnd, inclusive) — not a fixed constant; grows toward 365/366 across the year and resets each January
  windowStart: string;
  windowEnd: string;
  totalSpend: number; // sum of PO totals, excluding cancelled
  poCount: number;
  byVendor: VendorSpendShare[]; // sorted desc by spend
}

export interface InventoryHealthSummary {
  generatedAt: string;
  agingWindowDays: number; // 180 — the lookback used for "last movement"
  turnoverWindowDays: number; // 90 — the window used for COGS/avg inventory
  byComponent: InventoryHealthEntry[];
  aggregate: {
    totalInventoryValue: number; // sum of valueAtCost across matched, priced components
    deadStockValue90: number; // sum of valueAtCost where noMovement90
    deadStockValue180: number; // sum of valueAtCost where noMovement180
    deadStockCount90: number;
    deadStockCount180: number;
    overallTurnoverRatioAnnualized: number | null; // $-weighted: sum(annualized COGS) / sum(avg inventory $)
    componentsMissingCost: number; // matched components with no usable purchase_rate
    componentsUnmatched: number; // tracked components not found in Zoho at all
    // Added alongside Capital Tied Up / Vendor Concentration / Total Spend — optional
    // so summaries saved before this change don't fail to parse (see getInventoryHealthSummary).
    vendorInventoryBreakdown?: VendorInventoryShare[]; // sorted desc by inventoryValue
    spend?: SpendSummary | null; // null if the spend pull itself failed this run
  };
}

let client: Redis | null = null;
// Vercel's Marketplace Redis integrations don't always use the plain
// UPSTASH_REDIS_REST_URL / UPSTASH_REDIS_REST_TOKEN names — depending on what
// you named the store when connecting it, Vercel may prefix them (e.g.
// STORAGE_KV_REST_API_URL / STORAGE_KV_REST_API_TOKEN). Rather than requiring
// an exact rename in the Vercel dashboard, check a few known variants in order.
const URL_ENV_CANDIDATES = [
  "UPSTASH_REDIS_REST_URL",
  "STORAGE_KV_REST_API_URL",
  "KV_REST_API_URL",
];
const TOKEN_ENV_CANDIDATES = [
  "UPSTASH_REDIS_REST_TOKEN",
  "STORAGE_KV_REST_API_TOKEN",
  "KV_REST_API_TOKEN",
];
function firstDefined(names: string[]): string | undefined {
  for (const name of names) {
    const value = process.env[name];
    if (value) return value;
  }
  return undefined;
}
function getClient(): Redis {
  if (client) return client;
  const url = firstDefined(URL_ENV_CANDIDATES);
  const token = firstDefined(TOKEN_ENV_CANDIDATES);
  if (!url || !token) {
    throw new Error(
      `Missing Redis REST credentials — set one of [${URL_ENV_CANDIDATES.join(", ")}] and ` +
        `[${TOKEN_ENV_CANDIDATES.join(", ")}] (add the Redis integration in Vercel's Storage ` +
        "tab, or set these manually) before calling the snapshot/kpi routes."
    );
  }
  client = new Redis({ url, token });
  return client;
}
export async function saveComponentSnapshot(snapshot: ComponentSnapshot): Promise<void> {
  const redis = getClient();
  await redis.set(`snapshot:${snapshot.date}`, snapshot);
  await redis.sadd("snapshot:dates", snapshot.date);
}
export async function getComponentSnapshot(date: string): Promise<ComponentSnapshot | null> {
  const redis = getClient();
  return (await redis.get<ComponentSnapshot>(`snapshot:${date}`)) ?? null;
}
export async function getComponentSnapshots(dates: string[]): Promise<(ComponentSnapshot | null)[]> {
  if (dates.length === 0) return [];
  const redis = getClient();
  const keys = dates.map((d) => `snapshot:${d}`);
  return redis.mget<ComponentSnapshot[]>(...keys);
}
export async function saveFillRateSummary(summary: FillRateSummary): Promise<void> {
  const redis = getClient();
  await redis.set("fillrate:latest", summary);
}
export async function getFillRateSummary(): Promise<FillRateSummary | null> {
  const redis = getClient();
  return (await redis.get<FillRateSummary>("fillrate:latest")) ?? null;
}
export async function saveFillRateHistoryPoint(point: FillRateHistoryPoint): Promise<void> {
  const redis = getClient();
  await redis.set(`fillrate:history:${point.date}`, point);
}
export async function getFillRateHistoryPoints(
  dates: string[]
): Promise<(FillRateHistoryPoint | null)[]> {
  if (dates.length === 0) return [];
  const redis = getClient();
  const keys = dates.map((d) => `fillrate:history:${d}`);
  return redis.mget<FillRateHistoryPoint[]>(...keys);
}
export async function setLastSnapshotRun(iso: string): Promise<void> {
  const redis = getClient();
  await redis.set("meta:last_snapshot_run", iso);
}
export async function getLastSnapshotRun(): Promise<string | null> {
  const redis = getClient();
  return (await redis.get<string>("meta:last_snapshot_run")) ?? null;
}
export async function saveInventoryHealthSummary(summary: InventoryHealthSummary): Promise<void> {
  const redis = getClient();
  await redis.set("inventory-health:latest", summary);
}
export async function getInventoryHealthSummary(): Promise<InventoryHealthSummary | null> {
  const redis = getClient();
  return (await redis.get<InventoryHealthSummary>("inventory-health:latest")) ?? null;
}
export async function setLastAgingRun(iso: string): Promise<void> {
  const redis = getClient();
  await redis.set("meta:last_aging_run", iso);
}
export async function getLastAgingRun(): Promise<string | null> {
  const redis = getClient();
  return (await redis.get<string>("meta:last_aging_run")) ?? null;
}
