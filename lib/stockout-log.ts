// Manually-maintained historical stockout log, transcribed from
// "2026 Inventory Updates - Updated Weekly - Stockouts.pdf" (as of 2026-07-28).
//
// This is the source of truth for stockout windows that happened *before* the
// daily snapshot automation started. Used by scripts/backfill-stockouts.ts to
// seed history so In-Stock Rate isn't blank for the days before this dashboard
// existed. Update this list each time the underlying PDF/log is refreshed —
// the dashboard does not read the PDF directly.

export interface StockoutRecord {
  item: string;
  stockoutNumber: number;
  start: string; // YYYY-MM-DD
  end: string; // YYYY-MM-DD
  durationDays: number;
  preStockoutDemandPerDay: number | null;
  postRecoveryReferencePerDay: number | null;
  notes: string;
}

export const STOCKOUT_LOG: StockoutRecord[] = [
  {
    item: "Stat Tag PCB (1.0)",
    stockoutNumber: 1,
    start: "2026-02-25",
    end: "2026-03-25",
    durationDays: 28,
    preStockoutDemandPerDay: 46.69,
    postRecoveryReferencePerDay: 55.1,
    notes: "Caused by poor planning around Chinese New Year",
  },
  {
    item: "Stat Tag PCB (1.0)",
    stockoutNumber: 2,
    start: "2026-04-01",
    end: "2026-04-09",
    durationDays: 8,
    preStockoutDemandPerDay: 108,
    postRecoveryReferencePerDay: 55.1,
    notes: "Caused by poor planning around Chinese New Year",
  },
  {
    item: "Sensor Desktop & Ceiling PCB",
    stockoutNumber: 1,
    start: "2026-02-09",
    end: "2026-03-13",
    durationDays: 32,
    preStockoutDemandPerDay: 18.38,
    postRecoveryReferencePerDay: 7.85,
    notes: "Caused by poor planning around Chinese New Year",
  },
  {
    item: "FS Unburned Box",
    stockoutNumber: 1,
    start: "2026-06-24",
    end: "2026-07-14",
    durationDays: 20,
    preStockoutDemandPerDay: 2.23,
    postRecoveryReferencePerDay: null,
    notes:
      "Caused by no push back on SOs with locations that could have used less flowstations",
  },
];
