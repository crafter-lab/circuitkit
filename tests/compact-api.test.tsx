import { describe, expect, test } from "bun:test";
import { spawnSync } from "node:child_process";
import { mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { renderToStaticMarkup } from "react-dom/server";
import {
  loadExample,
  type RenderResult,
  renderFigureSVG,
  renderSchematicSVG,
  renderSVG,
  type SchematicComposition,
  type SchematicOptions,
} from "../src/index.ts";
import {
  exportLessonFigure,
  type ResolveLessonFigureOptions,
  resolveLessonFigure,
} from "../src/lesson-figure.tsx";
import {
  type ResolveLessonSequenceOptions,
  resolveLessonSequence,
} from "../src/lesson-sequence.tsx";
import {
  type MarkdownSchematicSelection,
  parseCircuitMarkdown,
  renderCircuitMarkdown,
} from "../src/markdown.ts";
import { type PNGOptions, renderPNG } from "../src/png.ts";
import { CircuitLessonFigure, CircuitLessonSequence, CircuitSchematic } from "../src/react.tsx";

const root = new URL("../", import.meta.url).pathname;
const recipes = ["rc-lowpass", "inverting-amplifier", "bridge-rectifier"] as const;

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

function lesson() {
  const document = loadExample("rc-lowpass");
  document.presentation.annotations = {
    nets: [{ net: "output", label: "A", description: "Output node", tone: "blue" }],
    legend: true,
    caption: "An RC lesson.",
  };
  document.presentation.steps = [
    {
      id: "output",
      title: "Output",
      description: "Read the output node.",
      highlight: { components: [], nets: ["output"] },
    },
  ];
  return document;
}

function compactOnlyLesson() {
  const document = loadExample("inverting-amplifier");
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
  document.presentation.activeStep = "s";
  return document;
}

function fence(document: unknown) {
  return `\`\`\`circuitkit\n${JSON.stringify(document)}\n\`\`\``;
}

function diagram(markup: string) {
  return markup
    .match(/<svg\b[\s\S]*?<\/svg>/)?.[0]
    ?.replace(' style="display:block;width:100%;height:auto"', "")
    .replace(/ style="display:block;max-width:100%;height:auto(?:;min-width:[0-9.]+px)?"/, "");
}

function dimensions(png: Uint8Array) {
  const bytes = Buffer.from(png);
  expect([...bytes.subarray(0, 8)]).toEqual([137, 80, 78, 71, 13, 10, 26, 10]);
  return { width: bytes.readUInt32BE(16), height: bytes.readUInt32BE(20) };
}

describe("composition API integration", () => {
  for (const recipe of recipes) {
    test(`${recipe}: public options preserve classic bytes and opt into compact`, () => {
      const document = loadExample(recipe);
      const original = structuredClone(document);
      const composition: SchematicComposition = "compact";
      const options: SchematicOptions = { composition };
      const classic = success(renderSchematicSVG(document, { composition: "classic" }));
      expect(success(renderSchematicSVG(document, { composition: "classic" })).svg).toBe(
        classic.svg,
      );
      const compact = success(renderSchematicSVG(document, options));
      expect(compact.svg).not.toBe(classic.svg);
      expect(compact.document).toEqual(classic.document);
      expect(compact.circuit).toEqual(classic.circuit);
      expect(document).toEqual(original);
      const narrow = renderToStaticMarkup(
        <CircuitSchematic document={document} composition="compact" />,
      );
      expect(narrow).toContain("overflow-x:auto");
      expect(narrow).toContain(`min-width:${compact.bounds.width * 0.75}px`);
      expect(
        diagram(
          renderToStaticMarkup(<CircuitSchematic document={document} composition="compact" />),
        ),
      ).toBe(compact.svg);
      expect(
        diagram(
          renderToStaticMarkup(<CircuitSchematic document={document} composition="classic" />),
        ),
      ).toBe(classic.svg);
      expect(diagram(renderToStaticMarkup(<CircuitSchematic document={document} />))).toBe(
        compact.svg,
      );
      expect(success(renderSchematicSVG(document))).toEqual(compact);
    });

    test(`${recipe}: schematic PNG forwards compact composition and scale`, async () => {
      const document = loadExample(recipe);
      const expected = success(renderSchematicSVG(document, { composition: "compact" }));
      const result = success(
        await renderPNG(document, { schematic: true, composition: "compact", scale: 2 }),
      );
      expect(result.bounds).toEqual(expected.bounds);
      expect(result.document).toEqual(expected.document);
      expect(dimensions(result.png)).toEqual({
        width: Math.ceil(expected.bounds.width * 2),
        height: Math.ceil(expected.bounds.height * 2),
      });
      const classic = success(
        await renderPNG(document, { schematic: true, composition: "classic" }),
      );
      const automatic = success(await renderPNG(document, { schematic: true, scale: 2 }));
      expect(automatic.png).toEqual(result.png);
      expect(automatic.bounds).toEqual(result.bounds);
      expect(classic.bounds).toEqual(
        success(renderSchematicSVG(document, { composition: "classic" })).bounds,
      );
    });
  }

  test("PNG rejects invalid composition or composition outside schematic mode", async () => {
    for (const options of [
      { composition: "compact" },
      { composition: "classic", schematic: false },
      { composition: "compact", figure: true },
      { composition: "compact", schematic: true, figure: true },
      ...[null, true, 0, "", "COMPACT", "expanded", {}, []].map((composition) => ({
        schematic: true,
        composition,
      })),
      { schematic: true, composition: "compact", unexpected: true },
    ]) {
      const result = await renderPNG(loadExample("rc-lowpass"), options as PNGOptions);
      expect(result).toMatchObject({ ok: false, diagnostics: [{ code: "png.invalid_options" }] });
      expect(result).not.toHaveProperty("png");
    }
  });

  test("invalid composition props remove schematics and diagnose lesson figures", () => {
    const document = lesson();
    for (const value of [null, true, 0, "", "expanded", {}, []]) {
      const composition = value as SchematicComposition;
      expect(renderSchematicSVG(document, { composition })).toMatchObject({
        ok: false,
        diagnostics: [{ code: "schematic.invalid_options" }],
      });
      expect(
        renderToStaticMarkup(<CircuitSchematic document={document} composition={composition} />),
      ).toBe("");
      for (const layout of ["compact", "expanded"] as const) {
        const markup = renderToStaticMarkup(
          <CircuitLessonFigure document={document} layout={layout} composition={composition} />,
        );
        expect(markup).toContain("lesson.invalid_options");
        expect(markup).not.toContain("<svg");
      }
      const sequence = renderToStaticMarkup(
        <CircuitLessonSequence document={document} composition={composition} />,
      );
      expect(sequence).toContain("lesson.invalid_options");
      expect(sequence).not.toContain("<svg");
    }
  });

  test("unsupported compact topology propagates through PNG and React lessons", async () => {
    const document = loadExample("voltage-divider");
    const expected = { ok: false, diagnostics: [{ code: "schematic.unsupported_composition" }] };
    expect(renderSchematicSVG(document, { composition: "compact" })).toMatchObject(expected);
    expect(await renderPNG(document, { schematic: true, composition: "compact" })).toMatchObject(
      expected,
    );
    expect(
      renderToStaticMarkup(<CircuitSchematic document={document} composition="compact" />),
    ).toBe("");
    for (const layout of ["compact", "expanded"] as const) {
      expect(
        resolveLessonFigure(document, undefined, { layout, composition: "compact" }),
      ).toMatchObject(expected);
      expect(
        exportLessonFigure(renderSVG(document), { layout, composition: "compact" }),
      ).toMatchObject(expected);
      const markup = renderToStaticMarkup(
        <CircuitLessonFigure document={document} layout={layout} composition="compact" download />,
      );
      expect(markup).toContain("schematic.unsupported_composition");
      expect(markup).not.toContain("<svg");
    }
    const sequence = renderToStaticMarkup(
      <CircuitLessonSequence document={document} composition="compact" download />,
    );
    expect(sequence).toContain("schematic.unsupported_composition");
    expect(sequence).not.toContain("<svg");
  });

  for (const layout of ["compact", "expanded"] as const) {
    test(`${layout} lesson chrome preserves compact preview, selection, and download`, () => {
      const document = lesson();
      const original = structuredClone(document);
      const options = { layout, composition: "compact" } as const;
      const persisted = success(resolveLessonFigure(document, "output", options));
      const expected = success(
        renderSchematicSVG(persisted.document, { annotations: true, composition: "compact" }),
      );
      expect(persisted.svg).toBe(expected.svg);
      const preview = success(resolveLessonFigure(persisted.document, null, options));
      expect(preview.svg).not.toBe(persisted.svg);
      expect(success(exportLessonFigure(persisted, options)).svg).toBe(expected.svg);
      const markup = renderToStaticMarkup(
        <CircuitLessonFigure
          document={document}
          activeNet="output"
          layout={layout}
          composition="compact"
          download
        />,
      );
      expect(markup).toContain(`data-layout="${layout}"`);
      expect(diagram(markup)).toBe(expected.svg);
      expect(document).toEqual(original);
    });
  }

  test("explicit classic preserves expanded lesson behavior", () => {
    const document = lesson();
    const persisted = success(resolveLessonFigure(document, undefined, { composition: "classic" }));
    expect(persisted.svg).toBe(success(renderSVG(document)).svg);
    expect(
      success(
        resolveLessonFigure(document, undefined, { layout: "expanded", composition: "classic" }),
      ).svg,
    ).toBe(persisted.svg);
    const expected = success(renderFigureSVG(persisted.document)).svg;
    expect(success(exportLessonFigure(persisted, { composition: "classic" })).svg).toBe(expected);
    expect(
      success(exportLessonFigure(persisted, { layout: "expanded", composition: "classic" })).svg,
    ).toBe(expected);
  });

  test("sequence forwards composition with the selected authored step", () => {
    const document = lesson();
    const original = structuredClone(document);
    const selected = success(resolveLessonSequence(document, "output"));
    const expected = success(
      renderSchematicSVG(selected.document, { annotations: true, composition: "compact" }),
    );
    const markup = renderToStaticMarkup(
      <CircuitLessonSequence
        document={document}
        activeStep="output"
        composition="compact"
        download
      />,
    );
    expect(diagram(markup)).toBe(expected.svg);
    const persisted = success(
      resolveLessonFigure(selected.document, undefined, {
        layout: "compact",
        composition: "compact",
      }),
    );
    expect(
      success(exportLessonFigure(persisted, { layout: "compact", composition: "compact" })).svg,
    ).toBe(expected.svg);
    expect(document).toEqual(original);
  });

  test("compact-only sequence uses selected geometry for initial, selected and cleared steps", () => {
    const document = compactOnlyLesson();
    const original = structuredClone(document);
    expect(renderSVG(document)).toMatchObject({
      ok: false,
      diagnostics: [{ code: "layout.label_collision" }],
    });
    for (const activeStep of [undefined, "s", null]) {
      const result = success(
        resolveLessonSequence(document, activeStep, { composition: "compact" }),
      );
      expect(result.document.presentation.activeStep).toBe(activeStep === null ? undefined : "s");
      const expected = success(
        renderSchematicSVG(result.document, { composition: "compact", annotations: true }),
      );
      expect(result.svg).toBe(expected.svg);
      const markup = renderToStaticMarkup(
        <CircuitLessonSequence
          document={document}
          activeStep={activeStep}
          composition="compact"
          download
        />,
      );
      expect(diagram(markup)).toBe(expected.svg);
      expect(markup).not.toContain('role="alert"');
    }
    expect(resolveLessonSequence(document, "missing", { composition: "compact" })).toMatchObject({
      ok: false,
      diagnostics: [{ code: "lesson.unknown_active_step" }],
    });
    const recovery = renderToStaticMarkup(
      <CircuitLessonSequence
        document={document}
        activeStep="missing"
        composition="compact"
        onActiveStepChange={() => {}}
      />,
    );
    expect(recovery).toContain("Show all");
    expect(recovery).not.toContain("disabled");
    expect(document).toEqual(original);
  });

  test("sequence explicit classic preserves the legacy resolver result", () => {
    const document = lesson();
    for (const activeStep of [undefined, "output", null]) {
      const rendered = success(
        resolveLessonSequence(document, activeStep, { composition: "classic" }),
      );
      expect(rendered).toEqual(success(renderSVG(rendered.document)));
      const automatic = success(resolveLessonSequence(document, activeStep));
      expect(resolveLessonSequence(document, activeStep, {})).toEqual(automatic);
      expect(automatic).toEqual(
        success(
          renderSchematicSVG(automatic.document, { composition: "compact", annotations: true }),
        ),
      );
    }
  });

  test("sequence rejects malformed options and unsupported compact topology", () => {
    for (const options of [
      null,
      [],
      true,
      "compact",
      { layout: "compact" },
      { composition: null },
      { composition: "expanded" },
      { composition: "compact", extra: true },
      { [Symbol("unknown")]: true },
    ]) {
      expect(
        resolveLessonSequence(lesson(), undefined, options as ResolveLessonSequenceOptions),
      ).toMatchObject({
        ok: false,
        diagnostics: [{ code: "lesson.invalid_options", path: "/options" }],
      });
    }
    expect(
      resolveLessonSequence(loadExample("voltage-divider"), undefined, { composition: "compact" }),
    ).toMatchObject({
      ok: false,
      diagnostics: [{ code: "schematic.unsupported_composition" }],
    });
  });

  test("lesson resolve and export reject malformed options instead of ignoring them", () => {
    const document = lesson();
    const persisted: RenderResult = renderSVG(document);
    for (const options of [
      null,
      [],
      { unknown: true },
      { layout: "wide" },
      { composition: "expanded" },
      { composition: null },
      { layout: "expanded", composition: false },
    ]) {
      for (const result of [
        resolveLessonFigure(document, undefined, options as ResolveLessonFigureOptions),
        exportLessonFigure(persisted, options as ResolveLessonFigureOptions),
      ]) {
        expect(result).toMatchObject({
          ok: false,
          diagnostics: [{ code: "lesson.invalid_options" }],
        });
        expect(result).not.toHaveProperty("svg");
      }
    }
  });
});

describe("selected Markdown schematic validation", () => {
  test("compact-only selected block renders while unsupported unselected recipes stay classic", () => {
    const document = compactOnlyLesson();
    const source = [loadExample("voltage-divider"), document, loadExample("led-series")]
      .map(fence)
      .join("\n\n");
    expect(parseCircuitMarkdown(source).ok).toBe(false);
    expect(renderCircuitMarkdown(source).ok).toBe(false);
    const parsed = success(
      parseCircuitMarkdown(source, undefined, { index: 1, composition: "compact" }),
    );
    expect(parsed.figures.map(({ index }) => index)).toEqual([0, 1, 2]);
    const expected = success(renderSchematicSVG(document, { composition: "compact" }));
    expect(parsed.figures[1]?.document).toEqual(expected.document);
    const raw = cli(
      ["render", "-", "--schematic", "--composition", "compact"],
      JSON.stringify(document),
    );
    const markdown = cli(
      ["render", "-", "--block", "2", "--schematic", "--composition", "compact"],
      source,
    );
    expect(raw.status, raw.stderr || raw.stdout).toBe(0);
    expect(markdown.status, markdown.stderr || markdown.stdout).toBe(0);
    expect(markdown.receipt.svg).toBe(raw.receipt.svg);
    expect(markdown.receipt.svg).toBe(expected.svg);
  });

  test("compact selection never skips invalid unselected blocks before or after it", () => {
    const badGraph = loadExample("voltage-divider");
    badGraph.circuit.nets.input = ["VIN", "R1.missing"];
    const badCaption = loadExample("voltage-divider");
    badCaption.presentation.annotations = { nets: [], legend: false, caption: "W".repeat(400) };
    for (const invalid of [
      fence(badGraph),
      fence(badCaption),
      "```circuitkit\n{bad}\n```",
      fence(compactOnlyLesson()),
    ]) {
      for (const index of [0, 1]) {
        const blocks = [invalid];
        blocks.splice(index, 0, fence(compactOnlyLesson()));
        const source = blocks.join("\n\n");
        const parsed = parseCircuitMarkdown(source, undefined, { index, composition: "compact" });
        expect(parsed.ok).toBe(false);
        expect(parsed).not.toHaveProperty("figures");
        expect(parsed.diagnostics.some(({ path }) => path.includes(`/figures/${1 - index}`))).toBe(
          true,
        );
        const result = cli(
          ["render", "-", "--block", String(index + 1), "--schematic", "--composition", "compact"],
          source,
        );
        expect(result.status).toBe(1);
        expect(result.receipt).not.toHaveProperty("svg");
        expect(result.receipt).not.toHaveProperty("output");
      }
    }
  });

  test("omitted selection leaves Markdown rendering and CLI bytes unchanged", () => {
    const document = lesson();
    const source = fence(document);
    expect(parseCircuitMarkdown(source, undefined, undefined)).toEqual(
      parseCircuitMarkdown(source),
    );
    const rendered = success(renderCircuitMarkdown(source));
    expect(rendered.figures[0]?.svg).toBe(success(renderFigureSVG(document)).svg);
    for (const extra of [[], ["--composition", "classic"]]) {
      const raw = cli(["render", "-", "--schematic", ...extra], JSON.stringify(document));
      const result = cli(["render", "-", "--block", "1", "--schematic", ...extra], source);
      expect(raw.status).toBe(0);
      expect(result.status).toBe(0);
      expect(result.receipt.svg).toBe(raw.receipt.svg);
    }
  });

  test("schematic selection is strict, bounded and legacy-only", () => {
    const source = fence(lesson());
    for (const selection of [
      null,
      [],
      true,
      "compact",
      {},
      { composition: "compact" },
      { index: -1, composition: "compact" },
      { index: 0.5, composition: "compact" },
      { index: Infinity, composition: "compact" },
      { index: Number.MAX_SAFE_INTEGER + 1, composition: "compact" },
      { index: "0", composition: "compact" },
      { index: 0, composition: null },
      { index: 0, composition: "expanded" },
      { index: 0, composition: "compact", annotations: true },
    ]) {
      expect(
        parseCircuitMarkdown(source, undefined, selection as MarkdownSchematicSelection),
      ).toMatchObject({
        ok: false,
        diagnostics: [{ code: "markdown.invalid_selection" }],
      });
    }
    expect(
      parseCircuitMarkdown(source, undefined, { index: 1, composition: "compact" }),
    ).toMatchObject({
      ok: false,
      diagnostics: [{ code: "markdown.selection_out_of_range" }],
    });
    expect(
      cli(["render", "-", "--block", "2", "--schematic", "--composition", "compact"], source)
        .status,
    ).toBe(2);
    expect(
      parseCircuitMarkdown(source, { unexpected: true } as never, {
        index: 0,
        composition: "compact",
      }).ok,
    ).toBe(false);
    for (const payload of [
      JSON.stringify({ schema: "circuitkit.diagram.v1" }),
      'circuit demo v1\ntitle "Demo"\nA: module (OUT)\nB: module (IN)\nA.OUT -> B.IN\n',
    ]) {
      const markdown = `\`\`\`circuitkit\n${payload}\n\`\`\``;
      expect(
        parseCircuitMarkdown(markdown, undefined, { index: 0, composition: "compact" }),
      ).toMatchObject({
        ok: false,
        diagnostics: [{ code: "markdown.unsupported_selection" }],
      });
      const result = cli(
        ["render", "-", "--block", "1", "--schematic", "--composition", "compact"],
        markdown,
      );
      expect(result.status).toBe(2);
      expect(result.receipt.diagnostics[0].message).toContain("legacy-only");
    }
    const unsupported = fence(loadExample("voltage-divider"));
    const result = cli(
      ["render", "-", "--block", "1", "--schematic", "--composition", "compact"],
      unsupported,
    );
    expect(result.status).toBe(1);
    expect(result.receipt.diagnostics[0].code).toBe("schematic.unsupported_composition");
    expect(result.receipt.diagnostics[0].path).toContain("/figures/0/options/composition");
  });
});

describe("source CLI composition integration", () => {
  for (const recipe of recipes) {
    test(`${recipe}: CLI SVG equals the compact API`, () => {
      const result = cli([
        "render",
        `examples/${recipe}.json`,
        "--schematic",
        "--composition",
        "compact",
      ]);
      expect(result.status, result.stderr || result.stdout).toBe(0);
      expect(result.receipt.svg).toBe(
        success(renderSchematicSVG(loadExample(recipe), { composition: "compact" })).svg,
      );
    });
  }

  test("CLI defaults to compact and retains explicit classic compatibility", () => {
    const args = ["render", "examples/rc-lowpass.json", "--schematic"];
    const normal = cli(args);
    const classic = cli([...args, "--composition", "classic"]);
    const document = loadExample("rc-lowpass");
    expect(normal.status).toBe(0);
    expect(classic.status, classic.stderr).toBe(0);
    expect(normal.receipt.svg).toBe(
      success(renderSchematicSVG(document, { composition: "compact" })).svg,
    );
    expect(classic.receipt.svg).toBe(
      success(renderSchematicSVG(document, { composition: "classic" })).svg,
    );
    expect(classic.receipt.svg).not.toBe(normal.receipt.svg);
  });

  test("CLI supports stdin and Markdown block selection", () => {
    const document = loadExample("rc-lowpass");
    const json = JSON.stringify(document);
    const expected = success(renderSchematicSVG(document, { composition: "compact" })).svg;
    const stdin = cli(["render", "-", "--schematic", "--composition", "compact"], json);
    expect(stdin.status, stdin.stderr || stdin.stdout).toBe(0);
    expect(stdin.receipt.svg).toBe(expected);
    const markdown = cli(
      ["render", "-", "--block", "1", "--schematic", "--composition", "compact"],
      `\`\`\`circuitkit\n${json}\n\`\`\`\n`,
    );
    expect(markdown.status, markdown.stderr || markdown.stdout).toBe(0);
    expect(markdown.receipt.svg).toBe(expected);
  });

  test("CLI rejects invalid values, duplicates, and non-schematic commands", () => {
    for (const args of [
      ["render", "examples/rc-lowpass.json", "--composition", "compact"],
      ["render", "examples/rc-lowpass.json", "--figure", "--composition", "classic"],
      ["render", "examples/rc-lowpass.json", "--schematic", "--figure", "--composition", "compact"],
      ["render", "examples/rc-lowpass.json", "--schematic", "--composition", "small"],
      ["render", "examples/rc-lowpass.json", "--schematic", "--composition", ""],
      [
        "render",
        "examples/rc-lowpass.json",
        "--schematic",
        "--composition",
        "compact",
        "--composition",
        "classic",
      ],
      ["render", "examples/rc-lowpass.json", "--schematic", "--composition"],
      ["validate", "examples/rc-lowpass.json", "--composition", "compact"],
      ["inspect", "examples/rc-lowpass.json", "--composition", "classic"],
      ["markdown", "-", "--composition", "compact"],
      ["catalog", "--composition", "compact"],
      ["schema", "--composition", "compact"],
      ["help", "--composition", "compact"],
      ["--help", "--composition", "compact"],
      ["skills", "list", "--composition", "compact"],
    ]) {
      const result = cli(args);
      expect(result.status, JSON.stringify(args)).toBe(2);
      expect(result.receipt).toMatchObject({
        ok: false,
        diagnostics: [{ code: "document.invalid_field" }],
      });
      expect(result.receipt).not.toHaveProperty("svg");
    }
  });

  test("CLI rejects composition for diagram JSON and circuit source", () => {
    for (const input of [
      JSON.stringify({ schema: "circuitkit.diagram.v1" }),
      'circuit demo v1\ntitle "Demo"\nA: module (OUT)\nB: module (IN)\nA.OUT -> B.IN\n',
    ]) {
      const result = cli(["render", "-", "--schematic", "--composition", "compact"], input);
      expect(result.status).toBe(2);
      expect(result.receipt.diagnostics[0].message).toContain("legacy-only");
    }
  });

  test("CLI writes compact PNG and protects destinations on rejected composition", async () => {
    const directory = mkdtempSync(join(tmpdir(), "circuitkit-compact-api-"));
    try {
      const output = join(directory, "compact.png");
      const result = cli([
        "render",
        "examples/rc-lowpass.json",
        "--schematic",
        "--composition",
        "compact",
        "--format",
        "png",
        "--scale",
        "2",
        "--out",
        output,
      ]);
      expect(result.status, result.stderr || result.stdout).toBe(0);
      const expected = success(
        await renderPNG(loadExample("rc-lowpass"), {
          schematic: true,
          composition: "compact",
          scale: 2,
        }),
      );
      expect(readFileSync(output)).toEqual(Buffer.from(expected.png));
      expect(result.receipt).toMatchObject({
        width: expected.width,
        height: expected.height,
        scale: 2,
      });
      expect(result.receipt).not.toHaveProperty("png");
      for (const format of ["svg", "png"]) {
        const destination = join(directory, `existing.${format}`);
        writeFileSync(destination, "preserve me");
        const rejected = cli([
          "render",
          "examples/voltage-divider.json",
          "--schematic",
          "--composition",
          "compact",
          "--format",
          format,
          "--out",
          destination,
          "--overwrite",
        ]);
        expect(rejected.status).toBe(1);
        expect(rejected.receipt).toMatchObject({
          ok: false,
          diagnostics: [{ code: "schematic.unsupported_composition" }],
        });
        expect(readFileSync(destination, "utf8")).toBe("preserve me");
      }
      expect(readdirSync(directory).sort()).toEqual([
        "compact.png",
        "existing.png",
        "existing.svg",
      ]);
    } finally {
      rmSync(directory, { recursive: true, force: true });
    }
  });
});
