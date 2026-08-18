"use client";
import { useState } from "react";

export interface ExpandableTableColumn {
  key: string;
  label: string;
  numeric?: boolean;
}

export interface ExpandableTableProps {
  columns: ExpandableTableColumn[];
  // Pre-formatted cell content, keyed by column `key` — callers build these (money(),
  // pct(), tier pills, status labels, etc.) rather than this component knowing about
  // any particular KPI's formatting rules. Include a `_key` field (a plain string,
  // e.g. the component/vendor name) on every row for React's list key — NOT a
  // function prop: this component is a Client Component ("use client"), and Server
  // Components (every page that renders this) can't pass functions as props across
  // that boundary. Only serializable data crosses; a `rowKey` callback doesn't.
  rows: (Record<string, React.ReactNode> & { _key: string })[];
  // How many rows show by default before the toggle appears — the "relevant factors
  // contributing to this KPI" view. Everything beyond this is one click away, not lost.
  defaultCount?: number;
  emptyMessage?: string;
}

/**
 * A table that opens showing only its top `defaultCount` rows (the components/vendors
 * that actually move the needle on a given KPI) with a toggle to expand to the full
 * list — rather than every detail table always rendering all 83 tracked components
 * regardless of whether most of them are relevant to what's being shown.
 */
export default function ExpandableTable({
  columns,
  rows,
  defaultCount = 10,
  emptyMessage = "No data yet.",
}: ExpandableTableProps) {
  const [expanded, setExpanded] = useState(false);
  if (rows.length === 0) {
    return <p className="empty-state">{emptyMessage}</p>;
  }
  const hasMore = rows.length > defaultCount;
  const visible = expanded ? rows : rows.slice(0, defaultCount);

  return (
    <>
      <table>
        <thead>
          <tr>
            {columns.map((c) => (
              <th key={c.key} className={c.numeric ? "numeric" : undefined}>
                {c.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {visible.map((row) => (
            <tr key={row._key}>
              {columns.map((c) => (
                <td key={c.key} className={c.numeric ? "numeric" : undefined}>
                  {row[c.key] ?? "—"}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
      {hasMore && (
        <button type="button" className="expand-toggle" onClick={() => setExpanded((e) => !e)}>
          {expanded ? `Show top ${defaultCount}` : `Show all ${rows.length}`}
        </button>
      )}
    </>
  );
}
