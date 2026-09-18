import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { spawn, spawnSync } from "node:child_process";
import {
  lstatSync,
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
import { privacyFixture } from "../src/v2/fixtures.ts";
import { inspectEducational, projectFigure, renderEducationalSVG } from "../src/v2/index.ts";
import { renderEducationalPNG } from "../src/v2/png.ts";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const cli = process.env.CIRCUITKIT_EDUCATION_TEST_CLI ?? join(root, "src/education-cli.ts");
const runtime = process.env.CIRCUITKIT_EDUCATION_TEST_RUNTIME ?? process.execPath;
const projected = projectFigure(privacyFixture(), "question");
if (!projected.ok) throw new Error("Invalid fixture");
const document = projected.document;
const source = JSON.stringify(document);
let temporary: string;
let input: string;
let authorInput: string;

function run(args: string[], stdin: string | Uint8Array = "") {
  const result = spawnSync(runtime, [cli, ...args], {
    cwd: temporary,
    input: stdin,
    encoding: "utf8",
    maxBuffer: 16 * 1024 * 1024,
  });
  expect(result.error).toBeUndefined();
  expect(result.signal).toBeNull();
  expect(result.stdout).not.toContain(String.fromCharCode(27));
  const body = JSON.parse(result.stdout);
  expect(body.version).toBe(2);
  expect(Array.isArray(body.diagnostics)).toBe(true);
  expect(Array.isArray(body.nextSteps)).toBe(true);
  return { ...result, body };
}

function expectInvalid(result: ReturnType<typeof run>) {
  expect(result.status).toBe(1);
  expect(result.stderr).toBe("");
  expect(result.body).toEqual({
    ok: false,
    version: 2,
    diagnostics: [
      { code: "educational.invalid", message: "Invalid or unsupported educational figure." },
    ],
    nextSteps: ["circuitkit-education --help"],
  });
}

beforeAll(() => {
  temporary = mkdtempSync(join(tmpdir(), "circuitkit-education-"));
  input = join(temporary, "public with spaces.json");
  authorInput = join(temporary, "author.json");
  writeFileSync(input, source);
  writeFileSync(authorInput, JSON.stringify(privacyFixture()));
});

afterAll(() => rmSync(temporary, { recursive: true, force: true }));

describe("isolated education CLI contract", () => {
  for (const args of [[], ["help"], ["--help"], ["render", "--help"], ["--json", "-h"]]) {
    test(`help ${JSON.stringify(args)} is a successful automatic JSON workflow`, () => {
      const result = run(args);
      expect(result.status).toBe(0);
      expect(result.stderr).toBe("");
      expect(result.body.help).toContain(
        "circuitkit-education project author.json --stage question --out public.json",
      );
      expect(result.body.help).toContain("NOT authorization");
      expect(result.body.help).toContain("never an author model");
      expect(result.body.help).toContain("No network or prompts");
    });
  }

  for (const model of ["author", "public"]) {
    test(`schema ${model} reflects the actual strict v2 schema`, () => {
      const result = run(["schema", model]);
      expect(result.status).toBe(0);
      expect(result.stderr).toBe("");
      expect(result.body.model).toBe(model);
      expect(result.body.schema.properties.schema.const).toBe(`circuitkit.educational.${model}.v2`);
      expect(result.body.schema.additionalProperties).toBe(false);
      expect(result.body.schema.required).toContain(model === "author" ? "stages" : "display");
      if (model === "public") expect(JSON.stringify(result.body.schema)).not.toContain('"stages"');
    });
  }

  test("schema defaults to public; --json remains output-only", () => {
    expect(run(["schema"]).body).toEqual(run(["schema", "public", "--json"]).body);
    expect(run(["schema", "--json", "{}"]).status).toBe(2);
  });

  for (const stage of ["teaching", "question", "correction"] as const) {
    test(`project ${stage} returns only the selected public document and writes reusable JSON`, () => {
      const expected = projectFigure(privacyFixture(), stage);
      if (!expected.ok) throw new Error("Invalid fixture");
      const output = join(temporary, `${stage}.json`);
      const result = run(["project", authorInput, "--stage", stage, "--out", output]);
      expect(result.status).toBe(0);
      expect(result.stderr).toBe("");
      expect(result.body.document).toEqual(expected.document);
      expect(result.body.output).toBe(output);
      expect(JSON.parse(readFileSync(output, "utf8"))).toEqual(expected.document);
      expect(result.body).not.toHaveProperty("author");
      expect(result.body.document).not.toHaveProperty("stages");
      expect(result.body.document).not.toHaveProperty("stage");
      expect(run(["validate", output]).status).toBe(0);
      const stdin = run(["project", "-", "--stage", stage], JSON.stringify(privacyFixture()));
      expect(stdin.body.document).toEqual(result.body.document);
    });
  }

  test("private unselected changes cannot alter public receipts, inspection or exports", () => {
    const author = privacyFixture();
    const before = run(["project", "-", "--stage", "question"], JSON.stringify(author));
    author.stages.teaching.title = "PRIVATE_TEACHING_SENTINEL";
    author.stages.correction.description = "PRIVATE_CORRECTION_SENTINEL";
    const after = run(["project", "-", "--stage", "question"], JSON.stringify(author));
    expect(before.stdout).toBe(after.stdout);
    for (const command of ["validate", "inspect", "render"]) {
      const first = run([command, "-"], JSON.stringify(before.body.document));
      const second = run([command, "-"], JSON.stringify(after.body.document));
      expect(first.status).toBe(0);
      expect(second.stdout).toBe(first.stdout);
      expect(second.stdout).not.toContain("PRIVATE_");
      expect(second.stdout).not.toContain("-12 V");
    }
  });

  for (const command of ["validate", "inspect", "render"]) {
    test(`${command} accepts public file/stdin and strictly refuses author or v1 input`, () => {
      const file = run([command, input]);
      const stdin = run([command, "-"], source);
      expect(file.status).toBe(0);
      expect(file.stderr).toBe("");
      expect(file.body).toEqual(stdin.body);
      expect(file.body.document).toEqual(document);
      expectInvalid(run([command, authorInput]));
      for (const data of [
        { version: 1, circuit: "PRIVATE_SENTINEL" },
        { ...document, author: "PRIVATE_SENTINEL" },
        { ...document, schema: "circuitkit.educational.author.v2" },
        {
          ...document,
          title: "PRIVATE_SENTINEL",
          targets: [{ id: "missing", label: "PRIVATE_SENTINEL", role: "reading" }],
        },
      ])
        expectInvalid(run([command, "-"], JSON.stringify(data)));
      expect(run([command, input, "--stage", "question"]).status).toBe(2);
    });
  }

  test("inspect exposes only public document, bounds and allowlisted targets", () => {
    const result = run(["inspect", input]);
    const inspected = inspectEducational(document);
    if (!inspected.ok) throw new Error("Invalid fixture");
    expect(result.body.bounds).toEqual(inspected.bounds);
    expect(result.body.targets).toEqual(inspected.targets);
    expect(Object.keys(result.body).sort()).toEqual(
      ["ok", "version", "document", "bounds", "targets", "diagnostics", "nextSteps"].sort(),
    );
    expect(result.body).not.toHaveProperty("nets");
  });

  test("SVG bytes use safe namespaced public IDs and match the core", () => {
    const output = join(temporary, "figure.svg");
    const expected = renderEducationalSVG(document, { namespace: "exercise_1" });
    if (!expected.ok) throw new Error("Invalid fixture");
    const result = run(["render", input, "--namespace", "exercise_1", "--out", output]);
    expect(result.status).toBe(0);
    expect(result.body.svg).toBe(expected.svg);
    expect(readFileSync(output, "utf8")).toBe(expected.svg);
    expect(result.body.svg).toContain('id="edu-exercise_1-title"');
    expect(result.body.svg).toContain('data-target="meter/reading"');
    expect(result.body.svg).not.toContain("PRIVATE_");
  });

  test("PNG bytes stay off stdout and the receipt contains only public metadata", async () => {
    const output = join(temporary, "figure.png");
    const expected = await renderEducationalPNG(document, { scale: 2 });
    if (!expected.ok) throw new Error("Invalid fixture");
    const result = run(["render", input, "--format", "png", "--scale", "2", "--out", output]);
    expect(result.status).toBe(0);
    expect(result.stderr).toBe("");
    expect(result.body).toMatchObject({
      format: "png",
      scale: 2,
      width: expected.width,
      height: expected.height,
      bytes: expected.png.byteLength,
      bounds: expected.bounds,
      targets: expected.targets,
      document,
    });
    expect(result.body).not.toHaveProperty("png");
    expect(result.body).not.toHaveProperty("svg");
    expect(readFileSync(output)).toEqual(Buffer.from(expected.png));
    expectInvalid(run(["render", authorInput, "--format", "png", "--out", output, "--overwrite"]));
    expect(readFileSync(output)).toEqual(Buffer.from(expected.png));
  });

  test("PNG pixel cap is input failure and does not publish", () => {
    const output = join(temporary, "oversized.png");
    const large = {
      ...document,
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
    const result = run(
      ["render", "-", "--format", "png", "--scale", "4", "--out", output],
      JSON.stringify(large),
    );
    expect(result.status).toBe(1);
    expect(result.body.diagnostics[0].code).toBe("png.pixel_limit");
    expect(result.body).not.toHaveProperty("document");
    expect(result.body).not.toHaveProperty("output");
    expect(readdirSync(temporary)).not.toContain("oversized.png");
  });
});

describe("bounded safe input and file publication", () => {
  for (const text of [
    "",
    "{PRIVATE_SENTINEL",
    '"PRIVATE_SENTINEL"',
    "[".repeat(25) + "]".repeat(25),
    JSON.stringify({ ...document, title: "PRIVATE_\ud800" }),
    " ".repeat(4 * 1024 * 1024 + 1),
  ]) {
    test(`rejects invalid stdin privately (${text.length} bytes)`, () => {
      expectInvalid(run(["validate", "-"], text));
    });
  }

  test("fatal UTF-8 validation for both files and stdin", () => {
    const bytes = Buffer.concat([
      Buffer.from('{"PRIVATE_SENTINEL":"'),
      Buffer.from([0xc3, 0x28]),
      Buffer.from('"}'),
    ]);
    const path = join(temporary, "invalid-utf8.json");
    writeFileSync(path, bytes);
    expectInvalid(run(["validate", path]));
    expectInvalid(run(["validate", "-"], bytes));
  });

  test("exact byte bound is accepted, extra byte rejected; strings do not count as nesting", () => {
    const padded = source.padEnd(4 * 1024 * 1024, " ");
    const path = join(temporary, "bounded.json");
    writeFileSync(path, padded);
    expect(run(["validate", path]).status).toBe(0);
    expect(run(["validate", "-"], padded).status).toBe(0);
    writeFileSync(path, `${padded} `);
    expectInvalid(run(["validate", path]));
    const braces = { ...document, description: '{[\\"'.repeat(24) };
    expect(run(["validate", "-"], JSON.stringify(braces)).status).toBe(0);
  });

  test("missing files and directories yield content-free IO failures", () => {
    for (const path of [join(temporary, "PRIVATE_MISSING"), temporary]) {
      const result = run(["validate", path]);
      expect(result.status).toBe(2);
      expect(result.body.diagnostics[0].code).toBe("io.read_failed");
      expect(result.stdout + result.stderr).not.toContain("PRIVATE_MISSING");
    }
  });

  for (const command of ["project", "render"]) {
    test(`${command}: atomic no-clobber, explicit replacement, symlinks and cleanup`, () => {
      const output = join(temporary, `${command}-atomic.out`);
      const target = join(temporary, `${command}-target.out`);
      const args =
        command === "project" ? [command, authorInput, "--stage", "question"] : [command, input];
      writeFileSync(target, "DO_NOT_CHANGE_TARGET");
      symlinkSync(target, output);
      const before = readdirSync(temporary).sort();
      const collision = run([...args, "--out", output]);
      expect(collision.status).toBe(2);
      expect(collision.body.diagnostics[0].code).toBe("io.destination_exists");
      expect(lstatSync(output).isSymbolicLink()).toBe(true);
      expect(readFileSync(target, "utf8")).toBe("DO_NOT_CHANGE_TARGET");
      expect(readdirSync(temporary).sort()).toEqual(before);
      const invalidArgs =
        command === "project" ? [command, "-", "--stage", "question"] : [command, "-"];
      expectInvalid(
        run([...invalidArgs, "--out", output, "--overwrite"], '{"PRIVATE_SENTINEL":true}'),
      );
      expect(lstatSync(output).isSymbolicLink()).toBe(true);
      expect(run([...args, "--out", output, "--overwrite"]).status).toBe(0);
      expect(lstatSync(output).isSymbolicLink()).toBe(false);
      expect(readFileSync(target, "utf8")).toBe("DO_NOT_CHANGE_TARGET");
      const bytes = readFileSync(output);
      expect(run([...args, "--out", output]).status).toBe(2);
      expect(readFileSync(output)).toEqual(bytes);
      expect(readdirSync(temporary).sort()).toEqual(before);
      expect(run([...args, "--out", join(temporary, "missing-parent", "out")]).status).toBe(2);
      expect(run([...args, "--out", temporary, "--overwrite"]).status).toBe(2);
      expect(readdirSync(temporary).sort()).toEqual(before);
    });
  }

  test("dangling output symlink also refuses overwrite by default", () => {
    const output = join(temporary, "dangling.svg");
    symlinkSync(join(temporary, "absent-target"), output);
    expect(run(["render", input, "--out", output]).status).toBe(2);
    expect(lstatSync(output).isSymbolicLink()).toBe(true);
    expect(readdirSync(temporary)).not.toContain("absent-target");
  });

  test("concurrent writers publish exactly one complete artifact without temp debris", async () => {
    const output = join(temporary, "race.svg");
    const before = readdirSync(temporary).sort();
    const write = () =>
      new Promise<{ status: number | null; body: { ok: boolean } }>((resolveResult, reject) => {
        const child = spawn(runtime, [cli, "render", input, "--out", output], {
          cwd: temporary,
          stdio: ["ignore", "pipe", "pipe"],
        });
        let stdout = "";
        child.stdout.setEncoding("utf8").on("data", (chunk: string) => {
          stdout += chunk;
        });
        child.stderr.resume();
        child.on("error", reject);
        child.on("close", (status) => {
          resolveResult({ status, body: JSON.parse(stdout) });
        });
      });
    const results = await Promise.all([write(), write()]);
    expect(results.map((result) => result.status).sort()).toEqual([0, 2]);
    expect(results.filter((result) => result.body.ok)).toHaveLength(1);
    const expected = renderEducationalSVG(document);
    if (!expected.ok) throw new Error("Invalid fixture");
    expect(readFileSync(output, "utf8")).toBe(expected.svg);
    expect(readdirSync(temporary).sort()).toEqual([...before, "race.svg"].sort());
  });

  test("-- terminates flags for dash-prefixed input files", () => {
    writeFileSync(join(temporary, "--json"), source);
    expect(run(["validate", "--", "--json"]).status).toBe(0);
  });
});

describe("usage validation", () => {
  for (const args of [
    ["unknown-PRIVATE_SENTINEL"],
    ["catalog"],
    ["markdown"],
    ["schema", "wrong"],
    ["schema", "public", "extra"],
    ["project", "-"],
    ["project", "-", "--stage", "wrong"],
    ["validate"],
    ["validate", "-", "extra"],
    ["validate", "-", "--namespace", "x"],
    ["inspect", "-", "--format", "png"],
    ["project", "-", "--stage", "question", "--format", "svg"],
    ["schema", "--out", "x"],
    ["render", "-", "--scale", "2"],
    ["render", "-", "--format", "png"],
    ["render", "-", "--format", "jpg"],
    ["render", "-", "--out", "-"],
    ["render", "-", "--out="],
    ["render", "-", "--overwrite"],
    ["render", "-", "--namespace", 'PRIVATE_"/><script>'],
    ["render", "-", "--namespace", "1bad"],
    ["render", "-", "--namespace", "x".repeat(65)],
    ["render", "-", "--format", "png", "--out", "x", "--namespace", "x"],
    ["render", "-", "--format", "png", "--out", "x", "--scale", "0"],
    ["render", "-", "--format", "png", "--out", "x", "--scale", "5"],
    ["render", "-", "--format", "png", "--out", "x", "--scale", "1.5"],
    ["render", "-", "--format", "png", "--out", "x", "--scale", "02"],
    ["render", "-", "--out"],
    ["render", "-", "--json", "--json"],
    ["render", "-", "--figure"],
    ["render", "-", "--schematic"],
    ["render", "-", "--block", "1"],
  ]) {
    test(JSON.stringify(args), () => {
      const result = run(args, source);
      expect(result.status).toBe(2);
      expect(result.body.ok).toBe(false);
      expect(result.body.diagnostics[0].code).toBe("cli.usage");
      expect(result.stdout + result.stderr).not.toContain("PRIVATE_");
      expect(result.body).not.toHaveProperty("document");
    });
  }
});
