// app/fill-rate/page.tsx
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

  // The visible OTIF line stays to one sentence; anything conditional (exclusions,
  // the dropship proxy-date fallback) moves into this tooltip instead of stacking
  // extra sentences onto the card every time one of those cases applies.
  const otifTooltip = otif
    ? [
        "For the most recently completed calendar month,",
        otif.excludedNoDueDate > 0
          ? `${otif.excludedNoDueDate} order${otif.excludedNoDueDate === 1 ? "" : "s"} had no promised ship date on file, so ${otif.excludedNoDueDate === 1 ? "it was" : "they were"} excluded rather than counted as late.`
          : null,
        otif.dropshipProxyCount > 0
          ? `${otif.dropshipProxyCount} order${otif.dropshipProxyCount === 1 ? "" : "s"} ${otif.dropshipProxyCount === 1 ? "was" : "were"} dropshipped with no Zoho package record — on-time status estimated from the linked purchase order's bill/close date instead.`
          : null,
      ]
        .filter(Boolean)
        .join(" ")
    : "";

  return (
    <div className="page page-fillrate">
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
          <div className="label">
            OTIF (On Time In Full)
            {otif && (
              <span
                className="info-icon"
                data-tooltip={otifTooltip}
                aria-label={otifTooltip}
                tabIndex={0}
              >
                i
              </span>
            )}
          </div>
          {otif ? (
            <>
              <div className="value" style={{ color: toneColor(rateTone(otif.otifRate)) }}>
                {pct(otif.otifRate)}
              </div>
              <p className="definition">
                {otif.otifCount} of {otif.eligibleOrders} eligible orders shipped complete and on
                time this month.
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
          Sorted worst-first. Ordered/shipped totals are from sales order line items in{" "}
          {windowLabel}; the trend line shows how each product&apos;s reported fill rate has moved
          day to day and updates daily until the month&apos;s numbers are final, then carries over once the next month begins.
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
                <td className="name">
                  {a.name}
                  {!!a.dropshippedUnits && (
                    <span
                      className="dropship-tag"
                      title={`${a.dropshippedUnits} unit(s) shipped via a closed dropship PO this month — counted as shipped even though Zoho's line-item quantity_shipped shows 0 for these.`}
                    >
                      Dropshipped
                    </span>
                  )}
                  {!!a.dropshipPendingUnits && (
                    <span
                      className="dropship-tag pending"
                      title={`${a.dropshipPendingUnits} unit(s) went out as a dropship this month but the linked PO hasn't closed in Zoho yet — not yet counted as shipped.`}
                    >
                      Dropship PO open
                    </span>
                  )}
                </td>
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
    </div>
  );
}
