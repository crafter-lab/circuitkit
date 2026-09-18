import { inspectEducational } from "../../src/v2/render.ts";

export const minimumFigureFontSize = 12;
export const maximumViewportHeight = 480;
export const viewportHeightFraction = 0.6;

export type ViewportMetrics = {
  contentWidth: number;
  contentHeight: number;
  minimumBaseSize: number | null;
  minReadableScale: number;
  readableWidth: number;
  readableHeight: number;
};
export type ViewportMode = "readable" | "fit";
export type ViewportSize = { width: number; heightLimit: number };

export function measureFigureViewport(document: unknown): ViewportMetrics | null {
  const result = inspectEducational(document);
  if (!result.ok || result.bounds.width <= 0 || result.bounds.height <= 0) return null;
  let minimumBaseSize = Number.POSITIVE_INFINITY;
  for (const part of result.document.display)
    for (const shape of part.shapes)
      if (shape.kind === "math" && shape.runs.some((run) => run.text.trim().length > 0))
        minimumBaseSize = Math.min(minimumBaseSize, shape.size);
  const baseSize = Number.isFinite(minimumBaseSize) ? minimumBaseSize : null;
  const minReadableScale = Math.max(1, minimumFigureFontSize / (baseSize ?? minimumFigureFontSize));
  const readableWidth = Math.ceil(result.bounds.width * minReadableScale);
  return {
    contentWidth: result.bounds.width,
    contentHeight: result.bounds.height,
    minimumBaseSize: baseSize,
    minReadableScale,
    readableWidth,
    readableHeight: (readableWidth * result.bounds.height) / result.bounds.width,
  };
}

export function figureViewportLayout(
  metrics: ViewportMetrics,
  size: ViewportSize | null,
  mode: ViewportMode,
) {
  const measured =
    size !== null &&
    Number.isFinite(size.width) &&
    size.width > 0 &&
    Number.isFinite(size.heightLimit) &&
    size.heightLimit > 0;
  const horizontal = measured && metrics.readableWidth > size.width + 0.5;
  const vertical = measured && metrics.readableHeight > size.heightLimit + 0.5;
  const width =
    mode === "fit" && measured
      ? Math.min(
          metrics.readableWidth,
          size.width,
          (size.heightLimit * metrics.contentWidth) / metrics.contentHeight,
        )
      : metrics.readableWidth;
  return {
    width,
    height: (width * metrics.contentHeight) / metrics.contentWidth,
    scale: width / metrics.contentWidth,
    needsOverview: horizontal || vertical,
    horizontal,
    vertical,
  };
}

export function viewportPanDelta(key: string): { left: number; top: number } | null {
  switch (key) {
    case "ArrowLeft":
      return { left: -64, top: 0 };
    case "ArrowRight":
      return { left: 64, top: 0 };
    case "ArrowUp":
      return { left: 0, top: -64 };
    case "ArrowDown":
      return { left: 0, top: 64 };
    default:
      return null;
  }
}

export function revealViewportAxis(
  start: number,
  end: number,
  visibleStart: number,
  visibleEnd: number,
): number {
  if (start < visibleStart) return start - visibleStart;
  if (end > visibleEnd) return Math.min(start - visibleStart, end - visibleEnd);
  return 0;
}
