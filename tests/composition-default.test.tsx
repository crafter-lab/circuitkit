import { describe, expect, test } from "bun:test";
import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { renderToStaticMarkup } from "react-dom/server";
import { loadExample, renderFigureSVG, renderSchematicSVG, renderSVG } from "../src/index.ts";
import { exportLessonFigure, resolveLessonFigure } from "../src/lesson-figure.tsx";
import { resolveLessonSequence } from "../src/lesson-sequence.tsx";
import { parseCircuitMarkdown } from "../src/markdown.ts";
import { renderPNG } from "../src/png.ts";
import { CircuitLessonFigure, CircuitLessonSequence, CircuitSchematic } from "../src/react.tsx";
import { resolveSchematicComposition } from "../src/renderer.ts";
import { type RecipeId, recipeIds, themePresets } from "../src/schema.ts";

const root = new URL("../", import.meta.url).pathname;
const supported = new Set<RecipeId>(["rc-lowpass", "inverting-amplifier", "bridge-rectifier"]);

function success<T extends { ok: boolean; diagnostics: unknown }>(
  result: T,
): Extract<T, { ok: true }> {
  expect(result.ok, JSON.stringify(result.diagnostics)).toBe(true);
  if (!result.ok) throw new Error(JSON.stringify(result.diagnostics));
  return result as Extract<T, { ok: true }>;
}

function cli(args: string[], input?: string) {
  const result = spawnSync(process.execPath, ["src/cli.ts", ...args, "--json"], {
    cwd: root,
    encoding: "utf8",
    input,
    maxBuffer: 8 * 1024 * 1024,
  });
  expect(result.error).toBeUndefined();
  return { ...result, receipt: JSON.parse(result.stdout) };
}

function fence(document: unknown) {
  return `\`\`\`circuitkit\n${JSON.stringify(document)}\n\`\`\``;
}

function diagram(markup: string) {
  return markup.match(/<svg\b[\s\S]*?<\/svg>/)?.[0]?.replace(/ style="[^"]*"/, "");
}

function lesson(recipe: RecipeId) {
  const document = loadExample(recipe);
  const net = Object.keys(document.circuit.nets)[0];
  if (!net) throw new Error("Missing net");
  document.presentation.annotations = {
    nets: [{ net, label: "A", description: "Selected conductor", tone: "blue" }],
    legend: true,
    caption: "Circuit lesson.",
  };
  document.presentation.steps = [
    {
      id: "s",
      title: "Read",
      description: "Read the node.",
      highlight: { components: [], nets: [net] },
    },
  ];
  document.presentation.activeStep = "s";
  return { document, net };
}

function compactOnlyLesson() {
  const { document } = lesson("inverting-amplifier");
  document.presentation.title = "Circuit";
  document.presentation.theme.overrides = { fontScale: 1.15 };
  document.presentation.annotations = {
    nets: [{ net: "output", label: "W".repeat(24), description: "Node", tone: "blue" }],
    legend: true,
    caption: "Lesson",
  };
  document.presentation.steps = [
    {
      id: "s",
      title: "Step",
      description: "Select node",
      highlight: { components: [], nets: ["output"] },
    },
  ];
  return document;
}

