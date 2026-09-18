"use client";

import { useEffect, useMemo } from "react";
import { renderSchematicSVG, renderSVG } from "./renderer.ts";
import type { FigureDocument } from "./schema.ts";
import type { Diagnostic } from "./types.ts";

export { CircuitLessonFigure, type CircuitLessonFigureProps } from "./lesson-figure.tsx";
export { CircuitLessonSequence, type CircuitLessonSequenceProps } from "./lesson-sequence.tsx";

export interface CircuitFigureProps {
  document: FigureDocument | unknown;
  className?: string;
  onDiagnostics?: (diagnostics: Diagnostic[]) => void;
}

export interface CircuitSchematicProps {
  document: unknown;
  className?: string;
  onDiagnostics?: (diagnostics: Diagnostic[]) => void;
}

export function CircuitSchematic({ document, className, onDiagnostics }: CircuitSchematicProps) {
  const result = useMemo(() => renderSchematicSVG(document), [document]);

  useEffect(() => {
    onDiagnostics?.(result.diagnostics);
  }, [result, onDiagnostics]);

  if (!result.ok) return null;

  return (
    <div
      className={className}
      style={{ minWidth: 0, maxWidth: "100%" }}
      dangerouslySetInnerHTML={{
        __html: result.svg.replace(
          "<svg ",
          '<svg style="display:block;max-width:100%;height:auto" ',
        ),
      }}
    />
  );
}

export function CircuitFigure({ document, className, onDiagnostics }: CircuitFigureProps) {
  const result = useMemo(() => renderSVG(document), [document]);

  useEffect(() => {
    onDiagnostics?.(result.diagnostics);
  }, [result, onDiagnostics]);

  if (!result.ok) {
    return (
      <div className={className} role="alert">
        <p>Figure unavailable. Correct the document to continue.</p>
        <ul>
          {result.diagnostics.map((diagnostic) => (
            <li key={JSON.stringify(diagnostic)}>
              <strong>{diagnostic.code}</strong> {diagnostic.path || "/"}: {diagnostic.message}
              {diagnostic.validPins ? ` Valid pins: ${diagnostic.validPins.join(", ")}.` : null}
            </li>
          ))}
        </ul>
      </div>
    );
  }

  return <div className={className} dangerouslySetInnerHTML={{ __html: result.svg }} />;
}
