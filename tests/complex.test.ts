import { describe, expect, test } from "bun:test";
import { getCatalog, getSchema, loadExample, recipes } from "../src/catalog.ts";
import { createComplexScene } from "../src/complex-scenes.ts";
import { formatSI, inspect, renderSVG } from "../src/renderer.ts";
import type { Point, Scene } from "../src/scene.ts";
import {
  basicRecipeIds,
  complexRecipeIds,
  componentPins,
  componentSchema,
  type FigureDocument,
  recipeIds,
  themePresets,
} from "../src/schema.ts";
import { resolveTheme } from "../src/theme.ts";
import type { Box } from "../src/types.ts";
import { textPath } from "../src/typography.ts";
import { validateDocument } from "../src/validation.ts";

const counts = {
  "loaded-divider": [3, 3, 9],
  "rc-ladder": [4, 4, 11],
  "wheatstone-bridge": [4, 4, 12],
  "bridge-rectifier": [6, 4, 16],
  "transistor-switch": [5, 6, 13],
  "inverting-amplifier": [3, 6, 14],
} as const;
const overlaps = (a: Box, b: Box) =>
  a.x < b.x + b.width && a.x + a.width > b.x && a.y < b.y + b.height && a.y + a.height > b.y;
const expand = (box: Box, amount: number): Box => ({
  x: box.x - amount,
  y: box.y - amount,
  width: box.width + amount * 2,
  height: box.height + amount * 2,
});
const contains = (outer: Box, inner: Box) =>
  inner.x >= outer.x &&
  inner.y >= outer.y &&
  inner.x + inner.width <= outer.x + outer.width &&
  inner.y + inner.height <= outer.y + outer.height;
const onSegment = (point: Point, a: Point, b: Point) =>
  (a[0] === b[0] &&
    point[0] === a[0] &&
    point[1] >= Math.min(a[1], b[1]) &&
    point[1] <= Math.max(a[1], b[1])) ||
  (a[1] === b[1] &&
    point[1] === a[1] &&
    point[0] >= Math.min(a[0], b[0]) &&
    point[0] <= Math.max(a[0], b[0]));
const segments = (scene: Scene) =>
  scene.routes.flatMap((route) =>
    route.points.slice(1).map((b, i) => ({ net: route.net, a: route.points[i] as Point, b })),
  );

function checkMeasuredScene(document: FigureDocument, scene: Scene) {
  const frame = scene.frame;
  expect(frame).toBeDefined();
  if (!frame) throw new Error("Complex frame is required");
  const { theme, diagnostics } = resolveTheme(document);
  expect(diagnostics).toEqual([]);
  const padding = (theme.strokeWidth * 1.5) / 2;
  const measured: [string, Box][] = [];
  const routes = segments(scene).map(
    ({ net, a, b }) =>
      [
        net,
        expand(
          {
            x: Math.min(a[0], b[0]),
            y: Math.min(a[1], b[1]),
            width: Math.abs(a[0] - b[0]),
            height: Math.abs(a[1] - b[1]),
          },
          padding,
        ),
      ] as const,
  );
  for (const symbol of scene.symbols) {
    expect(symbol.paths.length).toBeGreaterThan(0);
    expect(symbol.paths.join("")).not.toMatch(/NaN|Infinity|<|>/);
    expect(symbol.gap).toBeGreaterThan(theme.strokeWidth * 1.5);
    expect(contains(frame.sceneRegion, expand(symbol.box, padding)), symbol.id).toBe(true);
  }
  for (const label of scene.labels) {
    const text = textPath(
      label.text,
      label.family,
      label.size * theme.fontScale,
      label.x,
      label.y,
      label.align,
    );
    expect(text.missing, label.id).toEqual([]);
    const region =
      label.region === "header"
        ? { x: 64, y: 36, width: frame.width - 128, height: 94 }
        : label.region === "footer"
          ? {
              x: 64,
              y: frame.footerTop + 16,
              width: frame.width - 128,
              height: frame.height - 18 - (frame.footerTop + 16),
            }
          : frame.sceneRegion;
    expect(contains(region, text.box), `${label.id}: region ${label.region}`).toBe(true);
    for (const [id, box] of measured)
      expect(overlaps(text.box, box), `${label.id}: label ${id}`).toBe(false);
    if (label.region === "scene") {
      for (const symbol of scene.symbols)
        expect(
          overlaps(text.box, expand(symbol.box, padding)),
          `${label.id}: symbol ${symbol.id}`,
        ).toBe(false);
      for (const [net, box] of routes)
        expect(overlaps(text.box, box), `${label.id}: net ${net}`).toBe(false);
    }
    measured.push([label.id, text.box]);
  }
}

