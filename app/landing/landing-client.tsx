"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { CircuitLessonFigure, resolveLessonFigure } from "../../src/lesson-figure.tsx";
import { CircuitSchematic } from "../../src/react.tsx";
import type { FigureDocument } from "../../src/schema.ts";
import { encodeShareDocument } from "../../src/share.ts";
import { dividerLesson } from "../lesson/documents.ts";
import { useSiteTheme } from "../theme-provider.tsx";

export function LandingFigure() {
  const { theme, mounted } = useSiteTheme();
  const [activeNet, setActiveNet] = useState<string | null>(null);
  const document = useMemo(() => dividerLesson(`geist-${theme}`, 10000), [theme]);

  return (
    <LandingFigurePreview
      document={document}
      activeNet={activeNet}
      onActiveNetChange={setActiveNet}
      mounted={mounted}
    />
  );
}

export function LandingFigurePreview({
  document,
  activeNet,
  onActiveNetChange,
  mounted,
  initialMode = "schematic",
}: {
  document: FigureDocument;
  activeNet: string | null;
  onActiveNetChange: (net: string | null) => void;
  mounted: boolean;
  initialMode?: "schematic" | "interactive";
}) {
  const [mode, setMode] = useState(initialMode);
  const persisted = useMemo(() => resolveLessonFigure(document, activeNet), [document, activeNet]);
  const share = useMemo(
    () =>
      persisted.ok
        ? encodeShareDocument(persisted.document, {
            view: mode === "schematic" ? "schematic" : "annotated",
          })
        : persisted,
    [persisted, mode],
  );

  return (
    <div
      className="landing-preview auto-theme-figure"
      data-theme-ready={mounted}
      data-preview-mode={mode}
    >
      <div className="landing-preview-heading">
        <span>01 / Voltage divider</span>
        <fieldset className="landing-preview-modes" aria-label="Figure preview mode">
          <button
            type="button"
            aria-pressed={mode === "schematic"}
            onClick={() => setMode("schematic")}
          >
            Schematic
          </button>
          <button
            type="button"
            aria-pressed={mode === "interactive"}
            onClick={() => setMode("interactive")}
          >
            Interactive
          </button>
        </fieldset>
        {share.ok ? (
          <Link
            className="landing-preview-edit"
            href={`/editor${share.hash}`}
            prefetch={false}
            title="Keeps your saved selection and figure theme, not a hover or focus preview"
          >
            Edit this figure
          </Link>
        ) : null}
      </div>
      {persisted.ok ? (
        mode === "schematic" ? (
          <CircuitSchematic document={persisted.document} className="landing-schematic" />
        ) : (
          <CircuitLessonFigure
            document={document}
            activeNet={activeNet}
            onActiveNetChange={onActiveNetChange}
            layout="compact"
          />
        )
      ) : null}
      {!share.ok ? (
        <p role="alert">
          Editor link unavailable. {share.diagnostics.map(({ message }) => message).join(" ")}
        </p>
      ) : null}
    </div>
  );
}
