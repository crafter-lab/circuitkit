"use client";

import { type CSSProperties, useEffect, useId, useMemo, useRef, useState } from "react";
import { renderFigureSVG } from "./figure-svg.ts";
import { renderSVG } from "./renderer.ts";
import { resolveTheme } from "./theme.ts";
import type { Diagnostic, RenderResult, ResolvedNetAnnotation } from "./types.ts";

export interface CircuitLessonFigureProps {
  document: unknown;
  activeNet?: string | null;
  onActiveNetChange?: (net: string | null) => void;
  className?: string;
  onDiagnostics?: (diagnostics: Diagnostic[]) => void;
  download?: boolean;
}

export function resolveLessonFigure(document: unknown, activeNet?: string | null): RenderResult {
  const result = renderSVG(document);
  if (!result.ok || activeNet === undefined) return result;
  if (activeNet !== null && !Object.hasOwn(result.circuit.nets, activeNet)) {
    return {
      ok: false,
      diagnostics: [
        {
          code: "lesson.unknown_active_net",
          path: "/activeNet",
          message: `Unknown selected net: ${activeNet}. Choose a net in this circuit or null.`,
        },
      ],
    };
  }
  return renderSVG({
    ...result.document,
    presentation: {
      ...result.document.presentation,
      highlight: {
        ...result.document.presentation.highlight,
        nets: activeNet === null ? [] : [activeNet],
      },
    },
  });
}

export function exportLessonFigure(persisted: RenderResult): RenderResult {
  return persisted.ok ? renderFigureSVG(persisted.document) : persisted;
}

type ScreenTransform = Pick<DOMMatrix, "a" | "b" | "c" | "d" | "e" | "f">;

export function nearestAnnotationNet(
  annotations: readonly ResolvedNetAnnotation[],
  point: { x: number; y: number },
  matrix: ScreenTransform,
  radius = 12,
): string | null {
  let nearest: string | null = null;
  let minimum = Number.POSITIVE_INFINITY;
  let tied = false;
  const transform = ([x, y]: readonly [number, number]) => ({
    x: matrix.a * x + matrix.c * y + matrix.e,
    y: matrix.b * x + matrix.d * y + matrix.f,
  });
  for (const annotation of annotations) {
    let distance = Number.POSITIVE_INFINITY;
    for (const segment of annotation.segments) {
      const a = transform(segment.a);
      const b = transform(segment.b);
      const dx = b.x - a.x;
      const dy = b.y - a.y;
      const length = dx * dx + dy * dy;
      const t =
        length === 0
          ? 0
          : Math.max(0, Math.min(1, ((point.x - a.x) * dx + (point.y - a.y) * dy) / length));
      distance = Math.min(distance, (point.x - a.x - t * dx) ** 2 + (point.y - a.y - t * dy) ** 2);
    }
    if (distance < minimum - 1e-6) {
      minimum = distance;
      nearest = annotation.net;
      tied = false;
    } else if (Number.isFinite(distance) && Math.abs(distance - minimum) <= 1e-6) {
      tied = true;
    }
  }
  return !tied && minimum <= radius * radius ? nearest : null;
}

