import { expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import MarkdownClient, { MarkdownPreview, SourceEditor } from "../app/markdown/markdown-client.tsx";
import { loadExample } from "../src/catalog.ts";
import { renderFigureSVG } from "../src/figure-svg.ts";
import { highlightCircuitSource } from "../src/language/highlight.ts";
import { renderCircuitSource } from "../src/language/index.ts";
import { parseCircuitMarkdown, renderCircuitMarkdown } from "../src/markdown.ts";

const source = readFileSync(new URL("../examples/diagrams/cueva.ck", import.meta.url), "utf8");
const hierarchy = readFileSync(
  new URL("../examples/diagrams/audio-system.ck", import.meta.url),
  "utf8",
);
const fence = (value: string) => `\`\`\`circuitkit\n${value.trimEnd()}\n\`\`\``;

test("source and legacy Markdown coexist without rewriting legacy output or source system", () => {
  const legacy = loadExample("rc-lowpass");
  const old = renderFigureSVG(legacy);
  const expected = renderCircuitSource(source, { view: "blocks" });
  const rendered = renderCircuitMarkdown(`${fence(JSON.stringify(legacy))}\n\n${fence(source)}`, {
    view: "blocks",
  });
  if (!old.ok || !expected.ok || !rendered.ok) throw new Error("Invalid fixture");
  expect(rendered.figures).toHaveLength(2);
  expect(rendered.figures[0]?.svg).toBe(old.svg);
  expect(rendered.figures[1]?.svg).toBe(expected.svg);
  expect(rendered.figures[1]).toMatchObject({
    language: "circuitkit.source.v1",
    system: expected.system,
    selection: expected.selection,
  });
  const parsed = parseCircuitMarkdown(fence(source));
  if (!parsed.ok) throw new Error(JSON.stringify(parsed));
  expect(parsed.figures[0]).toHaveProperty("system.schema", "circuitkit.system.v1");
  expect(parsed.figures[0]).not.toHaveProperty("svg");
});

test("source diagnostic ranges map to actual Markdown offsets in quotes, lists and CRLF", () => {
  const invalid = 'circuit typo v1\ntitle "Typo"\na: module (p)\nb: module (p)\na.p -- b.wrong\n';
  for (const wrap of [
    (value: string) => `# Intro\n\n${value}`,
    (value: string) =>
      value
        .split("\n")
        .map((line) => `> ${line}`)
        .join("\n"),
    (value: string) =>
      `- item\n\n${value
        .split("\n")
        .map((line) => `  ${line}`)
        .join("\n")}`,
  ])
    for (const crlf of [false, true]) {
      const markdown = wrap(fence(invalid)).replaceAll("\n", crlf ? "\r\n" : "\n");
      const result = renderCircuitMarkdown(markdown);
      expect(result.ok).toBe(false);
      if (result.ok) throw new Error("Expected failure");
      const diagnostic = result.diagnostics[0];
      expect(diagnostic?.code).toBe("language.reference");
      expect(diagnostic?.range?.start.offset).toBe(markdown.indexOf("b.wrong"));
      expect(markdown.slice(diagnostic?.range?.start.offset, diagnostic?.range?.end.offset)).toBe(
        "b.wrong",
      );
      expect(diagnostic?.path).toStartWith("/markdown/line/");
    }
});

test("invalid source fences return no partial figures or stale output", () => {
  for (const invalid of [
    fence(source.replace("OLED.SDA", "OLED.wrong")),
    fence(source).slice(0, -3),
    fence('circuit bad v1\ntitle "Bad"\ndefine Loop () {\nx: Loop\n}\nx: Loop\n'),
  ]) {
    const result = renderCircuitMarkdown(`${fence(source)}\n\n${invalid}`);
    expect(result.ok).toBe(false);
    expect(result).not.toHaveProperty("figures");
  }
  const json = renderCircuitMarkdown(
    fence('{"schema":"circuitkit.diagram.v1", BROKEN circuit x v1}'),
  );
  expect(json.ok).toBe(false);
  if (!json.ok) expect(json.diagnostics[0]?.code).toBe("markdown.invalid_json");
});

test("scoped and interface projections retain the same whole-system model", () => {
  const full = renderCircuitMarkdown(fence(hierarchy));
  const selected = renderCircuitMarkdown(fence(hierarchy), {
    scope: "audio",
    detail: "interface",
    view: "wiring",
  });
  if (!full.ok || !selected.ok) throw new Error(JSON.stringify({ full, selected }));
  expect(selected.figures[0]?.system).toEqual(full.figures[0]?.system);
  expect(selected.figures[0]?.selection?.scope).toBe("audio");
  expect(selected.figures[0]?.selection?.boundaryPorts).toHaveLength(7);
  expect(
    renderCircuitMarkdown(fence(JSON.stringify(loadExample("rc-lowpass"))), { scope: "audio" }).ok,
  ).toBe(false);
});

test("highlighting preserves exact text and never renders authored HTML", () => {
  const escapeHTML = (value: string) =>
    value
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;");
  for (const input of [
    source,
    hierarchy,
    '# Title\n"unterminated',
    '<img src=x onerror="alert(1)">',
    '"SPK−" -- "−"',
    "x".repeat(65537),
  ]) {
    const html = highlightCircuitSource(input);
    expect(html.replace(/<\/?span[^>]*>/g, "")).toBe(escapeHTML(input));
    expect(html).not.toContain("<img");
    expect(html).not.toContain("<script");
  }
  expect(highlightCircuitSource(source)).toContain("ck-keyword");
  const editor = renderToStaticMarkup(
    createElement(SourceEditor, { value: source, invalid: false, onChange: () => {} }),
  );
  expect(editor).toContain('id="markdown-source"');
  expect(editor).toContain("Wrap lines");
  expect(editor).toContain("<textarea");
  expect(editor).not.toContain("dangerouslySetInnerHTML");
});

test("the source UI exposes view, scope, detail, examples and resolved inspection", () => {
  const markdown = fence(hierarchy);
  const client = renderToStaticMarkup(
    createElement(MarkdownClient, {
      initialSource: markdown,
      examples: [{ label: "Audio", source: markdown }],
    }),
  );
  for (const id of ["markdown-example", "markdown-view", "markdown-scope", "markdown-detail"])
    expect(client).toContain(`id="${id}"`);
  const rendered = renderCircuitMarkdown(markdown, { scope: "audio" });
  if (!rendered.ok || !rendered.figures[0]) throw new Error("Invalid fixture");
  const preview = renderToStaticMarkup(
    createElement(MarkdownPreview, { figure: rendered.figures[0] }),
  );
  expect(preview).toContain("Inspect resolved system and interfaces");
  expect(preview).toContain("External interface (not hardware)");
  expect(preview).not.toContain('href="/editor#');
});
