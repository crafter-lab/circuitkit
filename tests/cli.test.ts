import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { spawn, spawnSync } from "node:child_process";
import {
  lstatSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { dividerLesson } from "../app/lesson/documents.ts";
import { loadExample } from "../src/catalog.ts";
import { renderFigureSVG, renderSchematicSVG, renderSVG } from "../src/index.ts";
import { renderCircuitMarkdown } from "../src/markdown.ts";
import { renderPNG } from "../src/png.ts";
import { recipeIds } from "../src/schema.ts";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const cli = process.env.CIRCUITKIT_TEST_CLI ?? join(root, "src/cli.ts");
const runtime = process.env.CIRCUITKIT_TEST_RUNTIME ?? process.execPath;
let temporary: string;
let input: string;

function run(args: string[], stdin?: string, environment: Partial<NodeJS.ProcessEnv> = {}) {
  const result = spawnSync(runtime, [cli, ...args], {
    cwd: root,
    input: stdin ?? "",
    encoding: "utf8",
    env: { ...process.env, ...environment },
  });
  expect(result.error).toBeUndefined();
  expect(result.signal).toBeNull();
  expect(result.stdout).not.toContain(String.fromCharCode(27));
  const body = JSON.parse(result.stdout);
  expect(typeof body).toBe("object");
  expect(Array.isArray(body)).toBe(false);
  expect(Array.isArray(body.diagnostics)).toBe(true);
  expect(Array.isArray(body.nextSteps)).toBe(true);
  return { ...result, body };
}

function concurrent(args: string[]) {
  return new Promise<{ status: number | null; stdout: string; stderr: string }>(
    (resolveResult, reject) => {
      const child = spawn(runtime, [cli, ...args], {
        cwd: root,
        stdio: ["ignore", "pipe", "pipe"],
      });
      let stdout = "";
      let stderr = "";
      child.stdout.setEncoding("utf8").on("data", (chunk: string) => {
        stdout += chunk;
      });
      child.stderr.setEncoding("utf8").on("data", (chunk: string) => {
        stderr += chunk;
      });
      child.on("error", reject);
      child.on("close", (status) => resolveResult({ status, stdout, stderr }));
    },
  );
}

beforeAll(() => {
  temporary = mkdtempSync(join(tmpdir(), "circuitkit-cli-"));
  input = join(temporary, "input with spaces.json");
  writeFileSync(input, JSON.stringify(loadExample("rc-lowpass")));
});

afterAll(() => {
  rmSync(temporary, { recursive: true, force: true });
});

describe("complete lesson figure export", () => {
  test("--figure uses the shared composition and preserves atomic output safety", () => {
    const document = dividerLesson("geist-dark", 10000);
    document.presentation.highlight = { components: [], nets: ["output"] };
    const expected = renderFigureSVG(document);
    expect(expected.ok).toBe(true);
    if (!expected.ok) throw new Error(JSON.stringify(expected.diagnostics));
    const output = join(temporary, "lesson.svg");
    const rendered = run(
      ["render", "-", "--figure", "--out", output, "--json"],
      JSON.stringify(document),
    );
    expect(rendered.status).toBe(0);
    expect(rendered.body.svg).toBe(expected.svg);
    expect(readFileSync(output, "utf8")).toBe(expected.svg);
    expect(run(["render", "-", "--figure", "--out", output], JSON.stringify(document)).status).toBe(
      2,
    );
    const annotation = document.presentation.annotations?.nets[0];
    if (!annotation) throw new Error("Missing annotation fixture");
    annotation.net = "missing";
    const invalid = run(
      ["render", "-", "--figure", "--overwrite", "--out", output],
      JSON.stringify(document),
    );
    expect(invalid.status).toBe(1);
    expect(invalid.body).not.toHaveProperty("svg");
    expect(readFileSync(output, "utf8")).toBe(expected.svg);
  });
  test("--figure is render-only and does not change legacy documents", () => {
    expect(run(["validate", input, "--figure"]).status).toBe(2);
    expect(run(["catalog", "--figure"]).status).toBe(2);
    expect(run(["render", input, "--figure"]).body.svg).toBe(run(["render", input]).body.svg);
  });
});

describe("schematic-only export", () => {
  test("SVG file and stdin match the minimal API, not the lesson composition", () => {
    const document = dividerLesson("geist-dark", 10000);
    const expected = renderSchematicSVG(document);
    if (!expected.ok) throw new Error(JSON.stringify(expected.diagnostics));
    const output = join(temporary, "schematic.svg");
    const result = run(["render", "-", "--schematic", "--out", output], JSON.stringify(document));
    expect(result.status).toBe(0);
    expect(result.stderr).toBe("");
    expect(result.body.svg).toBe(expected.svg);
    expect(result.body.bounds).toEqual(expected.bounds);
    expect(result.body).not.toHaveProperty("annotations");
    expect(readFileSync(output, "utf8")).toBe(expected.svg);
    expect(run(["render", input, "--schematic", "--out", output]).status).toBe(2);
    expect(readFileSync(output, "utf8")).toBe(expected.svg);
    const annotation = document.presentation.annotations?.nets[0];
    if (!annotation) throw new Error("Missing annotation");
    annotation.net = "absent";
    const invalid = run(
      ["render", "-", "--schematic", "--out", output, "--overwrite"],
      JSON.stringify(document),
    );
    expect(invalid.status).toBe(1);
    expect(invalid.body).not.toHaveProperty("svg");
    expect(readFileSync(output, "utf8")).toBe(expected.svg);
  });

  for (const format of ["svg", "png"] as const) {
    test(`${format}: Markdown --block uses schematic rendering after all blocks validate`, async () => {
      const document = dividerLesson("geist-light", 10000);
      const source = `${fence(loadExample("rc-lowpass"))}\n${fence(document)}`;
      const output = join(temporary, `selected-schematic.${format}`);
      const flags = [
        "render",
        "-",
        "--schematic",
        "--block",
        "2",
        "--format",
        format,
        "--out",
        output,
        ...(format === "png" ? ["--scale", "2"] : []),
      ];
      const result = run(flags, source);
      expect(result.status).toBe(0);
      expect(result.stderr).toBe("");
      const expected =
        format === "png"
          ? await renderPNG(document, { schematic: true, scale: 2 })
          : renderSchematicSVG(document);
      if (!expected.ok) throw new Error(JSON.stringify(expected.diagnostics));
      expect(result.body.bounds).toEqual(expected.bounds);
      expect(result.body.circuit).toEqual(expected.circuit);
      if ("png" in expected) {
        expect(readFileSync(output)).toEqual(Buffer.from(expected.png));
        expect(result.body.bytes).toBe(expected.png.byteLength);
        expect(result.body.width).toBe(expected.width);
        expect(result.body.height).toBe(expected.height);
        expect(result.body).not.toHaveProperty("png");
        expect(result.body).not.toHaveProperty("svg");
      } else expect(readFileSync(output, "utf8")).toBe(expected.svg);
      const original = readFileSync(output);
      const invalid = run([...flags, "--overwrite"], `${fence({})}\n${fence(document)}`);
      expect(invalid.status).toBe(1);
      expect(readFileSync(output)).toEqual(original);
    });
  }

  for (const args of [
    ...["validate", "inspect", "markdown", "schema", "catalog"].map((command) => [
      command,
      "missing",
      "--schematic",
    ]),
    ["render", "missing", "--schematic", "--figure"],
    ["render", "missing", "--figure", "--schematic", "--format", "png", "--out", "unused.png"],
    ["render", "missing", "--schematic", "--schematic"],
    ["render", "missing", "--schematic=true"],
    ["render", "missing", "--schematic", "--format", "png"],
  ]) {
    test(`schematic misuse is exit 2 before input IO: ${args.join(" ")}`, () => {
      const result = run(args);
      expect(result.status).toBe(2);
      expect(result.body.diagnostics[0].code).toBe("document.invalid_field");
      expect(result.stderr).toContain("Usage:");
      expect(result.body).not.toHaveProperty("svg");
    });
  }
  test("help advertises the opt-in mode and legacy defaults remain unchanged", () => {
    expect(run(["--help"]).body.help).toContain("--schematic");
    const expected = renderSVG(loadExample("rc-lowpass"));
    if (!expected.ok) throw new Error("Invalid fixture");
    expect(run(["render", input]).body.svg).toBe(expected.svg);
  });
});

describe("machine envelope and discovery", () => {
  for (const args of [
    [],
    ["--help"],
    ["-h"],
    ["help"],
    ["render", "--help"],
    ["--json", "--help"],
  ]) {
    test(`help is discoverable: ${args.join(" ") || "bare invocation"}`, () => {
      const result = run(args);
      expect(result.status).toBe(0);
      expect(result.stderr).toBe("");
      expect(result.body).toMatchObject({ ok: true, version: 1 });
      expect(result.body.help).toStartWith("circuitkit:");
      expect(result.body.nextSteps).toEqual([
        "circuitkit schema --json",
        "circuitkit catalog --json",
      ]);
      for (const token of [
        "schema",
        "catalog",
        "validate",
        "inspect",
        "render",
        "--overwrite",
        "--json",
        "stdin",
      ])
        expect(result.body.help).toContain(token);
    });
  }

  test("schema is versioned and non-TTY JSON cannot be overridden by color/environment", () => {
    const result = run(["schema"], undefined, { NO_JSON: "1", FORCE_COLOR: "1", NO_COLOR: "1" });
    expect(result.status).toBe(0);
    expect(
      result.stderr.replace(
        /\(node:\d+\) Warning: The 'NO_COLOR' env is ignored due to the 'FORCE_COLOR' env being set\.\n\(Use `node --trace-warnings \.\.\.` to show where the warning was created\)\n/,
        "",
      ),
    ).toBe("");
    expect(result.body).toMatchObject({
      ok: true,
      version: 1,
      schema: { type: "object", additionalProperties: false },
    });
    expect(result.body.schema.properties.version.const).toBe(1);
  });

  test("catalog carries every registered recipe, pins, and examples", () => {
    const result = run(["catalog", "--json"]);
    expect(result.status).toBe(0);
    expect(result.stderr).toBe("");
    expect(result.body.catalog.recipes.map((recipe: { id: string }) => recipe.id)).toEqual([
      ...recipeIds,
    ]);
    expect(result.body.catalog.components.resistor.pins).toEqual(["a", "b"]);
    expect(result.body.catalog.recipes[0].roles.series).toBe("resistor");
    expect(result.body.catalog.recipes[0].nets).toContainEqual(["input", "series.a"]);
  });

  for (const args of [
    ["wat"],
    ["render"],
    ["validate"],
    ["schema", "extra"],
    ["catalog", "--out", "x"],
    ["inspect", "--overwrite", "x"],
    ["render", "--out"],
    ["render", "--overwrite", "x"],
    ["render", "x", "--out", "-"],
    ["render", "x", "extra"],
    ["validate", "--wat"],
    ["--json", "--json", "schema"],
    ["render", "x", "--out=a", "--out=b"],
  ]) {
    test(`usage failure returns one object and exit 2: ${args.join(" ")}`, () => {
      const result = run(args);
      expect(result.status).toBe(2);
      expect(result.body.ok).toBe(false);
      expect(result.body.diagnostics[0].code).toBe("document.invalid_field");
      expect(result.body.diagnostics[0].message).toContain("Run circuitkit --help.");
      expect(result.body.nextSteps).toEqual(["circuitkit --help"]);
      expect(result.body).not.toHaveProperty("svg");
    });
  }
});

describe("validate/correct/inspect/render workflow", () => {
  test("invalid JSON from stdin has exit 1, not IO failure", () => {
    const result = run(["validate", "-"], "{broken");
    expect(result.status).toBe(1);
    expect(result.body).toMatchObject({
      ok: false,
      diagnostics: [{ code: "document.invalid_json", path: "" }],
    });
    expect(result.body).not.toHaveProperty("svg");
  });

  test("unknown pin is correctable using actionable structured diagnostics", () => {
    const document = loadExample("rc-lowpass");
    document.circuit.nets.input = ["VIN", "R1.c"];
    const invalid = run(["validate", "-", "--json"], JSON.stringify(document));
    expect(invalid.status).toBe(1);
    expect(invalid.body.diagnostics).toContainEqual(
      expect.objectContaining({
        code: "circuit.unknown_pin",
        path: "/circuit/nets/input/1",
        validPins: ["a", "b"],
      }),
    );
    expect(invalid.body).not.toHaveProperty("svg");
    document.circuit.nets.input = ["VIN", "R1.a"];
    const corrected = run(["validate", "-"], JSON.stringify(document));
    expect(corrected.status).toBe(0);
    expect(corrected.body.ok).toBe(true);
    expect(corrected.body).not.toHaveProperty("svg");
    const inspected = run(["inspect", input]);
    expect(inspected.status).toBe(0);
    expect(inspected.body.ok).toBe(true);
    expect(inspected.body).toHaveProperty("bounds");
    expect(JSON.stringify(inspected.body)).toContain('"R1.a"');
    expect(JSON.stringify(inspected.body)).toContain('"series":"R1"');
  });

  test("stdin render matches the public renderer bytes", () => {
    const document = loadExample("rc-lowpass");
    const expected = renderSVG(document);
    expect(expected.ok).toBe(true);
    if (!expected.ok) return;
    const result = run(["render", "-", "--json"], JSON.stringify(document));
    expect(result.status).toBe(0);
    expect(result.stderr).toBe("");
    expect(result.body.svg).toBe(expected.svg);
    expect(result.body).not.toHaveProperty("output");
  });

  test("CLI validate runs full rendering validation, not only domain checks", () => {
    const document = loadExample("rc-lowpass");
    document.presentation.theme.overrides = { background: "#fff", label: "#fff" };
    const result = run(["validate", "-"], JSON.stringify(document));
    expect(result.status).toBe(1);
    expect(result.body.diagnostics).toContainEqual(
      expect.objectContaining({ code: "theme.insufficient_contrast" }),
    );
  });

  test("missing input returns operational stderr and exit 2", () => {
    const result = run(["validate", join(temporary, "missing.json")]);
    expect(result.status).toBe(2);
    expect(result.body.diagnostics[0].code).toBe("io.read_failed");
    expect(result.stderr).toContain("io.read_failed");
  });
});

describe("atomic output and refusal paths", () => {
  test("fresh output matches receipt and refuses replacement without consent", () => {
    const out = join(temporary, "fresh.svg");
    const result = run(["render", input, `--out=${out}`]);
    expect(result.status).toBe(0);
    expect(result.body.output).toBe(out);
    expect(readFileSync(out, "utf8")).toBe(result.body.svg);
    const original = readFileSync(out, "utf8");
    const refused = run(["render", input, "--out", out]);
    expect(refused.status).toBe(2);
    expect(refused.body.diagnostics[0].code).toBe("io.destination_exists");
    expect(refused.body).not.toHaveProperty("svg");
    expect(readFileSync(out, "utf8")).toBe(original);
  });

  test("explicit overwrite publishes only after a successful render", () => {
    const out = join(temporary, "overwrite.svg");
    writeFileSync(out, "previous artifact");
    const invalid = loadExample("rc-lowpass");
    invalid.circuit.nets.input = ["VIN", "R1.c"];
    const refused = run(["render", "-", "--out", out, "--overwrite"], JSON.stringify(invalid));
    expect(refused.status).toBe(1);
    expect(readFileSync(out, "utf8")).toBe("previous artifact");
    const malformed = run(["render", "-", "--out", out, "--overwrite"], "bad json");
    expect(malformed.status).toBe(1);
    expect(readFileSync(out, "utf8")).toBe("previous artifact");
    const written = run(["render", input, "--out", out, "--overwrite"]);
    expect(written.status).toBe(0);
    expect(readFileSync(out, "utf8")).toBe(written.body.svg);
  });

  test("invalid input never creates a fresh destination", () => {
    const out = join(temporary, "must-not-exist.svg");
    expect(run(["render", "-", "--out", out], "{}").status).toBe(1);
    expect(() => readFileSync(out)).toThrow();
  });

  test("existing symlinks are refused without touching their target", () => {
    const target = join(temporary, "symlink-target.svg");
    const out = join(temporary, "symlink.svg");
    writeFileSync(target, "keep target");
    symlinkSync(target, out);
    const result = run(["render", input, "--out", out]);
    expect(result.status).toBe(2);
    expect(result.body.diagnostics[0].code).toBe("io.destination_exists");
    expect(readFileSync(target, "utf8")).toBe("keep target");
  });

  test("missing output directories and directory destinations fail closed", () => {
    const absent = run(["render", input, "--out", join(temporary, "absent", "file.svg")]);
    expect(absent.status).toBe(2);
    expect(absent.body.diagnostics[0].code).toBe("io.write_failed");
    const directory = run(["render", input, "--out", temporary, "--overwrite"]);
    expect(directory.status).toBe(2);
    expect(directory.body.diagnostics[0].code).toBe("io.write_failed");
    expect(directory.body).not.toHaveProperty("svg");
  });

  test("concurrent no-overwrite writers have exactly one winner", async () => {
    const out = join(temporary, "race.svg");
    const results = await Promise.all(
      Array.from({ length: 4 }, () => concurrent(["render", input, "--out", out, "--json"])),
    );
    expect(results.map(({ status }) => status).sort()).toEqual([0, 2, 2, 2]);
    const winner = results.find(({ status }) => status === 0);
    expect(winner).toBeDefined();
    expect(readFileSync(out, "utf8")).toBe(JSON.parse(winner?.stdout ?? "{}").svg);
    for (const result of results.filter(({ status }) => status !== 0))
      expect(JSON.parse(result.stdout).diagnostics[0].code).toBe("io.destination_exists");
    expect(readdirSync(temporary).filter((name) => name.endsWith(".tmp"))).toEqual([]);
  });
});

function fence(document: unknown) {
  return `\`\`\`circuitkit\n${JSON.stringify(document)}\n\`\`\``;
}

describe("PNG command and binary publication", () => {
  test("PNG file matches API bytes and JSON has only a receipt", async () => {
    const document = dividerLesson("geist-dark", 10000);
    document.presentation.steps = [
      {
        id: "output",
        title: "Read output",
        description: "Measure this node.",
        highlight: { components: [], nets: ["output"] },
      },
    ];
    document.presentation.activeStep = "output";
    const expected = await renderPNG(document, { figure: true, scale: 2 });
    expect(expected.ok).toBe(true);
    if (!expected.ok) throw new Error(JSON.stringify(expected.diagnostics));
    const output = join(temporary, "complete figure.png");
    const result = run(
      ["render", "-", "--format", "png", "--scale", "2", "--figure", "--out", output],
      JSON.stringify(document),
    );
    expect(result.status).toBe(0);
    expect(result.stderr).toBe("");
    expect(result.body).toMatchObject({
      ok: true,
      format: "png",
      width: expected.width,
      height: expected.height,
      scale: 2,
      bytes: expected.png.byteLength,
      output,
      bounds: expected.bounds,
    });
    expect(result.body).not.toHaveProperty("png");
    expect(result.body).not.toHaveProperty("svg");
    expect(readFileSync(output)).toEqual(Buffer.from(expected.png));
    expect(run(["render", input, "--format", "png", "--out", output]).status).toBe(2);
    expect(readFileSync(output)).toEqual(Buffer.from(expected.png));
    const invalid = run(["render", "-", "--format", "png", "--out", output, "--overwrite"], "{}");
    expect(invalid.status).toBe(1);
    expect(readFileSync(output)).toEqual(Buffer.from(expected.png));
    const replacement = run(["render", input, "--format", "png", "--out", output, "--overwrite"]);
    expect(replacement.status).toBe(0);
    expect(replacement.body.bytes).toBe(readFileSync(output).length);
    expect(replacement.body.scale).toBe(1);
  });

  test("PNG refuses symlinks, keeps their target on explicit replacement, and fails closed on IO", () => {
    const target = join(temporary, "png-target");
    const output = join(temporary, "png-link");
    writeFileSync(target, "keep target");
    symlinkSync(target, output);
    expect(run(["render", input, "--format", "png", "--out", output]).status).toBe(2);
    expect(readFileSync(target, "utf8")).toBe("keep target");
    expect(run(["render", input, "--format", "png", "--out", output, "--overwrite"]).status).toBe(
      0,
    );
    expect(readFileSync(target, "utf8")).toBe("keep target");
    expect(readFileSync(output).readUInt32BE(0)).toBe(0x89504e47);
    for (const destination of [join(temporary, "missing", "a.png"), temporary]) {
      const failed = run(["render", input, "--format", "png", "--out", destination, "--overwrite"]);
      expect(failed.status).toBe(2);
      expect(failed.body.diagnostics[0].code).toBe("io.write_failed");
      expect(failed.body).not.toHaveProperty("png");
    }
  });

  test("concurrent PNG no-overwrite writers have one winner and no temporary leaks", async () => {
    const output = join(temporary, "race.png");
    const results = await Promise.all(
      Array.from({ length: 4 }, () =>
        concurrent(["render", input, "--format", "png", "--out", output]),
      ),
    );
    expect(results.map(({ status }) => status).sort()).toEqual([0, 2, 2, 2]);
    const winner = JSON.parse(results.find(({ status }) => status === 0)?.stdout ?? "{}");
    expect(readFileSync(output).length).toBe(winner.bytes);
    expect(readdirSync(temporary).filter((name) => name.endsWith(".tmp"))).toEqual([]);
  });

  test("PNG pixel cap refuses a valid large figure without altering the destination", () => {
    const output = join(temporary, "capped.png");
    writeFileSync(output, "preserve artifact");
    const result = run(
      ["render", "-", "--format", "png", "--scale", "4", "--out", output, "--overwrite"],
      JSON.stringify(loadExample("wheatstone-bridge")),
    );
    expect(result.status).toBe(1);
    expect(result.stderr).toBe("");
    expect(result.body.diagnostics[0].code).toBe("png.pixel_limit");
    expect(result.body).not.toHaveProperty("output");
    expect(readFileSync(output, "utf8")).toBe("preserve artifact");
  });

  test("explicit SVG format preserves the original envelope and SVG bytes", () => {
    expect(run(["render", input, "--format", "svg"]).body).toEqual(run(["render", input]).body);
  });

  for (const args of [
    ["render", "x", "--format", "png"],
    ["render", "x", "--format", "PNG", "--out", "x.png"],
    ["render", "x", "--format", "jpeg"],
    ["render", "x", "--scale", "2"],
    ["render", "x", "--format", "svg", "--scale", "1"],
    ...["0", "5", "1.5", "2e0", "02", "NaN", ""].map((scale) => [
      "render",
      "x",
      "--format",
      "png",
      `--scale=${scale}`,
      "--out",
      "x.png",
    ]),
    ["validate", "x", "--format", "svg"],
    ["inspect", "x", "--scale", "1"],
    ["markdown", "x", "--out", "x.svg"],
    ["markdown", "x", "--figure"],
    ["markdown", "x", "--block", "1"],
    ["schema", "--block", "1"],
    ...["0", "-1", "1.5", "01", "1e0", "9007199254740992"].map((block) => [
      "validate",
      "x",
      `--block=${block}`,
    ]),
    ["render", "x", "--format", "svg", "--format", "png"],
    ["inspect", "x", "--block", "1", "--block", "2"],
  ]) {
    test(`rejects misuse before reading input: ${args.join(" ")}`, () => {
      const result = run(args);
      expect(result.status).toBe(2);
      expect(result.body.diagnostics[0].code).toBe("document.invalid_field");
      expect(result.stderr).toContain("Usage:");
    });
  }
});

describe("Markdown selection and bounded input", () => {
  test("markdown reads file or stdin and returns all rendered figures without writes", () => {
    const source = `# Lesson\n\n${fence(loadExample("rc-lowpass"))}\n\n${fence(dividerLesson("geist-dark", 10000))}\n`;
    const file = join(temporary, "lesson.md");
    writeFileSync(file, source);
    const expected = renderCircuitMarkdown(source);
    expect(expected.ok).toBe(true);
    for (const [path, stdin] of [
      [file, undefined],
      ["-", source],
    ] as const) {
      const result = run(["markdown", path], stdin);
      expect(result.status).toBe(0);
      expect(result.stderr).toBe("");
      expect(result.body).toMatchObject(expected);
      expect(result.body).not.toHaveProperty("output");
      expect(result.body.figures.map((figure: { index: number }) => figure.index)).toEqual([0, 1]);
    }
    expect(run(["validate", file]).body.diagnostics[0].code).toBe("document.invalid_json");
  });

  test("all three document verbs select a 1-based block only after validating all blocks", () => {
    const first = loadExample("rc-lowpass");
    const second = loadExample("voltage-divider");
    const source = `${fence(first)}\n${fence(second)}`;
    for (const command of ["validate", "inspect", "render"]) {
      const selected = run([command, "-", "--block", "2"], source);
      expect(selected.status).toBe(0);
      expect(selected.body).toEqual(run([command, "-"], JSON.stringify(second)).body);
      const invalid = run([command, "-", "--block", "1"], `${fence(first)}\n${fence({})}`);
      expect(invalid.status).toBe(1);
      expect(invalid.body).not.toHaveProperty("svg");
      expect(invalid.body.diagnostics[0].path).toContain("/markdown/line/4/column/1/figures/1");
    }
    const output = join(temporary, "selected.png");
    const png = run(["render", "-", "--block", "2", "--format", "png", "--out", output], source);
    expect(png.status).toBe(0);
    expect(png.body.document.layout.preset).toBe("voltage-divider");
    expect(readFileSync(output).length).toBe(png.body.bytes);
    const original = readFileSync(output);
    expect(
      run(
        ["render", "-", "--block", "1", "--format", "png", "--out", output, "--overwrite"],
        `${fence(first)}\n${fence({})}`,
      ).status,
    ).toBe(1);
    expect(readFileSync(output)).toEqual(original);
    expect(run(["inspect", "-", "--block", "3"], source).status).toBe(2);
    expect(run(["inspect", "-", "--block", "3"], `${fence(first)}\n${fence({})}`).status).toBe(1);
  });

  test("Markdown failure has no partial figures or HTML execution", () => {
    for (const source of [
      "<script>throw 1</script>",
      `${fence(loadExample("rc-lowpass"))}\n${fence({})}`,
      "```circuitkit\n{}",
    ]) {
      const result = run(["markdown", "-"], source);
      expect(result.status).toBe(1);
      expect(result.stderr).toBe("");
      expect(result.body).not.toHaveProperty("figures");
      expect(result.body).not.toHaveProperty("svg");
    }
  });

  test("file and stdin byte caps precede parse, including multibyte UTF-8", () => {
    for (const [command, text, code] of [
      ["validate", " ".repeat(64 * 1024 + 1), "document.too_large"],
      ["validate", "é".repeat(33 * 1024), "document.too_large"],
      ["markdown", " ".repeat(1024 * 1024 + 1), "markdown.too_large"],
    ]) {
      if (!command || !text || !code) throw new Error("Missing fixture");
      const file = join(temporary, `${command}-large`);
      writeFileSync(file, text);
      for (const [path, stdin] of [
        [file, undefined],
        ["-", text],
      ] as const) {
        const result = run([command, path], stdin);
        expect(result.status).toBe(1);
        expect(result.body.diagnostics[0].code).toBe(code);
      }
    }
    const json = JSON.stringify(loadExample("rc-lowpass"));
    expect(run(["validate", "-"], json.padEnd(64 * 1024)).status).toBe(0);
    const markdown = fence(loadExample("rc-lowpass"));
    expect(run(["markdown", "-"], markdown.padEnd(1024 * 1024)).status).toBe(0);
  });

  test("JSON nesting is bounded before validation recursion, not counted inside strings", () => {
    const tooDeep = `${"[".repeat(65)}0${"]".repeat(65)}`;
    expect(run(["validate", "-"], tooDeep).body.diagnostics[0].code).toBe("document.too_deep");
    const boundary = `${"[".repeat(64)}0${"]".repeat(64)}`;
    const result = run(["validate", "-"], boundary);
    expect(result.status).toBe(1);
    expect(result.body.diagnostics[0].code).not.toBe("document.too_deep");
    const stringValue = run(["validate", "-"], JSON.stringify("[".repeat(70)));
    expect(stringValue.status).toBe(1);
    expect(stringValue.body.diagnostics[0].code).not.toBe("document.too_deep");
    const document = loadExample("rc-lowpass");
    document.presentation.title = '[{\\"'.repeat(20);
    const quoted = run(["validate", "-"], JSON.stringify(document));
    expect(
      quoted.body.diagnostics.every(
        (diagnostic: { code: string }) => diagnostic.code !== "document.too_deep",
      ),
    ).toBe(true);
    expect(quoted.body).toMatchObject({
      ok: false,
      diagnostics: [{ code: "layout.label_collision" }],
    });
    expect(run(["validate", temporary]).body.diagnostics[0].code).toBe("io.read_failed");
  });
});

describe("actual Node-driven stdin streams", () => {
  let node: string;
  let nodeCli: string;
  let driver: string;
  let errorPrelude: string;
  let counter = 0;

  beforeAll(async () => {
    const executable = Bun.which("node");
    if (!executable) throw new Error("Node is required for the stdin transport regressions.");
    node = executable;
    nodeCli = process.env.CIRCUITKIT_TEST_CLI ?? join(temporary, "node-cli.mjs");
    if (!process.env.CIRCUITKIT_TEST_CLI) {
      const result = await Bun.build({
        entrypoints: [join(root, "src/cli.ts")],
        target: "node",
        format: "esm",
        external: ["@resvg/resvg-js"],
      });
      expect(result.success).toBe(true);
      const output = result.outputs[0];
      if (!output) throw new Error("Missing Node CLI test bundle");
      writeFileSync(nodeCli, await output.text());
    }
    errorPrelude = join(temporary, "stdin-error.mjs");
    writeFileSync(
      errorPrelude,
      `
const input = process.stdin;
function arm(event) {
  if (event !== "error") return;
  input.off("newListener", arm);
  input.once("data", () => input.destroy(Object.assign(new Error("Injected read failure"), { code: "EIO" })));
}
input.on("newListener", arm);
await new Promise(setImmediate);
`,
    );
    driver = join(temporary, "node-pipe-driver.mjs");
    writeFileSync(
      driver,
      `
import { spawn, spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { setTimeout } from "node:timers/promises";
const request = JSON.parse(readFileSync(process.argv[2], "utf8"));
const input = Buffer.from(request.input, "base64");
const args = [...(request.errorPrelude ? ["--import", request.errorPrelude] : []), request.cli, ...request.args];
let result;
if (request.splitAt === undefined) {
  const child = spawnSync(process.execPath, args, { input, encoding: "utf8", maxBuffer: 8 * 1024 * 1024 });
  result = { status: child.status, signal: child.signal, stdout: child.stdout, stderr: child.stderr, error: child.error?.code ?? null };
} else {
  const child = spawn(process.execPath, args, { stdio: ["pipe", "pipe", "pipe"] });
  let stdout = "";
  let stderr = "";
  let error = null;
  child.stdout.setEncoding("utf8").on("data", chunk => { stdout += chunk; });
  child.stderr.setEncoding("utf8").on("data", chunk => { stderr += chunk; });
  child.stdin.on("error", failure => { error = failure.code; });
  const closed = new Promise((resolve, reject) => { child.on("error", reject); child.on("close", (status, signal) => resolve({status, signal})); });
  child.stdin.write(input.subarray(0, request.splitAt));
  await setTimeout(150);
  child.stdin.end(input.subarray(request.splitAt));
  result = { ...await closed, stdout, stderr, error };
}
console.log(JSON.stringify(result));
`,
    );
  });

  function pipe(
    args: string[],
    input: string,
    options: { splitAt?: number; error?: boolean } = {},
  ) {
    const request = join(temporary, `node-pipe-${counter++}.json`);
    writeFileSync(
      request,
      JSON.stringify({
        cli: nodeCli,
        args,
        input: Buffer.from(input).toString("base64"),
        ...(options.splitAt !== undefined ? { splitAt: options.splitAt } : {}),
        ...(options.error ? { errorPrelude } : {}),
      }),
    );
    const driverResult = spawnSync(node, [driver, request], {
      encoding: "utf8",
      maxBuffer: 8 * 1024 * 1024,
    });
    expect(driverResult.status).toBe(0);
    expect(driverResult.error).toBeUndefined();
    expect(driverResult.signal).toBeNull();
    expect(driverResult.stderr).toBe("");
    const result = JSON.parse(driverResult.stdout);
    expect(result.signal).toBeNull();
    expect(result.stdout).not.toContain(String.fromCharCode(27));
    expect(result.stdout, result.stderr || `Node exited with ${result.status}`).not.toBe("");
    const body = JSON.parse(result.stdout);
    expect(Array.isArray(body.diagnostics)).toBe(true);
    expect(Array.isArray(body.nextSteps)).toBe(true);
    return { ...result, body };
  }

  for (const extra of [0, 1]) {
    test(`Node pipe ${extra ? "rejects 1 MiB plus one byte" : "accepts exactly 1 MiB"}`, () => {
      const source = fence(loadExample("rc-lowpass")).padEnd(1024 * 1024 + extra);
      const result = pipe(["markdown", "-"], source);
      expect(result.error).toBeNull();
      expect(result.status).toBe(extra ? 1 : 0);
      expect(result.stderr).toBe("");
      expect(result.body.ok).toBe(!extra);
      if (extra) expect(result.body.diagnostics[0].code).toBe("markdown.too_large");
      else expect(result.body.figures).toHaveLength(1);
    });
  }

  test("Node pipes handle small JSON, EOF and JSON byte limits", () => {
    const json = JSON.stringify(loadExample("rc-lowpass"));
    for (const source of [json, json.padEnd(64 * 1024)]) {
      const result = pipe(["validate", "-"], source);
      expect(result.error).toBeNull();
      expect(result.status).toBe(0);
      expect(result.stderr).toBe("");
      expect(result.body.ok).toBe(true);
    }
    const oversized = pipe(["validate", "-"], json.padEnd(64 * 1024 + 1));
    expect(oversized.status).toBe(1);
    expect(oversized.body.diagnostics[0].code).toBe("document.too_large");
    for (const source of ["", "{broken"]) {
      const result = pipe(["validate", "-"], source);
      expect(result.status).toBe(1);
      expect(result.stderr).toBe("");
      expect(result.body.diagnostics[0].code).toBe("document.invalid_json");
    }
  });

  test("UTF-8 split across delayed Node pipe chunks preserves text and counts bytes", () => {
    const document = loadExample("rc-lowpass");
    document.presentation.title = "Café Ω";
    const json = JSON.stringify(document);
    const splitAt = Buffer.from(json).indexOf(Buffer.from("é")) + 1;
    const result = pipe(["validate", "-"], json, { splitAt });
    expect(result.error).toBeNull();
    expect(result.status).toBe(0);
    expect(result.stderr).toBe("");
    expect(result.body.document.presentation.title).toBe("Café Ω");
    const padded = json + " ".repeat(64 * 1024 - Buffer.byteLength(json));
    expect(pipe(["validate", "-"], padded, { splitAt }).status).toBe(0);
    const oversized = pipe(["validate", "-"], `${padded} `, { splitAt });
    expect(oversized.status).toBe(1);
    expect(oversized.body.diagnostics[0].code).toBe("document.too_large");
  });

  test("asynchronous stdin errors produce one operational envelope and preserve output", () => {
    const output = join(temporary, "stdin-error.svg");
    writeFileSync(output, "preserve artifact");
    const result = pipe(
      ["render", "-", "--out", output, "--overwrite"],
      JSON.stringify(loadExample("rc-lowpass")),
      { error: true },
    );
    expect(result.status).toBe(2);
    expect(result.body.ok).toBe(false);
    expect(result.body.diagnostics[0].code).toBe("io.read_failed");
    expect(result.body.diagnostics[0].message).toContain("EIO");
    expect(result.stderr).toContain("io.read_failed");
    expect(result.body).not.toHaveProperty("svg");
    expect(readFileSync(output, "utf8")).toBe("preserve artifact");
  });
});

describe("generated native output cleanup", () => {
  test("build removes only unreferenced regular hashed resvg outputs and fails closed otherwise", () => {
    const sandbox = join(temporary, "build-cleanup");
    mkdirSync(join(sandbox, "dist"), { recursive: true });
    symlinkSync(join(root, "src"), join(sandbox, "src"));
    symlinkSync(join(root, "examples"), join(sandbox, "examples"));
    symlinkSync(join(root, "node_modules"), join(sandbox, "node_modules"));
    for (const name of ["package.json", "tsconfig.json", "tsconfig.build.json"])
      writeFileSync(join(sandbox, name), readFileSync(join(root, name)));
    const stale = join(sandbox, "dist/resvgjs.darwin-arm64-deadbeef.node");
    const keep = join(sandbox, "dist/custom.node");
    writeFileSync(stale, "stale generated binding");
    writeFileSync(keep, "unrelated artifact");
    const build = () =>
      spawnSync(
        Bun.which("bun") ?? process.execPath,
        [join(root, "scripts/build.ts"), "--skip-fonts"],
        { cwd: sandbox, encoding: "utf8" },
      );
    const clean = build();
    expect(clean.status).toBe(0);
    expect(clean.stdout).toContain("Removed stale generated native output");
    expect(() => lstatSync(stale)).toThrow();
    expect(readFileSync(keep, "utf8")).toBe("unrelated artifact");
    symlinkSync(keep, stale);
    const symlink = build();
    expect(symlink.status).toBe(1);
    expect(symlink.stderr).toContain("Refusing to remove non-regular or referenced native output");
    expect(lstatSync(stale).isSymbolicLink()).toBe(true);
    expect(readFileSync(keep, "utf8")).toBe("unrelated artifact");
    rmSync(stale);
    writeFileSync(stale, "referenced generated binding");
    writeFileSync(
      join(sandbox, "dist/keep.cjs"),
      'module.exports = "./resvgjs.darwin-arm64-deadbeef.node";',
    );
    const referenced = build();
    expect(referenced.status).toBe(1);
    expect(referenced.stderr).toContain(
      "Refusing to remove non-regular or referenced native output",
    );
    expect(readFileSync(stale, "utf8")).toBe("referenced generated binding");
    expect(readFileSync(keep, "utf8")).toBe("unrelated artifact");
    rmSync(stale);
    const unknown = join(sandbox, "dist/resvgjs.darwin-arm64.node");
    writeFileSync(unknown, "unrecognized binding");
    const unrecognized = build();
    expect(unrecognized.status).toBe(1);
    expect(unrecognized.stderr).toContain(
      "Unrecognized native output requires inspection before packing",
    );
    expect(readFileSync(unknown, "utf8")).toBe("unrecognized binding");
    expect(readFileSync(keep, "utf8")).toBe("unrelated artifact");
  });
});
