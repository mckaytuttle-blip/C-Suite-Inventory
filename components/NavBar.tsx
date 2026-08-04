"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const LINKS = [
  { href: "/", label: "Overview" },
  { href: "/in-stock", label: "In-Stock Rate" },
  { href: "/fill-rate", label: "Fill Rate" },
];

export default function NavBar() {
  const pathname = usePathname();

  return (
    <header className="topnav">
      <Link href="/" className="brand">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/stat logo.png" alt="Stat" />
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
      </nav>
    </header>
  );
}
