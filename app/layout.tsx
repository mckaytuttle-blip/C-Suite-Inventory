import type { Metadata } from "next";
import NavBar from "@/components/NavBar";
import "./globals.css";

export const metadata: Metadata = {
  title: "Stat Medical — Inventory Dashboard",
  description: "In-Stock Rate & Fill Rate KPIs, pulled live from Zoho Inventory.",
  icons: { icon: "/stat logo.png" },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <NavBar />
        {children}
      </body>
    </html>
  );
}
