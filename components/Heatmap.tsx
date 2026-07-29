import { DayStatus } from "@/lib/kpis";

function cellColor(status: DayStatus): string {
  switch (status) {
    case "in-stock":
      return "var(--good)";
    case "out-of-stock":
      return "var(--bad)";
    case "no-data":
      return "rgba(255,255,255,0.06)";
  }
}

interface HeatmapProps {
  history: DayStatus[];
  /** Optional per-day tooltip labels, same length/order as history. */
  labels?: string[];
}

/** A GitHub-contribution-graph-style day strip: one cell per day, oldest to newest. */
export default function Heatmap({ history, labels }: HeatmapProps) {
  return (
    <span className="heatmap">
      {history.map((status, i) => (
        <span
          key={i}
          className="cell"
          style={{ background: cellColor(status) }}
          title={labels?.[i] ?? status}
        />
      ))}
    </span>
  );
}
