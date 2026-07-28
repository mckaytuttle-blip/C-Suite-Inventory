/**
 * One-time (or periodically re-run) backfill: seeds historical `snapshot:{date}`
 * records from the manually-maintained STOCKOUT_LOG (lib/stockout-log.ts), so
 * In-Stock Rate has real data for days before the daily automation started.
 *
 * Assumption: the stockout log is a complete record of every stockout Stat's team
 * knows about. Any tracked component with no logged stockout on a given day is
 * assumed to have been in stock that day. Days that already have a *live* snapshot
 * (source: "live", written by the daily cron) are left untouched — backfill only
 * fills gaps, it never overwrites real data.
 *
 * Usage:
 *   npm run backfill                 # backfills the last 400 days
 *   npm run backfill -- --days=60    # backfills a custom window
 *
 * Requires the same env vars as production (ZOHO_* not needed here, only
 * UPSTASH_REDIS_REST_URL / UPSTASH_REDIS_REST_TOKEN) — put them in .env.local.
 */
import "dotenv/config";
import { TRACKED_COMPONENTS } from "../lib/components";
import { lastNDateKeys, rangeIncludes } from "../lib/dates";
import { STOCKOUT_LOG } from "../lib/stockout-log";
import { ComponentSnapshot, ComponentSnapshotEntry, getComponentSnapshot, saveComponentSnapshot } from "../lib/store";

function parseDaysArg(): number {
  const arg = process.argv.find((a) => a.startsWith("--days="));
  if (!arg) return 400;
  const n = parseInt(arg.split("=")[1], 10);
  return Number.isFinite(n) && n > 0 ? n : 400;
}

async function main() {
  const days = parseDaysArg();
  const dateKeys = lastNDateKeys(days);

  console.log(`Backfilling up to ${dateKeys.length} days (${dateKeys[0]} → ${dateKeys[dateKeys.length - 1]})...`);

  let written = 0;
  let skipped = 0;

  for (const date of dateKeys) {
    const existing = await getComponentSnapshot(date);
    if (existing && existing.source === "live") {
      skipped += 1;
      continue;
    }

    const components: Record<string, ComponentSnapshotEntry> = {};
    for (const tc of TRACKED_COMPONENTS) {
      const stockoutToday = STOCKOUT_LOG.some(
        (r) => r.item === tc.name && rangeIncludes(r.start, r.end, date)
      );
      components[tc.name] = {
        itemId: null,
        stockOnHand: null,
        availableStock: null,
        inStock: !stockoutToday,
        matched: true,
      };
    }

    const snapshot: ComponentSnapshot = {
      date,
      generatedAt: new Date().toISOString(),
      source: "backfill",
      components,
    };

    await saveComponentSnapshot(snapshot);
    written += 1;
  }

  console.log(`Done. Wrote ${written} backfill snapshots, skipped ${skipped} days that already had live data.`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
