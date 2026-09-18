import { expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import {
  compileCircuitSource,
  formatCircuitSource,
  renderCircuitSource,
  resolveCircuitSource,
} from "../src/language/index.ts";
import { renderCircuitMarkdown } from "../src/markdown.ts";

const cueva = readFileSync(
  new URL("../examples/diagrams/cueva-presentation.ck", import.meta.url),
  "utf8",
);
const base = cueva.slice(0, cueva.indexOf("presentation {"));
const source = (body: string) => `${base}\npresentation {\n${body}\n}\n`;
const scene = (body: string) => source(`scene demo "Demo" {\n${body}\n}`);

test("Cueva presentation resolves named sections without changing nets or exported SVG", () => {
  const plain = renderCircuitSource(base),
    animated = renderCircuitSource(cueva);
  expect(plain.ok && animated.ok).toBe(true);
  if (!plain.ok || !animated.ok) return;
  expect(animated.svg).toBe(plain.svg);
  expect(animated.figure).toEqual(plain.figure);
  expect(animated.system).toEqual(plain.system);
  expect(animated.semantics).toEqual(plain.semantics);
  const sending = animated.presentation?.scenes[0];
  expect(sending?.unavailable).toEqual([]);
  expect(sending?.flows).toHaveLength(3);
  expect(sending?.targets).toHaveLength(5);
  expect(sending?.flows.every((flow) => flow.periodMs === 2000 && flow.points.length >= 2)).toBe(
    true,
  );
  expect(animated.presentation?.scenes).toHaveLength(3);
});

test("format preserves presentation, validates it and is idempotent", () => {
  const formatted = formatCircuitSource(cueva);
  expect(formatted.ok).toBe(true);
  if (!formatted.ok) return;
  const second = formatCircuitSource(formatted.source);
  expect(second).toEqual(formatted);
  const result = renderCircuitSource(formatted.source);
  expect(result.ok).toBe(true);
  if (result.ok)
    expect(
      result.presentation?.scenes.map((scene) => [
        scene.id,
        scene.targets.length,
        scene.flows.length,
      ]),
    ).toEqual([
      ["sending", 5, 3],
      ["power", 6, 0],
      ["output", 4, 0],
    ]);
});

for (const [name, body] of [
  ["unknown module", "highlight module Nope"],
  ["unknown port", "highlight port ESP32.GPIO99"],
  ["unknown bus", "highlight bus Missing"],
  ["unknown section", "highlight section Missing"],
  ["nonexistent connection", "highlight link ESP32.GPIO26 -- OLED.SDA"],
  ["bidirectional default", "flow bus I2C {\nperiod 2s\n}"],
  ["undirected default", "flow link ESP32.3V3 -- OLED.VCC {\nperiod 2s\n}"],
  ["conflicting direction", "flow bus I2S {\ndirection reverse\n}"],
  ["invalid style", "flow bus I2S {\nstyle particles\n}"],
  ["short period", "flow bus I2S {\nperiod 499ms\n}"],
  ["large period", "flow bus I2S {\nperiod 31s\n}"],
  ["invalid period", "flow bus I2S {\nperiod NaN\n}"],
  ["duplicate field", "flow bus I2S {\nperiod 2s\nperiod 3s\n}"],
  ["overlapping flows", "flow bus I2S { }\nflow link ESP32.GPIO26 -- MAX98357.BCLK { }"],
  ["implicit path", "flow module ESP32 { }"],
  ["scripts", "execute evil"],
  ["empty scene", ""],
] as const)
  test(`rejects ${name} with source range`, () => {
    const result = compileCircuitSource(scene(body));
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.diagnostics[0]?.range?.start.line).toBeGreaterThan(1);
      expect(result.diagnostics[0]?.code).toMatch(/^language\./);
    }
  });

test("validates unused sections and rejects nested/duplicate names and blocks", () => {
  for (const text of [
    source("section unused {\nmodule Nope\n}\nscene a {\nhighlight module ESP32\n}"),
    source("section a {\nsection a\n}\nscene a {\nhighlight module ESP32\n}"),
    source(
      "section a {\nmodule ESP32\n}\nsection a {\nmodule OLED\n}\nscene a {\nhighlight module ESP32\n}",
    ),
    source("scene a {\nhighlight module ESP32\n}\nscene a {\nhighlight module OLED\n}"),
    `${cueva}\npresentation {\nscene b {\nhighlight module USB\n}\n}`,
  ])
    expect(resolveCircuitSource(text).ok).toBe(false);
});

