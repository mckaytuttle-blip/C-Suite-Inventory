"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const LINKS = [
  { href: "/", label: "Overview" },
  { href: "/in-stock", label: "In-Stock Rate" },
  { href: "/fill-rate", label: "Fill Rate" },
  { href: "/inventory-health", label: "Inventory Health" },
];

// TODO: replace with the real inventory-accuracy repo URL. Cross-link only — it
// opens the repo in a new tab, no data from it is pulled into this dashboard.
const INVENTORY_ACCURACY_REPO_URL = "https://github.com/REPLACE-ME/inventory-accuracy";

export default function NavBar() {
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
      </nav>
    </header>
  );
}
