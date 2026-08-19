// auth.ts
// Auth.js (NextAuth v5) config. Gates the dashboard behind Google sign-in,
// restricted to Stat's own email domain — see the `signIn` callback below.
import NextAuth from "next-auth";
import Google from "next-auth/providers/google";

// Only accounts with an email ending in "@stat.io" are allowed in. Change
// this if the company domain is ever different from stat.io.
const ALLOWED_EMAIL_DOMAIN = "stat.io";

export const { handlers, signIn, signOut, auth } = NextAuth({
  providers: [
    Google({
      // Nudges Google's account picker to only offer stat.io Workspace
      // accounts. This is a UX convenience, NOT the security boundary —
      // `hd` is a request param a client could omit or alter, so it must
      // never be trusted as the sole gate. The `signIn` callback below is
      // what actually enforces the restriction, server-side, on every
      // login attempt regardless of what the client sent.
      authorization: { params: { hd: ALLOWED_EMAIL_DOMAIN } },
    }),
  ],
  callbacks: {
    // The real access control. Runs server-side after Google confirms the
    // user's identity but before a session is created — returning false
    // rejects the sign-in outright (Auth.js sends them to its built-in
    // "Access Denied" page).
    signIn({ profile }) {
      const email = profile?.email?.toLowerCase() ?? "";
      return email.endsWith(`@${ALLOWED_EMAIL_DOMAIN}`);
    },
    // Used by middleware.ts to decide whether a page request may proceed.
    // Any signed-in user (they already passed the signIn check above) is
    // authorized; everyone else gets redirected to sign in.
    authorized({ auth }) {
      return !!auth?.user;
    },
  },
});
