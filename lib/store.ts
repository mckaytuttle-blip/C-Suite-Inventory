import { Redis } from "@upstash/redis";

// Data model:
//
//   snapshot:{YYYY-MM-DD}   -> ComponentSnapshot   (one per day, components' in-stock status)
//   fillrate:latest         -> FillRateSummary      (rolling 30-day fill rate, refreshed daily)
//   meta:last_snapshot_run  -> ISO timestamp string (for troubleshooting/observability)

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

let client: Redis | null = null;

function getClient(): Redis {
  if (client) return client;
  const url = process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN;
  if (!url || !token) {
    throw new Error(
      "Missing UPSTASH_REDIS_REST_URL / UPSTASH_REDIS_REST_TOKEN — add the Upstash Redis " +
        "integration in Vercel (or set these manually) before calling the snapshot/kpi routes."
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

export async function setLastSnapshotRun(iso: string): Promise<void> {
  const redis = getClient();
  await redis.set("meta:last_snapshot_run", iso);
}

export async function getLastSnapshotRun(): Promise<string | null> {
  const redis = getClient();
  return (await redis.get<string>("meta:last_snapshot_run")) ?? null;
}
