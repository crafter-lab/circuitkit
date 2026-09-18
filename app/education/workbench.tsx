"use client";

import Link from "next/link";
import { useEffect, useId, useMemo, useRef, useState } from "react";
import { EducationalFigure } from "../../src/v2/react.tsx";
import { validateEducational } from "../../src/v2/render.ts";
import type { PublicFigure } from "../../src/v2/schema.ts";
import { downloadBlob } from "../browser-export.ts";
import {
  adapterFamilies,
  type ExampleId,
  examples,
  families,
  type Selection,
  selectionQuery,
  stages,
  themes,
} from "./catalog.ts";
import { FigureViewport } from "./FigureViewport.tsx";
import { NetManifest } from "./net-manifest.tsx";
import { maxUploadBytes, parsePublicDraft, publicExport, retainSelection } from "./public-state.ts";

export type WorkbenchProps = {
  initialDocument: PublicFigure;
  initialSelection: Selection;
  editor?: boolean;
  initialAuthor?: string;
  deferPreviewUntilHydration?: boolean;
};
export function EducationWorkbench({
  initialDocument,
  initialSelection,
  editor = false,
  initialAuthor,
  deferPreviewUntilHydration = false,
}: WorkbenchProps) {
  const [hydrated, setHydrated] = useState(false);
  useEffect(() => setHydrated(true), []);
  const id = useId();
  const authorMode = initialAuthor !== undefined;
  const [selection, setSelection] = useState(initialSelection);
  const [document, setDocument] = useState<PublicFigure | null>(initialDocument);
  const [source, setSource] = useState(initialAuthor ?? JSON.stringify(initialDocument, null, 2));
  const [selected, setSelected] = useState<string[]>([]);
  const [interactive, setInteractive] = useState(false);
  const [caption, setCaption] = useState(false);
  const [status, setStatus] = useState("Selected public projection ready.");
  const [exporting, setExporting] = useState(false);
  const lastValid = useRef(initialDocument);
  const request = useRef<AbortController | null>(null);
  const raster = useRef<AbortController | null>(null);
  const revision = useRef(0);
  const entry = examples.find((item) => item.id === selection.case) ?? examples[1];
  const rendered = useMemo(() => (document ? publicExport(document, "svg") : null), [document]);
  const hasGraphic = Boolean(
    rendered?.text && rendered.bounds.width > 0 && rendered.bounds.height > 0,
  );

  function pause(message: string) {
    revision.current += 1;
    request.current?.abort();
    raster.current?.abort();
    setExporting(false);
    setDocument(null);
    setStatus(message);
  }
  function accept(next: PublicFigure, updateSource: boolean) {
    const previous = lastValid.current;
    setSelected((ids) => retainSelection(previous, next, ids));
    lastValid.current = next;
    setDocument(next);
    if (updateSource) setSource(JSON.stringify(next, null, 2));
    setStatus("Selected public projection ready.");
  }

  useEffect(
    () => () => {
      revision.current += 1;
      request.current?.abort();
      raster.current?.abort();
    },
    [],
  );

  useEffect(() => {
    if (!authorMode) return;
    const controller = new AbortController();
    request.current = controller;
    const currentRevision = revision.current;
    const timer = setTimeout(async () => {
      try {
        const body = JSON.stringify({
          author: JSON.parse(source),
          stage: selection.stage,
          theme: selection.theme,
        });
        if (new TextEncoder().encode(body).byteLength > maxUploadBytes)
          throw new Error("Too large");
        const response = await fetch("/api/education", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body,
          signal: controller.signal,
        });
        if (!response.ok) throw new Error("Compile failed");
        const payload = await response.json();
        const next = validateEducational(payload.document);
        if (!next.ok) throw new Error("Invalid projection");
        if (controller.signal.aborted || currentRevision !== revision.current) return;
        const previous = lastValid.current;
        setSelected((ids) => retainSelection(previous, next.document, ids));
        lastValid.current = next.document;
        setDocument(next.document);
        setStatus("Selected public projection ready.");
      } catch {
        if (controller.signal.aborted || currentRevision !== revision.current) return;
        setDocument(null);
        setStatus(
          "Invalid author draft. Preview and exports paused. Fix the JSON or reload a preset.",
        );
      }
    }, 300);
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [authorMode, source, selection.stage, selection.theme]);

  async function choose(next: Selection) {
    pause("Loading selected stage. Preview and exports paused.");
    if (authorMode && next.case !== selection.case) {
      window.location.assign(`/editor/education/author?${selectionQuery(next)}`);
      return;
    }
    setSelection(next);
    if (authorMode) return;
    const controller = new AbortController();
    request.current = controller;
    const currentRevision = revision.current;
    try {
      const response = await fetch(`/api/education?${selectionQuery(next)}`, {
        signal: controller.signal,
        cache: "no-store",
      });
      if (!response.ok) throw new Error("Unavailable");
      const payload = await response.json();
      const valid = validateEducational(payload.document);
      if (!valid.ok) throw new Error("Invalid public projection");
      if (!controller.signal.aborted && currentRevision === revision.current)
        accept(valid.document, true);
    } catch {
      if (!controller.signal.aborted && currentRevision === revision.current)
        setStatus("Figure unavailable. Reload a preset to recover.");
    }
  }
  function editSource(value: string) {
    pause(
      authorMode
        ? "Compiling uploaded author draft. Preview and exports paused."
        : "Invalid public draft. Preview and exports paused. Fix the JSON or reload a preset.",
    );
    setSource(value);
    if (!authorMode) {
      const next = parsePublicDraft(value);
      if (next) {
        accept(next, false);
        setSelection((previous) => ({ ...previous, theme: next.theme }));
      }
    }
  }
  function changeTheme(theme: Selection["theme"]) {
    if (authorMode || !document) {
      void choose({ ...selection, theme });
      return;
    }
    pause("Updating figure theme.");
    setSelection((previous) => ({ ...previous, theme }));
    const next = parsePublicDraft(JSON.stringify({ ...document, theme }));
    if (next) accept(next, true);
  }
  async function download(format: "svg" | "json" | "png") {
    if (!document || !rendered || (format !== "json" && !hasGraphic)) return;
    const currentRevision = revision.current;
    try {
      if (format === "png") {
        raster.current?.abort();
        const controller = new AbortController();
        raster.current = controller;
        setExporting(true);
        const { exportPublicPNG } = await import("./browser-export.ts");
        if (controller.signal.aborted) return;
        await exportPublicPNG(document, controller.signal);
      } else {
        const output = publicExport(document, format);
        if (!output) return;
        downloadBlob(
          new Blob([output.text], {
            type: format === "json" ? "application/json" : "image/svg+xml;charset=utf-8",
          }),
          `CircuitFigure.${format}`,
        );
      }
      if (currentRevision === revision.current)
        setStatus(
          `Downloaded selected public ${format.toUpperCase()}. Caption and selection are not exported.`,
        );
    } catch {
      if (currentRevision === revision.current)
        setStatus("Export unavailable. Try SVG or JSON instead.");
    } finally {
      if (currentRevision === revision.current) setExporting(false);
    }
  }
  return (
    <div
      className="education-workbench"
      data-education-workbench
      data-workspace={authorMode ? "author" : "public"}
    >
      <div className="education-toolbar">
        <label htmlFor={`${id}-family`}>
          Family
          <select
            id={`${id}-family`}
            value={entry?.family}
            onChange={(event) => {
              const next = examples.find((item) => item.family === event.target.value);
              if (next) void choose({ ...selection, case: next.id });
            }}
          >
            {families.map((family) => (
              <option key={family} value={family}>
                {family}
              </option>
            ))}
          </select>
        </label>
        <label className="education-case-control" htmlFor={`${id}-case`}>
          Case
          <select
            id={`${id}-case`}
            aria-describedby={`${id}-case-name ${id}-case-help`}
            value={selection.case}
            onChange={(event) =>
              void choose({ ...selection, case: event.target.value as ExampleId })
            }
          >
            {examples
              .filter((item) => item.family === entry?.family)
              .map((item) => (
                <option key={item.id} value={item.id}>
                  {item.title}
                </option>
              ))}
          </select>
        </label>
        <label htmlFor={`${id}-stage`}>
          Stage
          <select
            id={`${id}-stage`}
            value={selection.stage}
            onChange={(event) =>
              void choose({ ...selection, stage: event.target.value as Selection["stage"] })
            }
          >
            {stages.map((stage) => (
              <option key={stage}>{stage}</option>
            ))}
          </select>
        </label>
        <label htmlFor={`${id}-theme`}>
          Figure theme
          <select
            id={`${id}-theme`}
            value={selection.theme}
            onChange={(event) => changeTheme(event.target.value as Selection["theme"])}
          >
            {themes.map((theme) => (
              <option key={theme}>{theme}</option>
            ))}
          </select>
        </label>
        <button
          type="button"
          onClick={() => {
            if (authorMode)
              window.location.assign(`/editor/education/author?${selectionQuery(selection)}`);
            else void choose(selection);
          }}
        >
          Reload preset
        </button>
      </div>
      <p className="education-note">
        <span id={`${id}-case-name`} className="education-case-name">
          Selected case: {entry?.title}
        </span>
        <span id={`${id}-case-help`}>
          {entry?.detail} Preset and stage changes reload the public example. Some stages
          intentionally share the same given geometry.
        </span>
      </p>
      <div className={editor ? "education-editor-grid" : "education-preview-grid"}>
        {editor ? (
          <div className="education-source">
            <label htmlFor={`${id}-source`}>
              {authorMode
                ? "Author workspace JSON (all authored stages)"
                : "Selected public figure JSON"}
            </label>
            <p id={`${id}-source-help`} className="education-note">
              {authorMode
                ? "Intentional author upload, not assessment privacy. This browser holds all authored stages and sends this draft to the server to compile. Nothing is automatically stored. CSS does not protect stages."
                : "Only the selected public projection. Edit render-ready geometry and labels locally. No author models or unselected stages are loaded."}
            </p>
            <textarea
              id={`${id}-source`}
              aria-describedby={`${id}-source-help`}
              spellCheck={false}
              value={source}
              onChange={(event) => editSource(event.target.value)}
            />
          </div>
        ) : null}
        <div className="education-output">
          <div className="education-toolbar education-preview-controls">
            <button
              type="button"
              aria-pressed={interactive}
              onClick={() => setInteractive((value) => !value)}
            >
              Select targets
            </button>
            <button
              type="button"
              aria-pressed={caption}
              onClick={() => setCaption((value) => !value)}
            >
              Host caption
            </button>
            <button
              type="button"
              disabled={!selected.length || !document}
              onClick={() => setSelected([])}
            >
              Clear selection
            </button>
          </div>
          <div className="education-canvas" data-public-preview>
            {document && deferPreviewUntilHydration && !hydrated ? (
              <p className="education-note">
                Live public preview starts when the page is interactive. The public editor and
                gallery also provide server-rendered figures.
              </p>
            ) : document ? (
              <FigureViewport document={document}>
                <EducationalFigure
                  document={document}
                  namespace="showcase"
                  selectedTargets={selected}
                  onSelectionChange={interactive ? setSelected : undefined}
                  caption={caption ? <span>{document.description}</span> : undefined}
                />
              </FigureViewport>
            ) : (
              <p role="alert">Preview paused. No previous figure is displayed or exported.</p>
            )}
          </div>
          <p className="education-note" aria-live="polite">
            Selected targets: {document && selected.length ? selected.join(", ") : "none"}. Only
            explicitly allowed targets can be selected.
          </p>
          {document ? <NetManifest document={document} /> : null}
          {selection.case === "named-nets" ? (
            <p className="education-note">
              Whole-net demo: choose teaching or correction, then enable Select targets. Question
              intentionally exposes no whole-net targets. Approved membership is public data and can
              reveal an answer, not an assessment privacy feature.
            </p>
          ) : null}
          {interactive ? (
            <p className="education-note">
              Tab to a target; Enter or Space toggles it. Escape clears selection. Targets retain
              their allowed semantic identities across stages.
            </p>
          ) : null}
          <fieldset className="education-toolbar" aria-label="Export selected public figure">
            {(["svg", "png", "json"] as const).map((format) => (
              <button
                key={format}
                type="button"
                disabled={!rendered || exporting || (format !== "json" && !hasGraphic)}
                onClick={() => void download(format)}
              >
                Download {format.toUpperCase()}
              </button>
            ))}
            <span className="education-note">CircuitFigure · figure only · PNG 2×</span>
          </fieldset>
          {rendered && !hasGraphic ? (
            <p className="education-note">
              No drawing in this public stage. JSON export remains available; host captions are not
              image exports.
            </p>
          ) : null}
          <p role="status" className="education-status">
            {status}
          </p>
        </div>
      </div>
      <nav className="education-links" aria-label="Education capabilities">
        <Link href={`/editor/education?${selectionQuery(selection)}`} prefetch={false}>
          Public v2 editor
        </Link>
        <Link href={`/gallery/education?${selectionQuery(selection)}`} prefetch={false}>
          All 12 panel families
        </Link>
        <Link
          href={`/gallery/education?${selectionQuery(selection)}#adapter-families`}
          prefetch={false}
        >
          {adapterFamilies.length} adapter families
        </Link>
        <Link
          href={`/editor/education?${selectionQuery({ case: "named-nets", stage: "teaching", theme: selection.theme })}`}
          prefetch={false}
        >
          Try whole-net targets
        </Link>
        {editor ? (
          <Link
            href={
              authorMode
                ? `/editor/education?${selectionQuery(selection)}`
                : `/editor/education/author?${selectionQuery(selection)}`
            }
            prefetch={false}
          >
            {authorMode ? "Leave author workspace" : "Open explicit author workspace"}
          </Link>
        ) : null}
      </nav>
    </div>
  );
}
