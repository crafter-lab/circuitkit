import { describe, expect, test } from "bun:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import MarkdownClient, { MarkdownPreview } from "../app/markdown/markdown-client.tsx";
import { loadExample } from "../src/catalog.ts";
import { type DiagramDocument, renderDiagramSVG } from "../src/diagram/index.ts";
import {
  applyMarkdownSource,
  changeSource,
  changeSourceMode,
  createEditor,
  evaluateEditor,
} from "../src/editor.ts";
import { renderFigureSVG } from "../src/figure-svg.ts";
import {
  type ParsedCircuitMarkdown,
  parseCircuitMarkdown,
  renderCircuitMarkdown,
} from "../src/markdown.ts";

function diagram(): DiagramDocument {
  return {
    schema: "circuitkit.diagram.v1",
    id: "studio",
    title: "Studio signal flow",
    modules: [
      { id: "source", label: "Source", ports: ["out", { id: "power", label: "+5V" }] },
      { id: "amp", ports: [{ id: "in" }, "out", "power"] },
      { id: "speaker", ports: ["in"] },
    ],
    connections: [
      { from: "source.out", to: "amp.in", kind: "signal", label: "Input" },
      { from: "source.power", to: "amp.power", kind: "power", bus: "Supply" },
      { from: "amp.out", to: "speaker.in", kind: "audio" },
    ],
  };
}

function fence(input: unknown, marker = "```") {
  return `${marker}circuitkit\n${JSON.stringify(input)}\n${marker}`;
}

function failed(result: ParsedCircuitMarkdown, code?: string) {
  expect(result.ok).toBe(false);
  expect(result).not.toHaveProperty("figures");
  expect(result).not.toHaveProperty("svg");
  if (result.ok) throw new Error("Expected all-or-nothing failure");
  if (code) expect(result.diagnostics.some((entry) => entry.code === code)).toBe(true);
  return result;
}

