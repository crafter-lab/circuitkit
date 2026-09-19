"use client";

import {
  type ButtonHTMLAttributes,
  type CSSProperties,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
} from "react";
import { CompactLegend } from "./compact-legend.tsx";
import { renderFigureSVG } from "./figure-svg.ts";
import {
  deriveStepPresentation,
  renderSchematicSVG,
  renderSVG,
  resolveSchematicComposition,
  type SchematicComposition,
} from "./renderer.ts";
import { resolveTheme } from "./theme.ts";
import type { Diagnostic, RenderResult, ResolvedNetAnnotation } from "./types.ts";
import { validateDocument } from "./validation.ts";

export interface CircuitLessonFigureProps {
  document: unknown;
  activeNet?: string | null;
  onActiveNetChange?: (net: string | null) => void;
  className?: string;
  onDiagnostics?: (diagnostics: Diagnostic[]) => void;
  download?: boolean;
  layout?: "compact" | "expanded";
  composition?: SchematicComposition;
  notes?: boolean;
  showDescription?: boolean;
}

export interface ResolveLessonFigureOptions {
  layout?: "compact" | "expanded";
  composition?: SchematicComposition;
}

function validateLessonFigureOptions(options: ResolveLessonFigureOptions): RenderResult | null {
  if (
    options === null ||
    typeof options !== "object" ||
    Array.isArray(options) ||
    Reflect.ownKeys(options).some((key) => key !== "layout" && key !== "composition") ||
    (options.layout !== undefined &&
      options.layout !== "compact" &&
      options.layout !== "expanded") ||
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
          message:
            'Expected only layout ("compact" or "expanded") and composition ("classic" or "compact").',
        },
      ],
    };
  return null;
}

export function resolveLessonFigure(
  document: unknown,
  activeNet?: string | null,
  options: ResolveLessonFigureOptions = {},
): RenderResult {
  const invalid = validateLessonFigureOptions(options);
  if (invalid) return invalid;
  const validation = validateDocument(document);
  if (!validation.ok) return validation;
  const composition = resolveSchematicComposition(validation.document, options.composition);
  const render =
    options.layout === "compact" || composition === "compact"
      ? (input: unknown) => renderSchematicSVG(input, { annotations: true, composition })
      : renderSVG;
  const result = render(validation.document);
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
  const presentation = deriveStepPresentation(result.document.presentation);
  const preview = render({
    ...result.document,
    presentation: {
      ...presentation,
      highlight: {
        components: presentation.highlight?.components ?? [],
        nets: activeNet === null ? [] : [activeNet],
      },
    },
  });
  return preview.ok && result.document.presentation.activeStep !== undefined
    ? { ...preview, document: result.document }
    : preview;
}

