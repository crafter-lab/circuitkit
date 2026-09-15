import { notFound } from "next/navigation";
import { getCatalog, renderSVG } from "../../../src/index.ts";
import { getGalleryCase, getGalleryCases } from "../corpus.ts";
import "../gallery.css";

export const metadata = { title: "Figure detail | CircuitKit" };

export default async function FigurePage({
  searchParams,
}: {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = (await searchParams) ?? {};
  const entry = getGalleryCase(typeof params.case === "string" ? params.case : "");
  if (!entry) notFound();
  const result = renderSVG(entry.document);
  const catalog = getCatalog();
  const recipe = catalog.recipes.find(({ id }) => id === entry.recipe);
  const nets = result.ok ? Object.entries(result.circuit.nets) : [];
  const componentCount = result.ok ? Object.keys(result.circuit.components).length : 0;
  const portCount = result.ok ? Object.keys(result.circuit.ports).length : 0;
  const pinCount = result.ok
    ? Object.values(result.circuit.components).reduce(
        (sum, component) => sum + catalog.components[component.type].pins.length,
        0,
      )
    : 0;
  const endpointCount = nets.reduce((sum, [, endpoints]) => sum + endpoints.length, 0);
  const expectation = entry.expectation;
  const passed =
    expectation.kind === "render"
      ? result.ok
      : !result.ok && result.diagnostics.some(({ code }) => code === expectation.code);
  const query = new URLSearchParams({ group: entry.group });
  for (const key of ["group", "recipe", "theme", "q"]) {
    const value = params[key];
    if (typeof value === "string") query.set(key, value);
  }
  const category = getGalleryCases().filter((candidate) => candidate.group === entry.group);
  const index = category.findIndex((candidate) => candidate.id === entry.id);
  const previous = category[index - 1];
  const next = category[index + 1];
  const caseQuery = `case=${encodeURIComponent(entry.id)}`;
  return (
    <>
      <a className="skip-link" href="#main">
        Skip to figure
      </a>
      <header className="site-header">
        <a className="wordmark" href="/">
          CircuitKit<span className="edition">Gallery</span>
        </a>
        <nav className="gallery-nav" aria-label="Main navigation">
          <a href="/editor">Editor</a>
          <a href="/gallery">Gallery</a>
          <a href="/lesson">Lesson</a>
        </nav>
      </header>
      <main id="main" className="gallery-main gallery-detail">
        <div className="intro gallery-detail-intro">
          <a className="gallery-text-link" href={`/gallery?${query.toString()}#collection-heading`}>
            ← Back to collection
          </a>
          <div className="gallery-detail-kicker">
            <span className="eyebrow">
              {entry.group === "examples" ? "Example" : "Edge case"} / {entry.recipe} /{" "}
              {entry.preset}
            </span>
            <span className={`gallery-badge ${passed ? "is-pass" : "is-fail"}`}>
              {passed ? "Expectation matched" : "Unexpected result"}
            </span>
          </div>
          <h1>{entry.title}</h1>
          <p>{entry.description}</p>
          <div className="gallery-tags">
            {entry.tags.map((tag) => (
              <span key={tag}>{tag}</span>
            ))}
          </div>
        </div>
        <section className="gallery-detail-figure" aria-label="Actual renderer output">
          <div className="gallery-detail-toolbar">
            <span className="eyebrow">
              Actual core output / {result.ok ? "SVG" : "Structured rejection"}
            </span>
            <span className="gallery-case-id">{entry.id}</span>
          </div>
          {result.ok ? (
            <>
              <section
                className="gallery-figure-scroll"
                aria-label="Full-size circuit figure, scroll horizontally to inspect"
                tabIndex={0}
              >
                <div
                  className="gallery-full-svg"
                  dangerouslySetInnerHTML={{ __html: result.svg }}
                />
              </section>
              <p className="gallery-scroll-hint">
                Scroll horizontally on smaller screens to inspect legible nodes and labels. No
                simulation is performed.
              </p>
            </>
          ) : (
            <div className="gallery-detail-rejection">
              <span className="eyebrow">No SVG emitted</span>
              <h2>
                {passed
                  ? "This rejection is the correct result."
                  : "The renderer rejected this document."}
              </h2>
              <p>
                {passed
                  ? "The case deliberately exercises a diagnostic. Its expected rejection is a passing check, not a bug."
                  : "The actual outcome does not match the corpus expectation. Inspect the diagnostics and run the stress test for invariant checks."}
              </p>
              <a href="#case-diagnostics">Read {result.diagnostics.length} diagnostics below ↓</a>
            </div>
          )}
          <div className="gallery-detail-exports">
            <p>The original input stays intact, including invalid fields.</p>
            <div className="gallery-actions">
              <a className="gallery-button" href={`/editor?${caseQuery}#main`}>
                Open in editor
              </a>
              <a className="gallery-button" href={`/gallery/document?${caseQuery}`}>
                Download JSON
              </a>
              {result.ok ? (
                <a
                  className="gallery-button gallery-button-primary"
                  href={`/gallery/figure?${caseQuery}&download=1`}
                >
                  Download SVG ↓
                </a>
              ) : (
                <span className="gallery-export-unavailable">SVG export unavailable</span>
              )}
            </div>
          </div>
        </section>
        <section className="gallery-detail-info" aria-labelledby="outcome-heading">
          <div>
            <span className="eyebrow">Expected vs. actual</span>
            <h2 id="outcome-heading">An inspectable result.</h2>
            <p>
              These checks compare the renderer outcome with the declared case expectation. The
              stress test also checks determinism, geometry, and connectivity.
            </p>
          </div>
          <dl className="gallery-outcomes">
            <div>
              <dt>Expected</dt>
              <dd>
                {expectation.kind === "render" ? (
                  "Successful SVG render"
                ) : (
                  <>
                    <span>Diagnostic rejection</span>
                    <code>{expectation.code}</code>
                  </>
                )}
              </dd>
            </div>
            <div>
              <dt>Actual</dt>
              <dd>
                {result.ok ? "SVG rendered" : "Document rejected"}
                <span>{result.diagnostics.length} diagnostics</span>
              </dd>
            </div>
            <div>
              <dt>Case check</dt>
              <dd className={passed ? "is-pass" : "is-fail"}>
                {passed ? "Passed" : "Failed: unexpected outcome"}
              </dd>
            </div>
            <div>
              <dt>Recipe / theme</dt>
              <dd>
                {recipe?.title ?? entry.recipe}
                <span>{entry.preset}</span>
              </dd>
            </div>
          </dl>
        </section>
        <section className="gallery-connectivity" aria-labelledby="connectivity-heading">
          <div className="gallery-section-heading">
            <div>
              <span className="eyebrow">The circuit graph, not its drawing</span>
              <h2 id="connectivity-heading">Electrical nodes & connectivity</h2>
            </div>
          </div>
          {result.ok ? (
            <>
              <p className="gallery-connectivity-note">
                Each net is one electrical node: the named endpoints below are connected. Component
                pins and external ports are endpoints. These counts are not the number of geometric
                junction dots or wire bends. No voltages, currents, or simulation results are
                inferred.
              </p>
              <dl className="gallery-graph-counts">
                <div>
                  <dt>Components</dt>
                  <dd>{componentCount}</dd>
                </div>
                <div>
                  <dt>Electrical nodes / nets</dt>
                  <dd>{nets.length}</dd>
                </div>
                <div>
                  <dt>Component pins</dt>
                  <dd>{pinCount}</dd>
                </div>
                <div>
                  <dt>External ports</dt>
                  <dd>{portCount}</dd>
                </div>
                <div>
                  <dt>Connected endpoints</dt>
                  <dd>{endpointCount}</dd>
                </div>
              </dl>
              <section
                className="gallery-table-scroll"
                aria-label="Normalized net connectivity table"
                tabIndex={0}
              >
                <table className="gallery-net-table">
                  <caption>Electrical nodes from normalized circuit.nets</caption>
                  <thead>
                    <tr>
                      <th scope="col">Net / electrical node</th>
                      <th scope="col">Endpoints</th>
                      <th scope="col">Connected component pins and ports</th>
                    </tr>
                  </thead>
                  <tbody>
                    {nets.map(([id, endpoints]) => (
                      <tr key={id}>
                        <th scope="row">
                          <code>{id}</code>
                        </th>
                        <td>{endpoints.length}</td>
                        <td>
                          <ul>
                            {endpoints.map((endpoint) => (
                              <li key={endpoint}>
                                <code>{endpoint}</code>
                              </li>
                            ))}
                          </ul>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </section>
            </>
          ) : (
            <p className="gallery-connectivity-note">
              Normalized connectivity is unavailable because the renderer rejected this source.
              Inspect its diagnostics and original JSON rather than treating invalid endpoint
              membership as a valid graph.
            </p>
          )}
        </section>
        <section
          id="case-diagnostics"
          className="gallery-detail-diagnostics"
          aria-labelledby="diagnostics-heading"
        >
          <div className="gallery-section-heading">
            <div>
              <span className="eyebrow">Structured feedback</span>
              <h2 id="diagnostics-heading">Diagnostics / {result.diagnostics.length}</h2>
            </div>
          </div>
          {result.diagnostics.length ? (
            <ul>
              {result.diagnostics.map((diagnostic) => (
                <li key={JSON.stringify(diagnostic)}>
                  <code>{diagnostic.code}</code>
                  <p>{diagnostic.message}</p>
                  <dl>
                    <div>
                      <dt>JSON pointer</dt>
                      <dd>
                        <code>{diagnostic.path || '"" (document root)'}</code>
                      </dd>
                    </div>
                    {diagnostic.validPins ? (
                      <div>
                        <dt>Valid pins</dt>
                        <dd>{diagnostic.validPins.join(", ")}</dd>
                      </div>
                    ) : null}
                  </dl>
                </li>
              ))}
            </ul>
          ) : (
            <p className="gallery-clean-result">
              No diagnostics. The renderer accepted this source and produced the figure above.
            </p>
          )}
        </section>
        <section className="gallery-source" aria-label="Case source and result details">
          <details>
            <summary>Original figure document · JSON</summary>
            <pre>{JSON.stringify(entry.document, null, 2)}</pre>
          </details>
          <details>
            <summary>Expected outcome & actual diagnostics · JSON</summary>
            <pre>
              {JSON.stringify(
                {
                  id: entry.id,
                  expectation,
                  actual: { ok: result.ok, diagnostics: result.diagnostics },
                  passed,
                },
                null,
                2,
              )}
            </pre>
          </details>
          {result.ok ? (
            <details>
              <summary>Rendered bounds & renderer version · JSON</summary>
              <pre>
                {JSON.stringify(
                  { rendererVersion: result.rendererVersion, bounds: result.bounds },
                  null,
                  2,
                )}
              </pre>
            </details>
          ) : null}
        </section>
        <nav className="gallery-case-navigation" aria-label="More cases in the same category">
          {previous ? (
            <a href={`/gallery/view?case=${encodeURIComponent(previous.id)}&${query.toString()}`}>
              <span className="eyebrow">
                ← Previous {entry.group === "examples" ? "example" : "edge case"}
              </span>
              <strong>{previous.title}</strong>
              <span>{previous.preset}</span>
            </a>
          ) : (
            <span>First case in this category</span>
          )}
          {next ? (
            <a href={`/gallery/view?case=${encodeURIComponent(next.id)}&${query.toString()}`}>
              <span className="eyebrow">
                Next {entry.group === "examples" ? "example" : "edge case"} →
              </span>
              <strong>{next.title}</strong>
              <span>{next.preset}</span>
            </a>
          ) : (
            <span>Last case in this category</span>
          )}
        </nav>
      </main>
      <footer className="site-footer">
        <span>CircuitKit · Circuit gallery</span>
        <p>A drawing tool, not simulation, electrical-safety approval, or a fabrication system.</p>
      </footer>
    </>
  );
}
