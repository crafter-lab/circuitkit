import Link from "next/link";
import { renderCircuitSource } from "../../src/language/index.ts";
import { renderEducationalSVG } from "../../src/v2/render.ts";
import { focusPreview } from "../preview-figure.ts";
import { StructuredData } from "../structured-data.tsx";
import { type DocSlug, docsCatalog, docURL, readDocumentation } from "./catalog.ts";
import { renderDocumentation } from "./markdown.tsx";
import "./docs.css";

export default async function DocsPage({ slug }: { slug: DocSlug }) {
  const page = docsCatalog[slug];
  const source = await readDocumentation(slug);
  const rendered = await renderDocumentation(source);
  const entries = Object.entries(docsCatalog) as [DocSlug, (typeof docsCatalog)[DocSlug]][];
  const groups = [...new Set(entries.map(([, entry]) => entry.group))];
  const index = entries.findIndex(([key]) => key === slug);
  const next = entries[index + 1];
  let preview: Extract<ReturnType<typeof renderEducationalSVG>, { ok: true }> | undefined;
  if (slug === "quickstart" && rendered.circuit?.type === "code") {
    const compiled = renderCircuitSource(rendered.circuit.value);
    if (!compiled.ok) throw new Error("The documented quickstart must compile");
    const image = renderEducationalSVG(focusPreview(compiled.figure));
    if (!image.ok) throw new Error("The documented quickstart preview must render");
    preview = image;
  }
  return (
    <main id="main" className="docs-page">
      <StructuredData
        value={{
          "@type": "TechArticle",
          headline: page.title,
          description: page.description,
          url: `https://circuitkit.crafter.ing${docURL(slug)}`,
          inLanguage: "en",
        }}
      />
      <aside className="docs-sidebar" aria-label="Documentation navigation">
        <nav aria-label="Documentation">
          {groups.map((group) => (
            <div key={group}>
              <p className="docs-nav-group">{group}</p>
              {entries
                .filter(([, entry]) => entry.group === group)
                .map(([key, entry]) => (
                  <Link
                    key={key}
                    href={docURL(key)}
                    prefetch={false}
                    aria-current={key === slug ? "page" : undefined}
                  >
                    {entry.title}
                  </Link>
                ))}
            </div>
          ))}
        </nav>
      </aside>
      <article className="docs-article">
        <header className="docs-intro">
          <p className="docs-eyebrow">Documentation / {page.group}</p>
          <h1>{page.title}</h1>
          <p className="docs-lead">{page.description}</p>
          <div className="docs-utilities">
            <a href={`/docs/${slug}.md`}>View as Markdown ↗</a>
            <Link href="/editor?mode=circuitkit" prefetch={false}>
              Open playground ↗
            </Link>
          </div>
        </header>
        {preview ? (
          <figure className="docs-preview">
            <img
              src={`data:image/svg+xml,${encodeURIComponent(preview.svg)}`}
              width={preview.bounds.width}
              height={preview.bounds.height}
              alt="Controller SDA and SCL connected to the sensor's matching ports"
            />
            <figcaption>
              This is the image you will create. Only the declared sensor signals are shown.
            </figcaption>
          </figure>
        ) : null}
        <div className="docs-prose">{rendered.content}</div>
        {next ? (
          <Link className="docs-next" href={docURL(next[0])} prefetch={false}>
            <span>Next</span>
            {next[1].title} →
          </Link>
        ) : null}
      </article>
      <aside className="docs-toc" aria-label="Page contents">
        <nav aria-label="On this page">
          <p className="docs-nav-group">On this page</p>
          {rendered.headings.map((heading) => (
            <a key={heading.id} href={`#${heading.id}`}>
              {heading.label}
            </a>
          ))}
        </nav>
      </aside>
    </main>
  );
}
