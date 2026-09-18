import { describe, expect, test } from "bun:test";
import { renderToStaticMarkup, renderToString } from "react-dom/server";
import { amplifierLesson, dividerLesson } from "../app/lesson/documents.ts";
import { renderFigureSVG } from "../src/figure-svg.ts";
import {
  exportLessonFigure,
  nearestAnnotationNet,
  resolveLessonFigure,
} from "../src/lesson-figure.tsx";
import { CircuitLessonFigure, CircuitLessonSequence, CircuitSchematic } from "../src/react.tsx";
import { renderSchematicSVG, renderSVG } from "../src/renderer.ts";
import { themePresets } from "../src/schema.ts";
import type { RenderResult } from "../src/types.ts";

function success(result: RenderResult) {
  expect(result.ok, JSON.stringify(result.diagnostics)).toBe(true);
  if (!result.ok) throw new Error(JSON.stringify(result.diagnostics));
  return result;
}

function diagram(markup: string) {
  return markup
    .match(/<svg\b[\s\S]*?<\/svg>/)?.[0]
    ?.replace(' style="display:block;width:100%;height:auto"', "");
}

function withoutNotes(markup: string) {
  return markup.replace(/<details\b[\s\S]*?<\/details>/g, "");
}

describe("compact circuit and teaching layers", () => {
  test("pure adapter ignores lesson chrome even for a fully authored lesson", () => {
    const document = dividerLesson("geist-light", 10000);
    document.presentation.activeStep = "output";
    const markup = renderToStaticMarkup(<CircuitSchematic document={document} />);
    const result = success(renderSchematicSVG(document));
    expect(markup).toContain(
      result.svg.replace("<svg ", '<svg style="display:block;max-width:100%;height:auto" '),
    );
    expect(markup).not.toMatch(
      /<button|<details|<figcaption|data-net-label|data-net-halo|data-caption/,
    );
    expect(markup).not.toContain("circuit-lesson");
  });

  for (const theme of themePresets) {
    test(`${theme}: compact defaults to a tight annotated schematic and one control row`, () => {
      const document = dividerLesson(theme, 10000);
      const result = success(renderSchematicSVG(document, { annotations: true }));
      const markup = renderToStaticMarkup(<CircuitLessonFigure document={document} />);
      const visible = withoutNotes(markup);
      expect(diagram(markup)).toBe(result.svg);
      expect(markup).toContain('data-layout="compact"');
      expect(markup.match(/class="circuit-lesson-static-legend"/g)).toHaveLength(1);
      expect(markup).toContain('class="circuit-lesson-compact-chrome"');
      expect(markup).toContain("min-height:var(--circuit-control-size, 32px)");
      expect(markup).toContain("border-radius:var(--circuit-control-radius, 0px)");
      expect(markup).not.toContain("min-height:360");
      expect(markup).not.toContain("clamp(");
      expect(markup).not.toContain("grid-template-columns:repeat");
      expect(visible).not.toContain("Preview a label");
      expect(visible).not.toContain("Read-only figure");
      expect(visible).not.toContain("<dl");
      expect(visible).not.toContain("<figcaption");
      expect(visible).toContain("circuit-lesson-description-slot");
      expect(visible).not.toContain("circuit-lesson-download");
      expect(markup).toMatch(/<details[^>]*><summary[^>]*>Notes<\/summary>/);
      expect(markup).not.toMatch(/<details[^>]*\sopen/);
      expect(markup).toContain("clip-path:inset(50%)");
      expect(markup).toContain('aria-live="polite"');
    });
  }

  test("only the selected annotation describes the diagram outside closed Notes", () => {
    const document = amplifierLesson("geist-light");
    const result = success(renderSchematicSVG(document, { annotations: true }));
    const markup = renderToStaticMarkup(
      <CircuitLessonFigure document={document} activeNet="summing" download />,
    );
    const visible = withoutNotes(markup).replace(/<svg\b[\s\S]*?<\/svg>/g, "");
    const activeDescriptions = [
      ...visible.matchAll(
        /<p class="circuit-lesson-description"[^>]*aria-hidden="false"[^>]*>([\s\S]*?)<\/p>/g,
      ),
    ];
    expect(activeDescriptions).toHaveLength(1);
    expect(visible.match(/class="circuit-lesson-description"/g)).toHaveLength(
      result.annotations?.nets.length ?? 0,
    );
    for (const annotation of result.annotations?.nets ?? []) {
      if (annotation.net === "summing")
        expect(activeDescriptions[0]?.[1]).toBe(renderToStaticMarkup(annotation.description));
    }
    expect(markup).toContain('class="circuit-lesson-download"');
    expect(markup).not.toMatch(/<\/div><button[^>]*>Download/);
    const bare = renderToStaticMarkup(
      <CircuitLessonFigure
        document={document}
        activeNet="summing"
        notes={false}
        showDescription={false}
      />,
    );
    expect(bare).not.toContain("<details");
    expect(bare).not.toContain("<dl");
    expect(bare).not.toContain("circuit-lesson-caption");
    expect(bare).not.toContain("circuit-lesson-description");
  });

  test("tight nonzero viewBox retains original paths and screen-space hit geometry", () => {
    const document = dividerLesson("geist-light", 10000);
    const legacy = success(renderSVG(document));
    const compact = success(resolveLessonFigure(document, "output", { layout: "compact" }));
    const markup = renderToStaticMarkup(
      <CircuitLessonFigure document={document} activeNet="output" />,
    );
    const viewBoxes = [...markup.matchAll(/viewBox="([^"]+)"/g)].map((match) => match[1]);
    expect(viewBoxes).toHaveLength(2);
    expect(viewBoxes[0]).toBe(viewBoxes[1]);
    const [x = 0, y = 0, width = 0] = (viewBoxes[0] ?? "").split(/\s+/).map(Number);
    expect(x !== 0 || y !== 0).toBe(true);
    expect(compact.annotations?.nets.map(({ paths, segments }) => ({ paths, segments }))).toEqual(
      legacy.annotations?.nets.map(({ paths, segments }) => ({ paths, segments })),
    );
    const scale = 280 / width;
    const matrix = { a: scale, b: 0, c: 0, d: scale, e: 19 - x * scale, f: 31 - y * scale };
    const annotations = compact.annotations?.nets ?? [];
    for (const annotation of annotations) {
      const hits = annotation.segments.map(({ a, b }) => ({
        x: ((a[0] + b[0]) / 2) * scale + matrix.e,
        y: ((a[1] + b[1]) / 2) * scale + matrix.f,
      }));
      expect(
        hits.some((point) => nearestAnnotationNet(annotations, point, matrix) === annotation.net),
      ).toBe(true);
    }
    expect(exportLessonFigure(compact)).toEqual(
      exportLessonFigure(success(resolveLessonFigure(document, "output"))),
    );
  });

  test("download layout is explicit while the export helper keeps its full-figure default", () => {
    const document = dividerLesson("geist-light", 10000);
    const before = JSON.stringify(document);
    for (const net of [undefined, null, "output"] as const) {
      const persisted = success(resolveLessonFigure(document, net, { layout: "compact" }));
      const compact = success(exportLessonFigure(persisted, { layout: "compact" }));
      const expanded = success(exportLessonFigure(persisted, { layout: "expanded" }));
      expect(compact).toEqual(
        success(renderSchematicSVG(persisted.document, { annotations: true })),
      );
      expect(compact.svg).toBe(persisted.svg);
      expect(compact.svg).toContain('data-net-halo="input"');
      expect(compact.svg).not.toContain('data-caption="true"');
      expect(compact.svg).not.toContain("circuit-lesson-hit-layer");
      expect(expanded).toEqual(success(renderFigureSVG(persisted.document)));
      expect(exportLessonFigure(persisted)).toEqual(expanded);
      expect(expanded.svg).toContain('data-caption="true"');
      expect(compact.bounds.height).toBeLessThan(expanded.bounds.height);
      const hovered = success(
        resolveLessonFigure(persisted.document, "input", { layout: "compact" }),
      );
      expect(compact.svg).not.toBe(hovered.svg);
      expect(compact.document.presentation.highlight?.nets).toEqual(
        net === "output" ? ["output"] : [],
      );
    }
    const failure = resolveLessonFigure(null);
    expect(exportLessonFigure(failure, { layout: "compact" })).toBe(failure);
    expect(JSON.stringify(document)).toBe(before);
  });

  test("compact previews preserve authored steps and persisted exports", () => {
    const document = dividerLesson("geist-dark", 10000);
    document.presentation.activeStep = "output";
    const before = JSON.stringify(document);
    const persisted = success(resolveLessonFigure(document, undefined, { layout: "compact" }));
    const preview = success(resolveLessonFigure(document, "input", { layout: "compact" }));
    expect(preview.document.presentation.activeStep).toBe("output");
    expect(exportLessonFigure(preview)).toEqual(exportLessonFigure(persisted));
    const exported = success(exportLessonFigure(persisted, { layout: "compact" }));
    expect(exported).toEqual(success(renderSchematicSVG(document, { annotations: true })));
    expect(exportLessonFigure(preview, { layout: "compact" })).toEqual(exported);
    expect(exported.svg).toBe(persisted.svg);
    expect(exported.svg).not.toBe(preview.svg);
    expect(exported.svg).toContain("Focus nets: output.");
    expect(exported.svg).not.toContain('data-caption="true"');
    expect(JSON.stringify(document)).toBe(before);
    expect(resolveLessonFigure(document, "missing", { layout: "compact" })).toMatchObject({
      ok: false,
      diagnostics: [{ code: "lesson.unknown_active_net" }],
    });
  });

  test("sequence owns the explanation without a second legend or caption", () => {
    const document = dividerLesson("geist-light", 10000);
    document.presentation.activeStep = "output";
    const markup = renderToStaticMarkup(<CircuitLessonSequence document={document} />);
    expect(markup).toContain('data-layout="compact"');
    expect(markup).toContain("circuit-lesson-sequence-description");
    expect(markup).not.toContain('class="circuit-lesson-description"');
    expect(markup).not.toContain("<details");
    expect(markup).not.toContain("<figcaption");
    expect(markup).not.toContain("<dl");
  });

  test("multiple compact instances retain unique deterministic associations", () => {
    const document = dividerLesson("geist-light", 10000);
    const render = () =>
      renderToString(
        <>
          <CircuitSchematic document={document} />
          <CircuitLessonFigure document={document} />
          <CircuitLessonFigure document={document} />
        </>,
        { identifierPrefix: "compact-" },
      );
    const markup = render();
    expect(render()).toBe(markup);
    const ids = [...markup.matchAll(/\sid="([^"]+)"/g)].map((match) => match[1]);
    expect(new Set(ids).size).toBe(ids.length);
    for (const match of markup.matchAll(/aria-(?:controls|describedby)="([^"]+)"/g)) {
      for (const id of (match[1] ?? "").split(" ")) expect(ids).toContain(id);
    }
  });
});

