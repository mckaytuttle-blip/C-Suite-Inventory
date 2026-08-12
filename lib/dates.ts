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

/** Add (or subtract, with a negative n) whole days to a YYYY-MM-DD date key. */
export function addDaysToKey(dateKey: string, n: number): string {
  const d = new Date(`${dateKey}T00:00:00.000Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return toDateKey(d);
}

/** Whole days between two YYYY-MM-DD date keys (positive if `to` is after `from`). */
export function daysBetweenKeys(from: string, to: string): number {
  const a = new Date(`${from}T00:00:00.000Z`).getTime();
  const b = new Date(`${to}T00:00:00.000Z`).getTime();
  return Math.round((b - a) / (24 * 60 * 60 * 1000));
}
