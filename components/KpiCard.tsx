"use client";
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
//
// The whole card is the link (no separate "Take a Deeper Look" button pill) — click
// anywhere on it to drill in. `definition` moved from an always-visible paragraph
// into the same hover/focus info-icon pattern Fill Rate's OTIF card already uses,
// so six of these on the Overview page don't mean six paragraphs of text. That
// requires this to be a Client Component: the info-icon needs its own click handler
// so reading the tooltip doesn't also navigate away (a Server Component can't hold
// event handlers).
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
    <Link href={href} className="kpi-card">
      <div className="label">
        {label}
        <span
          className="info-icon"
          data-tooltip={definition}
          aria-label={definition}
          tabIndex={0}
          onClick={(e) => {
            e.preventDefault();
            e.stopPropagation();
          }}
        >
          i
        </span>
      </div>
      <div className="value" style={{ color: "var(--brand-teal)" }}>
        {displayValue ?? pct(value)}
      </div>
      {sub && <div className="sub">{sub}</div>}
      <span className="drill-hint">{linkLabel} →</span>
    </Link>
  );
}
