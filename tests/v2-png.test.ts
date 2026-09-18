import { describe, expect, test } from "bun:test";
import { spawnSync } from "node:child_process";
import { privacyFixture } from "../src/v2/fixtures.ts";
import { type PublicFigure, projectFigure, renderEducationalSVG } from "../src/v2/index.ts";
import { type EducationalPNGOptions, renderEducationalPNG } from "../src/v2/png.ts";

function publicDocument(): PublicFigure {
  const projected = projectFigure(privacyFixture(), "question");
  if (!projected.ok) throw new Error("Invalid fixture");
  return projected.document;
}

function dimensions(png: Uint8Array) {
  const bytes = Buffer.from(png);
  expect([...bytes.subarray(0, 8)]).toEqual([137, 80, 78, 71, 13, 10, 26, 10]);
  expect(bytes.toString("ascii", 12, 16)).toBe("IHDR");
  return { width: bytes.readUInt32BE(16), height: bytes.readUInt32BE(20) };
}

const invalid = {
  ok: false as const,
  diagnostics: [
    { code: "educational.invalid", message: "Invalid or unsupported educational figure." },
  ],
};

describe("standalone public educational PNG", () => {
  for (const theme of ["geist-light", "geist-dark", "geist-print"] as const) {
    for (const scale of [1, 2, 3, 4]) {
      test(`${theme}, scale ${scale}: real deterministic PNG and public core info`, async () => {
        const document = { ...publicDocument(), theme };
        const before = structuredClone(document);
        const svg = renderEducationalSVG(document);
        const result = await renderEducationalPNG(document, { scale });
        if (!svg.ok || !result.ok) throw new Error("Expected valid rendering");
        expect(result).toMatchObject({
          ok: true,
          diagnostics: [],
          format: "png",
          scale,
          bounds: svg.bounds,
          targets: svg.targets,
          document: svg.document,
        });
        expect(result).not.toHaveProperty("svg");
        expect(result).not.toHaveProperty("stages");
        expect(result.document).not.toHaveProperty("stage");
        expect(dimensions(result.png)).toEqual({
          width: Math.ceil(svg.bounds.width * scale),
          height: Math.ceil(svg.bounds.height * scale),
        });
        expect(dimensions(result.png)).toEqual({ width: result.width, height: result.height });
        expect(await renderEducationalPNG(document, { scale })).toEqual(result);
        expect(document).toEqual(before);
        expect(result.document).not.toBe(document);
      });
    }
  }

  test("defaults to scale 1 and preserves projection noninterference", async () => {
    const author = privacyFixture();
    const before = projectFigure(author, "question");
    author.stages.correction.title = "PRIVATE_CORRECTION_SENTINEL";
    author.stages.teaching.description = "PRIVATE_TEACHING_SENTINEL";
    const after = projectFigure(author, "question");
    if (!before.ok || !after.ok) throw new Error("Invalid fixture");
    const first = await renderEducationalPNG(before.document);
    const second = await renderEducationalPNG(after.document);
    expect(first).toEqual(second);
    expect(first).toMatchObject({ ok: true, scale: 1 });
    expect(JSON.stringify(first)).not.toContain("PRIVATE_");
  });

  test("rejects author, v1, raw SVG, extra source metadata and invalid public data without echo", async () => {
    for (const input of [
      privacyFixture(),
      { version: 1, circuit: "PRIVATE_SENTINEL" },
      "<svg>PRIVATE_SENTINEL</svg>",
      { ...publicDocument(), source: "PRIVATE_SENTINEL" },
      {
        ...publicDocument(),
        title: "PRIVATE_SENTINEL",
        targets: [{ id: "absent", label: "PRIVATE_SENTINEL", role: "net" }],
      },
      {},
      null,
    ]) {
      expect(await renderEducationalPNG(input)).toEqual(invalid);
    }
  });

  for (const scale of [0, -1, 5, 1.5, "2", null]) {
    test(`rejects invalid scale ${String(scale)}`, async () => {
      const result = await renderEducationalPNG(publicDocument(), {
        scale,
      } as EducationalPNGOptions);
      expect(result).toEqual({
        ok: false,
        diagnostics: [
          { code: "png.invalid_scale", message: "PNG scale must be an integer from 1 through 4." },
        ],
      });
    });
  }

  test("rejects hostile options without evaluating accessors or returning content", async () => {
    let reads = 0;
    const accessor = Object.defineProperty({}, "scale", {
      enumerable: true,
      get() {
        reads++;
        return 1;
      },
    });
    for (const options of [
      null,
      [],
      { scale: NaN },
      { scale: Infinity },
      { scale: undefined },
      { namespace: "PRIVATE_SENTINEL" },
      { stage: "correction" },
      { svg: "PRIVATE_SENTINEL" },
      { [Symbol("PRIVATE_SENTINEL")]: 1 },
      accessor,
    ]) {
      const result = await renderEducationalPNG(publicDocument(), options as EducationalPNGOptions);
      expect(result).toEqual({
        ok: false,
        diagnostics: [
          { code: "png.invalid_options", message: "Expected only an optional PNG scale." },
        ],
      });
    }
    expect(reads).toBe(0);
  });

  test("real public geometry crosses the pixel cap with no partial result", async () => {
    const document: PublicFigure = {
      ...publicDocument(),
      targets: [],
      display: [
        {
          id: "large",
          shapes: [
            {
              kind: "rect",
              at: { x: 0, y: 0 },
              width: 1000,
              height: 1000,
              radius: 0,
              tone: "ink",
              fill: "none",
              stroke: 1,
            },
          ],
        },
      ],
    };
    expect(await renderEducationalPNG(document, { scale: 4 })).toEqual({
      ok: false,
      diagnostics: [
        {
          code: "png.pixel_limit",
          message: "PNG output must have positive finite dimensions and at most 16,000,000 pixels.",
        },
      ],
    });
    const smaller = await renderEducationalPNG(document, { scale: 1 });
    expect(smaller.ok).toBe(true);
    if (smaller.ok) expect(smaller.width * smaller.height).toBeLessThanOrEqual(16_000_000);
  });

  test("cap and invalid input fail before native import; unavailable native returns a fixed error", () => {
    const result = spawnSync(
      process.execPath,
      [
        "--eval",
        `
      import { plugin } from "bun";
      let nativeLoads = 0;
      plugin({ name: "native-boundary", setup(build) {
        build.onLoad({ filter: /resvg/ }, () => { nativeLoads++; throw new Error("PRIVATE_NATIVE_ERROR"); });
      }});
      const { renderEducationalPNG } = await import(${JSON.stringify(new URL("../src/v2/png.ts", import.meta.url).href)});
      const document = ${JSON.stringify(publicDocument())};
      const large = {...document, targets: [], display: [{id: "large", shapes: [{kind: "rect", at: {x: 0, y: 0}, width: 10000, height: 10000, radius: 0, tone: "ink", fill: "none", stroke: 1}]}]};
      const capped = await renderEducationalPNG(large);
      const invalid = await renderEducationalPNG({private: "PRIVATE_INPUT"});
      const before = nativeLoads;
      const unavailable = await renderEducationalPNG(document);
      console.log(JSON.stringify({capped, invalid, before, unavailable, nativeLoads}));
    `,
      ],
      { encoding: "utf8" },
    );
    expect(result.status).toBe(0);
    const body = JSON.parse(result.stdout);
    expect(body.before).toBe(0);
    expect(body.nativeLoads).toBeGreaterThan(0);
    expect(body.capped.diagnostics[0].code).toBe("png.pixel_limit");
    expect(body.invalid).toEqual(invalid);
    expect(body.unavailable).toEqual({
      ok: false,
      diagnostics: [
        {
          code: "png.render_failed",
          message:
            "PNG rendering failed. Ensure the platform-specific @resvg/resvg-js native binding is available in Node or Bun.",
        },
      ],
    });
    expect(result.stdout).not.toContain("PRIVATE_");
  });

  test("PNG builds for Node with native binding external; browser core stays isolated", async () => {
    const png = await Bun.build({
      entrypoints: [new URL("../src/v2/png.ts", import.meta.url).pathname],
      target: "node",
      format: "esm",
      external: ["@resvg/resvg-js"],
    });
    expect(png.success).toBe(true);
    expect(png.outputs.some((output) => output.path.endsWith(".node"))).toBe(false);
    const source = await png.outputs[0]?.text();
    expect(source).toContain('import("@resvg/resvg-js")');
    const imports: string[] = [];
    const core = await Bun.build({
      entrypoints: [new URL("../src/v2/index.ts", import.meta.url).pathname],
      target: "browser",
      plugins: [
        {
          name: "record-imports",
          setup(build) {
            build.onResolve({ filter: /.*/ }, ({ path }) => {
              imports.push(path);
              return undefined;
            });
          },
        },
      ],
    });
    expect(core.success).toBe(true);
    expect(imports.some((path) => /resvg|png\.ts|education-cli|\.node$/.test(path))).toBe(false);
  });
});
