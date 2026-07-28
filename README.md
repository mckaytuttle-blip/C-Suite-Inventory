# Stat Medical — Inventory Dashboard

A Next.js dashboard for the C-suite showing two live KPIs pulled from Zoho Inventory:

- **In-Stock Rate** — % of the trailing 30 days each of the ~83 tracked hardware
  components had available stock > 0 in Zoho. Backed by a daily snapshot (Zoho
  doesn't keep stock history itself, so this app builds its own).
- **Fill Rate** — units shipped ÷ units ordered on customer sales orders dated in
  the trailing 30 days, both overall and broken out by product (assembly).

More KPIs (overdue POs, coverage days, etc.) can be added to this same project later —
this first build focuses on getting the pipeline (Zoho → snapshot store → dashboard)
solid.

## Architecture

```
Vercel Cron (daily) → /api/cron/snapshot → pulls Zoho → writes to Upstash Redis
Dashboard page (/)  → reads from Upstash Redis → renders KPIs
/api/kpis           → same data as JSON, for any other consumer (Slack bot, etc.)
```

Zoho credentials are used **only** in server-side code (`lib/zoho.ts`, called from
API routes) — they are never sent to the browser. The dashboard itself reads
pre-computed data from Redis, so page loads don't call Zoho at all and can't get
rate-limited by traffic.

Why a separate data store at all? Zoho Inventory's API only reports *current*
stock levels — it has no "what was on hand on July 3rd" endpoint. To compute a
real 30-day In-Stock Rate, something has to record stock levels every day and
keep the history. That's what the Upstash Redis store + daily cron job do here.

## One-time setup

### 1. Create the Vercel project

```
cd stat-inventory-dashboard
git init && git add -A && git commit -m "Initial commit"
```

Push this to a new GitHub repo, then import it in Vercel (vercel.com → Add New →
Project → import the repo). Framework preset will auto-detect Next.js.

### 2. Add Upstash Redis storage

In the Vercel project → **Storage** tab → **Create Database** → **Upstash** →
**Redis**. Connect it to this project — Vercel will automatically add
`UPSTASH_REDIS_REST_URL` and `UPSTASH_REDIS_REST_TOKEN` (or `KV_REST_API_URL` /
`KV_REST_API_TOKEN` depending on integration version — if you get the `KV_*`
names, either rename them to `UPSTASH_REDIS_REST_URL`/`UPSTASH_REDIS_REST_TOKEN`
in Project Settings → Environment Variables, or update the two `process.env`
lookups in `lib/store.ts`) to the project's environment variables.

Alternatively, create a free database directly at upstash.com and paste its
REST URL/token into Vercel's Environment Variables manually — same result.

### 3. Set the remaining environment variables

In Vercel → Project Settings → Environment Variables, add:

| Variable | Value |
|---|---|
| `ZOHO_CLIENT_ID` | from your Zoho API console |
| `ZOHO_CLIENT_SECRET` | from your Zoho API console |
| `ZOHO_REFRESH_TOKEN` | from your Zoho API console |
| `ZOHO_ORG_ID` | `851436427` |
| `CRON_SECRET` | any random string, e.g. generate with `openssl rand -hex 32` |

Redeploy after adding env vars (Vercel does this automatically on env var changes
if you trigger a redeploy from the dashboard).

### 4. Confirm the cron job

`vercel.json` already schedules `/api/cron/snapshot` for `0 13 * * *` (13:00 UTC —
adjust to whatever hour makes sense in your timezone; Vercel Cron always runs in
UTC). Vercel automatically reads `CRON_SECRET` and sends it as a Bearer token to
your cron routes, so no extra wiring is needed. Cron jobs are visible under the
project's **Cron Jobs** tab once deployed, including run history.

### 5. Backfill history and run the first snapshot

Once deployed, the dashboard will say "waiting on the first snapshot" until data
exists. Two ways to seed it:

**A. Trigger the live snapshot immediately** (recommended — do this right after
first deploy so you don't wait a full day for the first data point):

```bash
curl -X POST https://YOUR-DEPLOYMENT-URL/api/cron/snapshot \
  -H "Authorization: Bearer YOUR_CRON_SECRET"
```

**B. Backfill historical data from the stockout log** (run locally, requires
`UPSTASH_REDIS_REST_URL`/`UPSTASH_REDIS_REST_TOKEN` in a local `.env.local`):

```bash
npm install
npm run backfill            # seeds ~400 days of history from lib/stockout-log.ts
```

This assumes `lib/stockout-log.ts` is a complete record of known stockouts —
any tracked component with no logged stockout on a given day is assumed to have
been in stock. It only fills in days that don't already have a live snapshot, so
it's always safe to re-run.

## Local development

```bash
npm install
cp .env.example .env.local   # fill in real values
npm run dev                  # http://localhost:3000
npm run snapshot:local       # manually run the daily pull once, for testing
```

## Updating the tracked component list

Edit `lib/components.ts` — it's a plain array, no separate config file to keep in
sync. Matching against Zoho item names is whitespace/case/punctuation-tolerant
(see `normalizeName`), so minor naming drift in Zoho won't break matching, but the
underlying item name still needs to be recognizably the same.

## Updating the stockout log

`lib/stockout-log.ts` mirrors "2026 Inventory Updates - Updated Weekly -
Stockouts.pdf". When that log is updated, update this file to match and re-run
`npm run backfill` — it only touches days that don't already have live data, so
it's safe to run repeatedly.

## Next KPIs

This project is intentionally structured so more KPIs can be added without
rearchitecting:

- Add new fields to `ComponentSnapshot` / `FillRateSummary` in `lib/store.ts`
- Compute them in `lib/run-snapshot.ts` (runs once daily via cron)
- Read + render them in `lib/kpis.ts` and `app/page.tsx`

Good next candidates given what's already wired up: overdue PO tracking (the v3
Slack monitor has this logic dormant and ready to port), coverage-days trend
charts, and per-tier (A/B/C) In-Stock Rate rollups.
