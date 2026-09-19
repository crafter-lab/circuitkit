"use client";

import { useCallback, useEffect, useId, useMemo, useRef, useState } from "react";
import { CircuitLessonFigure } from "./lesson-figure.tsx";
import {
  renderSchematicSVG,
  renderSVG,
  resolveSchematicComposition,
  type SchematicComposition,
} from "./renderer.ts";
import type { FigureDocument } from "./schema.ts";
import type { Diagnostic, RenderResult } from "./types.ts";
import { validateDocument } from "./validation.ts";

export interface CircuitLessonSequenceProps {
  document: unknown;
  activeStep?: string | null;
  onActiveStepChange?: (activeStep: string | null, document: FigureDocument) => void;
  className?: string;
  onDiagnostics?: (diagnostics: Diagnostic[]) => void;
  download?: boolean;
  composition?: SchematicComposition;
}

export interface ResolveLessonSequenceOptions {
  composition?: SchematicComposition;
}

export function resolveLessonSequence(
  document: unknown,
  activeStep?: string | null,
  options: ResolveLessonSequenceOptions = {},
): RenderResult {
  if (
    options === null ||
    typeof options !== "object" ||
    Array.isArray(options) ||
    Reflect.ownKeys(options).some((key) => key !== "composition") ||
    (options.composition !== undefined &&
      options.composition !== "classic" &&
      options.composition !== "compact")
  )
    return {
      ok: false,
      diagnostics: [
        {
          code: "lesson.invalid_options",
          path: "/options",
          message: 'Expected only composition ("classic" or "compact").',
        },
      ],
    };
  const result = validateDocument(document);
  if (!result.ok) return result;
  const composition = resolveSchematicComposition(result.document, options.composition);
  const render =
    composition === "compact"
      ? (input: unknown) => renderSchematicSVG(input, { annotations: true, composition })
      : renderSVG;
  if (activeStep === undefined) return render(result.document);
  if (
    activeStep !== null &&
    !result.document.presentation.steps?.some(({ id }) => id === activeStep)
  ) {
    return {
      ok: false,
      diagnostics: [
        {
          code: "lesson.unknown_active_step",
          path: "/activeStep",
          message: `Unknown selected step: ${activeStep}. Choose a step in this circuit or null.`,
        },
      ],
    };
  }
  const { activeStep: _activeStep, ...presentation } = result.document.presentation;
  return render({
    ...result.document,
    presentation: { ...presentation, ...(activeStep === null ? {} : { activeStep }) },
  });
}

