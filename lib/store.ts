import { Redis } from "@upstash/redis";

// Data model:
//
//   snapshot:{YYYY-MM-DD}      -> ComponentSnapshot     (one per day, components' in-stock status)
//   fillrate:latest            -> FillRateSummary        (rolling 30-day fill rate, refreshed daily)
//   fillrate:history:{YYYY-MM-DD} -> FillRateHistoryPoint (lightweight daily point, for trend charts)
//   meta:last_snapshot_run     -> ISO timestamp string   (for troubleshooting/observability)

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
}

export interface FillRateSummary {
  windowStart: string; // YYYY-MM-DD
  windowEnd: string; // YYYY-MM-DD
  generatedAt: string;
  orderCount: number;
  totalOrdered: number;
  totalShipped: number;
  overallFillRate: number | null;
  byAssembly: AssemblyFillRate[];
}

/**
 * Lightweight daily point derived from a FillRateSummary, kept indefinitely (unlike
 * fillrate:latest, which gets overwritten every run) so the Fill Rate Detail page can
 * chart how the rolling 30-day rate has moved over time — same pattern as the daily
 * component snapshots use for In-Stock Rate history.
 */
export interface FillRateHistoryPoint {
  date: string; // YYYY-MM-DD — the day this snapshot was taken, not the order date
  overallFillRate: number | null;
  totalOrdered: number;
  totalShipped: number;
  byAssembly: Record<string, { ordered: number; shipped: number }>;
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