for (const recipe of recipeIds) {
  const composition = supported.has(recipe) ? "compact" : "classic";
  describe(`${recipe}: automatic ${composition}`, () => {
    test("default schematic matches the resolved option across themes without mutating input", () => {
      for (const preset of themePresets) {
        const { document } = lesson(recipe);
        document.presentation.theme.preset = preset;
        const original = structuredClone(document);
        const validated = success(renderSchematicSVG(document)).document;
        expect(resolveSchematicComposition(validated)).toBe(composition);
        expect(resolveSchematicComposition(validated, "classic")).toBe("classic");
        expect(resolveSchematicComposition(validated, "compact")).toBe("compact");
        for (const annotations of [false, true]) {
          const expected = success(renderSchematicSVG(document, { composition, annotations }));
          expect(renderSchematicSVG(document, { annotations })).toEqual(expected);
          expect(renderSchematicSVG(document, { annotations, composition: undefined })).toEqual(
            expected,
          );
        }
        if (!supported.has(recipe)) {
          expect(renderSchematicSVG(document, { composition: "compact" })).toMatchObject({
            ok: false,
            diagnostics: [{ code: "schematic.unsupported_composition" }],
          });
        }
        expect(document).toEqual(original);
      }
    });

    test("SSR applies resolved narrow-screen protection and retains explicit classic", () => {
      const document = loadExample(recipe);
      const result = success(renderSchematicSVG(document, { composition }));
      const markup = renderToStaticMarkup(<CircuitSchematic document={document} />);
      expect(diagram(markup)).toBe(result.svg);
      if (supported.has(recipe)) {
        expect(markup).toContain("overflow-x:auto");
        expect(markup).toContain(`min-width:${result.bounds.width * 0.75}px`);
      } else {
        expect(markup).not.toContain("overflow-x:auto");
        expect(markup).not.toContain(`min-width:${result.bounds.width * 0.75}px`);
      }
      const classic = renderToStaticMarkup(
        <CircuitSchematic document={document} composition="classic" />,
      );
      expect(diagram(classic)).toBe(
        success(renderSchematicSVG(document, { composition: "classic" })).svg,
      );
      expect(classic).not.toContain("overflow-x:auto");
    });

    test("lessons resolve selection, expanded chrome and default export consistently", () => {
      const { document, net } = lesson(recipe);
      const original = structuredClone(document);
      for (const layout of [undefined, "compact", "expanded"] as const) {
        for (const activeNet of [undefined, net, null]) {
          const result = success(resolveLessonFigure(document, activeNet, { layout }));
          const schematic = composition === "compact" || layout === "compact";
          const expected = schematic
            ? success(renderSchematicSVG(result.document, { annotations: true, composition }))
            : success(renderSVG(result.document));
          if (activeNet === undefined) expect(result.svg).toBe(expected.svg);
          const explicit = success(
            resolveLessonFigure(document, activeNet, { layout, composition }),
          );
          expect(result).toEqual(explicit);
          expect(exportLessonFigure(result, { layout })).toEqual(
            schematic
              ? renderSchematicSVG(result.document, { annotations: true, composition })
              : renderFigureSVG(result.document),
          );
          if (activeNet !== undefined) expect(result.document.presentation.activeStep).toBe("s");
          const markup = renderToStaticMarkup(
            <CircuitLessonFigure
              document={document}
              activeNet={activeNet}
              layout={layout}
              download
            />,
          );
          const visible = success(
            resolveLessonFigure(document, activeNet, { layout: layout ?? "compact", composition }),
          );
          expect(diagram(markup)).toBe(visible.svg);
          expect(markup).not.toContain('role="alert"');
          if (composition === "compact")
            expect(markup).toContain(`min-width:${visible.bounds.width * 0.75}px`);
          if (layout === "expanded") expect(markup).toContain('data-layout="expanded"');
        }
      }
      expect(
        success(resolveLessonFigure(document, undefined, { composition: "classic" })).svg,
      ).toBe(success(renderSVG(document)).svg);
      expect(document).toEqual(original);
    });

    test("sequence defaults, authored steps and clearing use the resolved geometry", () => {
      const { document } = lesson(recipe);
      const original = structuredClone(document);
      for (const activeStep of [undefined, "s", null]) {
        const result = success(resolveLessonSequence(document, activeStep));
        expect(result).toEqual(
          success(resolveLessonSequence(document, activeStep, { composition })),
        );
        expect(result.document.presentation.activeStep).toBe(activeStep === null ? undefined : "s");
        expect(result).toEqual(
          success(
            composition === "compact"
              ? renderSchematicSVG(result.document, { annotations: true, composition })
              : renderSVG(result.document),
          ),
        );
        const markup = renderToStaticMarkup(
          <CircuitLessonSequence document={document} activeStep={activeStep} download />,
        );
        expect(diagram(markup)).toBe(
          success(renderSchematicSVG(result.document, { annotations: true, composition })).svg,
        );
        expect(markup).not.toContain('role="alert"');
        const classic = success(
          resolveLessonSequence(document, activeStep, { composition: "classic" }),
        );
        expect(classic).toEqual(success(renderSVG(classic.document)));
      }
      expect(document).toEqual(original);
    });

    test("PNG and CLI JSON/selected Markdown SVG+PNG default to resolved bytes", async () => {
      const document = loadExample(recipe);
      const expected = success(renderSchematicSVG(document, { composition }));
      const png = success(await renderPNG(document, { schematic: true, composition, scale: 2 }));
      const automatic = success(await renderPNG(document, { schematic: true, scale: 2 }));
      expect(automatic).toEqual(png);
      const directory = mkdtempSync(join(tmpdir(), "circuitkit-default-"));
      try {
        for (const markdown of [false, true]) {
          const input = markdown
            ? [fence(loadExample("voltage-divider")), fence(document)].join("\n\n")
            : JSON.stringify(document);
          const args = ["render", "-", "--schematic", ...(markdown ? ["--block", "2"] : [])];
          const svg = cli(args, input);
          expect(svg.status, svg.stderr || svg.stdout).toBe(0);
          expect(svg.receipt.svg).toBe(expected.svg);
          const output = join(directory, `${markdown ? "markdown" : "json"}.png`);
          const raster = cli([...args, "--format", "png", "--scale", "2", "--out", output], input);
          expect(raster.status, raster.stderr || raster.stdout).toBe(0);
          expect(readFileSync(output)).toEqual(Buffer.from(png.png));
          expect(raster.receipt).toMatchObject({ width: png.width, height: png.height, scale: 2 });
        }
      } finally {
        rmSync(directory, { recursive: true, force: true });
      }
    });
  });
}

