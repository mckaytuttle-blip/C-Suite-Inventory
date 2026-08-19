// app/inventory-health/page.tsx
import ExpandableTable, { ExpandableTableColumn } from "@/components/ExpandableTable";
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

function statusPill(bad: boolean, badLabel: string, goodLabel: string) {
  return <span style={{ color: toneColor(bad ? "bad" : "good") }}>{bad ? badLabel : goodLabel}</span>;
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

  // --- Capital Tied Up in Inventory: same components, sorted by $ value at cost ---
  const byValueSorted = [...summary.byComponent]
    .filter((c) => c.valueAtCost !== null)
    .sort((a, b) => (b.valueAtCost ?? 0) - (a.valueAtCost ?? 0));

  // --- Vendor Concentration & Total Spend — both optional; summaries saved before
  // this feature shipped won't have them until the next daily aging run.
  const vendorBreakdown = aggregate.vendorInventoryBreakdown ?? [];
  const spend = aggregate.spend ?? null;

  const agingColumns: ExpandableTableColumn[] = [
    { key: "name", label: "Component" },
    { key: "tier", label: "Tier" },
    { key: "onHand", label: "On Hand", numeric: true },
    { key: "value", label: "Value at Cost", numeric: true },
    { key: "lastMovement", label: "Last Movement" },
    { key: "d90", label: "90d", numeric: true },
    { key: "d180", label: "180d", numeric: true },
  ];
  const agingRows = agingSorted.map((c) => ({
    _key: c.name,
    name: c.name,
    tier: <span className={tierClass(c.tier)}>{c.tier}</span>,
    onHand: c.stockOnHand ?? "—",
    value: money(c.valueAtCost),
    lastMovement: movementLabel(c),
    d90: statusPill(c.noMovement90, "dead", "moving"),
    d180: statusPill(c.noMovement180, "dead", "moving"),
  }));

  const turnoverColumns: ExpandableTableColumn[] = [
    { key: "name", label: "Component" },
    { key: "tier", label: "Tier" },
    { key: "units", label: "Units Consumed (90d)", numeric: true },
    { key: "cogs", label: "COGS (annualized)", numeric: true },
    { key: "avgInv", label: "Avg Inventory ($)", numeric: true },
    { key: "turnover", label: "Turnover", numeric: true },
    { key: "data", label: "Data", numeric: true },
  ];
  const turnoverRows = turnoverSorted.map((c) => ({
    _key: c.name,
    name: c.name,
    tier: <span className={tierClass(c.tier)}>{c.tier}</span>,
    units: c.unitsConsumed90.toLocaleString(),
    cogs: money(c.cogs90 !== null ? c.cogs90 * (365 / 90) : null),
    avgInv: money(c.avgInventoryValue90),
    turnover: turnoverLabel(c.turnoverRatioAnnualized),
    data: (
      <span title="Days of live (non-backfill) snapshot data used for the average inventory figure, out of the trailing 90.">
        {c.daysOfSnapshotData90}/90
      </span>
    ),
  }));

  const capitalColumns: ExpandableTableColumn[] = [
    { key: "name", label: "Component" },
    { key: "tier", label: "Tier" },
    { key: "onHand", label: "On Hand", numeric: true },
    { key: "value", label: "Value at Cost", numeric: true },
    { key: "share", label: "% of Tracked Value", numeric: true },
  ];
  const capitalRows = byValueSorted.map((c) => ({
    _key: c.name,
    name: c.name,
    tier: <span className={tierClass(c.tier)}>{c.tier}</span>,
    onHand: c.stockOnHand ?? "—",
    value: money(c.valueAtCost),
    share: aggregate.totalInventoryValue > 0 ? pct((c.valueAtCost ?? 0) / aggregate.totalInventoryValue) : "—",
  }));

  const vendorColumns: ExpandableTableColumn[] = [
    { key: "vendor", label: "Vendor" },
    { key: "skuCount", label: "Tracked SKUs", numeric: true },
    { key: "value", label: "Inventory Value", numeric: true },
    { key: "share", label: "% of Tracked Value", numeric: true },
  ];
  const vendorRows = vendorBreakdown.map((v) => ({
    _key: v.vendorName,
    vendor: v.vendorName,
    skuCount: v.skuCount,
    value: money(v.inventoryValue),
    share: aggregate.totalInventoryValue > 0 ? pct(v.inventoryValue / aggregate.totalInventoryValue) : "—",
  }));

  const spendColumns: ExpandableTableColumn[] = [
    { key: "vendor", label: "Vendor" },
    { key: "poCount", label: "Purchase Orders", numeric: true },
    { key: "spend", label: "Spend", numeric: true },
    { key: "share", label: "% of Total Spend", numeric: true },
  ];
  const spendRows = (spend?.byVendor ?? []).map((v) => ({
    _key: v.vendorName,
    vendor: v.vendorName,
    poCount: v.poCount,
    spend: money(v.spend),
    share: spend && spend.totalSpend > 0 ? pct(v.spend / spend.totalSpend) : "—",
  }));

  return (
    <div className="page page-invhealth">
      <div className="page-header">
        <div>
          <h1>Inventory Health</h1>
          <p className="subtitle">
            Turnover, Aging/Dead Stock, Capital Tied Up &amp; Vendor Concentration ·{" "}
            {summary.byComponent.length} tracked components
          </p>
        </div>
        <p className="updated">
          {lastRun ? `Last updated ${new Date(lastRun).toLocaleString()}` : "Not yet run"}
        </p>
      </div>

      {/* Each card is an <a href="#..."> rather than a <div> — same .kpi-card class
          picks up the existing a.kpi-card hover-lift styling from globals.css (built
          for the Overview page's clickable cards), so this gets that affordance for
          free. Each links down to the panel below with the matching data; the two
          Dead Stock cards both point at the single Aging/Dead Stock table, since
          that one table covers both the 90d and 180d cutoffs. */}
      <div className="kpi-grid" style={{ marginBottom: 28 }}>
        <a href="#turnover" className="kpi-card">
          <div className="label">Inventory Turnover</div>
          <div className="value" style={{ color: "var(--brand-teal)" }}>
            {turnoverLabel(aggregate.overallTurnoverRatioAnnualized)}
          </div>
          <p className="definition">
            Trailing 90-day COGS ÷ average inventory (at cost), annualized. $-weighted across all
            tracked components with both a purchase cost and enough snapshot history.
          </p>
          <span className="drill-hint">Jump to table ↓</span>
        </a>
        <a href="#aging" className="kpi-card">
          <div className="label">Dead Stock — 90 Days</div>
          <div className="value" style={{ color: toneColor(deadStockShareTone(deadStockShare90)) }}>
            {money(aggregate.deadStockValue90)}
          </div>
          <p className="definition">
            {aggregate.deadStockCount90} component(s) with no movement in the last 90 days
            {deadStockShare90 !== null ? ` · ${pct(deadStockShare90)} of tracked inventory value` : ""}.
          </p>
          <span className="drill-hint">Jump to table ↓</span>
        </a>
        <a href="#aging" className="kpi-card">
          <div className="label">Dead Stock — 180 Days</div>
          <div className="value" style={{ color: toneColor("bad") }}>
            {money(aggregate.deadStockValue180)}
          </div>
          <p className="definition">
            {aggregate.deadStockCount180} component(s) with no recorded movement in the last
            180 days.
          </p>
          <span className="drill-hint">Jump to table ↓</span>
        </a>
        <a href="#capital" className="kpi-card">
          <div className="label">Capital Tied Up in Inventory</div>
          <div className="value" style={{ color: "var(--brand-teal)" }}>
            {money(aggregate.totalInventoryValue)}
          </div>
          <p className="definition">
            Current on-hand value at cost across every matched, priced tracked component — the
            $ this hardware is holding right now.
          </p>
          <span className="drill-hint">Jump to table ↓</span>
        </a>
        <a href="#spend" className="kpi-card">
          <div className="label">Total Spend (Year to Date)</div>
          <div className="value" style={{ color: "var(--brand-teal)" }}>
            {money(spend?.totalSpend ?? null)}
          </div>
          <p className="definition">
            All Zoho purchase orders company-wide so far this calendar year, not just the
            tracked hardware components.
            {spend ? ` ${spend.poCount} purchase orders.` : ""}
          </p>
          <span className="drill-hint">Jump to table ↓</span>
        </a>
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

      <section id="capital" className="panel" style={{ marginBottom: 28 }}>
        <h2>Capital Tied Up — By Component</h2>
        <p className="panel-sub">
          The components carrying the most $ in on-hand stock right now, highest first. Shows the
          top 10 contributors to the {money(aggregate.totalInventoryValue)} total by default —
          expand to see all {summary.byComponent.length}.
        </p>
        <ExpandableTable
          columns={capitalColumns}
          rows={capitalRows}
          emptyMessage="No priced components yet."
        />
      </section>

      <section id="vendor-concentration" className="panel" style={{ marginBottom: 28 }}>
        <h2>Vendor Concentration</h2>
        <p className="panel-sub">
          Share of tracked components&apos; current inventory value ($) and SKU count by vendor —
          the vendors this dashboard&apos;s hardware relies on most, and how much of that reliance
          is concentrated in one place. Shows the top 10 by value by default.
        </p>
        {vendorBreakdown.length === 0 ? (
          <p className="empty-state">
            Vendor Concentration will appear after the next daily aging run (<code>/api/cron/aging</code>
            ) — this summary was saved before this view was added.
          </p>
        ) : (
          <ExpandableTable columns={vendorColumns} rows={vendorRows} />
        )}
      </section>

      <section id="spend" className="panel" style={{ marginBottom: 28 }}>
        <h2>Total Spend — By Vendor (Year to Date)</h2>
        <p className="panel-sub">
          Every Zoho purchase order company-wide so far this calendar year, grouped by vendor —
          not scoped to the 83 tracked components. Shows the top 10 vendors by spend by default.
          {spend && ` Window: ${spend.windowStart} → ${spend.windowEnd}.`}
        </p>
        {!spend ? (
          <p className="empty-state">
            Total Spend hasn&apos;t been computed yet — it&apos;ll appear after the next daily
            aging run (<code>/api/cron/aging</code>).
          </p>
        ) : (
          <ExpandableTable columns={spendColumns} rows={spendRows} />
        )}
      </section>

      <section id="aging" className="panel" style={{ marginBottom: 28 }}>
        <h2>Aging / Dead Stock</h2>
        <p className="panel-sub">
          &quot;Movement&quot; means a sales order line item — either this component sold
          directly, or rolled down through a composite&apos;s bill of materials into an assembly
          that sold. &quot;No movement in 180+ days&quot; means none was found anywhere in the
          trailing 180-day lookback, not necessarily exactly 180. Shows the 10 most stale
          components by default, oldest first — expand to see all {summary.byComponent.length}.
        </p>
        <ExpandableTable columns={agingColumns} rows={agingRows} />
      </section>

      <section id="turnover" className="panel">
        <h2>Inventory Turnover by component</h2>
        <p className="panel-sub">
          COGS uses units consumed in the trailing 90 days (direct sales plus BOM rolldown) ×
          Zoho&apos;s purchase cost, annualized (×365/90). Average inventory is the mean of daily
          on-hand snapshots over the same 90 days — accuracy improves as more days of live
          (non-backfilled) snapshot history accumulate; see the Data column. Shows the 10 slowest
          movers by default — expand to see all {summary.byComponent.length}.
        </p>
        <ExpandableTable columns={turnoverColumns} rows={turnoverRows} />
      </section>
    </div>
  );
}
