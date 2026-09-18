import { measureMath } from "./math-text.ts";
import { requireModel } from "./safety.ts";
import type { Part, Point, Shape } from "./schema.ts";

type Box = { x: number; y: number; width: number; height: number };
type MathShape = Extract<Shape, { kind: "math" }>;
type Obstacle = { box: Box; segment?: [Point, Point]; occludes?: boolean; order?: number };
export type AnnotationRequest = {
  part: string;
  index: number;
  anchor: Point;
  directions: Point[];
  gap: number;
  priority: number;
  fixed?: Point;
  preferSide?: boolean;
  textGap?: number;
  track?: { left: number; right: number; center?: number };
};
const pad = (box: Box, amount: number): Box => ({
  x: box.x - amount,
  y: box.y - amount,
  width: box.width + 2 * amount,
  height: box.height + 2 * amount,
});
const overlaps = (a: Box, b: Box) =>
  a.x <= b.x + b.width && a.x + a.width >= b.x && a.y <= b.y + b.height && a.y + a.height >= b.y;
const boxOf = (points: Point[]): Box => {
  const x = Math.min(...points.map((p) => p.x));
  const y = Math.min(...points.map((p) => p.y));
  return {
    x,
    y,
    width: Math.max(...points.map((p) => p.x)) - x,
    height: Math.max(...points.map((p) => p.y)) - y,
  };
};

export function segmentIntersectsBox(a: Point, b: Point, box: Box): boolean {
  let low = 0;
  let high = 1;
  for (const [start, delta, min, max] of [
    [a.x, b.x - a.x, box.x, box.x + box.width],
    [a.y, b.y - a.y, box.y, box.y + box.height],
  ]) {
    if (start === undefined || delta === undefined || min === undefined || max === undefined)
      return false;
    if (delta === 0) {
      if (start < min || start > max) return false;
    } else {
      const first = (min - start) / delta;
      const last = (max - start) / delta;
      low = Math.max(low, Math.min(first, last));
      high = Math.min(high, Math.max(first, last));
      if (low > high) return false;
    }
  }
  return true;
}

function relativeInk(shape: MathShape): Box {
  const { bounds, advance } = measureMath(shape.runs, shape.size, shape.family);
  return {
    ...bounds,
    x: bounds.x - (shape.align === "center" ? advance / 2 : shape.align === "right" ? advance : 0),
  };
}
export function labelInkBox(shape: MathShape): Box {
  const box = relativeInk(shape);
  return { ...box, x: box.x + shape.at.x, y: box.y + shape.at.y };
}

function geometryObstacles(shape: Exclude<Shape, MathShape>): Obstacle[] {
  if (shape.kind === "circle")
    return [
      {
        box: pad(
          {
            x: shape.at.x - shape.radius,
            y: shape.at.y - shape.radius,
            width: shape.radius * 2,
            height: shape.radius * 2,
          },
          shape.stroke / 2 + 4,
        ),
      },
    ];
  if (shape.kind === "polygon") return [{ box: pad(boxOf(shape.points), shape.width / 2 + 4) }];
  const points =
    shape.kind === "line"
      ? shape.points
      : [
          shape.at,
          { x: shape.at.x + shape.width, y: shape.at.y },
          { x: shape.at.x + shape.width, y: shape.at.y + shape.height },
          { x: shape.at.x, y: shape.at.y + shape.height },
          shape.at,
        ];
  const padding = (shape.kind === "line" ? shape.width : shape.stroke) / 2 + 4;
  const obstacles: Obstacle[] = points.slice(1).map((b, i) => {
    const a = points[i] ?? b;
    return { box: pad(boxOf([a, b]), padding), segment: [a, b] as [Point, Point] };
  });
  if (shape.kind === "rect" && shape.fill !== "none")
    obstacles.push({
      box: pad({ x: shape.at.x, y: shape.at.y, width: shape.width, height: shape.height }, 4),
      occludes: true,
    });
  return obstacles;
}

