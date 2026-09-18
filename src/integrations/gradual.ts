import { z } from "zod";
import { validatePanelIdentity } from "../v2/compiler.ts";
import { analyzeElectrical } from "../v2/electrical.ts";
import {
  type AuthorFigure,
  authored,
  type ElectricalPanel,
  type Failure,
  known,
  label,
  line,
  type MathRun,
  type Panel,
  type Part,
  type PublicFigure,
  polygon,
  projectFigure,
  renderEducationalSVG,
  type Shape,
  type Stage,
  type StageModel,
  type Theme,
  translateShape,
  type Unit,
  unknown,
  type Value,
} from "../v2/index.ts";
import { mathGeometry } from "../v2/math-text.ts";
import { boundedJSON, failure } from "../v2/safety.ts";
import {
  partSchema,
  publicSchema,
  runsSchema,
  stageModelSchema,
  stageSchema,
  themeSchema,
} from "../v2/schema.ts";

const text = z.string().max(1000);
const number = z.number().finite().min(-1e12).max(1e12);
const level = z.enum(["HIGH", "LOW"]);
const timeUnit = z.enum(["s", "ms", "us", "ticks"]);
const optionalText = text.optional();
const flag = z.boolean().optional();
const figureSchema = z.strictObject({
  kind: z.enum([
    "loop",
    "divider",
    "breadboard",
    "potentials",
    "node-comparison",
    "fragment",
    "led",
    "supply",
    "pullup",
    "signal",
    "timeline",
    "levels",
    "power",
    "bars",
    "scale",
    "readings",
    "board",
    "record",
  ]),
  caption: text,
  supply: optionalText,
  upper: optionalText,
  lower: optionalText,
  open: flag,
  potentials: z.tuple([text, text, text]).optional(),
  potentialLabels: z.tuple([text, text, text]).optional(),
  bypass: z.enum(["upper", "lower"]).optional(),
  load: optionalText,
  current: optionalText,
  boardRows: z.tuple([number.int(), number.int(), number.int()]).optional(),
  probes: z.tuple([z.enum(["A", "B", "C"]), z.enum(["A", "B", "C"])]).optional(),
  highlightNodes: flag,
  showNodes: flag,
  voltmeter: z.strictObject({ reading: optionalText }).optional(),
  fragment: z
    .strictObject({
      labels: z.array(text).min(2).max(32),
      resistorAfter: number.int().nonnegative().optional(),
      bent: flag,
    })
    .optional(),
  signal: z
    .strictObject({
      samples: z.array(level).min(1).max(128).optional(),
      changes: z.array(number).min(1).max(128).optional(),
      settles: level.optional(),
      window: z
        .strictObject({ from: number, length: number.positive(), label: optionalText })
        .optional(),
      accept: number.optional(),
      unit: timeUnit.optional(),
      end: number.optional(),
      markEdges: z.enum(["falling", "rising", "both"]).optional(),
      sampleLabels: flag,
    })
    .optional(),
  timeline: z
    .strictObject({
      start: number.int().nonnegative(),
      now: number.int().nonnegative(),
      max: number.int().nonnegative().optional(),
      unit: timeUnit,
      showDifference: flag,
      difference: optionalText,
      window: number.positive().optional(),
    })
    .optional(),
  levels: z
    .strictObject({
      low: number,
      high: number,
      max: number.positive(),
      value: number.optional(),
      unit: z.literal("V").optional(),
      showResult: flag,
    })
    .optional(),
  power: z
    .strictObject({
      voltage: optionalText,
      current: optionalText,
      resistance: optionalText,
      power: optionalText,
      formula: optionalText,
    })
    .optional(),
  bars: z
    .strictObject({
      items: z
        .array(
          z.strictObject({
            label: text,
            value: number,
            display: text,
            role: z.enum(["demand", "rating", "other"]).optional(),
          }),
        )
        .min(1)
        .max(32),
      unit: text,
      threshold: z.strictObject({ value: number, label: text }).optional(),
      max: number.optional(),
    })
    .optional(),
  scale: z
    .strictObject({
      base: text,
      prefixed: text,
      factor: number.positive(),
      value: number.optional(),
      from: z.enum(["base", "prefixed"]),
      showResult: flag,
      ticks: z.array(number).min(2).max(16).optional(),
    })
    .optional(),
  readings: z
    .strictObject({
      items: z
        .array(z.strictObject({ label: text, value: text, unit: optionalText, mode: optionalText }))
        .min(1)
        .max(32),
      difference: optionalText,
      quantity: optionalText,
    })
    .optional(),
  board: z
    .strictObject({
      mcu: optionalText,
      bridge: optionalText,
      unknown: z
        .array(z.enum(["mcu", "bridge"]))
        .max(2)
        .optional(),
      pins: z
        .array(
          z.strictObject({
            name: text,
            role: z.enum(["gpio", "input-only", "power", "ground", "strapping"]).optional(),
            highlight: flag,
          }),
        )
        .max(128)
        .optional(),
    })
    .optional(),
  record: z
    .strictObject({
      fields: z
        .array(z.strictObject({ label: text, value: optionalText, missing: flag, flagged: flag }))
        .min(1)
        .max(32),
      verdict: optionalText,
    })
    .optional(),
});
type Figure = z.infer<typeof figureSchema>;
export type GradualText = MathRun[];
export type GradualHost = {
  kind: "figure" | "record" | "no-figure";
  caption: GradualText;
  notes: { id: string; label: GradualText; value: GradualText }[];
  record?: {
    id: string;
    label: GradualText;
    value: GradualText;
    missing: boolean;
    flagged: boolean;
  }[];
  verdict?: GradualText;
  additions?: Part[];
};
const hostRuns = z.array(runsSchema.element).max(128);
const hostSchema = z.strictObject({
  kind: z.enum(["figure", "record", "no-figure"]),
  caption: hostRuns,
  notes: z.array(z.strictObject({ id: text, label: hostRuns, value: hostRuns })).max(256),
  record: z
    .array(
      z.strictObject({
        id: text,
        label: hostRuns,
        value: hostRuns,
        missing: z.boolean(),
        flagged: z.boolean(),
      }),
    )
    .max(64)
    .optional(),
  verdict: hostRuns.optional(),
  additions: z.array(partSchema).max(256).optional(),
});
export type GradualAdapted = { ok: true; model: StageModel; diagnostics: []; host: GradualHost };
export type GradualPair = {
  ok: true;
  author: AuthorFigure;
  diagnostics: [];
  host: Record<Stage, GradualHost>;
};

const subs: Record<string, string> = {
  "₀": "0",
  "₁": "1",
  "₂": "2",
  "₃": "3",
  "₄": "4",
  "₅": "5",
  "₆": "6",
  "₇": "7",
  "₈": "8",
  "₉": "9",
  ₛ: "s",
};
const supers: Record<string, string> = {
  "⁰": "0",
  "¹": "1",
  "²": "2",
  "³": "3",
  "⁴": "4",
  "⁵": "5",
  "⁶": "6",
  "⁷": "7",
  "⁸": "8",
  "⁹": "9",
};

