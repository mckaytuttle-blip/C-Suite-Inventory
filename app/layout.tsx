import type { Metadata } from "next";
import NavBar from "@/components/NavBar";
import Footer from "@/components/Footer";
import AuthStatus from "@/components/AuthStatus";
import "./globals.css";

export const metadata: Metadata = {
  title: "Stat CareOps — Inventory Dashboard",
  description: "Inventory KPIs, pulled live from data within Zoho Inventory.",
  icons: { icon: "/Stat S.png" },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <NavBar authStatus={<AuthStatus />} />
        {children}
        <Footer />
      </body>
    </html>
  );
}
