import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Stat Medical — Inventory Dashboard",
  description: "In-Stock Rate & Fill Rate KPIs, pulled live from Zoho Inventory.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
