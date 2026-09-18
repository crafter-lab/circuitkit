"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { getCatalog, loadExample } from "../src/catalog.ts";
import {
  applyMarkdownSource,
  applySource,
  changeNumber,
  changeSource,
  changeSourceMode,
  clearNumber,
  createEditor,
  documentMarkdown,
  type EditorState,
  editableDocument,
  evaluateEditor,
  loadShare,
  pointerSegment,
  positiveNumber,
  selectMarkdownFigure,
  updateDocument,
} from "../src/editor.ts";
import type { FigureDocument, RecipeId, ThemePreset } from "../src/schema.ts";
import { encodeShareDocument } from "../src/share.ts";
import AuthoringControls from "./authoring-controls.tsx";
import { deliverPNG, downloadBlob, pngDimensions, rasterizeFigurePNG } from "./browser-export.ts";
import { moveTimeline, newTimeline, pushTimeline } from "./editor-history.ts";
import CodeEditor from "./source-editor.tsx";

const catalog = getCatalog();
const themeLabels = { "geist-light": "Light", "geist-dark": "Dark", "geist-print": "Print" };

export default function Playground({ initialDocument }: { initialDocument?: unknown } = {}) {
  const [timeline, setTimeline] = useState(() => {
    const initial = createEditor(loadExample("rc-lowpass"));
    return newTimeline(
      initialDocument === undefined
        ? initial
        : applySource(changeSource(initial, JSON.stringify(initialDocument, null, 2))),
    );
  });
  const state = timeline.present;
  const [zoom, setZoom] = useState("fit");
  const [feedback, setFeedback] = useState("");
  const [fragmentReady, setFragmentReady] = useState(false);
  const [scale, setScale] = useState(1);
  const [pngBusy, setPNGBusy] = useState(false);
  const [markdownBusy, setMarkdownBusy] = useState(false);
  const [panel, setPanel] = useState<"Circuit" | "Style" | "Explain" | "Source">(() =>
    state.controls ? "Circuit" : "Source",
  );
  const exportSummary = useRef<HTMLElement | null>(null);
  const revision = useRef(0);
  const exportTask = useRef<AbortController | null>(null);
  const downloads = useRef(new Set<() => void>());

  useEffect(() => {
    const releases = downloads.current;
    function invalidate() {
      revision.current += 1;
      exportTask.current?.abort();
      setPNGBusy(false);
      setMarkdownBusy(false);
      setFeedback("");
      for (const release of releases) release();
      releases.clear();
    }
    let previousHash = "";
    let skipReturnHash: string | null = null;
    function readFragment() {
      const hash = window.location.hash;
      const prior = previousHash;
      previousHash = hash;
      if (hash === "#main") {
        skipReturnHash = prior;
      } else if (prior === "#main" && hash === skipReturnHash) {
        skipReturnHash = null;
      } else {
        invalidate();
        setTimeline((current) => newTimeline(loadShare(current.present, hash)));
      }
      setFragmentReady(true);
    }
    if (window.location.hash) readFragment();
    else setFragmentReady(true);
    window.addEventListener("hashchange", readFragment);
    window.addEventListener("pagehide", invalidate);
    return () => {
      window.removeEventListener("hashchange", readFragment);
      window.removeEventListener("pagehide", invalidate);
      revision.current += 1;
      exportTask.current?.abort();
      for (const release of releases) release();
      releases.clear();
    };
  }, []);

  useEffect(() => {
    if (!state.controls) setPanel("Source");
  }, [state.controls]);

  const document = editableDocument(state);
  const evaluated = useMemo(() => evaluateEditor(state), [state]);
  const result =
    fragmentReady || !evaluated.ok
      ? evaluated
      : {
          ok: false as const,
          diagnostics: [
            {
              code: "share.loading",
              path: "/hash",
              message: "Checking for a shared document. Preview and exports are paused.",
            },
          ],
        };
  const diagnostics = result.diagnostics;
  let pngSize = "";
  let pngError = "";
  if (result.ok) {
    try {
      const pixels = pngDimensions(result.bounds.width, result.bounds.height, scale);
      pngSize = `${pixels.width} × ${pixels.height} px`;
    } catch (error) {
      pngError = error instanceof Error ? error.message : "PNG dimensions are invalid.";
    }
  }

  function change(update: (current: EditorState) => EditorState) {
    revision.current += 1;
    exportTask.current?.abort();
    setPNGBusy(false);
    setMarkdownBusy(false);
    setFeedback("");
    setTimeline((current) => pushTimeline(current, update(current.present)));
  }

  function travel(direction: "undo" | "redo") {
    revision.current += 1;
    exportTask.current?.abort();
    setPNGBusy(false);
    setMarkdownBusy(false);
    setFeedback("");
    setTimeline((current) => moveTimeline(current, direction));
  }

  function edit(update: (document: FigureDocument) => void) {
    change((current) => updateDocument(current, update));
  }

  function invalid(path: string) {
    return diagnostics.some((diagnostic) => diagnostic.path === path);
  }

  async function copyText(text: string, message: string) {
    if (!result.ok) return;
    const currentRevision = revision.current;
    setFeedback("");
    try {
      await navigator.clipboard.writeText(text);
      if (currentRevision === revision.current) setFeedback(message);
    } catch {
      if (currentRevision === revision.current)
        setFeedback(
          "Clipboard unavailable or permission denied. JSON can be copied manually from Source; downloads remain available.",
        );
    }
  }

  function copyJSON() {
    if (result.ok)
      void copyText(JSON.stringify(result.document, null, 2), "Current document copied.");
  }

  function copyMarkdown() {
    if (result.ok)
      void copyText(
        documentMarkdown(result.document),
        "Current document copied as a safe CircuitKit Markdown fence.",
      );
  }

  function copyLink() {
    if (!result.ok) return;
    const encoded = encodeShareDocument(result.document, { view: state.view });
    if (!encoded.ok) {
      setFeedback(encoded.diagnostics.map((diagnostic) => diagnostic.message).join(" "));
      return;
    }
    void copyText(
      `${window.location.origin}/editor${encoded.hash}`,
      "Share link copied. It contains the full document, not encrypted private storage.",
    );
  }

  function save(blob: Blob, extension: string) {
    if (!result.ok) return;
    downloads.current.add(
      downloadBlob(blob, `${result.document.layout.preset}.${extension}`, (release) =>
        downloads.current.delete(release),
      ),
    );
  }

  function downloadSVG() {
    if (!result.ok) return;
    try {
      save(new Blob([result.svg], { type: "image/svg+xml;charset=utf-8" }), "svg");
      setFeedback("SVG download requested. Your browser chooses the final file destination.");
    } catch {
      setFeedback("SVG download failed. Try again in a browser that supports file downloads.");
    }
  }

  async function exportPNG(copy: boolean) {
    if (!result.ok || pngError) return;
    exportTask.current?.abort();
    const task = new AbortController();
    exportTask.current = task;
    const currentRevision = revision.current;
    const current = () => !task.signal.aborted && currentRevision === revision.current;
    setPNGBusy(true);
    setFeedback("");
    try {
      const blob = await rasterizeFigurePNG(result, scale, task.signal);
      if (!current()) return;
      const delivery = await deliverPNG(blob, copy, task.signal, (value) => save(value, "png"));
      if (!current()) return;
      setFeedback(
        delivery === "copied"
          ? "Current full-figure PNG copied."
          : delivery === "fallback"
            ? "PNG clipboard unavailable or permission denied. PNG download requested instead."
            : "PNG download requested. Your browser chooses the final file destination.",
      );
    } catch (error) {
      if (current())
        setFeedback(
          error instanceof Error ? error.message : "PNG export failed. Download SVG instead.",
        );
    } finally {
      if (current()) setPNGBusy(false);
    }
  }

  function runSecondaryExport(action: () => void) {
    action();
    const disclosure = exportSummary.current?.closest("details");
    if (disclosure) disclosure.open = false;
    exportSummary.current?.focus();
  }

  async function applyMarkdown() {
    const pending = changeSource(state, state.draftText);
    change(() => pending);
    const currentRevision = revision.current;
    setMarkdownBusy(true);
    const applied = await applyMarkdownSource(pending);
    if (currentRevision === revision.current) change(() => applied);
  }

  return (
    <section
      className="workbench editor-workbench"
      aria-label="Circuit workspace"
      data-render-view={state.view}
      onKeyDown={(event) => {
        if (
          !(event.metaKey || event.ctrlKey) ||
          event.key.toLowerCase() !== "z" ||
          event.nativeEvent.isComposing ||
          event.repeat
        )
          return;
        if ((event.target as HTMLElement).closest("input, textarea, [contenteditable=true]"))
          return;
        event.preventDefault();
        travel(event.shiftKey ? "redo" : "undo");
      }}
    >
      <div className="figure-toolbar editor-toolbar">
        <div className="editor-inputs">
          <label className="field recipe-field">
            <span>Recipe</span>
            <select
              value={document?.layout.preset ?? ""}
              onChange={(event) => {
                const value = event.currentTarget.value as RecipeId;
                change(() => createEditor(loadExample(value)));
              }}
            >
              {!document ? (
                <option value="" disabled>
                  Choose a recipe to reset
                </option>
              ) : null}
              {catalog.recipes.map((recipe) => (
                <option key={recipe.id} value={recipe.id}>
                  {recipe.title}
                </option>
              ))}
            </select>
          </label>
          <label className="field editor-view-field">
            <span>Figure view</span>
            <select
              value={state.view}
              onChange={(event) => {
                const value = event.currentTarget.value as EditorState["view"];
                change((current) => ({ ...current, view: value }));
              }}
            >
              <option value="schematic">Schematic only</option>
              <option value="annotated">Annotated circuit</option>
              <option value="figure">Full lesson figure</option>
            </select>
          </label>
        </div>
        <span className={`status ${result.ok ? "valid" : ""}`} role="status">
          {result.ok
            ? "Ready to export"
            : !fragmentReady && evaluated.ok
              ? "Checking share link"
              : state.pending
                ? "Unapplied draft"
                : "Needs correction"}
        </span>
        <div className="export-bar">
          <button type="button" disabled={!result.ok} onClick={copyLink}>
            Copy link
          </button>
          <button
            type="button"
            className="primary"
            disabled={!result.ok || Boolean(pngError) || pngBusy}
            aria-busy={pngBusy}
            onClick={() => void exportPNG(false)}
          >
            Download PNG
          </button>
          <details
            className="export-disclosure"
            onBlur={(event) => {
              if (!event.currentTarget.contains(event.relatedTarget))
                event.currentTarget.open = false;
            }}
            onKeyDown={(event) => {
              if (event.key !== "Escape" || !event.currentTarget.open) return;
              event.preventDefault();
              event.stopPropagation();
              event.currentTarget.open = false;
              exportSummary.current?.focus();
            }}
          >
            <summary ref={exportSummary} tabIndex={0}>
              More exports
            </summary>
            <div className="export-options">
              <p className="hint">
                Exports match Figure view. Schematic only has no lesson framing.
              </p>
              <label className="field">
                <span>PNG scale</span>
                <select
                  value={scale}
                  aria-describedby="png-hint"
                  onChange={(event) => {
                    const value = event.currentTarget.value;
                    change((current) => current);
                    setScale(Number(value));
                  }}
                >
                  {[1, 2, 3, 4].map((value) => (
                    <option key={value} value={value}>
                      {value}×
                    </option>
                  ))}
                </select>
              </label>
              <p id="png-hint" role="status">
                {pngBusy ? "Preparing current PNG…" : pngError || pngSize || "PNG paused."}
              </p>
              <button
                type="button"
                disabled={!result.ok || Boolean(pngError) || pngBusy}
                onClick={() => runSecondaryExport(() => void exportPNG(true))}
              >
                Copy PNG
              </button>
              <button
                type="button"
                disabled={!result.ok}
                onClick={() => runSecondaryExport(downloadSVG)}
              >
                Download SVG
              </button>
              <button
                type="button"
                disabled={!result.ok}
                onClick={() => runSecondaryExport(copyJSON)}
              >
                Copy JSON
              </button>
              <button
                type="button"
                disabled={!result.ok}
                onClick={() => runSecondaryExport(copyMarkdown)}
              >
                Copy Markdown
              </button>
              <p className="hint">
                PNG is local, up to 16 MP. Copy PNG downloads if clipboard access fails.
              </p>
            </div>
          </details>
        </div>
      </div>
      <p className="feedback" role="status">
        {feedback ||
          (pngBusy ? "Preparing current PNG…" : markdownBusy ? "Validating Markdown…" : "")}
      </p>
      <div className="editor-layout">
        <div className="workspace">
          <fieldset className="canvas-toolbar">
            <legend className="sr-only">Canvas controls</legend>
            <div className="history-controls">
              <button
                type="button"
                disabled={!timeline.past.length}
                onClick={() => travel("undo")}
                title="Undo last change"
              >
                Undo
              </button>
              <button
                type="button"
                disabled={!timeline.future.length}
                onClick={() => travel("redo")}
                title="Redo change"
              >
                Redo
              </button>
            </div>
            <label>
              Preview zoom
              <select
                aria-label="Preview zoom"
                value={zoom}
                onChange={(event) => {
                  const value = event.currentTarget.value;
                  setZoom(value);
                }}
              >
                <option value="fit">Fit canvas</option>
                <option value="1">100%</option>
                <option value="1.5">150%</option>
                <option value="2">200%</option>
              </select>
            </label>
            <span>Zoom does not change exports</span>
          </fieldset>
          <section className="figure-stage" aria-label="Current figure" tabIndex={0}>
            {result.ok ? (
              <div
                className={`figure-output ${result.bounds.width > 1000 ? "figure-output-complex" : ""}`}
                style={
                  zoom === "fit"
                    ? undefined
                    : {
                        width: result.bounds.width * Number(zoom),
                        minWidth: result.bounds.width * Number(zoom),
                        maxWidth: "none",
                        flexShrink: 0,
                      }
                }
                dangerouslySetInnerHTML={{ __html: result.svg }}
              />
            ) : (
              <div className="empty-state">
                <span className="eyebrow">No current figure</span>
                <h2>
                  {!fragmentReady && evaluated.ok
                    ? "Checking the share link."
                    : state.pending
                      ? "Apply your draft to continue."
                      : "A correction is needed."}
                </h2>
                <p>Preview and exports pause until this document is valid.</p>
                {state.pending || !document ? (
                  <button type="button" onClick={() => setPanel("Source")}>
                    Review Source
                  </button>
                ) : null}
              </div>
            )}
          </section>
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
        </div>
        <aside className="editor-inspector" aria-label="Figure controls">
          <fieldset className="inspector-switcher">
            <legend className="sr-only">Inspector panel</legend>
            {(["Circuit", "Style", "Explain", "Source"] as const).map((name) => (
              <label key={name}>
                <input
                  type="radio"
                  name="inspector-panel"
                  value={name}
                  checked={panel === name}
                  aria-controls={`inspector-${name.toLowerCase()}`}
                  onChange={() => setPanel(name)}
                />
                <span id={`panel-label-${name.toLowerCase()}`}>{name}</span>
              </label>
            ))}
          </fieldset>
          <section
            id="inspector-circuit"
            aria-labelledby="panel-label-circuit"
            hidden={panel !== "Circuit"}
          >
            {document ? (
              <section className="control-section">
                <h2 id="content-heading">Circuit</h2>
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
            ) : (
              <p className="hint">
                Apply your Source draft or choose a recipe to edit the circuit.
              </p>
            )}
          </section>
          <section
            id="inspector-style"
            aria-labelledby="panel-label-style"
            hidden={panel !== "Style"}
          >
            {document ? (
              <section className="control-section">
                <h2 id="theme-heading">Style</h2>
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
                <details className="inspector-disclosure">
                  <summary>Advanced overrides</summary>
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
                </details>
              </section>
            ) : (
              <p className="hint">Apply your Source draft to edit its style.</p>
            )}
          </section>
          <section
            id="inspector-explain"
            aria-labelledby="panel-label-explain"
            hidden={panel !== "Explain"}
          >
            {document ? (
              <>
                <section className="control-section" aria-labelledby="focus-heading">
                  <h2 id="focus-heading">Focus</h2>
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
                                  delete next.presentation.activeStep;
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
                        delete next.presentation.activeStep;
                      })
                    }
                  >
                    Clear focus
                  </button>
                </section>
                {state.view === "schematic" ? (
                  <p className="hint">
                    Notes are preserved in the document. Choose Annotated circuit or Full lesson
                    figure to show them.
                  </p>
                ) : null}
                <AuthoringControls document={document} edit={edit} />
              </>
            ) : (
              <p className="hint">Apply your Source draft to edit explanations.</p>
            )}
          </section>
          <section
            id="inspector-source"
            aria-labelledby="panel-label-source"
            hidden={panel !== "Source"}
            onKeyDown={(event) => {
              if (
                panel !== "Source" ||
                event.key !== "Enter" ||
                !(event.metaKey || event.ctrlKey) ||
                event.nativeEvent.isComposing ||
                event.keyCode === 229 ||
                event.repeat ||
                markdownBusy
              )
                return;
              event.preventDefault();
              if (state.sourceMode === "json") change(applySource);
              else void applyMarkdown();
            }}
          >
            <section className="source-section" aria-labelledby="source-heading">
              <div className="section-heading">
                <div>
                  <h2 id="source-heading">Figure document</h2>
                </div>
                {state.sourceMode === "json" ? (
                  <button type="button" onClick={() => change(applySource)}>
                    Apply JSON
                  </button>
                ) : (
                  <button
                    type="button"
                    disabled={markdownBusy}
                    aria-busy={markdownBusy}
                    onClick={() => void applyMarkdown()}
                  >
                    Validate Markdown
                  </button>
                )}
              </div>
              <label className="field">
                <span>Source format</span>
                <select
                  value={state.sourceMode}
                  onChange={(event) => {
                    const value = event.currentTarget.value as EditorState["sourceMode"];
                    change((current) => changeSourceMode(current, value));
                  }}
                >
                  <option value="json">JSON</option>
                  <option value="markdown">Markdown import</option>
                </select>
              </label>
              {state.markdownFigures.length ? (
                <fieldset className="focus-group">
                  <legend>Choose a Markdown figure to import</legend>
                  <p className="hint">
                    All blocks validated. Importing replaces this draft with the selected document
                    JSON.
                  </p>
                  <div className="actions">
                    {state.markdownFigures.map((figure) => (
                      <button
                        type="button"
                        key={figure.index}
                        onClick={() =>
                          change((current) => selectMarkdownFigure(current, figure.index))
                        }
                      >
                        Block {figure.index + 1}, line {figure.line}:{" "}
                        {figure.document.presentation.title}
                      </button>
                    ))}
                  </div>
                </fieldset>
              ) : null}
              <label className="source-label" htmlFor="json-source">
                {state.sourceMode === "json"
                  ? "Figure document JSON"
                  : "CircuitKit Markdown source"}
              </label>
              <CodeEditor
                id="json-source"
                label={
                  state.sourceMode === "json"
                    ? "Figure document JSON"
                    : "CircuitKit Markdown source"
                }
                language={state.sourceMode}
                value={state.draftText}
                describedBy="source-hint"
                invalid={Boolean(state.parseError) || state.sourceDiagnostics.length > 0}
                onChange={(value) => change((current) => changeSource(current, value))}
              />
              <p className="hint" id="source-hint">
                Apply with ⌘/Ctrl+Enter. Drafts pause exports. Changing recipe or source format
                replaces this text. Markdown validates every CircuitKit JSON fence, never prose or
                HTML.{" "}
                <Link href="/markdown" prefetch={false}>
                  Preview all Markdown figures
                </Link>
                .
              </p>
              {Object.values(state.inputs).some((text) => positiveNumber(text) === null) ? (
                <p className="hint">
                  A numeric control has an invalid draft. JSON still contains its last numeric
                  value. Correct the control, or apply JSON to explicitly replace form edits.
                </p>
              ) : null}
            </section>
          </section>
        </aside>
      </div>
    </section>
  );
}
