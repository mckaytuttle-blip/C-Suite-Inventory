import { TRACKED_COMPONENTS } from "./components";
import { lastNDateKeys } from "./dates";
import { ComponentSnapshot, FillRateSummary, getComponentSnapshots } from "./store";

export interface ComponentInStockRate {
  name: string;
  tier: string;
  daysTracked: number;
  daysInStock: number;
  inStockRate: number | null; // null if we have zero days of data for this item
}

export interface InStockRateSummary {
  windowDays: number;
  windowStart: string;
  windowEnd: string;
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
    for (const snap of snapshots) {
      if (!snap) continue;
      const entry = snap.components[tc.name];
      if (!entry || !entry.matched) continue;
      daysTracked += 1;
      if (entry.inStock) daysInStock += 1;
    }
    return {
      name: tc.name,
      tier: tc.tier,
      daysTracked,
      daysInStock,
      inStockRate: daysTracked > 0 ? daysInStock / daysTracked : null,
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
