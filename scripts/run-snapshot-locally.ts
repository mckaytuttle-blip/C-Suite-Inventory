/**
 * Manually trigger the same snapshot logic the daily cron runs, from your own
 * machine. Useful for testing before the Vercel Cron schedule kicks in, or for
 * backfilling "today" immediately after first deploy.
 *
 * Requires ZOHO_* and UPSTASH_* env vars — put them in .env.local.
 *
 * Usage: npm run snapshot:local
 */
import "dotenv/config";
import { runDailySnapshot } from "../lib/run-snapshot";

async function main() {
  console.log("Running daily snapshot (component stock + fill rate)...");
  const result = await runDailySnapshot();

  const matched = Object.values(result.componentSnapshot.components).filter((c) => c.matched).length;
  const total = Object.keys(result.componentSnapshot.components).length;

  console.log(`Component snapshot for ${result.componentSnapshot.date}: ${matched}/${total} tracked components matched in Zoho.`);
  console.log(
    `Fill rate (${result.fillRateSummary.windowStart} → ${result.fillRateSummary.windowEnd}): ` +
      `${result.fillRateSummary.overallFillRate !== null ? (result.fillRateSummary.overallFillRate * 100).toFixed(1) + "%" : "n/a"} ` +
      `across ${result.fillRateSummary.orderCount} sales orders.`
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
