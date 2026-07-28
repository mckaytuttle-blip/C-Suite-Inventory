import { NextResponse } from "next/server";
import { computeInStockRateSummary, viewFillRate } from "@/lib/kpis";
import { getFillRateSummary, getLastSnapshotRun } from "@/lib/store";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const [inStock, fillRateRaw, lastRun] = await Promise.all([
      computeInStockRateSummary(30),
      getFillRateSummary(),
      getLastSnapshotRun(),
    ]);

    return NextResponse.json({
      ok: true,
      lastSnapshotRun: lastRun,
      inStock,
      fillRate: viewFillRate(fillRateRaw),
    });
  } catch (err: any) {
    console.error("Failed to load KPIs:", err);
    return NextResponse.json({ ok: false, error: err?.message ?? String(err) }, { status: 500 });
  }
}
