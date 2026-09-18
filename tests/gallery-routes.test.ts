import { describe, expect, test } from "bun:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import EditorPage from "../app/editor/page.tsx";
import { getGalleryCase, getGalleryCases } from "../app/gallery/corpus.ts";
import { GET as documentGET } from "../app/gallery/document/route.ts";
import { GET as figureGET } from "../app/gallery/figure/route.ts";
import GalleryPage from "../app/gallery/page.tsx";
import FigurePage from "../app/gallery/view/page.tsx";
import Playground from "../app/playground.tsx";
import { getCatalog, loadExample, renderSVG } from "../src/index.ts";
import { basicRecipeIds, complexRecipeIds as complexIds, type RecipeId } from "../src/schema.ts";

const request = (route: "figure" | "document", id?: string, download = false) => {
  const url = new URL(`/gallery/${route}`, "http://127.0.0.1:3218");
  if (id !== undefined) url.searchParams.set("case", id);
  if (download) url.searchParams.set("download", "1");
  return new Request(url);
};
const cases = getGalleryCases;
const complexRecipeIds = [...complexIds];
const catalog = getCatalog();
const escapeHTML = (text: string) =>
  text
    .replaceAll("&", "&amp;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#x27;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");

describe("local gallery routes", () => {
  for (const [name, handler] of [
    ["figure", figureGET],
    ["document", documentGET],
  ] as const) {
    test.each([
      undefined,
      "",
      "unknown",
      "../../src/index.ts",
      "rc-lowpass/audio-low/geist-light/extra",
      "rc-lowpass%2Faudio-low%2Fgeist-light",
      "constructor",
    ])(`${name} refuses missing or unknown case %j`, async (id) => {
      const response = handler(request(name, id, true));
      expect(response.status).toBe(404);
      expect(response.headers.get("content-type")).toContain("application/json");
      expect(response.headers.get("content-disposition")).toBeNull();
      expect(await response.json()).toMatchObject({
        ok: false,
        diagnostics: [{ code: "gallery.unknown_case", path: "/case" }],
      });
    });
  }

  test("every renderable case returns byte-identical public core SVG", async () => {
    let rendered = 0;
    for (const entry of cases()) {
      const result = renderSVG(entry.document);
      if (entry.expectation.kind === "render") {
        expect({ id: entry.id, rendered: result.ok }).toEqual({ id: entry.id, rendered: true });
      }
      if (!result.ok) continue;
      rendered++;
      const response = figureGET(request("figure", entry.id));
      expect(response.status).toBe(200);
      expect(response.headers.get("content-type")).toBe("image/svg+xml;charset=utf-8");
      expect(response.headers.get("content-disposition")).toBe(
        `inline; filename="${entry.id.replaceAll("/", "-")}.svg"`,
      );
      expect(response.headers.get("x-content-type-options")).toBe("nosniff");
      expect(new Uint8Array(await response.arrayBuffer())).toEqual(
        new TextEncoder().encode(result.svg),
      );
    }
    expect(rendered).toBeGreaterThan(0);
  }, 60_000);

  test("SVG download uses curated slash-separated IDs and the same bytes", async () => {
    const entry = getGalleryCase("rc-lowpass/audio-low/geist-light");
    expect(entry).toBeDefined();
    const result = renderSVG(entry?.document);
    expect(result.ok).toBe(true);
    if (!result.ok || !entry) throw new Error("Reference case did not render");
    const response = figureGET(request("figure", entry.id, true));
    expect(response.status).toBe(200);
    expect(response.headers.get("content-disposition")).toBe(
      'attachment; filename="rc-lowpass-audio-low-geist-light.svg"',
    );
    expect(await response.text()).toBe(result.svg);
  });

  test("every diagnostic case refuses inline and downloadable SVG with core diagnostics", async () => {
    for (const entry of cases().filter(
      (candidate) => candidate.expectation.kind === "diagnostic",
    )) {
      const result = renderSVG(entry.document);
      expect(result.ok).toBe(false);
      for (const download of [false, true]) {
        const response = figureGET(request("figure", entry.id, download));
        expect(response.status).toBe(422);
        expect(response.headers.get("content-type")).toContain("application/json");
        expect(response.headers.get("content-disposition")).toBeNull();
        expect(await response.json()).toEqual(result);
      }
    }
  }, 60_000);

  test("JSON exports exact original sources, including invalid and non-normalized documents", async () => {
    for (const entry of cases()) {
      const response = documentGET(request("document", entry.id));
      expect(response.status).toBe(200);
      expect(response.headers.get("content-type")).toBe("application/json;charset=utf-8");
      expect(response.headers.get("content-disposition")).toBe(
        `attachment; filename="${entry.id.replaceAll("/", "-")}.json"`,
      );
      const source = await response.text();
      expect(source).toBe(`${JSON.stringify(entry.document, null, 2)}\n`);
      expect(JSON.parse(source)).toEqual(entry.document);
    }
  }, 60_000);

  test("unknown-pin rejection preserves valid pins and a JSON pointer", async () => {
    const response = figureGET(request("figure", "rc-lowpass/unknown-pin/geist-light", true));
    const result = await response.json();
    expect(response.status).toBe(422);
    expect(result.diagnostics).toContainEqual(
      expect.objectContaining({
        code: "circuit.unknown_pin",
        path: expect.stringMatching(/^\//),
        validPins: ["a", "b"],
      }),
    );
  });
});

describe("gallery pages", () => {
  test("default collection shows every current example as local lazy images, not inline SVG", async () => {
    const examples = cases().filter((entry) => entry.group === "examples");
    const basic = new Set<RecipeId>(basicRecipeIds);
    expect(examples.filter((entry) => basic.has(entry.recipe))).toHaveLength(156);
    const html = renderToStaticMarkup(await GalleryPage({}));
    expect(html.match(/class="gallery-card"/g)).toHaveLength(examples.length);
    expect(html.match(/loading="lazy"/g)).toHaveLength(examples.length);
    expect(html.match(/decoding="async"/g)).toHaveLength(examples.length);
    expect(html).toContain("/gallery/figure?case=rc-lowpass%2Fslow-sensor%2Fgeist-light");
    expect(html).not.toContain("<svg");
    expect(html).not.toContain("&quot;circuit&quot;");
    expect(html).toContain("Run stress test");
    expect(html).not.toContain("Download JSON report");
  });

  test("the first cards represent each complex topology before repeated variants", async () => {
    const html = renderToStaticMarkup(await GalleryPage({}));
    const ids = [
      ...html.matchAll(/class="gallery-card"><a[^>]+href="\/gallery\/view\?case=([^&"]+)/g),
    ].map((match) => decodeURIComponent(match[1] ?? ""));
    expect(ids.slice(0, complexRecipeIds.length).map((id) => id.split("/")[0])).toEqual([
      ...complexRecipeIds,
    ]);
    expect(new Set(ids.slice(0, catalog.recipes.length).map((id) => id.split("/")[0])).size).toBe(
      catalog.recipes.length,
    );
    for (const recipe of catalog.recipes)
      expect(html.includes(escapeHTML(recipe.title))).toBe(true);
    expect(html).toContain(`${catalog.recipes.length} distinct topologies`);
    expect(html).toContain("Drawing, not simulation.");
  });

  test.each(complexRecipeIds)(
    "complex topology %s is filterable using catalog metadata",
    async (recipe) => {
      const count = cases().filter(
        (entry) => entry.group === "examples" && entry.recipe === recipe,
      ).length;
      expect(count).toBeGreaterThan(0);
      const html = renderToStaticMarkup(
        await GalleryPage({ searchParams: Promise.resolve({ recipe }) }),
      );
      expect(html.match(/class="gallery-card"/g)).toHaveLength(count);
      expect(html).toContain(`&amp;recipe=${recipe}`);
      expect(html).toContain("Complex topology");
    },
  );

  test("all category has no artificial pagination", async () => {
    const html = renderToStaticMarkup(
      await GalleryPage({ searchParams: Promise.resolve({ group: "all" }) }),
    );
    expect(html.match(/class="gallery-card"/g)).toHaveLength(cases().length);
    expect(html).toContain("Rejected as expected");
    expect(html.includes("Unexpected result")).toBe(false);
  });

  test("recipe, theme, category and search filters compose and survive the detail link", async () => {
    const html = renderToStaticMarkup(
      await GalleryPage({
        searchParams: Promise.resolve({
          group: "edge-cases",
          recipe: "rc-lowpass",
          theme: "geist-dark",
          q: "unknown-pin",
        }),
      }),
    );
    expect(html.match(/class="gallery-card"/g)).toHaveLength(1);
    expect(html).toContain(
      "case=rc-lowpass%2Funknown-pin%2Fgeist-dark&amp;group=edge-cases&amp;recipe=rc-lowpass&amp;theme=geist-dark&amp;q=unknown-pin",
    );
    expect(html).toContain("Expected rejection");
  });

  test("empty selection offers a reset instead of a blank grid", async () => {
    const html = renderToStaticMarkup(
      await GalleryPage({ searchParams: Promise.resolve({ q: "not-in-the-corpus-123" }) }),
    );
    expect(html).not.toContain('class="gallery-card"');
    expect(html).toContain("No matching cases");
    expect(html).toContain("Reset filters");
  });

  test("detail embeds only actual core SVG with source, exports and category navigation", async () => {
    const id = "rc-lowpass/audio-low/geist-light";
    const result = renderSVG(getGalleryCase(id)?.document);
    if (!result.ok) throw new Error("Reference case did not render");
    const html = renderToStaticMarkup(
      await FigurePage({
        searchParams: Promise.resolve({ case: id, group: "examples", q: "audio" }),
      }),
    );
    expect(html).toContain(result.svg);
    expect(html).toContain(`/editor?case=${encodeURIComponent(id)}#main`);
    expect(html).toContain("Open in editor");
    expect(html).toContain(`/gallery/figure?case=${encodeURIComponent(id)}&amp;download=1`);
    expect(html).toContain("/gallery?group=examples&amp;q=audio#collection-heading");
    expect(html).toContain("Previous example");
    expect(html).toContain("Next example");
    expect(html).toContain("Original figure document");
    expect(html).toContain("Expectation matched");
  });

  test.each(complexRecipeIds)(
    "%s detail reports normalized electrical connectivity, not drawing junctions",
    async (recipe) => {
      const entry = cases().find(
        (candidate) => candidate.recipe === recipe && candidate.group === "examples",
      );
      if (!entry) throw new Error(`No gallery example for ${recipe}`);
      const result = renderSVG(entry.document);
      if (!result.ok) throw new Error(`${entry.id}: ${JSON.stringify(result.diagnostics)}`);
      const html = renderToStaticMarkup(
        await FigurePage({ searchParams: Promise.resolve({ case: entry.id }) }),
      );
      const nets = Object.entries(result.circuit.nets);
      const pins = Object.values(result.circuit.components).reduce(
        (sum, component) => sum + catalog.components[component.type].pins.length,
        0,
      );
      expect(html).toContain(
        `<dt>Components</dt><dd>${Object.keys(result.circuit.components).length}</dd>`,
      );
      expect(html).toContain(`<dt>Electrical nodes / nets</dt><dd>${nets.length}</dd>`);
      expect(html).toContain(`<dt>Component pins</dt><dd>${pins}</dd>`);
      expect(html).toContain(
        `<dt>Connected endpoints</dt><dd>${nets.reduce((sum, [, endpoints]) => sum + endpoints.length, 0)}</dd>`,
      );
      for (const [id, endpoints] of nets) {
        expect(html).toContain(
          `<th scope="row"><code>${escapeHTML(id)}</code></th><td>${endpoints.length}</td>`,
        );
        for (const endpoint of endpoints)
          expect(html).toContain(`<li><code>${escapeHTML(endpoint)}</code></li>`);
      }
      expect(html).toContain('class="gallery-figure-scroll"');
      expect(html).toContain("geometric junction dots");
      expect(html).toContain("No voltages, currents, or simulation results are inferred.");
    },
  );

  test("rejected detail explains passing diagnostics, valid pins and unavailable SVG", async () => {
    const html = renderToStaticMarkup(
      await FigurePage({
        searchParams: Promise.resolve({ case: "rc-lowpass/unknown-pin/geist-light" }),
      }),
    );
    expect(html).not.toContain("<svg");
    expect(html).not.toContain("Download SVG");
    expect(html).toContain("SVG export unavailable");
    expect(html).toContain("This rejection is the correct result.");
    expect(html).toContain("JSON pointer");
    expect(html).toContain("Valid pins");
    expect(html).toContain("circuit.unknown_pin");
    expect(html).toContain("Download JSON");
  });

  test.each([undefined, "", "unknown"])("detail rejects missing or unknown case %j", async (id) => {
    await expect(FigurePage({ searchParams: Promise.resolve({ case: id }) })).rejects.toThrow(
      "NEXT_HTTP_ERROR_FALLBACK;404",
    );
  });
});

