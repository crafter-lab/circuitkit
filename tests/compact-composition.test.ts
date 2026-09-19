import { describe, expect, test } from "bun:test";
import { createHash } from "node:crypto";
import { Resvg } from "@resvg/resvg-js";
import { routingInvariants } from "../app/gallery/stress.ts";
import {
  type Box,
  type FigureDocument,
  inspect,
  loadExample,
  renderSchematicSVG,
} from "../src/index.ts";
import { componentPins, semanticTones, themePresets } from "../src/schema.ts";
import { resolveTheme } from "../src/theme.ts";
import { escapeXML } from "../src/typography.ts";

const recipes = ["rc-lowpass", "inverting-amplifier", "bridge-rectifier"] as const;
type Recipe = (typeof recipes)[number];
type Rendered = Extract<ReturnType<typeof renderSchematicSVG>, { ok: true }> & {
  endpoints: Record<string, { x: number; y: number; net: string }>;
};
type Point = readonly [number, number];
type Segment = { net: string; a: Point; b: Point; lead: boolean };
const classicHashes: Record<Recipe, readonly string[]> = {
  "rc-lowpass": [
    "0ac5caf29d169b233385e624d9d14682a378fc1517d324f469892535a5cdd9b0",
    "98a7e989fba67cbec3c03d94b7eff52db901ded9b40f2fc213aa0ca1ebd202c1",
    "f744766ae4de45cd231979784d6ccd262bf1d326781e07bd82d66c1404e868c0",
  ],
  "inverting-amplifier": [
    "e67105f5790dd74ffce6bcb021e6b5ee6e0fc64ba3b9cb85ec994adc0e012bf4",
    "9342dafb13382a05d250b936f96cf6e804070c1897f0084f1a21d0a2a28ceed4",
    "c3d997a841c5ca41710f25cbb2634e3e62a9f06db58e649f2a5cde7b575bb295",
  ],
  "bridge-rectifier": [
    "699d85739fcc24420285bd028934919895a58f013dc5de3f77ad1dd71a2dd2ff",
    "102e6f448a613fffce42a86c96a7fa8ea45e56341542f4ba3fb68b48108e9ed5",
    "1ae9b8df4df3327c0809e3ba1bb5e8c412767c7b4e85cdcc68d0a7cc57946ecd",
  ],
};

function success(result: ReturnType<typeof renderSchematicSVG>): Rendered {
  expect(result.ok, JSON.stringify(result.diagnostics)).toBe(true);
  if (!result.ok) throw new Error(JSON.stringify(result.diagnostics));
  if (!result.endpoints) throw new Error("Schematic endpoint geometry is missing");
  return { ...result, endpoints: result.endpoints };
}

function compact(document: FigureDocument, annotations = false) {
  return success(renderSchematicSVG(document, { composition: "compact", annotations }));
}

function attribute(tag: string, key: string) {
  return (new RegExp(`\\b${key}="([^"]*)"`).exec(tag)?.[1] ?? "")
    .replaceAll("&quot;", '"')
    .replaceAll("&apos;", "'")
    .replaceAll("&lt;", "<")
    .replaceAll("&gt;", ">")
    .replaceAll("&amp;", "&");
}

function wires(svg: string): Segment[] {
  return [...svg.matchAll(/<path\b[^>]*\bdata-net="[^"]*"[^>]*>/g)].flatMap(([tag]) => {
    const path = attribute(tag, "d");
    const commands = [
      ...path.matchAll(
        /([ML])\s*(-?\d+(?:\.\d+)?(?:e[+-]?\d+)?)\s+(-?\d+(?:\.\d+)?(?:e[+-]?\d+)?)/g,
      ),
    ];
    expect(commands.map(([command]) => command).join("")).toBe(path);
    expect(commands.length).toBeGreaterThanOrEqual(2);
    return commands.flatMap(([, command, x, y], index) => {
      const previous = commands[index - 1];
      if (command !== "L" || !previous) return [];
      return [
        {
          net: attribute(tag, "data-net"),
          a: [Number(previous[2]), Number(previous[3])] as Point,
          b: [Number(x), Number(y)] as Point,
          lead: tag.includes("data-pin-lead="),
        },
      ];
    });
  });
}