test.skipIf(process.env.CIRCUITKIT_BROWSER_COMPACT !== "1")(
  "browser: compact geometry, Notes, keyboard, touch, controlled callbacks and pure recovery",
  async () => {
    const entry = `
      import { useState } from "react";
      import { createRoot } from "react-dom/client";
      import { CircuitSchematic, CircuitLessonFigure } from "./src/react.tsx";
      import { resolveLessonFigure, nearestAnnotationNet } from "./src/lesson-figure.tsx";
      import { dividerLesson } from "./app/lesson/documents.ts";
      const initial = dividerLesson("geist-light", 10000);
      window.selections = [];
      window.reports = [];
      window.pureReports = [];
      window.urls = [];
      window.revoked = [];
      const create = URL.createObjectURL;
      const revoke = URL.revokeObjectURL;
      URL.createObjectURL = (blob) => { window.exported = blob; const url = create(blob); window.urls.push(url); return url; };
      URL.revokeObjectURL = (url) => { window.revoked.push(url); revoke(url); };
      HTMLAnchorElement.prototype.click = function () {};
      window.hit = (net, type = "pointermove", pointerType = "mouse") => {
        const layer = document.querySelector("#compact .circuit-lesson-hit-layer");
        const matrix = layer.getScreenCTM();
        const annotations = resolveLessonFigure(initial, null, { layout: "compact" }).annotations.nets;
        const annotation = annotations.find(item => item.net === net);
        const point = annotation.segments.map(({ a, b }) => new DOMPoint((a[0] + b[0]) / 2, (a[1] + b[1]) / 2).matrixTransform(matrix))
          .find(point => nearestAnnotationNet(annotations, point, matrix) === net);
        if (!point) throw new Error("Missing hit point");
        layer.dispatchEvent(new PointerEvent(type, { bubbles: true, pointerType, clientX: point.x, clientY: point.y }));
      };
      window.measure = () => {
        const figure = document.querySelector('#compact figure');
        const svg = figure.querySelector('svg');
        const layer = figure.querySelector('.circuit-lesson-hit-layer');
        const pure = document.querySelector('#pure svg');
        return { padding: getComputedStyle(figure).padding, minHeight: getComputedStyle(figure).minHeight,
          extra: figure.getBoundingClientRect().height - svg.getBoundingClientRect().height,
          chrome: figure.querySelector('.circuit-lesson-compact-chrome').getBoundingClientRect().height,
          row: figure.querySelector('.circuit-lesson-controls').getBoundingClientRect().height,
          notesVisible: figure.querySelector('.circuit-lesson-notes-content').checkVisibility(),
          fits: svg.getBoundingClientRect().width <= figure.getBoundingClientRect().width,
          pureFits: pure.getBoundingClientRect().width <= document.querySelector('#pure').getBoundingClientRect().width,
          matrix: Array.from(['a','b','c','d','e','f'], key => Math.abs(svg.getScreenCTM()[key] - layer.getScreenCTM()[key]) < 0.01),
          viewBox: svg.getAttribute('viewBox') === layer.getAttribute('viewBox') };
      };
      function Harness() {
        const [document, setDocument] = useState(initial);
        const [net, setNet] = useState("output");
        const [apply, setApply] = useState(true);
        const [generation, setGeneration] = useState(0);
        const [mounted, setMounted] = useState(true);
        return <>
          <button id="replace" onClick={() => setDocument(dividerLesson("geist-dark", 22000))}>Replace</button>
          <button id="invalid" onClick={() => setDocument(null)}>Invalid</button>
          <button id="callback" onClick={() => setGeneration(value => value + 1)}>Callback</button>
          <button id="apply" onClick={() => setApply(value => !value)}>Apply</button>
          <button id="unmount" onClick={() => setMounted(false)}>Unmount</button>
          <output id="selected">{net ?? "all"}</output>
          <div id="compact" style={{ width: "100%", maxWidth: 600 }}>
            {mounted ? <CircuitLessonFigure document={document} activeNet={net} download
              onActiveNetChange={next => { window.selections.push([generation, next]); if (apply) setNet(next); }}
              onDiagnostics={diagnostics => window.reports.push([generation, diagnostics])} /> : null}
          </div>
          <div id="pure"><CircuitSchematic document={document} onDiagnostics={diagnostics => window.pureReports.push([generation, diagnostics])} /></div>
          <div id="expanded">{mounted ? <CircuitLessonFigure document={initial} layout="expanded" activeNet="ground" download /> : null}</div>
        </>;
      }
      createRoot(document.getElementById("root")).render(<Harness />);
    `;
    const build = await Bun.build({
      entrypoints: ["compact-harness"],
      target: "browser",
      format: "esm",
      plugins: [
        {
          name: "compact-harness",
          setup(builder) {
            builder.onResolve({ filter: /^compact-harness$/ }, () => ({
              path: "harness",
              namespace: "compact",
            }));
            builder.onLoad({ filter: /.*/, namespace: "compact" }, () => ({
              contents: entry,
              loader: "tsx",
              resolveDir: new URL("..", import.meta.url).pathname,
            }));
          },
        },
      ],
    });
    expect(build.success, JSON.stringify(build.logs)).toBe(true);
    const script = build.outputs[0];
    if (!script) throw new Error("Missing browser harness");
    const server = Bun.serve({
      hostname: "127.0.0.1",
      port: 0,
      fetch(request) {
        return new URL(request.url).pathname === "/harness.js"
          ? new Response(script, { headers: { "Content-Type": "application/javascript" } })
          : new Response(
              '<!doctype html><html lang="en"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Compact figure</title><div id="root"></div><script type="module" src="/harness.js"></script></html>',
              { headers: { "Content-Type": "text/html" } },
            );
      },
    });
    const session = `circuitkit-compact-${process.pid}`;
    const browser = async (...args: string[]) => {
      const command = Bun.spawn(["agent-browser", "--session", session, "--json", ...args], {
        stdout: "pipe",
        stderr: "pipe",
      });
      const [stdout, stderr, code] = await Promise.all([
        new Response(command.stdout).text(),
        new Response(command.stderr).text(),
        command.exited,
      ]);
      expect(code, `${args.join(" ")}: ${stderr || stdout}`).toBe(0);
      const envelope = JSON.parse(stdout);
      expect(envelope.success, stdout).toBe(true);
      return envelope.data;
    };
    const evaluate = async (source: string) =>
      (await browser("eval", "-b", Buffer.from(source).toString("base64"))).result;
    const wait = (source: string) => browser("wait", "--fn", source);
    const selected = (net: string) =>
      `document.querySelector('#selected').textContent === '${net}'`;
    const preview = (net: string) =>
      `document.querySelector('#compact svg desc').textContent.includes('Focus nets: ${net}.')`;
    try {
      await browser("open", server.url.href);
      await wait(
        "window.pureReports.length > 0 && document.querySelector('#compact svg') !== null",
      );
      await browser("snapshot", "-i");
      expect(
        await evaluate(
          "document.querySelector('#pure').querySelectorAll('button, p, figcaption, details').length",
        ),
      ).toBe(0);
      expect(await evaluate("document.querySelector('#compact details').open")).toBe(false);
      expect(
        await evaluate(
          "document.querySelector('#compact .circuit-lesson-notes-content').checkVisibility()",
        ),
      ).toBe(false);
      for (const width of [1024, 320]) {
        await browser("set", "viewport", String(width), "900");
        const sizes = await evaluate("window.measure()");
        expect(sizes.padding).toBe("0px");
        expect(sizes.minHeight).toBe("0px");
        expect(sizes.chrome).toBe(sizes.row);
        expect(sizes.chrome).toBe(32);
        expect(sizes.notesVisible).toBe(false);
        expect(sizes.extra).toBeLessThan(170);
        expect(sizes.fits && sizes.pureFits && sizes.viewBox).toBe(true);
        expect(sizes.matrix.every(Boolean)).toBe(true);
        await evaluate("window.hit('input')");
        await wait(preview("input"));
        expect(await evaluate(selected("output"))).toBe(true);
        await evaluate(
          "document.querySelector('#compact .circuit-lesson-hit-layer').dispatchEvent(new PointerEvent('pointerout', { bubbles: true, relatedTarget: document.body }))",
        );
        await wait(preview("output"));
      }
      await evaluate(
        "document.querySelector('#compact').style.setProperty('--circuit-control-size', '44px')",
      );
      expect(
        await evaluate(
          "document.querySelector('#compact .circuit-lesson-controls button').getBoundingClientRect().height",
        ),
      ).toBe(44);
      await browser("hover", '#compact [data-legend-net="input"] button');
      await wait(preview("input"));
      expect(
        await evaluate(
          "document.querySelector('#compact .circuit-lesson-description').textContent",
        ),
      ).toBe(dividerLesson("geist-light", 10000).presentation.annotations?.nets[0]?.description);
      await evaluate("document.querySelector('#compact .circuit-lesson-download').click()");
      const compactDownload = await evaluate("window.exported.text()");
      const persistedCompact = success(
        resolveLessonFigure(dividerLesson("geist-light", 10000), "output", { layout: "compact" }),
      );
      expect(compactDownload).toBe(persistedCompact.svg);
      expect(compactDownload).toContain("Focus nets: output.");
      expect(compactDownload).not.toContain('data-caption="true"');
      await browser("hover", "#selected");
      await wait(preview("output"));
      await browser("focus", "#compact .circuit-lesson-controls > button");
      await browser("press", "Tab");
      await wait(preview("input"));
      expect(
        await evaluate(
          "document.activeElement.matches('#compact [data-legend-net=input] button:focus-visible')",
        ),
      ).toBe(true);
      expect(await evaluate("getComputedStyle(document.activeElement).outlineWidth")).toBe("2px");
      expect(await evaluate("getComputedStyle(document.activeElement).outlineOffset")).toBe("-3px");
      await browser("press", "Enter");
      await wait(selected("input"));
      await browser("press", "Space");
      await wait(selected("all"));
      await browser("press", "Escape");
      await wait(preview("none"));
      await browser("press", "Tab");
      await browser("press", "Tab");
      await browser("press", "Tab");
      expect(await evaluate("window.innerWidth")).toBe(320);
      expect(
        await evaluate("document.activeElement.matches('#compact summary:focus-visible')"),
      ).toBe(true);
      expect(await evaluate("getComputedStyle(document.activeElement).outlineStyle")).not.toBe(
        "none",
      );
      expect(
        await evaluate("parseFloat(getComputedStyle(document.activeElement).outlineWidth)"),
      ).toBeGreaterThan(0);
      const closedHeight = (await evaluate("window.measure()")).chrome;
      await browser("press", "Enter");
      await wait("document.querySelector('#compact details').open");
      expect(
        await evaluate(
          "document.querySelector('#compact .circuit-lesson-notes-content').getBoundingClientRect().height > 0",
        ),
      ).toBe(true);
      await browser("press", "Space");
      await wait("!document.querySelector('#compact details').open");
      const closedAgain = await evaluate("window.measure()");
      expect(closedAgain.chrome).toBe(closedHeight);
      expect(closedAgain.chrome).toBe(closedAgain.row);
      expect(closedAgain.notesVisible).toBe(false);
      expect(
        await evaluate("document.activeElement.matches('#compact summary:focus-visible')"),
      ).toBe(true);
      await browser("press", "Tab");
      expect(
        await evaluate("document.activeElement.matches('#compact .circuit-lesson-download')"),
      ).toBe(true);
      await evaluate(
        "window.hit('ground', 'pointerdown', 'touch'); window.hit('ground', 'click', 'touch')",
      );
      await wait(selected("ground"));
      await evaluate("window.hit('input', 'pointermove', 'touch')");
      await wait(preview("ground"));
      await browser("click", "#apply");
      await browser("click", '#compact [data-legend-net="output"] button');
      await wait("window.selections.at(-1)[1] === 'output'");
      expect(await evaluate(selected("ground"))).toBe(true);
      await browser("click", "#callback");
      await wait("window.pureReports.at(-1)[0] === 1 && window.reports.at(-1)[0] === 1");
      await browser("click", '#compact [data-legend-net="input"] button');
      await wait("window.selections.at(-1)[0] === 1 && window.selections.at(-1)[1] === 'input'");
      await browser("scrollintoview", '#expanded [data-legend-net="input"] button');
      await browser("hover", '#expanded [data-legend-net="input"] button');
      await wait(
        "document.querySelector('#expanded svg desc').textContent.includes('Focus nets: input.')",
      );
      expect(
        await evaluate(
          "document.querySelector('#expanded [data-legend-net=ground] button').getAttribute('aria-pressed')",
        ),
      ).toBe("true");
      await evaluate("document.querySelector('#expanded figure > button').click()");
      const expandedDownload = await evaluate("window.exported.text()");
      const persistedExpanded = success(
        resolveLessonFigure(dividerLesson("geist-light", 10000), "ground"),
      );
      expect(expandedDownload).toBe(success(renderFigureSVG(persistedExpanded.document)).svg);
      expect(expandedDownload).toContain("Focus nets: ground.");
      expect(expandedDownload).toContain('data-caption="true"');
      expect(expandedDownload).not.toBe(compactDownload);
      await browser("click", "#invalid");
      await wait(
        "document.querySelector('#pure svg') === null && window.pureReports.at(-1)[1].length > 0",
      );
      expect(await evaluate("document.querySelector('#compact svg') === null")).toBe(true);
      await browser("click", "#replace");
      await wait(
        "document.querySelector('#pure svg desc')?.textContent.includes('22 kΩ') && window.pureReports.at(-1)[1].length === 0",
      );
      await wait(preview("ground"));
      await browser("click", "#unmount");
      await wait("window.urls.length > 0 && window.revoked.length === window.urls.length");
      console.log(
        "PASS compact browser: responsive geometry, one-row chrome, closed Notes, hover/focus/touch, controlled callbacks, pure recovery and persisted export",
      );
    } catch (error) {
      console.error("Compact browser assertion:", error);
      throw error;
    } finally {
      try {
        await browser("close");
      } finally {
        server.stop(true);
      }
    }
  },
  120000,
);
