import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { spawn, spawnSync } from "node:child_process";
import {
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
import { renderFigureSVG, renderSVG } from "../src/index.ts";
import { recipeIds } from "../src/schema.ts";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const cli = join(root, "src/cli.ts");
let temporary: string;
let input: string;

function run(args: string[], stdin?: string, environment: Partial<NodeJS.ProcessEnv> = {}) {
  const result = spawnSync(process.execPath, [cli, ...args], {
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
      const child = spawn(process.execPath, [cli, ...args], {
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
    expect(result.stderr).toBe("");
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
