"use client";

import { useEffect, useMemo } from "react";
import {
  renderSchematicSVG,
  renderSVG,
  resolveSchematicComposition,
  type SchematicComposition,
} from "./renderer.ts";
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
  composition?: SchematicComposition;
  className?: string;
  onDiagnostics?: (diagnostics: Diagnostic[]) => void;
}

export function CircuitSchematic({
  document,
  composition,
  className,
  onDiagnostics,
}: CircuitSchematicProps) {
  const result = useMemo(
    () => renderSchematicSVG(document, composition === undefined ? {} : { composition }),
    [document, composition],
  );

  useEffect(() => {
    onDiagnostics?.(result.diagnostics);
  }, [result, onDiagnostics]);

  if (!result.ok) return null;
  const compact = resolveSchematicComposition(result.document, composition) === "compact";

  return (
    <div
      className={className}
      style={{
        minWidth: 0,
        maxWidth: "100%",
        overflowX: compact ? "auto" : undefined,
      }}
      dangerouslySetInnerHTML={{
        __html: result.svg.replace(
          "<svg ",
          compact
            ? `<svg style="display:block;max-width:100%;height:auto;min-width:${result.bounds.width * 0.75}px" `
            : '<svg style="display:block;max-width:100%;height:auto" ',
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