export function gradualText(input: string): GradualText {
  const clean = input
    .replace(/<(script|style|iframe|object)\b[^>]*>[\s\S]*?<\/\1\s*>/gi, "")
    .replace(/<\/?[A-Za-z][^>]*>/g, "")
    .replace(/\\(?:html\w*|href|url|includegraphics)\s*(?:\{[^{}]*\}){1,2}/gi, "")
    .replace(/\\(?:mathrm|text|mathbf|operatorname)\{([^{}]*)\}/g, "$1")
    .replace(/\\frac\{([^{}]*)\}\{([^{}]*)\}/g, "($1)/($2)")
    .replace(
      /\\(Omega|mu|times|cdot|pm|geq|leq|ge|le|rightarrow|to|approx|lvert|rvert|Delta)\b/g,
      (_, key: string) =>
        ({
          Omega: "Ω",
          mu: "µ",
          times: "×",
          cdot: "·",
          pm: "±",
          geq: "≥",
          leq: "≤",
          ge: "≥",
          le: "≤",
          to: "→",
          approx: "≈",
          lvert: "|",
          rvert: "|",
          rightarrow: "→",
          Delta: "Δ",
        })[key] ?? key,
    )
    .replace(/\\[,;! ]/g, " ")
    .replace(/\$|`|\*\*/g, "")
    .split("")
    .map((c) => {
      const code = c.charCodeAt(0);
      return code < 32 || (code >= 127 && code <= 159) ? " " : c;
    })
    .join("");
  const runs: MathRun[] = [];
  const push = (value: string, script: MathRun["script"]) => {
    if (!value) return;
    const last = runs.at(-1);
    if (last?.script === script && last.text.length + value.length <= 240) last.text += value;
    else runs.push({ text: value, script });
  };
  const re =
    /([_^])(?:\{([^{}]*)\}|([A-Za-z0-9])(?=$|[^A-Za-z0-9]))|([₀₁₂₃₄₅₆₇₈₉ₛ⁰¹²³⁴⁵⁶⁷⁸⁹])|([^_^₀₁₂₃₄₅₆₇₈₉ₛ⁰¹²³⁴⁵⁶⁷⁸⁹]+)|([_^])/gu;
  for (const match of clean.matchAll(re)) {
    if (match[1]) push(match[2] ?? match[3] ?? "", match[1] === "_" ? "sub" : "sup");
    else if (match[4])
      push(subs[match[4]] ?? supers[match[4]] ?? match[4], subs[match[4]] ? "sub" : "sup");
    else
      for (const chunk of (match[5] ?? match[6] ?? "").match(/.{1,240}/gu) ?? [])
        push(chunk, "base");
  }
  return runs;
}
const runs = (s: string): MathRun[] => {
  const result = gradualText(s);
  if (!result.length || result.length > 16 || result.reduce((n, r) => n + r.text.length, 0) > 240)
    throw new Error("text");
  return result;
};
const plain = (s: string) =>
  gradualText(s)
    .map((r) => r.text)
    .join("");
const point = (x = 0, y = 0) => ({ x, y });
const nominal = (s: string): Value =>
  s.trim() === "?" ? unknown("scalar") : { kind: "symbolic", symbol: runs(s), unit: "scalar" };
const factors: Record<string, number> = {
  n: 1e-9,
  u: 1e-6,
  µ: 1e-6,
  m: 1e-3,
  "": 1,
  k: 1e3,
  M: 1e6,
};
function siUnit(
  s: string,
): { unit: Unit; factor: number; prefix: "n" | "u" | "m" | "" | "k" | "M" } | undefined {
  const m = /^(n|u|µ|m|k|M)?(V|A|Ω|W|F|s|Hz)$/.exec(s);
  if (!m) return;
  return {
    unit: m[2] as Unit,
    factor: factors[m[1] ?? ""] ?? 1,
    prefix: (m[1] === "µ" ? "u" : (m[1] ?? "")) as "n" | "u" | "m" | "" | "k" | "M",
  };
}
function quantity(s: string | undefined, unit: Unit): Value {
  if (!s) return unknown(unit);
  const display = runs(s);
  const full = display.map((run) => run.text).join("");
  const normalized = full.trim().replace(/−/g, "-");
  const numeric =
    /^([+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][+-]?\d+)?)\s*(n|u|µ|m|k|M)?(V|A|Ω|W|F|s|Hz)$/.exec(
      normalized,
    );
  if (numeric) {
    if (numeric[3] !== unit) throw new Error("quantity-unit");
    const literal = numeric[1] ?? "";
    const magnitude = Number(literal);
    const value = magnitude * (factors[numeric[2] ?? ""] ?? 1);
    const nonzero = /[1-9]/.test(literal.split(/[eE]/)[0] ?? "");
    if (
      !Number.isFinite(magnitude) ||
      !Number.isFinite(value) ||
      Math.abs(value) > 1e12 ||
      (nonzero && (magnitude === 0 || value === 0))
    )
      throw new Error("quantity-range");
    return known(value, unit);
  }
  const unknownUnit = /^\?\s*(n|u|µ|m|k|M)?(V|A|Ω|W|F|s|Hz)$/.exec(normalized);
  if (unknownUnit) {
    if (unknownUnit[2] !== unit) throw new Error("quantity-unit");
    return unknown(unit);
  }
  const suffix = /\s+(n|u|µ|m|k|M)?(V|A|Ω|W|F|s|Hz)\s*$/.exec(full);
  if (suffix && (suffix[2] !== unit || suffix[1])) throw new Error("quantity-symbol-unit");
  const body = (suffix ? full.slice(0, suffix.index) : full).trim();
  if (/^[+-]?(?:NaN|Infinity)$/i.test(body)) throw new Error("quantity-range");
  if (body === "?") return unknown(unit);
  if (!suffix && !/^[A-Za-z][A-Za-z0-9]*$/.test(body)) return unknown(unit);
  let remaining = suffix?.index ?? full.length;
  const symbol = display.flatMap((run) => {
    const text = run.text.slice(0, Math.max(0, remaining));
    remaining -= run.text.length;
    return text ? [{ ...run, text }] : [];
  });
  const first = symbol[0];
  const last = symbol.at(-1);
  if (first) first.text = first.text.trimStart();
  if (last) last.text = last.text.trimEnd();
  return { kind: "symbolic", symbol: symbol.filter((run) => run.text.length), unit };
}

export function gradualId(input: string): string {
  if (/^[A-Za-z][A-Za-z0-9_-]{0,47}$/.test(input)) return input;
  let a = 2166136261;
  let b = 5381;
  for (const c of input) {
    const n = c.codePointAt(0) ?? 0;
    a = Math.imul(a ^ n, 16777619) >>> 0;
    b = (Math.imul(b, 33) ^ n) >>> 0;
  }
  return `g-${a.toString(16)}-${b.toString(16)}`;
}

function electrical(id: string): ElectricalPanel {
  return { kind: "electrical", id, at: point(), terminals: [], components: [], routes: [] };
}
function terminal(
  p: ElectricalPanel,
  id: string,
  x: number,
  y: number,
  label?: string,
  free = false,
  labelAt?: { x: number; y: number },
) {
  p.terminals.push({
    id,
    at: point(x, y),
    connection: free ? "free" : "required",
    ...(label ? { label: runs(label) } : {}),
    ...(labelAt ? { labelAt } : {}),
  });
}
function route(
  p: ElectricalPanel,
  id: string,
  from: string,
  to: string,
  via: { x: number; y: number }[] = [],
  open = false,
  bypass?: string,
) {
  p.routes.push({
    id,
    from,
    to,
    via,
    state: open ? "open" : "connected",
    intent: open || bypass ? "intentional-fault" : "normal",
    ...(bypass ? { bypass } : {}),
  });
}
function component(
  p: ElectricalPanel,
  id: string,
  kind: "resistor" | "source" | "led",
  a: string,
  b: string,
  label?: string,
) {
  p.components.push({
    id,
    kind,
    terminals: [a, b],
    state: "normal",
    intent: "normal",
    ...(label ? { label: runs(label) } : {}),
  });
}
function readings(id: string, entries: [string, string, string][], y = 400): Panel {
  return {
    kind: "readings",
    id,
    at: point(0, y),
    items: entries.map(([key, label, value]) => ({
      id: key,
      label: runs(label),
      reading: authored(nominal(value)),
    })),
  };
}
function meter(
  id: string,
  panel: string,
  positive: string,
  negative: string,
  reading?: string,
): Panel {
  const value = reading ? quantity(reading, "V") : unknown("V");
  const nominalLabel =
    reading && value.kind === "unknown" && !["?", "? V"].includes(plain(reading).trim())
      ? plain(reading)
      : undefined;
  return {
    kind: "measurement",
    ...(nominalLabel ? { title: nominalLabel } : {}),
    id,
    at: point(540, 240),
    model: "ideal-voltmeter",
    positive: { panel, terminal: positive, via: [point(-30, -120), point(-30, 100)] },
    negative: { panel, terminal: negative, via: [point(-10, 40), point(-10, 120)] },
    reading: { mode: "authored", value },
  };
}
function circuit(f: Figure, id: string): ElectricalPanel {
  const p = electrical(id);
  const divider = f.kind === "divider";
  const led = f.kind === "led";
  const nodes = f.showNodes !== false;
  terminal(p, "source-positive", 0, 90);
  terminal(p, "source-negative", 0, 270);
  terminal(p, "A", 360, 0, nodes ? "A" : undefined);
  terminal(p, "upper-positive", 360, 60);
  terminal(p, "upper-negative", 360, divider || led ? 180 : 300);
  terminal(p, "C", 360, 420, nodes ? (led ? "K" : "C") : undefined);
  if (divider || led) {
    terminal(p, "B", 360, 220, nodes ? (led ? "A" : "B") : undefined);
    terminal(p, "lower-positive", 360, 260);
    terminal(p, "lower-negative", 360, 360);
    component(
      p,
      "lower",
      led ? "led" : "resistor",
      "lower-positive",
      "lower-negative",
      led ? "LED" : `R₂${f.lower ? ` · ${f.lower}` : ""}`,
    );
    route(p, "middle-top", "upper-negative", "B");
    route(p, "middle-bottom", "B", "lower-positive");
    route(p, "bottom", "lower-negative", "C");
  } else route(p, "bottom", "upper-negative", "C");
  component(
    p,
    "source",
    "source",
    "source-positive",
    "source-negative",
    f.supply ?? (led ? "Vₛ" : "Source"),
  );
  component(
    p,
    "upper",
    "resistor",
    "upper-positive",
    "upper-negative",
    `${divider ? "R₁" : "R"}${f.upper ? ` · ${f.upper}` : ""}`,
  );
  route(p, "supply", "source-positive", "A", [point(0, 0)]);
  route(p, "top", "A", "upper-positive");
  route(p, "return", "C", "source-negative", [point(0, 420)], f.open === true);
  if (f.bypass) {
    if (f.bypass === "lower" && !divider) throw new Error("bypass");
    const upper = f.bypass === "upper";
    if (!divider) {
      const source = p.components.find((c) => c.id === "source");
      if (source) source.intent = "intentional-fault";
    }
    route(
      p,
      "bypass",
      upper ? "upper-positive" : "lower-positive",
      upper ? "upper-negative" : "lower-negative",
      [point(470, upper ? 60 : 260), point(470, upper ? (divider ? 180 : 300) : 360)],
      false,
      f.bypass,
    );
  }
  if (f.load) {
    if (!divider) throw new Error("load");
    terminal(p, "load-positive", 170, 260);
    terminal(p, "load-negative", 170, 360);
    component(p, "load", "resistor", "load-positive", "load-negative", f.load);
    route(p, "load-input", "B", "load-positive", [point(170, 220)]);
    route(p, "load-return", "load-negative", "C", [point(170, 420)]);
  }
  return p;
}
function fragment(f: Figure, id: string): ElectricalPanel {
  const p = electrical(id);
  const labels = f.fragment?.labels ?? ["A", "B"];
  const after = f.fragment?.resistorAfter;
  if (after !== undefined && after >= labels.length - 1) throw new Error("fragment");
  labels.forEach((label, i) => {
    terminal(p, `point-${i}`, i * 180, f.fragment?.bent && i % 2 ? 60 : 120, label);
  });
  for (let i = 0; i < labels.length - 1; i++) {
    const a = p.terminals[i];
    const b = p.terminals[i + 1];
    if (!a || !b) throw new Error("fragment");
    if (i === after) {
      terminal(p, "resistor-positive", a.at.x + 50, a.at.y);
      terminal(p, "resistor-negative", a.at.x + 130, a.at.y);
      component(p, "upper", "resistor", "resistor-positive", "resistor-negative", f.upper ?? "R");
      route(p, `wire-${i}-a`, a.id, "resistor-positive");
      route(
        p,
        `wire-${i}-b`,
        "resistor-negative",
        b.id,
        a.at.y === b.at.y ? [] : [point(b.at.x, a.at.y)],
      );
    } else
      route(
        p,
        `wire-${i}`,
        a.id,
        b.id,
        a.at.y === b.at.y ? [] : [point(a.at.x + 90, a.at.y), point(a.at.x + 90, b.at.y)],
      );
  }
  return p;
}

type InkBox = { x: number; y: number; width: number; height: number };
type TextShape = Extract<Shape, { kind: "math" }>;
type InkObstacle = { id: string; shape: Exclude<Shape, { kind: "math" }>; order: number };
export type GradualInkCollision = { label: string; obstacle: string; text: string };
const expandInk = (box: InkBox, margin: number): InkBox => ({
  x: box.x - margin,
  y: box.y - margin,
  width: box.width + margin * 2,
  height: box.height + margin * 2,
});
const boxesMeet = (a: InkBox, b: InkBox) =>
  a.x <= b.x + b.width && a.x + a.width >= b.x && a.y <= b.y + b.height && a.y + a.height >= b.y;
function segmentMeetsInk(
  a: { x: number; y: number },
  b: { x: number; y: number },
  box: InkBox,
): boolean {
  let from = 0;
  let to = 1;
  for (const axis of ["x", "y"] as const) {
    const delta = b[axis] - a[axis];
    const lower = box[axis];
    const upper = lower + (axis === "x" ? box.width : box.height);
    if (delta === 0) {
      if (a[axis] < lower || a[axis] > upper) return false;
    } else {
      const first = (lower - a[axis]) / delta;
      const last = (upper - a[axis]) / delta;
      from = Math.max(from, Math.min(first, last));
      to = Math.min(to, Math.max(first, last));
      if (from > to) return false;
    }
  }
  return true;
}
function obstacleMeetsInk(
  box: InkBox,
  shape: InkObstacle["shape"],
  clearance: number,
  coverBackground = false,
): boolean {
  if (shape.kind === "circle") {
    const area = expandInk(box, clearance);
    const x = Math.max(area.x, Math.min(shape.at.x, area.x + area.width));
    const y = Math.max(area.y, Math.min(shape.at.y, area.y + area.height));
    const near = Math.hypot(x - shape.at.x, y - shape.at.y);
    const far = Math.max(
      ...[area.x, area.x + area.width].flatMap((x) =>
        [area.y, area.y + area.height].map((y) => Math.hypot(x - shape.at.x, y - shape.at.y)),
      ),
    );
    const filled = shape.fill !== "none" && (shape.fill !== "background" || coverBackground);
    return (
      near <= shape.radius + shape.stroke / 2 && (filled || far >= shape.radius - shape.stroke / 2)
    );
  }
  const stroke = shape.kind === "rect" ? shape.stroke : shape.width;
  const area = expandInk(box, clearance + stroke / 2);
  const points =
    shape.kind === "rect"
      ? [
          shape.at,
          point(shape.at.x + shape.width, shape.at.y),
          point(shape.at.x + shape.width, shape.at.y + shape.height),
          point(shape.at.x, shape.at.y + shape.height),
          shape.at,
        ]
      : shape.kind === "polygon"
        ? [...shape.points, shape.points[0] ?? point()]
        : shape.points;
  if (points.slice(1).some((p, i) => segmentMeetsInk(points[i] ?? p, p, area))) return true;
  if (
    shape.kind === "rect" &&
    shape.fill !== "none" &&
    (shape.fill !== "background" || coverBackground)
  )
    return boxesMeet(area, { ...shape.at, width: shape.width, height: shape.height });
  if (
    shape.kind === "polygon" &&
    shape.fill !== "none" &&
    (shape.fill !== "background" || coverBackground)
  ) {
    const center = point(area.x + area.width / 2, area.y + area.height / 2);
    let inside = false;
    for (let i = 0; i < shape.points.length; i++) {
      const a = shape.points[i];
      const b = shape.points[(i + 1) % shape.points.length];
      if (
        a &&
        b &&
        a.y > center.y !== b.y > center.y &&
        center.x < ((b.x - a.x) * (center.y - a.y)) / (b.y - a.y) + a.x
      )
        inside = !inside;
    }
    return inside;
  }
  return false;
}
const inkObstacles = (document: PublicFigure): InkObstacle[] => {
  let order = 0;
  return document.display.flatMap((part) =>
    part.shapes.flatMap((shape) => {
      const position = order++;
      return shape.kind === "math" ? [] : [{ id: part.id, shape, order: position }];
    }),
  );
};
const shapeOrder = (document: PublicFigure) =>
  new Map(document.display.flatMap((part) => part.shapes).map((shape, index) => [shape, index]));
export function gradualAnnotationCollisions(
  document: PublicFigure,
  clearance = 0,
): GradualInkCollision[] {
  const obstacles = inkObstacles(document);
  const order = shapeOrder(document);
  return document.display.flatMap((part) =>
    part.shapes.flatMap((shape) => {
      if (shape.kind !== "math") return [];
      const bounds = mathGeometry(shape).bounds;
      return obstacles
        .filter((obstacle) =>
          obstacleMeetsInk(
            bounds,
            obstacle.shape,
            clearance,
            obstacle.order > (order.get(shape) ?? Infinity),
          ),
        )
        .map((obstacle) => ({
          label: part.id,
          obstacle: obstacle.id,
          text: shape.runs.map((run) => run.text).join(""),
        }));
    }),
  );
}

export function layoutGradualAnnotations(input: PublicFigure, model: StageModel): PublicFigure {
  const document = structuredClone(input);
  const preferred = new Map<
    string,
    {
      x: number;
      y: number;
      align: TextShape["align"];
      alternateX: number;
      alternateAlign: TextShape["align"];
      priority: number;
    }
  >();
  for (const panel of model.panels) {
    if (panel.kind === "electrical") {
      for (const component of panel.components) {
        if (component.labelAt) continue;
        const a = panel.terminals.find((t) => t.id === component.terminals[0]);
        const b = panel.terminals.find((t) => t.id === component.terminals[1]);
        if (!a || !b) throw new Error("annotation-reference");
        const x = panel.at.x + (a.at.x + b.at.x) / 2;
        const y = panel.at.y + (a.at.y + b.at.y) / 2;
        const vertical = Math.abs(b.at.y - a.at.y) > Math.abs(b.at.x - a.at.x);
        const left = component.id === "load";
        const offset = component.kind === "led" ? 44 : 32;
        preferred.set(
          `${panel.id}/label/${component.id}`,
          vertical
            ? {
                x: x + (left ? -offset : offset),
                y,
                align: left ? "right" : "left",
                alternateX: x + (left ? offset : -offset),
                alternateAlign: left ? "left" : "right",
                priority: 0,
              }
            : {
                x,
                y: y - 36,
                align: "center",
                alternateX: x,
                alternateAlign: "center",
                priority: 0,
              },
        );
      }
      for (const terminal of panel.terminals) {
        if (terminal.labelAt) continue;
        const x = panel.at.x + terminal.at.x;
        const y = panel.at.y + terminal.at.y;
        const boardEdge = model.panels.some(
          (p) =>
            p.kind === "board" && p.at.x + p.width === x && y >= p.at.y && y <= p.at.y + p.height,
        );
        preferred.set(`${panel.id}/terminal-label/${terminal.id}`, {
          x: x + (boardEdge ? -16 : 16),
          y,
          align: boardEdge ? "right" : "left",
          alternateX: x + (boardEdge ? -32 : -16),
          alternateAlign: "right",
          priority: 1,
        });
      }
    }
    if (panel.kind === "breadboard")
      for (const contact of panel.contacts)
        preferred.set(`${panel.id}/contact-label/${contact.id}`, {
          x: panel.at.x + contact.at.x + 12,
          y: panel.at.y + contact.at.y - 18,
          align: "left",
          alternateX: panel.at.x + contact.at.x - 12,
          alternateAlign: "right",
          priority: 2,
        });
  }
  const obstacles = inkObstacles(document);
  const order = shapeOrder(document);
  const fixedText = document.display.flatMap((part) =>
    preferred.has(part.id)
      ? []
      : part.shapes.flatMap((shape) => (shape.kind === "math" ? [mathGeometry(shape).bounds] : [])),
  );
  const annotations = document.display
    .flatMap((part) => {
      const anchor = preferred.get(part.id);
      return anchor
        ? part.shapes.flatMap((shape, index) =>
            shape.kind === "math" ? [{ part, shape, index, anchor }] : [],
          )
        : [];
    })
    .sort((a, b) => a.anchor.priority - b.anchor.priority || a.part.id.localeCompare(b.part.id));
  for (const annotation of annotations) {
    const { part, shape, index, anchor } = annotation;
    const local = mathGeometry({ ...shape, at: point(), align: "left" }).bounds;
    const baseline = anchor.y - local.y - local.height / 2;
    const candidates = [0, -18, 18, -36, 36, -54, 54, -72, 72].flatMap((dy) => [
      { ...shape, at: point(anchor.x, baseline + dy), align: anchor.align },
      { ...shape, at: point(anchor.alternateX, baseline + dy), align: anchor.alternateAlign },
    ]);
    const selected = candidates.find((candidate) => {
      const bounds = mathGeometry(candidate).bounds;
      return (
        !obstacles.some((obstacle) =>
          obstacleMeetsInk(
            bounds,
            obstacle.shape,
            6,
            obstacle.order > (order.get(shape) ?? Infinity),
          ),
        ) && !fixedText.some((other) => boxesMeet(expandInk(bounds, 6), other))
      );
    });
    if (!selected) throw new Error("annotation-no-clear-placement");
    part.shapes[index] = selected;
    fixedText.push(mathGeometry(selected).bounds);
  }
  return document;
}

function build(f: Figure, theme: Theme, id: string, stage: Stage): GradualAdapted {
  const panels: Panel[] = [];
  const host: GradualHost = { kind: "figure", caption: gradualText(f.caption), notes: [] };
  const note = (key: string, label: string, value: string) =>
    host.notes.push({ id: `${id}-${key}`, label: gradualText(label), value: gradualText(value) });
  const addition = (key: string, shapes: Part["shapes"]) => {
    host.additions ??= [];
    host.additions.push({ id: `${id}/host/${key}`, shapes });
  };
  switch (f.kind) {
    case "loop":
    case "divider":
    case "led": {
      panels.push(circuit(f, id));
      if (f.probes) panels.push(meter(`${id}-meter`, id, ...f.probes, f.voltmeter?.reading));
      if (f.current) {
        panels.push(readings(`${id}-current`, [["current", "I", f.current]], 520));
        addition("current", [
          polygon([point(180, -6), point(192, 0), point(180, 6)], "accent"),
          polygon([point(192, 414), point(180, 420), point(192, 426)], "accent"),
        ]);
      }
      if (f.open) note("open", "Return path", "open");
      if (f.bypass) note("bypass", "Jumper", f.bypass);
      if (f.highlightNodes && !f.open && !f.bypass) {
        note(
          "highlight",
          "Authored node highlighting",
          f.kind === "loop"
            ? "Source + to R; R to source −"
            : "A: source + to R₁; B: junction; C: return to source −",
        );
      }
      break;
    }
    case "fragment":
      panels.push(fragment(f, id));
      if (f.highlightNodes)
        note(
          "highlight",
          "Authored node highlighting",
          f.fragment?.resistorAfter === undefined
            ? "One uninterrupted wire"
            : "The resistor separates the conductor groups",
        );
      break;
    case "node-comparison": {
      panels.push(
        fragment(
          { kind: "fragment", caption: "", fragment: { labels: ["P", "Q"], bent: true } },
          `${id}-wire`,
        ),
      );
      const separated = fragment(
        {
          kind: "fragment",
          caption: "",
          upper: "R₁",
          fragment: { labels: ["A", "B"], resistorAfter: 0 },
        },
        `${id}-component`,
      );
      separated.at.y = 220;
      panels.push(separated);
      if (stage !== "question") {
        note("wire", "P and Q", "One uninterrupted wire · one node");
        note("component", "A and B", "A component between the wires · two nodes");
      }
      break;
    }
    case "pullup": {
      const p = electrical(id);
      terminal(p, "supply", 0, 0, f.supply ?? "Vcc", true);
      terminal(p, "upper-negative", 0, 120);
      terminal(p, "input", 0, 180);
      terminal(p, "gpio", 220, 180, "GPIO input");
      terminal(p, "button-positive", 0, 240);
      terminal(p, "button-negative", 0, 330);
      terminal(p, "ground", 0, 390, "GND");
      component(p, "upper", "resistor", "supply", "upper-negative", f.upper ?? "Pull-up R");
      p.components.push({
        id: "button",
        kind: "button",
        terminals: ["button-positive", "button-negative"],
        state: f.open === false ? "closed" : "open",
        intent: "normal",
        label: runs(f.open === false ? "Pressed" : "Released"),
      });
      route(p, "input-top", "upper-negative", "input");
      route(p, "input-bottom", "input", "button-positive");
      route(p, "gpio", "input", "gpio");
      route(p, "ground", "button-negative", "ground");
      panels.push(p);
      if (f.highlightNodes)
        note(
          "highlight",
          "Authored node highlighting",
          f.open === false
            ? "Input connected to GND"
            : "Input separated from GND by the open button",
        );
      break;
    }
    case "potentials": {
      const p = electrical(id);
      const values = f.potentials ?? ["?", "?", "?"];
      const labels = f.potentialLabels ?? ["A", "B", "C"];
      ["A", "B", "C"].forEach((key, i) => {
        terminal(p, key, i * 180, 0, labels[i], true);
        const t = p.terminals.at(-1);
        if (t) t.potential = quantity(values[i], "V");
      });
      panels.push(
        p,
        readings(
          `${id}-potentials`,
          values.map((v, i) => [`potential-${i}`, labels[i] ?? "?", v]),
          100,
        ),
      );
      if (f.probes) panels.push(meter(`${id}-meter`, id, ...f.probes, f.voltmeter?.reading));
      note("reference", "Potential labels", "One common reference");
      break;
    }
    case "supply": {
      panels.push({
        kind: "board",
        id: `${id}-board`,
        at: point(),
        width: 200,
        height: 220,
        pins: [],
        chips: [
          { id: "sensor", at: point(20, 70), width: 140, height: 50, label: runs("Sensor board") },
        ],
      });
      const p = electrical(id);
      terminal(p, "A", 200, 40, "3V3", true, point(168, 45));
      terminal(p, "C", 200, 170, "GND", true, point(168, 175));
      panels.push(p);
      if (f.voltmeter)
        panels.push(meter(`${id}-meter`, id, "A", "C", f.voltmeter.reading ?? "Reading"));
      break;
    }
    case "breadboard": {
      const rows = f.boardRows ?? [5, 10, 15];
      if (new Set(rows).size !== rows.length) throw new Error("rows");
      const contacts = rows.flatMap((row, ri) =>
        ["a", "b", "c", "d", "e"].map((letter, ci) => ({
          id: `contact-${letter}-${row}`,
          at: point(40 + ci * 80, 50 + ri * 180),
          label: runs(`${letter}${row}`),
        })),
      );
      panels.push({
        kind: "breadboard",
        id,
        at: point(),
        width: 400,
        height: 450,
        contacts,
        groups: rows.map((row) => ({
          id: `row-${row}`,
          contacts: contacts.filter((c) => c.id.endsWith(`-${row}`)).map((c) => c.id),
        })),
        showGroups: true,
        links: [],
      });
      const p = electrical(`${id}-parts`);
      terminal(p, "r1a", 120, 50, undefined, true);
      terminal(p, "r1b", 120, 230, undefined, true);
      terminal(p, "r2a", 280, 230, undefined, true);
      terminal(p, "r2b", 280, 410, undefined, true);
      component(p, "upper", "resistor", "r1a", "r1b", f.upper ?? "R₁");
      component(p, "lower", "resistor", "r2a", "r2b", f.lower ?? "R₂");
      panels.push(p);
      note("rows", "Visible row roles", "A · source +; B · junction; C · source −");
      note("scope", "Partial breadboard", "Center gap and rails omitted");
      break;
    }
    case "signal": {
      const s = f.signal;
      if (!s || (!s.samples && !s.changes)) throw new Error("signal");
      if (!s.changes && (s.end !== undefined || s.settles !== undefined))
        throw new Error("signal-sample-timing");
      if (!s.samples && s.sampleLabels !== undefined) throw new Error("signal-sample-labels");
      if (s.samples) {
        const sampleUnit = s.unit ?? "ticks";
        const p: Extract<Panel, { kind: "signal" }> = {
          kind: "signal",
          id: `${id}-samples`,
          at: point(),
          width: 600,
          height: 80,
          unit: sampleUnit,
          data: { mode: "samples", start: 1, period: 1, values: s.samples },
          edges: s.markEdges ?? "none",
          sampleLabels: s.sampleLabels !== false,
        };
        if (!s.changes && s.window)
          p.window = {
            from: s.window.from,
            to: s.window.from + s.window.length,
            label: runs(s.window.label ?? `${s.window.length} ${sampleUnit}`),
          };
        panels.push(p);
        if (!s.changes && s.accept !== undefined) {
          if (s.accept < 1 || s.accept > 1 + s.samples.length)
            throw new Error("signal-accept-range");
          const x = ((s.accept - 1) / s.samples.length) * p.width;
          addition("sample-accept", [
            line([point(x, -10), point(x, p.height + 10)], "accent"),
            label(point(x, p.height + 50), runs(`${s.accept} ${sampleUnit}`), "center"),
          ]);
        }
      }
      if (s.samples && s.sampleLabels === false)
        panels.push(
          readings(
            `${id}-sample-indices`,
            s.samples.map((_, i) => [`sample-${i + 1}`, "Sample", String(i + 1)]),
            180,
          ),
        );
      if (s.changes) {
        const first = s.changes[0];
        const last = s.changes.at(-1);
        if (first === undefined || last === undefined) throw new Error("signal");
        const settles = s.settles ?? "LOW";
        let state: "HIGH" | "LOW" =
          s.changes.length % 2 ? (settles === "LOW" ? "HIGH" : "LOW") : settles;
        const initial = state;
        const changes: { at: number; level: "HIGH" | "LOW" }[] = s.changes.map((at) => {
          state = state === "HIGH" ? "LOW" : "HIGH";
          return { at, level: state };
        });
        const end =
          s.end ??
          Math.max(
            last + 10,
            (s.accept ?? last) + 8,
            s.window ? s.window.from + s.window.length + 8 : last,
          );
        const p: Extract<Panel, { kind: "signal" }> = {
          kind: "signal",
          id: `${id}-changes`,
          at: point(0, s.samples ? 600 : 0),
          width: 600,
          height: 80,
          unit: s.unit ?? "ms",
          data: { mode: "transitions", start: first - 8, end, initial, changes },
          edges: s.markEdges ?? "none",
          sampleLabels: false,
        };
        if (s.window)
          p.window = {
            from: s.window.from,
            to: s.window.from + s.window.length,
            label: runs(s.window.label ?? `${s.window.length} ${s.unit ?? "ms"}`),
          };
        if (s.accept !== undefined && s.window)
          p.debounce = { duration: s.window.length, initial: settles === "LOW" ? "HIGH" : "LOW" };
        panels.push(p);
        panels.push(
          readings(
            `${id}-changes-labels`,
            s.changes.map((at, i) => [`change-${i}`, "Change", `${at} ${s.unit ?? "ms"}`]),
            s.samples ? 960 : 360,
          ),
        );
        if (s.accept !== undefined)
          note("accept", "Authored acceptance", `${s.accept} ${s.unit ?? "ms"}`);
      }
      break;
    }
    case "timeline": {
      const t = f.timeline;
      if (!t) throw new Error("timeline");
      const p: Extract<Panel, { kind: "timeline" }> = {
        kind: "timeline",
        id,
        at: point(),
        start: t.start,
        now: t.now,
        wraps: t.max !== undefined && t.now < t.start ? 1 : 0,
        unit: t.unit,
        showElapsed: t.showDifference === true && !t.difference,
        width: 600,
      };
      if (t.max !== undefined) p.modulus = t.max + 1;
      panels.push(p);
      if (t.showDifference && t.difference) {
        panels.push(readings(`${id}-difference`, [["difference", "Elapsed", t.difference]], 135));
        addition("elapsed-brace", [
          line([point(0, 90), point(0, 100), point(600, 100), point(600, 90)], "accent"),
        ]);
      }
      if (t.window !== undefined) {
        note("window", "Authored interval", `${t.window} ${t.unit}`);
        addition("interval", [
          line([point(0, 160), point(0, 170), point(600, 170), point(600, 160)], "accent"),
          label(point(300, 200), runs(`Interval ${t.window} ${t.unit}`), "center"),
        ]);
      }
      break;
    }
    case "levels": {
      const l = f.levels;
      if (!l) throw new Error("levels");
      panels.push({
        kind: "levels",
        id,
        at: point(),
        low: l.low,
        high: l.high,
        max: l.max,
        width: 600,
        showClassification: l.showResult === true,
        ...(l.value !== undefined ? { value: known(l.value, "V") } : {}),
      });
      break;
    }
    case "power": {
      const p = f.power;
      if (!p) throw new Error("power");
      const keys = [
        ["voltage", "V", "V"],
        ["current", "I", "A"],
        ["resistance", "R", "Ω"],
        ["power", "P", "W"],
      ] as const;
      panels.push({
        kind: "quantity",
        id,
        at: point(),
        items: keys.map(([key, q, unit]) => ({
          id: key,
          quantity: q,
          reading: authored(quantity(p[key], unit)),
        })),
      });
      panels.push(
        readings(
          `${id}-nominal`,
          keys.map(([key, q]) => [key, q, p[key] ?? "?"]),
          220,
        ),
      );
      if (p.formula)
        panels.push(readings(`${id}-formula`, [["formula", "Formula", p.formula]], 420));
      break;
    }
    case "bars": {
      const b = f.bars;
      if (!b) throw new Error("bars");
      const u = siUnit(b.unit);
      if (!u) throw new Error("bars-unit");
      const minimum = Math.min(0, ...b.items.map((v) => v.value), b.threshold?.value ?? 0);
      const maximum =
        b.max ?? Math.max(0, ...b.items.map((v) => v.value), b.threshold?.value ?? 0) * 1.4;
      panels.push({
        kind: "bars",
        id,
        at: point(),
        unit: u.unit,
        min: minimum * u.factor,
        max: maximum === minimum ? maximum * u.factor + u.factor : maximum * u.factor,
        width: 480,
        items: b.items.map((item, i) => ({
          id: `item-${i}`,
          label: runs(`${item.label}${item.role ? ` (${item.role})` : ""}`),
          value: known(item.value * u.factor, u.unit),
        })),
        ...(b.threshold
          ? { threshold: { value: b.threshold.value * u.factor, label: runs(b.threshold.label) } }
          : {}),
      });
      panels.push(
        readings(
          `${id}-nominal`,
          b.items.map((item, i) => [`item-${i}`, item.label, item.display]),
          b.items.length * 48 + 120,
        ),
      );
      break;
    }
    case "scale": {
      const s = f.scale;
      if (!s) throw new Error("scale");
      const u = siUnit(s.prefixed);
      if (!u || u.unit !== s.base || Math.abs(1 / u.factor - s.factor) > 1e-9)
        throw new Error("scale-unit");
      panels.push({
        kind: "scale",
        id,
        at: point(),
        unit: u.unit,
        prefix: u.prefix,
        ticks: s.ticks ?? [0, 0.025, 0.05, 0.075, 0.1],
        width: 600,
        showConverted: s.showResult === true,
        ...(s.value !== undefined ? { input: { from: s.from, magnitude: s.value } } : {}),
      });
      break;
    }
    case "readings": {
      const r = f.readings;
      if (!r) throw new Error("readings");
      panels.push(
        readings(
          id,
          r.items.map((item, i) => [
            `item-${i}`,
            item.label,
            `${item.value}${item.unit ? ` ${item.unit}` : ""}`,
          ]),
          0,
        ),
      );
      r.items.forEach((item, i) => {
        if (item.mode) note(`mode-${i}`, item.label, item.mode);
      });
      if (r.difference)
        panels.push(
          readings(
            `${id}-difference`,
            [["difference", "Difference", r.difference]],
            r.items.length * 38 + 60,
          ),
        );
      if (r.quantity) note("quantity", "Quantity", r.quantity);
      break;
    }
    case "board": {
      const b = f.board;
      if (!b) throw new Error("board");
      const pins = b.pins ?? [];
      const height = Math.max(280, Math.ceil(pins.length / 2) * 60 + 120);
      panels.push({
        kind: "board",
        id,
        at: point(),
        width: 600,
        height,
        chips: [
          { id: "usb", at: point(250, 0), width: 100, height: 30, label: runs("USB") },
          {
            id: "bridge",
            at: point(50, 45),
            width: 210,
            height: 40,
            label: runs(
              b.unknown?.includes("bridge") ? "USB bridge ?" : (b.bridge ?? "USB bridge"),
            ),
          },
          {
            id: "mcu",
            at: point(330, 45),
            width: 220,
            height: 40,
            label: runs(b.unknown?.includes("mcu") ? "MCU ?" : (b.mcu ?? "MCU")),
          },
        ],
        pins: [],
      });
      if (pins.length)
        panels.push({
          kind: "pinout",
          id: `${id}-pinout`,
          at: point(0, height + 80),
          width: 600,
          height: Math.max(100, Math.ceil(pins.length / 2) * 60 + 20),
          pins: pins.map((pin, i) => ({
            id: gradualId(`pin-${pin.name}`),
            at: point(i % 2 ? 310 : 10, 25 + Math.floor(i / 2) * 60),
            label: runs(pin.name),
            role: pin.role ?? "unknown",
          })),
        });
      pins.forEach((pin, i) => {
        if (pin.highlight) note(`highlight-${i}`, "Authored pin highlight", pin.name);
      });
      break;
    }
    case "record": {
      const r = f.record;
      if (!r) throw new Error("record");
      host.kind = "record";
      host.record = r.fields.map((field, i) => ({
        id: `${id}-field-${i}`,
        label: gradualText(field.label),
        value: gradualText(field.missing ? "missing" : (field.value ?? "")),
        missing: field.missing === true,
        flagged: field.flagged === true,
      }));
      if (r.verdict) host.verdict = gradualText(r.verdict);
      break;
    }
  }
  if (f.highlightNodes && !(f.open && f.kind !== "pullup") && !f.bypass) {
    for (const panel of panels) {
      if (panel.kind !== "electrical") continue;
      const groups = analyzeElectrical(panel);
      for (const wire of panel.routes) {
        const a = panel.terminals.find((t) => t.id === wire.from);
        const b = panel.terminals.find((t) => t.id === wire.to);
        if (!a || !b) throw new Error("highlight");
        const group = groups.findIndex((g) => g.includes(wire.from));
        const tone = (["accent", "positive", "negative"] as const)[group % 3] ?? "accent";
        addition(`hint-${wire.id}`, [
          translateShape(line([a.at, ...wire.via, b.at], tone), panel.at),
        ]);
      }
    }
  }
  const model: StageModel = {
    title: `Gradual ${f.kind}`,
    description: "",
    theme,
    panels,
    expose: [],
  };
  return { ok: true, model, host, diagnostics: [] };
}

function questionPolicy(f: Figure): Figure {
  if (f.board?.unknown?.includes("mcu")) delete f.board.mcu;
  if (f.board?.unknown?.includes("bridge")) delete f.board.bridge;
  if (f.readings) delete f.readings.difference;
  if (f.levels) f.levels.showResult = false;
  if (f.timeline) {
    delete f.timeline.difference;
    f.timeline.showDifference = false;
  }
  if (f.scale) f.scale.showResult = false;
  return f;
}

export function adaptGradualFigure(
  input: unknown,
  options: { id?: string; theme?: Theme; stage?: Stage } = {},
): Failure | GradualAdapted {
  try {
    const theme = themeSchema.parse(options.theme ?? "geist-light");
    const stage = stageSchema.parse(options.stage ?? "teaching");
    const requestedId = z
      .string()
      .min(1)
      .max(1000)
      .parse(options.id ?? "gradual");
    const id = gradualId(requestedId.length > 24 ? `panel:${requestedId}` : requestedId);
    if (input === null || input === undefined)
      return {
        ok: true,
        model: { title: "No figure", description: "", theme, panels: [], expose: [] },
        host: { kind: "no-figure", caption: [], notes: [] },
        diagnostics: [],
      };
    const f = figureSchema.parse(boundedJSON(input));
    const common = ["kind", "caption"];
    const allowed: Record<Figure["kind"], string[]> = {
      loop: [
        "supply",
        "upper",
        "open",
        "bypass",
        "current",
        "probes",
        "voltmeter",
        "showNodes",
        "highlightNodes",
      ],
      divider: [
        "supply",
        "upper",
        "lower",
        "open",
        "bypass",
        "load",
        "current",
        "probes",
        "voltmeter",
        "showNodes",
        "highlightNodes",
      ],
      led: [
        "supply",
        "upper",
        "open",
        "current",
        "probes",
        "voltmeter",
        "showNodes",
        "highlightNodes",
      ],
      fragment: ["fragment", "upper", "highlightNodes"],
      "node-comparison": [],
      pullup: ["supply", "upper", "open", "highlightNodes"],
      potentials: ["potentials", "potentialLabels", "probes", "voltmeter"],
      breadboard: ["boardRows", "upper", "lower"],
      supply: ["voltmeter"],
      signal: ["signal"],
      timeline: ["timeline"],
      levels: ["levels"],
      power: ["power"],
      bars: ["bars"],
      scale: ["scale"],
      readings: ["readings"],
      board: ["board"],
      record: ["record"],
    };
    if (Object.keys(f).some((key) => !common.includes(key) && !allowed[f.kind].includes(key)))
      return failure();
    if (f.voltmeter && f.kind !== "supply" && !f.probes) return failure();
    const adapted = build(stage === "question" ? questionPolicy(f) : f, theme, id, stage);
    hostSchema.parse(boundedJSON(adapted.host));
    if (adapted.model.panels.length) {
      stageModelSchema.parse(adapted.model);
      const a: AuthorFigure = {
        schema: "circuitkit.educational.author.v2",
        id,
        stages: { teaching: adapted.model, question: adapted.model, correction: adapted.model },
      };
      const projected = projectFigure(a, stage);
      if (!projected.ok) return projected;
    }
    return adapted;
  } catch {
    return failure();
  }
}

function mergeItems<T extends { id: string }>(base: T[], extra: T[]): T[] {
  return [
    ...base.map((item) => extra.find((n) => n.id === item.id) ?? item),
    ...extra.filter((item) => !base.some((n) => n.id === item.id)),
  ];
}

function mergeModels(base: StageModel, extra: StageModel): StageModel {
  const panels = structuredClone(base.panels);
  for (const addition of extra.panels) {
    const index = panels.findIndex((p) => p.id === addition.id);
    if (index < 0) panels.push(structuredClone(addition));
    else {
      const original = panels[index];
      if (!original || original.kind !== addition.kind) throw new Error("identity");
      if (original.kind === "electrical" && addition.kind === "electrical") {
        panels[index] = {
          ...original,
          terminals: mergeItems(original.terminals, addition.terminals),
          components: mergeItems(original.components, addition.components),
          routes: mergeItems(original.routes, addition.routes),
        };
      } else if (original.kind === "readings" && addition.kind === "readings") {
        panels[index] = {
          ...addition,
          at: original.at,
          items: mergeItems(original.items, addition.items),
        };
      } else if (original.kind === "quantity" && addition.kind === "quantity") {
        panels[index] = {
          ...addition,
          at: original.at,
          items: mergeItems(original.items, addition.items),
        };
      } else if (original.kind === "bars" && addition.kind === "bars") {
        panels[index] = {
          ...addition,
          at: original.at,
          items: mergeItems(original.items, addition.items),
        };
      } else if (original.kind === "pinout" && addition.kind === "pinout") {
        panels[index] = {
          ...addition,
          at: original.at,
          pins: mergeItems(original.pins, addition.pins),
        };
      } else panels[index] = { ...addition, at: original.at };
    }
  }
  return { ...base, panels };
}

export function adaptGradualPair(
  input: { id: string; question: unknown; correction?: unknown; teaching?: unknown },
  options: { theme?: Theme } = {},
): Failure | GradualPair {
  try {
    if (
      !input ||
      typeof input !== "object" ||
      ![Object.prototype, null].includes(Object.getPrototypeOf(input))
    )
      return failure();
    if (
      Reflect.ownKeys(input).some(
        (key) =>
          typeof key !== "string" || !["id", "question", "correction", "teaching"].includes(key),
      )
    )
      return failure();
    const idDescriptor = Object.getOwnPropertyDescriptor(input, "id");
    if (!idDescriptor || !("value" in idDescriptor)) return failure();
    const id = gradualId(z.string().min(1).max(1000).parse(idDescriptor.value));
    const get = (key: string) => {
      const d = Object.getOwnPropertyDescriptor(input, key);
      if (d && !("value" in d)) throw new Error("accessor");
      return d?.value;
    };
    if (!Object.hasOwn(input, "question")) return failure();
    const question = get("question");
    const correction = get("correction");
    const teaching = get("teaching");
    const q = adaptGradualFigure(question, {
      id: "figure",
      theme: options.theme,
      stage: "question",
    });
    if (!q.ok) return q;
    const rawQ = question == null ? undefined : figureSchema.parse(boundedJSON(question));
    const rawC = correction == null ? undefined : figureSchema.parse(boundedJSON(correction));
    const sameKind = rawQ && rawC && rawQ.kind === rawC.kind;
    const c =
      correction == null
        ? { ...q, model: structuredClone(q.model), host: structuredClone(q.host) }
        : adaptGradualFigure(correction, {
            id: sameKind ? "figure" : "correction",
            theme: options.theme,
            stage: "correction",
          });
    if (!c.ok) return c;
    if (rawQ && rawC) {
      if (!sameKind) {
        for (const p of c.model.panels) p.at.y += 1800;
        if (c.host.additions)
          c.host.additions = c.host.additions.map((part) => ({
            ...part,
            shapes: part.shapes.map((shape) => translateShape(shape, point(0, 1800))),
          }));
      }
      c.model = mergeModels(q.model, c.model);
      c.host.notes = [
        ...q.host.notes.filter(
          (n) =>
            !(sameKind && n.id === "figure-highlight") && !c.host.notes.some((a) => a.id === n.id),
        ),
        ...c.host.notes,
      ];
      const additions = [
        ...(q.host.additions ?? []).filter(
          (part) =>
            !(sameKind && part.id.startsWith("figure/host/hint-")) &&
            !c.host.additions?.some((p) => p.id === part.id),
        ),
        ...(c.host.additions ?? []),
      ];
      if (additions.length) c.host.additions = additions;
      if (q.host.record) {
        c.host.record = mergeItems(q.host.record, c.host.record ?? []);
        c.host.kind = "record";
      }
    }
    const t =
      teaching === undefined
        ? { ...q, model: structuredClone(q.model), host: structuredClone(q.host) }
        : adaptGradualFigure(teaching, { id: "teaching", theme: options.theme, stage: "teaching" });
    if (!t.ok) return t;
    const author: AuthorFigure = {
      schema: "circuitkit.educational.author.v2",
      id,
      stages: {
        teaching: structuredClone(t.model),
        question: structuredClone(q.model),
        correction: structuredClone(c.model),
      },
    };
    validatePanelIdentity(Object.values(author.stages));
    const result: GradualPair = {
      ok: true,
      author,
      host: {
        teaching: structuredClone(t.host),
        question: structuredClone(q.host),
        correction: structuredClone(c.host),
      },
      diagnostics: [],
    };
    for (const stage of ["teaching", "question", "correction"] as const) {
      const checked = projectGradualPair(result, stage);
      if (!checked.ok) return checked;
    }
    return result;
  } catch {
    return failure();
  }
}

export function projectGradualPair(
  pair: GradualPair,
  stage: Stage,
): Failure | { ok: true; document: PublicFigure | null; host: GradualHost; diagnostics: [] } {
  try {
    stageSchema.parse(stage);
    const result = projectFigure(pair.author, stage);
    if (!result.ok) return result;
    const host = hostSchema.parse(boundedJSON(pair.host[stage]));
    const document = publicSchema.parse(
      layoutGradualAnnotations(
        {
          ...result.document,
          display: [...result.document.display, ...(host.additions ?? [])],
        },
        pair.author.stages[stage],
      ),
    );
    const rendered = renderEducationalSVG(document);
    if (!rendered.ok) return rendered;
    return { ok: true, document: document.display.length ? document : null, host, diagnostics: [] };
  } catch {
    return failure();
  }
}

const escapeHTML = (value: string) =>
  value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
export function renderGradualHost(input: GradualHost): string {
  const host = hostSchema.parse(boundedJSON(input));
  const render = (text: GradualText) =>
    text
      .map((run) =>
        run.script === "base"
          ? escapeHTML(run.text)
          : `<${run.script}>${escapeHTML(run.text)}</${run.script}>`,
      )
      .join("");
  const caption = host.caption.length ? `<p>${render(host.caption)}</p>` : "";
  const table =
    host.kind === "record"
      ? `<table><caption>Experiment record</caption><tbody>${(host.record ?? []).map((row) => `<tr${row.flagged ? ' data-flagged="true"' : ""}${row.missing ? ' data-missing="true"' : ""}><th scope="row">${render(row.label)}</th><td>${render(row.value)}</td></tr>`).join("")}</tbody></table>${host.verdict ? `<p>${render(host.verdict)}</p>` : ""}`
      : "";
  const notes = host.notes.length
    ? `<dl>${host.notes.map((n) => `<dt>${render(n.label)}</dt><dd>${render(n.value)}</dd>`).join("")}</dl>`
    : "";
  return `${table}${notes}${caption}`;
}

export function renderGradualFigure(
  adapted: GradualAdapted,
  id = "gradual",
):
  | Failure
  | { ok: true; svg: string | null; html: string; document: PublicFigure | null; diagnostics: [] } {
  const pair: GradualPair = {
    ok: true,
    diagnostics: [],
    author: {
      schema: "circuitkit.educational.author.v2",
      id: gradualId(id),
      stages: { teaching: adapted.model, question: adapted.model, correction: adapted.model },
    },
    host: { teaching: adapted.host, question: adapted.host, correction: adapted.host },
  };
  const projected = projectGradualPair(pair, "teaching");
  if (!projected.ok) return projected;
  const result = projected.document ? renderEducationalSVG(projected.document) : null;
  if (result && !result.ok) return result;
  return {
    ok: true,
    document: projected.document,
    svg: result?.svg ?? null,
    html: renderGradualHost(projected.host),
    diagnostics: [],
  };
}

export function gradualTutorTarget(legacy: string, panelId = "figure"): string | undefined {
  const parts: Record<string, string> = {
    "lesson-figure-node-a": `${panelId}/terminal/A`,
    "lesson-figure-node-b": `${panelId}/terminal/B`,
    "lesson-figure-node-c": `${panelId}/terminal/C`,
    "lesson-figure-red-probe": `${panelId}-meter/probe/positive`,
    "lesson-figure-black-probe": `${panelId}-meter/probe/negative`,
  };
  return parts[legacy];
}