const same = (a: Point, b: Point) => a[0] === b[0] && a[1] === b[1];
const on = (p: Point, { a, b }: Segment) =>
  (a[0] === b[0] &&
    p[0] === a[0] &&
    p[1] >= Math.min(a[1], b[1]) &&
    p[1] <= Math.max(a[1], b[1])) ||
  (a[1] === b[1] && p[1] === a[1] && p[0] >= Math.min(a[0], b[0]) && p[0] <= Math.max(a[0], b[0]));

function branches(svg: string) {
  const segments = wires(svg);
  const candidates = segments.flatMap(({ a, b }) => [a, b]);
  for (const first of segments) {
    for (const second of segments) {
      if (first.net !== second.net || (first.a[0] === first.b[0]) === (second.a[0] === second.b[0]))
        continue;
      const point: Point =
        first.a[0] === first.b[0] ? [first.a[0], second.a[1]] : [second.a[0], first.a[1]];
      if (on(point, first) && on(point, second)) candidates.push(point);
    }
  }
  const result = new Map<string, { net: string; point: Point }>();
  for (const net of new Set(segments.map((segment) => segment.net))) {
    for (const point of candidates) {
      const directions = new Set<string>();
      for (const segment of segments) {
        if (segment.net !== net || !on(point, segment)) continue;
        for (const end of [segment.a, segment.b]) {
          if (!same(end, point))
            directions.add(`${Math.sign(end[0] - point[0])},${Math.sign(end[1] - point[1])}`);
        }
      }
      if (directions.size >= 3) result.set(JSON.stringify([net, point]), { net, point });
    }
  }
  return [...result.values()];
}

function missingJunctions(svg: string) {
  const dots = [...svg.matchAll(/<circle\b[^>]*\bdata-junction="[^"]*"[^>]*>/g)].map(([tag]) => ({
    net: attribute(tag, "data-junction"),
    point: [Number(attribute(tag, "cx")), Number(attribute(tag, "cy"))] as Point,
  }));
  return branches(svg).filter(
    ({ net, point }) =>
      dots.filter((dot) => dot.net === net && same(dot.point, point)).length !== 1,
  );
}

function clipped(segment: Segment, box: Box): Point[] {
  const { a, b } = segment;
  if (a[0] === b[0]) {
    const low = Math.max(Math.min(a[1], b[1]), box.y);
    const high = Math.min(Math.max(a[1], b[1]), box.y + box.height);
    return a[0] < box.x || a[0] > box.x + box.width || low > high
      ? []
      : [
          [a[0], low],
          [a[0], high],
        ];
  }
  const low = Math.max(Math.min(a[0], b[0]), box.x);
  const high = Math.min(Math.max(a[0], b[0]), box.x + box.width);
  return a[1] < box.y || a[1] > box.y + box.height || low > high
    ? []
    : [
        [low, a[1]],
        [high, a[1]],
      ];
}

function symbolIntrusions(result: Rendered, svg = result.svg) {
  const failures: string[] = [];
  const { theme } = resolveTheme(result.document);
  for (const segment of wires(svg).filter(({ lead }) => !lead)) {
    for (const [id, box] of Object.entries(result.bounds.symbols)) {
      const intersection = clipped(segment, box);
      if (!intersection.length) continue;
      const selected =
        result.document.presentation.highlight?.components.includes(id) ||
        (result.annotations?.nets.some(({ net }) => net === result.endpoints[id]?.net) &&
          result.document.presentation.highlight?.nets.includes(result.endpoints[id]?.net ?? ""));
      const padding = (theme.strokeWidth * (selected ? 1.5 : 1)) / 2 + 1e-8;
      const intended = Object.entries(result.endpoints).some(
        ([endpoint, { x, y, net }]) =>
          (endpoint === id || endpoint.startsWith(`${id}.`)) &&
          net === segment.net &&
          (same([x, y], segment.a) || same([x, y], segment.b)) &&
          intersection.every(
            ([px, py]) => Math.abs(px - x) <= padding && Math.abs(py - y) <= padding,
          ),
      );
      if (!intended)
        failures.push(
          `${segment.net}: ${segment.a.join(",")} -> ${segment.b.join(",")} enters ${id}`,
        );
    }
  }
  return failures;
}