test("flow uses authored direction even when canonical endpoints sort in the opposite order", () => {
  const text = `circuit direction v1\ntitle "Direction"\nZ: module (out)\nA: module (in)\nbus B {\n Z.out -> A.in\n}\npresentation {\nscene a {\nflow bus B { }\n}\n}`;
  const result = renderCircuitSource(text);
  expect(result.ok).toBe(true);
  if (!result.ok) return;
  const flow = result.presentation?.scenes[0]?.flows[0],
    route = result.routes[0];
  expect(route?.from).toBe("A.in");
  expect(flow?.points).toEqual([...(route?.points ?? [])].reverse());
});

test("explicit direction enables undirected and bidirectional links without inferring current", () => {
  for (const direction of ["forward", "reverse"]) {
    const result = renderCircuitSource(
      scene(`flow bus I2C {\ndirection ${direction}\nperiod 500ms\n}`),
    );
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.presentation?.scenes[0]?.flows).toHaveLength(2);
  }
});

test("blocks disable per-wire animation with a reason but retain static scenes", () => {
  const result = renderCircuitSource(cueva, { view: "blocks" });
  expect(result.ok).toBe(true);
  if (!result.ok) return;
  expect(result.presentation?.scenes[0]?.unavailable.join(" ")).toContain("aggregate");
  expect(result.presentation?.scenes[0]?.flows).toHaveLength(0);
  expect(result.presentation?.scenes[1]?.unavailable).toEqual([]);
});

test("Markdown preserves scene plans and maps invalid presentation ranges into the document", () => {
  const result = renderCircuitMarkdown(`# Lesson\n\n\`\`\`circuitkit\n${cueva}\`\`\`\n`);
  expect(result.ok).toBe(true);
  if (result.ok) expect(result.figures[0]?.presentation?.scenes).toHaveLength(3);
  const bad = renderCircuitMarkdown(
    `# Lesson\n\n\`\`\`circuitkit\n${scene("highlight module Nope")}\`\`\`\n`,
  );
  expect(bad.ok).toBe(false);
  if (!bad.ok) expect(bad.diagnostics[0]?.range?.start.line).toBeGreaterThan(30);
});

test("presentation budgets stop excess scenes and selections", () => {
  expect(
    compileCircuitSource(
      source(
        Array.from({ length: 17 }, (_, i) => `scene s${i} {\nhighlight module ESP32\n}`).join("\n"),
      ),
    ).ok,
  ).toBe(false);
  expect(
    compileCircuitSource(
      scene(Array.from({ length: 257 }, () => "highlight module ESP32").join("\n")),
    ).ok,
  ).toBe(false);
});

test("hierarchy resolves scoped buses and aliases, reporting projection omissions without fake wires", () => {
  const text = `circuit nested v1\ntitle "Nested"\ndefine Unit (in out) {\nA: module (p)\nB: module (p)\nbus data {\nA.p -> B.p\n}\nexpose in = A.p\nexpose out = B.p\n}\nu: Unit\npresentation {\nsection stage {\nmodule u/A\nport u.in\nbus u/data\n}\nscene send {\nhighlight section stage\nflow bus u/data { }\n}\n}`;
  const expanded = renderCircuitSource(text),
    collapsed = renderCircuitSource(text, { detail: "interface" }),
    scoped = renderCircuitSource(text, { scope: "u" });
  expect(expanded.ok && collapsed.ok && scoped.ok).toBe(true);
  if (expanded.ok) expect(expanded.presentation?.scenes[0]?.unavailable).toEqual([]);
  if (collapsed.ok)
    expect(collapsed.presentation?.scenes[0]?.unavailable.length).toBeGreaterThan(0);
  if (scoped.ok) expect(scoped.presentation?.scenes[0]?.flows).toHaveLength(1);
});
