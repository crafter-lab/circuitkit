import type { Box } from "../types.ts";
import { type Family, number, textPath } from "../typography.ts";
import { requireModel } from "./safety.ts";
import type { MathRun, Shape } from "./schema.ts";

type Vertex = readonly [number, number];
type Outline = readonly (readonly Vertex[])[];
const greater: Outline = [
  [
    [100, -650],
    [700, -410],
    [700, -330],
    [100, -90],
    [100, -180],
    [590, -370],
    [100, -560],
  ],
  [
    [100, 0],
    [700, 0],
    [700, 70],
    [100, 70],
  ],
];
const right: Outline = [
  [
    [80, -390],
    [565, -390],
    [385, -570],
    [440, -625],
    [720, -345],
    [440, -65],
    [385, -120],
    [565, -300],
    [80, -300],
  ],
];
const reflect = (outline: Outline): Outline =>
  outline.map((contour) => contour.map(([x, y]) => [800 - x, y] as const));
const rotate = (outline: Outline, direction: 1 | -1): Outline =>
  outline.map((contour) =>
    contour.map(([x, y]) => [400 - direction * (y + 345), -345 + direction * (x - 400)] as const),
  );
const operators = new Map<string, Outline>([
  ["≥", greater],
  ["≤", reflect(greater)],
  [
    "≠",
    [
      [
        [80, -500],
        [720, -500],
        [720, -425],
        [80, -425],
      ],
      [
        [80, -245],
        [720, -245],
        [720, -170],
        [80, -170],
      ],
      [
        [515, -700],
        [590, -670],
        [285, 30],
        [210, 0],
      ],
    ],
  ],
  ["←", reflect(right)],
  ["↑", rotate(right, -1)],
  ["↓", rotate(right, 1)],
  [
    "↔",
    [
      [
        [80, -345],
        [310, -575],
        [365, -520],
        [235, -390],
        [565, -390],
        [435, -520],
        [490, -575],
        [720, -345],
        [490, -115],
        [435, -170],
        [565, -300],
        [235, -300],
        [365, -170],
        [310, -115],
      ],
    ],
  ],
  [
    "Δ",
    [
      [
        [400, -720],
        [80, 0],
        [720, 0],
      ],
      [
        [400, -520],
        [210, -80],
        [590, -80],
      ],
    ],
  ],
]);

function merge(boxes: Box[]): Box {
  const x = Math.min(...boxes.map((b) => b.x));
  const y = Math.min(...boxes.map((b) => b.y));
  return {
    x,
    y,
    width: Math.max(...boxes.map((b) => b.x + b.width)) - x,
    height: Math.max(...boxes.map((b) => b.y + b.height)) - y,
  };
}

function educationalTextPath(text: string, family: Family, size: number, x: number, y: number) {
  const original = textPath(text, family, size, x, y);
  if (original.missing.length === 0) return original;
  let pending = "";
  let advance = 0;
  const boxes: Box[] = [];
  const paths: string[] = [];
  const missing: string[] = [];
  const flush = () => {
    if (!pending) return;
    const rendered = textPath(pending, family, size, x + advance, y);
    if (rendered.svg) boxes.push(rendered.box);
    paths.push(rendered.svg);
    missing.push(...rendered.missing);
    advance += rendered.advance;
    pending = "";
  };
  for (const character of text) {
    const outline = operators.get(character);
    if (!outline) {
      pending += character;
      continue;
    }
    flush();
    const scale = size / 1000;
    const vertices = outline.flat();
    const left = Math.min(...vertices.map(([x]) => x));
    const top = Math.min(...vertices.map(([, y]) => y));
    const right = Math.max(...vertices.map(([x]) => x));
    const bottom = Math.max(...vertices.map(([, y]) => y));
    const d = outline
      .map((contour) => `${contour.map(([x, y], i) => `${i ? "L" : "M"}${x} ${y}`).join("")}Z`)
      .join("");
    paths.push(
      `<path d="${d}" fill-rule="${character === "Δ" ? "evenodd" : "nonzero"}" transform="translate(${number(x + advance)} ${number(y)}) scale(${number(scale)})"/>`,
    );
    boxes.push({
      x: x + advance + left * scale,
      y: y + top * scale,
      width: (right - left) * scale,
      height: (bottom - top) * scale,
    });
    advance += 800 * scale;
  }
  flush();
  return {
    svg: paths.join(""),
    box: boxes.length ? merge(boxes) : { x, y, width: 0, height: 0 },
    advance,
    missing,
  };
}

export function mathGeometry(shape: Extract<Shape, { kind: "math" }>) {
  const runs = shape.runs.map((run) => {
    const size = run.script === "base" ? shape.size : shape.size * 0.7;
    const offset =
      run.script === "sub" ? shape.size * 0.25 : run.script === "sup" ? -shape.size * 0.45 : 0;
    const measured = educationalTextPath(run.text, shape.family, size, 0, 0);
    requireModel(measured.missing.length === 0, "text.unsupported-glyph");
    return { run, size, offset, advance: measured.advance };
  });
  const advance = runs.reduce((n, r) => n + r.advance, 0);
  let x =
    shape.at.x - (shape.align === "center" ? advance / 2 : shape.align === "right" ? advance : 0);
  const boxes: Box[] = [];
  const paths: string[] = [];
  for (const run of runs) {
    const result = educationalTextPath(
      run.run.text,
      shape.family,
      run.size,
      x,
      shape.at.y + run.offset,
    );
    if (result.svg) boxes.push(result.box);
    paths.push(result.svg);
    x += run.advance;
  }
  requireModel(boxes.length > 0, "text.empty-outline");
  return { bounds: merge(boxes), paths: paths.join(""), advance };
}

export function measureMath(runs: MathRun[], size = 14, family: Family = "sans") {
  const { bounds, advance } = mathGeometry({
    kind: "math",
    at: { x: 0, y: 0 },
    runs,
    size,
    align: "left",
    family,
    tone: "ink",
  });
  return { bounds, advance };
}
