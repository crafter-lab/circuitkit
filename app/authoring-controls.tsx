"use client";

import { addStep, moveStep, removeStep } from "../src/editor.ts";
import { type FigureDocument, type SemanticTone, semanticTones } from "../src/schema.ts";

export default function AuthoringControls({
  document,
  edit,
}: {
  document: FigureDocument;
  edit: (update: (document: FigureDocument) => void) => void;
}) {
  const annotations = document.presentation.annotations;
  const steps = document.presentation.steps ?? [];
  return (
    <>
      <section
        className="control-section authoring-section min-w-0"
        aria-labelledby="annotations-heading"
      >
        <h2 id="annotations-heading">Annotations</h2>
        <label className="field">
          <span>Show net legend</span>
          <input
            type="checkbox"
            checked={annotations?.legend ?? false}
            onChange={(event) => {
              const checked = event.currentTarget.checked;
              edit((next) => {
                next.presentation.annotations ??= { nets: [], legend: false };
                next.presentation.annotations.legend = checked;
              });
            }}
          />
        </label>
        <label className="field">
          <span>Figure caption</span>
          <textarea
            className="authoring-textarea min-w-0"
            rows={3}
            value={annotations?.caption ?? ""}
            onChange={(event) => {
              const value = event.currentTarget.value;
              edit((next) => {
                next.presentation.annotations ??= { nets: [], legend: false };
                next.presentation.annotations.caption = value;
              });
            }}
          />
        </label>
        {annotations?.nets.map((annotation, index) => (
          <details className="inspector-disclosure" key={annotation.net}>
            <summary>Net annotation: {annotation.net}</summary>
            <label className="field">
              <span>{annotation.net} label</span>
              <input
                value={annotation.label}
                aria-describedby="diagnostics"
                onChange={(event) => {
                  const value = event.currentTarget.value;
                  edit((next) => {
                    const target = next.presentation.annotations?.nets[index];
                    if (target) target.label = value;
                  });
                }}
              />
            </label>
            <label className="field">
              <span>{annotation.net} description</span>
              <textarea
                className="authoring-textarea min-w-0"
                rows={3}
                value={annotation.description}
                onChange={(event) => {
                  const value = event.currentTarget.value;
                  edit((next) => {
                    const target = next.presentation.annotations?.nets[index];
                    if (target) target.description = value;
                  });
                }}
              />
            </label>
            <label className="field">
              <span>{annotation.net} tone</span>
              <select
                value={annotation.tone}
                onChange={(event) => {
                  const value = event.currentTarget.value as SemanticTone;
                  edit((next) => {
                    const target = next.presentation.annotations?.nets[index];
                    if (target) target.tone = value;
                  });
                }}
              >
                {semanticTones.map((tone) => (
                  <option key={tone} value={tone}>
                    {tone}
                  </option>
                ))}
              </select>
            </label>
            <button
              type="button"
              onClick={() =>
                edit((next) => {
                  next.presentation.annotations?.nets.splice(index, 1);
                })
              }
            >
              Remove {annotation.net} annotation
            </button>
          </details>
        ))}
        <fieldset className="focus-group">
          <legend>Add net annotation</legend>
          <div className="chips">
            {Object.keys(document.circuit.nets)
              .filter((net) => !annotations?.nets.some((item) => item.net === net))
              .map((net) => (
                <button
                  type="button"
                  key={net}
                  onClick={() =>
                    edit((next) => {
                      next.presentation.annotations ??= { nets: [], legend: true };
                      next.presentation.annotations.nets.push({
                        net,
                        label: net,
                        description: "",
                        tone: "blue",
                      });
                    })
                  }
                >
                  Annotate {net}
                </button>
              ))}
          </div>
        </fieldset>
      </section>
      <section
        className="control-section authoring-section min-w-0"
        aria-labelledby="steps-heading"
      >
        <h2 id="steps-heading">Explanation steps</h2>
        <p className="hint">Steps change focus, not the circuit. Manual focus clears the step.</p>
        <label className="field">
          <span>Current step</span>
          <select
            value={document.presentation.activeStep ?? ""}
            aria-describedby="diagnostics"
            onChange={(event) => {
              const value = event.currentTarget.value;
              edit((next) => {
                if (value) next.presentation.activeStep = value;
                else delete next.presentation.activeStep;
              });
            }}
          >
            <option value="">Authored focus (no step)</option>
            {document.presentation.activeStep &&
            !steps.some((step) => step.id === document.presentation.activeStep) ? (
              <option value={document.presentation.activeStep}>
                Unknown: {document.presentation.activeStep}
              </option>
            ) : null}
            {steps.map((step) => (
              <option key={step.id} value={step.id}>
                {step.title || step.id}
              </option>
            ))}
          </select>
        </label>
        {steps.map((step, index) => (
          <details
            className="inspector-disclosure"
            key={step.id}
            open={document.presentation.activeStep === step.id}
          >
            <summary>
              Step {index + 1}: {step.title || step.id}
            </summary>
            <label className="field">
              <span>Step {index + 1} title</span>
              <input
                value={step.title}
                aria-describedby="diagnostics"
                onChange={(event) => {
                  const value = event.currentTarget.value;
                  edit((next) => {
                    const target = next.presentation.steps?.[index];
                    if (target) target.title = value;
                  });
                }}
              />
            </label>
            <label className="field">
              <span>Step {index + 1} description</span>
              <textarea
                className="authoring-textarea min-w-0"
                rows={3}
                value={step.description}
                onChange={(event) => {
                  const value = event.currentTarget.value;
                  edit((next) => {
                    const target = next.presentation.steps?.[index];
                    if (target) target.description = value;
                  });
                }}
              />
            </label>
            {(["components", "nets"] as const).map((kind) => (
              <fieldset className="focus-group" key={kind}>
                <legend>
                  Step {index + 1} {kind}
                </legend>
                <div className="chips">
                  {[
                    ...new Set([...Object.keys(document.circuit[kind]), ...step.highlight[kind]]),
                  ].map((id) => {
                    const selected = step.highlight[kind].includes(id);
                    return (
                      <button
                        type="button"
                        key={id}
                        aria-pressed={selected}
                        onClick={() =>
                          edit((next) => {
                            const target = next.presentation.steps?.[index];
                            if (target)
                              target.highlight[kind] = selected
                                ? target.highlight[kind].filter((value) => value !== id)
                                : [...target.highlight[kind], id];
                          })
                        }
                      >
                        {id}
                        {Object.hasOwn(document.circuit[kind], id) ? "" : " (unknown, remove)"}
                      </button>
                    );
                  })}
                </div>
              </fieldset>
            ))}
            <div className="actions">
              <button
                type="button"
                aria-label={`Move step ${index + 1} up`}
                disabled={index === 0}
                onClick={() => edit((next) => moveStep(next, index, -1))}
              >
                Move up
              </button>
              <button
                type="button"
                aria-label={`Move step ${index + 1} down`}
                disabled={index === steps.length - 1}
                onClick={() => edit((next) => moveStep(next, index, 1))}
              >
                Move down
              </button>
              <button
                type="button"
                aria-label={`Remove step ${index + 1}`}
                onClick={() => edit((next) => removeStep(next, index))}
              >
                Remove step
              </button>
            </div>
          </details>
        ))}
        <button type="button" disabled={steps.length >= 32} onClick={() => edit(addStep)}>
          Add step
        </button>
        <p className="hint">
          {steps.length}/32 steps. Edit stable IDs in Source; invalid references stay visible.
        </p>
      </section>
    </>
  );
}
