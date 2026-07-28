/** Format a Date as YYYY-MM-DD in UTC (dates are day-granularity throughout this app). */
export function toDateKey(d: Date): string {
  return d.toISOString().slice(0, 10);
}

/** Today's date key, UTC. */
export function todayKey(): string {
  return toDateKey(new Date());
}

/** Return the last N date keys (inclusive of today), oldest first. */
export function lastNDateKeys(n: number, from: Date = new Date()): string[] {
  const keys: string[] = [];
  for (let i = n - 1; i >= 0; i--) {
    const d = new Date(from);
    d.setUTCDate(d.getUTCDate() - i);
    keys.push(toDateKey(d));
  }
  return keys;
}

/** True if [start, end] (inclusive, YYYY-MM-DD) overlaps the given date key. */
export function rangeIncludes(start: string, end: string, dateKey: string): boolean {
  return start <= dateKey && dateKey <= end;
}
