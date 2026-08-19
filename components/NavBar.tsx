"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const LINKS = [
  { href: "/", label: "Overview" },
  { href: "/in-stock", label: "In-Stock Rate" },
  { href: "/fill-rate", label: "Fill Rate" },
  { href: "/inventory-health", label: "Inventory Health" },
];

// Cross-link only — it opens the Inventory Accuracy site in a new tab, no data
// from it is pulled into this dashboard.
const INVENTORY_ACCURACY_REPO_URL = "https://mckaytuttle-blip.github.io/Inventory-Accuracy/";

interface NavBarProps {
  // Rendered as-is at the end of the nav. This is a Server Component
  // (AuthStatus, which reads the session) handed down from the layout —
  // NavBar itself stays a Client Component (needed for usePathname), and
  // Server Components can be passed into Client Components as a prop/child
  // even though they can't be imported by one directly.
  authStatus?: React.ReactNode;
}

export default function NavBar({ authStatus }: NavBarProps) {
  const pathname = usePathname();

  return (
    <header className="topnav">
      <Link href="/" className="brand">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/stat logo white.png" alt="Stat" />
        <span>Inventory Dashboard</span>
      </Link>
      <nav>
        {LINKS.map((link) => {
          const isActive = link.href === "/" ? pathname === "/" : pathname.startsWith(link.href);
          return (
            <Link key={link.href} href={link.href} className={isActive ? "active" : ""}>
              {link.label}
            </Link>
          );
        })}
        <a href={INVENTORY_ACCURACY_REPO_URL} target="_blank" rel="noopener noreferrer">
          Inventory Accuracy ↗
        </a>
        {authStatus}
      </nav>
    </header>
  );
}
