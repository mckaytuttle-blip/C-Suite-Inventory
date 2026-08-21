"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";

const LINKS = [
  { href: "/", label: "Overview" },
  { href: "/in-stock", label: "In-Stock Rate" },
  { href: "/fill-rate", label: "Fill Rate" },
  { href: "/inventory-health", label: "Inventory Health" },
];

// Cross-links only — these open standalone pages hosted outside this app (GitHub
// Pages) in a new tab; no data from either is pulled into this dashboard. Grouped
// under one "Additional Views" dropdown rather than as separate top-level nav
// items, so the main nav doesn't grow a new pill every time another cross-linked
// view gets added — add future ones here.
const ADDITIONAL_VIEWS = [
  { href: "https://mckaytuttle-blip.github.io/Inventory-Accuracy/", label: "Inventory Accuracy" },
  { href: "https://mckaytuttle-blip.github.io/stat-io-dashboard/", label: "Assembly Availability" },
];

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
  const [viewsOpen, setViewsOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  // Close on outside click or Escape — a dropdown that only closes by re-clicking
  // its own trigger feels stuck, especially once a menu link opens a new tab and
  // focus never leaves this page.
  useEffect(() => {
    if (!viewsOpen) return;
    function handlePointerDown(e: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setViewsOpen(false);
      }
    }
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") setViewsOpen(false);
    }
    document.addEventListener("mousedown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("mousedown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [viewsOpen]);

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
        <div className="nav-dropdown" ref={dropdownRef}>
          <button
            type="button"
            className="nav-dropdown-trigger"
            aria-haspopup="menu"
            aria-expanded={viewsOpen}
            onClick={() => setViewsOpen((v) => !v)}
          >
            Additional Views
            <span className="chevron" aria-hidden="true">▼</span>
          </button>
          {viewsOpen && (
            <div className="nav-dropdown-menu" role="menu">
              {ADDITIONAL_VIEWS.map((view) => (
                <a
                  key={view.href}
                  href={view.href}
                  target="_blank"
                  rel="noopener noreferrer"
                  role="menuitem"
                  onClick={() => setViewsOpen(false)}
                >
                  {view.label} ↗
                </a>
              ))}
            </div>
          )}
        </div>
        {authStatus}
      </nav>
    </header>
  );
}
