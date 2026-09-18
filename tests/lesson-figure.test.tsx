import { describe, expect, test } from "bun:test";
import { renderToStaticMarkup, renderToString } from "react-dom/server";
import { amplifierLesson, dividerLesson } from "../app/lesson/documents.ts";
import { loadExample, renderFigureSVG, renderSVG } from "../src/index.ts";
import {
  exportLessonFigure,
  nearestAnnotationNet,
  resolveLessonFigure,
} from "../src/lesson-figure.tsx";
import { CircuitLessonFigure, type CircuitLessonFigureProps } from "../src/react.tsx";
import { themePresets } from "../src/schema.ts";

function diagram(markup: string) {
  return (
    markup
      .match(/<svg\b[\s\S]*?<\/svg>/)?.[0]
      ?.replace(' style="display:block;width:100%;height:auto"', "") ?? null
  );
}

function pressedLabels(markup: string) {
  return [...markup.matchAll(/<button\b[^>]*aria-pressed="true"[^>]*>(.*?)<\/button>/g)].map(
    (match) => match[1],
  );
}

describe("CircuitLessonFigure with the real annotation core", () => {
  for (const theme of themePresets) {
    test(`${theme}: semantic legend follows resolved metadata and core colors`, () => {
      const document = dividerLesson(theme, 10000);
      const result = renderSVG(document);
      expect(result.ok).toBe(true);
      if (!result.ok) return;
      expect(result.annotations?.nets).toHaveLength(3);
      const markup = renderToStaticMarkup(
        <CircuitLessonFigure layout="expanded" document={document} />,
      );
      expect(markup).toStartWith("<figure");
      expect(markup).toContain("<section");
      expect(markup).toContain('circuit diagram"');
      expect(markup).toContain("<dl ");
      expect(markup).toContain("<figcaption ");
      expect(markup).toContain(result.annotations?.caption ?? "missing metadata");
      expect(diagram(markup)).toBe(result.svg);
      let previous = -1;
      for (const annotation of result.annotations?.nets ?? []) {
        const position = markup.indexOf(`data-legend-net="${annotation.net}"`);
        expect(position).toBeGreaterThan(previous);
        previous = position;
        expect(markup).toContain(annotation.description);
        expect(markup).toContain(`color:${annotation.color}`);
        for (const path of annotation.paths) expect(markup).toContain(`d="${path}"`);
      }
      expect(markup).toContain('stroke-width="24"');
      expect(markup).toContain('vector-effect="non-scaling-stroke"');
      const hitLayer = markup.match(/<svg class="circuit-lesson-hit-layer"[\s\S]*?<\/svg>/)?.[0];
      expect(hitLayer).toContain('aria-hidden="true"');
      expect(hitLayer).not.toContain("<button");
      expect(hitLayer).not.toContain("tabindex");
    });

    test(`${theme}: six op-amp annotations are complete and independent of divider`, () => {
      const document = amplifierLesson(theme);
      const result = renderSVG(document);
      expect(result.ok).toBe(true);
      if (!result.ok) return;
      expect(result.annotations?.nets.map(({ tone }) => tone)).toEqual([
        "blue",
        "amber",
        "violet",
        "green",
        "rose",
        "cyan",
      ]);
      const markup = renderToStaticMarkup(
        <CircuitLessonFigure
          layout="expanded"
          document={document}
          activeNet="summing"
          onActiveNetChange={() => {}}
        />,
      );
      expect(pressedLabels(markup)).toEqual(["B"]);
      expect(markup).toContain("It is not wired to GND.");
      expect(markup.match(/data-legend-net=/g)).toHaveLength(6);
    });
  }

  test("controlled net or null overrides canonical arrays without mutating the host document", () => {
    const document = dividerLesson("geist-light", 10000);
    document.presentation.highlight = { components: ["R1"], nets: ["input", "ground"] };
    const before = JSON.stringify(document);
    for (const activeNet of [undefined, "output", null] as const) {
      const result = resolveLessonFigure(document, activeNet);
      expect(result.ok).toBe(true);
      if (!result.ok) continue;
      const expectedNets =
        activeNet === undefined ? ["ground", "input"] : activeNet === null ? [] : [activeNet];
      expect(result.document.presentation.highlight?.nets).toEqual(expectedNets);
      expect(result.document.presentation.highlight?.components).toEqual(["R1"]);
      const markup = renderToStaticMarkup(
        <CircuitLessonFigure
          layout="expanded"
          document={document}
          activeNet={activeNet}
          onActiveNetChange={() => {}}
        />,
      );
      expect(diagram(markup)).toBe(result.svg);
      expect(pressedLabels(markup)).toEqual(
        activeNet === undefined ? ["A", "C"] : activeNet === null ? [] : ["B"],
      );
    }
    expect(JSON.stringify(document)).toBe(before);
  });

  test("export takes persisted selection, not a separately rendered hover preview", () => {
    const document = dividerLesson("geist-dark", 10000);
    const persisted = resolveLessonFigure(document, "output");
    expect(persisted.ok).toBe(true);
    if (!persisted.ok) return;
    const preview = resolveLessonFigure(document, "input");
    expect(preview.ok).toBe(true);
    if (!preview.ok) return;
    const exported = exportLessonFigure(persisted);
    const expected = renderFigureSVG(persisted.document);
    expect(exported).toEqual(expected);
    expect(exported.ok).toBe(true);
    if (!exported.ok) return;
    expect(exported.document.presentation.highlight?.nets).toEqual(["output"]);
    expect(exported.svg).not.toMatch(/\sid=/);
    expect(exported.svg).not.toContain("circuit-lesson-hit-layer");
    const previewExport = exportLessonFigure(preview);
    expect(previewExport.ok).toBe(true);
    if (previewExport.ok) expect(exported.svg).not.toBe(previewExport.svg);
    expect(exported.annotations?.caption).toBe(persisted.annotations?.caption);
    expect(preview.bounds).toEqual(persisted.bounds);
    expect(preview.annotations?.nets.map(({ paths }) => paths)).toEqual(
      persisted.annotations?.nets.map(({ paths }) => paths),
    );
  });

  test("two SSR instances have unique, deterministic hydration associations and independent selection", () => {
    const divider = dividerLesson("geist-light", 10000);
    const amplifier = amplifierLesson("geist-light");
    const render = () =>
      renderToString(
        <>
          <CircuitLessonFigure
            layout="expanded"
            document={divider}
            activeNet="ground"
            onActiveNetChange={() => {}}
          />
          <CircuitLessonFigure
            layout="expanded"
            document={amplifier}
            activeNet="summing"
            onActiveNetChange={() => {}}
          />
        </>,
        { identifierPrefix: "lesson-test-" },
      );
    const markup = render();
    expect(render()).toBe(markup);
    const ids = [...markup.matchAll(/\sid="([^"]+)"/g)].map((match) => match[1]);
    expect(ids.length).toBeGreaterThan(10);
    expect(new Set(ids).size).toBe(ids.length);
    for (const match of markup.matchAll(/aria-(?:controls|describedby)="([^"]+)"/g)) {
      for (const reference of (match[1] ?? "").split(" ")) expect(ids).toContain(reference);
    }
    expect(pressedLabels(markup)).toEqual(["C", "B"]);
  });

  test("unknown selection is a structured failure, not a thrown error or stale diagram", () => {
    const document = dividerLesson("geist-light", 10000);
    expect(resolveLessonFigure(document, "missing")).toEqual({
      ok: false,
      diagnostics: [
        {
          code: "lesson.unknown_active_net",
          path: "/activeNet",
          message: "Unknown selected net: missing. Choose a net in this circuit or null.",
        },
      ],
    });
    const markup = renderToStaticMarkup(
      <CircuitLessonFigure layout="expanded" document={document} activeNet="missing" />,
    );
    expect(markup).toContain('role="alert"');
    expect(markup).toContain("lesson.unknown_active_net");
    expect(diagram(markup)).toBeNull();
  });

  test.each([undefined, null, {}, { version: 999 }])(
    "invalid unknown document is readable and clears the SVG",
    (document) => {
      const markup = renderToStaticMarkup(
        <CircuitLessonFigure layout="expanded" document={document} />,
      );
      expect(markup).toContain("Figure unavailable");
      expect(diagram(markup)).toBeNull();
    },
  );

  test("value and theme prop updates recover from invalid input", () => {
    const broken = renderToStaticMarkup(
      <CircuitLessonFigure layout="expanded" document={dividerLesson("geist-light", -1)} />,
    );
    expect(diagram(broken)).toBeNull();
    const valid = dividerLesson("geist-print", 22000);
    const result = renderSVG(valid);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(
      diagram(renderToStaticMarkup(<CircuitLessonFigure layout="expanded" document={valid} />)),
    ).toBe(result.svg);
  });

  test("callbacks are typed and never invoked during rendering, including failures", () => {
    const received: unknown[] = [];
    const onDiagnostics: CircuitLessonFigureProps["onDiagnostics"] = (diagnostics) =>
      received.push(diagnostics);
    const onActiveNetChange: CircuitLessonFigureProps["onActiveNetChange"] = (net) =>
      received.push(net);
    for (const document of [null, dividerLesson("geist-light", 10000)]) {
      renderToString(
        <CircuitLessonFigure
          layout="expanded"
          document={document}
          onDiagnostics={onDiagnostics}
          onActiveNetChange={onActiveNetChange}
          download
        />,
      );
    }
    expect(received).toEqual([]);
  });

  test("no handler is explicitly read-only, but the complete legend remains focusable", () => {
    const markup = renderToStaticMarkup(
      <CircuitLessonFigure
        layout="expanded"
        document={dividerLesson("geist-light", 10000)}
        activeNet="input"
      />,
    );
    expect(markup).toContain('data-mode="read-only"');
    expect(markup).toContain("Read-only figure");
    expect(markup.match(/aria-disabled="true"/g)).toHaveLength(3);
    expect(pressedLabels(markup)).toEqual(["A"]);
  });

  test("legacy document remains a plain semantic figure with the original core SVG", () => {
    const document = loadExample("voltage-divider");
    const result = renderSVG(document);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const markup = renderToStaticMarkup(
      <CircuitLessonFigure layout="expanded" document={document} />,
    );
    expect(diagram(markup)).toBe(result.svg);
    expect(markup).not.toContain("<dl");
    expect(markup).not.toContain("<button");
    expect(markup).not.toContain("<figcaption");
    expect(markup).not.toContain("circuit-lesson-hit-layer");
  });

  test("legend false omits HTML legend without losing caption or diagram annotations", () => {
    const document = dividerLesson("geist-light", 10000);
    if (document.presentation.annotations) document.presentation.annotations.legend = false;
    const markup = renderToStaticMarkup(
      <CircuitLessonFigure layout="expanded" document={document} />,
    );
    expect(markup).not.toContain("<dl");
    expect(markup).toContain("<figcaption");
    expect(markup).toContain("circuit-lesson-hit-layer");
  });

  test("screen-space hit testing uses core segments, ignores ties, and never picks by paint order", () => {
    const result = renderSVG(dividerLesson("geist-light", 10000));
    expect(result.ok).toBe(true);
    if (!result.ok || !result.annotations) return;
    const nets = result.annotations.nets;
    const matrix = { a: 0.7, b: 0.2, c: 0, d: 0.5, e: 27, f: 80 };
    for (const net of nets) {
      const point = net.segments
        .map(({ a, b }) => {
          const x = (a[0] + b[0]) / 2;
          const y = (a[1] + b[1]) / 2;
          return {
            x: matrix.a * x + matrix.c * y + matrix.e,
            y: matrix.b * x + matrix.d * y + matrix.f,
          };
        })
        .find((candidate) => nearestAnnotationNet(nets, candidate, matrix) === net.net);
      expect(point).toBeDefined();
      if (!point) continue;
      expect(nearestAnnotationNet([...nets].reverse(), point, matrix)).toBe(net.net);
      const coincident = { ...net, net: `${net.net}-overlap` };
      expect(nearestAnnotationNet([net, coincident], point, matrix)).toBeNull();
      expect(nearestAnnotationNet([coincident, net], point, matrix)).toBeNull();
    }
    expect(nearestAnnotationNet(nets, { x: -10000, y: -10000 }, matrix)).toBeNull();
  });
});
