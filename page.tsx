// app/page.tsx
import KpiCard from "@/components/KpiCard";
import { computeInStockRateSummary, InStockRateSummary, viewFillRate, FillRateView } from "@/lib/kpis";
import { money, pct, turnoverLabel } from "@/lib/format";
import {
  getFillRateSummary,
  getInventoryHealthSummary,
  getLastSnapshotRun,
  InventoryHealthSummary,
} from "@/lib/store";
export const dynamic = "force-dynamic";
export const revalidate = 0;
async function loadData(): Promise<{
  inStock: InStockRateSummary | null;
  fillRate: FillRateView | null;
  inventoryHealth: InventoryHealthSummary | null;
  lastRun: string | null;
  error: string | null;
}> {
  try {
    const [inStock, fillRateRaw, inventoryHealth, lastRun] = await Promise.all([
      computeInStockRateSummary(30),
      getFillRateSummary(),
      getInventoryHealthSummary(),
      getLastSnapshotRun(),
    ]);
    return { inStock, fillRate: viewFillRate(fillRateRaw), inventoryHealth, lastRun, error: null };
  } catch (err: any) {
    return {
      inStock: null,
      fillRate: null,
      inventoryHealth: null,
      lastRun: null,
      error: err?.message ?? String(err),
    };
  }
}
export default async function OverviewPage() {
  const { inStock, fillRate, inventoryHealth, lastRun, error } = await loadData();
  if (error) {
    return (
      <div className="page">
        <div className="page-header">
          <div>
            <h1>Executive Overview</h1>
            <p className="subtitle">In-Stock Rate &amp; Fill Rate</p>
          </div>
        </div>
        <section className="panel">
          <h2>Not connected yet</h2>
          <div className="empty-state">
            <p>
              The dashboard can&apos;t reach its data store yet: <code>{error}</code>
            </p>
            <p>
              Add a Redis integration in Vercel&apos;s Storage tab, then trigger{" "}
              <code>/api/cron/snapshot</code> once to populate the first day of data. See the
              README for full setup steps.
            </p>
          </div>
        </section>
      </div>
    );
  }
  // Fill Rate's reporting period is the last fully completed calendar month (not a
  // rolling window), so label it by month name when available. Older stored summaries
  // saved before this switch won't have windowLabel yet — fall back to the date range.
  const fillRateWindowLabel =
    fillRate?.windowLabel ?? (fillRate ? `${fillRate.windowStart} → ${fillRate.windowEnd}` : null);

  return (
    <div className="page">
      <div className="page-header">
        <div>
          <h1>Inventory Overview</h1>
        </div>
        <p className="updated">
          {lastRun ? `Last updated ${new Date(lastRun).toLocaleString()}` : "Not yet run"}
        </p>
      </div>
      <div className="kpi-grid">
        <KpiCard
          label="In-Stock Rate"
          value={inStock?.overallInStockRate ?? null}
          definition="The percentage of time a product is physically available for sale or immediate fulfillment"
          href="/in-stock"
          linkLabel="Take a Deeper Look"
          sub={
            inStock
              ? `${inStock.daysWithData} of ${inStock.windowDays} days of data · ${inStock.byComponent.length} components tracked`
              : undefined
          }
        />
        <KpiCard
          label="Fill Rate"
          value={fillRate?.overallFillRate ?? null}
          definition="Percentage of SO that can be fulfilled immediately from existing stock without delays or backorders."
          href="/fill-rate"
          linkLabel="Take a Deeper Look"
          sub={
            fillRate ? (
              <>
                {fillRateWindowLabel} · {fillRate.totalShipped.toLocaleString()} of{" "}
                {fillRate.totalOrdered.toLocaleString()} units shipped · {fillRate.orderCount} orders
                {fillRate.otif && (
                  <>
                    <br />
                    OTIF: {pct(fillRate.otif.otifRate)} ({fillRate.otif.otifCount}/
                    {fillRate.otif.eligibleOrders} orders on time &amp; in full)
                  </>
                )}
              </>
            ) : undefined
          }
        />
        <KpiCard
          label="Inventory Turnover"
          displayValue={turnoverLabel(inventoryHealth?.aggregate.overallTurnoverRatioAnnualized ?? null)}
          definition="Trailing 90-day COGS ÷ average inventory (at cost), annualized. Higher means components are moving through stock faster."
          href="/inventory-health"
          linkLabel="Take a Deeper Look"
          sub={
            inventoryHealth
              ? `${inventoryHealth.turnoverWindowDays}-day COGS window · updates daily via its own job`
              : "Not yet run"
          }
        />
        <KpiCard
          label="Dead Stock (90d)"
          displayValue={money(inventoryHealth?.aggregate.deadStockValue90 ?? null)}
          definition="Value at cost of tracked components with no sales/consumption movement in the trailing 90 days."
          href="/inventory-health"
          linkLabel="Take a Deeper Look"
          sub={
            inventoryHealth
              ? `${inventoryHealth.aggregate.deadStockCount90} of ${inventoryHealth.byComponent.length} components · ${money(
                  inventoryHealth.aggregate.deadStockValue180
                )} at the 180-day cutoff`
              : "Not yet run"
          }
        />
      </div>
    </div>
  );
}
