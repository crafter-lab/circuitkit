import { expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { renderToStaticMarkup } from "react-dom/server";
import EditorPage from "../app/editor/page.tsx";
import PresentationFeature from "../app/landing/presentation-feature.tsx";
import { MarkdownPreview } from "../app/markdown/markdown-client.tsx";
import PresentationViewer from "../app/presentation-viewer.tsx";
import CodeEditor from "../app/source-editor.tsx";
import { renderCircuitSource } from "../src/language/index.ts";
import { directionArrow, presentationFigure } from "../src/language/scene.ts";
import { renderCircuitMarkdown } from "../src/markdown.ts";
import { publicLayout, renderEducationalSVG } from "../src/v2/render.ts";

const source = readFileSync(
  new URL("../examples/diagrams/cueva-presentation.ck", import.meta.url),
  "utf8",
);
const result = renderCircuitSource(source);
if (!result.ok || !result.presentation) throw new Error("Fixture must compile");
const { figure, presentation } = result;

test("static emphasis preserves geometry, text contrast tokens and the immutable base", () => {
  const before = JSON.stringify(figure);
  const selected = presentationFigure(figure, presentation.scenes[0]);
  expect(JSON.stringify(figure)).toBe(before);
  expect(publicLayout(selected).bounds).toEqual(publicLayout(figure).bounds);
  const base = renderEducationalSVG(figure),
    snapshot = renderEducationalSVG(selected);
  expect(base.ok && snapshot.ok).toBe(true);
  if (base.ok && snapshot.ok) expect(snapshot.svg).not.toBe(base.svg);
  for (let i = 0; i < figure.display.length; i++) {
    const original = figure.display[i],
      next = selected.display[i];
    expect(next?.id).toBe(original?.id);
    original?.shapes.forEach((shape, j) => {
      expect({ ...next?.shapes[j], tone: shape.tone }).toEqual(shape);
      if (shape.kind === "math") expect(next?.shapes[j]).toEqual(shape);
    });
  }
});

test("SSR is motion safe, uniquely labelled and has playback and scene controls", () => {
  const html = renderToStaticMarkup(
    <>
      <PresentationViewer figure={figure} presentation={presentation} />
      <PresentationViewer figure={figure} presentation={presentation} />
    </>,
  );
  expect(html.match(/data-mode="static"/g)).toHaveLength(2);
  expect(html).not.toContain('class="presentation-sweep"');
  expect(html.match(/class="presentation-arrow"/g)).toHaveLength(6);
  expect(html).toContain("Reduced motion");
  expect(html).toContain("Exports keep the static base diagram");
  for (const text of [
    "Scene",
    "Pause flow",
    "Replay flow",
    "Playback speed",
    "Sending digital audio",
    "Speaker output, not ground",
  ])
    expect(html).toContain(text);
  const ids = [...html.matchAll(/\bid="([^"]+)"/g)].map((match) => match[1]);
  expect(new Set(ids).size).toBe(ids.length);
});

test("unavailable projections keep a plain figure and expose their unavailable scene", () => {
  const first = presentation.scenes[0];
  if (!first) throw new Error("Missing scene fixture");
  const blocked = { ...first, unavailable: ["Use wiring"] };
  expect(presentationFigure(figure, blocked)).toBe(figure);
  const html = renderToStaticMarkup(
    <PresentationViewer figure={figure} presentation={{ scenes: [blocked] }} />,
  );
  expect(html).toContain("unavailable");
  expect(html).toContain('data-scene="base"');
});

test("static direction markers follow geometric orientation without particles", () => {
  expect(
    directionArrow([
      { x: 0, y: 0 },
      { x: 100, y: 0 },
    ]),
  ).toBe("57,0 44,4 44,-4");
  expect(
    directionArrow([
      { x: 100, y: 0 },
      { x: 0, y: 0 },
    ]),
  ).toBe("43,0 56,-4 56,4");
  expect(directionArrow([])).toBe("");
});

test("CircuitKit mode is a real authoring surface and legacy editor remains available", async () => {
  const html = renderToStaticMarkup(
    await EditorPage({ searchParams: Promise.resolve({ mode: "circuitkit" }) }),
  );
  for (const text of [
    "Playground",
    "Format source",
    "Download .ck",
    "Download SVG",
    "Download PNG",
    "Developer guide",
  ])
    expect(html).toContain(text);
  expect(html).toContain('aria-label="CircuitKit source"');
  expect(html).toContain("presentation {");
  expect(html).not.toContain('class="presentation-sweep"');
  const legacy = renderToStaticMarkup(await EditorPage());
  expect(legacy).toContain("Circuits, made legible.");
  expect(legacy).toContain('href="/editor?mode=circuitkit"');
});

test("landing documents the real language and embeds the shared viewer", async () => {
  const html = renderToStaticMarkup(await PresentationFeature());
  expect(html).toContain('id="presentations"');
  expect(html).toContain('href="/editor?mode=circuitkit"');
  expect(html).toContain("Available in this local checkout");
  expect(html).toContain("Illustrative flow, not electrical simulation");
  expect(html).toContain("presentation-viewer");
  expect(html).toContain("ck-keyword");
});

test("Markdown consumes presentation plans and preserves static export controls", () => {
  const markdown = renderCircuitMarkdown(`\`\`\`circuitkit\n${source}\`\`\`\n`);
  if (!markdown.ok || !markdown.figures[0]) throw new Error("Markdown fixture failed");
  const html = renderToStaticMarkup(<MarkdownPreview figure={markdown.figures[0]} />);
  expect(html).toContain("presentation-viewer");
  expect(html).toContain("Download SVG");
  expect(html).toContain("Download PNG");
  expect(html).toContain("All connections");
});

test("CircuitKit source fallback labels the correct mode and escapes hostile source", () => {
  const html = renderToStaticMarkup(
    <CodeEditor
      id="ck"
      label="CircuitKit source"
      language="circuitkit"
      value={"<script>alert(1)</script>"}
      invalid
      onChange={() => {}}
    />,
  );
  expect(html).toContain("&lt;script&gt;");
  expect(html).not.toContain("<script>");
  expect(html).toContain(">CircuitKit</span>");
});
