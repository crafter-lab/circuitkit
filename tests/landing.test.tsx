import { describe, expect, test } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";
import EditorPage from "../app/editor/page.tsx";
import { getGalleryCase } from "../app/gallery/corpus.ts";
import {
  copyInstallCommand,
  InstallCommand,
  InstallCopyStatus,
} from "../app/landing/install-actions.tsx";
import { LandingFigurePreview } from "../app/landing/landing-client.tsx";
import { dividerLesson } from "../app/lesson/documents.ts";
import Page from "../app/page.tsx";
import { renderSchematicSVG } from "../src/index.ts";
import { resolveLessonFigure } from "../src/lesson-figure.tsx";
import { decodeShareDocument } from "../src/share.ts";

function firstDiagram(markup: string) {
  return markup
    .match(/<svg\b[\s\S]*?<\/svg>/)?.[0]
    ?.replace(/ style="display:block;(?:width|max-width):100%;height:auto"/, "");
}

describe("figure handoff", () => {
  test("interactive preview opts into the compact hit layer, not the expanded lesson", () => {
    const html = renderToStaticMarkup(
      <LandingFigurePreview
        document={dividerLesson("geist-light", 10000)}
        activeNet={null}
        onActiveNetChange={() => {}}
        initialMode="interactive"
        mounted
      />,
    );
    expect(html).toContain('data-preview-mode="interactive"');
    expect(html).toContain('data-layout="compact"');
    expect(html).toContain("circuit-lesson-hit-layer");
    expect(html).not.toContain('data-layout="expanded"');
  });

  test.each(
    (["geist-light", "geist-dark"] as const).flatMap((theme) =>
      [null, "input", "output", "ground"].map((activeNet) => ({ theme, activeNet })),
    ),
  )("handoff retains $theme and persistent net $activeNet", ({ theme, activeNet }) => {
    const document = dividerLesson(theme, 10000);
    const before = JSON.stringify(document);
    const persisted = resolveLessonFigure(document, activeNet);
    if (!persisted.ok) throw new Error(JSON.stringify(persisted.diagnostics));
    const preview = (
      <LandingFigurePreview
        document={document}
        activeNet={activeNet}
        onActiveNetChange={() => {}}
        mounted
      />
    );
    const html = renderToStaticMarkup(preview);
    const href = html.match(/href="(\/editor#v=1&amp;doc=[^"]+)"/)?.[1];
    expect(href).toBeDefined();
    const url = new URL((href ?? "").replaceAll("&amp;", "&"), "https://circuitkit.test");
    expect(url.pathname).toBe("/editor");
    expect(url.search).toBe("");
    const decoded = decodeShareDocument(url.hash);
    if (!decoded.ok) throw new Error(JSON.stringify(decoded.diagnostics));
    expect(decoded.document).toEqual(persisted.document);
    expect(decoded.document.presentation.theme.preset).toBe(theme);
    expect(decoded.document.presentation.highlight?.nets).toEqual(activeNet ? [activeNet] : []);
    expect(decoded.document.presentation.annotations).toEqual(document.presentation.annotations);
    expect(decoded.document.presentation.steps).toEqual(document.presentation.steps);
    const schematic = renderSchematicSVG(persisted.document);
    if (!schematic.ok) throw new Error(JSON.stringify(schematic.diagnostics));
    expect(firstDiagram(html)).toBe(schematic.svg);
    const transient = resolveLessonFigure(
      persisted.document,
      activeNet === "input" ? "output" : "input",
    );
    expect(transient.ok).toBe(true);
    if (transient.ok) expect(transient.svg).not.toBe(persisted.svg);
    expect(renderToStaticMarkup(preview).match(/href="(\/editor#v=1&amp;doc=[^"]+)"/)?.[1]).toBe(
      href,
    );
    expect(JSON.stringify(document)).toBe(before);
  });

  test("invalid selection has no misleading image or editor URL", () => {
    const html = renderToStaticMarkup(
      <LandingFigurePreview
        document={dividerLesson("geist-light", 10000)}
        activeNet="missing"
        onActiveNetChange={() => {}}
        mounted
      />,
    );
    expect(html).toContain('role="alert"');
    expect(html).not.toContain('href="/editor');
    expect(html).not.toContain("<svg");
  });

  test("schematic PNG preserves dimensions, scale and native file signature", async () => {
    const document = await Bun.file(
      new URL("../examples/voltage-divider.json", import.meta.url),
    ).json();
    const { renderPNG } = await import("../src/png.ts");
    const result = await renderPNG(document, { schematic: true, scale: 2 });
    if (!result.ok) throw new Error(JSON.stringify(result.diagnostics));
    expect(result.format).toBe("png");
    expect(result.scale).toBe(2);
    expect(result.width).toBe(Math.ceil(result.bounds.width * 2));
    expect(result.height).toBe(Math.ceil(result.bounds.height * 2));
    expect(Array.from(result.png.slice(0, 8))).toEqual([137, 80, 78, 71, 13, 10, 26, 10]);
  });
});

describe("installation clipboard", () => {
  const command = "npx skills add crafter-lab/circuitkit --skill circuitkit";
  test("copies exact command and waits for clipboard resolution", async () => {
    const copied: string[] = [];
    const status = await copyInstallCommand(command, {
      writeText: async (text) => {
        copied.push(text);
      },
    });
    expect(copied).toEqual([command]);
    expect(status).toBe("copied");
    expect(renderToStaticMarkup(<InstallCopyStatus id="status" status={status} />)).toContain(
      'role="status" aria-live="polite"',
    );
  });
  test("rejection or missing clipboard never reports success", async () => {
    expect(
      await copyInstallCommand(command, {
        writeText: async () => {
          throw new Error("denied");
        },
      }),
    ).toBe("failed");
    expect(await copyInstallCommand(command, undefined)).toBe("failed");
    const html = renderToStaticMarkup(<InstallCommand label="Install" command={command} />);
    expect(html).toContain(`<pre><code>${command}</code></pre>`);
    expect(html).toContain('aria-describedby="');
    expect(html).toContain('tabindex="0"');
  });
});

describe("landing and editor route compatibility", () => {
  test.each(["rc-lowpass/audio-low/geist-light", "rc-lowpass/schema-si-string/geist-dark"])(
    "legacy case %s preserves editor output exactly",
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
      expect(legacy).toContain(`/gallery/view?case=${encodeURIComponent(id)}`);
      expect(legacy.match(/<main\b[^>]*\bid="main"/g)).toHaveLength(1);
      expect(JSON.stringify(entry.document)).toBe(before);
    },
  );
  test.each([
    { case: "unknown" },
    { case: "" },
    { case: ["rc-lowpass/audio-low/geist-light", "unknown"] as string[] },
  ])("invalid or ambiguous legacy case %j is a true 404", async (params) => {
    await expect(Page({ searchParams: Promise.resolve(params) })).rejects.toThrow(
      "NEXT_HTTP_ERROR_FALLBACK;404",
    );
  });
});
