"use client";

import { useEffect, useMemo } from "react";
import { type Diagnostic, type FigureDocument, renderSVG } from "./index.ts";

export { CircuitLessonFigure, type CircuitLessonFigureProps } from "./lesson-figure.tsx";

export interface CircuitFigureProps {
  document: FigureDocument | unknown;
  className?: string;
  onDiagnostics?: (diagnostics: Diagnostic[]) => void;
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
