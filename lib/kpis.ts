import { TRACKED_COMPONENTS } from "./components";
import { lastNDateKeys } from "./dates";
import {
  ComponentSnapshot,
  FillRateSummary,
  getComponentSnapshots,
  getFillRateHistoryPoints,
} from "./store";

export type DayStatus = "in-stock" | "out-of-stock" | "no-data";

export interface ComponentInStockRate {
  name: string;
  tier: string;
  daysTracked: number;
  daysInStock: number;
  inStockRate: number | null; // null if we have zero days of data for this item
  history: DayStatus[]; // oldest -> newest, one entry per day in the window
  // Committed vs. On-Hand — the most recent day in the window with a matched snapshot
  // for this component (not necessarily today, if a run was missed). null fields mean
  // no snapshot in the window ever matched this component in Zoho.
  latestSnapshotDate: string | null;
  latestStockOnHand: number | null;
  latestAvailableStock: number | null;
  // Zoho only tracks committed stock at the composite (assembly) level, not per leaf
  // component — this is the simple on-hand-minus-available proxy, i.e. units of this
  // component physically present but already spoken for by open orders/assemblies.
  // It can read slightly low relative to a true BOM-level committed rolldown, but
  // needs no extra Zoho calls since both inputs are already in the daily snapshot.
  latestCommitted: number | null;
}

export interface InStockRateSummary {
  windowDays: number;
  windowStart: string;
  windowEnd: string;
  dateKeys: string[]; // oldest -> newest, same order/length as each component's `history`
  overallInStockRate: number | null;
  daysWithData: number;
  byComponent: ComponentInStockRate[];
  worstComponents: ComponentInStockRate[]; // lowest in-stock rate first, data required
}

/** Trailing-window In-Stock Rate across all tracked components, from daily snapshots. */
export async function computeInStockRateSummary(windowDays = 30): Promise<InStockRateSummary> {
  const dateKeys = lastNDateKeys(windowDays);
  const snapshots = await getComponentSnapshots(dateKeys);

  const byComponent: ComponentInStockRate[] = TRACKED_COMPONENTS.map((tc) => {
    let daysTracked = 0;
    let daysInStock = 0;
    const history: DayStatus[] = [];
    let latestSnapshotDate: string | null = null;
    let latestStockOnHand: number | null = null;
    let latestAvailableStock: number | null = null;

    snapshots.forEach((snap, i) => {
      const entry = snap?.components[tc.name];
      if (!snap || !entry || !entry.matched) {
        history.push("no-data");
        return;
      }
      daysTracked += 1;
      if (entry.inStock) {
        daysInStock += 1;
        history.push("in-stock");
      } else {
        history.push("out-of-stock");
      }
      // snapshots is ordered oldest -> newest (same as dateKeys), so the last matched
      // entry seen in this loop is always the most recent — no separate reverse pass needed.
      latestSnapshotDate = dateKeys[i];
      latestStockOnHand = entry.stockOnHand;
      latestAvailableStock = entry.availableStock;
    });

    // Clamped at 0 defensively — available_stock should never exceed stock_on_hand,
    // but if Zoho data is ever momentarily inconsistent this avoids showing a
    // confusing negative "committed" figure.
    const latestCommitted =
      latestStockOnHand !== null && latestAvailableStock !== null
        ? Math.max(0, latestStockOnHand - latestAvailableStock)
        : null;

    return {
      name: tc.name,
      tier: tc.tier,
      daysTracked,
      daysInStock,
      inStockRate: daysTracked > 0 ? daysInStock / daysTracked : null,
      history,
      latestSnapshotDate,
      latestStockOnHand,
      latestAvailableStock,
      latestCommitted,
    };
  });

  const withData = byComponent.filter((c) => c.inStockRate !== null);
  const totalDaysTracked = withData.reduce((s, c) => s + c.daysTracked, 0);
  const totalDaysInStock = withData.reduce((s, c) => s + c.daysInStock, 0);

  const daysWithData = snapshots.filter((s): s is ComponentSnapshot => s !== null).length;

  const worstComponents = [...withData]
    .sort((a, b) => (a.inStockRate ?? 1) - (b.inStockRate ?? 1))
    .slice(0, 10);

  return {
    windowDays,
    windowStart: dateKeys[0],
    windowEnd: dateKeys[dateKeys.length - 1],
    dateKeys,
    overallInStockRate: totalDaysTracked > 0 ? totalDaysInStock / totalDaysTracked : null,
    daysWithData,
    byComponent,
    worstComponents,
  };
}

export interface FillRateView extends FillRateSummary {
  worstAssemblies: FillRateSummary["byAssembly"];
}

export function viewFillRate(summary: FillRateSummary | null): FillRateView | null {
  if (!summary) return null;
  const worstAssemblies = [...summary.byAssembly]
    .filter((a) => a.fillRate !== null)
    .sort((a, b) => (a.fillRate ?? 1) - (b.fillRate ?? 1))
    .slice(0, 10);
  return { ...summary, worstAssemblies };
}

export interface TrendPoint {
  date: string;
  value: number | null;
}

export interface FillRateTrend {
  windowDays: number;
  overall: TrendPoint[];
  byAssembly: Record<string, TrendPoint[]>;
}

/**
 * Daily trend of the rolling fill rate, both overall and per product, built from
 * the fillrate:history:{date} points written once a day by runFillRateSnapshot.
 * Sparse until enough days have accumulated — a fresh deploy will only have 1 point.
 */
export async function computeFillRateTrend(
  windowDays = 30,
  assemblyNames: string[] = []
): Promise<FillRateTrend> {
  const dateKeys = lastNDateKeys(windowDays);
  const points = await getFillRateHistoryPoints(dateKeys);

  const overall: TrendPoint[] = dateKeys.map((date, i) => ({
    date,
    value: points[i]?.overallFillRate ?? null,
  }));

  const byAssembly: Record<string, TrendPoint[]> = {};
  for (const name of assemblyNames) {
    byAssembly[name] = dateKeys.map((date, i) => {
      const entry = points[i]?.byAssembly?.[name];
      if (!entry || entry.ordered === 0) return { date, value: null };
      return { date, value: entry.shipped / entry.ordered };
    });
  }

  return { windowDays, overall, byAssembly };
}
