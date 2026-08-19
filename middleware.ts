// middleware.ts
// Gates the human-facing dashboard pages behind the Google sign-in configured
// in auth.ts. Deliberately does NOT cover anything under /api:
//   - /api/cron/* is authenticated separately via CRON_SECRET and is called
//     by Vercel Cron, not a logged-in browser — gating it here would break
//     the daily snapshot/aging jobs.
//   - /api/kpis is intentionally callable by other consumers per the README
//     (Slack bot, etc.). Add it to the matcher below if you decide it should
//     require login too.
export { auth as middleware } from "@/auth";

export const config = {
  matcher: ["/", "/in-stock/:path*", "/fill-rate/:path*", "/inventory-health/:path*"],
};
