import { describe, expect, test } from "bun:test";
import { renderToStaticMarkup, renderToString } from "react-dom/server";
import EditorPage from "../app/editor/page.tsx";
import { getGalleryCase } from "../app/gallery/corpus.ts";
import GalleryPage from "../app/gallery/page.tsx";
import FigurePage from "../app/gallery/view/page.tsx";
import { dividerLesson } from "../app/lesson/documents.ts";
import LessonPage from "../app/lesson/page.tsx";
import Page from "../app/page.tsx";
import { getCatalog, loadExample, renderSVG } from "../src/index.ts";

const sourceURL = "https://github.com/crafter-lab/circuitkit";
const escapeHTML = (text: string) => renderToStaticMarkup(text);

function firstDiagram(markup: string) {
  return markup
    .match(/<svg\b[\s\S]*?<\/svg>/)?.[0]
    ?.replace(' style="display:block;width:100%;height:auto"', "");
}

describe("CircuitKit landing", () => {
  test("root introduces the product with aligned actions and honest source instructions", async () => {
    const html = renderToStaticMarkup(await Page());
    expect(html).toContain("Circuit diagrams that explain themselves.");
    expect(html.match(/<h1\b/g)).toHaveLength(1);
    expect(html).toContain('href="/editor">Open editor</a>');
    expect(html).toContain('href="/gallery">Explore gallery</a>');
    expect(html).toContain('href="/lesson">Learn to read the nodes');
    expect(html).toContain('href="https://crafter.run"');
    expect(html).toContain(`href="${sourceURL}"`);
    expect(html).toContain(`href="${sourceURL}/blob/main/LICENSE">Apache-2.0</a>`);
    expect(html).toContain("CircuitKit is not published to npm.");
    const text = html.replace(/<[^>]+>/g, "");
    expect(text).toContain(`git clone ${sourceURL}\ncd circuitkit\nbun install\nbun run build`);
    expect(text).toContain("local tarball");
    expect(text).toContain("circuitkit/react");
    expect(text).toContain("not a simulation");
    expect(text).toContain("Not an arbitrary circuit autorouter");
    expect(html).not.toContain("bun add circuitkit");
    expect(html).not.toContain("UNLICENSED");
    expect(html).not.toContain("Local-only MVP");
    expect(html).not.toContain('class="workbench"');
    expect(html).not.toContain("Run stress test");
  });

  test("topology links and count come from the live catalog", async () => {
    const html = renderToStaticMarkup(await Page());
    const recipes = getCatalog().recipes;
    expect(html).toContain(`${recipes.length} topologies. Real connections.`);
    expect(html.match(/href="\/gallery\?recipe=/g)).toHaveLength(recipes.length);
    for (const { id, title } of recipes) {
      expect(html).toContain(`href="/gallery?recipe=${encodeURIComponent(id)}"`);
      expect(html).toContain(escapeHTML(title));
    }
  });

  test("hero uses the unchanged shared renderer and interactive annotated legend", async () => {
    const document = dividerLesson("geist-light", 10000);
    const before = JSON.stringify(document);
    const result = renderSVG(document);
    if (!result.ok) throw new Error(JSON.stringify(result.diagnostics));
    const html = renderToStaticMarkup(await Page());
    expect(firstDiagram(html)).toBe(result.svg);
    expect(html).toContain('data-mode="interactive"');
    expect(html).toContain('class="circuit-lesson-hit-layer"');
    expect(html).toContain("Show all");
    expect(html).toContain("Download figure SVG");
    expect(html).toContain("All nets shown. No selection.");
    for (const annotation of result.annotations?.nets ?? []) {
      expect(html).toContain(`data-legend-net="${annotation.net}"`);
      expect(html).toContain(annotation.description);
      expect(html).toContain(`>${annotation.label}</button>`);
    }
    expect(html).toContain("The download keeps your selection, not the preview.");
    expect(JSON.stringify(document)).toBe(before);
  });

  test("initial light SSR is deterministic with accessible theme and figure controls", async () => {
    const page = await Page();
    const html = renderToString(page, { identifierPrefix: "landing-test-" });
    expect(renderToString(page, { identifierPrefix: "landing-test-" })).toBe(html);
    expect(html).toContain('class="landing" data-theme="light"');
    expect(html).toContain('aria-label="Dark theme" aria-pressed="false"');
    expect(html).toContain('href="#main">Skip to content</a>');
    expect(html).toContain('id="main"');
    expect(html).toContain('tabindex="0" aria-label="Render a circuit with the CircuitKit core"');
    expect(html).toContain('tabindex="0" aria-label="Build CircuitKit from source"');
    const ids = [...html.matchAll(/\sid="([^"]+)"/g)].map((match) => match[1]);
    expect(new Set(ids).size).toBe(ids.length);
    for (const match of html.matchAll(/aria-(?:controls|describedby|labelledby)="([^"]+)"/g)) {
      for (const reference of (match[1] ?? "").split(" ")) expect(ids).toContain(reference);
    }
  });

  test("the displayed core example uses an actual supported recipe and result contract", async () => {
    const html = renderToStaticMarkup(await Page());
    const text = html.replace(/<[^>]+>/g, "");
    expect(text).toContain(escapeHTML('import { loadExample, renderSVG } from "circuitkit";'));
    expect(text).toContain(escapeHTML('const document = loadExample("voltage-divider");'));
    expect(text).toContain("const result = renderSVG(document);");
    expect(text).toContain("if (result.ok)");
    expect(text).toContain("result.diagnostics");
    const result = renderSVG(loadExample("voltage-divider"));
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.svg).toStartWith("<svg");
  });

  test("unrelated query parameters still show the landing", async () => {
    const html = renderToStaticMarkup(
      await Page({ searchParams: Promise.resolve({ q: "nodes" }) }),
    );
    expect(html).toContain("Circuit diagrams that explain themselves.");
    expect(html).not.toContain('class="workbench"');
  });
});

