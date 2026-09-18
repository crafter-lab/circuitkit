import { expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import cueva from "../examples/diagrams/cueva.json";
import { compileDiagram, renderDiagramSVG } from "../src/diagram/index.ts";
import { renderCircuitMarkdown } from "../src/markdown.ts";
import { renderEducationalPNG } from "../src/v2/png.ts";

const pair = (from: string, to: string) => [from, to].sort().join("|");

const expected = (
  [
    ["ESP32.3V3", "OLED.VCC"],
    ["ESP32.GND", "OLED.GND"],
    ["ESP32.GPIO23", "OLED.SDA"],
    ["ESP32.GPIO22", "OLED.SCL"],
    ["ESP32.5V/VIN", "MAX98357.VIN"],
    ["ESP32.GND", "MAX98357.GND"],
    ["ESP32.GPIO26", "MAX98357.BCLK"],
    ["ESP32.GPIO25", "MAX98357.LRC/WS"],
    ["ESP32.GPIO27", "MAX98357.DIN"],
    ["MAX98357.SPK+", "Speaker.+"],
    ["MAX98357.SPK−", "Speaker.−"],
    ["USB.power", "ESP32.USB"],
  ] as const
)
  .map(([from, to]) => pair(from, to))
  .sort();

test("Cueva is data only, preserves eleven pin links plus opaque USB, and generates all views", async () => {
  const before = JSON.stringify(cueva);
  expect(cueva.connections.map((edge) => pair(edge.from, edge.to)).sort()).toEqual(expected);
  expect(before).not.toMatch(/"(?:x|y|at|points|shapes|layout|display)"\s*:/);
  const baseline = compileDiagram(cueva);
  if (!baseline.ok) throw new Error(JSON.stringify(baseline));
  expect(baseline.semantics.nets).toHaveLength(11);
  const plus = baseline.semantics.nets.find((net) => net.pins.includes("MAX98357.SPK+"));
  const minus = baseline.semantics.nets.find((net) => net.pins.includes("MAX98357.SPK−"));
  expect(plus?.pins).toEqual(["MAX98357.SPK+", "Speaker.+"]);
  expect(minus?.pins).toEqual(["MAX98357.SPK−", "Speaker.−"]);
  const bytes = new Set<string>();
  for (const view of ["blocks", "wiring", "schematic"] as const) {
    for (const theme of ["geist-light", "geist-dark", "geist-print"] as const) {
      const result = renderDiagramSVG(cueva, { view, theme });
      if (!result.ok) throw new Error(JSON.stringify(result));
      expect(result.semantics).toEqual(baseline.semantics);
      expect(result.classification).toEqual({
        kind: "module-diagram",
        view,
        connectivity: "declared",
      });
      expect(result.document.view).toBe("schematic");
      expect(result.figure.theme).toBe(theme);
      const png = await renderEducationalPNG(result.figure);
      if (!png.ok) throw new Error(JSON.stringify(png));
      expect(Buffer.from(png.png).subarray(0, 8).toString("hex")).toBe("89504e470d0a1a0a");
      bytes.add(result.svg);
    }
  }
  expect(bytes.size).toBe(9);
  expect(JSON.stringify(cueva)).toBe(before);
});

test("Cueva Markdown defaults to schematic and projects all views from unchanged data", () => {
  const path = new URL("../examples/diagrams/cueva.md", import.meta.url);
  const source = readFileSync(path, "utf8");
  const initial = renderCircuitMarkdown(source);
  const direct = renderDiagramSVG(cueva);
  if (!initial.ok || !direct.ok) throw new Error("Invalid Cueva example");
  expect(initial.figures).toHaveLength(1);
  const first = initial.figures[0];
  expect(first?.classification?.view).toBe("schematic");
  expect(first?.document).toEqual(direct.document);
  expect(first?.svg).toBe(direct.svg);
  for (const view of ["schematic", "wiring", "blocks"] as const) {
    const result = renderCircuitMarkdown(source, { view });
    const expected = renderDiagramSVG(cueva, { view });
    if (!result.ok || !expected.ok) throw new Error("Invalid view projection");
    const figure = result.figures[0];
    expect(figure?.classification?.view).toBe(view);
    expect(figure?.document).toEqual(first?.document);
    expect(figure?.document).toHaveProperty("view", "schematic");
    expect(figure?.semantics).toEqual(first?.semantics);
    expect(figure?.svg).toBe(expected.svg);
    const text = figure?.figure?.display
      .flatMap((part) =>
        part.shapes.flatMap((shape) =>
          shape.kind === "math" ? shape.runs.map((run) => run.text) : [],
        ),
      )
      .join(" ");
    if (view === "blocks") expect(text).not.toContain("GPIO23");
    else expect(text).toContain("GPIO23");
  }
  expect(readFileSync(path, "utf8")).toBe(source);
});

test("the portable sensor Markdown example is a different graph with the same language", () => {
  const source = readFileSync(new URL("../examples/diagrams/sensor.md", import.meta.url), "utf8");
  for (const view of ["blocks", "wiring", "schematic"] as const) {
    const result = renderCircuitMarkdown(source, { view });
    if (!result.ok) throw new Error(JSON.stringify(result));
    expect(result.figures).toHaveLength(1);
    expect(result.figures[0]?.classification?.view).toBe(view);
    expect(result.figures[0]?.semantics?.nets).toHaveLength(4);
    expect(result.figures[0]?.document).not.toHaveProperty("display");
  }
});

test("the compiler does not special-case example hardware names", () => {
  for (const file of [
    "index.ts",
    "schema.ts",
    "layout.ts",
    "connected-layout.ts",
    "routing.ts",
    "semantics.ts",
  ]) {
    const source = readFileSync(new URL(`../src/diagram/${file}`, import.meta.url), "utf8");
    expect(source).not.toMatch(/Cueva|ESP32|MAX98357|GPIO23|OLED/);
  }
});
