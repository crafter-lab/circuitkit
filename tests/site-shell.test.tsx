import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import type { ReactNode } from "react";
import { renderToStaticMarkup, renderToString } from "react-dom/server";
import EditorPage from "../app/editor/page.tsx";
import { getGalleryCase } from "../app/gallery/corpus.ts";
import GalleryPage from "../app/gallery/page.tsx";
import FigurePage from "../app/gallery/view/page.tsx";

import LessonPage from "../app/lesson/page.tsx";

import Page from "../app/page.tsx";
import { SiteFooter } from "../app/site-footer.tsx";
import { SiteHeader } from "../app/site-header.tsx";
import { AppThemeProvider, useSiteTheme } from "../app/theme-provider.tsx";
import { getCatalog, getSchema, loadExample, renderSVG } from "../src/index.ts";
import { CircuitFigure } from "../src/react.tsx";
import { recipeSchema, themePresetSchema } from "../src/schema.ts";
import hashes from "./fixtures/unannotated-svg-hashes.json";

const sourceURL = "https://github.com/crafter-lab/circuitkit";
const readApp = (path: string) => readFileSync(new URL(`../app/${path}`, import.meta.url), "utf8");
const compose = (page: ReactNode) => (
  <AppThemeProvider>
    <SiteHeader />
    {page}
    <SiteFooter />
  </AppThemeProvider>
);
const fixture = "rc-lowpass/audio-low/geist-dark";
const routes = [
  { path: "page.tsx", page: () => Page() },
  { path: "editor/page.tsx", page: () => EditorPage(), heading: "Circuits, made legible." },
  {
    path: "gallery/page.tsx",
    page: () => GalleryPage({ searchParams: Promise.resolve({ q: "no-matching-case" }) }),
    heading: "Different topologies. Clear connections.",
  },
  {
    path: "gallery/view/page.tsx",
    page: () => FigurePage({ searchParams: Promise.resolve({ case: fixture }) }),
    heading: "Electrical nodes &amp; connectivity",
  },
  { path: "lesson/page.tsx", page: () => LessonPage(), heading: "Follow the wire." },
];

function ThemeProbe() {
  const { theme, mounted } = useSiteTheme();
  return <output data-site-theme={theme} data-mounted={String(mounted)} />;
}

function normalizeReactIds(html: string) {
  const ids = new Map<string, string>();
  return html.replace(/_R_[a-zA-Z0-9]+_/g, (id) => {
    const normalized = ids.get(id) ?? `_react-${ids.size}_`;
    ids.set(id, normalized);
    return normalized;
  });
}

