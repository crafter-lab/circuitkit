import { describe, expect, test } from "bun:test";
import { parse } from "opentype.js";
import { defineFigure, formatSI, inspect, loadExample, renderSVG, validate } from "../src/index.ts";
import { recipeIds, themePresets } from "../src/schema.ts";
import { contrast, themes } from "../src/theme.ts";
import { textPath } from "../src/typography.ts";

function rendered(document: unknown) {
  const result = renderSVG(document);
  expect(result.ok, JSON.stringify(result.diagnostics)).toBe(true);
  if (!result.ok) throw new Error(JSON.stringify(result.diagnostics));
  return result;
}
const geometry = (svg: string) =>
  [...svg.matchAll(/\b(?:d|transform|cx|cy|r|viewBox)="[^"]*"/g)].map(([value]) => value);

for (const recipe of recipeIds) {
  describe(recipe, () => {
    for (const theme of themePresets) {
      test(`${theme}: standalone, deterministic paths, matching inspect and validation`, () => {
        const document = loadExample(recipe);
        document.presentation.theme.preset = theme;
        const original = structuredClone(document);
        const result = rendered(defineFigure(document));
        expect(rendered(document).svg).toBe(result.svg);
        expect(document).toEqual(original);
        expect(result.svg).not.toMatch(
          /<(?:text|style|script|image|foreignObject|filter)\b|(?:href|url\()|font-family|NaN|Infinity/,
        );
        expect(result.svg).toContain("<title>");
        expect(result.svg).toContain("<desc>");
        expect(result.svg).toContain('role="img"');
        expect(result.svg).toContain('aria-hidden="true"');
        const detail = inspect(document);
        expect(detail.ok).toBe(true);
        if (!detail.ok) return;
        expect(detail.bounds).toEqual(result.bounds);
        expect(Object.keys(detail.endpoints).sort()).toEqual(
          Object.values(document.circuit.nets).flat().sort(),
        );
        for (const [net, endpoints] of Object.entries(document.circuit.nets)) {
          for (const endpoint of endpoints) expect(detail.endpoints[endpoint]?.net).toBe(net);
        }
        const checked = validate(document);
        expect(checked.ok).toBe(true);
        expect(checked).not.toHaveProperty("svg");
      });
    }
    test("themes and component/net focus preserve every path, transform and bound", () => {
      const document = loadExample(recipe);
      document.presentation.highlight = { components: [], nets: [] };
      const base = rendered(document);
      for (const theme of themePresets) {
        document.presentation.theme.preset = theme;
        for (const id of Object.keys(document.circuit.components)) {
          document.presentation.highlight = { components: [id], nets: [] };
          const result = rendered(document);
          expect(geometry(result.svg)).toEqual(geometry(base.svg));
          expect(result.bounds).toEqual(base.bounds);
          expect(result.circuit).toEqual(base.circuit);
          expect(result.svg).toContain(`Focus components: ${id}`);
          expect(result.svg).toContain('stroke-width="3"');
        }
        for (const net of Object.keys(document.circuit.nets)) {
          document.presentation.highlight = { components: [], nets: [net] };
          const result = rendered(document);
          expect(geometry(result.svg)).toEqual(geometry(base.svg));
          expect(result.bounds).toEqual(base.bounds);
          expect(result.circuit).toEqual(base.circuit);
        }
      }
    });
  });
}

describe("rendered electrical semantics", () => {
  test("RC has the correct cutoff, actual output dot and separate capacitor plates", () => {
    const document = loadExample("rc-lowpass");
    const result = rendered(document);
    expect(result.svg).toContain("159 Hz");
    expect(result.svg).toContain("10 kΩ");
    expect(result.svg).toContain("100 nF");
    expect(result.svg).toContain("M600 327V345M576 345H624M576 365H624M600 365V383");
    expect(result.svg.match(/data-junction=/g)?.length).toBe(1);
    expect(result.svg).toContain('data-junction="output" cx="600" cy="270"');
    document.circuit.components.R1 = { type: "resistor", resistance: 20000 };
    const changed = rendered(document);
    expect(changed.svg).toContain("80 Hz");
    expect(changed.circuit.nets).toEqual(result.circuit.nets);
  });
  test("divider reports unloaded ratio; LED does not invent current", () => {
    expect(rendered(loadExample("voltage-divider")).svg).toContain("= 0.5");
    const led = rendered(loadExample("led-series"));
    expect(led.svg).toContain("LED forward voltage and current are not assumed");
    expect(led.svg).toContain("V1.positive");
    expect(led.svg).toContain("D1.anode");
    expect(led.svg).not.toContain("mA");
  });
  test("author-selected prototype-like IDs survive geometry and inspection", () => {
    const document = loadExample("rc-lowpass");
    const renamed = JSON.parse(JSON.stringify(document).replaceAll("R1", "constructor"));
    renamed.circuit.nets = Object.fromEntries(
      Object.entries(renamed.circuit.nets).map(([key, endpoints]) => [
        key === "ground" ? "__proto__" : key,
        endpoints,
      ]),
    );
    const result = rendered(renamed);
    expect(Object.hasOwn(result.bounds.symbols, "constructor")).toBe(true);
    expect(Object.hasOwn(result.bounds.routes, "__proto__")).toBe(true);
    expect(Reflect.get(result.circuit.nets, "__proto__")).toEqual(["C1.b", "GND"]);
  });
});

describe("measured typography and presentation failures", () => {
  test("Geist outlines use the same advance as pinned TTFs for all course characters", async () => {
    const text = "ASCII áéíóúüñ ÁÉÍÓÚÜÑ Ω µ μ π";
    for (const [family, file] of [
      ["sans", "Geist-Regular"],
      ["mono", "GeistMono-Regular"],
    ] as const) {
      const font = parse(await Bun.file(`fonts/${file}.ttf`).arrayBuffer());
      const result = textPath(text, family, 24, 0, 0);
      expect(result.missing).toEqual([]);
      expect(result.advance).toBeCloseTo(font.getAdvanceWidth(text, 24, { kerning: true }), 6);
      const expected = font.getPath(text, 0, 0, 24).getBoundingBox();
      expect(result.box.x).toBeCloseTo(expected.x1, 5);
      expect(result.box.y).toBeCloseTo(expected.y1, 5);
      expect(result.box.width).toBeCloseTo(expected.x2 - expected.x1, 5);
      expect(result.box.height).toBeCloseTo(expected.y2 - expected.y1, 5);
    }
  });
  test("presets pass applicable contrast, without claiming certification", () => {
    for (const theme of Object.values(themes)) {
      for (const token of ["label", "muted", "highlight"] as const)
        expect(contrast(theme[token], theme.background)).toBeGreaterThanOrEqual(4.5);
      expect(contrast(theme.wire, theme.background)).toBeGreaterThanOrEqual(3);
    }
  });
  test("valid overrides recompute bounds but never connectivity", () => {
    const document = loadExample("rc-lowpass");
    const original = rendered(document);
    document.presentation.theme.overrides = {
      highlight: "#6d28d9",
      strokeWidth: 2.5,
      fontScale: 1.1,
    };
    const result = rendered(document);
    expect(result.circuit).toEqual(original.circuit);
    expect(result.bounds.labels).not.toEqual(original.bounds.labels);
  });
  for (const [overrides, code] of [
    [{ fontScale: 10 }, "layout.label_collision"],
    [{ strokeWidth: 20 }, "layout.label_collision"],
    [{ label: "#fff" }, "theme.insufficient_contrast"],
    [{ highlight: "url(x)" }, "theme.invalid_token"],
  ] as const) {
    test(`invalid override ${JSON.stringify(overrides)} has no SVG`, () => {
      const document = loadExample("rc-lowpass");
      document.presentation.theme.overrides = overrides;
      const result = renderSVG(document);
      expect(result.ok).toBe(false);
      expect(result).not.toHaveProperty("svg");
      expect(result.diagnostics.some((diagnostic) => diagnostic.code === code)).toBe(true);
    });
  }
  test("oversized labels, absent glyphs and XML controls fail instead of being clipped", () => {
    for (const title of ["A".repeat(200), "Un circuito 🧪", "bad\u0000title"]) {
      const document = loadExample("rc-lowpass");
      document.presentation.title = title;
      const result = renderSVG(document);
      expect(result.ok).toBe(false);
      expect(result).not.toHaveProperty("svg");
    }
  });
  test("markup is escaped in accessible metadata and never becomes executable markup", () => {
    const document = loadExample("rc-lowpass");
    document.presentation.title = '<script>& "RC"';
    const result = rendered(document);
    expect(result.svg).not.toContain("<script>");
    expect(result.svg).toContain("&lt;script&gt;&amp; &quot;RC&quot;");
  });
  test("derived values outside floating point range are diagnosed", () => {
    const document = loadExample("rc-lowpass");
    document.circuit.components.R1 = { type: "resistor", resistance: Number.MIN_VALUE };
    document.circuit.components.C1 = { type: "capacitor", capacitance: Number.MIN_VALUE };
    expect(renderSVG(document).ok).toBe(false);
  });
  test("undefined optional theme tokens preserve defaults across public APIs", () => {
    const document = loadExample("rc-lowpass");
    const expected = rendered(document);
    document.presentation.theme.overrides = { wire: undefined, fontScale: undefined };
    expect(rendered(document).svg).toBe(expected.svg);
    expect(inspect(document).ok).toBe(true);
    expect(validate(document).ok).toBe(true);
  });
  test("range-safe RC arithmetic preserves a representable cutoff", () => {
    const document = loadExample("rc-lowpass");
    document.circuit.components.R1 = { type: "resistor", resistance: 1e-310 };
    document.circuit.components.C1 = { type: "capacitor", capacitance: 1e308 };
    expect(rendered(document).svg).toContain("16 Hz");
    expect(inspect(document).ok).toBe(true);
    expect(validate(document).ok).toBe(true);
  });
  test("collapsed glyph geometry is rejected even for a positive finite scale", () => {
    const document = loadExample("rc-lowpass");
    document.presentation.theme.overrides = { fontScale: Number.MIN_VALUE };
    for (const api of [renderSVG, inspect, validate]) {
      const result = api(document);
      expect(result.ok).toBe(false);
      expect(
        result.diagnostics.some((diagnostic) => diagnostic.code === "layout.label_collision"),
      ).toBe(true);
    }
  });
  test("SI formatting does not silently truncate units", () => {
    expect(formatSI(10000, "Ω")).toBe("10 kΩ");
    expect(formatSI(1e-7, "F")).toBe("100 nF");
    expect(formatSI(1e-6, "F")).toBe("1 µF");
    expect(formatSI(1e-20, "F")).toContain("e-20 F");
  });
});