function graphAndGeometry(document: FigureDocument, result: Rendered) {
  expect(result.circuit.components).toEqual(document.circuit.components);
  expect(result.circuit.ports).toEqual(document.circuit.ports);
  expect(result.document.layout).toEqual(document.layout);
  expect(Object.keys(result.circuit.nets).sort()).toEqual(
    Object.keys(document.circuit.nets).sort(),
  );
  const declared = [
    ...Object.entries(document.circuit.components).flatMap(([id, component]) =>
      componentPins[component.type].map((pin) => `${id}.${pin}`),
    ),
    ...Object.keys(document.circuit.ports),
  ].sort();
  expect(Object.values(result.circuit.nets).flat().sort()).toEqual(declared);
  expect(Object.keys(result.endpoints).sort()).toEqual(declared);
  for (const [net, pins] of Object.entries(document.circuit.nets)) {
    expect(result.circuit.nets[net]).toEqual([...pins].sort());
    for (const pin of pins) {
      const point = result.endpoints[pin];
      expect(point?.net, pin).toBe(net);
      expect(Number.isFinite(point?.x) && Number.isFinite(point?.y), pin).toBe(true);
    }
  }
  expect(routingInvariants(result.document, result.svg, result.endpoints)).toEqual([]);
  expect(missingJunctions(result.svg)).toEqual([]);
  expect(symbolIntrusions(result)).toEqual([]);
}

function contains(outer: Box, inner: Box) {
  expect(inner.x).toBeGreaterThanOrEqual(outer.x - 1e-8);
  expect(inner.y).toBeGreaterThanOrEqual(outer.y - 1e-8);
  expect(inner.x + inner.width).toBeLessThanOrEqual(outer.x + outer.width + 1e-8);
  expect(inner.y + inner.height).toBeLessThanOrEqual(outer.y + outer.height + 1e-8);
}

const overlaps = (a: Box, b: Box) =>
  a.x < b.x + b.width && a.x + a.width > b.x && a.y < b.y + b.height && a.y + a.height > b.y;

function measuredCrop(result: Rendered) {
  const { bounds, svg } = result;
  expect(
    svg
      .match(/viewBox="([^"]+)"/)?.[1]
      ?.split(" ")
      .map(Number),
  ).toEqual([bounds.x, bounds.y, bounds.width, bounds.height]);
  const paint = [
    ...Object.values(bounds.labels),
    ...Object.values(bounds.symbols),
    ...Object.values(bounds.routes).flat(),
  ];
  for (const box of paint) {
    expect(Object.values(box).every(Number.isFinite)).toBe(true);
    contains(bounds, box);
  }
  expect(Math.min(...paint.map(({ x }) => x)) - bounds.x).toBeCloseTo(16, 8);
  expect(Math.min(...paint.map(({ y }) => y)) - bounds.y).toBeCloseTo(16, 8);
  expect(bounds.x + bounds.width - Math.max(...paint.map(({ x, width }) => x + width))).toBeCloseTo(
    16,
    8,
  );
  expect(
    bounds.y + bounds.height - Math.max(...paint.map(({ y, height }) => y + height)),
  ).toBeCloseTo(16, 8);
  const labels = Object.entries(bounds.labels);
  for (const [index, [id, box]] of labels.entries()) {
    for (const [other, otherBox] of labels.slice(index + 1))
      expect(overlaps(box, otherBox), `${id}/${other}`).toBe(false);
    for (const symbol of Object.values(bounds.symbols))
      expect(overlaps(box, symbol), id).toBe(false);
    for (const route of Object.values(bounds.routes).flat())
      expect(overlaps(box, route), id).toBe(false);
  }
  expect(svg).not.toMatch(
    /data-label="(?:title|subtitle|formula|assumption)"|data-caption=|data-legend-net=|<(?:text|script|image|foreignObject)\b|NaN|Infinity/,
  );
}

function annotate(document: FigureDocument) {
  document.presentation.annotations = {
    nets: Object.keys(document.circuit.nets).map((net, index) => ({
      net,
      label: String.fromCharCode(65 + index),
      description: `Conductor ${net}`,
      tone: semanticTones[index % semanticTones.length] ?? "blue",
    })),
    legend: true,
    caption: "Outside the schematic.",
  };
}

