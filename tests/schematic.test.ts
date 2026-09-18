import { describe, expect, test } from "bun:test";
import { Resvg } from "@resvg/resvg-js";
import {
  type Box,
  type FigureDocument,
  inspect,
  loadExample,
  type RenderResult,
  renderFigureSVG,
  renderSchematicSVG,
  renderSVG,
} from "../src/index.ts";
import { type RecipeId, recipeIds, semanticTones, themePresets } from "../src/schema.ts";
import { resolveTheme } from "../src/theme.ts";
import { escapeXML } from "../src/typography.ts";

function success(result: RenderResult) {
  expect(result.ok, JSON.stringify(result.diagnostics)).toBe(true);
  if (!result.ok) throw new Error(JSON.stringify(result.diagnostics));
  return result;
}

function annotated(recipe: RecipeId) {
  const document = loadExample(recipe);
  document.presentation.annotations = {
    nets: Object.keys(document.circuit.nets).map((net, index) => ({
      net,
      label: String.fromCharCode(65 + index),
      description: `Conductor ${net}`,
      tone: semanticTones[index % semanticTones.length] ?? "blue",
    })),
    legend: true,
    caption: "Editorial caption stays outside the circuit.",
  };
  return document;
}

function contains(outer: Box, inner: Box) {
  expect(inner.x).toBeGreaterThanOrEqual(outer.x - 1e-9);
  expect(inner.y).toBeGreaterThanOrEqual(outer.y - 1e-9);
  expect(inner.x + inner.width).toBeLessThanOrEqual(outer.x + outer.width + 1e-9);
  expect(inner.y + inner.height).toBeLessThanOrEqual(outer.y + outer.height + 1e-9);
}

function cropped(result: ReturnType<typeof success>) {
  const { bounds, svg } = result;
  const viewBox = svg
    .match(/viewBox="([^"]+)"/)?.[1]
    ?.split(" ")
    .map(Number);
  expect(viewBox).toEqual([bounds.x, bounds.y, bounds.width, bounds.height]);
  expect(viewBox?.every(Number.isFinite)).toBe(true);
  expect(bounds.x).toBeGreaterThan(0);
  expect(bounds.y).toBeGreaterThan(0);
  expect(bounds.width).toBeGreaterThan(0);
  expect(bounds.height).toBeGreaterThan(0);
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
  expect(svg).not.toMatch(
    /data-label="(?:title|subtitle|formula|assumption)"|data-caption=|data-legend-net=/,
  );
  for (const key of ["title", "subtitle", "formula", "assumption"])
    expect(bounds.labels).not.toHaveProperty(key);
  expect(svg).not.toMatch(/<(?:text|style|script|image|foreignObject|filter)\b|NaN|Infinity|url\(/);
  expect(svg).toContain(`<title>${escapeXML(result.document.presentation.title)}</title>`);
  expect(svg).not.toContain('stroke-width="1"/');
}

const circuitPaint = (svg: string) =>
  svg.match(
    /<g fill="none" stroke-linecap="round" stroke-linejoin="round">(.*?)<\/g>(?=<g data-label=)/,
  )?.[1];

