const sourceURL = "https://github.com/crafter-lab/circuitkit";

export function SiteFooter() {
  return (
    <footer className="site-footer page-grid">
      <span>
        CircuitKit · By <a href="https://crafter.run">Crafter Lab</a>
      </span>
      <p>A drawing tool, not simulation, electrical-safety approval, or a fabrication system.</p>
      <nav aria-label="Project links">
        <a href={`${sourceURL}/blob/main/LICENSE`}>Apache-2.0</a>
        <a href={sourceURL}>Source on GitHub ↗</a>
      </nav>
    </footer>
  );
}
