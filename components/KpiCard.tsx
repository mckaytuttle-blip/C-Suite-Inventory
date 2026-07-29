import Link from "next/link";
import { pct, rateTone, toneColor } from "@/lib/format";

interface KpiCardProps {
  label: string;
  value: number | null;
  definition: string;
  href: string;
  linkLabel: string;
  sub?: string;
}

export default function KpiCard({ label, value, definition, href, linkLabel, sub }: KpiCardProps) {
  const tone = rateTone(value);
  return (
    <div className="kpi-card">
      <div className="label">{label}</div>
      <div className="value" style={{ color: toneColor(tone) }}>
        {pct(value)}
      </div>
      <p className="definition">{definition}</p>
      <Link href={href} className="drill-link">
        {linkLabel} →
      </Link>
      {sub && <div className="sub">{sub}</div>}
    </div>
  );
}
