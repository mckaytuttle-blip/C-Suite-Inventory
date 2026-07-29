import { TrendPoint } from "@/lib/kpis";

interface SparklineProps {
  points: TrendPoint[];
  width?: number;
  height?: number;
  color?: string;
}

/**
 * Minimal inline SVG line chart for a 0..1 rate over time. Renders gaps for null
 * values (no data that day) rather than connecting across them. No external chart
 * library — this dashboard has no other client-side JS need, so keeping it dependency
 * free avoids shipping a chart library just for a handful of small trend lines.
 */
export default function Sparkline({ points, width = 120, height = 28, color }: SparklineProps) {
  const defined = points.filter((p) => p.value !== null);

  if (defined.length < 2) {
    return (
      <span
        style={{
          display: "inline-block",
          width,
          height,
          verticalAlign: "middle",
          color: "var(--muted-dim)",
          fontSize: 11,
        }}
      >
        not enough history yet
      </span>
    );
  }

  const n = points.length;
  const stepX = n > 1 ? width / (n - 1) : width;
  const lineColor = color ?? "var(--brand-teal)";

  // Build contiguous segments so gaps (nulls) break the line instead of connecting across them.
  const segments: { x: number; y: number }[][] = [];
  let current: { x: number; y: number }[] = [];
  points.forEach((p, i) => {
    if (p.value === null) {
      if (current.length > 0) segments.push(current);
      current = [];
      return;
    }
    const x = i * stepX;
    const y = height - p.value * height;
    current.push({ x, y: Number.isFinite(y) ? y : height });
  });
  if (current.length > 0) segments.push(current);

  return (
    <svg
      width={width}
      height={height}
      viewBox={`0 0 ${width} ${height}`}
      style={{ display: "inline-block", verticalAlign: "middle" }}
    >
      {segments.map((seg, i) => (
        <polyline
          key={i}
          points={seg.map((pt) => `${pt.x.toFixed(1)},${pt.y.toFixed(1)}`).join(" ")}
          fill="none"
          stroke={lineColor}
          strokeWidth={1.75}
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      ))}
    </svg>
  );
}
