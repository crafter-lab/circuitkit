import { expect, test } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";
import { moveTimeline, newTimeline, pushTimeline } from "../app/editor-history.ts";
import MarkdownClient from "../app/markdown/markdown-client.tsx";
import Playground from "../app/playground.tsx";
import CodeEditor from "../app/source-editor.tsx";
import { compileCircuitSource, resolveCircuitSource } from "../src/language/index.ts";

test("history is bounded, immutable and clears redo after a new edit", () => {
  const first = newTimeline({ source: "original" });
  let timeline = first;
  for (let i = 0; i < 100; i++) timeline = pushTimeline(timeline, { source: String(i) });
  expect(timeline.past).toHaveLength(40);
  expect(first).toEqual({ past: [], present: { source: "original" }, future: [] });
  const undone = moveTimeline(timeline, "undo");
  expect(undone.present.source).toBe("98");
  expect(moveTimeline(undone, "redo")).toEqual(timeline);
  expect(pushTimeline(undone, { source: "branch" }).future).toEqual([]);
  expect(moveTimeline(first, "undo")).toBe(first);
  expect(moveTimeline(first, "redo")).toBe(first);
  expect(pushTimeline(first, first.present)).toBe(first);
});

test("source fallback is accessible, escaped and not a transparent overlay", () => {
  const html = renderToStaticMarkup(
    <CodeEditor
      id="source"
      label="Source code"
      value={'<img src=x onerror="alert(1)">'}
      invalid
      onChange={() => {}}
    />,
  );
  expect(html).toContain('aria-label="Source code"');
  expect(html).toContain('aria-invalid="true"');
  expect(html).toContain("&lt;img");
  expect(html).not.toContain("<img");
  expect(html).not.toContain("source-code-editor");
});

test("workspaces expose local authoring, export, draft controls and undo without adding default persistence", () => {
  const markdown = renderToStaticMarkup(<MarkdownClient initialSource="# Draft" />);
  for (const text of [
    "Live preview",
    "Download Markdown",
    "Keep draft on this device",
    "Subsystem scope",
    "Preview",
    "Syntax, shortcuts",
  ])
    expect(markdown).toContain(text);
  const checkboxes = markdown.match(/<input[^>]*type="checkbox"[^>]*>/g) ?? [];
  expect(checkboxes.filter((input) => input.includes('checked=""'))).toHaveLength(1);
  const editor = renderToStaticMarkup(<Playground />);
  expect(editor).toContain(">Undo</button>");
  expect(editor).toContain(">Redo</button>");
  expect(editor).toContain('aria-label="Preview zoom"');
});

test("twenty reusable subsystems exceed one drawing but preserve the full system in each scoped projection", () => {
  const source = `circuit fleet v1\ntitle "Scoped fleet"\ndefine Unit (IN OUT) {\n a: module (p q)\n b: module (p q)\n a.q -- b.p\n expose IN = a.p\n expose OUT = b.q\n}\n${Array.from({ length: 20 }, (_, i) => `unit${i}: Unit`).join("\n")}\n`;
  const system = resolveCircuitSource(source);
  expect(system.ok).toBe(true);
  expect(compileCircuitSource(source).ok).toBe(false);
  if (!system.ok) throw new Error(JSON.stringify(system));
  for (const scope of ["unit0", "unit10", "unit19"]) {
    const projection = compileCircuitSource(source, { scope });
    expect(projection.ok).toBe(true);
    if (!projection.ok) throw new Error(JSON.stringify(projection));
    expect(projection.system).toEqual(system.system);
    expect(projection.selection.scope).toBe(scope);
    expect(projection.selection.boundaryPorts).toHaveLength(2);
  }
});
