import { findTrackedComponent, isExcludedFillRateProduct, TRACKED_COMPONENTS } from "./components";
import { lastNDateKeys, todayKey } from "./dates";
import {
  fetchAllItems,
  fetchSalesOrderLineItems,
  fetchSalesOrdersInRange,
  mapWithConcurrency,
} from "./zoho";
import {
  AssemblyFillRate,
  ComponentSnapshot,
  ComponentSnapshotEntry,
  FillRateSummary,
  saveComponentSnapshot,
  saveFillRateHistoryPoint,
  saveFillRateSummary,
  setLastSnapshotRun,
} from "./store";

const FILL_RATE_WINDOW_DAYS = 30;

/** Pull today's stock levels for every tracked component and store the snapshot. */
export async function runComponentSnapshot(date: string = todayKey()): Promise<ComponentSnapshot> {
  const items = await fetchAllItems();

  const components: Record<string, ComponentSnapshotEntry> = {};
  for (const tc of TRACKED_COMPONENTS) {
    components[tc.name] = {
      itemId: null,
      stockOnHand: null,
      availableStock: null,
      inStock: false,
      matched: false,
    };
  }

  for (const item of items) {
    const tracked = findTrackedComponent(item.name);
    if (!tracked) continue;
    const available = item.available_stock ?? item.stock_on_hand ?? 0;
    components[tracked.name] = {
      itemId: item.item_id,
      stockOnHand: item.stock_on_hand ?? null,
      availableStock: available,
      inStock: available > 0,
      matched: true,
    };
  }

  const snapshot: ComponentSnapshot = {
    date,
    generatedAt: new Date().toISOString(),
    source: "live",
    components,
  };

  await saveComponentSnapshot(snapshot);
  return snapshot;
}

/**
 * Pull the trailing FILL_RATE_WINDOW_DAYS of sales orders, roll up ordered vs.
 * shipped quantity per top-level (sellable/assembly) item, and store the summary.
 * Fetches SO detail with limited concurrency since the list endpoint only gives
 * order-level totals, not per-line-item breakdown.
 */
export async function runFillRateSnapshot(
  windowDays: number = FILL_RATE_WINDOW_DAYS
): Promise<FillRateSummary> {
  const dateKeys = lastNDateKeys(windowDays);
  const windowStart = dateKeys[0];
  const windowEnd = dateKeys[dateKeys.length - 1];

  const orders = await fetchSalesOrdersInRange(windowStart, windowEnd);

  // NOTE: these totals (and therefore overallFillRate) come from Zoho's order-level
  // quantity / quantity_shipped fields, not from summing line items below. That means
  // EXCLUDED_FILL_RATE_PRODUCTS only ever affects the per-product breakdown table —
  // the headline % always reflects Zoho's order data untouched, by design.
  const totalOrdered = orders.reduce((s, o) => s + (o.quantity ?? 0), 0);
  const totalShipped = orders.reduce((s, o) => s + (o.quantity_shipped ?? 0), 0);

  const byAssemblyMap = new Map<string, { ordered: number; shipped: number }>();

  const lineItemsByOrder = await mapWithConcurrency(orders, 6, async (order) => {
    try {
      return await fetchSalesOrderLineItems(order.salesorder_id);
    } catch {
      // If a single order detail call fails, skip it for the per-assembly breakdown
      // rather than failing the whole snapshot — the aggregate totals above still hold.
      return [];
    }
  });

  for (const lineItems of lineItemsByOrder) {
    for (const li of lineItems) {
      if (isExcludedFillRateProduct(li.name)) continue;
      const key = li.name;
      const entry = byAssemblyMap.get(key) ?? { ordered: 0, shipped: 0 };
      entry.ordered += li.quantity ?? 0;
      entry.shipped += li.quantity_shipped ?? 0;
      byAssemblyMap.set(key, entry);
    }
  }

  const byAssembly: AssemblyFillRate[] = Array.from(byAssemblyMap.entries())
    .map(([name, v]) => ({
      name,
      ordered: v.ordered,
      shipped: v.shipped,
      fillRate: v.ordered > 0 ? v.shipped / v.ordered : null,
    }))
    .sort((a, b) => b.ordered - a.ordered);

  const summary: FillRateSummary = {
    windowStart,
    windowEnd,
    generatedAt: new Date().toISOString(),
    orderCount: orders.length,
    totalOrdered,
    totalShipped,
    overallFillRate: totalOrdered > 0 ? totalShipped / totalOrdered : null,
    byAssembly,
  };

  await saveFillRateSummary(summary);

  // Also record a lightweight daily history point so the trend can be charted over
  // time — fillrate:latest alone gets overwritten every run and has no memory of past days.
  await saveFillRateHistoryPoint({
    date: todayKey(),
    overallFillRate: summary.overallFillRate,
    totalOrdered: summary.totalOrdered,
    totalShipped: summary.totalShipped,
    byAssembly: Object.fromEntries(
      byAssembly.map((a) => [a.name, { ordered: a.ordered, shipped: a.shipped }])
    ),
  });

  return summary;
}