export function CircuitLessonFigure({
  document,
  activeNet,
  onActiveNetChange,
  className,
  onDiagnostics,
  download = false,
}: CircuitLessonFigureProps) {
  const id = useId();
  const diagramId = `${id}-diagram`;
  const captionId = `${id}-caption`;
  const legendId = `${id}-legend`;
  const persisted = useMemo(() => resolveLessonFigure(document, activeNet), [document, activeNet]);
  const [hover, setHover] = useState<{ document: unknown; net: string } | null>(null);
  const [focus, setFocus] = useState<{ document: unknown; net: string } | null>(null);
  const [downloadError, setDownloadError] = useState<{
    document: unknown;
    diagnostics: Diagnostic[];
  } | null>(null);
  const touch = useRef(false);
  const urls = useRef(new Set<string>());
  const annotations = persisted.ok ? persisted.annotations : undefined;
  const hovered = hover && hover.document === document ? hover.net : null;
  const focused = focus && focus.document === document ? focus.net : null;
  const preview = annotations?.nets.find(({ net }) => net === (hovered ?? focused))?.net;
  const visible = useMemo(() => {
    if (!persisted.ok || !preview) return persisted;
    return renderSVG({
      ...persisted.document,
      presentation: {
        ...persisted.document.presentation,
        highlight: { ...persisted.document.presentation.highlight, nets: [preview] },
      },
    });
  }, [persisted, preview]);
  const diagnostics = useMemo(
    () => [
      ...visible.diagnostics,
      ...(downloadError && downloadError.document === document ? downloadError.diagnostics : []),
    ],
    [visible, downloadError, document],
  );

  useEffect(() => {
    onDiagnostics?.(diagnostics);
  }, [diagnostics, onDiagnostics]);

  useEffect(() => {
    const owned = urls.current;
    const release = () => {
      for (const url of owned) URL.revokeObjectURL(url);
      owned.clear();
    };
    window.addEventListener("pagehide", release);
    return () => {
      window.removeEventListener("pagehide", release);
      release();
    };
  }, []);

  if (!persisted.ok || !visible.ok) {
    return (
      <figure className={className} style={{ margin: 0, minWidth: 0, overflowWrap: "anywhere" }}>
        <div role="alert">
          <p>Figure unavailable. Correct the document to continue.</p>
          <ul>
            {diagnostics.map((diagnostic) => (
              <li key={JSON.stringify(diagnostic)}>
                <strong>{diagnostic.code}</strong> {diagnostic.path || "/"}: {diagnostic.message}
                {diagnostic.validPins ? ` Valid pins: ${diagnostic.validPins.join(", ")}.` : null}
              </li>
            ))}
          </ul>
        </div>
      </figure>
    );
  }

  const { theme } = resolveTheme(persisted.document);
  const selected = persisted.document.presentation.highlight?.nets ?? [];
  const interactive = Boolean(onActiveNetChange);
  const title = persisted.document.presentation.title;
  const caption = annotations?.caption;
  const viewBox =
    visible.svg.match(/viewBox="([^"]+)"/)?.[1] ??
    `0 0 ${visible.bounds.width} ${visible.bounds.height}`;
  const width = Number(viewBox.split(/\s+/)[2]);
  const buttonStyle: CSSProperties = {
    font: "inherit",
    fontSize: "0.875rem",
    color: theme.label,
    background: theme.background,
    border: `1px solid ${theme.border}`,
    borderRadius: 5,
    minHeight: 36,
    minWidth: 36,
    padding: "6px 12px",
    cursor: interactive ? "pointer" : "default",
  };
  const request = (net: string) => onActiveNetChange?.(selected.includes(net) ? null : net);
  const selectedNames = selected.map(
    (net) => annotations?.nets.find((item) => item.net === net)?.label ?? net,
  );

  function saveFigure() {
    if (!persisted.ok) return;
    const exported = exportLessonFigure(persisted);
    if (!exported.ok) {
      setDownloadError({ document, diagnostics: exported.diagnostics });
      return;
    }
    try {
      const url = URL.createObjectURL(
        new Blob([exported.svg], { type: "image/svg+xml;charset=utf-8" }),
      );
      urls.current.add(url);
      const link = window.document.createElement("a");
      link.href = url;
      link.download = "circuit-lesson-figure.svg";
      window.document.body.append(link);
      link.click();
      link.remove();
      setDownloadError(null);
    } catch {
      setDownloadError({
        document,
        diagnostics: [
          {
            code: "lesson.download_failed",
            path: "/download",
            message:
              "The browser could not download this figure. Try again in a browser that supports SVG downloads.",
          },
        ],
      });
    }
  }

  return (
    <figure
      className={["circuit-lesson-figure", className].filter(Boolean).join(" ")}
      aria-label={title}
      aria-describedby={caption ? captionId : undefined}
      data-mode={interactive ? "interactive" : "read-only"}
      style={{
        margin: 0,
        minWidth: 0,
        maxWidth: "100%",
        padding: "clamp(12px, 2vw, 24px)",
        background: theme.background,
        color: theme.label,
        fontFamily: "var(--font-geist, Geist), system-ui, sans-serif",
        fontSize: 15,
        lineHeight: 1.6,
        overflowWrap: "anywhere",
      }}
      onKeyDown={(event) => {
        touch.current = false;
        if (event.key === "Escape") {
          setHover(null);
          setFocus(null);
          onActiveNetChange?.(null);
        }
      }}
    >
      <section
        id={diagramId}
        className="circuit-lesson-diagram"
        aria-label={`${title}: circuit diagram`}
        aria-describedby={annotations?.legend ? legendId : caption ? captionId : undefined}
        tabIndex={0}
        style={{ width: "100%", maxWidth: "100%", overflowX: "auto", outlineOffset: 4 }}
      >
        <div
          style={{
            position: "relative",
            width: "100%",
            minWidth: Math.min(width, Math.max(360, width * 0.6)),
          }}
        >
          <div
            dangerouslySetInnerHTML={{
              __html: visible.svg.replace(
                "<svg ",
                '<svg style="display:block;width:100%;height:auto" ',
              ),
            }}
          />
          {annotations?.nets.length ? (
            <svg
              className="circuit-lesson-hit-layer"
              viewBox={viewBox}
              aria-hidden="true"
              focusable="false"
              style={{
                position: "absolute",
                inset: 0,
                width: "100%",
                height: "100%",
                cursor: interactive ? "pointer" : "default",
              }}
              onPointerMove={(event) => {
                if (event.pointerType === "touch") return;
                touch.current = false;
                const matrix = event.currentTarget.getScreenCTM();
                const net = matrix
                  ? nearestAnnotationNet(
                      annotations.nets,
                      { x: event.clientX, y: event.clientY },
                      matrix,
                    )
                  : null;
                setHover((previous) =>
                  previous?.net === net && previous.document === document
                    ? previous
                    : net
                      ? { document, net }
                      : null,
                );
              }}
              onPointerLeave={() => setHover(null)}
              onPointerCancel={() => setHover(null)}
              onPointerDown={(event) => {
                touch.current = event.pointerType === "touch";
                if (touch.current) {
                  setHover(null);
                  setFocus(null);
                }
              }}
              onClick={(event) => {
                const matrix = event.currentTarget.getScreenCTM();
                const net = matrix
                  ? nearestAnnotationNet(
                      annotations.nets,
                      { x: event.clientX, y: event.clientY },
                      matrix,
                    )
                  : null;
                if (net) request(net);
              }}
            >
              {annotations.nets.map((annotation) => (
                <g key={annotation.net} data-hit-net={annotation.net}>
                  {annotation.paths.map((path, index) => (
                    <path
                      key={`${index}:${path}`}
                      d={path}
                      fill="none"
                      stroke="transparent"
                      strokeWidth={24}
                      vectorEffect="non-scaling-stroke"
                    />
                  ))}
                </g>
              ))}
            </svg>
          ) : null}
        </div>
      </section>
      {annotations?.legend ? (
        <>
          <div
            className="circuit-lesson-controls"
            style={{
              display: "flex",
              flexWrap: "wrap",
              alignItems: "center",
              gap: 12,
              marginTop: 16,
            }}
          >
            <button
              type="button"
              style={buttonStyle}
              disabled={!interactive}
              aria-controls={diagramId}
              onClick={() => {
                setHover(null);
                setFocus(null);
                onActiveNetChange?.(null);
              }}
            >
              Show all
            </button>
            <span style={{ color: theme.muted, fontSize: 13 }}>
              {interactive
                ? "Preview a label; select to keep it highlighted."
                : "Read-only figure. Selection is supplied by the author."}
            </span>
          </div>
          <dl
            id={legendId}
            className="circuit-lesson-legend"
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 240px), 1fr))",
              gap: "16px 24px",
              margin: "20px 0",
            }}
          >
            {annotations.nets.map((annotation, index) => (
              <div key={annotation.net} data-legend-net={annotation.net} style={{ minWidth: 0 }}>
                <dt>
                  <button
                    id={`${id}-net-${index}`}
                    type="button"
                    aria-controls={diagramId}
                    aria-describedby={`${id}-description-${index}`}
                    aria-pressed={selected.includes(annotation.net)}
                    aria-disabled={!interactive}
                    style={{
                      ...buttonStyle,
                      color: annotation.color,
                      fontWeight: 650,
                      borderColor: selected.includes(annotation.net) ? theme.label : theme.border,
                      outline: focused === annotation.net ? `2px solid ${theme.label}` : undefined,
                      outlineOffset: 3,
                    }}
                    onPointerEnter={(event) => {
                      if (event.pointerType === "touch") return;
                      touch.current = false;
                      setHover({ document, net: annotation.net });
                    }}
                    onPointerLeave={() => setHover(null)}
                    onPointerDown={(event) => {
                      touch.current = event.pointerType === "touch";
                      if (touch.current) {
                        setHover(null);
                        setFocus(null);
                      }
                    }}
                    onFocus={(event) => {
                      if (event.currentTarget.matches(":focus-visible")) {
                        setHover(null);
                        setFocus({ document, net: annotation.net });
                      }
                    }}
                    onPointerUp={(event) => {
                      if (event.pointerType === "touch") {
                        setHover(null);
                        setFocus(null);
                      }
                    }}
                    onBlur={() => setFocus(null)}
                    onClick={() => request(annotation.net)}
                  >
                    {annotation.label}
                  </button>
                </dt>
                <dd
                  id={`${id}-description-${index}`}
                  style={{ margin: "8px 0 0", color: theme.label }}
                >
                  {annotation.description}
                </dd>
              </div>
            ))}
          </dl>
        </>
      ) : null}
      {annotations ? (
        <p
          role="status"
          aria-live="polite"
          aria-atomic="true"
          style={{ margin: "12px 0 0", color: theme.muted, fontSize: 13 }}
        >
          {selectedNames.length
            ? `Selected: ${selectedNames.join(", ")}.`
            : "All nets shown. No selection."}
        </p>
      ) : null}
      {download ? (
        <button
          type="button"
          style={{ ...buttonStyle, cursor: "pointer", marginTop: 16 }}
          onClick={saveFigure}
        >
          Download figure SVG
        </button>
      ) : null}
      {downloadError && downloadError.document === document ? (
        <p role="alert">{downloadError.diagnostics.map(({ message }) => message).join(" ")}</p>
      ) : null}
      {caption ? (
        <figcaption
          id={captionId}
          className="circuit-lesson-caption"
          style={{ marginTop: 16, color: theme.muted, fontSize: 14 }}
        >
          {caption}
        </figcaption>
      ) : null}
    </figure>
  );
}
