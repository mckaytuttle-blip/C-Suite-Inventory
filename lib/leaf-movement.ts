// Leaf-level movement/consumption pipeline — shared foundation for two KPIs:
//
//   - Aging / Dead Stock: "when did this component last move?"
//   - Inventory Turnover: "how many units of this component did we consume, for COGS?"
//
// Zoho only records sales against the top-level (sellable) item on an order — almost
// none of the 83 tracked components are sold directly, they're consumed into
// assemblies. So "movement" for a leaf component has to be inferred by rolling every
// sales order line item down through the composite BOM (see lib/bom.ts) to the leaf
// parts it consumed. A handful of tracked components are also sold standalone
// (per the ROP/ROQ model's notes) and are matched directly as well.
import { findTrackedComponent, TRACKED_COMPONENTS } from "./components";
import { buildFlattenedBoms } from "./bom";
import { addDaysToKey, lastNDateKeys } from "./dates";
import {
  fetchAllItems,
  fetchSalesOrderDetail,
  fetchSalesOrdersInRange,
  mapWithConcurrency,
  ZohoItem,
} from "./zoho";

export interface LeafMovementEntry {
  name: string;
  itemId: string | null;
  matched: boolean;
  // 0/undefined purchase_rate in Zoho is treated as "no reliable cost on file."
  purchaseRate: number | null;
  stockOnHand: number | null;
  availableStock: number | null;
  /** Most recent date (YYYY-MM-DD) this leaf was consumed within the lookback window, or null if none found. */
  lastMovementDate: string | null;
  /** Units attributed to this leaf (direct sales + BOM rolldown) in the trailing 90 days. */
  unitsConsumed90: number;
  /** Same, over the full lookback window (default 180 days). */
  unitsConsumedWindow: number;
}

export interface LeafMovementSummary {
  windowDays: number;
  windowStart: string;
  windowEnd: string;
  turnoverWindowDays: number; // the shorter (90-day) sub-window used for COGS
  generatedAt: string;
  byComponent: LeafMovementEntry[];
  /** How many tracked components had no line-item match in Zoho at all. */
  unmatchedCount: number;
}

/**
 * Pull every sales order in the trailing `windowDays`, roll each line item's quantity
 * down through the flattened composite BOM, and attribute consumption + last-movement
 * date to whichever of the 83 tracked leaf components it touches.
 *
 * This is a heavier pull than the daily stock/fill-rate snapshot (a full BOM flatten
 * plus detail calls for every order in the window) — callers should run it on its own
 * schedule/route rather than folding it into the fast daily snapshot, so a slow Zoho
 * response here can't hold up the numbers everything else depends on.
 */
export async function computeLeafMovement(windowDays = 180): Promise<LeafMovementSummary> {
  const turnoverWindowDays = 90;
  const dateKeys = lastNDateKeys(windowDays);
  const windowStart = dateKeys[0];
  const windowEnd = dateKeys[dateKeys.length - 1];
  const turnoverWindowStart = addDaysToKey(windowEnd, -(turnoverWindowDays - 1));

  const [items, orders, { composites, leafQuantitiesByComposite }] = await Promise.all([
    fetchAllItems(),
    fetchSalesOrdersInRange(windowStart, windowEnd),
    buildFlattenedBoms(),
  ]);

  const trackedByItemId = new Map<string, string>(); // item_id -> tracked component name
  const itemByTrackedName = new Map<string, ZohoItem>();
  for (const item of items) {
    const tracked = findTrackedComponent(item.name);
    if (tracked) {
      trackedByItemId.set(item.item_id, tracked.name);
      itemByTrackedName.set(tracked.name, item);
    }
  }

  const lastMovement = new Map<string, string>();
  const consumed90 = new Map<string, number>();
  const consumedWindow = new Map<string, number>();

  function recordMovement(name: string, qty: number, date: string) {
    if (qty <= 0) return;
    consumedWindow.set(name, (consumedWindow.get(name) ?? 0) + qty);
    if (date >= turnoverWindowStart) {
      consumed90.set(name, (consumed90.get(name) ?? 0) + qty);
    }
    const prev = lastMovement.get(name);
    if (!prev || date > prev) lastMovement.set(name, date);
  }

  const detailByOrder = await mapWithConcurrency(orders, 6, async (order) => {
    try {
      return await fetchSalesOrderDetail(order.salesorder_id);
    } catch {
      // Skip this order for rolldown purposes rather than failing the whole pull —
      // same fail-soft approach the fill-rate snapshot uses for detail calls.
      return { lineItems: [], packages: [], purchaseOrders: [] };
    }
  });

  orders.forEach((order, i) => {
    const date = order.date;
    for (const li of detailByOrder[i].lineItems) {
      const qty = li.quantity ?? 0;
      if (qty <= 0) continue;

      // Case 1: this line item IS one of the tracked leaf components (sold standalone).
      const directName = trackedByItemId.get(li.item_id);
      if (directName) recordMovement(directName, qty, date);

      // Case 2: this line item is a composite/assembly — attribute its consumption
      // down to every tracked leaf part in its flattened BOM.
      const leafQtys = leafQuantitiesByComposite.get(li.item_id);
      if (leafQtys) {
        for (const [leafItemId, qtyPerUnit] of leafQtys) {
          const leafName = trackedByItemId.get(leafItemId);
          if (!leafName) continue;
          recordMovement(leafName, qtyPerUnit * qty, date);
        }
      }
    }
  });

  let unmatchedCount = 0;
  const byComponent: LeafMovementEntry[] = TRACKED_COMPONENTS.map((tc) => {
    const item = itemByTrackedName.get(tc.name) ?? null;
    if (!item) unmatchedCount += 1;
    return {
      name: tc.name,
      itemId: item?.item_id ?? null,
      matched: !!item,
      purchaseRate: item && item.purchase_rate > 0 ? item.purchase_rate : null,
      stockOnHand: item?.stock_on_hand ?? null,
      availableStock: item?.available_stock ?? null,
      lastMovementDate: lastMovement.get(tc.name) ?? null,
      unitsConsumed90: consumed90.get(tc.name) ?? 0,
      unitsConsumedWindow: consumedWindow.get(tc.name) ?? 0,
    };
  });

  return {
    windowDays,
    windowStart,
    windowEnd,
    turnoverWindowDays,
    generatedAt: new Date().toISOString(),
    byComponent,
    unmatchedCount,
  };
}
