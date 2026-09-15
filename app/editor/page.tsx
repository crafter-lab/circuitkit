import { notFound } from "next/navigation";
import { getCatalog, getSchema } from "../../src/index.ts";
import { getGalleryCase } from "../gallery/corpus.ts";
import Playground from "../playground.tsx";
import "../gallery/gallery.css";

export const metadata = {
  title: "Editor | CircuitKit",
  description: "Edit a circuit document, inspect its nodes, and export portable SVG locally.",
};

export default async function EditorPage({
  searchParams,
}: {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
} = {}) {
  const params = (await searchParams) ?? {};
  const entry = typeof params.case === "string" ? getGalleryCase(params.case) : undefined;
  if (params.case !== undefined && !entry) notFound();
  return (
    <>
      <a className="skip-link" href="#main">
        Skip to playground
      </a>
      <header className="site-header">
        <a className="wordmark" href="/">
          CircuitKit<span className="edition">Editor</span>
        </a>
        <span className="header-note">For explaining electronics.</span>
        <nav className="gallery-nav" aria-label="Main navigation">
          <a href="/editor" aria-current="page">
            Editor
          </a>
          <a href="/gallery">Gallery</a>
          <a href="/lesson">Lesson</a>
        </nav>
      </header>
      <main id="main">
        <div className="intro">
          <span className="eyebrow">A small instrument for clear ideas</span>
          <h1>Circuits, made legible.</h1>
          <p>
            {getCatalog().recipes.length} distinct circuit topologies. One editable document.
            Drawing, not simulation.
          </p>
          {entry ? (
            <p className="editor-origin">
              Editing a local copy of{" "}
              <a href={`/gallery/view?case=${encodeURIComponent(entry.id)}`}>
                {entry.title} · {entry.preset}
              </a>
              . The gallery source is unchanged.
            </p>
          ) : null}
        </div>
        <Playground key={entry?.id ?? "default"} initialDocument={entry?.document} />
        <section className="reference-section" aria-labelledby="reference-heading">
          <div>
            <span className="eyebrow">For authors & agents</span>
            <h2 id="reference-heading">The public contract</h2>
            <p>
              Discover the same schema and catalog through the local CLI. No accounts or generation
              service.
            </p>
          </div>
          <div className="reference-details">
            <details>
              <summary>Document JSON schema</summary>
              <pre>{JSON.stringify(getSchema(), null, 2)}</pre>
            </details>
            <details>
              <summary>Recipes, pins & SI parameters</summary>
              <pre>{JSON.stringify(getCatalog(), null, 2)}</pre>
            </details>
          </div>
        </section>
      </main>
      <footer className="site-footer">
        <span>CircuitKit · Circuit editor</span>
        <p>A drawing tool, not simulation, electrical-safety approval, or a fabrication system.</p>
      </footer>
    </>
  );
}
