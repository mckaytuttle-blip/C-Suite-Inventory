import Link from "next/link";
import { pct } from "@/lib/format";

interface KpiCardProps {
  label: string;
  // Percentage-rate KPIs (In-Stock Rate, Fill Rate) pass `value` and let this card
  // format it with pct(). KPIs with a different unit (Inventory Turnover's "x/yr",
  // Dead Stock's $) pass `displayValue` instead and leave `value` undefined.
  value?: number | null;
  displayValue?: string;
  definition: string;
  href: string;
  linkLabel: string;
  // ReactNode (not just string) so callers can pass multi-line content — e.g. the
  // Fill Rate card on the Overview page uses this to add an OTIF line underneath
  // the usual "shipped / ordered" summary.
  sub?: React.ReactNode;
}

// Headline KPI values on the Executive Overview always render in the brand teal,
// regardless of how good/bad the number is — this card is meant to read as "the
// brand's number," not a status light. Red/yellow/green status coloring still
// applies on the /in-stock, /fill-rate, and /inventory-health detail tables, where
// at-a-glance status across many rows is the point.
export default function KpiCard({
  label,
  value,
  displayValue,
  definition,
  href,
  linkLabel,
  sub,
}: KpiCardProps) {
  return (
    <div className="kpi-card">
      <div className="label">{label}</div>
      <div className="value" style={{ color: "var(--brand-teal)" }}>
        {displayValue ?? pct(value)}
      </div>
      <p className="definition">{definition}</p>
      <Link href={href} className="drill-link">
        {linkLabel} →
      </Link>
      {sub && <div className="sub">{sub}</div>}
    </div>
  );
}
