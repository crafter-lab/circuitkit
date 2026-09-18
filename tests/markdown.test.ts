import { describe, expect, test } from "bun:test";
import { loadExample } from "../src/catalog.ts";
import { renderFigureSVG } from "../src/figure-svg.ts";
import { parseCircuitMarkdown, renderCircuitMarkdown } from "../src/markdown.ts";
import type { Failure } from "../src/types.ts";

function fence(input: unknown = loadExample("rc-lowpass"), marker = "```", info = "circuitkit") {
  return `${marker}${info}\n${JSON.stringify(input)}\n${marker}`;
}

function failed(result: { ok: true } | Failure, code?: string) {
  expect(result.ok).toBe(false);
  expect(result).not.toHaveProperty("figures");
  expect(result).not.toHaveProperty("svg");
  if (result.ok) throw new Error("Expected all-or-nothing failure");
  expect(result.diagnostics.length).toBeGreaterThan(0);
  if (code) expect(result.diagnostics.some((diagnostic) => diagnostic.code === code)).toBe(true);
  return result;
}

describe("inert CommonMark CircuitKit adapter", () => {
  test("multiple figures have source-order indexes and original opening-fence positions", () => {
    const first = loadExample("rc-lowpass");
    const second = loadExample("voltage-divider");
    const source = `# Lesson\n\n${fence(first)}\n\nProse stays with the host.\n\n  ${fence(second, "~~~")}`;
    const parsed = parseCircuitMarkdown(source);
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) throw new Error(JSON.stringify(parsed.diagnostics));
    expect(parsed.diagnostics).toEqual([]);
    expect(parsed.figures).toHaveLength(2);
    expect(parsed.figures[0]).toMatchObject({ index: 0, line: 3, column: 1 });
    expect(parsed.figures[1]).toMatchObject({ index: 1, line: 9, column: 3 });
    expect(parsed.figures[0]).not.toHaveProperty("svg");
    const rendered = renderCircuitMarkdown(source);
    expect(rendered.ok).toBe(true);
    if (!rendered.ok) throw new Error(JSON.stringify(rendered.diagnostics));
    for (const [index, entry] of rendered.figures.entries()) {
      const direct = renderFigureSVG(index === 0 ? first : second);
      expect(direct.ok).toBe(true);
      if (!direct.ok) throw new Error("Expected valid example");
      const parsedFigure = parsed.figures[index];
      if (!parsedFigure || parsedFigure.figure !== undefined)
        throw new Error("Expected the corresponding legacy parsed figure");
      expect(entry).toEqual({ ...parsedFigure, svg: direct.svg, bounds: direct.bounds });
      expect(entry.document).toEqual(direct.document);
    }
    expect(rendered).not.toHaveProperty("html");
  });

  test("full annotated SVG includes legend and caption with matching expanded bounds", () => {
    const document = loadExample("rc-lowpass");
    document.presentation.title = "Señal Ω µ π";
    document.presentation.annotations = {
      nets: [{ net: "output", label: "A", description: "Salida áéíóú ñ", tone: "blue" }],
      legend: true,
      caption: '<script>alert("inert")</script> & plain text',
    };
    const result = renderCircuitMarkdown(fence(document));
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error(JSON.stringify(result.diagnostics));
    const direct = renderFigureSVG(document);
    if (!direct.ok) throw new Error(JSON.stringify(direct.diagnostics));
    expect(result.figures[0]?.svg).toBe(direct.svg);
    expect(result.figures[0]?.bounds).toEqual(direct.bounds);
    expect(result.figures[0]?.svg).toContain('data-legend-net="output"');
    expect(result.figures[0]?.svg).toContain('data-caption="true"');
    expect(result.figures[0]?.svg).not.toContain("<script>");
    const figure = result.figures[0];
    if (!figure || figure.figure !== undefined) throw new Error("Expected a legacy figure");
    expect(figure.document.presentation.annotations).toEqual(document.presentation.annotations);
  });

  test("prototype-like IDs remain own data in documents and bounds", () => {
    const document = JSON.parse(
      JSON.stringify(loadExample("rc-lowpass"))
        .replaceAll("R1", "__proto__")
        .replaceAll("C1", "constructor"),
    );
    document.circuit.nets = Object.fromEntries(
      Object.entries(document.circuit.nets).map(([key, endpoints]) => [
        key === "ground" ? "__proto__" : key,
        endpoints,
      ]),
    );
    const rendered = renderCircuitMarkdown(fence(document));
    expect(rendered.ok).toBe(true);
    if (!rendered.ok) throw new Error(JSON.stringify(rendered.diagnostics));
    const figure = rendered.figures[0];
    expect(figure).toBeDefined();
    if (!figure || figure.figure !== undefined) throw new Error("Expected a legacy figure");
    expect(Object.hasOwn(figure.document.circuit.components, "__proto__")).toBe(true);
    expect(Object.hasOwn(figure.document.circuit.nets, "__proto__")).toBe(true);
    expect(Object.hasOwn(figure.bounds.symbols, "__proto__")).toBe(true);
    expect(Object.hasOwn(figure.bounds.routes, "__proto__")).toBe(true);
    expect(Object.hasOwn(Object.prototype, "polluted")).toBe(false);
  });

  test("CommonMark supports tildes, longer fences, containers, indentation, metadata, and line endings", () => {
    const block = fence();
    const pretty = `\`\`\`circuitkit\n${JSON.stringify(loadExample("rc-lowpass"), null, 2)}\n\`\`\``;
    for (const source of [
      fence(undefined, "~~~"),
      fence(undefined, "````"),
      `${block}\`\``,
      fence(undefined, "~~~", "circuitkit title=example"),
      block
        .split("\n")
        .map((line) => `> ${line}`)
        .join("\n"),
      block
        .split("\n")
        .map((line, index) => `${index === 0 ? "- " : "  "}${line}`)
        .join("\n"),
      block
        .split("\n")
        .map((line) => `   ${line}`)
        .join("\n"),
      block.replaceAll("\n", "\r\n"),
      block.replaceAll("\n", "\r"),
      `${pretty}\n`,
      pretty
        .split("\n")
        .map((line) => `> ${line}`)
        .join("\n"),
      `> - ${block.split("\n").join("\n>   ")}`,
      fence(undefined, "```", "circuit&#107;it"),
    ]) {
      const result = parseCircuitMarkdown(source);
      expect(result.ok, JSON.stringify(result.diagnostics)).toBe(true);
      if (result.ok) expect(result.figures).toHaveLength(1);
    }
  });

  test("unknown code, escaped fences, indented code, longer outer fences, and HTML are inert", () => {
    const ignored = [
      fence(undefined, "```", "json"),
      fence(undefined, "```", "CircuitKit"),
      fence(undefined, "```", "circuitkit-js"),
      `\`\`\`\`text\n${fence()}\n\`\`\`\``,
      `\\\`\`\`circuitkit\n{}\n\\\`\`\``,
      fence()
        .split("\n")
        .map((line) => `    ${line}`)
        .join("\n"),
      `<!--\n${fence()}\n-->`,
      `<script>\n${fence()}\n</script>`,
      `<div>\n${fence()}\n</div>`,
      `<![CDATA[\n${fence()}\n]]>`,
      '<CircuitKit src="https://example.org/figure.json" />',
    ];
    for (const source of ignored) failed(parseCircuitMarkdown(source), "markdown.no_figures");
    const combined = renderCircuitMarkdown(`${ignored.join("\n\n")}\n\n${fence()}`);
    expect(combined.ok).toBe(true);
    if (combined.ok) expect(combined.figures).toHaveLength(1);
  });

  test("unclosed, wrong-marker, too-short, and over-indented closing fences reject", () => {
    const json = JSON.stringify(loadExample("rc-lowpass"));
    for (const source of [
      `\`\`\`circuitkit\n${json}`,
      `\`\`\`circuitkit\n${json}\n`,
      `\`\`\`circuitkit\n${json}\n~~~`,
      `\`\`\`\`circuitkit\n${json}\n\`\`\``,
      `\`\`\`circuitkit\n${json}\n    \`\`\``,
      `> \`\`\`circuitkit\n> ${json}\n\nOutside`,
      `\`\`\`circuitkit\n${json}\n\`\`\` trailing`,
      "```circuitkit",
    ])
      failed(parseCircuitMarkdown(source), "markdown.unclosed_fence");
    failed(parseCircuitMarkdown("```circuitkit\n```"), "markdown.invalid_json");
  });

  test("every invalid block contributes located diagnostics with no partial figures", () => {
    const bad = loadExample("rc-lowpass");
    bad.circuit.nets.input = ["VIN", "R1.missing"];
    const source = `# Lesson\n\n${fence()}\n\n${fence(bad)}\n\n~~~circuitkit\n{bad}\n~~~`;
    const parsed = failed(parseCircuitMarkdown(source));
    expect(renderCircuitMarkdown(source)).toEqual(parsed);
    expect(parsed.diagnostics).toContainEqual(
      expect.objectContaining({
        code: "circuit.unknown_pin",
        path: "/markdown/line/7/column/1/figures/1/circuit/nets/input/1",
        validPins: ["a", "b"],
        message: expect.stringContaining("line 7, column 1"),
      }),
    );
    expect(parsed.diagnostics).toContainEqual(
      expect.objectContaining({
        code: "markdown.invalid_json",
        path: "/markdown/line/11/column/1/figures/2",
        message: expect.stringContaining("line 11, column 1"),
      }),
    );
  });

  test("schema, legend, caption, glyph, contrast, and layout failures are not hidden by parse", () => {
    for (const caption of ["Unsupported 🧠", "bad\u0000text", "W".repeat(400)]) {
      const document = loadExample("rc-lowpass");
      document.presentation.annotations = { nets: [], legend: false, caption };
      const direct = renderFigureSVG(document);
      const parsed = failed(parseCircuitMarkdown(fence(document)));
      expect(direct.ok).toBe(false);
      if (!direct.ok)
        expect(parsed.diagnostics.map(({ code }) => code)).toEqual(
          direct.diagnostics.map(({ code }) => code),
        );
    }
    const document = loadExample("rc-lowpass");
    document.presentation.theme.overrides = { label: "#ffffff" };
    failed(parseCircuitMarkdown(fence(document)), "theme.insufficient_contrast");
    failed(
      parseCircuitMarkdown(fence({ ...loadExample("rc-lowpass"), url: "https://example.org" })),
      "document.invalid_field",
    );
    for (const payload of [
      "null",
      "[]",
      "{}",
      "(()=>globalThis.polluted=true)()",
      "https://example.org/f.json",
      "{...remote}",
    ])
      failed(parseCircuitMarkdown(`\`\`\`circuitkit\n${payload}\n\`\`\``));
    expect(Object.hasOwn(globalThis, "polluted")).toBe(false);
  });

  test("source and payload byte caps, block count, and hostile JSON depth are bounded", () => {
    const block = fence();
    const exact = `${" ".repeat(1024 * 1024 - Buffer.byteLength(block) - 1)}\n${block}`;
    expect(Buffer.byteLength(exact)).toBe(1024 * 1024);
    expect(parseCircuitMarkdown(exact).ok).toBe(true);
    failed(parseCircuitMarkdown(` ${exact}`), "markdown.too_large");
    failed(parseCircuitMarkdown(`${"é".repeat(600000)}\n${block}`), "markdown.too_large");
    failed(
      parseCircuitMarkdown(`\`\`\`circuitkit\n${" ".repeat(64 * 1024 + 1)}\n\`\`\``),
      "markdown.payload_too_large",
    );
    failed(
      parseCircuitMarkdown(`\`\`\`circuitkit\n${"[".repeat(10000)}0${"]".repeat(10000)}\n\`\`\``),
      "markdown.too_deep",
    );
    expect(parseCircuitMarkdown(Array(32).fill(block).join("\n\n")).ok).toBe(true);
    const tooMany = failed(
      parseCircuitMarkdown(Array(33).fill(block).join("\n\n")),
      "markdown.too_many_blocks",
    );
    expect(tooMany.diagnostics[0]?.path).toContain("/figures/32");
    failed(Reflect.apply(parseCircuitMarkdown, undefined, [null]), "markdown.invalid_source");
  });

  test("brackets and escaped strings are not counted as JSON structure", () => {
    const document = loadExample("rc-lowpass");
    document.presentation.annotations = {
      nets: [],
      legend: false,
      caption: '[ \\" ] { } '.repeat(20),
    };
    expect(parseCircuitMarkdown(fence(document)).ok).toBe(true);
  });
});
