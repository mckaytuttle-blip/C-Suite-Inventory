// app/inventory-health/page.tsx
import { deadStockShareTone, money, pct, toneColor, turnoverLabel } from "@/lib/format";
import { getInventoryHealthSummary, getLastAgingRun, InventoryHealthEntry } from "@/lib/store";

export const dynamic = "force-dynamic";
export const revalidate = 0;

function tierClass(tier: string): string {
  return `tier-pill ${tier.toLowerCase()}`;
}

function movementLabel(entry: InventoryHealthEntry): string {
  if (!entry.matched) return "not found in Zoho";
  if (entry.lastMovementDate === null) return "No movement in 180+ days";
  return `${entry.lastMovementDate} (${entry.daysSinceLastMovement}d ago)`;
}

export default async function InventoryHealthPage() {
  let summary: Awaited<ReturnType<typeof getInventoryHealthSummary>> = null;
  let lastRun: string | null = null;
  let error: string | null = null;

  try {
    [summary, lastRun] = await Promise.all([getInventoryHealthSummary(), getLastAgingRun()]);
  } catch (err: any) {
    error = err?.message ?? String(err);
  }

  if (error) {
    return (
      <div className="page">
        <div className="page-header">
          <h1>Inventory Health</h1>
        </div>
        <section className="panel">
          <div className="empty-state">
            Couldn&apos;t load data: <code>{error}</code>
          </div>
        </section>
      </div>
    );
  }

  if (!summary) {
    return (
      <div className="page">
        <div className="page-header">
          <h1>Inventory Health</h1>
        </div>
        <section className="panel">
          <div className="empty-state">
            <p>No aging/turnover data yet.</p>
            <p>
              This runs on its own daily job (<code>/api/cron/aging</code>) separate from the
              In-Stock/Fill Rate snapshot, since it pulls a heavier 180-day sales history and the
              full composite bill of materials. Trigger it once manually to populate the first
              day of data — see the README.
            </p>
          </div>
        </section>
      </div>
    );
  }

  const { aggregate } = summary;
  const deadStockShare90 =
    aggregate.totalInventoryValue > 0 ? aggregate.deadStockValue90 / aggregate.totalInventoryValue : null;

  const agingSorted = [...summary.byComponent].sort((a, b) => {
    const av = a.daysSinceLastMovement ?? Infinity;
    const bv = b.daysSinceLastMovement ?? Infinity;
    return bv - av;
  });

  const turnoverSorted = [...summary.byComponent]
    .filter((c) => c.matched)
    .sort((a, b) => {
      const av = a.turnoverRatioAnnualized ?? -1;
      const bv = b.turnoverRatioAnnualized ?? -1;
      // Unknown (-1) sorts last, not first — a component we can't compute turnover
      // for isn't necessarily a "fast mover," it's just missing data.
      if (av === -1 && bv === -1) return 0;
      if (av === -1) return 1;
      if (bv === -1) return -1;
      return av - bv;
    });

  return (
    <div className="page">
      <div className="page-header">
        <div>
          <h1>Inventory Health</h1>
          <p className="subtitle">
            Inventory Turnover &amp; Aging/Dead Stock · {summary.byComponent.length} tracked components
          </p>
        </div>
        <p className="updated">
          {lastRun ? `Last updated ${new Date(lastRun).toLocaleString()}` : "Not yet run"}
        </p>
      </div>

      <div className="kpi-grid" style={{ marginBottom: 28 }}>
        <div className="kpi-card">
          <div className="label">Inventory Turnover</div>
          <div className="value" style={{ color: "var(--brand-teal)" }}>
            {turnoverLabel(aggregate.overallTurnoverRatioAnnualized)}
          </div>
          <p className="definition">
            Trailing 90-day COGS ÷ average inventory (at cost), annualized. $-weighted across all
            tracked components with both a purchase cost and enough snapshot history.
          </p>
        </div>
        <div className="kpi-card">
          <div className="label">Dead Stock — 90 Days</div>
          <div className="value" style={{ color: toneColor(deadStockShareTone(deadStockShare90)) }}>
            {money(aggregate.deadStockValue90)}
          </div>
          <p className="definition">
            {aggregate.deadStockCount90} component(s) with no movement in the trailing 90 days
            {deadStockShare90 !== null ? ` · ${pct(deadStockShare90)} of tracked inventory value` : ""}.
          </p>
        </div>
        <div className="kpi-card">
          <div className="label">Dead Stock — 180 Days</div>
          <div className="value" style={{ color: toneColor("bad") }}>
            {money(aggregate.deadStockValue180)}
          </div>
          <p className="definition">
            {aggregate.deadStockCount180} component(s) with no recorded movement in the trailing
            180 days — the harder cutoff.
          </p>
        </div>
      </div>

      {(aggregate.componentsUnmatched > 0 || aggregate.componentsMissingCost > 0) && (
        <p className="panel-sub" style={{ marginBottom: 16 }}>
          {aggregate.componentsUnmatched > 0 &&
            `${aggregate.componentsUnmatched} tracked component(s) weren't found in Zoho. `}
          {aggregate.componentsMissingCost > 0 &&
            `${aggregate.componentsMissingCost} matched component(s) have no purchase cost on file in Zoho, so their $ value and turnover can't be computed. `}
          These are still listed below for visibility.
        </p>
      )}

      <section className="panel" style={{ marginBottom: 28 }}>
        <h2>Aging / Dead Stock</h2>
        <p className="panel-sub">
          Sorted oldest-first by days since last movement. &quot;Movement&quot; means a sales order
          line item — either this component sold directly, or rolled down through a composite&apos;s
          bill of materials into an assembly that sold. &quot;No movement in 180+ days&quot; means
          none was found anywhere in the trailing 180-day lookback, not necessarily exactly 180.
        </p>
        <table>
          <thead>
            <tr>
              <th>Component</th>
              <th>Tier</th>
              <th>On Hand</th>
              <th>Value at Cost</th>
              <th>Last Movement</th>
              <th>90d</th>
              <th>180d</th>
            </tr>
          </thead>
          <tbody>
            {agingSorted.map((c) => (
              <tr key={c.name}>
                <td className="name">{c.name}</td>
                <td>
                  <span className={tierClass(c.tier)}>{c.tier}</span>
                </td>
                <td className="numeric">{c.stockOnHand ?? "—"}</td>
                <td className="numeric">{money(c.valueAtCost)}</td>
                <td>{movementLabel(c)}</td>
                <td className="numeric">
                  {c.noMovement90 ? (
                    <span style={{ color: toneColor("bad") }}>dead</span>
                  ) : (
                    <span style={{ color: toneColor("good") }}>moving</span>
                  )}
                </td>
                <td className="numeric">
                  {c.noMovement180 ? (
                    <span style={{ color: toneColor("bad") }}>dead</span>
                  ) : (
                    <span style={{ color: toneColor("good") }}>moving</span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      <section className="panel">
        <h2>Inventory Turnover by component</h2>
        <p className="panel-sub">
          Sorted slowest-first. COGS uses units consumed in the trailing 90 days (direct sales plus
          BOM rolldown) × Zoho&apos;s purchase cost, annualized (×365/90). Average inventory is the
          mean of daily on-hand snapshots over the same 90 days — accuracy improves as more days of
          live (non-backfilled) snapshot history accumulate; see the Data column.
        </p>
        <table>
          <thead>
            <tr>
              <th>Component</th>
              <th>Tier</th>
              <th>Units Consumed (90d)</th>
              <th>COGS (annualized)</th>
              <th>Avg Inventory ($)</th>
              <th>Turnover</th>
              <th>Data</th>
            </tr>
          </thead>
          <tbody>
            {turnoverSorted.map((c) => (
              <tr key={c.name}>
                <td className="name">{c.name}</td>
                <td>
                  <span className={tierClass(c.tier)}>{c.tier}</span>
                </td>
                <td className="numeric">{c.unitsConsumed90.toLocaleString()}</td>
                <td className="numeric">
                  {money(c.cogs90 !== null ? c.cogs90 * (365 / 90) : null)}
                </td>
                <td className="numeric">{money(c.avgInventoryValue90)}</td>
                <td className="numeric">{turnoverLabel(c.turnoverRatioAnnualized)}</td>
                <td className="numeric" title="Days of live (non-backfill) snapshot data used for the average inventory figure, out of the trailing 90.">
                  {c.daysOfSnapshotData90}/90
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
    </div>
  );
}