function renamed(document: FigureDocument) {
  const names = new Map(
    [...Object.keys(document.circuit.components), ...Object.keys(document.circuit.ports)].map(
      (id, index) => [id, index === 0 ? "X&1" : `X${index + 1}`],
    ),
  );
  const name = (id: string) => {
    const value = names.get(id);
    if (!value) throw new Error(`Unknown ID ${id}`);
    return value;
  };
  const endpoint = (pin: string) => {
    const [id = "", suffix] = pin.split(".");
    return `${name(id)}${suffix ? `.${suffix}` : ""}`;
  };
  document.circuit.components = Object.fromEntries(
    Object.entries(document.circuit.components).map(([id, component]) => [name(id), component]),
  );
  document.circuit.ports = Object.fromEntries(
    Object.entries(document.circuit.ports).map(([id, port]) => [name(id), port]),
  );
  document.circuit.nets = Object.fromEntries(
    Object.values(document.circuit.nets).map((pins, index) => [
      index === 0 ? "__proto__" : `node/${index}~&`,
      pins.map(endpoint),
    ]),
  );
  document.layout.roles = Object.fromEntries(
    Object.entries(document.layout.roles).map(([role, id]) => [role, name(id)]),
  );
  document.presentation.highlight = { components: [], nets: [] };
  return document;
}

