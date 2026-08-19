// app/in-stock/page.tsx
import ExpandableTable, { ExpandableTableColumn } from "@/components/ExpandableTable";
import Heatmap from "@/components/Heatmap";
import { computeInStockRateSummary, InStockRateSummary } from "@/lib/kpis";
import { pct, rateTone, toneColor } from "@/lib/format";
import { getLastSnapshotRun } from "@/lib/store";

export const dynamic = "force-dynamic";
export const revalidate = 0;

function tierClass(tier: string): string {
  return `tier-pill ${tier.toLowerCase()}`;
}

export default async function InStockDetailPage() {
  let inStock: InStockRateSummary | undefined;
  let lastRun: string | null = null;
  let error: string | null = null;

  try {
    [inStock, lastRun] = await Promise.all([computeInStockRateSummary(30), getLastSnapshotRun()]);
  } catch (err: any) {
    error = err?.message ?? String(err);
  }

  if (error || !inStock) {
    return (
      <div className="page">
        <div className="page-header">
          <h1>In-Stock Rate Detail</h1>
        </div>
        <section className="panel">
          <div className="empty-state">
            Couldn&apos;t load data: <code>{error}</code>
          </div>
        </section>
      </div>
    );
  }

  const sorted = [...inStock.byComponent].sort((a, b) => {
    const av = a.inStockRate ?? 1;
    const bv = b.inStockRate ?? 1;
    return av - bv;
  });

  const columns: ExpandableTableColumn[] = [
    { key: "name", label: "Component" },
    { key: "tier", label: "Tier" },
    { key: "rate", label: "In-Stock Rate", numeric: true },
    { key: "days", label: "Days In Stock", numeric: true },
    { key: "trend", label: "30-Day Trend" },
  ];
  const rows = sorted.map((c) => ({
    _key: c.name,
    name: c.name,
    tier: <span className={tierClass(c.tier)}>{c.tier}</span>,
    rate: (
      <>
        <span className="bar-bg">
          <span
            className="bar-fill"
            style={{
              width: `${c.inStockRate === null ? 0 : Math.max(2, c.inStockRate * 100)}%`,
              background: toneColor(rateTone(c.inStockRate)),
            }}
          />
        </span>
        <span className="rate-value">{pct(c.inStockRate)}</span>
      </>
    ),
    days: `${c.daysInStock} / ${c.daysTracked}`,
    trend: (
      <Heatmap
        history={c.history}
        labels={inStock.dateKeys.map((d, i) => `${d}: ${c.history[i]}`)}
      />
    ),
  }));

  return (
    <div className="page page-instock">
      <div className="page-header">
        <div>
          <h1>In-Stock Rate Detail</h1>
          <p className="subtitle">
            {inStock.windowStart} → {inStock.windowEnd} · {inStock.byComponent.length} tracked
            components
          </p>
        </div>
        <p className="updated">
          {lastRun ? `Last updated ${new Date(lastRun).toLocaleString()}` : "Not yet run"}
        </p>
      </div>

      <div className="kpi-grid" style={{ marginBottom: 28 }}>
        <div className="kpi-card">
          <div className="label">Overall In-Stock Rate</div>
          <div className="value" style={{ color: toneColor(rateTone(inStock.overallInStockRate)) }}>
            {pct(inStock.overallInStockRate)}
          </div>
          <p className="definition">
            {inStock.daysWithData} of {inStock.windowDays} days of snapshot data collected so far.
          </p>
        </div>
      </div>

      <section className="panel">
        <h2>All tracked components</h2>
        <p className="panel-sub">
          Sorted worst-first. Each cell in the trend strip is one day — green means stock was
          available, red means it wasn&apos;t, gray means no snapshot exists for that day yet.
          Shows the 10 lowest in-stock-rate components by default — expand to see all{" "}
          {inStock.byComponent.length}.
        </p>
        <ExpandableTable columns={columns} rows={rows} />
      </section>
    </div>
  );
}
