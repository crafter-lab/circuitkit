"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import type { DiagramView } from "../../src/diagram/index.ts";
import type { RenderedMarkdownFigure, renderCircuitMarkdown } from "../../src/markdown.ts";
import { encodeShareDocument } from "../../src/share.ts";
import { downloadBlob, rasterizeFigurePNG } from "../browser-export.ts";
import PresentationViewer from "../presentation-viewer.tsx";
import CodeEditor from "../source-editor.tsx";

export default function MarkdownClient({
  initialSource = "",
  examples = [],
}: {
  initialSource?: string;
  examples?: { label: string; source: string }[];
}) {
  const [source, setSource] = useState(initialSource);
  const [exampleIndex, setExampleIndex] = useState(() => {
    const index = examples.findIndex((example) => example.source === initialSource);
    return index < 0 ? "" : String(index);
  });
  const [result, setResult] = useState<ReturnType<typeof renderCircuitMarkdown> | null>(null);
  const [busy, setBusy] = useState(false);
  const [view, setView] = useState<DiagramView | "">("");
  const [scope, setScope] = useState("");
  const [detail, setDetail] = useState<"expanded" | "interface">("expanded");
  const revision = useRef(0);
  const [live, setLive] = useState(true);
  const [notice, setNotice] = useState("");
  const [savedDraft, setSavedDraft] = useState<string | null>(null);
  const [persist, setPersist] = useState(false);
  const [selection, setSelection] = useState<{ from: number; to: number; key: number }>();

  useEffect(() => {
    try {
      setSavedDraft(localStorage.getItem("circuitkit.markdown.draft.v1"));
    } catch {}
  }, []);
  useEffect(() => {
    if (!persist) return;
    const timer = setTimeout(() => {
      try {
        if (new TextEncoder().encode(source).length > 1_048_576) throw new Error("large");
        localStorage.setItem("circuitkit.markdown.draft.v1", source);
        setNotice("Draft saved on this device. Not synced or encrypted.");
      } catch {
        setNotice("Local draft could not be saved. Download Markdown to keep your work.");
      }
    }, 600);
    return () => clearTimeout(timer);
  }, [source, persist]);

  useEffect(
    () => () => {
      revision.current += 1;
    },
    [],
  );

  const validate = useCallback(
    async (selectedView = view, selectedScope = scope, selectedDetail = detail) => {
      const currentRevision = ++revision.current;
      setResult(null);
      setBusy(true);
      try {
        const { renderCircuitMarkdown } = await import("../../src/markdown.ts");
        if (currentRevision !== revision.current) return;
        const rendered = renderCircuitMarkdown(source, {
          ...(selectedView ? { view: selectedView } : {}),
          ...(selectedScope ? { scope: selectedScope } : {}),
          ...(selectedDetail === "expanded" ? {} : { detail: selectedDetail }),
        });
        if (currentRevision === revision.current) setResult(rendered);
      } catch {
        if (currentRevision === revision.current)
          setResult({
            ok: false,
            diagnostics: [
              {
                code: "markdown.unavailable",
                path: "/markdown",
                message: "Markdown could not be loaded. Your source is preserved; try again.",
              },
            ],
          });
      } finally {
        if (currentRevision === revision.current) setBusy(false);
      }
    },
    [source, view, scope, detail],
  );

  useEffect(() => {
    if (!live) return;
    const timer = setTimeout(() => void validate(), 350);
    return () => clearTimeout(timer);
  }, [live, validate]);

  function replaceSource(value: string) {
    revision.current += 1;
    setSource(value);
    setExampleIndex("");
    setResult(null);
    setBusy(false);
  }

  return (
    <div className="workspace markdown-workbench min-w-0">
      <section
        className="source-section markdown-author"
        aria-labelledby="markdown-source-heading"
        onKeyDown={(event) => {
          if (
            event.key === "Enter" &&
            (event.metaKey || event.ctrlKey) &&
            !event.nativeEvent.isComposing &&
            !event.repeat
          ) {
            event.preventDefault();
            void validate();
          }
        }}
      >
        <div className="markdown-filebar">
          <span>Workspace / circuit.md</span>
          <Link href="/editor" prefetch={false}>
            Circuit editor
          </Link>
        </div>
        <div className="section-heading">
          <h2 id="markdown-source-heading">Markdown source</h2>
          <button className="primary" type="button" disabled={busy} onClick={() => void validate()}>
            {busy ? "Validating Markdown…" : "Validate Markdown"}
          </button>
        </div>
        <div className="markdown-actions">
          <label>
            <input
              type="checkbox"
              checked={live}
              onChange={(event) => setLive(event.currentTarget.checked)}
            />{" "}
            Live preview
          </label>
          <button
            type="button"
            onClick={() => {
              try {
                downloadBlob(
                  new Blob([source], { type: "text/markdown;charset=utf-8" }),
                  "circuit.md",
                );
                setNotice("Markdown download requested.");
              } catch {
                setNotice("Download unavailable. Copy the source to keep your work.");
              }
            }}
          >
            Download Markdown
          </button>
        </div>
        {savedDraft !== null ? (
          <div className="draft-recovery">
            <span>A local draft is available.</span>
            <button
              type="button"
              onClick={() => {
                replaceSource(savedDraft);
                setScope("");
                setSavedDraft(null);
              }}
            >
              Restore draft
            </button>
            <button type="button" onClick={() => setSavedDraft(null)}>
              Dismiss
            </button>
          </div>
        ) : null}
        {examples.length ? (
          <div className="source-example-picker">
            <label htmlFor="markdown-example">Example</label>
            <select
              id="markdown-example"
              value={exampleIndex}
              onChange={(event) => {
                setExampleIndex(event.currentTarget.value);
                if (event.currentTarget.value === "") return;
                const example = examples[Number(event.currentTarget.value)];
                if (!example) return;
                revision.current += 1;
                setSource(example.source);
                setResult(null);
                setBusy(false);
                setScope("");
                setDetail("expanded");
              }}
            >
              <option value="">Custom source</option>
              {examples.map((example, index) => (
                <option key={example.label} value={index}>
                  {example.label}
                </option>
              ))}
            </select>
          </div>
        ) : null}
        <label htmlFor="markdown-view">Diagram view</label>
        <select
          id="markdown-view"
          value={view}
          aria-describedby="markdown-view-hint"
          onChange={(event) => {
            const selected = event.currentTarget.value;
            if (
              selected !== "" &&
              selected !== "blocks" &&
              selected !== "wiring" &&
              selected !== "schematic"
            )
              return;
            setView(selected);
            void validate(selected);
          }}
        >
          <option value="">Authored view</option>
          <option value="blocks">Blocks</option>
          <option value="wiring">Wiring</option>
          <option value="schematic">Schematic</option>
        </select>
        <p className="hint" id="markdown-view-hint">
          Applies only to coordinate-free diagrams. Source stays unchanged. Connectivity is
          declared, not electrically verified.
        </p>
        <details className="projection-disclosure">
          <summary>Subsystem scope & detail</summary>
          <div className="source-projection-controls">
            <label htmlFor="markdown-scope">
              Assembly scope
              <input
                id="markdown-scope"
                value={scope}
                placeholder="Root (or audio)"
                onChange={(event) => {
                  revision.current += 1;
                  setScope(event.currentTarget.value);
                  setResult(null);
                  setBusy(false);
                }}
                onKeyDown={(event) => {
                  if (event.key === "Enter") void validate();
                }}
              />
            </label>
            <label htmlFor="markdown-detail">
              Detail
              <select
                id="markdown-detail"
                value={detail}
                onChange={(event) => {
                  const next = event.currentTarget.value;
                  if (next !== "expanded" && next !== "interface") return;
                  setDetail(next);
                  void validate(view, scope, next);
                }}
              >
                <option value="expanded">Expanded modules</option>
                <option value="interface">Public interfaces</option>
              </select>
            </label>
          </div>
          <p className="hint">
            Scope and detail apply to text definitions. In the reusable audio example, enter audio
            to inspect its explicit boundary. Boundaries are not extra hardware.
          </p>
        </details>
        <label className="sr-only" htmlFor="markdown-source">
          CircuitKit Markdown source
        </label>
        <SourceEditor
          value={source}
          invalid={result?.ok === false}
          selection={selection}
          onChange={replaceSource}
        />
        <div className="markdown-draft-options">
          <label>
            <input
              type="checkbox"
              checked={persist}
              onChange={(event) => {
                const checked = event.currentTarget.checked;
                setPersist(checked);
                if (!checked) {
                  try {
                    localStorage.removeItem("circuitkit.markdown.draft.v1");
                    setNotice("Local draft removed. The open source is unchanged.");
                  } catch {
                    setNotice("Could not remove the saved draft. Clear site storage to remove it.");
                  }
                }
              }}
            />{" "}
            Keep draft on this device
          </label>
        </div>
        <p className="feedback" role="status">
          {notice}
        </p>
        <details className="authoring-help">
          <summary>Syntax, shortcuts & limits</summary>
          <p className="hint" id="markdown-hint">
            ⌘/Ctrl+Enter validates. ⌘/Ctrl+Z undoes source edits, including changing examples. Up to
            1 MiB of Markdown, 32 blocks and 64 KiB per block. Editing removes stale previews.
            Fences accept circuit ID v1 text, circuitkit.diagram.v1 JSON or legacy figure JSON, not
            author envelopes. Syntax highlighting is visual, not a validation result.
          </p>
          <pre>
            {
              "board: controller (SDA SCL)\nscreen: display (SDA SCL)\nbus I2C {\n  board.SDA <-> screen.SDA\n  board.SCL -> screen.SCL\n}"
            }
          </pre>
        </details>
      </section>
      <section className="markdown-preview-column" aria-label="Rendered figures" aria-busy={busy}>
        <div className="markdown-preview-heading">
          <h2>Preview</h2>
          <span>Local rendering · no upload</span>
        </div>
        <div
          id="markdown-diagnostics"
          aria-live="polite"
          aria-atomic="true"
          className={result?.ok === false ? "diagnostics" : "feedback"}
        >
          {result?.ok === false ? (
            <>
              <h2>Markdown diagnostics</h2>
              <ul>
                {result.diagnostics.map((diagnostic) => (
                  <li key={JSON.stringify(diagnostic)}>
                    <code>{diagnostic.code}</code>
                    <span className="diagnostic-path">{diagnostic.path}</span>
                    {diagnostic.range ? (
                      <button
                        type="button"
                        className="diagnostic-location"
                        onClick={() => {
                          if (diagnostic.range)
                            setSelection({
                              from: diagnostic.range.start.offset,
                              to: diagnostic.range.end.offset,
                              key: Date.now(),
                            });
                        }}
                      >
                        Line {diagnostic.range.start.line}, column {diagnostic.range.start.column}
                      </button>
                    ) : null}
                    <p>{diagnostic.message}</p>
                  </li>
                ))}
              </ul>
            </>
          ) : (
            <p>
              {busy
                ? "Validating all blocks…"
                : result?.ok
                  ? `${result.figures.length} validated figures.`
                  : live
                    ? "Waiting for your source…"
                    : "No current figures. Validate this source to preview."}
            </p>
          )}
        </div>
        {result?.ok ? (
          result.figures.map((figure) => <MarkdownPreview key={figure.index} figure={figure} />)
        ) : (
          <div className="markdown-empty">
            <span className="eyebrow">One source, three views</span>
            <h3>
              {result?.ok === false ? "Let’s fix the source." : "Your circuit takes shape here."}
            </h3>
            <p>
              {result?.ok === false
                ? "Use a line number above to jump to the problem. Invalid source never exports a stale diagram."
                : "Write or choose an example. Preview updates after you pause; the source stays yours."}
            </p>
          </div>
        )}
      </section>
    </div>
  );
}