function checkConnectivity(document: FigureDocument, scene: Scene) {
  const wires = segments(scene);
  for (const { a, b } of wires) expect(a[0] === b[0] || a[1] === b[1]).toBe(true);
  for (const [i, first] of wires.entries()) {
    for (const second of wires.slice(i + 1)) {
      if (first.net === second.net) continue;
      const contact =
        onSegment(first.a, second.a, second.b) ||
        onSegment(first.b, second.a, second.b) ||
        onSegment(second.a, first.a, first.b) ||
        onSegment(second.b, first.a, first.b);
      expect(contact, `${first.net}/${second.net}: cross-net contact`).toBe(false);
      const crossing =
        first.a[0] === first.b[0]
          ? ([first.a[0], second.a[1]] as const)
          : ([second.a[0], first.a[1]] as const);
      expect(
        onSegment(crossing, first.a, first.b) && onSegment(crossing, second.a, second.b),
        `${first.net}/${second.net}: crossing-free curated routes`,
      ).toBe(false);
    }
  }
  for (const [endpoint, { x, y, net }] of Object.entries(scene.endpoints)) {
    expect(
      wires.some((segment) => segment.net === net && onSegment([x, y], segment.a, segment.b)),
      endpoint,
    ).toBe(true);
    expect(
      wires.some((segment) => segment.net !== net && onSegment([x, y], segment.a, segment.b)),
      `${endpoint}: short`,
    ).toBe(false);
  }
  for (const [net, pins] of Object.entries(document.circuit.nets)) {
    const own = wires.filter((segment) => segment.net === net);
    const reached = new Set<number>([0]);
    for (let pass = 0; pass < own.length; pass++) {
      for (const [i, segment] of own.entries()) {
        if (
          [...reached].some((j) => {
            const other = own[j];
            return (
              other &&
              (onSegment(segment.a, other.a, other.b) ||
                onSegment(segment.b, other.a, other.b) ||
                onSegment(other.a, segment.a, segment.b) ||
                onSegment(other.b, segment.a, segment.b))
            );
          })
        )
          reached.add(i);
      }
    }
    expect(reached.size, `${net}: disconnected route`).toBe(own.length);
    for (const pin of pins) expect(scene.endpoints[pin]?.net).toBe(net);
  }
  for (const dot of scene.dots) {
    expect(
      wires.some(
        (segment) => segment.net !== dot.net && onSegment(dot.point, segment.a, segment.b),
      ),
      `${dot.net}: cross-net junction`,
    ).toBe(false);
    const directions = new Set<string>();
    for (const { net, a, b } of wires) {
      if (net !== dot.net || !onSegment(dot.point, a, b)) continue;
      for (const p of [a, b])
        if (p[0] !== dot.point[0] || p[1] !== dot.point[1])
          directions.add(`${Math.sign(p[0] - dot.point[0])},${Math.sign(p[1] - dot.point[1])}`);
    }
    expect(directions.size, `${dot.net}: branch dot`).toBeGreaterThanOrEqual(3);
  }
}

function rename(document: FigureDocument): FigureDocument {
  const names = new Map(
    [...Object.keys(document.circuit.components), ...Object.keys(document.circuit.ports)].map(
      (id, i) => [id, i === 0 ? "constructor" : `X${i}`],
    ),
  );
  const endpoint = (pin: string) => {
    const [id, suffix] = pin.split(".");
    return `${names.get(id ?? "")}${suffix ? `.${suffix}` : ""}`;
  };
  return {
    ...document,
    circuit: {
      components: Object.fromEntries(
        Object.entries(document.circuit.components).map(([id, value]) => [names.get(id), value]),
      ),
      ports: Object.fromEntries(
        Object.entries(document.circuit.ports).map(([id, value]) => [names.get(id), value]),
      ),
      nets: Object.fromEntries(
        Object.values(document.circuit.nets).map((pins, i) => [
          i === 0 ? "__proto__" : `net${i}`,
          pins.map(endpoint),
        ]),
      ),
    },
    layout: {
      ...document.layout,
      roles: Object.fromEntries(
        Object.entries(document.layout.roles).map(([role, id]) => [role, names.get(id)]),
      ),
    },
  } as FigureDocument;
}

test("catalog and schema expose nine version-1 recipes and type-only semiconductor pins", () => {
  expect(basicRecipeIds).toHaveLength(3);
  expect(complexRecipeIds).toHaveLength(6);
  expect(new Set(recipeIds).size).toBe(9);
  expect(getCatalog().recipes.map(({ id }) => id)).toEqual([...recipeIds]);
  expect(getCatalog().version).toBe(1);
  expect(JSON.stringify(getSchema())).toContain("noninverting");
  for (const type of ["diode", "npn", "op-amp"] as const) {
    expect(getCatalog().components[type].pins).toEqual(componentPins[type]);
    expect(getCatalog().components[type].parameters).toEqual({});
    expect(componentSchema.safeParse({ type }).success).toBe(true);
    expect(componentSchema.safeParse({ type, gain: 100 }).success).toBe(false);
    expect(componentSchema.safeParse({ type, current: 0.02 }).success).toBe(false);
  }
});

for (const preset of recipeIds) {
  describe(preset, () => {
    for (const theme of themePresets) {
      test(`${theme}: generic validation and integrated rendering`, () => {
        const document = loadExample(preset);
        document.presentation.theme.preset = theme;
        expect(validateDocument(document).ok).toBe(true);
        const result = renderSVG(document);
        expect(result.ok, JSON.stringify(result.diagnostics)).toBe(true);
        const detail = inspect(document);
        expect(detail.ok, JSON.stringify(detail.diagnostics)).toBe(true);
        if (detail.ok)
          expect(Object.keys(detail.endpoints).sort()).toEqual(
            Object.values(document.circuit.nets).flat().sort(),
          );
      });
    }
  });
}

