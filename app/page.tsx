import { computeInStockRateSummary, InStockRateSummary, viewFillRate, FillRateView } from "@/lib/kpis";
import { getFillRateSummary, getLastSnapshotRun } from "@/lib/store";

export const dynamic = "force-dynamic";
export const revalidate = 0;

function pct(n: number | null): string {
  if (n === null) return "—";
  return `${(n * 100).toFixed(1)}%`;
}

function rateTone(n: number | null): "good" | "warn" | "bad" {
  if (n === null) return "warn";
  if (n >= 0.98) return "good";
  if (n >= 0.9) return "warn";
  return "bad";
}

function toneColor(tone: "good" | "warn" | "bad"): string {
  return tone === "good" ? "var(--good)" : tone === "warn" ? "var(--warn)" : "var(--bad)";
}

function Bar({ value }: { value: number | null }) {
  const tone = rateTone(value);
  const width = value === null ? 0 : Math.max(2, Math.min(100, value * 100));
  return (
    <span className="bar-bg">
      <span className="bar-fill" style={{ width: `${width}%`, background: toneColor(tone) }} />
    </span>
  );
}

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

export default async function DashboardPage() {
  const { inStock, fillRate, lastRun, error } = await loadData();

  if (error) {
    return (
      <div className="page">
        <div className="header">
          <div>
            <h1>Stat Medical — Inventory Dashboard</h1>
            <p>In-Stock Rate &amp; Fill Rate</p>
          </div>
        </div>
        <section className="panel">
          <h2>Not connected yet</h2>
          <div className="empty-state">
            <p>
              The dashboard can&apos;t reach its data store yet: <code>{error}</code>
            </p>
            <p>
              Add the Upstash Redis integration in your Vercel project (or set{" "}
              <code>UPSTASH_REDIS_REST_URL</code> / <code>UPSTASH_REDIS_REST_TOKEN</code>{" "}
              manually), then trigger <code>/api/cron/snapshot</code> once to populate the first
              day of data. See the README for full setup steps.
            </p>
          </div>
        </section>
      </div>
    );
  }

  const noHistoryYet = (inStock?.daysWithData ?? 0) === 0;

  return (
    <div className="page">
      <div className="header">
        <div>
          <h1>Stat Medical — Inventory Dashboard</h1>
          <p>In-Stock Rate &amp; Fill Rate, pulled live from Zoho Inventory</p>
        </div>
        <p>{lastRun ? `Last updated ${new Date(lastRun).toLocaleString()}` : "Not yet run"}</p>
      </div>

      <div className="kpi-grid">
        <div className="kpi-card">
          <div className="label">In-Stock Rate (trailing 30 days)</div>
          <div className="value" style={{ color: toneColor(rateTone(inStock?.overallInStockRate ?? null)) }}>
            {pct(inStock?.overallInStockRate ?? null)}
          </div>
          <div className="sub">
            {inStock?.daysWithData ?? 0} of {inStock?.windowDays ?? 30} days of data ·{" "}
            across {inStock?.byComponent.filter((c) => c.inStockRate !== null).length ?? 0} of{" "}
            {inStock?.byComponent.length ?? 0} tracked components
          </div>
        </div>

        <div className="kpi-card">
          <div className="label">Fill Rate (trailing 30 days)</div>
          <div className="value" style={{ color: toneColor(rateTone(fillRate?.overallFillRate ?? null)) }}>
            {pct(fillRate?.overallFillRate ?? null)}
          </div>
          <div className="sub">
            {fillRate ? (
              <>
                {fillRate.totalShipped.toLocaleString()} of {fillRate.totalOrdered.toLocaleString()}{" "}
                units shipped · {fillRate.orderCount} sales orders (
                {fillRate.windowStart} → {fillRate.windowEnd})
              </>
            ) : (
              "No data yet"
            )}
          </div>
        </div>
      </div>

      {noHistoryYet && (
        <section className="panel">
          <h2>Waiting on the first snapshot</h2>
          <div className="empty-state">
            <p>
              No daily snapshots have been recorded yet, so In-Stock Rate has nothing to average
              over. Trigger <code>/api/cron/snapshot</code> (or run{" "}
              <code>npm run backfill</code> to seed known history) — the Vercel Cron job will also
              pick this up automatically once deployed, each day going forward.
            </p>
          </div>
        </section>
      )}

      <section className="panel">
        <h2>Components below 100% in-stock (worst first)</h2>
        {inStock && inStock.worstComponents.length > 0 ? (
          <table>
            <thead>
              <tr>
                <th>Component</th>
                <th>Tier</th>
                <th>In-Stock Rate</th>
                <th>Days in stock</th>
              </tr>
            </thead>
            <tbody>
              {inStock.worstComponents.map((c) => (
                <tr key={c.name}>
                  <td>{c.name}</td>
                  <td>{c.tier}</td>
                  <td>
                    <Bar value={c.inStockRate} />
                    {pct(c.inStockRate)}
                  </td>
                  <td>
                    {c.daysInStock} / {c.daysTracked}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <div className="empty-state">No component history yet.</div>
        )}
      </section>

      <section className="panel">
        <h2>Fill rate by product (lowest first)</h2>
        {fillRate && fillRate.worstAssemblies.length > 0 ? (
          <table>
            <thead>
              <tr>
                <th>Product</th>
                <th>Fill Rate</th>
                <th>Shipped / Ordered</th>
              </tr>
            </thead>
            <tbody>
              {fillRate.worstAssemblies.map((a) => (
                <tr key={a.name}>
                  <td>{a.name}</td>
                  <td>
                    <Bar value={a.fillRate} />
                    {pct(a.fillRate)}
                  </td>
                  <td>
                    {a.shipped.toLocaleString()} / {a.ordered.toLocaleString()}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <div className="empty-state">No sales order history yet.</div>
        )}
      </section>

      <footer>
        In-Stock Rate = % of the last 30 days each tracked component showed available stock &gt;
        0 in Zoho. Fill Rate = units shipped ÷ units ordered on sales orders dated in the last 30
        days. Both refresh once daily via a scheduled Vercel Cron job.
      </footer>
    </div>
  );
}