describe("landing and editor route compatibility", () => {
  test.each(["rc-lowpass/audio-low/geist-light", "rc-lowpass/schema-si-string/geist-dark"])(
    "legacy /?case=%s preserves editor output exactly",
    async (id) => {
      const entry = getGalleryCase(id);
      if (!entry) throw new Error(`Missing fixture ${id}`);
      const before = JSON.stringify(entry.document);
      const legacy = renderToStaticMarkup(
        await Page({ searchParams: Promise.resolve({ case: id }) }),
      );
      const editor = renderToStaticMarkup(
        await EditorPage({ searchParams: Promise.resolve({ case: id }) }),
      );
      expect(legacy).toBe(editor);
      expect(legacy).toContain("Editing a local copy of");
      expect(legacy).toContain(`/gallery/view?case=${encodeURIComponent(id)}`);
      expect(legacy).toContain('href="/editor" aria-current="page"');
      expect(legacy).not.toContain('class="landing"');
      expect(JSON.stringify(entry.document)).toBe(before);
    },
  );

  test.each([
    { case: "unknown" },
    { case: "" },
    { case: ["rc-lowpass/audio-low/geist-light", "unknown"] as string[] },
  ])(
    "legacy case query %j rejects invalid or ambiguous input instead of falling back",
    async (params) => {
      await expect(Page({ searchParams: Promise.resolve(params) })).rejects.toThrow(
        "NEXT_HTTP_ERROR_FALLBACK;404",
      );
    },
  );

  test("all app headers use CircuitKit and point Editor at the dedicated route", async () => {
    const pages = [
      await EditorPage(),
      await GalleryPage({ searchParams: Promise.resolve({ q: "no-matching-case" }) }),
      await FigurePage({
        searchParams: Promise.resolve({ case: "rc-lowpass/audio-low/geist-light" }),
      }),
      LessonPage(),
    ];
    for (const page of pages) {
      const html = renderToStaticMarkup(page);
      expect(html).toContain('class="wordmark" href="/">CircuitKit');
      expect(html).toMatch(/href="\/editor"(?: aria-current="page")?>Editor<\/a>/);
      expect(html).not.toContain('href="/">Editor</a>');
      expect(html).not.toContain("Circuit Figures");
      expect(html).not.toContain("Local-only MVP");
      expect(html).not.toContain("UNLICENSED");
    }
  });
});
