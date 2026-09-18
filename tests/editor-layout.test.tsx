import { describe, expect, test } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";
import EditorPage from "../app/editor/page.tsx";
import Playground from "../app/playground.tsx";
import { loadExample } from "../src/index.ts";

const panels = ["Circuit", "Style", "Explain", "Source"] as const;

function panelTag(html: string, name: string) {
  const tag = html.match(
    new RegExp(`<section[^>]*id="inspector-${name.toLowerCase()}"[^>]*>`),
  )?.[0];
  expect(tag).toBeDefined();
  return tag ?? "";
}

describe("compact editor composition", () => {
  test("the default inspector is a native radio group with one visible, persistent panel", () => {
    const html = renderToStaticMarkup(<Playground />);
    expect(html).toContain('<legend class="sr-only">Inspector panel</legend>');
    const radios = html.match(/<input[^>]*type="radio"[^>]*>/g) ?? [];
    expect(radios).toHaveLength(4);
    expect(radios.filter((radio) => radio.includes('checked=""'))).toHaveLength(1);
    expect(radios.find((radio) => radio.includes('checked=""'))).toContain('value="Circuit"');
    for (const name of panels) {
      const tag = panelTag(html, name);
      expect(tag).toStartWith("<section");
      expect(tag).toContain(`aria-labelledby="panel-label-${name.toLowerCase()}"`);
      expect(tag.includes('hidden=""')).toBe(name !== "Circuit");
      expect(radios.find((radio) => radio.includes(`value="${name}"`))).toContain(
        `aria-controls="inspector-${name.toLowerCase()}"`,
      );
    }
    expect(html).toContain('id="json-source"');
    expect(html).toContain("Figure document JSON");
    expect(html).toContain("Show net legend");
    expect(html).toContain("Current step");
    expect(html).not.toMatch(/role="(?:tab|menu|menuitem)"/);
    expect(
      html.match(/<section[^>]*aria-labelledby="(?:panel-label-circuit|content-heading)"/g),
    ).toHaveLength(1);
    expect(
      html.match(/<section[^>]*aria-labelledby="(?:panel-label-style|theme-heading)"/g),
    ).toHaveLength(1);
    const circuit = html.slice(
      html.indexOf('id="inspector-circuit"'),
      html.indexOf('id="inspector-style"'),
    );
    expect(circuit.match(/<input\b/g)).toHaveLength(3);
    expect(circuit).not.toContain("Accent override");
    expect(circuit).not.toContain("Figure caption");
  });

  test("preview precedes the right inspector and source is not under the figure", () => {
    const html = renderToStaticMarkup(<Playground />);
    const preview = html.indexOf('class="figure-stage"');
    const inspector = html.indexOf('<aside class="editor-inspector"');
    const source = html.indexOf('id="json-source"');
    expect(preview).toBeGreaterThan(0);
    expect(inspector).toBeGreaterThan(preview);
    expect(source).toBeGreaterThan(inspector);
    expect(html.slice(preview, inspector)).not.toContain("Figure document JSON");
    expect(html).not.toContain("Document controls");
    expect(html).not.toContain("<svg");
  });

  test("toolbar has one primary action and closed native secondary exports", () => {
    const html = renderToStaticMarkup(<Playground />);
    const toolbar = html.slice(0, html.indexOf('class="editor-layout"'));
    expect(toolbar).toContain("Recipe");
    expect(toolbar).toContain('class="status " role="status"');
    expect(toolbar).toContain('class="export-bar"');
    expect(toolbar.match(/class="primary"/g)).toHaveLength(1);
    expect(toolbar).toMatch(/<button[^>]*class="primary"[^>]*>Download PNG<\/button>/);
    const disclosure = toolbar.match(
      /<details class="export-disclosure"[^>]*>([\s\S]*?)<\/details>/,
    );
    expect(disclosure).not.toBeNull();
    expect(disclosure?.[0]).not.toMatch(/^<details[^>]*\bopen=/);
    expect(disclosure?.[1]).toContain('<summary tabindex="0">More exports</summary>');
    for (const label of ["Copy PNG", "Download SVG", "Copy JSON", "Copy Markdown", "PNG scale"])
      expect(disclosure?.[1]).toContain(label);
    expect(disclosure?.[1]).not.toContain("Copy link");
    expect(disclosure?.[1]).not.toContain(">Download PNG<");
  });

  test("an invalid document opens Source for recovery without a fallback or enabled exports", () => {
    const html = renderToStaticMarkup(<Playground initialDocument={{ broken: true }} />);
    for (const name of panels)
      expect(panelTag(html, name).includes('hidden=""')).toBe(name !== "Source");
    expect(html).toContain("Review Source");
    expect(html).toContain("&quot;broken&quot;: true");
    expect(html).not.toContain("<svg");
    for (const label of [
      "Copy link",
      "Download PNG",
      "Copy PNG",
      "Download SVG",
      "Copy JSON",
      "Copy Markdown",
    ])
      expect(html).toMatch(new RegExp(`<button[^>]*disabled=""[^>]*>${label}</button>`));
  });

  test("advanced style controls and public reference are collapsed, not removed", async () => {
    const html = renderToStaticMarkup(await EditorPage());
    expect(html).toContain('<main id="main" class="editor-page">');
    expect(html.match(/<main\b/g)).toHaveLength(1);
    expect(html).toContain("Circuits, made legible.");
    expect(html).toContain(
      '<details class="inspector-disclosure"><summary>Advanced overrides</summary>',
    );
    expect(html).toContain("Reset stroke width");
    expect(html).toContain(
      '<details class="editor-reference"><summary>The public contract</summary>',
    );
    expect(html).toContain("Document JSON schema");
    expect(html).toContain("Recipes, pins &amp; SI parameters");
  });

  test("panel switching is presentation-only and keyboard handlers stay local and composition-safe", async () => {
    const source = await Bun.file(new URL("../app/playground.tsx", import.meta.url)).text();
    for (const name of panels) expect(source).toContain(`hidden={panel !== "${name}"}`);
    expect(source).toContain("onChange={() => setPanel(name)}");
    expect(source).toContain('if (!state.controls) setPanel("Source")');
    expect(source).toContain("event.nativeEvent.isComposing");
    expect(source).toContain("event.keyCode === 229");
    expect(source).toContain("event.repeat");
    expect(source).toContain("!(event.metaKey || event.ctrlKey)");
    expect(source).toContain('if (event.key !== "Escape" || !event.currentTarget.open) return');
    expect(source).toContain("event.currentTarget.open = false");
    expect(source).toContain("exportSummary.current?.focus()");
    expect(source).toContain("onBlur={(event)");
    expect(source).toContain("event.currentTarget.contains(event.relatedTarget)");
    expect(source).toContain("runSecondaryExport(copyJSON)");
    expect(source).toContain("runSecondaryExport(copyMarkdown)");
    expect(source).toContain("runSecondaryExport(downloadSVG)");
    expect(source).not.toMatch(/addEventListener\(["']key(?:down|up)/);
    expect(source).not.toMatch(
      /key=\{panel\}|panel === ["'](?:Circuit|Style|Explain|Source)["'] \?/,
    );
  });

  test("long authored text remains intact in the inspector and source", () => {
    const document = loadExample("rc-lowpass");
    document.presentation.title = "A long authored title ".repeat(8);
    const before = JSON.stringify(document);
    const html = renderToStaticMarkup(<Playground initialDocument={document} />);
    expect(html).toContain(`value="${document.presentation.title}"`);
    expect(html).toContain('aria-describedby="diagnostics"');
    expect(JSON.stringify(document)).toBe(before);
  });
});
