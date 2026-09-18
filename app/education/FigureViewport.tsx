"use client";

import {
  type CSSProperties,
  type ReactNode,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
} from "react";
import type { PublicFigure } from "../../src/v2/schema.ts";
import {
  figureViewportLayout,
  maximumViewportHeight,
  measureFigureViewport,
  revealViewportAxis,
  type ViewportMode,
  type ViewportSize,
  viewportHeightFraction,
  viewportPanDelta,
} from "./viewport-layout.ts";

export function FigureViewport({
  document,
  children,
}: {
  document: PublicFigure;
  children: ReactNode;
}) {
  const id = useId();
  const viewportId = `${id}-viewport`;
  const hintId = `${id}-viewport-help`;
  const viewport = useRef<HTMLElement | null>(null);
  const canvas = useRef<HTMLDivElement | null>(null);
  const metrics = useMemo(() => measureFigureViewport(document), [document]);
  const [size, setSize] = useState<ViewportSize | null>(null);
  const [view, setView] = useState<{ id: string; mode: ViewportMode }>({
    id: document.id,
    mode: "readable",
  });
  const mode = view.id === document.id ? view.mode : "readable";

  useEffect(() => {
    if (!metrics || !viewport.current) return;
    const region = viewport.current;
    const measure = () => {
      const next = {
        width: region.clientWidth,
        heightLimit: Math.min(maximumViewportHeight, window.innerHeight * viewportHeightFraction),
      };
      setSize((previous) =>
        previous?.width === next.width && previous.heightLimit === next.heightLimit
          ? previous
          : next,
      );
    };
    measure();
    const observer = typeof ResizeObserver === "undefined" ? null : new ResizeObserver(measure);
    observer?.observe(region);
    if (canvas.current) observer?.observe(canvas.current);
    window.addEventListener("resize", measure);
    return () => {
      observer?.disconnect();
      window.removeEventListener("resize", measure);
    };
  }, [metrics]);

  if (!metrics) return children;
  const layout = figureViewportLayout(metrics, size, mode);
  const style = {
    "--education-viewport-height": `min(${viewportHeightFraction * 100}vh, ${maximumViewportHeight}px)`,
    "--education-caption-width": size ? `${size.width}px` : "100%",
  } as CSSProperties;

  return (
    <div
      className="education-figure-viewport"
      data-figure-viewport
      data-view-mode={mode}
      data-min-readable-scale={metrics.minReadableScale}
      data-readable-width={metrics.readableWidth}
      style={style}
    >
      {layout.needsOverview ? (
        <fieldset
          className="education-toolbar education-viewport-controls"
          aria-label={`${document.title} viewing scale`}
        >
          <button
            type="button"
            aria-controls={viewportId}
            aria-pressed={mode === "readable"}
            onClick={() => setView({ id: document.id, mode: "readable" })}
          >
            Readable
          </button>
          <button
            type="button"
            aria-controls={viewportId}
            aria-describedby={hintId}
            aria-pressed={mode === "fit"}
            onClick={() => setView({ id: document.id, mode: "fit" })}
          >
            Fit
          </button>
          <span className="education-note">
            {mode === "readable" ? "Readable labels · local pan" : "Overview · labels may be small"}
          </span>
        </fieldset>
      ) : null}
      <section
        ref={viewport}
        id={viewportId}
        className="education-viewport-scroll"
        aria-label={`${document.title} figure viewport`}
        aria-describedby={layout.needsOverview ? hintId : undefined}
        tabIndex={size === null || (mode === "readable" && layout.needsOverview) ? 0 : -1}
        onKeyDown={(event) => {
          if (event.defaultPrevented || event.altKey || event.ctrlKey || event.metaKey) return;
          const delta = viewportPanDelta(event.key);
          const region = event.currentTarget;
          if (
            !delta ||
            (region.scrollWidth <= region.clientWidth && region.scrollHeight <= region.clientHeight)
          )
            return;
          event.preventDefault();
          event.stopPropagation();
          region.scrollBy({ ...delta, behavior: "auto" });
        }}
        onFocusCapture={(event) => {
          const region = event.currentTarget;
          if (event.target === region || !(event.target instanceof Element)) return;
          const target = event.target.closest("[data-target]");
          if (!target || !region.contains(target)) return;
          const targetBox = target.getBoundingClientRect();
          const regionBox = region.getBoundingClientRect();
          region.scrollBy({
            left: revealViewportAxis(
              targetBox.left,
              targetBox.right,
              regionBox.left + 8,
              regionBox.left + region.clientWidth - 8,
            ),
            top: revealViewportAxis(
              targetBox.top,
              targetBox.bottom,
              regionBox.top + 8,
              regionBox.top + region.clientHeight - 8,
            ),
            behavior: "auto",
          });
        }}
      >
        <div ref={canvas} className="education-viewport-canvas" style={{ width: layout.width }}>
          {children}
        </div>
      </section>
      {layout.needsOverview ? (
        <p id={hintId} className="education-note education-viewport-hint">
          {mode === "readable" ? (
            <>
              <span aria-hidden="true">
                {layout.horizontal ? "↔ " : ""}
                {layout.vertical ? "↕ " : ""}
              </span>
              Scroll or swipe inside the figure. Focus this viewport and use arrow keys to pan; Tab
              reaches allowed targets.
            </>
          ) : (
            "Fit is an overview, not the readable default. Choose Readable to inspect labels and pan locally."
          )}
        </p>
      ) : null}
    </div>
  );
}