const geometry = (svg: string) =>
  [...svg.matchAll(/\b(?:d|transform|cx|cy|r)="[^"]*"/g)].map(([value]) => value);

for (const recipe of recipes) {
  describe(`${recipe} compact composition`, () => {
    for (const [themeIndex, preset] of themePresets.entries()) {
      test(`${preset}: original classic SHA, compact geometry, graph identity and determinism`, () => {
        const document = loadExample(recipe);
        document.presentation.theme.preset = preset;
        const before = structuredClone(document);
        const legacy = success(renderSchematicSVG(document, { composition: "classic" }));
        const expectedHash = classicHashes[recipe][themeIndex];
        if (!expectedHash) throw new Error(`Missing classic baseline for ${recipe}/${preset}`);
        expect(createHash("sha256").update(legacy.svg).digest("hex")).toBe(expectedHash);
        expect(success(renderSchematicSVG(document, { composition: "classic" }))).toEqual(legacy);
        const detail = inspect(document);
        if (!detail.ok) throw new Error(JSON.stringify(detail.diagnostics));
        expect(legacy.endpoints).toEqual(detail.endpoints);
        const result = compact(document);
        expect(result.endpoints).not.toEqual(detail.endpoints);
        expect(result.document).toEqual(legacy.document);
        expect(result.bounds.width).toBeLessThan(legacy.bounds.width);
        expect(result.bounds.height).toBeLessThan(legacy.bounds.height);
        graphAndGeometry(document, result);
        measuredCrop(result);
        expect(compact(document)).toEqual(result);
        expect(compact(result.document)).toEqual(result);
        expect(document).toEqual(before);
      });

      for (const enlarged of [false, true]) {
        for (const annotations of [false, true]) {
          test(`${preset}, enlarged=${enlarged}, annotations=${annotations}: measured crop and actual raster margins`, () => {
            const document = loadExample(recipe);
            document.presentation.theme.preset = preset;
            if (enlarged)
              document.presentation.theme.overrides = { strokeWidth: 2.5, fontScale: 1.1 };
            document.presentation.highlight = {
              components: Object.keys(document.circuit.components),
              nets: Object.keys(document.circuit.nets),
            };
            annotate(document);
            const before = structuredClone(document);
            const result = compact(document, annotations);
            graphAndGeometry(document, result);
            measuredCrop(result);
            expect(document).toEqual(before);
            expect(result.annotations?.nets.length ?? 0).toBe(
              annotations ? Object.keys(document.circuit.nets).length : 0,
            );
            if (annotations) {
              for (const endpoint of Object.keys(result.endpoints).filter((id) => id.includes(".")))
                expect(result.svg).toContain(`data-pin-lead="${escapeXML(endpoint)}"`);
            }
            const { x, y, width, height } = result.bounds;
            const margin = 24;
            const expanded = result.svg
              .replace(/<rect\b[^>]*\/>/, "")
              .replace(
                /viewBox="[^"]+" width="[^"]+" height="[^"]+"/,
                `viewBox="${x - margin} ${y - margin} ${width + margin * 2} ${height + margin * 2}" width="${width + margin * 2}" height="${height + margin * 2}"`,
              );
            const image = new Resvg(expanded, { font: { loadSystemFonts: false } }).render();
            const pixels = image.pixels;
            let left = image.width;
            let top = image.height;
            let right = -1;
            let bottom = -1;
            for (let py = 0; py < image.height; py++) {
              for (let px = 0; px < image.width; px++) {
                if (!pixels[(py * image.width + px) * 4 + 3]) continue;
                left = Math.min(left, px);
                top = Math.min(top, py);
                right = Math.max(right, px);
                bottom = Math.max(bottom, py);
              }
            }
            expect(right).toBeGreaterThanOrEqual(left);
            expect(bottom).toBeGreaterThanOrEqual(top);
            for (const gap of [
              left - margin,
              top - margin,
              margin + width - right,
              margin + height - bottom,
            ]) {
              expect(gap).toBeGreaterThanOrEqual(14);
              expect(gap).toBeLessThanOrEqual(18);
            }
          });
        }
      }
    }

    test("every branch needs exactly one dot, including deleted-dot regressions", () => {
      const result = compact(loadExample(recipe));
      expect(branches(result.svg).length).toBe(
        { "rc-lowpass": 1, "inverting-amplifier": 2, "bridge-rectifier": 7 }[recipe],
      );
      expect(missingJunctions(result.svg)).toEqual([]);
      const tags = [...result.svg.matchAll(/<circle\b[^>]*data-junction="[^"]*"[^>]*\/>/g)].map(
        ([tag]) => tag,
      );
      for (const tag of tags) {
        expect(missingJunctions(result.svg.replace(tag, ""))).toHaveLength(1);
        expect(missingJunctions(result.svg.replace(tag, `${tag}${tag}`))).toHaveLength(1);
      }
      const none = result.svg.replace(/<circle\b[^>]*data-junction="[^"]*"[^>]*\/>/g, "");
      expect(routingInvariants(result.document, none, result.endpoints)).toEqual([]);
      expect(missingJunctions(none)).toHaveLength(tags.length);
    });

    test("oracle rejects missing wires, crossings, false dots and symbol-body traversal", () => {
      const result = compact(loadExample(recipe));
      const input =
        result.document.layout.roles[
          recipe === "rc-lowpass"
            ? "series"
            : recipe === "inverting-amplifier"
              ? "inputResistor"
              : "positiveA"
        ];
      if (!input) throw new Error("Missing role");
      const box = result.bounds.symbols[input];
      if (!box) throw new Error("Missing symbol");
      const segment = wires(result.svg)[0];
      if (!segment) throw new Error("Missing wire");
      const added = (tag: string) => result.svg.replace("</svg>", `${tag}</svg>`);
      const foreign = Object.keys(result.circuit.nets).find((net) => net !== segment.net);
      if (!foreign) throw new Error("Missing second net");
      const [mx, my] = [(segment.a[0] + segment.b[0]) / 2, (segment.a[1] + segment.b[1]) / 2];
      const cross =
        segment.a[0] === segment.b[0]
          ? `M${mx - 10} ${my}L${mx + 10} ${my}`
          : `M${mx} ${my - 10}L${mx} ${my + 10}`;
      expect(
        routingInvariants(
          result.document,
          added(`<path data-net="${escapeXML(foreign)}" d="${cross}"/>`),
          result.endpoints,
        ).some((failure) => failure.includes("false short/crossing")),
      ).toBe(true);
      const missing = result.svg.replace(/<path\b[^>]*data-net="[^"]*"[^>]*\/>/g, "");
      expect(
        routingInvariants(result.document, missing, result.endpoints).some((failure) =>
          failure.includes("no SVG wires"),
        ),
      ).toBe(true);
      expect(
        routingInvariants(
          result.document,
          added(`<circle data-junction="${escapeXML(segment.net)}" cx="0" cy="0" r="4"/>`),
          result.endpoints,
        ).some((failure) => failure.includes("false junction")),
      ).toBe(true);
      const through = added(
        `<path data-net="${escapeXML(segment.net)}" d="M${box.x - 20} ${box.y + box.height / 2}L${box.x + box.width + 20} ${box.y + box.height / 2}"/>`,
      );
      expect(
        symbolIntrusions(result, through).some((failure) => failure.endsWith(`enters ${input}`)),
      ).toBe(true);
    });

    test("all themes and individual focuses preserve compact wire and glyph geometry", () => {
      const document = loadExample(recipe);
      document.presentation.highlight = { components: [], nets: [] };
      const base = compact(document);
      for (const preset of themePresets) {
        document.presentation.theme.preset = preset;
        for (const kind of ["components", "nets"] as const) {
          for (const id of Object.keys(document.circuit[kind])) {
            document.presentation.highlight = { components: [], nets: [], [kind]: [id] };
            const result = compact(document);
            expect(geometry(result.svg)).toEqual(geometry(base.svg));
            expect(result.endpoints).toEqual(base.endpoints);
            graphAndGeometry(document, result);
            measuredCrop(result);
          }
        }
      }
    });

    for (const scale of [0.1, 1, 10]) {
      test(`renamed IDs, permuted declarations and value scale ${scale}`, () => {
        const document = renamed(loadExample(recipe));
        for (const component of Object.values(document.circuit.components)) {
          if (component.type === "resistor") component.resistance *= scale;
          if (component.type === "capacitor") component.capacitance /= scale;
        }
        for (const preset of themePresets) {
          document.presentation.theme.preset = preset;
          const before = structuredClone(document);
          const result = compact(document);
          graphAndGeometry(document, result);
          measuredCrop(result);
          expect(document).toEqual(before);
          const reverse = <T>(record: Record<string, T>) =>
            Object.fromEntries(Object.entries(record).reverse());
          const permuted = structuredClone(document);
          permuted.circuit.components = reverse(permuted.circuit.components);
          permuted.circuit.ports = reverse(permuted.circuit.ports);
          permuted.layout.roles = reverse(permuted.layout.roles);
          permuted.circuit.nets = Object.fromEntries(
            Object.entries(permuted.circuit.nets)
              .reverse()
              .map(([net, pins]) => [net, [...pins].reverse()]),
          );
          const permutedBefore = structuredClone(permuted);
          expect(compact(permuted)).toEqual(result);
          expect(permuted).toEqual(permutedBefore);
        }
      });
    }

    test("huge component IDs and annotation labels diagnose collisions without SVG", () => {
      for (const annotation of [false, true]) {
        const document = loadExample(recipe);
        if (annotation) {
          annotate(document);
          const first = document.presentation.annotations?.nets[0];
          if (!first) throw new Error("Missing annotation");
          first.label = "A".repeat(200);
        } else {
          const [id] = Object.keys(document.circuit.components);
          if (!id) throw new Error("Missing component");
          const huge = "R".repeat(200);
          document.circuit.components = Object.fromEntries(
            Object.entries(document.circuit.components).map(([key, value]) => [
              key === id ? huge : key,
              value,
            ]),
          );
          document.layout.roles = Object.fromEntries(
            Object.entries(document.layout.roles).map(([role, key]) => [
              role,
              key === id ? huge : key,
            ]),
          );
          document.circuit.nets = Object.fromEntries(
            Object.entries(document.circuit.nets).map(([net, pins]) => [
              net,
              pins.map((pin) =>
                pin.startsWith(`${id}.`) ? `${huge}${pin.slice(id.length)}` : pin,
              ),
            ]),
          );
        }
        const before = structuredClone(document);
        const result = renderSchematicSVG(document, {
          composition: "compact",
          annotations: annotation,
        });
        expect(result.ok).toBe(false);
        expect(result).not.toHaveProperty("svg");
        expect(result.diagnostics).toContainEqual(
          expect.objectContaining({ code: "layout.label_collision" }),
        );
        expect(document).toEqual(before);
      }
    });
  });
}

test("branch oracle recognizes interior four-way intersections without route vertices", () => {
  const svg = '<path data-net="node" d="M0 10L20 10"/><path data-net="node" d="M10 0L10 20"/>';
  expect(missingJunctions(svg)).toEqual([{ net: "node", point: [10, 10] }]);
  expect(missingJunctions(`${svg}<circle data-junction="node" cx="10" cy="10" r="4"/>`)).toEqual(
    [],
  );
});