for (const recipe of recipeIds) {
  describe(`${recipe} schematic`, () => {
    for (const preset of themePresets) {
      test(`${preset}: pure output, unchanged graph/geometry and measured crop`, () => {
        const document = annotated(recipe);
        document.presentation.theme.preset = preset;
        const original = structuredClone(document);
        const plain = structuredClone(document);
        delete plain.presentation.annotations;
        const legacy = success(renderSVG(plain));
        const result = success(renderSchematicSVG(document));
        const detail = inspect(document);
        expect(detail.ok).toBe(true);
        if (!detail.ok) throw new Error(JSON.stringify(detail.diagnostics));
        expect(result.document).toEqual(detail.document);
        expect(result.circuit).toEqual(detail.circuit);
        expect(result).not.toHaveProperty("annotations");
        expect(result.svg).not.toMatch(/data-net-label=|data-net-halo=|data-pin-lead=/);
        expect(circuitPaint(result.svg)).toBeDefined();
        expect(circuitPaint(result.svg)).toBe(circuitPaint(legacy.svg));
        expect(result.bounds.width).toBeLessThan(legacy.bounds.width);
        expect(result.bounds.height).toBeLessThan(legacy.bounds.height);
        expect(success(renderSchematicSVG(document, { annotations: false }))).toEqual(result);
        expect(success(renderSchematicSVG(plain)).svg).toBe(result.svg);
        for (const [endpoint, { x, y, net }] of Object.entries(detail.endpoints)) {
          expect(result.circuit.nets[net]).toContain(endpoint);
          contains(result.bounds, { x, y, width: 0, height: 0 });
        }
        cropped(result);
        expect(document).toEqual(original);
      });

      test(`${preset}: inline labels, halos and every pin lead retain original userspace`, () => {
        const document = annotated(recipe);
        document.presentation.theme.preset = preset;
        document.presentation.theme.overrides = {
          strokeWidth: 2.5,
          fontScale: recipe === "led-series" ? 1.05 : 1.1,
        };
        document.presentation.highlight = {
          components: Object.keys(document.circuit.components),
          nets: Object.keys(document.circuit.nets),
        };
        const original = structuredClone(document);
        const legacy = success(renderSVG(document));
        const result = success(renderSchematicSVG(document, { annotations: true }));
        const pure = success(renderSchematicSVG(document));
        expect(result.annotations).toEqual(legacy.annotations);
        expect(circuitPaint(result.svg)).toBe(circuitPaint(legacy.svg));
        expect(result.circuit).toEqual(pure.circuit);
        const detail = inspect(document);
        if (!detail.ok) throw new Error(JSON.stringify(detail.diagnostics));
        for (const annotation of result.annotations?.nets ?? []) {
          expect(
            result.bounds.labels[`annotation:${result.annotations?.nets.indexOf(annotation)}`],
          ).toEqual(annotation.labelBounds);
          contains(result.bounds, annotation.labelBounds);
          expect(result.svg).toContain(`data-net-label="${escapeXML(annotation.net)}"`);
          expect(result.svg).toContain(
            `data-net-halo="${escapeXML(annotation.net)}" stroke="${annotation.color}" stroke-width="10"`,
          );
          for (const path of annotation.paths) expect(result.svg).toContain(`d="${path}"`);
          for (const { a, b } of annotation.segments) {
            const halo = {
              x: Math.min(a[0], b[0]) - (a[0] === b[0] ? 5 : 0),
              y: Math.min(a[1], b[1]) - (a[1] === b[1] ? 5 : 0),
              width: Math.abs(a[0] - b[0]) + (a[0] === b[0] ? 10 : 0),
              height: Math.abs(a[1] - b[1]) + (a[1] === b[1] ? 10 : 0),
            };
            contains(result.bounds, halo);
            expect(result.bounds.routes[annotation.net]).toContainEqual(halo);
          }
        }
        for (const [endpoint, outer] of Object.entries(detail.endpoints)) {
          if (!endpoint.includes(".")) continue;
          const owner = result.annotations?.nets.find(({ net }) => net === outer.net);
          expect(owner?.segments.some(({ a }) => a[0] === outer.x && a[1] === outer.y)).toBe(true);
          expect(result.svg).toContain(
            `data-net="${escapeXML(outer.net)}" data-pin-lead="${escapeXML(endpoint)}"`,
          );
        }
        cropped(result);
        expect(document).toEqual(original);
      });
    }

    test("actual raster paint fits the crop including font scale, halos and stroke", () => {
      const document = annotated(recipe);
      document.presentation.theme.overrides = {
        strokeWidth: 2.5,
        fontScale: recipe === "led-series" ? 1.05 : 1.1,
      };
      for (const annotations of [false, true]) {
        const result = success(renderSchematicSVG(document, { annotations }));
        const { x, y, width, height } = result.bounds;
        const margin = 24;
        const expanded = result.svg.replace(
          /viewBox="[^"]+" width="[^"]+" height="[^"]+"/,
          `viewBox="${x - margin} ${y - margin} ${width + margin * 2} ${height + margin * 2}" width="${width + margin * 2}" height="${height + margin * 2}"`,
        );
        const image = new Resvg(expanded, {
          background: "#fff",
          font: { loadSystemFonts: false },
        }).render();
        const pixels = image.pixels;
        let left = image.width;
        let top = image.height;
        let right = 0;
        let bottom = 0;
        for (let py = 0; py < image.height; py++) {
          for (let px = 0; px < image.width; px++) {
            const offset = (py * image.width + px) * 4;
            if (pixels[offset] === 255 && pixels[offset + 1] === 255 && pixels[offset + 2] === 255)
              continue;
            left = Math.min(left, px);
            top = Math.min(top, py);
            right = Math.max(right, px);
            bottom = Math.max(bottom, py);
          }
        }
        expect(left).toBeGreaterThanOrEqual(margin + 14);
        expect(top).toBeGreaterThanOrEqual(margin + 14);
        expect(right).toBeLessThanOrEqual(margin + width - 14);
        expect(bottom).toBeLessThanOrEqual(margin + height - 14);
        expect(left).toBeLessThanOrEqual(margin + 18);
        expect(top).toBeLessThanOrEqual(margin + 18);
        expect(right).toBeGreaterThanOrEqual(margin + width - 18);
        expect(bottom).toBeGreaterThanOrEqual(margin + height - 18);
      }
    });
  });
}