export function placeAnnotations(display: Part[], requests: AnnotationRequest[]): void {
  if (!requests.length) return;
  requireModel(requests.length <= 1024 && display.length <= 2048, "layout.annotation-limit");
  const pending = new Set(requests.map((request) => `${request.part}:${request.index}`));
  const parts = new Map(display.map((part) => [part.id, part]));
  const geometry: Obstacle[] = [];
  const occupied: Box[] = [];
  const paintOrder = new Map<string, number>();
  let order = 0;
  for (const part of display) {
    part.shapes.forEach((shape, index) => {
      paintOrder.set(`${part.id}:${index}`, order++);
      if (shape.kind === "math") {
        if (!pending.has(`${part.id}:${index}`)) occupied.push(pad(labelInkBox(shape), 4));
      } else
        geometry.push(
          ...geometryObstacles(shape).map((obstacle) => ({ ...obstacle, order: order - 1 })),
        );
    });
  }
  const ordered = [...requests].sort(
    (a, b) =>
      Number(b.fixed !== undefined) - Number(a.fixed !== undefined) || a.priority - b.priority,
  );
  for (const request of ordered) {
    const shape = parts.get(request.part)?.shapes[request.index];
    requireModel(shape?.kind === "math", "layout.annotation-reference");
    const ink = relativeInk(shape);
    const annotationOrder = paintOrder.get(`${request.part}:${request.index}`) ?? 0;
    const clear = (box: Box) => {
      if (occupied.some((other) => overlaps(box, other))) return false;
      return !geometry.some((obstacle) => {
        if (obstacle.occludes && (obstacle.order ?? 0) <= annotationOrder) return false;
        if (!overlaps(box, obstacle.box)) return false;
        if (!obstacle.segment) return true;
        const [a, b] = obstacle.segment;
        const padding = (obstacle.box.width - Math.abs(b.x - a.x)) / 2;
        return segmentIntersectsBox(a, b, pad(box, padding));
      });
    };
    if (request.fixed) {
      const box = { ...ink, x: ink.x + request.fixed.x, y: ink.y + request.fixed.y };
      requireModel(clear(box), "layout.annotation-override-collision");
      shape.at = { ...request.fixed };
      occupied.push(pad(box, 4));
      continue;
    }
    const candidates: Point[] = [];
    if (request.track) {
      const original = {
        x: request.track.center ?? shape.at.x + ink.x + ink.width / 2,
        y: shape.at.y + ink.y + ink.height / 2,
      };
      candidates.push(original);
      const sign = request.directions[0]?.x ?? 1;
      for (const offset of [8, 16, 24, 40, 64, 96, 144, 208, 320, 512]) {
        candidates.push(
          { x: original.x + sign * offset, y: original.y },
          { x: original.x - sign * offset, y: original.y },
        );
      }
      for (const offset of [20, 40, 64, 104, 160, 240]) {
        for (const y of [original.y + offset, original.y - offset]) {
          for (const x of [original.x, original.x + 40, original.x - 40]) candidates.push({ x, y });
        }
      }
    } else {
      const directions = [
        ...request.directions,
        { x: 1, y: 0 },
        { x: -1, y: 0 },
        { x: 0, y: -1 },
        { x: 0, y: 1 },
        { x: 1, y: -1 },
        { x: -1, y: -1 },
        { x: 1, y: 1 },
        { x: -1, y: 1 },
      ];
      const choices = request.preferSide
        ? [
            ...[0, 8, 20, 40].map((offset) => ({
              offset,
              directions: request.directions.slice(0, 1),
            })),
            ...[0, 8, 20, 40, 72, 120, 192, 312, 512].map((offset) => ({ offset, directions })),
          ]
        : [0, 8, 20, 40, 72, 120, 192, 312, 512].map((offset) => ({ offset, directions }));
      for (const { offset, directions } of choices) {
        for (const direction of directions) {
          const length = Math.hypot(direction.x, direction.y);
          if (!length) continue;
          const dx = direction.x / length;
          const dy = direction.y / length;
          const distance =
            request.gap + offset + (Math.abs(dx) * ink.width) / 2 + (Math.abs(dy) * ink.height) / 2;
          candidates.push({
            x: request.anchor.x + dx * distance,
            y: request.anchor.y + dy * distance,
          });
        }
      }
    }
    let placed = false;
    for (const center of candidates) {
      let x = (request.track?.center ?? center.x) - ink.width / 2;
      const y = center.y - ink.height / 2;
      if (request.track) {
        if (ink.width > request.track.right - request.track.left) continue;
        x = Math.min(request.track.right - ink.width, Math.max(request.track.left, x));
      }
      const at = { x: x - ink.x, y: y - ink.y };
      if (Math.abs(at.x) > 10000 || Math.abs(at.y) > 10000) continue;
      const box = { x, y, width: ink.width, height: ink.height };
      if (!clear(box)) continue;
      shape.at = at;
      occupied.push(pad(box, request.textGap ?? 4));
      placed = true;
      break;
    }
    requireModel(placed, "layout.annotation-placement");
  }
}
