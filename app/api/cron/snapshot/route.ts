import { NextRequest, NextResponse } from "next/server";
import { runDailySnapshot } from "@/lib/run-snapshot";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

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
    const result = await runDailySnapshot();
    return NextResponse.json({
      ok: true,
      date: result.componentSnapshot.date,
      componentsMatched: Object.values(result.componentSnapshot.components).filter(
        (c) => c.matched
      ).length,
      componentsTracked: Object.keys(result.componentSnapshot.components).length,
      fillRate: result.fillRateSummary.overallFillRate,
      orderCount: result.fillRateSummary.orderCount,
    });
  } catch (err: any) {
    console.error("Snapshot run failed:", err);
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
