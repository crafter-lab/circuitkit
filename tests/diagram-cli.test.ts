import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { spawnSync } from "node:child_process";
import {
  existsSync,
  lstatSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { loadExample } from "../src/catalog.ts";
import {
  compileDiagram,
  type DiagramDocument,
  diagramJSONSchema,
  renderDiagramSVG,
} from "../src/diagram/index.ts";
import { getSchema, renderFigureSVG, renderSchematicSVG, renderSVG } from "../src/index.ts";
import { renderCircuitMarkdown } from "../src/markdown.ts";
import { renderEducationalPNG } from "../src/v2/png.ts";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const cli = process.env.CIRCUITKIT_TEST_CLI ?? join(root, "src/cli.ts");
const runtime = process.env.CIRCUITKIT_TEST_RUNTIME ?? process.execPath;
let temporary: string;
let input: string;
let markdownInput: string;

function diagram(): DiagramDocument {
  return {
    schema: "circuitkit.diagram.v1",
    id: "studio",
    title: "Studio signal flow",
    modules: [
      { id: "source", label: "Source", ports: ["out", { id: "power", label: "+5V" }] },
      { id: "amp", ports: ["in", "out", "power"] },
      { id: "speaker", ports: ["in"] },
    ],
    connections: [
      { from: "source.out", to: "amp.in", label: "Input" },
      { from: "source.power", to: "amp.power", kind: "power", bus: "Supply" },
      { from: "amp.out", to: "speaker.in", kind: "audio" },
    ],
  };
}

function fence(input: unknown) {
  return `\`\`\`circuitkit\n${JSON.stringify(input)}\n\`\`\``;
}

function run(args: string[], stdin = "", entry = cli, executable = runtime) {
  const result = spawnSync(executable, [entry, ...args], {
    cwd: root,
    input: stdin,
    encoding: "utf8",
    maxBuffer: 16 * 1024 * 1024,
  });
  expect(result.error).toBeUndefined();
  expect(result.signal).toBeNull();
  expect(result.stdout).not.toContain(String.fromCharCode(27));
  const body = JSON.parse(result.stdout);
  expect(Array.isArray(body)).toBe(false);
  expect(Array.isArray(body.diagnostics)).toBe(true);
  expect(Array.isArray(body.nextSteps)).toBe(true);
  return { ...result, body };
}

beforeAll(() => {
  mkdirSync(join(root, "outputs"), { recursive: true });
  temporary = mkdtempSync(join(root, "outputs", "diagram-cli-"));
  input = join(temporary, "input diagram.json");
  markdownInput = join(temporary, "mixed.md");
  writeFileSync(input, JSON.stringify(diagram()));
  writeFileSync(markdownInput, `${fence(loadExample("rc-lowpass"))}\n\n${fence(diagram())}`);
});

afterAll(() => {
  if (temporary) rmSync(temporary, { recursive: true, force: true });
});

describe("agent-facing diagram CLI", () => {
  test("schema --diagram returns the runtime structural object without altering legacy discovery", () => {
    for (const args of [
      ["schema", "--diagram", "--json"],
      ["--json", "schema", "--diagram"],
    ]) {
      const result = run(args);
      expect(result.status).toBe(0);
      expect(result.stderr).toBe("");
      expect(result.body).toMatchObject({ ok: true, version: 1, schema: diagramJSONSchema });
      expect(result.body.schema).toEqual(diagramJSONSchema);
      expect(result.body.schema.properties.schema.const).toBe("circuitkit.diagram.v1");
      expect(result.body.schema.properties.modules.items.additionalProperties).toBe(false);
      expect(result.body.nextSteps.join(" ")).toContain("--view");
    }
    expect(run(["schema"]).body.schema).toEqual(getSchema());
    const help = run(["--help"]).body.help;
    for (const token of [
      "--diagram",
      "--view",
      "circuitkit.diagram.v1",
      "author envelopes",
      "legacy only",
    ])
      expect(help).toContain(token);
  });

  for (const view of ["blocks", "wiring", "schematic"] as const) {
    for (const mode of ["raw", "markdown"] as const) {
      test(`${mode} ${view}: validate, inspect and SVG match diagram API without rewriting authored view`, () => {
        const expected = renderDiagramSVG(diagram(), { view });
        if (!expected.ok) throw new Error(JSON.stringify(expected));
        const selection = mode === "raw" ? [input] : [markdownInput, "--block", "2"];
        for (const command of ["validate", "inspect", "render"]) {
          const result = run([command, ...selection, "--view", view, "--json"]);
          expect(result.status).toBe(0);
          expect(result.stderr).toBe("");
          expect(result.body.document).toEqual(expected.document);
          expect(result.body.document.view).toBe("wiring");
          expect(result.body.document.theme).toBe("geist-light");
          expect(result.body.document).not.toHaveProperty("display");
          expect(result.body.figure).toEqual(expected.figure);
          expect(result.body.semantics).toEqual(expected.semantics);
          expect(result.body.classification).toEqual(expected.classification);
          expect(result.body.bounds).toEqual(expected.bounds);
          expect(result.body.targets).toEqual(expected.targets);
          if (command === "render") expect(result.body.svg).toBe(expected.svg);
          else expect(result.body).not.toHaveProperty("svg");
        }
        const output = join(temporary, `${mode}-${view}.svg`);
        const result = run(["render", ...selection, "--view", view, "--out", output]);
        expect(result.status).toBe(0);
        expect(result.body.output).toBe(output);
        expect(result.body.svg).toBe(expected.svg);
        expect(readFileSync(output, "utf8")).toBe(expected.svg);
      });

      test(`${mode} ${view}: native PNG uses compiled public figure and authored receipt`, async () => {
        const compiled = compileDiagram(diagram(), { view });
        if (!compiled.ok) throw new Error(JSON.stringify(compiled));
        const expected = await renderEducationalPNG(compiled.figure, { scale: 2 });
        if (!expected.ok) throw new Error(JSON.stringify(expected));
        const output = join(temporary, `${mode}-${view}.png`);
        const selection = mode === "raw" ? ["-"] : ["-", "--block", "2"];
        const source =
          mode === "raw" ? JSON.stringify(diagram()) : readFileSync(markdownInput, "utf8");
        const result = run(
          [
            "render",
            ...selection,
            "--view",
            view,
            "--format",
            "png",
            "--scale",
            "2",
            "--out",
            output,
          ],
          source,
        );
        expect(result.status).toBe(0);
        expect(result.stderr).toBe("");
        expect(result.body).toMatchObject({
          ok: true,
          format: "png",
          scale: 2,
          width: expected.width,
          height: expected.height,
          bytes: expected.png.byteLength,
          output,
          document: compiled.document,
          figure: compiled.figure,
          semantics: compiled.semantics,
          classification: compiled.classification,
          bounds: expected.bounds,
          targets: expected.targets,
        });
        expect(result.body).not.toHaveProperty("png");
        expect(result.body).not.toHaveProperty("svg");
        const bytes = readFileSync(output);
        expect(bytes).toEqual(Buffer.from(expected.png));
        expect(bytes.subarray(0, 8)).toEqual(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]));
      });
    }
  }

  test("markdown command uses the extended adapter, including diagram-only view overrides", () => {
    const source = readFileSync(markdownInput, "utf8");
    for (const view of [undefined, "blocks", "wiring", "schematic"] as const) {
      const options = view ? { view } : undefined;
      const expected = renderCircuitMarkdown(source, options);
      const result = run(["markdown", "-", ...(view ? ["--view", view] : [])], source);
      expect(result.status).toBe(0);
      expect(result.stderr).toBe("");
      expect(result.body).toMatchObject(expected);
      expect(result.body).not.toHaveProperty("output");
    }
  });

  test("invalid raw references retain diagram diagnostics, correction pins and schema next step", () => {
    const invalid = diagram();
    invalid.connections[0] = { from: "source.absent", to: "amp.in" };
    for (const command of ["validate", "inspect", "render"]) {
      const result = run([command, "-"], JSON.stringify(invalid));
      expect(result.status).toBe(1);
      expect(result.stderr).toBe("");
      expect(result.body.diagnostics).toContainEqual(
        expect.objectContaining({
          code: "diagram.reference",
          path: "/connections/0/from",
          validPins: ["source.out", "source.power"],
        }),
      );
      expect(result.body.nextSteps).toContain("circuitkit schema --diagram --json");
      expect(result.body).not.toHaveProperty("svg");
      expect(result.body).not.toHaveProperty("figure");
    }
  });

  for (const format of ["svg", "png"]) {
    test(`${format}: invalid coordinates, refs and nonselected blocks cannot publish or overwrite`, () => {
      const output = join(temporary, `protected.${format}`);
      const args = ["render", "-", "--format", format, "--out", output];
      const success = run(args, JSON.stringify(diagram()));
      expect(success.status).toBe(0);
      const original = readFileSync(output);
      const refused = run(args, JSON.stringify(diagram()));
      expect(refused.status).toBe(2);
      expect(refused.body.diagnostics[0].code).toBe("io.destination_exists");
      for (const bad of [
        { ...diagram(), x: 0 },
        { ...diagram(), connections: [{ from: "missing.pin", to: "amp.in" }] },
        { ...diagram(), view: "pcb" },
        { schema: "circuitkit.author.v1", document: diagram() },
      ]) {
        const raw = run([...args, "--overwrite"], JSON.stringify(bad));
        expect(raw.status).toBe(1);
        expect(raw.body).not.toHaveProperty("svg");
        expect(raw.body).not.toHaveProperty("output");
        expect(readFileSync(output)).toEqual(original);
        const source = `# Lesson\n\n${fence(diagram())}\n\n${fence(bad)}`;
        const selected = run([...args, "--overwrite", "--block", "1"], source);
        expect(selected.status).toBe(1);
        expect(selected.body.diagnostics[0].path).toStartWith(
          "/markdown/line/7/column/1/figures/1",
        );
        expect(selected.body.diagnostics[0].message).toContain("line 7, column 1");
        expect(selected.body).not.toHaveProperty("figures");
        expect(readFileSync(output)).toEqual(original);
        const fresh = join(temporary, `invalid-new.${format}`);
        expect(
          run(["render", "-", "--format", format, "--out", fresh], JSON.stringify(bad)).status,
        ).toBe(1);
        expect(existsSync(fresh)).toBe(false);
      }
      const replacement = run(
        [...args, "--overwrite", "--view", "blocks"],
        JSON.stringify(diagram()),
      );
      expect(replacement.status).toBe(0);
      expect(readFileSync(output)).not.toEqual(original);
      expect(readdirSync(temporary).filter((name) => name.endsWith(".tmp"))).toEqual([]);
    });
  }

  test("PNG pixel budget fails closed with a located scale diagnostic", () => {
    const large: DiagramDocument = {
      schema: "circuitkit.diagram.v1",
      id: "large",
      title: "Large diagram",
      modules: Array.from({ length: 16 }, (_, index) => ({
        id: `module${index}`,
        label: "W".repeat(64),
        ports: ["a", "b", "c", "d"],
      })),
      connections: Array.from({ length: 15 }, (_, index) => ({
        from: `module${index}.a`,
        to: `module${index + 1}.a`,
      })),
    };
    const compiled = compileDiagram(large);
    expect(compiled.ok).toBe(true);
    const output = join(temporary, "budget.png");
    writeFileSync(output, "previous");
    const result = run(
      [
        "render",
        "-",
        "--block",
        "1",
        "--format",
        "png",
        "--scale",
        "4",
        "--out",
        output,
        "--overwrite",
      ],
      fence(large),
    );
    expect(result.status).toBe(1);
    expect(result.body.diagnostics).toContainEqual(
      expect.objectContaining({
        code: "png.pixel_limit",
        path: "/markdown/line/1/column/1/figures/0/scale",
      }),
    );
    expect(result.body).not.toHaveProperty("output");
    expect(readFileSync(output, "utf8")).toBe("previous");
  });

  test("diagram output respects symlink refusal and explicit replacement without following it", () => {
    const target = join(temporary, "target.txt");
    const output = join(temporary, "link.svg");
    writeFileSync(target, "keep target");
    symlinkSync(target, output);
    expect(run(["render", input, "--out", output]).status).toBe(2);
    expect(lstatSync(output).isSymbolicLink()).toBe(true);
    expect(run(["render", input, "--out", output, "--overwrite"]).status).toBe(0);
    expect(lstatSync(output).isSymbolicLink()).toBe(false);
    expect(readFileSync(target, "utf8")).toBe("keep target");
  });

  for (const flags of [
    ["--diagram"],
    ["--view", "pcb"],
    ["--view", ""],
    ["--view", "blocks", "--view", "wiring"],
    ["--figure"],
    ["--schematic"],
    ["--view", "schematic", "--schematic"],
    ["--format", "pdf"],
    ["--format", "png"],
    ["--scale", "2"],
    ["--format", "png", "--scale", "0", "--out", "unused.png"],
    ["--format", "png", "--scale", "5", "--out", "unused.png"],
    ["--format", "png", "--scale", "1.5", "--out", "unused.png"],
  ]) {
    test(`diagram rejects incompatible or invalid flags: ${flags.join(" ")}`, () => {
      const result = run(["render", input, ...flags]);
      expect(result.status).toBe(2);
      expect(result.body.diagnostics[0].code).toBe("document.invalid_field");
      expect(result.body).not.toHaveProperty("svg");
      expect(result.body).not.toHaveProperty("output");
    });
  }

  test("diagram discovery and view flags reject unrelated commands and legacy-only inputs", () => {
    for (const command of ["schema", "catalog"])
      expect(run([command, "--view", "wiring"]).status).toBe(2);
    for (const command of ["catalog", "validate", "inspect", "markdown"])
      expect(run([command, "--diagram"]).status).toBe(2);
    for (const command of ["validate", "inspect", "render"]) {
      expect(
        run([command, "-", "--view", "blocks"], JSON.stringify(loadExample("rc-lowpass"))).status,
      ).toBe(2);
      expect(run([command, markdownInput, "--block", "1", "--view", "blocks"]).status).toBe(2);
    }
    expect(
      run(["markdown", "-", "--view", "wiring"], fence(loadExample("rc-lowpass"))).status,
    ).toBe(2);
    for (const flag of ["--figure", "--schematic"])
      expect(run(["render", markdownInput, "--block", "2", flag]).status).toBe(2);
  });

  test("legacy default, figure and schematic SVG bytes remain unchanged", () => {
    const legacy = loadExample("rc-lowpass");
    for (const [flags, render] of [
      [[], renderSVG],
      [["--figure"], renderFigureSVG],
      [["--schematic"], renderSchematicSVG],
    ] as const) {
      const expected = render(legacy);
      if (!expected.ok) throw new Error("Invalid legacy fixture");
      const result = run(["render", "-", ...flags], JSON.stringify(legacy));
      expect(result.status).toBe(0);
      expect(result.body.svg).toBe(expected.svg);
      expect(result.body).not.toHaveProperty("classification");
      const selected = run(["render", markdownInput, "--block", "1", ...flags]);
      expect(selected.status).toBe(0);
      expect(selected.body.svg).toBe(expected.svg);
    }
  });

  test("Node-target bundle renders raw SVG and lazy native PNG without a Bun runtime", async () => {
    const node = Bun.which("node");
    if (!node) throw new Error("Node is required for CLI integration verification");
    const entry = join(temporary, "node-cli.mjs");
    const built = await Bun.build({
      entrypoints: [join(root, "src/cli.ts")],
      target: "node",
      format: "esm",
      external: ["@resvg/resvg-js"],
    });
    expect(built.success).toBe(true);
    const artifact = built.outputs[0];
    if (!artifact) throw new Error("Missing CLI bundle");
    const source = await artifact.text();
    expect(source).toContain('import("@resvg/resvg-js")');
    expect(built.outputs.some((output) => output.path.endsWith(".node"))).toBe(false);
    writeFileSync(entry, source);
    const schema = run(["schema", "--diagram"], "", entry, node);
    expect(schema.status).toBe(0);
    expect(schema.stderr).toBe("");
    expect(schema.body.schema).toMatchObject({
      type: "object",
      additionalProperties: false,
      properties: {
        schema: { const: "circuitkit.diagram.v1" },
        view: { enum: ["blocks", "wiring", "schematic"], default: "wiring" },
        modules: { items: { additionalProperties: false } },
      },
    });
    expect(
      run(["render", "-", "--view", "blocks"], JSON.stringify(diagram()), entry, node).status,
    ).toBe(0);
    const output = join(temporary, "node.png");
    const result = run(
      ["render", markdownInput, "--block", "2", "--format", "png", "--out", output],
      "",
      entry,
      node,
    );
    expect(result.status).toBe(0);
    expect(result.stderr).toBe("");
    expect(result.body.document.schema).toBe("circuitkit.diagram.v1");
    expect(readFileSync(output).subarray(0, 8)).toEqual(
      Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    );
    const unavailable = join(temporary, "node-no-native.mjs");
    writeFileSync(
      unavailable,
      source.replaceAll(
        'import("@resvg/resvg-js")',
        'import("data:text/javascript,throw%20new%20Error(%22native%20unavailable%22)")',
      ),
    );
    expect(run(["render", input], "", unavailable, node).status).toBe(0);
    const original = readFileSync(output);
    const failed = run(
      ["render", markdownInput, "--block", "2", "--format", "png", "--out", output, "--overwrite"],
      "",
      unavailable,
      node,
    );
    expect(failed.status).toBe(2);
    expect(failed.stderr).toContain("png.render_failed");
    expect(failed.body.diagnostics).toContainEqual(
      expect.objectContaining({
        code: "png.render_failed",
        path: "/markdown/line/5/column/1/figures/1/input",
      }),
    );
    expect(failed.body).not.toHaveProperty("output");
    expect(failed.body).not.toHaveProperty("svg");
    expect(readFileSync(output)).toEqual(original);
  });
});