test("compact-only default lesson/sequence never passes through classic prevalidation", () => {
  const document = compactOnlyLesson();
  const original = structuredClone(document);
  expect(renderSVG(document)).toMatchObject({
    ok: false,
    diagnostics: [{ code: "layout.label_collision" }],
  });
  for (const layout of [undefined, "compact", "expanded"] as const) {
    for (const net of [undefined, "output", null]) {
      const result = success(resolveLessonFigure(document, net, { layout }));
      expect(result).toEqual(
        success(resolveLessonFigure(document, net, { layout, composition: "compact" })),
      );
      expect(exportLessonFigure(result)).toEqual(
        renderSchematicSVG(result.document, { annotations: true, composition: "compact" }),
      );
      const markup = renderToStaticMarkup(
        <CircuitLessonFigure document={document} activeNet={net} layout={layout} download />,
      );
      expect(diagram(markup)).toBe(result.svg);
      expect(markup).not.toContain('role="alert"');
    }
  }
  for (const activeStep of [undefined, "s", null]) {
    const result = success(resolveLessonSequence(document, activeStep));
    expect(result).toEqual(
      success(resolveLessonSequence(document, activeStep, { composition: "compact" })),
    );
    expect(
      diagram(
        renderToStaticMarkup(<CircuitLessonSequence document={document} activeStep={activeStep} />),
      ),
    ).toBe(result.svg);
    expect(resolveLessonSequence(document, activeStep, { composition: "classic" }).ok).toBe(false);
  }
  expect(resolveLessonSequence(document, "missing")).toMatchObject({
    ok: false,
    diagnostics: [{ code: "lesson.unknown_active_step" }],
  });
  expect(resolveLessonFigure(document, "missing")).toMatchObject({
    ok: false,
    diagnostics: [{ code: "lesson.unknown_active_net" }],
  });
  const recovery = renderToStaticMarkup(
    <CircuitLessonSequence
      document={document}
      activeStep="missing"
      onActiveStepChange={() => {}}
    />,
  );
  expect(recovery).toContain("Show all");
  expect(recovery).not.toContain("disabled");
  expect(document).toEqual(original);
});

test("default selected Markdown validates only selected geometry and all other blocks", async () => {
  const document = compactOnlyLesson();
  const source = [
    fence(loadExample("voltage-divider")),
    fence(document),
    fence(loadExample("led-series")),
  ].join("\n\n");
  const expected = success(renderSchematicSVG(document, { composition: "compact" }));
  expect(parseCircuitMarkdown(source).ok).toBe(false);
  const selected = success(parseCircuitMarkdown(source, undefined, { index: 1 }));
  expect(selected.figures.map(({ index }) => index)).toEqual([0, 1, 2]);
  expect(selected.figures[1]?.document).toEqual(expected.document);
  const directory = mkdtempSync(join(tmpdir(), "circuitkit-selected-default-"));
  try {
    const png = success(await renderPNG(document, { schematic: true, composition: "compact" }));
    for (const markdown of [false, true]) {
      const input = markdown ? source : JSON.stringify(document);
      const args = ["render", "-", "--schematic", ...(markdown ? ["--block", "2"] : [])];
      const result = cli(args, input);
      expect(result.status, result.stderr || result.stdout).toBe(0);
      expect(result.receipt.svg).toBe(expected.svg);
      const output = join(directory, `${markdown}.png`);
      const raster = cli([...args, "--format", "png", "--out", output], input);
      expect(raster.status, raster.stderr || raster.stdout).toBe(0);
      expect(readFileSync(output)).toEqual(Buffer.from(png.png));
      expect(cli([...args, "--composition", "classic"], input).status).toBe(1);
    }
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
  const badGraph = loadExample("voltage-divider");
  badGraph.circuit.nets.input = ["VIN", "R1.missing"];
  const badCaption = loadExample("voltage-divider");
  badCaption.presentation.annotations = { nets: [], legend: false, caption: "W".repeat(400) };
  for (const invalid of [
    fence(badGraph),
    fence(badCaption),
    fence(document),
    "```circuitkit\n{bad}\n```",
  ]) {
    for (const index of [0, 1]) {
      const blocks = [invalid];
      blocks.splice(index, 0, fence(document));
      const input = blocks.join("\n\n");
      const parsed = parseCircuitMarkdown(input, undefined, { index });
      expect(parsed.ok).toBe(false);
      expect(parsed).not.toHaveProperty("figures");
      expect(parsed.diagnostics.some(({ path }) => path.includes(`/figures/${1 - index}`))).toBe(
        true,
      );
      const result = cli(["render", "-", "--schematic", "--block", String(index + 1)], input);
      expect(result.status).toBe(1);
      expect(result.receipt).not.toHaveProperty("svg");
      expect(result.receipt).not.toHaveProperty("output");
    }
  }
});

test("CLI help presents automatic compact behavior, not the compatibility choice", () => {
  const result = cli(["help"]);
  expect(result.status).toBe(0);
  expect(result.stdout).toContain("automatic by recipe");
  expect(result.stdout).not.toContain("classic");
});
