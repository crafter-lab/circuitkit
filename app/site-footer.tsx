import { SiteLogo } from "./site-logo.tsx";

const sourceURL = "https://github.com/crafter-lab/circuitkit";

export function SiteFooter() {
  return (
    <footer className="site-footer page-grid">
      <div className="site-footer-brand">
        <a href="/" aria-label="CircuitKit home">
          <SiteLogo />
        </a>
        <span>
          By <a href="https://crafter.run">Crafter Lab</a>
        </span>
      </div>
      <p>A drawing tool, not simulation, electrical-safety approval, or a fabrication system.</p>
      <nav aria-label="Project links">
        <a href="/brand-assets/index.html">Brand assets</a>
        <a href={`${sourceURL}/blob/main/LICENSE`}>Apache-2.0</a>
        <a href={sourceURL}>Source on GitHub ↗</a>
      </nav>
    </footer>
  );
}
