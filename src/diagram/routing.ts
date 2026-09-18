import type { Point } from "../v2/schema.ts";
import { reject } from "./safety.ts";

export type Box = { x: number; y: number; width: number; height: number };
export type Routed = { points: Point[]; net: string };
export const inside = (p: Point, b: Box) =>
  p.x > b.x + 0.01 && p.x < b.x + b.width - 0.01 && p.y > b.y + 0.01 && p.y < b.y + b.height - 0.01;
export function enters(a: Point, b: Point, box: Box): boolean {
  if (a.y === b.y)
    return (
      a.y > box.y &&
      a.y < box.y + box.height &&
      Math.max(a.x, b.x) > box.x &&
      Math.min(a.x, b.x) < box.x + box.width
    );
  return (
    a.x > box.x &&
    a.x < box.x + box.width &&
    Math.max(a.y, b.y) > box.y &&
    Math.min(a.y, b.y) < box.y + box.height
  );
}
export function simplify(points: Point[]): Point[] {
  const result: Point[] = [];
  for (const p of points) {
    const last = result.at(-1);
    if (last && last.x === p.x && last.y === p.y) continue;
    const before = result.at(-2);
    if (
      last &&
      before &&
      ((before.x === last.x && last.x === p.x) || (before.y === last.y && last.y === p.y))
    )
      result.pop();
    result.push(p);
  }
  return result;
}
function shared(a: Point, b: Point, c: Point, d: Point) {
  return a.y === b.y && c.y === d.y && a.y === c.y
    ? Math.min(Math.max(a.x, b.x), Math.max(c.x, d.x)) -
        Math.max(Math.min(a.x, b.x), Math.min(c.x, d.x)) >
        0.1
    : a.x === b.x &&
        c.x === d.x &&
        a.x === c.x &&
        Math.min(Math.max(a.y, b.y), Math.max(c.y, d.y)) -
          Math.max(Math.min(a.y, b.y), Math.min(c.y, d.y)) >
          0.1;
}
function crosses(a: Point, b: Point, c: Point, d: Point) {
  if (a.y === b.y && c.x === d.x)
    return (
      c.x > Math.min(a.x, b.x) &&
      c.x < Math.max(a.x, b.x) &&
      a.y > Math.min(c.y, d.y) &&
      a.y < Math.max(c.y, d.y)
    );
  if (a.x === b.x && c.y === d.y) return crosses(c, d, a, b);
  return false;
}