describe("shared site shell SSR", () => {
  test.each(routes)("$path owns one content main and no local shell", async ({ path, page }) => {
    const content = await page();
    const bare = renderToStaticMarkup(content);
    expect(bare.match(/<main\b/g)).toHaveLength(1);
    expect(bare.match(/\bid="main"/g)).toHaveLength(1);
    expect(bare).not.toMatch(/<(?:header|footer)\b/);
    expect(bare).not.toContain('href="#main"');
    expect(bare).not.toContain('aria-label="Dark theme"');
    expect(bare.match(/<h1\b/g)).toHaveLength(1);
    const source = readApp(path);
    expect(source).not.toMatch(/["']use client["']/);
    expect(source).not.toMatch(/LandingShell|SiteHeader|SiteFooter|AppThemeProvider/);

    const html = renderToStaticMarkup(compose(content));
    expect(html.match(/<header\b/g)).toHaveLength(1);
    expect(html.match(/<footer\b/g)).toHaveLength(1);
    expect(html.match(/<main\b/g)).toHaveLength(1);
    expect(html.match(/\bid="main"/g)).toHaveLength(1);
    expect(html.match(/aria-label="Dark theme"/g)).toHaveLength(1);
    const main = html.match(/<main\b[\s\S]*?<\/main>/)?.[0];
    const bareMain = bare.match(/<main\b[\s\S]*?<\/main>/)?.[0];
    expect(main).toBeDefined();
    expect(bareMain).toBeDefined();
    expect(normalizeReactIds(main ?? "")).toBe(normalizeReactIds(bareMain ?? ""));
    const ids = [...html.matchAll(/\sid="([^"]+)"/g)].map((match) => match[1]);
    expect(new Set(ids).size).toBe(ids.length);
    for (const match of html.matchAll(/aria-(?:controls|describedby|labelledby)="([^"]+)"/g)) {
      for (const reference of (match[1] ?? "").split(" ")) expect(ids).toContain(reference);
    }
    expect(html).toMatch(/<a[^>]*class="wordmark"[^>]*href="\/"[^>]*>CircuitKit<\/a>/);
    for (const href of ["/editor?mode=circuitkit", "/gallery", "/docs"])
      expect(html).toContain(`href="${href}"`);
    expect(html).toContain('aria-label="Main navigation"');
    expect(html).toContain('href="https://crafter.run"');
    expect(html).toContain(`href="${sourceURL}/blob/main/LICENSE">Apache-2.0</a>`);
    expect(html).toContain(`href="${sourceURL}"`);
    expect(html).toContain("not simulation, electrical-safety approval, or a fabrication system.");
    expect(html).not.toContain('href="/">Editor</a>');
    for (const obsolete of ["Circuit Figures", "Local-only MVP", "UNLICENSED"]) {
      expect(html).not.toContain(obsolete);
    }
  });

  test("RootLayout wires one provider, skip link, header and footer around route content", () => {
    const source = readApp("layout.tsx");
    expect(source.match(/<AppThemeProvider\b/g)).toHaveLength(1);
    expect(source.match(/<SiteHeader\s*\/>/g)).toHaveLength(1);
    expect(source.match(/<SiteFooter\s*\/>/g)).toHaveLength(1);
    expect(source.match(/href="#main"/g)).toHaveLength(1);
    expect(source.match(/\{children\}/g)).toHaveLength(1);
    expect(source).toMatch(/<html\b[^>]*suppressHydrationWarning/);
    expect(source).toMatch(
      /<AppThemeProvider>[\s\S]*href="#main"[\s\S]*Skip to content[\s\S]*<SiteHeader\s*\/>[\s\S]*\{children\}[\s\S]*<SiteFooter\s*\/>[\s\S]*<\/AppThemeProvider>/,
    );
    expect(source).not.toMatch(/<main\b|id="main"/);
    expect(source).toContain('import "./globals.css"');
  });

  test("next-themes initializes the HTML class before content with deterministic light SSR controls", async () => {
    const tree = compose(
      <>
        <ThemeProbe />
        {await Page()}
      </>,
    );
    const html = renderToString(tree, { identifierPrefix: "site-shell-" });
    expect(renderToString(tree, { identifierPrefix: "site-shell-" })).toBe(html);
    expect(html).toStartWith("<script");
    expect(html.match(/<script\b(?![^>]*type="application\/ld\+json")/g)).toHaveLength(1);
    expect(html.indexOf("</script>")).toBeLessThan(html.indexOf("<header"));
    expect(html).toContain("document.documentElement");
    expect(html).toContain("classList");
    expect(html).toContain("colorScheme");
    expect(html).toContain("localStorage.getItem");
    expect(html).toContain('"class","circuitkit-theme","system"');
    expect(html).toContain('data-site-theme="light" data-mounted="false"');
    expect(html).toMatch(
      /<button\b[^>]*aria-label="Dark theme"[^>]*aria-pressed="false"[^>]*disabled=""/,
    );
    expect(html).not.toContain("data-theme=");
    expect(html).toContain('data-figure-theme="geist-light"');
    expect(html).toContain('data-story-step="connect"');
    expect(html).not.toContain('class="presentation-sweep"');
    expect(html).toContain('alt="A digital audio signal path.');
    const client = readApp("landing/landing-client.tsx");
    expect(client).toContain("useSiteTheme()");
    expect(client).not.toMatch(/LandingShell|createContext|data-theme=/);
  });

  test.each(hashes)(
    "$recipe/$preset retains immutable unannotated SVG bytes inside the global shell",
    ({ recipe, preset, sha256 }) => {
      const document = loadExample(recipeSchema.parse(recipe));
      document.presentation.theme.preset = themePresetSchema.parse(preset);
      const before = JSON.stringify(document);
      expect(document.presentation.annotations).toBeUndefined();
      const result = renderSVG(document);
      if (!result.ok) throw new Error(JSON.stringify(result.diagnostics));
      const html = renderToStaticMarkup(compose(<CircuitFigure document={document} />));
      const svg = html.match(/<svg\b[\s\S]*?<\/svg>/)?.[0];
      expect(svg).toBe(result.svg);
      expect(new Bun.CryptoHasher("sha256").update(svg ?? "").digest("hex")).toBe(sha256);
      expect(JSON.stringify(document)).toBe(before);
    },
  );

  test("HTML and body share global background tokens in both root class states", () => {
    const css = readApp("globals.css");
    expect(css).toMatch(/:root\s*\{[^}]*--background:\s*#ffffff;/);
    expect(css).toMatch(/:root\.dark\s*\{[^}]*--background:\s*#141414;[^}]*color-scheme:\s*dark;/);
    expect(css).toMatch(
      /html,\s*body\s*\{[^}]*background:\s*var\(--background\);[^}]*color:\s*var\(--foreground\);/,
    );
    expect(readApp("landing/landing.css")).not.toMatch(/\[data-theme(?:\s*=|\])/);
  });

  test("light site SSR preserves dark authored detail SVG, source, diagnostics and exports", async () => {
    for (const id of [fixture, "rc-lowpass/unknown-pin/geist-dark"]) {
      const entry = getGalleryCase(id);
      if (!entry) throw new Error(`Missing fixture ${id}`);
      const before = JSON.stringify(entry.document, null, 2);
      const result = renderSVG(entry.document);
      const html = renderToStaticMarkup(
        compose(await FigurePage({ searchParams: Promise.resolve({ case: id }) })),
      );
      expect(html).toContain(renderToStaticMarkup(before));
      expect(html).toContain(`/gallery/document?case=${encodeURIComponent(id)}`);
      expect(html).toContain(`/editor?case=${encodeURIComponent(id)}#main`);
      if (result.ok) {
        expect(html.match(/<svg\b[\s\S]*?<\/svg>/)?.[0]).toBe(result.svg);
        expect(html).toContain("Normalized net connectivity table");
        expect(html).toContain(`/gallery/figure?case=${encodeURIComponent(id)}&amp;download=1`);
      } else {
        expect(html).not.toContain("<svg");
        expect(html).toContain("SVG export unavailable");
        for (const diagnostic of result.diagnostics) expect(html).toContain(diagnostic.code);
      }
      expect(JSON.stringify(entry.document, null, 2)).toBe(before);
    }
  });

  test("site theme does not replace gallery preset filters", async () => {
    const html = renderToStaticMarkup(
      compose(
        await GalleryPage({
          searchParams: Promise.resolve({
            group: "edge-cases",
            recipe: "rc-lowpass",
            theme: "geist-dark",
            q: "unknown-pin",
          }),
        }),
      ),
    );
    expect(html.match(/class="gallery-card"/g)).toHaveLength(1);
    expect(html).toContain(
      "case=rc-lowpass%2Funknown-pin%2Fgeist-dark&amp;group=edge-cases&amp;recipe=rc-lowpass&amp;theme=geist-dark&amp;q=unknown-pin",
    );
    expect(html).toContain('aria-pressed="false" disabled=""');
  });

  test("editor reference and lesson document controls stay inside their content mains", async () => {
    const editor = renderToStaticMarkup(compose(await EditorPage()));
    expect(editor).toContain(renderToStaticMarkup(JSON.stringify(getSchema(), null, 2)));
    expect(editor).toContain(renderToStaticMarkup(JSON.stringify(getCatalog(), null, 2)));
    expect(editor).toContain('class="workbench editor-workbench"');
    const lesson = renderToStaticMarkup(compose(LessonPage()));
    expect(lesson).toContain('aria-label="Host document controls"');
    expect(lesson).toContain("Figure theme");
    expect(lesson).toContain('value="geist-print"');
    expect(lesson).toContain("Invalid divider document (QA)");
    expect(lesson).toContain('id="divider-heading"');
    expect(lesson).toContain('id="amplifier-heading"');
    expect(lesson.match(/data-mode="interactive"/g)).toHaveLength(2);
    expect(lesson.match(/Download figure SVG/g)).toHaveLength(2);
  });
});
