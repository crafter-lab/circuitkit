import { expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { renderToStaticMarkup, renderToString } from "react-dom/server";
import EditorPage from "../app/editor/page.tsx";
import { dividerLesson } from "../app/lesson/documents.ts";
import Page from "../app/page.tsx";
import { focusPreview } from "../app/preview-figure.ts";
import CodeEditor from "../app/source-editor.tsx";
import { ToolMenu } from "../app/ui-controls.tsx";
import { renderCircuitSource } from "../src/language/index.ts";
import { presentationFigure } from "../src/language/scene.ts";
import { CircuitLessonFigure } from "../src/lesson-figure.tsx";
import { publicLayout } from "../src/v2/render.ts";

const source = readFileSync(
  new URL("../examples/diagrams/audio-story.ck", import.meta.url),
  "utf8",
);
const compiled = renderCircuitSource(source);
if (!compiled.ok || !compiled.presentation) throw new Error("Story fixture must compile");

test("story SSR is deterministic, uniquely labelled and motion safe", async () => {
  const page = await Page();
  const html = renderToString(page, { identifierPrefix: "design-" });
  expect(renderToString(page, { identifierPrefix: "design-" })).toBe(html);
  expect(html).not.toContain('class="presentation-sweep"');
  const ids = [...html.matchAll(/\bid="([^"]+)"/g)].map((match) => match[1]);
  expect(new Set(ids).size).toBe(ids.length);
  for (const match of html.matchAll(/aria-(?:controls|labelledby|describedby)="([^"]+)"/g))
    for (const id of (match[1] ?? "").split(" ")) expect(ids).toContain(id);
});

test("canvas framing removes document chrome but keeps every semantic target and original export", () => {
  const before = JSON.stringify(compiled);
  const focused = focusPreview(compiled.figure);
  expect(publicLayout(focused).bounds.height).toBeLessThan(compiled.bounds.height);
  expect(focused.targets).toEqual(compiled.figure.targets);
  for (const target of compiled.figure.targets) {
    if (target.role !== "net")
      expect(focused.display.some((part) => part.id === target.id)).toBe(true);
  }
  const expected = publicLayout(focused).bounds;
  for (const scene of compiled.presentation?.scenes ?? [])
    expect(publicLayout(focusPreview(presentationFigure(compiled.figure, scene))).bounds).toEqual(
      expected,
    );
  expect(JSON.stringify(compiled)).toBe(before);
});

test("source studio uses one toolbar and closed progressive controls, with old recipe routes intact", async () => {
  const html = renderToStaticMarkup(
    await EditorPage({ searchParams: Promise.resolve({ mode: "circuitkit" }) }),
  );
  expect(html).toContain("Playground");
  expect(html).toContain('class="studio-workspace"');
  expect(html).toContain('aria-label="Diagram view"');
  expect(html).toContain('aria-label="Export circuit"');
  expect(html).toContain('aria-label="Source options"');
  expect(html).toContain('aria-label="Canvas settings"');
  expect(html).not.toMatch(/<details[^>]+\bopen/);
  expect(html).not.toContain("Preview &amp; scenes");
  expect(html).not.toContain("Choose an example…");
  expect(renderToStaticMarkup(await EditorPage())).toContain("Circuits, made legible.");
});

test("minimal source chrome does not repeat a toolbar inside the source pane", () => {
  const html = renderToStaticMarkup(
    <CodeEditor
      id="test-source"
      value={source}
      language="circuitkit"
      label="Source"
      invalid={false}
      onChange={() => {}}
      minimal
    />,
  );
  expect(html).toContain('aria-label="Source"');
  expect(html).toContain("code-editor-minimal");
  expect(html).not.toContain("code-editor-bar");
  expect(html).not.toContain("Wrap lines");
});

test("compact legend is descriptive, not another row of net buttons, and reserves descriptions", () => {
  const document = dividerLesson("geist-light", 10000);
  for (const activeNet of [null, "input", "output", "ground"]) {
    const html = renderToStaticMarkup(
      <CircuitLessonFigure
        document={document}
        activeNet={activeNet}
        onActiveNetChange={() => {}}
      />,
    );
    expect(html).toContain('aria-label="Connection legend"');
    expect(html).toContain('class="circuit-lesson-description-slot"');
    expect(html.match(/class="circuit-lesson-description"/g)).toHaveLength(3);
    expect(html).toContain("grid-area:1 / 1");
    expect(html).not.toMatch(/<button[^>]*>All<\/button>/);
    expect(html).not.toMatch(/<button[^>]*>[ABC]<\/button>/);
    expect(html).toContain("Reset");
  }
});

test("menus expose native summary controls and do not start open", () => {
  const html = renderToStaticMarkup(
    <ToolMenu label="Actions">
      <button type="button">Export</button>
    </ToolMenu>,
  );
  expect(html).toContain('<details class="ck-menu"');
  expect(html).toContain('aria-label="Actions"');
  expect(html).not.toMatch(/<details[^>]*\bopen/);
});
