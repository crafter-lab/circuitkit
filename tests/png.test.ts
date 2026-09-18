import { describe, expect, test } from "bun:test";
import { spawnSync } from "node:child_process";
import { dividerLesson } from "../app/lesson/documents.ts";
import { loadExample, renderFigureSVG, renderSchematicSVG, renderSVG } from "../src/index.ts";
import { type PNGOptions, renderPNG } from "../src/png.ts";
import { recipeIds, themePresets } from "../src/schema.ts";

function dimensions(png: Uint8Array) {
  const bytes = Buffer.from(png);
  expect([...bytes.subarray(0, 8)]).toEqual([137, 80, 78, 71, 13, 10, 26, 10]);
  expect(bytes.toString("ascii", 12, 16)).toBe("IHDR");
  return { width: bytes.readUInt32BE(16), height: bytes.readUInt32BE(20) };
}

describe("isolated PNG API", () => {
  for (const scale of [1, 2, 3, 4]) {
    test(`renders real deterministic PNG bytes at scale ${scale}`, async () => {
      const document = loadExample("rc-lowpass");
      const original = structuredClone(document);
      const svg = renderSVG(document);
      const result = await renderPNG(document, { scale });
      expect(svg.ok).toBe(true);
      expect(result.ok).toBe(true);
      if (!result.ok || !svg.ok) throw new Error("Expected successful rendering");
      expect(result.png).toBeInstanceOf(Uint8Array);
      expect(result).not.toHaveProperty("svg");
      expect(result).toMatchObject({ format: "png", scale, diagnostics: [], bounds: svg.bounds });
      expect(dimensions(result.png)).toEqual({
        width: Math.ceil(svg.bounds.width * scale),
        height: Math.ceil(svg.bounds.height * scale),
      });
      expect(dimensions(result.png)).toEqual({ width: result.width, height: result.height });
      const again = await renderPNG(document, { scale });
      expect(again.ok).toBe(true);
      if (again.ok) expect(again.png).toEqual(result.png);
      expect(document).toEqual(original);
    });
  }

  test("defaults to scale 1 and composes the complete figure", async () => {
    const document = dividerLesson("geist-dark", 10000);
    const svg = renderFigureSVG(document);
    const circuit = await renderPNG(document);
    const result = await renderPNG(document, { figure: true });
    expect(svg.ok && circuit.ok && result.ok).toBe(true);
    if (!svg.ok || !circuit.ok || !result.ok) throw new Error("Expected a valid lesson");
    expect(result.scale).toBe(1);
    expect(result.height).toBeGreaterThan(circuit.height);
    expect(result.bounds).toEqual(svg.bounds);
    expect(result.document).toEqual(svg.document);
    expect(result.annotations).toEqual(svg.annotations);
    expect(dimensions(result.png)).toEqual({ width: result.width, height: result.height });
  });

  test("active steps flow through PNG without rewriting authored state", async () => {
    const document = dividerLesson("geist-dark", 10000);
    document.presentation.steps = [
      {
        id: "output",
        title: "Read output",
        description: "Measure this node relative to ground.",
        highlight: { components: [], nets: ["output"] },
      },
    ];
    document.presentation.activeStep = "output";
    const original = structuredClone(document);
    const expected = renderFigureSVG(document);
    const result = await renderPNG(document, { figure: true });
    expect(expected.ok && result.ok).toBe(true);
    if (!expected.ok || !result.ok) throw new Error("Expected a valid selected step");
    expect(result.bounds).toEqual(expected.bounds);
    expect(result.annotations).toEqual(expected.annotations);
    expect(result.document.presentation.activeStep).toBe("output");
    expect(document).toEqual(original);
    document.presentation.activeStep = "missing";
    const invalid = await renderPNG(document, { figure: true });
    expect(invalid.ok).toBe(false);
    expect(invalid).not.toHaveProperty("png");
  });

  test("a real large recipe exceeds the cap at scale 4 and succeeds at scale 2", async () => {
    const document = loadExample("wheatstone-bridge");
    expect(await renderPNG(document, { scale: 4 })).toMatchObject({
      ok: false,
      diagnostics: [{ code: "png.pixel_limit" }],
    });
    const result = await renderPNG(document, { scale: 2 });
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.width * result.height).toBeLessThanOrEqual(16_000_000);
  });

  for (const scale of [0, -1, 5, 1.5, NaN, Infinity, "2", null]) {
    test(`rejects invalid scale ${String(scale)}`, async () => {
      const result = await renderPNG(loadExample("rc-lowpass"), { scale } as PNGOptions);
      expect(result).toMatchObject({ ok: false, diagnostics: [{ code: "png.invalid_scale" }] });
      expect(result).not.toHaveProperty("png");
    });
  }

  for (const options of [
    null,
    [],
    { figure: "yes" },
    { schematic: "yes" },
    { figure: true, schematic: true },
    { annotations: true },
    { svg: "<svg/>" },
  ]) {
    test(`rejects invalid options ${JSON.stringify(options)}`, async () => {
      expect(await renderPNG(loadExample("rc-lowpass"), options as PNGOptions)).toMatchObject({
        ok: false,
        diagnostics: [{ code: "png.invalid_options" }],
      });
    });
  }

  test("rejects raw markup and invalid graph or theme without bytes", async () => {
    const invalid = loadExample("rc-lowpass");
    invalid.circuit.nets.input = ["VIN", "R1.c"];
    const contrast = loadExample("rc-lowpass");
    contrast.presentation.theme.overrides = { background: "#fff", label: "#fff" };
    for (const input of ["<svg/>", "<html/>", {}, invalid, contrast]) {
      const result = await renderPNG(input);
      expect(result.ok).toBe(false);
      expect(result.diagnostics.length).toBeGreaterThan(0);
      expect(result).not.toHaveProperty("png");
    }
  });

  for (const recipe of recipeIds) {
    for (const preset of themePresets) {
      test(`${recipe}/${preset}: schematic PNG uses cropped SVG dimensions and graph`, async () => {
        const document = loadExample(recipe);
        document.presentation.theme.preset = preset;
        const original = structuredClone(document);
        const svg = renderSchematicSVG(document);
        const result = await renderPNG(document, { schematic: true, scale: 2 });
        expect(svg.ok && result.ok).toBe(true);
        if (!svg.ok || !result.ok) throw new Error("Expected valid schematic");
        expect(result.bounds).toEqual(svg.bounds);
        expect(result.document).toEqual(svg.document);
        expect(result.circuit).toEqual(svg.circuit);
        expect(result).not.toHaveProperty("annotations");
        expect(dimensions(result.png)).toEqual({
          width: Math.ceil(svg.bounds.width * 2),
          height: Math.ceil(svg.bounds.height * 2),
        });
        expect(document).toEqual(original);
      });
    }
  }

  test("schematic PNG omits lesson annotations without ignoring their validation", async () => {
    const document = dividerLesson("geist-dark", 10000);
    const original = structuredClone(document);
    const result = await renderPNG(document, { schematic: true });
    const plain = structuredClone(document);
    delete plain.presentation.annotations;
    expect(result).not.toHaveProperty("annotations");
    const withoutAnnotations = await renderPNG(plain, { schematic: true });
    expect(result.ok && withoutAnnotations.ok).toBe(true);
    if (result.ok && withoutAnnotations.ok) expect(result.png).toEqual(withoutAnnotations.png);
    expect(await renderPNG(document, { schematic: false })).toEqual(await renderPNG(document));
    expect(document).toEqual(original);
    const annotation = document.presentation.annotations?.nets[0];
    if (!annotation) throw new Error("Missing annotation");
    annotation.net = "absent";
    const invalid = await renderPNG(document, { schematic: true });
    const expected = renderSchematicSVG(document);
    expect(invalid.ok || expected.ok).toBe(false);
    if (invalid.ok || expected.ok) throw new Error("Expected invalid annotation reference");
    expect(invalid).toEqual(expected);
    expect(invalid).not.toHaveProperty("png");
  });

  test("browser core bundles without native or Markdown dependencies", async () => {
    const imports: string[] = [];
    const result = await Bun.build({
      entrypoints: [new URL("../src/index.ts", import.meta.url).pathname],
      target: "browser",
      plugins: [
        {
          name: "record-imports",
          setup(build) {
            build.onResolve({ filter: /.*/ }, (args) => {
              imports.push(args.path);
              return undefined;
            });
          },
        },
      ],
    });
    expect(result.success).toBe(true);
    expect(imports.some((path) => /resvg|markdown|\.node$/.test(path))).toBe(false);
  });

  test("pixel limit fails before native import or allocation", () => {
    const result = spawnSync(
      process.execPath,
      [
        "--eval",
        `
      import { plugin } from "bun";
      let nativeLoads = 0;
      plugin({ name: "bounded-png", setup(build) {
        build.onLoad({ filter: /resvg/ }, () => { nativeLoads++; throw new Error("Native must not load"); });
        build.onLoad({ filter: /renderer\\.ts$/ }, () => ({ loader: "js", contents:
          'export function renderSVG(input) { return { ok: true, diagnostics: [], bounds: input, svg: "<svg/>", document: {}, circuit: {}, rendererVersion: "test" }; } export { renderSVG as renderSchematicSVG };'
        }));
      }});
      const { renderPNG } = await import(${JSON.stringify(new URL("../src/png.ts", import.meta.url).href)});
      const results = [];
      for (const bounds of [
        {width: 4001, height: 4000}, {width: 1001, height: 1000},
        {width: Infinity, height: 1}, {width: 0, height: 1}, {width: NaN, height: 1}
      ]) results.push(await renderPNG(bounds, {scale: 4}));
      console.log(JSON.stringify({results, nativeLoads}));
    `,
      ],
      { encoding: "utf8" },
    );
    expect(result.status).toBe(0);
    expect(result.stderr).toBe("");
    const body = JSON.parse(result.stdout);
    expect(body.nativeLoads).toBe(0);
    expect(body.results).toHaveLength(5);
    for (const entry of body.results)
      expect(entry).toMatchObject({ ok: false, diagnostics: [{ code: "png.pixel_limit" }] });
  });

  test("the exact pixel cap reaches native only with disabled font discovery and catches failure", () => {
    const result = spawnSync(
      process.execPath,
      [
        "--eval",
        `
      import { plugin } from "bun";
      plugin({ name: "png-boundary", setup(build) {
        build.onLoad({ filter: /resvg/ }, () => ({ loader: "js", contents:
          'export class Resvg { constructor(svg, options) { console.log(JSON.stringify({svg, options})); throw new Error("private native details"); } }'
        }));
        build.onLoad({ filter: /renderer\\.ts$/ }, () => ({ loader: "js", contents:
          ${JSON.stringify(`export function renderSVG() { return { ok: true, diagnostics: [], bounds: {width:1000,height:1000}, svg: '<svg viewBox="0 0 1000 1000" width="1000" height="1000"/>', document: {}, circuit: {}, rendererVersion: "test" }; } export { renderSVG as renderSchematicSVG };`)}
        }));
      }});
      const { renderPNG } = await import(${JSON.stringify(new URL("../src/png.ts", import.meta.url).href)});
      console.log(JSON.stringify(await renderPNG({}, {scale:4})));
    `,
      ],
      { encoding: "utf8" },
    );
    expect(result.status).toBe(0);
    expect(result.stderr).toBe("");
    const [native, failure] = result.stdout
      .trim()
      .split("\n")
      .map((line) => JSON.parse(line));
    expect(native.svg).toContain('width="4000" height="4000"');
    expect(native.options.font).toEqual({ loadSystemFonts: false, fontFiles: [], fontDirs: [] });
    expect(failure).toMatchObject({ ok: false, diagnostics: [{ code: "png.render_failed" }] });
    expect(JSON.stringify(failure)).not.toContain("private native details");
  });
});
