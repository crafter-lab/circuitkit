import { memo, useMemo, useState } from "react";
import { CircuitLessonFigure } from "../../src/lesson-figure.tsx";
import { CircuitLessonSequence } from "../../src/lesson-sequence.tsx";
import { renderSchematicSVG } from "../../src/renderer.ts";
import type { FigureDocument } from "../../src/schema.ts";
import {
  type PreviewData,
  type PreviewInput,
  type PreviewLesson,
  recipes,
  type Theme,
  themes,
} from "./model.ts";

const Schematic = memo(function Schematic({ input }: { input: PreviewInput }) {
  const result = useMemo(() => renderSchematicSVG(input.document), [input.document]);
  return (
    <section className="recipe" aria-labelledby={`${input.recipe}-title`}>
      <header>
        <h2 id={`${input.recipe}-title`}>{input.recipe}</h2>
        <p className="source">
          Source: <a href={input.copy}>{input.source}</a>
        </p>
        <p className="hash">Input SHA-256: {input.sha256}</p>
      </header>
      <figure className="schematic-panel">
        <figcaption>
          {result.ok ? (
            <span>
              {result.bounds.width.toFixed(1)} × {result.bounds.height.toFixed(1)} SVG units
            </span>
          ) : null}
        </figcaption>
        {result.ok ? (
          <section
            className="svg-scroll"
            tabIndex={0}
            aria-label={`${input.recipe} schematic`}
            dangerouslySetInnerHTML={{ __html: result.svg }}
          />
        ) : (
          <pre role="alert">{JSON.stringify(result.diagnostics, null, 2)}</pre>
        )}
        <nav aria-label={`${input.recipe} downloads`}>
          <a href={`${input.recipe}-${input.theme}-compact.svg`} download>
            Download SVG
          </a>
          <a href={`${input.recipe}-${input.theme}-compact.png`} download>
            Download PNG · 2×
          </a>
        </nav>
      </figure>
    </section>
  );
});

const Lesson = memo(function Lesson({ lesson, theme }: { lesson: PreviewLesson; theme: Theme }) {
  const [activeNet, setActiveNet] = useState<string | null>(null);
  const document = useMemo<FigureDocument>(
    () => ({
      ...lesson.document,
      presentation: { ...lesson.document.presentation, theme: { preset: theme } },
    }),
    [lesson.document, theme],
  );
  return (
    <section className="lesson">
      <h3>{lesson.document.presentation.title}</h3>
      <p className="source">
        Authored annotations and steps: <a href={lesson.copy}>{lesson.source}</a>. Only the preview
        theme changes.
      </p>
      <p className="hash">Source SHA-256: {lesson.sha256}</p>
      <h4>Interactive selection</h4>
      <p>
        Point to or tap a wire. Focus the diagram and use arrow keys, Enter to select, Escape to
        clear.
      </p>
      <CircuitLessonFigure
        document={document}
        activeNet={activeNet}
        onActiveNetChange={setActiveNet}
      />
      <p role="status" aria-live="polite">
        Saved selection: {activeNet ?? "none"}
      </p>
      <h4>Authored teaching sequence</h4>
      <CircuitLessonSequence document={document} />
    </section>
  );
});

export function App({ data }: { data: PreviewData }) {
  const [theme, setTheme] = useState<Theme>("geist-light");
  return (
    <main data-theme={theme}>
      <div className="page">
        <header className="page-header">
          <p className="eyebrow">CircuitKit · local preview</p>
          <h1>Circuit schematics</h1>
          <p>
            Three circuits rendered with the default schematic API. Download SVG or PNG, select a
            wire, or follow an authored lesson.
          </p>
          <details>
            <summary>Source provenance</summary>
            <p className="hash">Git HEAD: {data.gitCommit}</p>
            <p className="hash">Working source SHA-256: {data.sourceSha256}</p>
            <a href="manifest.json">Manifest and CLI receipts</a>
          </details>
          <fieldset className="theme-picker">
            <legend>Preview theme</legend>
            {themes.map((value) => (
              <label key={value}>
                <input
                  type="radio"
                  name="theme"
                  value={value}
                  checked={theme === value}
                  onChange={() => setTheme(value)}
                />
                {value.replace("geist-", "")}
              </label>
            ))}
          </fieldset>
        </header>
        <div className="schematics">
          {recipes.map((recipe) => {
            const input = data.inputs.find(
              (entry) => entry.recipe === recipe && entry.theme === theme,
            );
            return input ? (
              <Schematic key={recipe} input={input} />
            ) : (
              <p role="alert" key={recipe}>
                Missing input: {recipe}/{theme}
              </p>
            );
          })}
        </div>
        <section aria-labelledby="lessons-title" className="lessons">
          <h2 id="lessons-title">Interactive lessons</h2>
          <p>
            Explore net selection and teaching steps using the existing lesson components and their
            default rendering.
          </p>
          {data.lessons.map((lesson) => (
            <Lesson key={lesson.source} lesson={lesson} theme={theme} />
          ))}
        </section>
        <footer>
          Connectivity illustrations, not simulation or electrical-safety verification. Local
          artifacts only.
        </footer>
      </div>
    </main>
  );
}
