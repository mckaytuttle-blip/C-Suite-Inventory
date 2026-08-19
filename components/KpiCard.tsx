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
  // Explicit CSS color for the headline value (e.g. toneColor(rateTone(...))) —
  // defaults to the plain brand teal when omitted. Opt-in per card rather than
  // automatic: not every KPI has a natural "good/bad" (Capital Tied Up and Total
  // Spend are pure magnitude with no target to compare against), so the caller
  // decides which cards get red/yellow/teal status coloring and which stay neutral.
  valueColor?: string;
}

// Headline KPI values on the Executive Overview render in the brand teal by default,
// but callers can pass `valueColor` to switch a specific card to red/yellow/teal
// status coloring instead (see In-Stock Rate / Fill Rate / Dead Stock on the Overview
// page) — this card doesn't compute tone itself, it just renders whatever color it's
// given, so the "is this KPI good or bad" judgment stays with the caller that
// actually knows the metric's semantics.
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
  valueColor,
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
      <div className="value" style={{ color: valueColor ?? "var(--brand-teal)" }}>
        {displayValue ?? pct(value)}
      </div>
      {sub && <div className="sub">{sub}</div>}
      <span className="drill-hint">{linkLabel} →</span>
    </Link>
  );
}
