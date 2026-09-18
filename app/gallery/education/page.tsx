import Link from "next/link";
import { notFound } from "next/navigation";
import {
  examples,
  parseSelection,
  type Search,
  selectionQuery,
  stages,
  themes,
} from "../../education/catalog.ts";
import { publicAdapterExamples, publicExample } from "../../education/examples.ts";
import { GalleryFigure } from "../../education/gallery-figure.tsx";
import { HostContent } from "../../education/host-content.tsx";
import "../../education/education.css";

export const metadata = {
  title: "Education gallery | CircuitKit",
  description:
    "All 12 typed engine panel kinds and 18 generic adapter family demonstrations, separate from local corpus acceptance.",
};
export default async function EducationGalleryPage({
  searchParams,
}: {
  searchParams?: Promise<Search>;
} = {}) {
  const selection = parseSelection((await searchParams) ?? {});
  if (!selection) notFound();
  const adapters = publicAdapterExamples(selection.stage, selection.theme);
  return (
    <main id="main" className="education-page">
      <div className="education-intro">
        <p className="education-eyebrow">Education engine v2 / Capability gallery</p>
        <h1>Beyond nine compatibility recipes.</h1>
        <p>
          Every typed engine family, plus generic demonstrations of all 18 Gradual adapter families.
          These examples are derived from the public engine fixtures, not the private 344-source
          corpus. Drawing, not simulation; not a universal circuit solver.
        </p>
        <nav className="education-links" aria-label="Gallery destinations">
          <Link
            className="education-primary"
            href={`/editor/education?${selectionQuery(selection)}`}
            prefetch={false}
          >
            Open v2 editor
          </Link>
          <Link
            href={`/editor/education?${selectionQuery({ case: "named-nets", stage: "teaching", theme: selection.theme })}`}
            prefetch={false}
          >
            Try whole-net selection
          </Link>
          <Link href="/gallery" prefetch={false}>
            Legacy gallery compatibility
          </Link>
          <Link href="/gallery/education/local" prefetch={false}>
            Local corpus coverage and original comparison
          </Link>
        </nav>
      </div>
      <form
        className="education-toolbar"
        action="/gallery/education"
        method="get"
        aria-label="Gallery stage and theme"
      >
        <input type="hidden" name="case" value={selection.case} />
        <label htmlFor="gallery-stage">
          Gallery stage
          <select id="gallery-stage" name="stage" defaultValue={selection.stage}>
            {stages.map((stage) => (
              <option key={stage}>{stage}</option>
            ))}
          </select>
        </label>
        <label htmlFor="gallery-theme">
          Gallery figure theme
          <select id="gallery-theme" name="theme" defaultValue={selection.theme}>
            {themes.map((theme) => (
              <option key={theme}>{theme}</option>
            ))}
          </select>
        </label>
        <button type="submit">Apply to all examples</button>
      </form>
      <p className="education-note">
        Only {selection.stage} projections are delivered. This public demo permits every stage; a
        production assessment host must authorize stages before projection. Targets are allowlisted
        semantic parts or explicitly approved net groups, never automatically exposed connectivity.
        The whole-net demo publishes group members only in teaching and correction. Publishing those
        members can reveal connectivity answers; a hidden highlight is not privacy.
      </p>
      <section aria-labelledby="engine-families">
        <h2 id="engine-families">12 typed panels / {examples.length} public cases</h2>
        <div className="education-gallery-grid">
          {examples.map((entry) => (
            <article
              key={entry.id}
              className="education-card"
              data-family={entry.family}
              data-selected={entry.id === selection.case}
            >
              <div className="education-card-heading">
                <span className="education-eyebrow">
                  {entry.family} / {selection.stage} / {selection.theme.replace("geist-", "")}
                </span>
                <h3>{entry.title}</h3>
                <p>{entry.detail}</p>
              </div>
              <GalleryFigure document={publicExample({ ...selection, case: entry.id })} />
              <nav className="education-links" aria-label={`${entry.title} actions`}>
                <Link
                  href={`/editor/education?${selectionQuery({ ...selection, case: entry.id })}`}
                  prefetch={false}
                >
                  Edit public figure
                </Link>
                <Link
                  href={`/gallery/education?${selectionQuery({ ...selection, case: entry.id })}`}
                  aria-current={entry.id === selection.case ? "true" : undefined}
                  prefetch={false}
                >
                  {entry.id === selection.case ? "Selected case" : "Select case"}
                </Link>
              </nav>
            </article>
          ))}
        </div>
      </section>
      <section aria-labelledby="adapter-families">
        <h2 id="adapter-families">18 adapter families / generic public examples</h2>
        <p className="education-note">
          Typed geometry and typed host captions, notes and records. Records are host composition,
          not native SVG panels. No original-renderer screenshot equivalence or corpus acceptance is
          claimed here.
        </p>
        <div className="education-gallery-grid">
          {adapters.map((entry) => (
            <article
              key={entry.family}
              className="education-card"
              data-adapter-family={entry.family}
            >
              <div className="education-card-heading">
                <h3>{entry.family}</h3>
                <p>
                  {selection.stage} · {selection.theme} ·{" "}
                  {entry.document ? "Projected geometry + host content" : "Host record, no figure"}
                </p>
              </div>
              {entry.document ? <GalleryFigure document={entry.document} /> : null}
              <HostContent host={entry.host} />
            </article>
          ))}
        </div>
      </section>
      <section className="education-intro" aria-labelledby="capability-boundaries">
        <h2 id="capability-boundaries">Explicit capabilities, explicit limits.</h2>
        <p>
          Electrical graphs support six symbols, intentional opens and bypasses; measurements are
          ideal non-loading overlays. Signals support samples, transitions, edges, windows and
          explicit debounce. Scalar derivations require assumptions. Unknown identities remain
          unknown. No transient simulation, inferred connectivity targets or automatic answer
          recovery.
        </p>
        <p>
          Empty stages now project successfully without a placeholder image. Records remain typed
          host tables, not native panels. Source-unit scales and bounded operators including ≥
          render natively. Reading columns and rows use measured glyph spacing. Unsupported
          characters still fail closed, and panel-to-panel placement remains the author’s
          responsibility.
        </p>
        <Link href="/gallery/education/local" prefetch={false}>
          Separate local corpus acceptance and original comparison
        </Link>
      </section>
    </main>
  );
}
