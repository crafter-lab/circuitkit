"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import type { DiagramView, Theme } from "../../src/diagram/index.ts";
import type { renderCircuitSource } from "../../src/language/index.ts";
import type { SourceRange } from "../../src/language/types.ts";
import { downloadBlob, rasterizeFigurePNG } from "../browser-export.ts";
import PresentationViewer from "../presentation-viewer.tsx";
import CodeEditor from "../source-editor.tsx";
import { useSiteTheme } from "../theme-provider.tsx";
import { ToolMenu, UIIcon } from "../ui-controls.tsx";
import "./circuit-editor.css";

export default function CircuitEditor({
  examples,
}: {
  examples: { label: string; source: string }[];
}) {
  const [source, setSource] = useState(examples[0]?.source ?? "");
  const [view, setView] = useState<DiagramView>("wiring");
  const [theme, setTheme] = useState<Theme | "site">("site");
  const { theme: siteTheme } = useSiteTheme();
  const effectiveTheme = theme === "site" ? (`geist-${siteTheme}` as const) : theme;
  const [scope, setScope] = useState("");
  const [detail, setDetail] = useState<"expanded" | "interface">("expanded");
  const [wrap, setWrap] = useState(false);
  const [mobilePane, setMobilePane] = useState<"source" | "preview">("preview");
  const [result, setResult] = useState<ReturnType<typeof renderCircuitSource> | null>(null);
  const [busy, setBusy] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [notice, setNotice] = useState("");
  const [selection, setSelection] = useState<{ from: number; to: number; key: number }>();
  const revision = useRef(0);
  const exportTask = useRef<AbortController | null>(null);
  const invalidate = useCallback(() => {
    revision.current++;
    exportTask.current?.abort();
    setResult(null);
    setExporting(false);
    setNotice("");
  }, []);
  const validate = useCallback(async () => {
    const current = ++revision.current;
    exportTask.current?.abort();
    setExporting(false);
    setBusy(true);
    setResult(null);
    try {
      const { renderCircuitSource } = await import("../../src/language/index.ts");
      if (current !== revision.current) return;
      const next = renderCircuitSource(source, { view, theme: effectiveTheme, scope, detail });
      if (current === revision.current) setResult(next);
    } catch {
      if (current === revision.current)
        setNotice("Could not load the compiler. Your source is preserved; try Render again.");
    } finally {
      if (current === revision.current) setBusy(false);
    }
  }, [source, view, effectiveTheme, scope, detail]);
  useEffect(() => {
    const timer = setTimeout(() => void validate(), 350);
    return () => clearTimeout(timer);
  }, [validate]);
  useEffect(
    () => () => {
      revision.current++;
      exportTask.current?.abort();
    },
    [],
  );
  useEffect(() => {
    if (source === examples[0]?.source) return;
    const warn = (event: BeforeUnloadEvent) => event.preventDefault();
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [source, examples]);
  const replace = (value: string) => {
    if (value === source) return;
    invalidate();
    setSource(value);
  };
  const reveal = (range: SourceRange) => {
    setMobilePane("source");
    setSelection({ from: range.start.offset, to: range.end.offset, key: Date.now() });
  };
  async function format() {
    const current = revision.current;
    try {
      const { formatCircuitSource } = await import("../../src/language/index.ts");
      if (current !== revision.current) return;
      const formatted = formatCircuitSource(source);
      if (formatted.ok) {
        replace(formatted.source);
        setNotice("Formatted · comments removed.");
      } else {
        exportTask.current?.abort();
        setExporting(false);
        setResult(formatted);
      }
    } catch {
      if (current === revision.current)
        setNotice("Formatting unavailable. Your source is preserved.");
    }
  }
  async function download(format: "svg" | "png") {
    if (!result?.ok) return;
    exportTask.current?.abort();
    const task = new AbortController();
    exportTask.current = task;
    const current = revision.current;
    setExporting(true);
    setNotice("");
    try {
      const blob =
        format === "svg"
          ? new Blob([result.svg], { type: "image/svg+xml;charset=utf-8" })
          : await rasterizeFigurePNG(result, 1, task.signal);
      if (current !== revision.current || task.signal.aborted) return;
      downloadBlob(blob, `${result.document.id}.${format}`);
      setNotice(`${format.toUpperCase()} downloaded · static base diagram.`);
    } catch (error) {
      if (!task.signal.aborted)
        setNotice(error instanceof Error ? error.message : "Export failed.");
    } finally {
      if (!task.signal.aborted) setExporting(false);
    }
  }
  const exampleIndex = examples.findIndex((example) => example.source === source);
  return (
    <section
      className="studio-workspace"
      aria-label="Circuit source workspace"
      data-mobile-pane={mobilePane}
      onKeyDownCapture={(event) => {
        if (
          event.key === "Enter" &&
          (event.metaKey || event.ctrlKey) &&
          !event.nativeEvent.isComposing &&
          !event.repeat
        ) {
          event.preventDefault();
          event.stopPropagation();
          void validate();
        }
      }}
    >
      <div className="studio-toolbar">
        <div className="studio-file-picker">
          <UIIcon name="code" />
          <select
            id="circuit-example"
            aria-label="Example"
            value={exampleIndex < 0 ? "" : String(exampleIndex)}
            onChange={(event) => {
              const example = examples[Number(event.currentTarget.value)];
              if (!example || event.currentTarget.value === "") return;
              if (source === example.source && scope === "" && detail === "expanded") {
                void validate();
                return;
              }
              invalidate();
              setSource(example.source);
              setScope("");
              setDetail("expanded");
            }}
          >
            <option value="">Custom circuit</option>
            {examples.map((example, index) => (
              <option key={example.label} value={index}>
                {example.label}
              </option>
            ))}
          </select>
        </div>
        <fieldset className="ck-segmented studio-views" aria-label="Diagram view">
          {(["blocks", "wiring", "schematic"] as const).map((value) => (
            <button
              key={value}
              type="button"
              aria-pressed={view === value}
              onClick={() => {
                if (view !== value) {
                  invalidate();
                  setView(value);
                }
              }}
            >
              {value[0]?.toUpperCase()}
              {value.slice(1)}
            </button>
          ))}
        </fieldset>
        <div className="studio-actions">
          <span className="studio-live" data-error={result?.ok === false}>
            {busy ? "Rendering…" : result?.ok === false ? "Needs attention" : "Live"}
          </span>
          <ToolMenu
            label="Export circuit"
            text={exporting ? "Exporting…" : "Export"}
            icon="download"
          >
            <button
              type="button"
              data-menu-close
              disabled={!result?.ok || exporting}
              onClick={() => void download("svg")}
            >
              Download SVG
            </button>
            <button
              type="button"
              data-menu-close
              disabled={!result?.ok || exporting}
              onClick={() => void download("png")}
            >
              Download PNG
            </button>
            <hr />
            <button
              type="button"
              data-menu-close
              onClick={() => {
                try {
                  downloadBlob(
                    new Blob([source], { type: "text/plain;charset=utf-8" }),
                    "circuit.ck",
                  );
                  setNotice("Source downloaded.");
                } catch {
                  setNotice("Download unavailable. Copy your source to keep it.");
                }
              }}
            >
              Download .ck source
            </button>
            <p>Images use the static base diagram. Keep the source to keep your scenes.</p>
          </ToolMenu>
        </div>
      </div>
      <fieldset className="studio-mobile-tabs ck-segmented" aria-label="Workspace pane">
        {(["source", "preview"] as const).map((value) => (
          <button
            type="button"
            key={value}
            aria-pressed={mobilePane === value}
            onClick={() => setMobilePane(value)}
          >
            {value === "source" ? "Source" : "Preview"}
          </button>
        ))}
      </fieldset>
      <div className="studio-panels">
        <section className="studio-source" aria-label="Source panel">
          <div className="studio-pane-bar">
            <span>circuit.ck</span>
            <ToolMenu label="Source options">
              <button type="button" data-menu-close onClick={() => void format()}>
                Format source
              </button>
              <button type="button" data-menu-close disabled={busy} onClick={() => void validate()}>
                Render now <kbd>⌘ ↵</kbd>
              </button>
              <button
                type="button"
                aria-label="Wrap lines"
                aria-pressed={wrap}
                onClick={() => setWrap((value) => !value)}
              >
                Wrap lines <span>{wrap ? "On" : "Off"}</span>
              </button>
              <hr />
              <Link href="/#developer-guide" target="_blank" prefetch={false}>
                Developer guide ↗
              </Link>
              <p>
                Live preview after you pause. Cmd/Ctrl+Enter renders now. Format removes comments.
              </p>
            </ToolMenu>
          </div>
          <CodeEditor
            id="circuit-source"
            label="CircuitKit source"
            language="circuitkit"
            value={source}
            onChange={replace}
            invalid={result?.ok === false}
            selection={selection}
            minimal
            lineWrapping={wrap}
          />
        </section>
        <section className="studio-preview" aria-label="Preview panel">
          {result?.ok ? (
            <PresentationViewer
              key={revision.current}
              figure={result.figure}
              presentation={result.presentation ?? { scenes: [] }}
              onReveal={reveal}
              compact
              appearance="authored"
            />
          ) : (
            <div className="studio-preview-empty" role={result?.ok === false ? "alert" : "status"}>
              {result?.ok === false ? (
                <>
                  <span className="studio-empty-symbol">!</span>
                  <h2>A small fix, then you’re back.</h2>
                  {result.diagnostics.map((diagnostic, index) => (
                    <div key={`${diagnostic.code}-${index}`} className="studio-diagnostic">
                      {diagnostic.range ? (
                        <button
                          type="button"
                          className="ck-tool ck-tool-text"
                          onClick={() => diagnostic.range && reveal(diagnostic.range)}
                        >
                          Line {diagnostic.range.start.line}
                        </button>
                      ) : null}
                      <p>{diagnostic.message}</p>
                    </div>
                  ))}
                </>
              ) : (
                <>
                  <UIIcon name="code" />
                  <p>{busy ? "Rendering your circuit…" : "Your circuit will appear here."}</p>
                </>
              )}
            </div>
          )}
        </section>
      </div>
      <div className="studio-statusbar">
        <span className="studio-feedback" role="status" title={notice}>
          {notice ||
            (result?.ok
              ? `${result.system.nodes.length} modules · ${result.system.nets.length} nets`
              : "Your source stays in this tab")}
        </span>
        <ToolMenu label="Canvas settings" text="Settings">
          <label htmlFor="circuit-theme">
            Appearance
            <select
              id="circuit-theme"
              value={theme}
              onChange={(event) => {
                if (event.currentTarget.value !== theme) {
                  invalidate();
                  setTheme(event.currentTarget.value as typeof theme);
                }
              }}
            >
              <option value="site">Match site</option>
              <option value="geist-light">Light</option>
              <option value="geist-dark">Dark</option>
              <option value="geist-print">Print</option>
            </select>
          </label>
          <label htmlFor="circuit-scope">
            Assembly scope
            <input
              id="circuit-scope"
              name="scope"
              autoComplete="off"
              spellCheck={false}
              value={scope}
              placeholder="Root…"
              onChange={(event) => {
                if (event.currentTarget.value !== scope) {
                  invalidate();
                  setScope(event.currentTarget.value);
                }
              }}
            />
          </label>
          <label htmlFor="circuit-detail">
            Detail
            <select
              id="circuit-detail"
              value={detail}
              onChange={(event) => {
                if (event.currentTarget.value !== detail) {
                  invalidate();
                  setDetail(event.currentTarget.value as typeof detail);
                }
              }}
            >
              <option value="expanded">Expanded</option>
              <option value="interface">Interfaces</option>
            </select>
          </label>
          <p>
            {result?.ok && result.selection.detail === "interface"
              ? `${result.selection.omittedInternalConnections} internal connections omitted. `
              : ""}
            Declared connections, not simulation or verified hardware. Boundary markers are not
            hardware.
          </p>
        </ToolMenu>
      </div>
    </section>
  );
}
