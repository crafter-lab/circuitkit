import { afterAll, expect, test } from "bun:test";
import { spawnSync } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import {
  languageGrammar,
  renderCircuitSource,
  resolveCircuitSource,
} from "../src/language/index.ts";

const root = resolve(import.meta.dir, "..");
const entry = process.env.CIRCUITKIT_TEST_CLI ?? join(root, "src/cli.ts");
const runtime = process.env.CIRCUITKIT_TEST_RUNTIME ?? process.execPath;
const temporary = mkdtempSync(join(tmpdir(), "circuitkit-language-"));
afterAll(() => rmSync(temporary, { recursive: true, force: true }));
const source = readFileSync(join(root, "examples/diagrams/cueva.ck"), "utf8");
const hierarchy = readFileSync(join(root, "examples/diagrams/audio-system.ck"), "utf8");
function run(args: string[], input = "") {
  const result = spawnSync(runtime, [entry, ...args], {
    cwd: root,
    input,
    encoding: "utf8",
    maxBuffer: 16 * 1024 * 1024,
  });
  expect(result.error).toBeUndefined();
  expect(result.signal).toBeNull();
  expect(result.stdout).not.toContain("\u001b");
  const data = JSON.parse(result.stdout);
  expect(Array.isArray(data.diagnostics)).toBe(true);
  expect(Array.isArray(data.nextSteps)).toBe(true);
  return { ...result, data };
}

test("grammar discovery is versioned and available without an input file", () => {
  const result = run(["grammar", "--json"]);
  expect(result.status).toBe(0);
  expect(result.data.grammar).toEqual(languageGrammar);
  expect(run(["grammar", "unexpected"]).status).toBe(2);
});

for (const view of ["blocks", "wiring", "schematic"] as const) {
  test(`raw source ${view} matches the public SVG API`, () => {
    const result = run(["render", "-", "--view", view, "--json"], source);
    const expected = renderCircuitSource(source, { view });
    if (!expected.ok) throw new Error(JSON.stringify(expected));
    expect(result.status).toBe(0);
    expect(result.data.svg).toBe(expected.svg);
    expect(result.data.document.view).toBe("schematic");
    expect(result.data.classification.view).toBe(view);
    expect(result.data.system).toEqual(expected.system);
    expect(run(["validate", "-", "--view", view], source).status).toBe(0);
    expect(run(["inspect", "-", "--view", view], source).data).not.toHaveProperty("svg");
  });

  test(`Markdown ${view} preserves hierarchy metadata and supports native PNG`, () => {
    const markdown = `# Example\n\n\`\`\`circuitkit\n${source}\`\`\`\n`;
    const result = run(["render", "-", "--block", "1", "--view", view], markdown);
    expect(result.status).toBe(0);
    expect(result.data.language).toBe("circuitkit.source.v1");
    expect(result.data.system.schema).toBe("circuitkit.system.v1");
    expect(result.data.selection.scope).toBe("");
    const output = join(temporary, `${view}.png`);
    const png = run(
      ["render", "-", "--block", "1", "--view", view, "--format", "png", "--out", output],
      markdown,
    );
    expect(png.status).toBe(0);
    expect(readFileSync(output).subarray(0, 8).toString("hex")).toBe("89504e470d0a1a0a");
    expect(png.data).not.toHaveProperty("png");
    expect(png.data.selection.scope).toBe("");
  });
}

test("expand resolves reusable definitions without requiring a full-system drawing", () => {
  const result = run(["expand", "-", "--json"], hierarchy);
  const expected = resolveCircuitSource(hierarchy);
  if (!expected.ok) throw new Error(JSON.stringify(expected));
  expect(result.status).toBe(0);
  expect(result.data.system).toEqual(expected.system);
  expect(result.data).not.toHaveProperty("svg");
  const output = join(temporary, "system.json");
  expect(run(["expand", "-", "--out", output], hierarchy).status).toBe(0);
  expect(JSON.parse(readFileSync(output, "utf8"))).toEqual(expected.system);
  expect(run(["expand", "-", "--out", output], hierarchy).status).toBe(2);
});