export function routeBetween(
  start: Point,
  end: Point,
  startSide: number,
  endSide: number,
  boxes: Box[],
  occupied: Routed[],
  net: string,
): Point[] {
  const a = { x: start.x + startSide * 24, y: start.y };
  const b = { x: end.x + endSide * 24, y: end.y };
  const cost = (p: Point, q: Point) => {
    if (Math.min(p.y, q.y) < 146 || boxes.some((box) => enters(p, q, box))) return Infinity;
    let crossing = 0;
    for (const route of occupied) {
      if (route.net === net) continue;
      for (let i = 1; i < route.points.length; i++) {
        const c = route.points[i - 1],
          d = route.points[i];
        if (!c || !d) continue;
        if (shared(p, q, c, d)) return Infinity;
        if (crosses(p, q, c, d)) crossing += 180;
      }
    }
    return Math.abs(p.x - q.x) + Math.abs(p.y - q.y) + crossing;
  };
  const mid = (a.x + b.x) / 2;
  const candidates =
    a.y === b.y
      ? [[a, b]]
      : [
          [a, { x: mid, y: a.y }, { x: mid, y: b.y }, b],
          [a, { x: b.x, y: a.y }, b],
          [a, { x: a.x, y: b.y }, b],
        ];
  for (const candidate of candidates) {
    if (candidate.slice(1).every((p, i) => Number.isFinite(cost(candidate[i] as Point, p))))
      return simplify([start, ...candidate, end]);
  }
  const xs = new Set<number>([a.x, b.x]);
  const ys = new Set<number>([a.y, b.y]);
  for (const box of boxes) {
    xs.add(box.x - 24);
    xs.add(box.x + box.width + 24);
    ys.add(box.y - 24);
    ys.add(box.y + box.height + 24);
  }
  for (const route of occupied)
    for (const p of route.points) {
      xs.add(p.x - 12);
      xs.add(p.x + 12);
      ys.add(p.y - 12);
      ys.add(p.y + 12);
    }
  const x = [...xs].sort((u, v) => u - v),
    y = [...ys].sort((u, v) => u - v);
  const nx = x.length,
    size = nx * y.length;
  if (size > 120000)
    reject(
      "diagram.routing-budget",
      "/connections",
      "The routing grid is too large; split the system into smaller diagrams.",
    );
  const source = y.indexOf(a.y) * nx + x.indexOf(a.x),
    destination = y.indexOf(b.y) * nx + x.indexOf(b.x);
  const distance = new Float64Array(size * 2).fill(Infinity),
    parent = new Int32Array(size * 2).fill(-1);
  const heap: { state: number; priority: number }[] = [];
  const push = (state: number, priority: number) => {
    let i = heap.length;
    heap.push({ state, priority });
    while (i > 0) {
      const j = (i - 1) >> 1;
      const h = heap[j];
      if (!h || h.priority <= priority) break;
      heap[i] = h;
      i = j;
    }
    heap[i] = { state, priority };
  };
  const pop = () => {
    const first = heap[0],
      last = heap.pop();
    if (heap.length && last) {
      let i = 0;
      while (true) {
        let c = i * 2 + 1;
        if (c >= heap.length) break;
        if (
          c + 1 < heap.length &&
          (heap[c + 1]?.priority ?? Infinity) < (heap[c]?.priority ?? Infinity)
        )
          c++;
        const h = heap[c];
        if (!h || h.priority >= last.priority) break;
        heap[i] = h;
        i = c;
      }
      heap[i] = last;
    }
    return first;
  };
  const pt = (index: number): Point => ({
    x: x[index % nx] as number,
    y: y[Math.floor(index / nx)] as number,
  });
  distance[source * 2] = 0;
  distance[source * 2 + 1] = 0;
  push(source * 2, 0);
  push(source * 2 + 1, 0);
  let found = -1;
  while (heap.length) {
    const current = pop();
    if (!current) break;
    const cell = current.state >> 1,
      axis = current.state & 1,
      p = pt(cell);
    if (cell === destination) {
      found = current.state;
      break;
    }
    for (const [dx, dy, nextAxis] of [
      [-1, 0, 0],
      [1, 0, 0],
      [0, -1, 1],
      [0, 1, 1],
    ] as const) {
      const ix = (cell % nx) + dx,
        iy = Math.floor(cell / nx) + dy;
      if (ix < 0 || ix >= nx || iy < 0 || iy >= y.length) continue;
      const next = iy * nx + ix,
        q = pt(next);
      if (boxes.some((box) => inside(q, box))) continue;
      const step = cost(p, q) + (axis === nextAxis ? 0 : 32);
      const value = (distance[current.state] ?? Infinity) + step,
        state = next * 2 + nextAxis;
      if (value >= (distance[state] ?? Infinity)) continue;
      distance[state] = value;
      parent[state] = current.state;
      push(state, value + Math.abs(q.x - b.x) + Math.abs(q.y - b.y));
    }
  }
  if (found < 0)
    reject(
      "diagram.routing",
      "/connections",
      "Unable to route this system without overlapping distinct conductors; split it into smaller diagrams.",
    );
  const path: Point[] = [];
  for (let state = found; state >= 0; state = parent[state] ?? -1) path.push(pt(state >> 1));
  return simplify([start, ...path.reverse(), end]);
}

export function bridgeCrossings(route: Routed, earlier: Routed[]): Point[] {
  const result: Point[] = [];
  for (let i = 1; i < route.points.length; i++) {
    const a = route.points[i - 1],
      b = route.points[i];
    if (!a || !b) continue;
    if (!result.length) result.push(a);
    const hits: number[] = [];
    if (a.y === b.y)
      for (const other of earlier) {
        if (other.net === route.net) continue;
        for (let j = 1; j < other.points.length; j++) {
          const c = other.points[j - 1],
            d = other.points[j];
          if (
            c &&
            d &&
            crosses(a, b, c, d) &&
            Math.min(Math.abs(c.x - a.x), Math.abs(c.x - b.x)) > 12
          )
            hits.push(c.x);
        }
      }
    for (const cx of [...new Set(hits)].sort((u, v) => (b.x - a.x) * (u - v))) {
      const sign = b.x > a.x ? 1 : -1;
      for (const [dx, dy] of [
        [-6, 0],
        [-5, -3],
        [-3, -5],
        [0, -6],
        [3, -5],
        [5, -3],
        [6, 0],
      ])
        result.push({ x: cx + (dx ?? 0) * sign, y: a.y + (dy ?? 0) });
    }
    result.push(b);
  }
  return result;
}
