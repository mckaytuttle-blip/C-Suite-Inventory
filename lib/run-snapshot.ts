import { findTrackedComponent, TRACKED_COMPONENTS } from "./components";
import { todayKey } from "./dates";
import {
  fetchAllItems,
  fetchSalesOrderDetail,
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
 * Returns the [start, end] (inclusive, YYYY-MM-DD) of the most recently *completed*
 * calendar month relative to `from`. E.g. if today is any day in August, this returns
 * July 1 -> July 31. Using a closed period rather than a rolling window means every
 * order in the range has already had its full window to ship — no order in the report
 * was "placed this morning," which a rolling N-day window can never avoid.
 */
function getLastCompletedCalendarMonth(from: Date = new Date()): {
  start: string;
  end: string;
  label: string;
} {
  // First day of the month `from` is in, then step back one day to land in the prior month.
  const firstOfCurrentMonth = new Date(Date.UTC(from.getUTCFullYear(), from.getUTCMonth(), 1));
  const lastDayOfPrevMonth = new Date(firstOfCurrentMonth.getTime() - 24 * 60 * 60 * 1000);
  const y = lastDayOfPrevMonth.getUTCFullYear();
  const m = lastDayOfPrevMonth.getUTCMonth(); // 0-indexed, already the previous month
  const firstOfPrevMonth = new Date(Date.UTC(y, m, 1));

  const toKey = (d: Date) => d.toISOString().slice(0, 10);
  const monthLabel = firstOfPrevMonth.toLocaleDateString("en-US", {
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  });

  return { start: toKey(firstOfPrevMonth), end: toKey(lastDayOfPrevMonth), label: monthLabel };
}

const FULFILLED_STATUSES = new Set(["shipped", "fulfilled"]);

/**
 * Pull every sales order dated in the most recently completed calendar month, roll up
 * ordered vs. shipped quantity per top-level (sellable/assembly) item, and compute
 * OTIF (On Time In Full) per order. Fetches each order's full detail (line items +
 * packages together, one call) with limited concurrency, since neither is available
 * from the list endpoint.
 */
export async function runFillRateSnapshot(): Promise<FillRateSummary> {
  const { start: windowStart, end: windowEnd, label: windowLabel } = getLastCompletedCalendarMonth();

  const orders = await fetchSalesOrdersInRange(windowStart, windowEnd);

  const totalOrdered = orders.reduce((s, o) => s + (o.quantity ?? 0), 0);
  const totalShipped = orders.reduce((s, o) => s + (o.quantity_shipped ?? 0), 0);

  const byAssemblyMap = new Map <
    string,
    { ordered: number; shipped: number; dropshippedUnits: number; dropshipPendingUnits: number }
  >();

  const detailByOrder = await mapWithConcurrency(orders, 6, async (order) => {
    try {
      return await fetchSalesOrderDetail(order.salesorder_id);
    } catch {
      // If a single order detail call fails, skip it for the per-assembly breakdown
      // and OTIF rather than failing the whole snapshot — the aggregate totals above
      // (which come from the list endpoint, not this call) still hold.
      return { lineItems: [], packages: [], purchaseOrders: [] };
    }
  });

  for (const { lineItems, purchaseOrders } of detailByOrder) {
    // Zoho links the dropship PO(s) to the order, not to the specific line item —
    // there's no per-line "is this item's PO closed" field, so we treat every
    // dropshipped line on this order as confirmed once every linked PO has closed.
    // (In practice each dropshipped order we've seen carries exactly one PO, so this
    // doesn't currently lose any precision.)
    const dropshipPoClosed =
      purchaseOrders.length > 0 && purchaseOrders.every((po) => po.order_status === "closed");

    for (const li of lineItems) {
      const key = li.name;
      const entry =
        byAssemblyMap.get(key) ?? { ordered: 0, shipped: 0, dropshippedUnits: 0, dropshipPendingUnits: 0 };
      const dropshipped = li.quantity_dropshipped ?? 0;

      entry.ordered += li.quantity ?? 0;

      if (dropshipped > 0 && dropshipPoClosed) {
        // Confirmed dropship — fold the dropshipped units into "shipped" since Zoho
        // never puts them in quantity_shipped itself.
        entry.shipped += (li.quantity_shipped ?? 0) + dropshipped;
        entry.dropshippedUnits += dropshipped;
      } else if (dropshipped > 0) {
        // Dropship PO hasn't closed yet — don't credit as shipped until it does,
        // but track it so the table can note why this product looks short.
        entry.shipped += li.quantity_shipped ?? 0;
        entry.dropshipPendingUnits += dropshipped;
      } else {
        entry.shipped += li.quantity_shipped ?? 0;
      }

      byAssemblyMap.set(key, entry);
    }
  }

  const byAssembly: AssemblyFillRate[] = Array.from(byAssemblyMap.entries())
    .map(([name, v]) => ({
      name,
      ordered: v.ordered,
      shipped: v.shipped,
      fillRate: v.ordered > 0 ? v.shipped / v.ordered : null,
      dropshippedUnits: v.dropshippedUnits,
      dropshipPendingUnits: v.dropshipPendingUnits,
    }))
    .sort((a, b) => b.ordered - a.ordered);

  // OTIF — On Time In Full, computed per order (binary pass/fail, not unit-weighted
  // like Fill Rate above). "In Full" reuses the order-level quantity/quantity_shipped
  // we already have. "On Time" needs each order's actual completion date, which only
  // exists on its *own* nested packages array (detailByOrder[i].packages) — the
  // standalone /packages list endpoint's salesorder_id filter is silently ignored by
  // Zoho, so don't be tempted to call that instead. The order's own `shipment_date`
  // field is the *promised/due* date, not the actual one.
  //
  // Orders with no shipment_date on file have nothing to measure "on time" against —
  // rather than auto-failing them (which just penalizes missing CS data entry, not
  // actual lateness), they're excluded from the OTIF denominator entirely.
  let onTimeCount = 0;
  let inFullCount = 0;
  let otifCount = 0;
  let eligibleOrders = 0;
  let excludedNoDueDate = 0;

  orders.forEach((order, i) => {
    const dueDate = order.shipment_date || null;
    if (!dueDate) {
      excludedNoDueDate += 1;
      return;
    }
    eligibleOrders += 1;

    const inFull = (order.quantity_shipped ?? 0) >= (order.quantity ?? 0) && (order.quantity ?? 0) > 0;

    const packages = detailByOrder[i].packages;
    // Packages progress through statuses beyond "shipped" (e.g. "delivered") as
    // tracking updates come in — only "not_shipped" means it truly hasn't gone out
    // yet, so treat anything else as having a real ship date rather than matching
    // the literal string "shipped" (which misses "delivered" and undercounts OTIF).
    const shippedPackageDates = packages
      .filter((p) => p.status !== "not_shipped" && p.date)
      .map((p) => p.date);
    // If the order has multiple packages (partial shipments), it's only fully "on
    // time" once every package that went out did so by the promised date — use the
    // latest shipped-package date as the order's actual completion date.
    const actualCompletionDate =
      shippedPackageDates.length > 0
        ? shippedPackageDates.sort().at(-1) ?? null
        : null;

    const onTime = inFull && actualCompletionDate !== null && actualCompletionDate <= dueDate;

    if (inFull) inFullCount += 1;
    if (onTime) onTimeCount += 1;
    if (inFull && onTime) otifCount += 1;
  });

  const summary: FillRateSummary = {
    windowStart,
    windowEnd,
    windowLabel,
    generatedAt: new Date().toISOString(),
    orderCount: orders.length,
    totalOrdered,
    totalShipped,
    overallFillRate: totalOrdered > 0 ? totalShipped / totalOrdered : null,
    byAssembly,
    otif: {
      totalOrders: orders.length,
      eligibleOrders,
      excludedNoDueDate,
      inFullCount,
      onTimeCount,
      otifCount,
      otifRate: eligibleOrders > 0 ? otifCount / eligibleOrders : null,
    },
  };

  await saveFillRateSummary(summary);

  // Also record a lightweight daily history point so the trend can be charted over
  // time — fillrate:latest alone gets overwritten every run and has no memory of past days.
  await saveFillRateHistoryPoint({
    date: todayKey(),
    overallFillRate: summary.overallFillRate,
    totalOrdered: summary.totalOrdered,
    totalShipped: summary.totalShipped,
    otifRate: summary.otif?.otifRate ?? null,
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