describe("gallery editor handoff", () => {
  test.each(complexRecipeIds)(
    "%s source remains canonical and type-only devices have no numeric controls",
    (recipe) => {
      const document = loadExample(recipe);
      const before = JSON.stringify(document, null, 2);
      const html = renderToStaticMarkup(
        createElement<{ initialDocument?: unknown }>(Playground, { initialDocument: document }),
      );
      expect(html.includes(escapeHTML(before))).toBe(true);
      expect(JSON.stringify(document, null, 2)).toBe(before);
      expect(html).toContain("Checking share link");
      expect(html).not.toContain("<svg");
      expect(html).toMatch(/<button[^>]*disabled=""[^>]*>Download SVG/);
      expect(html).not.toContain('value="undefined"');
      for (const [id, component] of Object.entries(document.circuit.components)) {
        const numeric =
          component.type === "resistor" ||
          component.type === "capacitor" ||
          component.type === "dc-source";
        const label =
          component.type === "resistor"
            ? "resistance"
            : component.type === "capacitor"
              ? "capacitance"
              : "voltage";
        expect(html.includes(`${escapeHTML(id)} · ${label}`)).toBe(numeric);
      }
    },
  );

  test.each(complexRecipeIds)(
    "%s opens from the gallery with its full source and origin link",
    async (recipe) => {
      const entry = cases().find(
        (candidate) => candidate.recipe === recipe && candidate.group === "examples",
      );
      if (!entry) throw new Error(`No gallery example for ${recipe}`);
      const html = renderToStaticMarkup(
        await EditorPage({ searchParams: Promise.resolve({ case: entry.id }) }),
      );
      expect(html).toContain(`/gallery/view?case=${encodeURIComponent(entry.id)}`);
      expect(html.includes(escapeHTML(JSON.stringify(entry.document, null, 2)))).toBe(true);
      expect(html).toContain("Checking share link");
      expect(html).not.toContain("<svg");
      expect(html).toMatch(/<button[^>]*disabled=""[^>]*>Download SVG/);
    },
  );

  test.each(["schema-si-string", "schema-extra-field", "unsupported-version", "unknown-pin"])(
    "preserves %s source and diagnostics rather than the default RC",
    (scenario) => {
      const entry = getGalleryCase(`rc-lowpass/${scenario}/geist-dark`);
      if (!entry) throw new Error(`Missing case ${scenario}`);
      const expected = renderSVG(entry.document);
      expect(expected.ok).toBe(false);
      const html = renderToStaticMarkup(
        createElement<{ initialDocument?: unknown }>(Playground, {
          initialDocument: entry.document,
        }),
      );
      const escaped = (text: string) =>
        text
          .replaceAll("&", "&amp;")
          .replaceAll('"', "&quot;")
          .replaceAll("'", "&#x27;")
          .replaceAll("<", "&lt;")
          .replaceAll(">", "&gt;");
      expect(html).toContain(escaped(JSON.stringify(entry.document, null, 2)));
      expect(html).toContain("A correction is needed.");
      expect(html).not.toContain("Ready to export");
      for (const diagnostic of expected.diagnostics) expect(html).toContain(diagnostic.code);
    },
  );

  test("editor with no case retains its default source while awaiting fragment inspection", async () => {
    const html = renderToStaticMarkup(await EditorPage());
    expect(html).toContain("Circuits, made legible.");
    expect(html).toContain("Checking share link");
    expect(html).not.toContain("<svg");
    expect(html).toMatch(/<button[^>]*disabled=""[^>]*>Download SVG/);
    expect(html).toContain("Document JSON schema");
    expect(html).toContain("Recipes, pins &amp; SI parameters");
    expect(html).not.toContain("Editing a local copy of");
  });

  test("editor links back to the origin case without replacing invalid input", async () => {
    const id = "rc-lowpass/schema-si-string/geist-dark";
    const html = renderToStaticMarkup(
      await EditorPage({ searchParams: Promise.resolve({ case: id }) }),
    );
    expect(html).toContain(`/gallery/view?case=${encodeURIComponent(id)}`);
    expect(html).toContain("Editing a local copy of");
    expect(html).toContain("document.invalid_field");
    expect(html).toContain("10k");
    expect(html).not.toContain("Ready to export");
  });

  test("an unknown editor case does not silently load the default", async () => {
    await expect(
      EditorPage({ searchParams: Promise.resolve({ case: "not-a-case" }) }),
    ).rejects.toThrow("NEXT_HTTP_ERROR_FALLBACK;404");
  });
});
