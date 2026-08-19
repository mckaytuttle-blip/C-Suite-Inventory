# Stat Medical — Inventory Dashboard

A Next.js dashboard for the C-suite showing live KPIs pulled from Zoho Inventory:

- **In-Stock Rate** — % of the trailing 30 days each of the ~83 tracked hardware
  components had available stock > 0 in Zoho. Backed by a daily snapshot (Zoho
  doesn't keep stock history itself, so this app builds its own). The detail page
  also shows **Committed vs. On-Hand** per component (On Hand − Available), using
  the same daily snapshot — no extra Zoho calls.
- **Fill Rate** — units shipped ÷ units ordered on customer sales orders dated in
  the trailing 30 days, both overall and broken out by product (assembly).
- **Inventory Turnover** — trailing 90-day COGS ÷ average inventory (at cost),
  annualized, for the 83 tracked components.
- **Aging / Dead Stock** — $ value at cost of tracked components with no sales/
  consumption movement in the trailing 90 or 180 days.

More KPIs can be added to this same project later — see "Next KPIs" below.

## Architecture

```
Vercel Cron (daily, 13:00 UTC) → /api/cron/snapshot → pulls Zoho → writes to Upstash Redis
Vercel Cron (daily, 14:00 UTC) → /api/cron/aging    → pulls Zoho → writes to Upstash Redis
Dashboard page (/)  → reads from Upstash Redis → renders KPIs
/api/kpis           → same data as JSON, for any other consumer (Slack bot, etc.)
```

`/api/cron/aging` is intentionally a separate job from `/api/cron/snapshot`: it does
a much heavier pull (the full composite bill-of-materials for every assembly, plus
sales order detail across a 180-day window, to attribute consumption down to leaf
components — see `lib/leaf-movement.ts` and `lib/bom.ts`) so a slow or rate-limited
Zoho response there can't hold up In-Stock Rate or Fill Rate, which only need the
fast daily pull. `vercel.json` in this project has both cron entries — if your real
repo's `vercel.json` differs, merge the `/api/cron/aging` entry into it manually.

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

### 4. Confirm the cron jobs

`vercel.json` schedules both `/api/cron/snapshot` (`0 13 * * *`, 13:00 UTC) and
`/api/cron/aging` (`0 14 * * *`, 14:00 UTC — an hour after, so they don't overlap).
Adjust the hours to whatever makes sense in your timezone; Vercel Cron always runs
in UTC. Vercel automatically reads `CRON_SECRET` and sends it as a Bearer token to
your cron routes, so no extra wiring is needed. Cron jobs are visible under the
project's **Cron Jobs** tab once deployed, including run history.

`/api/cron/aging` is set to `maxDuration = 300` in its route file, since a full
180-day sales history pull with BOM rolldown takes longer than the daily stock
snapshot. **Vercel's Hobby plan caps function duration at 60s** — if you're on
Hobby, either upgrade for this route or expect it to time out on orgs with a lot
of sales order volume (lower `maxDuration` won't help on Hobby; the ceiling itself
is 60s there).

### 5. Backfill history and run the first snapshots

Once deployed, the dashboard will say "waiting on the first snapshot" until data
exists. Two ways to seed the In-Stock/Fill Rate data:

**A. Trigger the live snapshot immediately** (recommended — do this right after
first deploy so you don't wait a full day for the first data point):

```bash
curl -X POST https://YOUR-DEPLOYMENT-URL/api/cron/snapshot \
  -H "Authorization: Bearer YOUR_CRON_SECRET"
curl -X POST https://YOUR-DEPLOYMENT-URL/api/cron/aging \
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

Note that Inventory Turnover's "average inventory" figure only uses *live* (not
backfilled) snapshot days, since the backfill only knows in-stock/out-of-stock,
not the actual on-hand quantity — so turnover accuracy will improve day by day as
real snapshots accumulate, independent of how much history the backfill seeds.

## Restricting access to the dashboard (Google sign-in)

The dashboard is gated behind Google sign-in via [Auth.js (NextAuth v5)](https://authjs.dev),
restricted to `@stat.io` emails — see `auth.ts` for the config and
`middleware.ts` for which routes it protects. The restriction is enforced
server-side in `auth.ts`'s `signIn` callback (it checks the verified email
Google returns), not just by hinting Google's account picker at the
`stat.io` domain, so it can't be bypassed by a non-Workspace Google account.

`middleware.ts` only protects the page routes (`/`, `/in-stock`,
`/fill-rate`, `/inventory-health`) — it deliberately leaves `/api/cron/*`
alone (those are authenticated separately via `CRON_SECRET` and are called
by Vercel Cron, not a logged-in browser) and `/api/kpis` alone (intended to
stay callable by other consumers, e.g. a Slack bot, per its original design).

### 1. Add the dependency

```bash
npm install next-auth@beta
```

### 2. Create a Google OAuth client

1. In [Google Cloud Console](https://console.cloud.google.com/apis/credentials),
   create (or reuse) a project, then **Create Credentials → OAuth client ID**
   → Application type **Web application**.
2. Under **Authorized redirect URIs**, add:
   - `https://YOUR-PRODUCTION-DOMAIN/api/auth/callback/google`
   - `http://localhost:3000/api/auth/callback/google` (for local dev)
3. Copy the generated **Client ID** and **Client secret**.

If Stat's Google Workspace admin restricts which OAuth apps employees can
consent to, this client may need to be allow-listed there first.

### 3. Set environment variables

In Vercel → Project Settings → Environment Variables (and in `.env.local`
for local dev), add:

| Variable | Value |
|---|---|
| `AUTH_GOOGLE_ID` | the OAuth Client ID from step 2 |
| `AUTH_GOOGLE_SECRET` | the OAuth Client secret from step 2 |
| `AUTH_SECRET` | random string — generate with `npx auth secret` (writes it to `.env.local` automatically) or `openssl rand -base64 33` |

Redeploy after adding the env vars. On Vercel, `AUTH_URL`/trusted-host
detection is automatic; it's only needed if the app is deployed somewhere
other than Vercel.

### 4. Try it

Visit any dashboard page while signed out — you'll be redirected to Google
sign-in. A `@stat.io` account lands back on the dashboard with their email
and a "Sign out" link in the top nav; any other account is rejected with
Auth.js's default "Access Denied" page.

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

## Inventory Turnover and Aging/Dead Stock — data requirements

Both KPIs need Zoho's `purchase_rate` field (standard/last purchase cost) on each
tracked item to convert units into dollars. Some items — especially very old ones,
or ones that have never actually been purchased through Zoho — can have this as 0
or unset. Those components still show up on `/inventory-health` (so nothing is
silently dropped), but their $ value and turnover ratio read as "—" until a cost is
entered in Zoho. The page flags how many components are affected.

"Movement" for both KPIs means a sales order line item, attributed down to leaf
components through the composite bill of materials (`lib/bom.ts`) — almost none of
the 83 tracked components are sold directly, they're consumed into assemblies. A
component that's purchased regularly but whose assemblies aren't selling will still
show as "dead stock" here, which is the intended framing (dead stock is about
capital tied up with no outbound movement, not about purchasing activity).

## Cross-links

The NavBar links out to the separate inventory-accuracy GitHub repo (cross-link
only, no data is pulled from it into this dashboard). Replace the placeholder URL
in `components/NavBar.tsx` (`INVENTORY_ACCURACY_REPO_URL`) with the real repo link.

## Next KPIs

This project is intentionally structured so more KPIs can be added without
rearchitecting:

- Add new fields to `ComponentSnapshot` / `FillRateSummary` / `InventoryHealthSummary`
  in `lib/store.ts`
- Compute them in `lib/run-snapshot.ts` (runs once daily via cron — put anything
  that needs a heavy Zoho pull on its own route/schedule, following the
  `/api/cron/aging` pattern, rather than adding to `/api/cron/snapshot`)
- Read + render them in `lib/kpis.ts` and the relevant `app/**/page.tsx`

Good next candidates given what's already wired up: overdue PO tracking (the v3
Slack monitor has this logic dormant and ready to port), coverage-days trend
charts, per-tier (A/B/C) In-Stock Rate rollups, and widening Aging/Turnover beyond
the 83 tracked components once the full-catalog review settles which additional
items are worth tracking long-term.
