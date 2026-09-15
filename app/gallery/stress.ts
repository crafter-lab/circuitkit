import { loadExample } from "../../src/catalog.ts";
import { inspect, renderSVG, validate } from "../../src/renderer.ts";
import {
  basicRecipeIds,
  complexRecipeIds,
  componentPins,
  type FigureDocument,
  figureSchema,
  themePresets,
} from "../../src/schema.ts";
import type { Diagnostic } from "../../src/types.ts";
import { getComplexStressCases } from "./complex-corpus.ts";
import { type GalleryCase, getGalleryCases } from "./corpus.ts";

export type StressProgress = {
  completed: number;
  total: number;
  passed: number;
  failed: number;
  rendered: number;
  rejected: number;
  elapsedMs: number;
  currentCase: string;
};

export type StressCase = {
  id: string;
  tags?: string[];
  document: unknown;
  expectation: GalleryCase["expectation"] | { kind: "either" };
};

export type StressCaseResult = {
  id: string;
  tags?: string[];
  expectation: StressCase["expectation"];
  passed: boolean;
  outcome: "rendered" | "rejected" | "threw";
  diagnostics: Diagnostic[];
  invariants: string[];
  elapsedMs: number;
};

export type StressFailure = {
  id: string;
  tags?: string[];
  document: unknown;
  expectation: StressCase["expectation"];
  invariants: string[];
  diagnostics: Diagnostic[];
};

export type StressReport = StressProgress & {
  ok: boolean;
  failures: StressFailure[];
  cases: StressCaseResult[];
};

const e12 = [1, 1.2, 1.5, 1.8, 2.2, 2.7, 3.3, 3.9, 4.7, 5.6, 6.8, 8.2];
const boundaries = [
  Number.MIN_VALUE,
  2 ** -1022,
  1e-310,
  1e-200,
  1,
  1e200,
  1e308,
  Number.MAX_VALUE,
];

function setValue(document: FigureDocument, role: string, value: number) {
  const id = document.layout.roles[role];
  const component = id === undefined ? undefined : document.circuit.components[id];
  if (!component) throw new Error(`Stress recipe is missing role ${role}`);
  if (component.type === "resistor") component.resistance = value;
  else if (component.type === "capacitor") component.capacitance = value;
  else if (component.type === "dc-source") component.voltage = value;
  else throw new Error(`Stress cannot assign an SI value to ${component.type}`);
}

function valueId(value: number): string {
  return Object.is(value, -0) ? "negative-zero" : String(value);
}