export function exportLessonFigure(
  persisted: RenderResult,
  options: ResolveLessonFigureOptions = {},
): RenderResult {
  const invalid = validateLessonFigureOptions(options);
  if (invalid) return invalid;
  if (!persisted.ok) return persisted;
  const composition = resolveSchematicComposition(persisted.document, options.composition);
  return options.layout === "compact" || composition === "compact"
    ? renderSchematicSVG(persisted.document, { annotations: true, composition })
    : renderFigureSVG(persisted.document);
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
  layout = "compact",
  composition,
  notes = true,
  showDescription = true,
}: CircuitLessonFigureProps) {
  const id = useId();
  const diagramId = `${id}-diagram`;
  const captionId = `${id}-caption`;
  const legendId = `${id}-legend`;
  const compact = layout === "compact";
  const persisted = useMemo(
    () => resolveLessonFigure(document, activeNet, { layout, composition }),
    [document, activeNet, layout, composition],
  );
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
    return resolveLessonFigure(persisted.document, preview, { layout, composition });
  }, [persisted, preview, layout, composition]);
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

  const resolvedComposition = resolveSchematicComposition(persisted.document, composition);
  const { theme } = resolveTheme(persisted.document);
  const selected =
    activeNet === undefined
      ? (deriveStepPresentation(persisted.document.presentation).highlight?.nets ?? [])
      : activeNet === null
        ? []
        : [activeNet];
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
    color: compact ? `var(--circuit-control-color, ${theme.label})` : theme.label,
    background: compact
      ? `var(--circuit-control-background, ${theme.background})`
      : theme.background,
    border: compact
      ? `1px solid var(--circuit-control-border, ${theme.border})`
      : `1px solid ${theme.border}`,
    borderRadius: compact ? "var(--circuit-control-radius, 0px)" : 5,
    minHeight: compact ? "var(--circuit-control-size, 32px)" : 36,
    minWidth: compact ? "var(--circuit-control-size, 32px)" : 36,
    padding: compact ? "2px 8px" : "6px 12px",
    boxSizing: "border-box",
    flexShrink: 0,
    whiteSpace: "nowrap",
    cursor: interactive ? "pointer" : "default",
  };
  const request = (net: string) => onActiveNetChange?.(selected.includes(net) ? null : net);
  const selectedNames = selected.map(
    (net) => annotations?.nets.find((item) => item.net === net)?.label ?? net,
  );
  const clear = () => {
    setHover(null);
    setFocus(null);
    onActiveNetChange?.(null);
  };
  const annotationProps = (
    annotation: ResolvedNetAnnotation,
  ): ButtonHTMLAttributes<HTMLButtonElement> => ({
    style: {
      ...buttonStyle,
      color: annotation.color,
      fontWeight: 650,
      borderColor: selected.includes(annotation.net)
        ? compact
          ? `var(--circuit-control-color, ${theme.label})`
          : theme.label
        : compact
          ? `var(--circuit-control-border, ${theme.border})`
          : theme.border,
      outline: focused === annotation.net ? `2px solid ${theme.label}` : undefined,
      outlineOffset: compact ? -3 : 3,
    },
    onPointerEnter: (event) => {
      if (event.pointerType === "touch") return;
      touch.current = false;
      setHover({ document, net: annotation.net });
    },
    onPointerLeave: () => setHover(null),
    onPointerDown: (event) => {
      touch.current = event.pointerType === "touch";
      if (touch.current) {
        setHover(null);
        setFocus(null);
      }
    },
    onFocus: (event) => {
      if (event.currentTarget.matches(":focus-visible")) {
        setHover(null);
        setFocus({ document, net: annotation.net });
      }
    },
    onPointerUp: (event) => {
      if (event.pointerType === "touch") {
        setHover(null);
        setFocus(null);
      }
    },
    onBlur: () => setFocus(null),
    onClick: () => request(annotation.net),
  });

  function saveFigure() {
    if (!persisted.ok) return;
    const exported = exportLessonFigure(persisted, { layout, composition });
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
      aria-describedby={!compact && caption ? captionId : undefined}
      data-mode={interactive ? "interactive" : "read-only"}
      data-layout={layout}
      style={{
        margin: 0,
        minWidth: 0,
        maxWidth: "100%",
        padding: compact ? 0 : "clamp(12px, 2vw, 24px)",
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
        aria-describedby={
          compact ? undefined : annotations?.legend ? legendId : caption ? captionId : undefined
        }
        tabIndex={0}
        onKeyDown={(event) => {
          if (!compact || !interactive || !annotations?.nets.length) return;
          const items = annotations.nets;
          const index = items.findIndex((item) => item.net === (focused ?? selected[0]));
          if (["ArrowRight", "ArrowLeft", "Home", "End"].includes(event.key)) {
            event.preventDefault();
            const next =
              event.key === "Home"
                ? 0
                : event.key === "End"
                  ? items.length - 1
                  : (index + (event.key === "ArrowRight" ? 1 : items.length - 1) + items.length) %
                    items.length;
            const item = items[next];
            if (item) {
              setHover(null);
              setFocus({ document, net: item.net });
            }
          } else if ((event.key === "Enter" || event.key === " ") && focused) {
            event.preventDefault();
            request(focused);
          }
        }}
        onBlur={(event) => {
          if (!event.currentTarget.contains(event.relatedTarget)) setFocus(null);
        }}
        style={{ width: "100%", maxWidth: "100%", overflowX: "auto", outlineOffset: 4 }}
      >
        <div
          style={{
            position: "relative",
            width: "100%",
            minWidth:
              resolvedComposition === "compact"
                ? width * 0.75
                : compact
                  ? 0
                  : Math.min(width, Math.max(360, width * 0.6)),
            maxWidth: compact ? width : undefined,
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
      {compact ? (
        <CompactLegend
          id={id}
          diagramId={diagramId}
          annotations={annotations}
          selected={selected}
          preview={preview}
          interactive={interactive}
          notes={notes}
          showDescription={showDescription}
          buttonStyle={buttonStyle}
          onClear={clear}
          onDownload={download ? saveFigure : undefined}
        />
      ) : annotations?.legend ? (
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
                    {...annotationProps(annotation)}
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
          style={
            compact
              ? {
                  position: "absolute",
                  width: 1,
                  height: 1,
                  padding: 0,
                  margin: -1,
                  overflow: "hidden",
                  clipPath: "inset(50%)",
                  whiteSpace: "nowrap",
                  border: 0,
                }
              : { margin: "12px 0 0", color: theme.muted, fontSize: 13 }
          }
        >
          {selectedNames.length
            ? `Selected: ${selectedNames.join(", ")}.`
            : "All nets shown. No selection."}
        </p>
      ) : null}
      {!compact && download ? (
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
      {!compact && caption ? (
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