export async function runDailySnapshot(): Promise<{
  componentSnapshot: ComponentSnapshot;
  fillRateSummary: FillRateSummary;
}> {
  const [componentSnapshot, fillRateSummary] = await Promise.all([
    runComponentSnapshot(),
    runFillRateSnapshot(),
  ]);
  await setLastSnapshotRun(new Date().toISOString());
  return { componentSnapshot, fillRateSummary };
}  for (const item of items) {
    const tracked = findTrackedComponent(item.name);
    if (!tracked) continue;
    const available = item.available_stock ?? item.stock_on_hand ?? 0;
    components[tracked.name] = {
      itemId: item.item_id,
      stockOnHand: item.stock_on_hand ?? null,
      availableStock: available,
      inStock: available > 0,
      matched: true,
    };
  }

  const snapshot: ComponentSnapshot = {
    date,
    generatedAt: new Date().toISOString(),
    source: "live",
    components,
  };

  await saveComponentSnapshot(snapshot);
  return snapshot;
}

/**
 * Pull the trailing FILL_RATE_WINDOW_DAYS of sales orders, roll up ordered vs.
 * shipped quantity per top-level (sellable/assembly) item, and store the summary.
 * Fetches SO detail with limited concurrency since the list endpoint only gives
 * order-level totals, not per-line-item breakdown.
 */
export async function runFillRateSnapshot(
  windowDays: number = FILL_RATE_WINDOW_DAYS
): Promise<FillRateSummary> {
  const dateKeys = lastNDateKeys(windowDays);
  const windowStart = dateKeys[0];
  const windowEnd = dateKeys[dateKeys.length - 1];

  const orders = await fetchSalesOrdersInRange(windowStart, windowEnd);

  const totalOrdered = orders.reduce((s, o) => s + (o.quantity ?? 0), 0);
  const totalShipped = orders.reduce((s, o) => s + (o.quantity_shipped ?? 0), 0);

  const byAssemblyMap = new Map<string, { ordered: number; shipped: number }>();

  const lineItemsByOrder = await mapWithConcurrency(orders, 6, async (order) => {
    try {
      return await fetchSalesOrderLineItems(order.salesorder_id);
    } catch {
      // If a single order detail call fails, skip it for the per-assembly breakdown
      // rather than failing the whole snapshot — the aggregate totals above still hold.
      return [];
    }
  });

  for (const lineItems of lineItemsByOrder) {
    for (const li of lineItems) {
      const key = li.name;
      const entry = byAssemblyMap.get(key) ?? { ordered: 0, shipped: 0 };
      entry.ordered += li.quantity ?? 0;
      entry.shipped += li.quantity_shipped ?? 0;
      byAssemblyMap.set(key, entry);
    }
  }

  const byAssembly: AssemblyFillRate[] = Array.from(byAssemblyMap.entries())
    .map(([name, v]) => ({
      name,
      ordered: v.ordered,
      shipped: v.shipped,
      fillRate: v.ordered > 0 ? v.shipped / v.ordered : null,
    }))
    .sort((a, b) => b.ordered - a.ordered);

  const summary: FillRateSummary = {
    windowStart,
    windowEnd,
    generatedAt: new Date().toISOString(),
    orderCount: orders.length,
    totalOrdered,
    totalShipped,
    overallFillRate: totalOrdered > 0 ? totalShipped / totalOrdered : null,
    byAssembly,
  };

  await saveFillRateSummary(summary);

  // Also record a lightweight daily history point so the trend can be charted over
  // time — fillrate:latest alone gets overwritten every run and has no memory of past days.
  await saveFillRateHistoryPoint({
    date: todayKey(),
    overallFillRate: summary.overallFillRate,
    totalOrdered: summary.totalOrdered,
    totalShipped: summary.totalShipped,
    byAssembly: Object.fromEntries(
      byAssembly.map((a) => [a.name, { ordered: a.ordered, shipped: a.shipped }])
    ),
  });

  return summary;
}

export async function runDailySnapshot(): Promise<{
  componentSnapshot: ComponentSnapshot;
  fillRateSummary: FillRateSummary;
}> {
  const [componentSnapshot, fillRateSummary] = await Promise.all([
    runComponentSnapshot(),
    runFillRateSnapshot(),
  ]);
  await setLastSnapshotRun(new Date().toISOString());
  return { componentSnapshot, fillRateSummary };
}
