// Single shared footer rendered once from app/layout.tsx, so it appears at the
// bottom of every page (Overview, In-Stock, Fill Rate) without each page needing
// its own <footer> block. Replaced the old per-page methodology text — the Fill
// Rate page's OTIF info-icon tooltip already covers that level of detail now.
export default function Footer() {
  const year = new Date().getFullYear();
  return (
    <footer className="site-footer">
      <span className="site-footer-brand">Stat</span>
      <span className="site-footer-copyright">
        &copy; {year} Stat. All rights reserved.
      </span>
    </footer>
  );
}