export function getStressCases(): StressCase[] {
  const cases: StressCase[] = getGalleryCases().map(({ id, document, expectation, tags }) => ({
    id: `gallery/${id}`,
    document,
    expectation,
    tags: [...tags],
  }));
  const matrix = (
    family: string,
    recipe: FigureDocument["layout"]["preset"],
    firstRole: string,
    firstValues: number[],
    secondRole: string,
    secondValues: number[],
    expectation: StressCase["expectation"],
  ) => {
    for (const first of firstValues) {
      for (const second of secondValues) {
        for (const preset of themePresets) {
          const document = loadExample(recipe);
          document.presentation.theme.preset = preset;
          setValue(document, firstRole, first);
          setValue(document, secondRole, second);
          cases.push({
            id: `${family}/${firstRole}-${valueId(first)}/${secondRole}-${valueId(second)}/${preset}`,
            document,
            expectation: { ...expectation },
          });
        }
      }
    }
  };
  matrix(
    "rc-e12",
    "rc-lowpass",
    "series",
    e12.map((value) => value * 1_000),
    "shunt",
    [100e-12, 1e-9, 10e-9, 100e-9, 1e-6, 10e-6],
    { kind: "render" },
  );
  for (const scale of [1e-6, 1e3, 1e9]) {
    matrix(
      `divider-e12-${scale}`,
      "voltage-divider",
      "top",
      e12.map((value) => value * scale),
      "bottom",
      e12.map((value) => value * scale),
      { kind: "render" },
    );
  }
  matrix(
    "led-real",
    "led-series",
    "supply",
    [3.3, 5, 9, 12],
    "resistor",
    e12.map((value) => value * 100),
    { kind: "render" },
  );
  matrix("rc-ieee754", "rc-lowpass", "series", boundaries, "shunt", boundaries, { kind: "either" });
  matrix("divider-ieee754", "voltage-divider", "top", boundaries, "bottom", boundaries, {
    kind: "either",
  });
  matrix("led-ieee754", "led-series", "supply", boundaries, "resistor", boundaries, {
    kind: "either",
  });

  for (const recipe of basicRecipeIds) {
    const roles =
      recipe === "rc-lowpass"
        ? ["series", "shunt"]
        : recipe === "voltage-divider"
          ? ["top", "bottom"]
          : ["supply", "resistor"];
    for (const preset of themePresets) {
      for (const role of roles) {
        for (const value of [
          0,
          -0,
          -1,
          Number.NaN,
          Number.POSITIVE_INFINITY,
          Number.NEGATIVE_INFINITY,
        ]) {
          const document = loadExample(recipe);
          document.presentation.theme.preset = preset;
          setValue(document, role, value);
          cases.push({
            id: `invalid-si/${recipe}/${role}/${valueId(value)}/${preset}`,
            document,
            expectation: { kind: "diagnostic", code: "document.invalid_field" },
          });
        }
      }
      for (const token of ["strokeWidth", "fontScale"] as const) {
        for (const value of [
          Number.MIN_VALUE,
          2 ** -1022,
          1e-6,
          0.75,
          1,
          1.1,
          2,
          10,
          Number.MAX_VALUE,
        ]) {
          const document = loadExample(recipe);
          document.presentation.theme.preset = preset;
          document.presentation.theme.overrides = { [token]: value };
          cases.push({
            id: `theme-ieee754/${recipe}/${token}/${valueId(value)}/${preset}`,
            document,
            expectation: { kind: "either" },
          });
        }
        for (const value of [
          0,
          -0,
          -1,
          Number.NaN,
          Number.POSITIVE_INFINITY,
          Number.NEGATIVE_INFINITY,
        ]) {
          const document = loadExample(recipe);
          document.presentation.theme.preset = preset;
          document.presentation.theme.overrides = { [token]: value };
          cases.push({
            id: `theme-invalid/${recipe}/${token}/${valueId(value)}/${preset}`,
            document,
            expectation: { kind: "diagnostic", code: "theme.invalid_token" },
          });
        }
      }
      const document = loadExample(recipe);
      document.presentation.theme.preset = preset;
      document.presentation.theme.overrides = { wire: undefined, fontScale: undefined };
      cases.push({
        id: `optional-undefined/${recipe}/${preset}`,
        document,
        expectation: { kind: "render" },
      });
    }
  }
  for (const [id, document] of [
    ["null", null],
    ["array", []],
    ["empty", {}],
    ["text", "rc-lowpass"],
    ["missing", undefined],
  ] as const) {
    cases.push({
      id: `public-input/${id}`,
      document,
      expectation: { kind: "diagnostic", code: "document.invalid_field" },
    });
  }
  return [...cases, ...getComplexStressCases()];
}

function fingerprint(input: unknown, sorted = false): string {
  const encode = (value: unknown): unknown => {
    if (value === undefined) return ["undefined"];
    if (typeof value === "number") return ["number", Object.is(value, -0) ? "-0" : String(value)];
    if (Array.isArray(value)) return ["array", value.map(encode)];
    if (value !== null && typeof value === "object") {
      const entries = Object.entries(value);
      if (sorted) entries.sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
      return ["object", entries.map(([key, entry]) => [key, encode(entry)])];
    }
    return [typeof value, value];
  };
  return JSON.stringify(encode(input));
}

function graph(document: FigureDocument): unknown {
  return Object.fromEntries(
    Object.entries(document.circuit.nets).map(([id, endpoints]) => [id, [...endpoints].sort()]),
  );
}

