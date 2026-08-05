import Sparkline from "@/components/Sparkline";
import { computeFillRateTrend, FillRateTrend, FillRateView, viewFillRate } from "@/lib/kpis";
import { pct, rateTone, toneColor } from "@/lib/format";
import { getFillRateSummary, getLastSnapshotRun } from "@/lib/store";
export const dynamic = "force-dynamic";
export const revalidate = 0;
export default async function FillRateDetailPage() {
  let fillRate: FillRateView | null | undefined;
  let trend: FillRateTrend | undefined;
  let lastRun: string | null = null;
  let error: string | null = null;
  try {
    const summaryRaw = await getFillRateSummary();
    fillRate = viewFillRate(summaryRaw);
    const assemblyNames = fillRate?.byAssembly.map((a) => a.name) ?? [];
    [trend, lastRun] = await Promise.all([
      computeFillRateTrend(30, assemblyNames),
      getLastSnapshotRun(),
    ]);
  } catch (err: any) {
    error = err?.message ?? String(err);
  }
  if (error || !fillRate) {
    return (
      <div className="page">
        <div className="page-header">
          <h1>Fill Rate Detail</h1>
        </div>
        <section className="panel">
          <div className="empty-state">
            {error ? (
              <>
                Couldn&apos;t load data: <code>{error}</code>
              </>
            ) : (
              "No fill rate data yet — trigger /api/cron/snapshot to populate the first day."
            )}
          </div>
        </section>
      </div>
    );
  }
  const sorted = [...fillRate.byAssembly].sort((a, b) => {
    const av = a.fillRate ?? 1;
    const bv = b.fillRate ?? 1;
    return av - bv;
  });

  // Fill Rate's reporting period switched from a rolling 30-day window to the last
  // fully completed calendar month — windowLabel carries the human-readable name
  // ("July 2026"). Older stored summaries saved before this switch won't have it yet.
  const windowLabel = fillRate.windowLabel ?? `${fillRate.windowStart} → ${fillRate.windowEnd}`;
  const otif = fillRate.otif;

  return (
    <div className="page">
      <div className="page-header">
        <div>
          <h1>Fill Rate Detail</h1>
          <p className="subtitle">
            {windowLabel} · {fillRate.orderCount} sales orders
          </p>
        </div>
        <p className="updated">
          {lastRun ? `Last updated ${new Date(lastRun).toLocaleString()}` : "Not yet run"}
        </p>
      </div>

      <div className="kpi-grid" style={{ marginBottom: 28 }}>
        <div className="kpi-card">
          <div className="label">Overall Fill Rate</div>
          <div className="value" style={{ color: toneColor(rateTone(fillRate.overallFillRate)) }}>
            {pct(fillRate.overallFillRate)}
          </div>
          <p className="definition">
            {fillRate.totalShipped.toLocaleString()} of {fillRate.totalOrdered.toLocaleString()}{" "}
            units shipped across {fillRate.orderCount} orders in {windowLabel}.
          </p>
          {trend && (
            <div style={{ marginTop: 12 }}>
              <Sparkline points={trend.overall} width={180} height={36} />
            </div>
          )}
        </div>

        <div className="kpi-card">
          <div className="label">OTIF (On Time In Full)</div>
          {otif ? (
            <>
              <div className="value" style={{ color: toneColor(rateTone(otif.otifRate)) }}>
                {pct(otif.otifRate)}
              </div>
              <p className="definition">
                {otif.otifCount} of {otif.totalOrders} orders in {windowLabel} shipped complete and
                by their promised ship date. {otif.inFullCount} shipped complete;{" "}
                {otif.onTimeCount} shipped on time.
              </p>
            </>
          ) : (
            <p className="definition" style={{ marginTop: 8 }}>
              OTIF hasn&apos;t been computed yet for this period — it&apos;ll appear after the next
              scheduled snapshot runs.
            </p>
          )}
        </div>
      </div>

      <section className="panel">
        <h2>Fill rate by product</h2>
        <p className="panel-sub">
          Sorted worst-first. Ordered/shipped totals are rolled up from sales order line items in{" "}
          {windowLabel}; the trend line shows how each product&apos;s reported fill rate has moved
          day to day since the snapshot job started tracking it — it updates daily until the
          month&apos;s numbers are final, then carries over once the next month begins.
        </p>
        <table>
          <thead>
            <tr>
              <th>Product</th>
              <th>Fill Rate</th>
              <th>Shipped / Ordered</th>
              <th>Trend</th>
            </tr>
          </thead>
          <tbody>
            {sorted.map((a) => (
              <tr key={a.name}>
                <td className="name">{a.name}</td>
                <td className="numeric">
                  <span className="bar-bg">
                    <span
                      className="bar-fill"
                      style={{
                        width: `${a.fillRate === null ? 0 : Math.max(2, a.fillRate * 100)}%`,
                        background: toneColor(rateTone(a.fillRate)),
                      }}
                    />
                  </span>
                  <span className="rate-value">{pct(a.fillRate)}</span>
                </td>
                <td className="numeric">
                  {a.shipped.toLocaleString()} / {a.ordered.toLocaleString()}
                </td>
                <td>
                  <Sparkline points={trend?.byAssembly[a.name] ?? []} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      <footer className="page-footer">
        Fill Rate = units shipped ÷ units ordered on sales orders dated in the most recently
        completed calendar month. OTIF = the share of those same orders that shipped both complete
        and by their promised ship date — a stricter, order-count-based measure (no partial
        credit) that surfaces orders shipped late even if the units eventually all went out.
      </footer>
    </div>
  );
}
