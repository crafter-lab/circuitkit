import { expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import cueva from "../examples/diagrams/cueva.json";
import { renderDiagramSVG } from "../src/diagram/index.ts";
import {
  compileCircuitSource,
  formatCircuitSource,
  isCircuitSource,
  languageGrammar,
  parseCircuitSource,
  renderCircuitSource,
  resolveCircuitSource,
} from "../src/language/index.ts";
import type { SourceOptions } from "../src/language/types.ts";
import { renderEducationalPNG } from "../src/v2/png.ts";

const simple = `circuit sample v1
title "Sample"
a: module (p q)
b: module (p q)
a.p -- b.p
`;
const source = readFileSync(new URL("../examples/diagrams/cueva.ck", import.meta.url), "utf8");
const hierarchy = readFileSync(
  new URL("../examples/diagrams/audio-system.ck", import.meta.url),
  "utf8",
);
function clean(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(clean);
  if (value && typeof value === "object")
    return Object.fromEntries(
      Object.entries(value)
        .filter(([key]) => key !== "range")
        .map(([key, item]) => [key, clean(item)]),
    );
  return value;
}
function failed(text: string, code?: string) {
  for (const result of [
    resolveCircuitSource(text),
    compileCircuitSource(text),
    renderCircuitSource(text),
    formatCircuitSource(text),
  ]) {
    expect(result.ok).toBe(false);
    expect(result).not.toHaveProperty("svg");
    expect(result).not.toHaveProperty("figure");
    expect(result).not.toHaveProperty("system");
    if (result.ok) throw new Error("Expected failure");
    if (code) expect(result.diagnostics.some((d) => d.code.includes(code))).toBe(true);
    expect(result.diagnostics[0]?.message.length).toBeGreaterThan(0);
  }
}

test("bus-grouped Cueva exactly preserves normalized JSON and SVG/PNG in all views and themes", async () => {
  for (const view of ["blocks", "wiring", "schematic"] as const)
    for (const theme of ["geist-light", "geist-dark", "geist-print"] as const) {
      const actual = renderCircuitSource(source, { view, theme });
      const expected = renderDiagramSVG(cueva, { view, theme });
      if (!actual.ok || !expected.ok) throw new Error(JSON.stringify({ actual, expected }));
      expect(actual.document).toEqual(expected.document);
      expect(actual.figure).toEqual(expected.figure);
      expect(actual.svg).toBe(expected.svg);
      expect(actual.targets).toEqual(expected.targets);
      expect(actual.semantics).toEqual(expected.semantics);
      expect(actual.system.nets).toHaveLength(11);
      expect(actual.selection.scope).toBe("");
      const png = await renderEducationalPNG(actual.figure);
      const original = await renderEducationalPNG(expected.figure);
      if (!png.ok || !original.ok) throw new Error("PNG failed");
      expect(png.png).toEqual(original.png);
    }
});

test("canonical formatting preserves semantic data, quoted ports, labels and endpoint ordering", () => {
  for (const original of [
    source,
    hierarchy,
    simple.replace("a: module (p q)", 'a: module (p as "Input" q)'),
    simple.replaceAll("a.p", 'a."--"').replace("a: module (p q)", 'a: module ("--" "as" q)'),
  ]) {
    const formatted = formatCircuitSource(original);
    expect(formatted.ok).toBe(true);
    if (!formatted.ok) throw new Error(JSON.stringify(formatted));
    expect(formatCircuitSource(formatted.source)).toEqual(formatted);
    const first = resolveCircuitSource(original),
      second = resolveCircuitSource(formatted.source);
    if (!first.ok || !second.ok) throw new Error("Round-trip failure");
    expect(clean(second.system)).toEqual(clean(first.system));
  }
});

test("keywords may be module identities without being interpreted as statements", () => {
  for (const name of [
    "title",
    "view",
    "theme",
    "bus",
    "expose",
    "define",
    "power",
    "audio",
    "constructor",
  ]) {
    const result = resolveCircuitSource(
      simple.replaceAll("a:", `${name}:`).replaceAll("a.p", `${name}.p`),
    );
    expect(result.ok).toBe(true);
  }
});

test("comments, CRLF and multiline port lists retain precise source ranges", () => {
  const value =
    '# introductory comment\r\ncircuit test v1\r\ntitle "Hash # in string"\r\na: module (\r\n p\r\n)\r\nb: module (p)\r\na.p -- b.wrong\r\n';
  const result = resolveCircuitSource(value);
  expect(result.ok).toBe(false);
  if (result.ok) throw new Error("Expected invalid endpoint");
  const diagnostic = result.diagnostics[0];
  expect(diagnostic?.range?.start).toEqual({
    line: 8,
    column: 8,
    offset: value.indexOf("b.wrong"),
  });
  expect(value.slice(diagnostic?.range?.start.offset, diagnostic?.range?.end.offset)).toBe(
    "b.wrong",
  );
  expect(diagnostic?.validPins).toEqual(["b.p"]);
});

test("header recognition is not a validity check or a JSON fallback", () => {
  expect(isCircuitSource(source)).toBe(true);
  expect(isCircuitSource("# note\ncircuit missing v8")).toBe(true);
  for (const text of [
    '{"circuit":"v1"}',
    "circuits abc v1",
    "",
    "https://example.test",
    "console.log(1)",
  ])
    expect(isCircuitSource(text)).toBe(false);
  expect(parseCircuitSource(simple).ok).toBe(true);
  expect(parseCircuitSource(simple.replace("b.p", "b.wrong")).ok).toBe(true);
  expect(resolveCircuitSource(simple.replace("b.p", "b.wrong")).ok).toBe(false);
});

for (const [name, value, code] of [
  ["unsupported version", simple.replace("v1", "v2"), "version"],
  ["missing title", simple.replace('title "Sample"\n', ""), "title"],
  ["duplicate title", `${simple}title "Other"\n`, "duplicate"],
  ["bad view", `${simple}view pcb\n`, "view"],
  ["bad theme", `${simple}theme transparent\n`, "theme"],
  ["unknown module kind", simple.replace("a: module", "a: widget"), "type"],
  ["implicit ports", simple.replace("a: module (p q)", "a: module"), "ports"],
  ["duplicate module", `${simple}a: module ()\n`, "duplicate"],
  ["unknown endpoint", simple.replace("a.p -- b.p", "a.p -- b.missing"), "reference"],
  ["self endpoint", simple.replace("a.p -- b.p", "a.p -- a.p"), "self_endpoint"],
  ["duplicate reversed edge", `${simple}b.p -- a.p\n`, "duplicate"],
  ["open ports", simple.replace("(p q)", "(p q"), "syntax"],
  ["open bus", `${simple}bus I2C {\na.q -- b.q\n`, "syntax"],
  ["unclosed string", simple.replace('"Sample"', '"Sample'), "string"],
  ["bad string escape", simple.replace('"Sample"', '"bad\\q"'), "string"],
  ["unsupported positional mapping", `${simple}bus I2C a -> b {\np:q\n}\n`, "syntax"],
  ["no expression execution", `${simple}import "https://example.test"\n`, "syntax"],
  ["no placement directives", `${simple}position a (10 20)\n`, "syntax"],
  ["root exposure", `${simple}expose p = a.p\n`, "scope"],
] as const)
  test(name, () => failed(value, code));

test("Unicode minus is an exact quoted port, not silently changed into ASCII hyphen", () => {
  const value =
    'circuit polarity v1\ntitle "Polarity"\na: module ("SPK−")\nb: module ("−")\na."SPK−" -- b."−"\n';
  expect(resolveCircuitSource(value).ok).toBe(true);
  failed(value.replace('b."−"\n', "b.-\n"), "reference");
});

test("definitions resolve public aliases and preserve full-system connectivity under scope/detail changes", () => {
  const base = resolveCircuitSource(hierarchy);
  if (!base.ok) throw new Error(JSON.stringify(base));
  expect(base.system.nodes.find((n) => n.path === "audio")?.kind).toBe("assembly");
  expect(base.system.aliases).toContainEqual(
    expect.objectContaining({ from: "audio.OUT-", to: "audio/amp.SPK−" }),
  );
  for (const options of [
    {},
    { detail: "interface" },
    { scope: "audio" },
    { scope: "audio", detail: "interface" },
  ] as const) {
    const result = renderCircuitSource(hierarchy, options);
    if (!result.ok) throw new Error(JSON.stringify(result));
    expect(result.system).toEqual(base.system);
    expect(result.selection.scope).toBe(options.scope ?? "");
    if (options.scope) {
      expect(result.selection.boundaryPorts).toHaveLength(7);
      expect(
        result.document.modules.some((m) => m.label === "External interface (not hardware)"),
      ).toBe(true);
    }
  }
});

test("interface projections explicitly mark omitted internals while retaining the complete system nets", () => {
  const value =
    'circuit summary v1\ntitle "Summary"\ndefine Join (A B) {\n m: module (a b)\n m.a -- m.b\n expose A = m.a\n expose B = m.b\n}\nu: Join\na: module (p)\nb: module (p)\na.p -- u.A\nu.B -- b.p\n';
  const full = renderCircuitSource(value);
  const summary = renderCircuitSource(value, { detail: "interface" });
  if (!full.ok || !summary.ok) throw new Error("Invalid summary fixture");
  expect(summary.system).toEqual(full.system);
  expect(summary.system.nets).toHaveLength(1);
  expect(summary.selection.omittedInternalConnections).toBe(1);
  expect(summary.document.title).toEndWith(" / interfaces");
});

test("two instances have distinct stable leaf identities and no accidental net joins", () => {
  const value =
    'circuit units v1\ntitle "Units"\ndefine Unit (P) {\n leaf: module (p)\n expose P = leaf.p\n}\na: Unit\nb: Unit\n';
  const result = renderCircuitSource(value);
  if (!result.ok) throw new Error(JSON.stringify(result));
  expect(result.document.modules).toHaveLength(2);
  expect(new Set(result.document.modules.map((m) => m.id)).size).toBe(2);
  expect(result.system.nets).toHaveLength(2);
  expect(Object.values(result.selection.modulePaths)).toEqual(["a/leaf", "b/leaf"]);
  expect(renderCircuitSource(value)).toEqual(result);
});

test("nested definitions expose only their declared interfaces", () => {
  const value =
    'circuit nested v1\ntitle "Nested"\ndefine Leaf (P) {\n m: module (p)\n expose P = m.p\n}\ndefine Group (X) {\n unit: Leaf\n expose X = unit.P\n}\ng: Group\n';
  const result = resolveCircuitSource(value);
  if (!result.ok) throw new Error(JSON.stringify(result));
  expect(result.system.aliases.find((a) => a.from === "g.X")?.to).toBe("g/unit/m.p");
  expect(renderCircuitSource(value, { scope: "g/unit" }).ok).toBe(true);
  expect(renderCircuitSource(value, { scope: "g", detail: "interface" }).ok).toBe(true);
});

for (const [name, value, code] of [
  ["missing exposure", "define Unit (P) {\n m: module (p)\n}\nu: Unit", "exposure"],
  [
    "duplicate exposure",
    "define Unit (P) {\n m: module (p)\n expose P = m.p\n expose P = m.p\n}\nu: Unit",
    "duplicate",
  ],
  [
    "unknown exposure",
    "define Unit (P) {\n m: module (p)\n expose P = m.wrong\n}\nu: Unit",
    "reference",
  ],
  ["recursive definition", "define Unit () {\n u: Unit\n}\nu: Unit", "recursive_definition"],
  [
    "unused invalid definition",
    "define Unit (P) {\n m: module (p)\n expose P = m.wrong\n}\na: module ()",
    "reference",
  ],
  ["instance ports redeclared", "define Unit () {\n m: module ()\n}\nu: Unit (p)", "ports"],
  [
    "duplicate after aliases",
    "define Unit (P Q) {\n m: module (p)\n expose P = m.p\n expose Q = m.p\n}\nu: Unit\na: module (p)\na.p -- u.P\na.p -- u.Q",
    "duplicate",
  ],
  [
    "aliases resolve same endpoint",
    "define Unit (P Q) {\n m: module (p)\n expose P = m.p\n expose Q = m.p\n}\nu: Unit\nu.P -- u.Q",
    "self_endpoint",
  ],
] as const)
  test(name, () => failed(`circuit bad v1\ntitle "Bad"\n${value}\n`, code));

test("unused definitions are checked after alias expansion, not just by surface references", () => {
  const value =
    'circuit unused v1\ntitle "Unused"\ndefine Inner (A B) {\n m: module (p)\n expose A = m.p\n expose B = m.p\n}\ndefine Unused () {\n u: Inner\n u.A -- u.B\n}\nroot: module ()\n';
  failed(value, "self_endpoint");
});

test("a large valid hierarchical system can be inspected and selected without lifting drawing caps", () => {
  const value = `circuit many v1\ntitle "Many"\ndefine Unit (P) {\n m: module (p)\n expose P = m.p\n}\n${Array.from({ length: 24 }, (_, i) => `u${i}: Unit`).join("\n")}\n`;
  const resolved = resolveCircuitSource(value);
  if (!resolved.ok) throw new Error(JSON.stringify(resolved));
  expect(resolved.system.nodes).toHaveLength(48);
  expect(compileCircuitSource(value).ok).toBe(false);
  expect(renderCircuitSource(value, { scope: "u17" }).ok).toBe(true);
  expect(formatCircuitSource(value).ok).toBe(true);
});

test("finite source, definition and expansion limits fail closed", () => {
  failed(" ".repeat(65537), "budget");
  const definitions = Array.from(
    { length: 9 },
    (_, i) => `define D${i} () {\n ${i === 0 ? "m: module ()" : `u: D${i - 1}`}\n}`,
  ).join("\n");
  failed(`circuit deep v1\ntitle "Deep"\n${definitions}\na: module ()\n`, "budget");
  const wide = Array.from({ length: 17 }, (_, i) => `i${i}: Unit`).join("\n");
  failed(
    `circuit growth v1\ntitle "Growth"\ndefine Unit () {\n${Array.from({ length: 16 }, (_, i) => `m${i}: module ()`).join("\n")}\n}\n${wide}\n`,
    "expansion_limit",
  );
});

test("options and non-text arguments never execute hooks or accept arbitrary scope traversal", () => {
  let invoked = false;
  const input = {
    toString() {
      invoked = true;
      return simple;
    },
  };
  expect(parseCircuitSource(input as unknown as string).ok).toBe(false);
  const options = Object.defineProperty({}, "scope", {
    enumerable: true,
    get() {
      invoked = true;
      return "audio";
    },
  });
  expect(compileCircuitSource(simple, options).ok).toBe(false);
  for (const options of [{ scope: "../audio" }, { scope: "missing" }, { detail: "all" }, { x: 2 }])
    expect(compileCircuitSource(hierarchy, options as SourceOptions).ok).toBe(false);
  expect(invoked).toBe(false);
  expect(languageGrammar.version).toBe(1);
});