function geometry(svg: string): string[] {
  return [...svg.matchAll(/\b(?:d|transform|cx|cy|r|viewBox)="[^"]*"/g)].map(([value]) => value);
}

function numericInvariants(document: FigureDocument, svg: string): string[] {
  const failures: string[] = [];
  const component = (role: string) =>
    document.circuit.components[document.layout.roles[role] ?? ""];
  if (document.layout.preset === "rc-lowpass") {
    const r = component("series");
    const c = component("shunt");
    if (r?.type !== "resistor" || c?.type !== "capacitor")
      return ["numeric.rc: normalized role types differ"];
    const expected = Math.exp(
      -Math.log(2 * Math.PI) - Math.log(r.resistance) - Math.log(c.capacitance),
    );
    const match = /fc = 1\/\(2πRC\) = ([\d.e+-]+) ([GMkmµnp]?)Hz/.exec(svg);
    const scales: Record<string, number> = {
      G: 1e9,
      M: 1e6,
      k: 1e3,
      "": 1,
      m: 1e-3,
      µ: 1e-6,
      n: 1e-9,
      p: 1e-12,
    };
    const actual = match ? Number(match[1]) * (scales[match[2] ?? ""] ?? Number.NaN) : Number.NaN;
    if (!(actual > 0) || !Number.isFinite(actual))
      failures.push(`numeric.rc: positive finite R/C rendered invalid cutoff ${actual}`);
    if (!(expected > 0) || !Number.isFinite(expected))
      failures.push(
        `numeric.rc: unrepresentable cutoff accepted for R=${r.resistance}, C=${c.capacitance}`,
      );
    if (expected > 0 && Number.isFinite(expected) && Number.isFinite(actual)) {
      const tolerance = Math.max(
        Number.MIN_VALUE * 2,
        expected >= 1 && expected < 1000 ? 0.501 : expected * 0.001,
      );
      if (Math.abs(actual - expected) > tolerance)
        failures.push(
          `numeric.rc: expected cutoff approximately ${expected} Hz, displayed ${actual} Hz`,
        );
    }
  } else if (document.layout.preset === "voltage-divider") {
    const top = component("top");
    const bottom = component("bottom");
    if (top?.type !== "resistor" || bottom?.type !== "resistor")
      return ["numeric.divider: normalized role types differ"];
    const match = /VOUT\/VIN = Rbottom\/\(Rtop\+Rbottom\) = (\d+(?:\.\d+)?(?:e[+-]?\d+)?)/.exec(
      svg,
    );
    const actual = match ? Number(match[1]) : Number.NaN;
    if (!(actual > 0) || actual > 1 || !Number.isFinite(actual))
      failures.push(
        `numeric.divider: positive finite Rtop=${top.resistance}, Rbottom=${bottom.resistance} rendered ratio ${actual}; diagnose underflow rather than inventing zero`,
      );
    const scale = Math.max(top.resistance, bottom.resistance);
    const expected =
      bottom.resistance / scale / (top.resistance / scale + bottom.resistance / scale);
    if (
      expected > 0 &&
      Math.abs(actual - expected) > Math.max(Number.MIN_VALUE * 2, expected * 0.001)
    )
      failures.push(
        `numeric.divider: expected ratio approximately ${expected}, displayed ${actual}`,
      );
  } else if (
    document.layout.preset === "led-series" &&
    (!svg.includes("LED forward voltage and current are not assumed") ||
      /\b\d+(?:\.\d+)?\s*mA\b/.test(svg))
  ) {
    failures.push("numeric.led: drawing-only contract must not invent LED current");
  }
  return failures;
}

type WirePoint = readonly [number, number];
type WireSegment = { net: string; a: WirePoint; b: WirePoint };

export function routingInvariants(
  document: FigureDocument,
  svg: string,
  endpoints: Record<string, { x: number; y: number; net: string }>,
): string[] {
  const failures: string[] = [];
  const decode = (value: string) =>
    value
      .replaceAll("&quot;", '"')
      .replaceAll("&apos;", "'")
      .replaceAll("&lt;", "<")
      .replaceAll("&gt;", ">")
      .replaceAll("&amp;", "&");
  const attribute = (tag: string, key: string) =>
    decode(new RegExp(`\\b${key}="([^"]*)"`).exec(tag)?.[1] ?? "");
  const on = (point: WirePoint, segment: WireSegment) =>
    (segment.a[0] === segment.b[0] &&
      point[0] === segment.a[0] &&
      point[1] >= Math.min(segment.a[1], segment.b[1]) &&
      point[1] <= Math.max(segment.a[1], segment.b[1])) ||
    (segment.a[1] === segment.b[1] &&
      point[1] === segment.a[1] &&
      point[0] >= Math.min(segment.a[0], segment.b[0]) &&
      point[0] <= Math.max(segment.a[0], segment.b[0]));
  const touches = (a: WireSegment, b: WireSegment) => {
    if (on(a.a, b) || on(a.b, b) || on(b.a, a) || on(b.b, a)) return true;
    const point: WirePoint = a.a[0] === a.b[0] ? [a.a[0], b.a[1]] : [b.a[0], a.a[1]];
    return on(point, a) && on(point, b);
  };
  const segments: WireSegment[] = [];
  for (const [tag] of svg.matchAll(/<path\b[^>]*\bdata-net="[^"]*"[^>]*>/g)) {
    const net = attribute(tag, "data-net");
    const path = attribute(tag, "d");
    if (!Object.hasOwn(document.circuit.nets, net))
      failures.push(`routing: undeclared SVG net ${net}`);
    const commands = [
      ...path.matchAll(
        /([ML])\s*(-?\d+(?:\.\d+)?(?:e[+-]?\d+)?)\s+(-?\d+(?:\.\d+)?(?:e[+-]?\d+)?)/g,
      ),
    ];
    if (commands.length < 2 || commands.map(([command]) => command).join("") !== path) {
      failures.push(`routing: ${net} wire is not an inspectable M/L polyline`);
      continue;
    }
    let previous: WirePoint | undefined;
    for (const [, command, x, y] of commands) {
      const point: WirePoint = [Number(x), Number(y)];
      if (command === "L" && previous) {
        if (point[0] !== previous[0] && point[1] !== previous[1])
          failures.push(`routing: ${net} has a nonorthogonal segment`);
        segments.push({ net, a: previous, b: point });
      }
      previous = point;
    }
  }
  for (const [index, segment] of segments.entries()) {
    for (const other of segments.slice(index + 1)) {
      if (segment.net !== other.net && touches(segment, other))
        failures.push(`routing: false short/crossing between ${segment.net} and ${other.net}`);
    }
  }
  for (const net of Object.keys(document.circuit.nets)) {
    const own = segments.filter((segment) => segment.net === net);
    if (own.length === 0) {
      failures.push(`routing: ${net} has no SVG wires`);
      continue;
    }
    const reached = new Set<number>([0]);
    for (let pass = 0; pass < own.length; pass++) {
      for (const [index, segment] of own.entries()) {
        if ([...reached].some((other) => own[other] !== undefined && touches(segment, own[other])))
          reached.add(index);
      }
    }
    if (reached.size !== own.length) failures.push(`routing: ${net} has disconnected wire islands`);
  }
  for (const [endpoint, { x, y, net }] of Object.entries(endpoints)) {
    if (!segments.some((segment) => segment.net === net && on([x, y], segment)))
      failures.push(`routing: ${endpoint} is not on its ${net} wire`);
    if (segments.some((segment) => segment.net !== net && on([x, y], segment)))
      failures.push(`routing: ${endpoint} touches a different net`);
  }
  for (const [tag] of svg.matchAll(/<circle\b[^>]*\bdata-junction="[^"]*"[^>]*>/g)) {
    const net = attribute(tag, "data-junction");
    const point: WirePoint = [Number(attribute(tag, "cx")), Number(attribute(tag, "cy"))];
    const directions = new Set<string>();
    for (const segment of segments) {
      if (!on(point, segment)) continue;
      if (segment.net !== net) failures.push(`routing: ${net} junction touches ${segment.net}`);
      else
        for (const end of [segment.a, segment.b]) {
          if (end[0] !== point[0] || end[1] !== point[1])
            directions.add(`${Math.sign(end[0] - point[0])},${Math.sign(end[1] - point[1])}`);
        }
    }
    if (directions.size < 3) failures.push(`routing: ${net} false junction at ${point.join(",")}`);
  }
  return [...new Set(failures)];
}

function evaluate(entry: StressCase): StressCaseResult {
  const started = performance.now();
  const original = fingerprint(entry.document);
  const invariants: string[] = [];
  const check = (condition: boolean, message: string) => {
    if (!condition) invariants.push(message);
  };
  const equal = (actual: unknown, expected: unknown, message: string) =>
    check(fingerprint(actual, true) === fingerprint(expected, true), message);
  const invoke = <T>(name: string, action: () => T): T | undefined => {
    try {
      return action();
    } catch (error) {
      invariants.push(
        `${name}: threw ${error instanceof Error ? `${error.name}: ${error.message}` : String(error)}`,
      );
      return undefined;
    } finally {
      check(fingerprint(entry.document) === original, `${name}: mutated caller input`);
    }
  };
  const result = invoke("renderSVG", () => renderSVG(entry.document));
  const repeated = invoke("renderSVG repeat", () => renderSVG(entry.document));
  const validation = invoke("validate", () => validate(entry.document));
  const detail = invoke("inspect", () => inspect(entry.document));
  const diagnostics = result?.diagnostics ?? [];
  if (result && repeated) equal(repeated, result, "determinism: repeated render result differs");
  for (const [name, value] of [
    ["validate", validation],
    ["inspect", detail],
  ] as const) {
    if (!value) continue;
    check(!Object.hasOwn(value, "svg"), `${name}: leaked SVG through non-render API`);
    if (result) {
      equal(value.ok, result.ok, `${name}: render acceptance disagrees`);
      equal(value.diagnostics, result.diagnostics, `${name}: diagnostics disagree`);
      if (value.ok && result.ok) {
        equal(value.bounds, result.bounds, `${name}: bounds disagree`);
        equal(value.document, result.document, `${name}: normalized document disagrees`);
        equal(value.circuit, result.circuit, `${name}: circuit disagrees`);
        equal(value.rendererVersion, result.rendererVersion, `${name}: renderer version disagrees`);
      }
    }
  }
  if (result) {
    if (entry.expectation.kind === "render")
      check(result.ok, "expectation: valid example was rejected");
    if (entry.expectation.kind === "diagnostic") {
      check(
        !result.ok,
        `expectation: invalid document rendered instead of ${entry.expectation.code}`,
      );
      check(
        diagnostics.some(
          ({ code }) => entry.expectation.kind === "diagnostic" && code === entry.expectation.code,
        ),
        `expectation: missing diagnostic ${entry.expectation.code}`,
      );
    }
    if (!result.ok) {
      check(!Object.hasOwn(result, "svg"), "rejection: invalid input exposed an SVG");
      check(diagnostics.length > 0, "rejection: missing actionable diagnostic");
    } else {
      const parsed = figureSchema.safeParse(entry.document);
      check(parsed.success, "schema: accepted input fails public schema");
      check(
        figureSchema.safeParse(result.document).success,
        "schema: normalized output fails public schema",
      );
      check(
        result.document.version === 1 && result.rendererVersion.length > 0,
        "contract: missing document or renderer version",
      );
      equal(result.diagnostics, [], "contract: valid render has diagnostics");
      equal(
        result.circuit,
        result.document.circuit,
        "contract: circuit differs from normalized document",
      );
      if (parsed.success) {
        equal(
          graph(parsed.data),
          graph(result.document),
          "graph: normalized endpoint membership changed",
        );
        equal(
          parsed.data.circuit.components,
          result.circuit.components,
          "graph: component values or IDs changed",
        );
        equal(parsed.data.circuit.ports, result.circuit.ports, "graph: ports changed");
        equal(parsed.data.layout, result.document.layout, "graph: recipe or roles changed");
      }
      const declaredEndpoints = [
        ...Object.entries(result.circuit.components).flatMap(([id, component]) =>
          componentPins[component.type].map((pin) => `${id}.${pin}`),
        ),
        ...Object.keys(result.circuit.ports),
      ].sort();
      equal(
        Object.values(result.circuit.nets).flat().sort(),
        declaredEndpoints,
        "graph: declared catalog pins do not occur exactly once",
      );
      for (const [net, endpoints] of Object.entries(result.circuit.nets)) {
        equal(endpoints, [...endpoints].sort(), `normalization: net ${net} endpoints are unsorted`);
        check(
          new Set(endpoints).size === endpoints.length,
          `graph: net ${net} contains duplicate endpoints`,
        );
        if (detail?.ok) {
          for (const endpoint of endpoints) {
            const point = detail.endpoints[endpoint];
            check(
              point?.net === net && Number.isFinite(point.x) && Number.isFinite(point.y),
              `inspect: endpoint ${endpoint} has wrong net or nonfinite coordinates`,
            );
          }
        }
      }
      if (detail?.ok) {
        equal(
          Object.keys(detail.endpoints).sort(),
          Object.values(result.circuit.nets).flat().sort(),
          "inspect: endpoint set differs from normalized graph",
        );
        equal(detail.nets, result.circuit.nets, "inspect: nets differ");
        equal(detail.components, result.circuit.components, "inspect: components differ");
        equal(detail.terminals, result.circuit.ports, "inspect: terminals differ");
        equal(detail.roles, result.document.layout.roles, "inspect: roles differ");
        if (complexRecipeIds.some((recipe) => recipe === result.document.layout.preset)) {
          invariants.push(...routingInvariants(result.document, result.svg, detail.endpoints));
          const permuted = structuredClone(result.document);
          permuted.circuit.nets = Object.fromEntries(
            Object.entries(permuted.circuit.nets)
              .reverse()
              .map(([net, pins]) => [net, pins.reverse()]),
          );
          const before = fingerprint(permuted);
          const reordered = invoke("route-order render", () => renderSVG(permuted));
          check(fingerprint(permuted) === before, "route-order: renderer mutated reordered input");
          if (reordered)
            equal(
              reordered,
              result,
              "route-order: permutation changed normalized render or geometry",
            );
        }
      }
      check(
        !/<(?:text|style|script|image|foreignObject|filter)\b|(?:href|url\()|font-family|NaN|Infinity/.test(
          result.svg,
        ),
        "svg: non-standalone, executable or nonfinite output",
      );
      check(
        result.svg.startsWith('<svg xmlns="http://www.w3.org/2000/svg"') &&
          result.svg.endsWith("</svg>") &&
          result.svg.includes('role="img"') &&
          result.svg.includes("<title>") &&
          result.svg.includes("<desc>"),
        "svg: missing standalone accessible public contract",
      );
      const boxes = [
        result.bounds,
        ...Object.values(result.bounds.labels),
        ...Object.values(result.bounds.symbols),
        ...Object.values(result.bounds.routes).flat(),
      ];
      check(
        boxes.every(
          ({ x, y, width, height }) =>
            [x, y, width, height].every(Number.isFinite) && width >= 0 && height >= 0,
        ),
        "bounds: nonfinite or negative geometry",
      );
      const normalizedBefore = fingerprint(result.document);
      const normalized = invoke("normalized render", () => renderSVG(result.document));
      check(
        fingerprint(result.document) === normalizedBefore,
        "normalization: render mutated normalized input",
      );
      if (normalized)
        equal(normalized, result, "normalization: rendering normalized output changed result");
      for (const ids of Object.values(result.document.presentation.highlight ?? {})) {
        equal(
          ids,
          [...new Set(ids)].sort(),
          "normalization: focus IDs are not sorted and deduplicated",
        );
      }
      for (const kind of ["components", "nets"] as const) {
        const focused = structuredClone(result.document);
        focused.presentation.highlight = {
          components: [],
          nets: [],
          [kind]: Object.keys(result.circuit[kind]),
        };
        const beforeFocus = fingerprint(focused);
        const highlighted = invoke(`${kind} focus`, () => renderSVG(focused));
        check(fingerprint(focused) === beforeFocus, `focus: ${kind} render mutated input`);
        check(highlighted?.ok === true, `focus: valid ${kind} highlight rejected`);
        if (highlighted?.ok) {
          equal(
            geometry(highlighted.svg),
            geometry(result.svg),
            `focus: ${kind} changed paths or transforms`,
          );
          equal(highlighted.bounds, result.bounds, `focus: ${kind} changed bounds`);
          equal(highlighted.circuit, result.circuit, `focus: ${kind} changed circuit`);
        }
      }
      invariants.push(...numericInvariants(result.document, result.svg));
    }
    check(
      diagnostics.every(
        ({ code, path, message }) =>
          code.length > 0 && (path === "" || path.startsWith("/")) && message.length > 0,
      ),
      "diagnostics: missing code, JSON pointer or message",
    );
  }
  return {
    id: entry.id,
    ...(entry.tags ? { tags: [...entry.tags] } : {}),
    expectation: { ...entry.expectation },
    passed: invariants.length === 0,
    outcome: result ? (result.ok ? "rendered" : "rejected") : "threw",
    diagnostics,
    invariants,
    elapsedMs: performance.now() - started,
  };
}

export function* runStress(): Generator<StressProgress, StressReport> {
  const started = performance.now();
  const entries = getStressCases();
  const cases: StressCaseResult[] = [];
  const failures: StressFailure[] = [];
  const progress: StressProgress = {
    completed: 0,
    total: entries.length,
    passed: 0,
    failed: 0,
    rendered: 0,
    rejected: 0,
    elapsedMs: 0,
    currentCase: "",
  };
  for (const entry of entries) {
    const original = structuredClone(entry.document);
    const result = evaluate(entry);
    cases.push(result);
    progress.completed++;
    progress.currentCase = entry.id;
    if (result.passed) progress.passed++;
    else {
      progress.failed++;
      failures.push({
        id: entry.id,
        document: original,
        ...(entry.tags ? { tags: [...entry.tags] } : {}),
        expectation: { ...entry.expectation },
        invariants: [...result.invariants],
        diagnostics: result.diagnostics,
      });
    }
    if (result.outcome === "rendered") progress.rendered++;
    if (result.outcome === "rejected") progress.rejected++;
    progress.elapsedMs = performance.now() - started;
    yield { ...progress };
  }
  return {
    ...progress,
    elapsedMs: performance.now() - started,
    ok: failures.length === 0,
    failures,
    cases,
  };
}
