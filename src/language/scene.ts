import type { PublicFigure } from "../v2/schema.ts";
import type { PresentationPlan } from "./types.ts";

export function presentationFigure(
  figure: PublicFigure,
  scene?: PresentationPlan["scenes"][number],
): PublicFigure {
  if (!scene || scene.unavailable.length) return figure;
  const targets = new Set(scene.targets);
  return {
    ...figure,
    display: figure.display.map((part) => ({
      ...part,
      shapes: part.shapes.map((shape) => {
        if (shape.kind === "math") return shape;
        if (targets.has(part.id)) return { ...shape, tone: "accent" };
        return scene.dim ? { ...shape, tone: "muted" } : shape;
      }),
    })),
  };
}

export function directionArrow(points: { x: number; y: number }[]): string {
  const segments = points.slice(1).map((b, i) => {
    const a = points[i] as { x: number; y: number };
    return { a, b, length: Math.hypot(b.x - a.x, b.y - a.y) };
  });
  let remaining = segments.reduce((sum, segment) => sum + segment.length, 0) / 2;
  for (const { a, b, length } of segments) {
    if (length <= 0) continue;
    if (remaining > length) {
      remaining -= length;
      continue;
    }
    const dx = (b.x - a.x) / length,
      dy = (b.y - a.y) / length;
    const x = a.x + dx * remaining,
      y = a.y + dy * remaining;
    return `${x + dx * 7},${y + dy * 7} ${x - dx * 6 - dy * 4},${y - dy * 6 + dx * 4} ${x - dx * 6 + dy * 4},${y - dy * 6 - dx * 4}`;
  }
  return "";
}
