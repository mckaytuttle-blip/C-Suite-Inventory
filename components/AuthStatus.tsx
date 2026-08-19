// components/AuthStatus.tsx
// Server Component (no "use client") — reads the session directly and
// renders a "you@stat.io · Sign out" control. Passed into NavBar (a Client
// Component) as a prop from app/layout.tsx, since Server Components can be
// handed to Client Components as children/props but not imported by them
// directly.
//
// Inline styles rather than a globals.css class: keeps this component
// self-contained without needing to touch the shared stylesheet for one
// small nav-corner widget.
import { auth, signOut } from "@/auth";

export default async function AuthStatus() {
  const session = await auth();
  if (!session?.user) return null;

  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: 10,
        marginLeft: 16,
        fontSize: 13,
        color: "var(--muted, #8a8f98)",
      }}
    >
      <span title={session.user.email ?? undefined}>{session.user.email}</span>
      <form
        action={async () => {
          "use server";
          await signOut({ redirectTo: "/" });
        }}
      >
        <button
          type="submit"
          style={{
            background: "none",
            border: "none",
            padding: 0,
            font: "inherit",
            color: "inherit",
            textDecoration: "underline",
            cursor: "pointer",
          }}
        >
          Sign out
        </button>
      </form>
    </div>
  );
}
