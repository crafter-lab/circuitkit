import { describe, expect, test } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";
import { loadExample, renderSVG } from "../src/index.ts";
import { CircuitFigure, type CircuitFigureProps } from "../src/react.tsx";
import { recipeIds, themePresets } from "../src/schema.ts";

function inlineSVG(markup: string) {
  const start = markup.indexOf("<svg");
  const end = markup.lastIndexOf("</svg>");
  return start < 0 ? null : markup.slice(start, end + 6);
}

describe("React adapter with the real core renderer", () => {
  for (const recipe of recipeIds) {
    for (const preset of themePresets) {
      test(`${recipe} / ${preset} preserves exact core SVG bytes`, () => {
        const document = loadExample(recipe);
        document.presentation.theme.preset = preset;
        const result = renderSVG(document);
        expect(result.ok).toBe(true);
        if (!result.ok) return;
        const markup = renderToStaticMarkup(
          <CircuitFigure className="consumer-figure" document={document} />,
        );
        expect(inlineSVG(markup)).toBe(result.svg);
        expect(markup).toStartWith('<div class="consumer-figure">');
        expect(result.svg).toContain("<title");
        expect(result.svg).toContain("<desc");
        expect(result.svg).toContain('role="img"');
        expect(result.svg).toContain("aria-label=");
      });
    }
  }

  test("host value, theme, and focus changes use core output without document mutation", () => {
    const document = loadExample("rc-lowpass");
    const original = JSON.stringify(document);
    const next = structuredClone(document);
    const resistor = next.circuit.components.R1;
    if (resistor?.type === "resistor") resistor.resistance = 22000;
    next.presentation.theme.preset = "geist-dark";
    next.presentation.highlight = { components: ["R1"], nets: [] };
    const result = renderSVG(next);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(inlineSVG(renderToStaticMarkup(<CircuitFigure document={next} />))).toBe(result.svg);
    expect(JSON.stringify(document)).toBe(original);
    expect(next.circuit.nets).toEqual(document.circuit.nets);
  });

  test("invalid props render a readable error and never contain a previous SVG", () => {
    const document = loadExample("rc-lowpass");
    expect(inlineSVG(renderToStaticMarkup(<CircuitFigure document={document} />))).not.toBeNull();
    document.circuit.nets.input = ["VIN", "R1.c"];
    const markup = renderToStaticMarkup(<CircuitFigure document={document} />);
    expect(inlineSVG(markup)).toBeNull();
    expect(markup).toContain('role="alert"');
    expect(markup).toContain("circuit.unknown_pin");
    expect(markup).toContain("Valid pins: a, b.");
  });

  test.each([null, {}, { version: 999 }])(
    "accepts unknown invalid documents safely",
    (document) => {
      const markup = renderToStaticMarkup(<CircuitFigure document={document} />);
      expect(markup).toContain("Figure unavailable");
      expect(inlineSVG(markup)).toBeNull();
    },
  );

  test("multiple figures preserve stable accessibility without host ID rewriting", () => {
    const document = loadExample("rc-lowpass");
    const markup = renderToStaticMarkup(
      <>
        <CircuitFigure document={document} />
        <CircuitFigure document={document} />
      </>,
    );
    const result = renderSVG(document);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(markup).toBe(`<div>${result.svg}</div><div>${result.svg}</div>`);
    expect(result.svg).not.toMatch(/\sid=/);
  });

  test("diagnostics callback is typed and not invoked as a render side effect", () => {
    const received: string[] = [];
    const onDiagnostics: CircuitFigureProps["onDiagnostics"] = (diagnostics) => {
      received.push(...diagnostics.map((diagnostic) => diagnostic.code));
    };
    renderToStaticMarkup(<CircuitFigure document={null} onDiagnostics={onDiagnostics} />);
    expect(received).toEqual([]);
  });
});
