import Link from "next/link";

export default function NotFound() {
  return (
    <main id="main">
      <section className="intro">
        <p className="eyebrow">404 / Not found</p>
        <h1>Page not found.</h1>
        <p>
          This page or circuit case is unavailable. Choose a figure from the gallery or start in the
          editor.
        </p>
        <nav className="not-found-links" aria-label="Recovery navigation">
          <Link href="/gallery">Explore gallery</Link>
          <Link href="/editor">Open editor</Link>
          <Link href="/">Back to CircuitKit</Link>
        </nav>
      </section>
    </main>
  );
}