export function CircuitLessonSequence({
  document,
  activeStep,
  onActiveStepChange,
  className,
  onDiagnostics,
  download = false,
  composition,
}: CircuitLessonSequenceProps) {
  const id = useId();
  const figureId = `${id}-figure`;
  const descriptionId = `${id}-step-description`;
  const controlled = activeStep !== undefined;
  const [selection, setSelection] = useState<{
    document: unknown;
    controlled: boolean;
    activeStep: string | null | undefined;
  }>(() => ({ document, controlled, activeStep: undefined }));
  const reset = !Object.is(selection.document, document) || selection.controlled !== controlled;
  if (reset) setSelection({ document, controlled, activeStep: undefined });
  const selectedId = controlled ? activeStep : reset ? undefined : selection.activeStep;
  const result = useMemo(
    () => resolveLessonSequence(document, selectedId, { composition }),
    [document, selectedId, composition],
  );
  const [rejected, setRejected] = useState<{
    result: RenderResult;
    diagnostics: Diagnostic[];
  } | null>(null);
  const [childDiagnostics, setChildDiagnostics] = useState<{
    result: RenderResult;
    diagnostics: Diagnostic[];
  } | null>(null);
  const receiveChildDiagnostics = useCallback(
    (diagnostics: Diagnostic[]) => {
      setChildDiagnostics((previous) =>
        previous?.result === result &&
        JSON.stringify(previous.diagnostics) === JSON.stringify(diagnostics)
          ? previous
          : { result, diagnostics },
      );
    },
    [result],
  );
  const diagnostics = useMemo(
    () => [
      ...result.diagnostics,
      ...(rejected?.result === result ? rejected.diagnostics : []),
      ...(childDiagnostics?.result === result ? childDiagnostics.diagnostics : []),
    ],
    [result, rejected, childDiagnostics],
  );
  const lastReported = useRef<string | null>(null);
  useEffect(() => {
    const key = JSON.stringify(diagnostics);
    if (onDiagnostics && lastReported.current !== key) {
      lastReported.current = key;
      onDiagnostics(diagnostics);
    }
  }, [diagnostics, onDiagnostics]);
  const recovery = useMemo(
    () => (result.ok ? null : resolveLessonSequence(document, null, { composition })),
    [document, result, composition],
  );
  const interactive = !controlled || Boolean(onActiveStepChange);
  const request = (next: string | null) => {
    const candidate = resolveLessonSequence(document, next, { composition });
    if (!candidate.ok) {
      setRejected({ result, diagnostics: candidate.diagnostics });
      return;
    }
    setRejected(null);
    if (!controlled) setSelection({ document, controlled, activeStep: next });
    onActiveStepChange?.(next, candidate.document);
  };

  if (!result.ok) {
    return (
      <section className={className} aria-label="Teaching sequence">
        <div role="alert">
          <p>Figure unavailable. Correct the document or selected step to continue.</p>
          <ul>
            {result.diagnostics.map((diagnostic) => (
              <li key={JSON.stringify(diagnostic)}>
                <strong>{diagnostic.code}</strong> {diagnostic.path || "/"}: {diagnostic.message}
              </li>
            ))}
          </ul>
        </div>
        {recovery?.ok ? (
          <button type="button" disabled={!interactive} onClick={() => request(null)}>
            Show all
          </button>
        ) : null}
      </section>
    );
  }

  const steps = result.document.presentation.steps ?? [];
  const index = steps.findIndex(({ id }) => id === result.document.presentation.activeStep);
  const step = steps[index];

  return (
    <section
      className={["circuit-lesson-sequence", className].filter(Boolean).join(" ")}
      aria-label={`${result.document.presentation.title}: teaching sequence`}
      data-sequence-mode={interactive ? "interactive" : "read-only"}
    >
      {steps.length ? (
        <>
          <nav className="circuit-lesson-sequence-controls" aria-label="Teaching sequence controls">
            <button
              type="button"
              aria-controls={figureId}
              disabled={!interactive || index <= 0}
              onClick={() => request(steps[index - 1]?.id ?? null)}
            >
              Previous
            </button>
            <button
              type="button"
              aria-controls={figureId}
              disabled={!interactive || index >= steps.length - 1}
              onClick={() => request(steps[index + 1]?.id ?? null)}
            >
              Next
            </button>
            <button
              type="button"
              aria-controls={figureId}
              aria-pressed={!step}
              disabled={!interactive}
              onClick={() => request(null)}
            >
              Show all
            </button>
            <ol className="circuit-lesson-sequence-steps">
              {steps.map((entry, entryIndex) => (
                <li key={entry.id}>
                  <button
                    type="button"
                    aria-controls={figureId}
                    aria-current={entry.id === step?.id ? "step" : undefined}
                    disabled={!interactive}
                    onClick={() => request(entry.id)}
                  >
                    {entryIndex + 1}. {entry.title}
                  </button>
                </li>
              ))}
            </ol>
          </nav>
          <div
            className="circuit-lesson-sequence-description"
            id={descriptionId}
            role="status"
            aria-live="polite"
            aria-atomic="true"
          >
            {step ? (
              <>
                <p>
                  Step {index + 1} of {steps.length}: <strong>{step.title}</strong>
                </p>
                <p>{step.description}</p>
              </>
            ) : (
              <p>All steps shown. Authored figure highlights are restored. Choose Next to begin.</p>
            )}
          </div>
        </>
      ) : null}
      {rejected?.result === result ? (
        <div role="alert">
          <p>Step not selected. Choose another step or Show all.</p>
          <ul>
            {rejected.diagnostics.map((diagnostic) => (
              <li key={JSON.stringify(diagnostic)}>
                <strong>{diagnostic.code}</strong> {diagnostic.path || "/"}: {diagnostic.message}
              </li>
            ))}
          </ul>
        </div>
      ) : null}
      <div id={figureId} aria-describedby={steps.length ? descriptionId : undefined}>
        <CircuitLessonFigure
          document={result.document}
          layout="compact"
          composition={composition}
          notes={false}
          showDescription={false}
          download={download}
          onDiagnostics={receiveChildDiagnostics}
        />
      </div>
    </section>
  );
}