describe("schematic contract and validation", () => {
  for (const options of [
    null,
    [],
    true,
    "yes",
    { annotations: "true" },
    { annotations: null },
    { figure: true },
    { extra: undefined },
    { [Symbol("unknown")]: true },
  ]) {
    test(`invalid options ${String(options)} fail without SVG`, () => {
      const result = renderSchematicSVG(
        loadExample("rc-lowpass"),
        options as { annotations?: boolean },
      );
      expect(result).toMatchObject({
        ok: false,
        diagnostics: [{ code: "schematic.invalid_options", path: "/options" }],
      });
      expect(result).not.toHaveProperty("svg");
    });
  }

  const mutations: Array<[string, (document: FigureDocument) => void]> = [
    [
      "unknown pin",
      (d) => {
        d.circuit.nets.input = ["VIN", "R1.c"];
      },
    ],
    [
      "invalid theme",
      (d) => {
        d.presentation.theme.overrides = { background: "#fff", wire: "#fff" };
      },
    ],
    [
      "collapsed glyphs",
      (d) => {
        d.presentation.theme.overrides = { fontScale: Number.MIN_VALUE };
      },
    ],
    [
      "oversized glyphs",
      (d) => {
        d.presentation.theme.overrides = { fontScale: 10 };
      },
    ],
    [
      "closed symbol gaps",
      (d) => {
        d.presentation.theme.overrides = { strokeWidth: 20 };
      },
    ],
    [
      "unknown focus",
      (d) => {
        d.presentation.highlight = { components: ["absent"], nets: [] };
      },
    ],
    [
      "unknown active step",
      (d) => {
        d.presentation.activeStep = "absent";
      },
    ],
    [
      "title control",
      (d) => {
        d.presentation.title = "bad\u0000title";
      },
    ],
    [
      "empty title",
      (d) => {
        d.presentation.title = " ";
      },
    ],
    [
      "hidden annotation reference",
      (d) => {
        if (d.presentation.annotations?.nets[0]) d.presentation.annotations.nets[0].net = "absent";
      },
    ],
    [
      "hidden caption control",
      (d) => {
        if (d.presentation.annotations) d.presentation.annotations.caption = "bad\u0000caption";
      },
    ],
    [
      "hidden unsupported glyph",
      (d) => {
        if (d.presentation.annotations) d.presentation.annotations.caption = "🧪";
      },
    ],
    [
      "hidden annotation layout",
      (d) => {
        if (d.presentation.annotations?.nets[0])
          d.presentation.annotations.nets[0].label = "A".repeat(200);
      },
    ],
    [
      "hidden legend layout",
      (d) => {
        if (d.presentation.annotations?.nets[0])
          d.presentation.annotations.nets[0].description = "A".repeat(200);
      },
    ],
  ];
  for (const [name, mutate] of mutations) {
    test(`${name} retains existing diagnostics, even without annotation paint`, () => {
      const document = annotated("rc-lowpass");
      mutate(document);
      const original = structuredClone(document);
      const expected = renderSVG(document);
      expect(expected.ok).toBe(false);
      for (const annotations of [false, true])
        expect(renderSchematicSVG(document, { annotations })).toEqual(expected);
      expect(document).toEqual(original);
    });
  }
  test("LED ground label collision remains a failure instead of being cropped away", () => {
    const document = annotated("led-series");
    document.presentation.theme.overrides = { strokeWidth: 2.5, fontScale: 1.1 };
    const expected = renderSVG(document);
    expect(expected.ok).toBe(false);
    expect(expected.diagnostics).toContainEqual(
      expect.objectContaining({ code: "layout.label_collision", path: "/layout/labels/GND:port" }),
    );
    expect(renderSchematicSVG(document)).toEqual(expected);
    expect(renderSchematicSVG(document, { annotations: true })).toEqual(expected);
  });
  test("invalid document input is never repaired", () => {
    for (const input of [null, undefined, [], {}, "<svg/>", { version: 2 }]) {
      expect(renderSchematicSVG(input)).toEqual(renderSVG(input));
      expect(renderSchematicSVG(input).ok).toBe(false);
    }
  });
  test("active steps retain focus but not lesson editorial paint", () => {
    const document = annotated("voltage-divider");
    document.presentation.steps = [
      {
        id: "output",
        title: "Measure output",
        description: "Relative to ground.",
        highlight: { components: ["R2"], nets: ["output"] },
      },
    ];
    document.presentation.activeStep = "output";
    const original = structuredClone(document);
    const result = success(renderSchematicSVG(document));
    const { theme } = resolveTheme(document);
    expect(result.svg).toContain(
      `data-component="R2" stroke="${theme.highlight}" stroke-width="3"`,
    );
    expect(result.svg).not.toContain("Measure output");
    expect(result.document).toEqual(success(renderFigureSVG(document)).document);
    expect(result.document.presentation.activeStep).toBe("output");
    expect(document).toEqual(original);
  });
  test("partial annotations do not add halo bounds to unrelated nets", () => {
    const document = annotated("rc-lowpass");
    if (document.presentation.annotations)
      document.presentation.annotations.nets = document.presentation.annotations.nets.filter(
        ({ net }) => net === "input",
      );
    const pure = success(renderSchematicSVG(document));
    const inline = success(renderSchematicSVG(document, { annotations: true }));
    expect(inline.bounds.routes.output).toEqual(pure.bounds.routes.output);
    expect(inline.bounds.routes.ground).toEqual(pure.bounds.routes.ground);
    expect(inline.bounds.routes.input?.length).toBeGreaterThan(
      pure.bounds.routes.input?.length ?? 0,
    );
  });
});