test("scope and interface render independently from the complete resolved system", () => {
  for (const args of [
    ["--scope", "audio"],
    ["--detail", "interface"],
    ["--scope", "audio", "--detail", "interface"],
  ]) {
    const result = run(["render", "-", ...args], hierarchy);
    expect(result.status).toBe(0);
    expect(result.data.system.nodes).toHaveLength(4);
    if (args.includes("--scope")) expect(result.data.selection.boundaryPorts).toHaveLength(7);
    const markdown = `\`\`\`circuitkit\n${hierarchy}\`\`\`\n`;
    const fromMarkdown = run(["render", "-", "--block", "1", ...args], markdown);
    expect(fromMarkdown.status).toBe(0);
    expect(fromMarkdown.data.selection).toEqual(result.data.selection);
    expect(fromMarkdown.data.svg).toBe(result.data.svg);
  }
});

test("format round-trips and never overwrites source or an existing output implicitly", () => {
  const result = run(["format", "-"], hierarchy);
  expect(result.status).toBe(0);
  expect(result.data.source).toStartWith("circuit audio_system v1\n");
  const next = run(["format", "-"], result.data.source);
  expect(next.data.source).toBe(result.data.source);
  const output = join(temporary, "formatted.ck");
  expect(run(["format", "-", "--out", output], hierarchy).status).toBe(0);
  const old = readFileSync(output);
  expect(run(["format", "-", "--out", output], source).status).toBe(2);
  expect(readFileSync(output)).toEqual(old);
  const invalid = hierarchy.replace("amp.VIN", "amp.absent");
  expect(run(["format", "-", "--out", output, "--overwrite"], invalid).status).toBe(1);
  expect(readFileSync(output)).toEqual(old);
  expect(run(["format", "-", "--out", output, "--overwrite"], source).status).toBe(0);
});

test("invalid source is located, does not mutate files and never returns partial data", () => {
  const output = join(temporary, "must-not-exist.svg");
  const invalid = source.replace("OLED.SDA", "OLED.wrong");
  const result = run(["render", "-", "--out", output], invalid);
  expect(result.status).toBe(1);
  expect(result.data).not.toHaveProperty("svg");
  expect(result.data).not.toHaveProperty("system");
  expect(result.data.diagnostics[0].range.start.line).toBeGreaterThan(1);
  expect(existsSync(output)).toBe(false);
  const markdown = `# Text\n\n\`\`\`circuitkit\n${invalid}\`\`\`\n`;
  const located = run(["render", "-", "--block", "1"], markdown);
  const range = located.data.diagnostics[0].range;
  expect(markdown.slice(range.start.offset, range.end.offset)).toBe("OLED.wrong");
});

for (const args of [
  ["grammar", "--scope", "audio"],
  ["format", "-", "--block", "1"],
  ["format", "-", "--view", "blocks"],
  ["expand", "-", "--format", "png"],
  ["render", "-", "--detail", "all"],
  ["render", "-", "--scope", "audio", "--scope", "audio"],
  ["render", "-", "--figure"],
  ["render", "-", "--schematic"],
])
  test(`invalid source flag combination: ${args.join(" ")}`, () =>
    expect(run(args, hierarchy).status).toBe(2));

test("source-only projection flags reject JSON and invalid scope paths", () => {
  const json = readFileSync(join(root, "examples/diagrams/cueva.json"), "utf8");
  expect(run(["render", "-", "--scope", "audio"], json).status).toBe(2);
  expect(run(["render", "-", "--scope", "../audio"], hierarchy).status).toBe(1);
  expect(run(["render", "-", "--scope", "missing"], hierarchy).status).toBe(1);
});

test("presentation CLI preserves plans, canonical source and deterministic base exports", () => {
  const text = readFileSync(join(root, "examples/diagrams/cueva-presentation.ck"), "utf8");
  const inspected = run(["inspect", "-"], text);
  expect(inspected.status).toBe(0);
  expect(inspected.data.presentation.scenes).toHaveLength(3);
  expect(inspected.data.presentation.scenes[0].flows).toHaveLength(3);
  const formatted = run(["format", "-"], text);
  expect(formatted.status).toBe(0);
  expect(formatted.data.source).toContain("period 2000ms");
  const rendered = run(["render", "-"], text);
  const plain = run(["render", "-"], text.slice(0, text.indexOf("presentation {")));
  expect(rendered.status).toBe(0);
  expect(rendered.data.svg).toBe(plain.data.svg);
  expect(
    run(["validate", "-"], text.replace("highlight section audio", "highlight section absent"))
      .status,
  ).toBe(1);
  const file = join(temporary, "presentation-base.png");
  expect(run(["render", "-", "--format", "png", "--out", file], text).status).toBe(0);
  expect(readFileSync(file).subarray(0, 8).toString("hex")).toBe("89504e470d0a1a0a");
});