export function SourceEditor(props: {
  value: string;
  invalid: boolean;
  onChange: (value: string) => void;
  selection?: { from: number; to: number; key: number };
}) {
  return (
    <CodeEditor
      {...props}
      id="markdown-source"
      label="CircuitKit Markdown source"
      describedBy="markdown-hint"
    />
  );
}

export function MarkdownPreview({ figure }: { figure: RenderedMarkdownFigure }) {
  const [overview, setOverview] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [message, setMessage] = useState("");
  const [inspect, setInspect] = useState(false);
  const task = useRef<AbortController | null>(null);
  useEffect(() => {
    setExporting(false);
    setMessage("");
    return () => task.current?.abort();
  }, [figure.svg]);
  async function exportFigure(format: "svg" | "png") {
    task.current?.abort();
    const controller = new AbortController();
    task.current = controller;
    setExporting(true);
    setMessage("");
    try {
      const blob =
        format === "svg"
          ? new Blob([figure.svg], { type: "image/svg+xml;charset=utf-8" })
          : await rasterizeFigurePNG(figure, 1, controller.signal);
      controller.signal.throwIfAborted();
      downloadBlob(blob, `diagram-${figure.index + 1}.${format}`);
      setMessage(
        `${format.toUpperCase()} download requested. Export uses full resolution, not preview zoom.`,
      );
    } catch (error) {
      if (!controller.signal.aborted)
        setMessage(
          error instanceof Error ? error.message : "Export unavailable. Your source is preserved.",
        );
    } finally {
      if (!controller.signal.aborted) setExporting(false);
    }
  }
  const share = figure.figure === undefined ? encodeShareDocument(figure.document) : null;
  const title =
    figure.figure !== undefined ? figure.document.title : figure.document.presentation.title;
  return (
    <section className="source-section min-w-0" aria-label={`Markdown figure ${figure.index + 1}`}>
      <div className="section-heading">
        <div>
          <span className="eyebrow">
            Block {figure.index + 1}, line {figure.line}, column {figure.column}
          </span>
          <h2>{title}</h2>
        </div>
        {share ? (
          share.ok ? (
            <Link prefetch={false} href={`/editor${share.hash}`}>
              Open figure {figure.index + 1} in editor
            </Link>
          ) : (
            <p className="hint">
              {share.diagnostics.map((diagnostic) => diagnostic.message).join(" ")} Import the
              source in the editor instead.
            </p>
          )
        ) : (
          <p className="hint">
            Module diagram · {figure.classification?.view} view · declared connectivity.{" "}
            {figure.language ? (
              <>
                Edit here or copy your .ck source into the{" "}
                <Link href="/editor?mode=circuitkit" prefetch={false}>
                  CircuitKit source editor
                </Link>
                . Scene playback is illustrative; downloads remain static base diagrams.
              </>
            ) : (
              <>Edit diagram JSON here; the legacy editor does not accept diagrams.</>
            )}
          </p>
        )}
      </div>
      {figure.figure !== undefined && figure.selection?.boundaryPorts.length ? (
        <p className="hint">
          External interface (not hardware):{" "}
          {figure.selection.boundaryPorts.map((port) => port.port).join(", ")}
        </p>
      ) : null}
      {figure.figure !== undefined && figure.selection?.detail === "interface" ? (
        <p className="hint">
          Interfaces only: {figure.selection.omittedInternalConnections} internal connections are
          not drawn. Inspect the whole-system model for complete connectivity.
        </p>
      ) : null}
      {figure.figure !== undefined && figure.system ? (
        <details
          className="source-inspection"
          onToggle={(event) => setInspect(event.currentTarget.open)}
        >
          <summary>Inspect resolved system and interfaces</summary>
          <p>
            Scope: {figure.selection?.scope || "root"} · {figure.selection?.detail} ·{" "}
            {figure.system.nets.length} whole-system nets. The picture is a projection, not a
            replacement for this model.
          </p>
          <pre>
            {inspect
              ? JSON.stringify({ system: figure.system, selection: figure.selection }, null, 2)
              : null}
          </pre>
        </details>
      ) : null}
      {figure.figure !== undefined && !figure.presentation ? (
        <p className="hint">
          <button type="button" aria-pressed={overview} onClick={() => setOverview(!overview)}>
            {overview ? "Readable size" : "Fit width"}
          </button>{" "}
          Scroll inside the preview to read labels. Fit width is an overview, not an export change.
        </p>
      ) : null}
      <div className="markdown-export-bar">
        <span>
          {Math.ceil(figure.bounds.width)} × {Math.ceil(figure.bounds.height)}
        </span>
        <button type="button" disabled={exporting} onClick={() => void exportFigure("svg")}>
          Download SVG
        </button>
        <button type="button" disabled={exporting} onClick={() => void exportFigure("png")}>
          {exporting ? "Preparing export…" : "Download PNG"}
        </button>
      </div>
      <p className="feedback" role="status">
        {message}
      </p>
      {figure.figure !== undefined && figure.presentation ? (
        <PresentationViewer
          key={JSON.stringify(figure.presentation)}
          figure={figure.figure}
          presentation={figure.presentation}
        />
      ) : (
        <section
          className="figure-stage"
          tabIndex={0}
          aria-label={`Full preview for figure ${figure.index + 1}`}
          style={
            figure.figure !== undefined
              ? {
                  display: "block",
                  minHeight: 0,
                  maxHeight: "min(60vh, 480px)",
                  overflow: "auto",
                  padding: 16,
                }
              : undefined
          }
        >
          {figure.figure !== undefined ? (
            <img
              src={`data:image/svg+xml;charset=utf-8,${encodeURIComponent(figure.svg)}`}
              alt={`${title}. ${figure.classification.view} diagram. ${figure.figure.description}`}
              width={figure.bounds.width}
              height={figure.bounds.height}
              style={{
                display: "block",
                width: overview ? "100%" : figure.bounds.width,
                maxWidth: "none",
                height: "auto",
              }}
            />
          ) : (
            <div className="figure-output" dangerouslySetInnerHTML={{ __html: figure.svg }} />
          )}
        </section>
      )}
    </section>
  );
}
