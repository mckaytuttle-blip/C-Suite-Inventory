import { NextRequest, NextResponse } from "next/server";
import { runInventoryHealthSnapshot } from "@/lib/run-snapshot";

export const dynamic = "force-dynamic";
// Heavier than /api/cron/snapshot — a full composite BOM flatten plus sales order
// detail calls across a 180-day window. Kept on its own route/schedule so a slow
// run here can't hold up In-Stock Rate or Fill Rate. 300s requires a Vercel plan
// that supports extended function duration (Hobby caps at 60s) — if you're on
// Hobby, either lower this or expect the route to time out and need a retry.
export const maxDuration = 300;

function isAuthorized(req: NextRequest): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return true; // no secret configured — treat as open (dev/local only)
  const auth = req.headers.get("authorization");
  return auth === `Bearer ${secret}`;
}

async function handle(req: NextRequest) {
  if (!isAuthorized(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const result = await runInventoryHealthSnapshot();
    return NextResponse.json({
      ok: true,
      generatedAt: result.generatedAt,
      componentsUnmatched: result.aggregate.componentsUnmatched,
      componentsMissingCost: result.aggregate.componentsMissingCost,
      deadStockValue90: result.aggregate.deadStockValue90,
      deadStockValue180: result.aggregate.deadStockValue180,
      overallTurnoverRatioAnnualized: result.aggregate.overallTurnoverRatioAnnualized,
    });
  } catch (err: any) {
    console.error("Aging/turnover snapshot run failed:", err);
    return NextResponse.json({ ok: false, error: err?.message ?? String(err) }, { status: 500 });
  }
}

// Vercel Cron sends GET requests. A POST handler is included too so the endpoint
// can be triggered manually (e.g. curl -X POST with the CRON_SECRET bearer token)
// for testing without waiting for the schedule.
export async function GET(req: NextRequest) {
  return handle(req);
}

export async function POST(req: NextRequest) {
  return handle(req);
}