describe("diagram Markdown integration", () => {
  test("mixed legacy and diagram fences preserve order, authored data and legacy bytes", () => {
    const legacy = loadExample("rc-lowpass");
    const authored = diagram();
    const original = JSON.stringify(authored);
    const source = `# Lesson\n\n${fence(legacy)}\n\n  ${fence(authored, "~~~")}`;
    const parsed = parseCircuitMarkdown(source);
    const rendered = renderCircuitMarkdown(source);
    const old = renderFigureSVG(legacy);
    const direct = renderDiagramSVG(authored);
    if (!parsed.ok || !rendered.ok || !old.ok || !direct.ok) throw new Error("Invalid fixture");
    expect(rendered.figures[0]).toEqual({
      document: old.document,
      index: 0,
      line: 3,
      column: 1,
      svg: old.svg,
      bounds: old.bounds,
    });
    expect(parsed.figures[0]).not.toHaveProperty("figure");
    expect(rendered.figures[1]).toMatchObject({
      index: 1,
      line: 7,
      column: 3,
      document: direct.document,
      figure: direct.figure,
      semantics: direct.semantics,
      classification: direct.classification,
      svg: direct.svg,
      bounds: direct.bounds,
      targets: direct.targets,
    });
    expect(parsed.figures[1]).toMatchObject({
      document: direct.document,
      figure: direct.figure,
      classification: direct.classification,
      semantics: direct.semantics,
    });
    expect(parsed.figures[1]).not.toHaveProperty("svg");
    expect(parsed.figures[1]).not.toHaveProperty("bounds");
    expect(parsed.figures[1]?.document).not.toHaveProperty("display");
    expect(JSON.stringify(authored)).toBe(original);
    expect(rendered).not.toHaveProperty("html");
  });

  for (const view of ["blocks", "wiring", "schematic"] as const) {
    test(`${view} overrides only diagram presentation and preserves authored source`, () => {
      const authored = { ...diagram(), view: "blocks" as const };
      const legacy = loadExample("voltage-divider");
      const result = renderCircuitMarkdown(`${fence(authored)}\n${fence(legacy)}`, { view });
      const direct = renderDiagramSVG(authored, { view });
      const old = renderFigureSVG(legacy);
      if (!result.ok || !direct.ok || !old.ok) throw new Error("Invalid fixture");
      expect(result.figures[0]?.document).toEqual(direct.document);
      expect(result.figures[0]?.document).toHaveProperty("view", "blocks");
      expect(result.figures[0]?.classification).toEqual({
        kind: "module-diagram",
        view,
        connectivity: "declared",
      });
      expect(result.figures[0]?.svg).toBe(direct.svg);
      expect(result.figures[1]?.svg).toBe(old.svg);
    });
  }

  test("invalid diagrams stay on diagram routing with actionable line and pointer diagnostics", () => {
    const invalid = diagram();
    invalid.connections[0] = { from: "source.absent", to: "amp.in" };
    const source = `# Lesson\n\n${fence(loadExample("rc-lowpass"))}\n\n${fence(invalid)}`;
    const result = failed(parseCircuitMarkdown(source), "diagram.reference");
    expect(result.diagnostics).toContainEqual(
      expect.objectContaining({
        code: "diagram.reference",
        path: "/markdown/line/7/column/1/figures/1/connections/0/from",
        validPins: ["source.out", "source.power"],
        message: expect.stringContaining("line 7, column 1"),
      }),
    );
    expect(renderCircuitMarkdown(source)).toEqual(result);
    expect(result.diagnostics.every((entry) => entry.code.startsWith("diagram."))).toBe(true);
  });

  test("coordinates at every authored level fail closed even after a valid block", () => {
    const base = diagram();
    for (const [input, pointer] of [
      [{ ...base, x: 0 }, "/x"],
      [{ ...base, layout: {} }, "/layout"],
      [{ ...base, modules: [{ ...base.modules[0], position: [0, 0] }] }, "/modules/0/position"],
      [
        { ...base, modules: [{ id: "source", ports: [{ id: "out", x: 0 }] }] },
        "/modules/0/ports/0/x",
      ],
      [{ ...base, connections: [{ ...base.connections[0], points: [] }] }, "/connections/0/points"],
    ] as const) {
      const result = failed(renderCircuitMarkdown(`${fence(base)}\n\n${fence(input)}`));
      expect(result.diagnostics).toContainEqual(
        expect.objectContaining({
          path: `/markdown/line/5/column/1/figures/1${pointer}`,
        }),
      );
    }
  });

  test("author envelopes, public figures and bad views are not accepted as raw diagrams", () => {
    const direct = renderDiagramSVG(diagram());
    if (!direct.ok) throw new Error("Invalid fixture");
    for (const input of [
      { schema: "circuitkit.author.v1", document: diagram() },
      { document: diagram() },
      direct.figure,
      { ...diagram(), view: "pcb" },
      { ...diagram(), schema: "circuitkit.diagram.v2" },
      { ...diagram(), view: "pcb", modules: [] },
    ])
      failed(parseCircuitMarkdown(fence(input)));
    failed(renderCircuitMarkdown(fence({ ...diagram(), view: "pcb" }), { view: "wiring" }));
  });

  test("CommonMark containers and inert content retain the same bounded parsing contract", () => {
    const block = fence(diagram());
    const source = `<script>globalThis.executed=true</script>\n\n{doNotRun()}\n\n${block
      .split("\n")
      .map((line) => `> ${line}`)
      .join("\n")}`;
    const result = renderCircuitMarkdown(source);
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.figures).toHaveLength(1);
    expect(Object.hasOwn(globalThis, "executed")).toBe(false);
    failed(parseCircuitMarkdown(`<!--\n${block}\n-->`), "markdown.no_figures");
    failed(parseCircuitMarkdown(block.slice(0, -3)), "markdown.unclosed_fence");
    failed(
      parseCircuitMarkdown(`\`\`\`circuitkit\n${" ".repeat(65537)}\n\`\`\``),
      "markdown.payload_too_large",
    );
    failed(parseCircuitMarkdown(`${" ".repeat(1024 * 1024)}\n${block}`), "markdown.too_large");
    failed(parseCircuitMarkdown(Array(33).fill(block).join("\n\n")), "markdown.too_many_blocks");
    failed(
      parseCircuitMarkdown(`\`\`\`circuitkit\n${"[".repeat(65)}0${"]".repeat(65)}\n\`\`\``),
      "markdown.too_deep",
    );
  });

  test("the legacy editor refuses diagram or mixed Markdown without losing source or exposing stale output", async () => {
    const legacy = loadExample("rc-lowpass");
    for (const source of [fence(diagram()), `${fence(legacy)}\n\n${fence(diagram())}`]) {
      const state = changeSource(changeSourceMode(createEditor(legacy), "markdown"), source);
      const result = await applyMarkdownSource(state);
      expect(result.draftText).toBe(source);
      expect(result.document).toBeNull();
      expect(result.controls).toBeNull();
      expect(result.markdownFigures).toEqual([]);
      expect(result.sourceDiagnostics[0]?.code).toBe("markdown.unsupported_diagram");
      expect(result.sourceDiagnostics[0]?.message).toContain("/markdown");
      expect(evaluateEditor(result).ok).toBe(false);
    }
  });

  test("preview exposes views but never shares diagram documents with the legacy editor", () => {
    const rendered = renderCircuitMarkdown(
      `${fence(diagram())}\n${fence(loadExample("rc-lowpass"))}`,
    );
    if (!rendered.ok) throw new Error("Invalid fixture");
    const [newFigure, legacy] = rendered.figures;
    if (!newFigure || !legacy) throw new Error("Missing figures");
    const html = renderToStaticMarkup(createElement(MarkdownPreview, { figure: newFigure }));
    expect(html).toContain("Studio signal flow");
    expect(html).toContain("declared connectivity");
    expect(html).toContain("legacy editor does not accept diagrams");
    expect(html).toContain("<img");
    expect(html).toContain("data:image/svg+xml;charset=utf-8,");
    expect(html).not.toContain("<svg");
    expect(html).toContain("Fit width");
    expect(html).toContain("max-height:min(60vh, 480px)");
    expect(html).not.toContain('href="/editor');
    const old = renderToStaticMarkup(createElement(MarkdownPreview, { figure: legacy }));
    expect(old).toContain('href="/editor#');
    const source = fence(diagram());
    const client = renderToStaticMarkup(createElement(MarkdownClient, { initialSource: source }));
    expect(client).toContain('id="markdown-view"');
    for (const view of ["blocks", "wiring", "schematic"])
      expect(client).toContain(`value="${view}"`);
    expect(client).toContain("Source stays unchanged");
    expect(client).toContain("circuitkit.diagram.v1");
    expect(client).not.toContain("<svg");
  });
});
