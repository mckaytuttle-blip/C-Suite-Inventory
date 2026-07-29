import KpiCard from "@/components/KpiCard";
import { computeInStockRateSummary, InStockRateSummary, viewFillRate, FillRateView } from "@/lib/kpis";
import { getFillRateSummary, getLastSnapshotRun } from "@/lib/store";

export const dynamic = "force-dynamic";
export const revalidate = 0;

async function loadData(): Promise<{
  inStock: InStockRateSummary | null;
  fillRate: FillRateView | null;
  lastRun: string | null;
  error: string | null;
}> {
  try {
    const [inStock, fillRateRaw, lastRun] = await Promise.all([
      computeInStockRateSummary(30),
      getFillRateSummary(),
      getLastSnapshotRun(),
    ]);
    return { inStock, fillRate: viewFillRate(fillRateRaw), lastRun, error: null };
  } catch (err: any) {
    return { inStock: null, fillRate: null, lastRun: null, error: err?.message ?? String(err) };
  }
}

export default async function OverviewPage() {
  const { inStock, fillRate, lastRun, error } = await loadData();

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

  return (
    <div className="page">
      <div className="page-header">
        <div>
          <h1>Inventory Overview</h1>
          <p className="subtitle">A Quick Look into Inventory Health</p>
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
          linkLabel="View product detail"
          sub={
            fillRate
              ? `${fillRate.totalShipped.toLocaleString()} of ${fillRate.totalOrdered.toLocaleString()} units shipped · ${fillRate.orderCount} orders`
              : undefined
          }
        />
      </div>

      <footer className="page-footer">
        Both KPIs refresh once daily via a scheduled job that pulls directly from Zoho Inventory.
        Click either card above for the full breakdown, trends, and underlying data.
      </footer>
    </div>
  );
}