for (const preset of complexRecipeIds) {
  describe(`${preset} direct scene`, () => {
    test("counts, every pin/symbol, actual net membership, topology and measured bounds", () => {
      for (const theme of themePresets) {
        const document = loadExample(preset);
        document.presentation.theme.preset = theme;
        const scene = createComplexScene(document, formatSI);
        if (!scene) throw new Error("Expected complex scene");
        expect([
          Object.keys(document.circuit.components).length,
          Object.keys(document.circuit.nets).length,
          Object.keys(scene.endpoints).length,
        ]).toEqual([...counts[preset]]);
        expect(Object.keys(scene.endpoints).sort()).toEqual(
          Object.values(document.circuit.nets).flat().sort(),
        );
        expect(scene.symbols.map(({ id }) => id).sort()).toEqual(
          [
            ...Object.keys(document.circuit.components),
            ...Object.entries(document.circuit.ports)
              .filter(([, port]) => port.kind === "ground")
              .map(([id]) => id),
          ].sort(),
        );
        expect(scene.terminals.map(({ id }) => id).sort()).toEqual(
          Object.entries(document.circuit.ports)
            .filter(([, port]) => port.kind === "terminal")
            .map(([id]) => id)
            .sort(),
        );
        checkConnectivity(document, scene);
        checkMeasuredScene(document, scene);
      }
    });
    test("role-resolved IDs and author-selected net names, not hardcoded example names", () => {
      const document = rename(loadExample(preset));
      expect(validateDocument(document).ok).toBe(true);
      const scene = createComplexScene(document, formatSI);
      if (!scene) throw new Error("Expected complex scene");
      expect(Object.keys(scene.endpoints).sort()).toEqual(
        Object.values(document.circuit.nets).flat().sort(),
      );
      checkConnectivity(document, scene);
    });
    test("net and pin mutations are rejected", () => {
      const document = loadExample(preset);
      const nets = Object.values(document.circuit.nets);
      const a = nets[0];
      const b = nets[1];
      if (!a || !b || !a[0] || !b[0]) throw new Error("Expected two nets");
      [a[0], b[0]] = [b[0], a[0]];
      const altered = validateDocument(document);
      expect(altered.ok).toBe(false);
      expect(altered.diagnostics.some(({ code }) => code === "layout.topology_mismatch")).toBe(
        true,
      );
      const invalid = loadExample(preset);
      const pinNet = Object.values(invalid.circuit.nets).find((pins) =>
        pins.some((pin) => pin.includes(".")),
      );
      if (!pinNet) throw new Error("Expected component pin");
      const i = pinNet.findIndex((pin) => pin.includes("."));
      pinNet[i] = `${pinNet[i]?.split(".")[0]}.invalid`;
      expect(
        validateDocument(invalid).diagnostics.some(({ code }) => code === "circuit.unknown_pin"),
      ).toBe(true);
    });
  });
}

for (const [preset, role, a, b] of [
  ["bridge-rectifier", "positiveA", "anode", "cathode"],
  ["bridge-rectifier", "positiveB", "anode", "cathode"],
  ["bridge-rectifier", "negativeA", "anode", "cathode"],
  ["bridge-rectifier", "negativeB", "anode", "cathode"],
  ["transistor-switch", "led", "anode", "cathode"],
  ["transistor-switch", "switch", "collector", "emitter"],
  ["inverting-amplifier", "amplifier", "inverting", "noninverting"],
  ["inverting-amplifier", "amplifier", "vplus", "vminus"],
] as const) {
  test(`${preset}: swapping ${role}.${a}/${b} rejects polarity`, () => {
    const document = loadExample(preset);
    const id = document.layout.roles[role];
    document.circuit.nets = Object.fromEntries(
      Object.entries(document.circuit.nets).map(([net, pins]) => [
        net,
        pins.map((pin) =>
          pin === `${id}.${a}` ? `${id}.${b}` : pin === `${id}.${b}` ? `${id}.${a}` : pin,
        ),
      ]),
    );
    const result = validateDocument(document);
    expect(result.ok).toBe(false);
    expect(result.diagnostics.some(({ code }) => code === "layout.topology_mismatch")).toBe(true);
  });
}

test("distinct graph families and honest model limitations", () => {
  const keys = complexRecipeIds.map((id) => JSON.stringify(recipes[id].nets));
  expect(new Set(keys).size).toBe(6);
  expect(recipes["rc-ladder"].derived.assumption).toContain("Unbuffered");
  expect(recipes["inverting-amplifier"].derived.assumption).toContain("not wired to GND");
  expect(recipes["bridge-rectifier"].derived.formula).toBeNull();
  expect(recipes["transistor-switch"].derived.formula).toBeNull();
  for (const preset of basicRecipeIds)
    expect(createComplexScene(loadExample(preset), formatSI)).toBeNull();
});
