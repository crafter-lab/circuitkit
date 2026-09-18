"use client";

import { useMemo, useState } from "react";
import type { Diagnostic, ThemePreset } from "../../src/index.ts";
import { resolveLessonSequence } from "../../src/lesson-sequence.tsx";
import { CircuitLessonFigure, CircuitLessonSequence } from "../../src/react.tsx";
import { amplifierLesson, dividerLesson, rcLesson } from "./documents.ts";

export default function LessonClient() {
  const [theme, setTheme] = useState<ThemePreset>("geist-light");
  const [resistance, setResistance] = useState("10000");
  const [activeNet, setActiveNet] = useState<string | null>(null);
  const [amplifierNet, setAmplifierNet] = useState<string | null>(null);
  const [invalid, setInvalid] = useState(false);
  const [diagnostics, setDiagnostics] = useState<Diagnostic[]>([]);
  const divider = useMemo(
    () => dividerLesson(theme, invalid ? -1 : Number(resistance)),
    [theme, resistance, invalid],
  );
  const amplifier = useMemo(() => amplifierLesson(theme), [theme]);
  const rc = useMemo(() => rcLesson(theme), [theme]);
  const [showSequences, setShowSequences] = useState(false);
  const [sequenceSteps, setSequenceSteps] = useState<
    Record<"divider" | "rc" | "amplifier", string | null>
  >({
    divider: null,
    rc: null,
    amplifier: null,
  });
  const sequenceExamples = useMemo(
    () =>
      (
        [
          ["divider", divider],
          ["rc", rc],
          ["amplifier", amplifier],
        ] as const
      ).map(([id, document]) => {
        const selected = resolveLessonSequence(document, sequenceSteps[id]);
        return { id, document: selected.ok ? selected.document : document };
      }),
    [divider, rc, amplifier, sequenceSteps],
  );

  return (
    <>
      <section className="lesson-settings" aria-label="Host document controls">
        <label>
          Figure theme
          <select value={theme} onChange={(event) => setTheme(event.target.value as ThemePreset)}>
            <option value="geist-light">Light</option>
            <option value="geist-dark">Dark</option>
            <option value="geist-print">Print</option>
          </select>
        </label>
        <label>
          Divider R1 resistance (Ω)
          <input
            inputMode="decimal"
            type="text"
            value={resistance}
            onChange={(event) => setResistance(event.target.value)}
          />
        </label>
        <label className="lesson-qa">
          <input
            type="checkbox"
            checked={invalid}
            onChange={(event) => setInvalid(event.target.checked)}
          />
          Invalid divider document (QA)
        </label>
      </section>
      <section className="lesson-chapter" aria-labelledby="divider-heading">
        <div className="lesson-prose">
          <span className="eyebrow">01 / Follow a conductor</span>
          <h2 id="divider-heading">A node is more than a dot.</h2>
          <p>
            Follow each uninterrupted conductor. Every point on it belongs to the same electrical
            node, whether the drawing includes a dot there or not. A resistor sits between two
            different nodes.
          </p>
          <p>
            Start at VIN, cross R1 to the output, then cross R2 to the ground reference. These are
            three nodes, not three junction dots. VIN and VOUT are ports; no voltage source is
            hidden in this drawing.
          </p>
          <fieldset className="lesson-steps" aria-label="Divider lesson selection">
            <button
              type="button"
              aria-pressed={activeNet === null}
              onClick={() => setActiveNet(null)}
            >
              Show all
            </button>
            {divider.presentation.annotations?.nets.map(({ net, label }) => (
              <button
                key={net}
                type="button"
                aria-pressed={activeNet === net}
                onClick={() => setActiveNet(activeNet === net ? null : net)}
              >
                {label}
              </button>
            ))}
          </fieldset>
          <p className="lesson-aside">
            The host owns selection, theme and values. Hover or focus previews a node; the SVG
            download keeps only your saved selection.
          </p>
        </div>
        <div className="lesson-figure-column">
          <CircuitLessonFigure
            document={divider}
            activeNet={activeNet}
            onActiveNetChange={setActiveNet}
            onDiagnostics={setDiagnostics}
            download
          />
          {diagnostics.length ? (
            <p className="lesson-diagnostics">
              Host received: {diagnostics.map(({ code }) => code).join(", ")}. Restore a positive R1
              value and turn off QA to recover.
            </p>
          ) : null}
        </div>
      </section>
      <section className="lesson-chapter" aria-labelledby="amplifier-heading">
        <div className="lesson-prose">
          <span className="eyebrow">02 / Follow the feedback</span>
          <h2 id="amplifier-heading">Near ground is not wired to ground.</h2>
          <p>
            The summing node B connects the input resistor, feedback resistor and inverting input.
            The ground node D connects the noninverting input. There is no wire between B and D.
          </p>
          <p>
            “Virtual ground” describes an ideal operating condition under negative feedback, not an
            extra connection. Follow RF from C back to B and compare it with the separate supply
            nodes E and F.
          </p>
          <p className="lesson-aside">
            This second figure has its own selection. Changing it never changes the divider above.
            All six labels remain available by keyboard.
          </p>
        </div>
        <div className="lesson-figure-column">
          <CircuitLessonFigure
            document={amplifier}
            activeNet={amplifierNet}
            onActiveNetChange={setAmplifierNet}
            download
          />
        </div>
      </section>
      <section className="lesson-chapter" aria-labelledby="sequences-heading">
        <div className="lesson-prose">
          <span className="eyebrow">03 / Read at your own pace</span>
          <h2 id="sequences-heading">Three guided teaching sequences.</h2>
          <p>
            Explore a voltage divider, an RC low-pass filter and a feedback amplifier. Each authored
            step selects components and whole nets without changing the circuit. Previous, Next and
            Show all are manual controls, not a simulation or an animation.
          </p>
          <button
            type="button"
            aria-expanded={showSequences}
            aria-controls="lesson-sequences"
            onClick={() => setShowSequences((previous) => !previous)}
          >
            {showSequences ? "Hide teaching sequences" : "Open teaching sequences"}
          </button>
        </div>
        <div id="lesson-sequences" className="lesson-figure-column">
          {showSequences
            ? sequenceExamples.map(({ id, document }) => (
                <CircuitLessonSequence
                  key={id}
                  className={`lesson-sequence-${id}`}
                  document={document}
                  activeStep={sequenceSteps[id]}
                  onActiveStepChange={(_next, selectedDocument) =>
                    setSequenceSteps((previous) => ({
                      ...previous,
                      [id]: selectedDocument.presentation.activeStep ?? null,
                    }))
                  }
                  download
                />
              ))
            : null}
        </div>
      </section>
    </>
  );
}
