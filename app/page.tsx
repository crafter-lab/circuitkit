import { getCatalog } from "../src/index.ts";
import { LandingFigure } from "./landing/landing-client.tsx";
import "./landing/landing.css";

const sourceURL = "https://github.com/crafter-lab/circuitkit";

export default async function Page({
  searchParams,
}: {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
} = {}) {
  const params = (await searchParams) ?? {};
  if (params.case !== undefined) {
    const { default: EditorPage } = await import("./editor/page.tsx");
    return EditorPage({ searchParams: Promise.resolve(params) });
  }
  const recipes = getCatalog().recipes;

  return (
    <div className="landing">
      <main id="main" className="landing-main landing-grid">
        <section className="landing-hero" aria-labelledby="hero-heading">
          <div className="landing-introduction">
            <p className="landing-eyebrow">A small toolkit for explaining electronics</p>
            <h1 id="hero-heading">Circuit diagrams that explain themselves.</h1>
            <p className="landing-lead">
              Make the connections the lesson. Turn a circuit document into an interactive figure,
              follow each electrical node, and take a clear SVG wherever you teach.
            </p>
            <div className="landing-actions">
              <a className="landing-button landing-primary" href="/editor">
                Open editor
              </a>
              <a className="landing-button" href="/gallery">
                Explore gallery
              </a>
            </div>
            <p className="landing-helper">
              Try it in your browser. No account or generation service.
            </p>
            <a className="landing-text-link" href="/lesson">
              Learn to read the nodes →
            </a>
            <div className="landing-hero-note">
              <span className="landing-eyebrow">Start with a connection, not a calculation</span>
              <p>
                A node is the whole conductor, not just a dot. Select A, B, or C in the figure to
                see what is connected and what the resistors separate.
              </p>
            </div>
          </div>
          <LandingFigure />
        </section>

        <section className="landing-values" aria-label="Why CircuitKit">
          <article>
            <span className="landing-eyebrow">01 / Explain</span>
            <h2>Nodes with meaning.</h2>
            <p>
              Link real electrical nets to labels and explanations. Hover and keyboard focus preview
              a connection; selection keeps it in view.
            </p>
          </article>
          <article>
            <span className="landing-eyebrow">02 / Take it with you</span>
            <h2>Portable by design.</h2>
            <p>
              Export SVG with its annotations, legend, and caption. Use the same document in a React
              lesson or render it from the command line.
            </p>
          </article>
          <article>
            <span className="landing-eyebrow">03 / Stay local</span>
            <h2>A contract for your tools.</h2>
            <p>
              A versioned JSON schema, discoverable catalog, and structured diagnostics give authors
              and agents the same local interface. No remote generation required.
            </p>
          </article>
        </section>

        <section className="landing-section landing-catalog" aria-labelledby="catalog-heading">
          <div className="landing-section-heading">
            <div>
              <p className="landing-eyebrow">The topology collection</p>
              <h2 id="catalog-heading">{recipes.length} topologies. Real connections.</h2>
            </div>
            <a className="landing-button" href="/gallery">
              Browse the gallery
            </a>
          </div>
          <p className="landing-section-description">
            From a first voltage divider to branches, bridges, and feedback. These are distinct
            circuit graphs, not a count of color or value variations.
          </p>
          <ul className="landing-topologies">
            {recipes.map(({ id, title }, index) => (
              <li key={id}>
                <a href={`/gallery?recipe=${encodeURIComponent(id)}`}>
                  <span className="landing-topology-number">
                    {String(index + 1).padStart(2, "0")}
                  </span>
                  <span>{title}</span>
                  <span aria-hidden="true">↗</span>
                </a>
              </li>
            ))}
          </ul>
          <p className="landing-helper">
            Curated, role-based layouts. Not an arbitrary circuit autorouter or a simulator.
          </p>
        </section>

        <section className="landing-section landing-developer" aria-labelledby="code-heading">
          <div>
            <p className="landing-eyebrow">One document, multiple surfaces</p>
            <h2 id="code-heading">
              Small enough to understand.
              <br />
              Yours to build on.
            </h2>
            <p>
              Start with a catalog example, edit its values and presentation, then render it. The
              core returns either SVG or actionable diagnostics, not a guess at your circuit.
            </p>
            <p>
              For interactive lessons, <code>CircuitLessonFigure</code> from{" "}
              <code>circuitkit/react</code> links the diagram and legend. Your React app owns
              selection.
            </p>
            <a className="landing-text-link" href={`${sourceURL}#readme`}>
              Read the source documentation →
            </a>
          </div>
          <div className="landing-code-panel">
            <div className="landing-panel-label">A first figure / TypeScript</div>
            <section
              className="landing-code-scroll"
              tabIndex={0}
              aria-label="Render a circuit with the CircuitKit core"
            >
              <pre>
                <code>
                  <span className="syntax-keyword">import</span>
                  {" { loadExample, renderSVG } "}
                  <span className="syntax-keyword">from</span>{" "}
                  <span className="syntax-string">{'"circuitkit"'}</span>
                  {";\n\n"}
                  <span className="syntax-keyword">const</span>
                  {" document = "}
                  <span className="syntax-function">loadExample</span>
                  {"("}
                  <span className="syntax-string">{'"voltage-divider"'}</span>
                  {");\n"}
                  <span className="syntax-keyword">const</span>
                  {" result = "}
                  <span className="syntax-function">renderSVG</span>
                  {"(document);\n\n"}
                  <span className="syntax-keyword">if</span>
                  {" (result.ok) {\n  console."}
                  <span className="syntax-function">log</span>
                  {"(result.svg);\n} "}
                  <span className="syntax-keyword">else</span>
                  {" {\n  console."}
                  <span className="syntax-function">error</span>
                  {"(result.diagnostics);\n}"}
                </code>
              </pre>
            </section>
          </div>
        </section>

        <section className="landing-section landing-start" aria-labelledby="start-heading">
          <div>
            <p className="landing-eyebrow">Build from source</p>
            <h2 id="start-heading">Get started locally.</h2>
            <p>
              CircuitKit is not published to npm. Clone the source and build the library and CLI
              with Bun. Run <code>bun run dev</code> to open this app locally.
            </p>
            <p className="landing-helper">
              The import example assumes the built package is installed in your project from a local
              tarball. There is no registry install command yet.
            </p>
          </div>
          <div className="landing-code-panel">
            <div className="landing-panel-label">From the repository / Terminal</div>
            <section
              className="landing-code-scroll"
              tabIndex={0}
              aria-label="Build CircuitKit from source"
            >
              <pre>
                <code>
                  <span className="syntax-function">git clone</span>
                  {" https://github.com/crafter-lab/circuitkit\n"}
                  <span className="syntax-function">cd</span>
                  {" circuitkit\n"}
                  <span className="syntax-function">bun install</span>
                  {"\n"}
                  <span className="syntax-function">bun run build</span>
                </code>
              </pre>
            </section>
          </div>
        </section>

        <aside className="landing-limits" aria-label="CircuitKit limitations">
          <h2>A drawing tool, not a simulation.</h2>
          <p>
            CircuitKit explains connectivity. It does not calculate voltages or currents, certify
            electrical safety, or produce fabrication files. Check your engineering independently.
          </p>
        </aside>
      </main>
    </div>
  );
}
