import type { MathRun, Part, Point, Shape } from "./schema.ts";
import { math } from "./values.ts";

type Tone = Shape["tone"];
export const point = (x: number, y: number): Point => ({ x, y });
export const line = (points: Point[], tone: Tone = "ink", dashed = false): Shape => ({
  kind: "line",
  points,
  tone,
  width: 2,
  dashed,
});
export const polygon = (points: Point[], tone: Tone = "ink"): Shape => ({
  kind: "polygon",
  points,
  tone,
  fill: "background",
  width: 2,
});
export const circle = (at: Point, radius = 4, tone: Tone = "ink", filled = true): Shape => ({
  kind: "circle",
  at,
  radius,
  tone,
  fill: filled ? tone : "background",
  stroke: 2,
});
export const rect = (at: Point, width: number, height: number, tone: Tone = "ink"): Shape => ({
  kind: "rect",
  at,
  width,
  height,
  radius: 3,
  tone,
  fill: "background",
  stroke: 2,
});
export const label = (
  at: Point,
  content: string | MathRun[],
  align: "left" | "center" | "right" = "left",
  size = 14,
  tone: Tone = "ink",
): Shape => ({
  kind: "math",
  at,
  runs: typeof content === "string" ? math(content) : content,
  size,
  align,
  family: "sans",
  tone,
});
export const part = (id: string, shapes: Shape[]): Part => ({ id, shapes });
export function translateShape(shape: Shape, offset: Point): Shape {
  const shift = (p: Point) => point(p.x + offset.x, p.y + offset.y);
  return shape.kind === "line" || shape.kind === "polygon"
    ? { ...shape, points: shape.points.map(shift) }
    : { ...shape, at: shift(shape.at) };
}
export function brokenLine(points: Point[]): Shape[] {
  const lengths = points
    .slice(1)
    .map((p, i) => Math.hypot(p.x - (points[i]?.x ?? 0), p.y - (points[i]?.y ?? 0)));
  const middle = lengths.reduce((a, b) => a + b, 0) / 2;
  const chunks: Point[][] = [[], []];
  let walked = 0;
  for (let i = 0; i < lengths.length; i++) {
    const a = points[i];
    const b = points[i + 1];
    const length = lengths[i] ?? 0;
    if (!a || !b || !length) continue;
    const sample = (t: number) => point(a.x + (b.x - a.x) * t, a.y + (b.y - a.y) * t);
    if (walked < middle - 5) {
      chunks[0]?.push(a, sample(Math.min(1, (middle - 5 - walked) / length)));
    }
    if (walked + length > middle + 5) {
      chunks[1]?.push(sample(Math.max(0, (middle + 5 - walked) / length)), b);
    }
    walked += length;
  }
  return chunks.filter((p) => p.length >= 2).map((p) => line(p));
}
