"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  applySource,
  changeNumber,
  changeSource,
  clearNumber,
  createEditor,
  type EditorState,
  editableDocument,
  evaluateEditor,
  pointerSegment,
  positiveNumber,
  updateDocument,
} from "../src/editor.ts";
import { type FigureDocument, getCatalog, loadExample } from "../src/index.ts";
import type { RecipeId, ThemePreset } from "../src/schema.ts";

const catalog = getCatalog();
const themeLabels = { "geist-light": "Light", "geist-dark": "Dark", "geist-print": "Print" };

export default function Playground({ initialDocument }: { initialDocument?: unknown } = {}) {
  const [state, setState] = useState(() => {
    const initial = createEditor(loadExample("rc-lowpass"));
    return initialDocument === undefined
      ? initial
      : applySource(changeSource(initial, JSON.stringify(initialDocument, null, 2)));
  });
  const [feedback, setFeedback] = useState("");
  const revision = useRef(0);
  const downloadURLs = useRef(new Set<string>());

  useEffect(() => {
    const urls = downloadURLs.current;
    function releaseDownloads() {
      for (const url of urls) URL.revokeObjectURL(url);
      urls.clear();
    }
    window.addEventListener("pagehide", releaseDownloads);
    return () => {
      window.removeEventListener("pagehide", releaseDownloads);
      releaseDownloads();
    };
  }, []);

  const document = editableDocument(state);
  const result = useMemo(() => evaluateEditor(state), [state]);
  const diagnostics = result.diagnostics;

  function change(update: (current: EditorState) => EditorState) {
    revision.current += 1;
    setFeedback("");
    setState(update);
  }

  function edit(update: (document: FigureDocument) => void) {
    change((current) => updateDocument(current, update));
  }

  function invalid(path: string) {
    return diagnostics.some((diagnostic) => diagnostic.path === path);
  }

  async function copyJSON() {
    if (!result.ok) return;
    const currentRevision = revision.current;
    try {
      await navigator.clipboard.writeText(JSON.stringify(result.document, null, 2));
      if (currentRevision === revision.current) setFeedback("Current document copied.");
    } catch {
      if (currentRevision === revision.current)
        setFeedback(
          "Clipboard unavailable or permission denied. Select and copy the JSON text manually.",
        );
    }
  }

  function downloadSVG() {
    if (!result.ok) return;
    let url: string | undefined;
    let link: HTMLAnchorElement | undefined;
    try {
      url = URL.createObjectURL(new Blob([result.svg], { type: "image/svg+xml;charset=utf-8" }));
      downloadURLs.current.add(url);
      link = window.document.createElement("a");
      link.href = url;
      link.download = `${result.document.layout.preset}.svg`;
      window.document.body.append(link);
      link.click();
      setFeedback("SVG download requested. Your browser chooses the final file destination.");
    } catch {
      if (url) {
        downloadURLs.current.delete(url);
        URL.revokeObjectURL(url);
      }
      setFeedback("SVG download failed. Try again in a browser that supports file downloads.");
    } finally {
      link?.remove();
    }
  }

  return (
    <div className="workbench">
      <aside className="sidebar" aria-label="Figure controls">
        <details className="controls-disclosure" open>
          <summary>
            Document controls <span aria-hidden="true">↕</span>
          </summary>
          <div className="controls-body">
            <label className="field">
              <span>Example</span>
              <select
                value={document?.layout.preset ?? ""}
                onChange={(event) => {
                  const value = event.currentTarget.value as RecipeId;
                  change(() => createEditor(loadExample(value)));
                }}
              >
                {!document ? (
                  <option value="" disabled>
                    Choose an example to reset
                  </option>
                ) : null}
                {catalog.recipes.map((recipe) => (
                  <option key={recipe.id} value={recipe.id}>
                    {recipe.title}
                  </option>
                ))}
              </select>
            </label>
            {!document ? (
              <p className="hint">
                Apply valid JSON to edit controls, or choose an example to replace the draft.
              </p>
            ) : null}
            {document ? (
              <>
                <section className="control-section" aria-labelledby="content-heading">
                  <h2 id="content-heading">
                    01 <span>Content</span>
                  </h2>
                  <label className="field">
                    <span>Figure title</span>
                    <input
                      value={document.presentation.title}
                      aria-invalid={invalid("/presentation/title")}
                      aria-describedby="diagnostics"
                      onChange={(event) => {
                        const value = event.currentTarget.value;
                        edit((next) => {
                          next.presentation.title = value;
                        });
                      }}
                    />
                  </label>
                  {Object.entries(document.circuit.components).map(([id, component]) => {
                    if (
                      component.type !== "resistor" &&
                      component.type !== "capacitor" &&
                      component.type !== "dc-source"
                    )
                      return null;
                    const field =
                      component.type === "resistor"
                        ? "resistance"
                        : component.type === "capacitor"
                          ? "capacitance"
                          : "voltage";
                    const value =
                      component.type === "resistor"
                        ? component.resistance
                        : component.type === "capacitor"
                          ? component.capacitance
                          : component.voltage;
                    const unit =
                      component.type === "resistor"
                        ? "Ω"
                        : component.type === "capacitor"
                          ? "F"
                          : "V";
                    const path = `/circuit/components/${pointerSegment(id)}/${field}`;
                    return (
                      <label className="field" key={id}>
                        <span>
                          {id} · {field} <span className="unit">{unit}</span>
                        </span>
                        <input
                          type="text"
                          inputMode="decimal"
                          value={state.inputs[path] ?? String(value)}
                          aria-invalid={invalid(path)}
                          aria-describedby="si-hint diagnostics"
                          onChange={(event) => {
                            const value = event.currentTarget.value;
                            change((current) =>
                              changeNumber(current, path, value, (next, number) => {
                                const target = next.circuit.components[id];
                                if (target?.type === "resistor") target.resistance = number;
                                else if (target?.type === "capacitor") target.capacitance = number;
                                else if (target?.type === "dc-source") target.voltage = number;
                              }),
                            );
                          }}
                        />
                      </label>
                    );
                  })}
                  <p className="hint" id="si-hint">
                    Positive SI numbers only. 10000 = 10 kΩ; 1e-7 = 100 nF. No unit suffixes.
                  </p>
                </section>
                <section className="control-section" aria-labelledby="theme-heading">
                  <h2 id="theme-heading">
                    02 <span>Presentation</span>
                  </h2>
                  <label className="field">
                    <span>Theme</span>
                    <select
                      value={document.presentation.theme.preset}
                      onChange={(event) => {
                        const value = event.currentTarget.value as ThemePreset;
                        edit((next) => {
                          next.presentation.theme.preset = value;
                        });
                      }}
                    >
                      {catalog.themes.presets.map((preset) => (
                        <option key={preset} value={preset}>
                          {themeLabels[preset]}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="field">
                    <span>
                      Accent override <span className="unit">HEX</span>
                    </span>
                    <input
                      placeholder="Preset default"
                      value={document.presentation.theme.overrides?.highlight ?? ""}
                      spellCheck={false}
                      aria-invalid={invalid("/presentation/theme/overrides/highlight")}
                      aria-describedby="diagnostics"
                      onChange={(event) => {
                        const value = event.currentTarget.value;
                        edit((next) => {
                          const overrides = { ...next.presentation.theme.overrides };
                          if (value === "") delete overrides.highlight;
                          else overrides.highlight = value;
                          next.presentation.theme.overrides = overrides;
                        });
                      }}
                    />
                  </label>
                  {(["strokeWidth", "fontScale"] as const).map((field) => {
                    const path = `/presentation/theme/overrides/${field}`;
                    return (
                      <div className="override-row" key={field}>
                        <label className="field">
                          <span>{field === "strokeWidth" ? "Stroke width" : "Font scale"}</span>
                          <input
                            type="text"
                            inputMode="decimal"
                            placeholder="Preset default"
                            value={
                              state.inputs[path] ??
                              document.presentation.theme.overrides?.[field] ??
                              ""
                            }
                            aria-invalid={invalid(path)}
                            aria-describedby="diagnostics override-hint"
                            onChange={(event) => {
                              const value = event.currentTarget.value;
                              change((current) =>
                                changeNumber(current, path, value, (next, number) => {
                                  next.presentation.theme.overrides = {
                                    ...next.presentation.theme.overrides,
                                    [field]: number,
                                  };
                                }),
                              );
                            }}
                          />
                        </label>
                        <button
                          type="button"
                          className="quiet reset"
                          aria-label={`Reset ${field === "strokeWidth" ? "stroke width" : "font scale"}`}
                          onClick={() =>
                            change((current) =>
                              clearNumber(current, path, (next) => {
                                delete next.presentation.theme.overrides?.[field];
                              }),
                            )
                          }
                        >
                          Reset
                        </button>
                      </div>
                    );
                  })}
                  <p className="hint" id="override-hint">
                    Overrides are checked by the renderer. Reset restores the preset; an emptied
                    numeric edit pauses export.
                  </p>
                </section>
                <section className="control-section" aria-labelledby="focus-heading">
                  <h2 id="focus-heading">
                    03 <span>Focus</span>
                  </h2>
                  {(["components", "nets"] as const).map((kind) => (
                    <fieldset className="focus-group" key={kind}>
                      <legend>{kind === "components" ? "Components" : "Nets"}</legend>
                      <div className="chips">
                        {Object.keys(document.circuit[kind]).map((id) => {
                          const selected =
                            document.presentation.highlight?.[kind].includes(id) ?? false;
                          return (
                            <button
                              key={id}
                              type="button"
                              aria-pressed={selected}
                              onClick={() =>
                                edit((next) => {
                                  const highlight = next.presentation.highlight ?? {
                                    components: [],
                                    nets: [],
                                  };
                                  highlight[kind] = selected
                                    ? highlight[kind].filter((value) => value !== id)
                                    : [...highlight[kind], id];
                                  next.presentation.highlight = highlight;
                                })
                              }
                            >
                              {id}
                            </button>
                          );
                        })}
                      </div>
                    </fieldset>
                  ))}
                  <button
                    type="button"
                    className="quiet"
                    onClick={() =>
                      edit((next) => {
                        next.presentation.highlight = { components: [], nets: [] };
                      })
                    }
                  >
                    Clear focus
                  </button>
                </section>
              </>
            ) : null}
          </div>
        </details>
      </aside>
      <div className="workspace">
        <div className="figure-toolbar">
          <span className="eyebrow">Live figure / SVG</span>
          <span className={`status ${result.ok ? "valid" : ""}`}>
            {result.ok ? "Ready to export" : state.pending ? "Unapplied draft" : "Needs correction"}
          </span>
        </div>
        <section className="figure-stage" aria-label="Current figure" tabIndex={0}>
          {result.ok ? (
            <div
              className={`figure-output ${result.bounds.width > 1000 ? "figure-output-complex" : ""}`}
              dangerouslySetInnerHTML={{ __html: result.svg }}
            />
          ) : (
            <div className="empty-state">
              <span className="eyebrow">No current figure</span>
              <h2>{state.pending ? "Apply your draft to continue." : "A correction is needed."}</h2>
              <p>The previous SVG has been removed. Nothing stale will be exported.</p>
            </div>
          )}
        </section>
        <div className="export-bar">
          <p>One document. The same SVG in the browser, React, and CLI.</p>
          <div className="actions">
            <button type="button" disabled={!result.ok} onClick={copyJSON}>
              Copy JSON
            </button>
            <button type="button" className="primary" disabled={!result.ok} onClick={downloadSVG}>
              Download SVG <span aria-hidden="true">↓</span>
            </button>
          </div>
        </div>
        <p className="feedback" role="status">
          {feedback}
        </p>
        <div
          id="diagnostics"
          aria-live="polite"
          aria-atomic="true"
          className={diagnostics.length ? "diagnostics" : ""}
        >
          {diagnostics.length ? (
            <>
              <h2>Document diagnostics</h2>
              <ul>
                {diagnostics.map((diagnostic) => (
                  <li key={JSON.stringify(diagnostic)}>
                    <code>{diagnostic.code}</code>
                    <span className="diagnostic-path">{diagnostic.path || "/"}</span>
                    <p>
                      {diagnostic.message}
                      {diagnostic.validPins
                        ? ` Valid pins: ${diagnostic.validPins.join(", ")}.`
                        : null}
                    </p>
                  </li>
                ))}
              </ul>
            </>
          ) : null}
        </div>
        <section className="source-section" aria-labelledby="source-heading">
          <div className="section-heading">
            <div>
              <span className="eyebrow">Source of truth</span>
              <h2 id="source-heading">Figure document</h2>
            </div>
            <button type="button" onClick={() => change(applySource)}>
              Apply JSON
            </button>
          </div>
          <label className="sr-only" htmlFor="json-source">
            Figure document JSON
          </label>
          <textarea
            id="json-source"
            value={state.draftText}
            spellCheck={false}
            autoCapitalize="off"
            autoCorrect="off"
            aria-describedby="source-hint diagnostics"
            aria-invalid={state.parseError}
            onChange={(event) => {
              const value = event.currentTarget.value;
              change((current) => changeSource(current, value));
            }}
          />
          <p className="hint" id="source-hint">
            Editing immediately pauses preview and export. Apply validates this exact text; invalid
            input stays here for correction. Selecting an example replaces the draft.
          </p>
          {Object.values(state.inputs).some((text) => positiveNumber(text) === null) ? (
            <p className="hint">
              A numeric control has an invalid draft. JSON still contains its last numeric value.
              Correct the control, or apply JSON to explicitly replace form edits.
            </p>
          ) : null}
        </section>
      </div>
    </div>
  );
}
