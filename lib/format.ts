export type Tone = "good" | "warn" | "bad";

export function pct(n: number | null | undefined): string {
  if (n === null || n === undefined) return "—";
  return `${(n * 100).toFixed(1)}%`;
}

export function rateTone(n: number | null | undefined): Tone {
  if (n === null || n === undefined) return "warn";
  if (n >= 0.98) return "good";
  if (n >= 0.9) return "warn";
  return "bad";
}

export function toneColor(tone: Tone): string {
  return tone === "good" ? "var(--good)" : tone === "warn" ? "var(--warn)" : "var(--bad)";
}
