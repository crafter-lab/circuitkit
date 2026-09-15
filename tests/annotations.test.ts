import { describe, expect, test } from "bun:test";
import { createComplexScene } from "../src/complex-scenes.ts";
import {
  type FigureDocument,
  formatSI,
  inspect,
  loadExample,
  type RenderResult,
  renderFigureSVG,
  renderSVG,
  validate,
} from "../src/index.ts";
import {
  type RecipeId,
  recipeIds,
  recipeSchema,
  semanticTones,
  themePresetSchema,
  themePresets,
} from "../src/schema.ts";
import { annotationPalettes, contrast, themes } from "../src/theme.ts";
import { escapeXML } from "../src/typography.ts";
import hashes from "./fixtures/unannotated-svg-hashes.json";

function success(result: RenderResult) {
  expect(result.ok, JSON.stringify(result.diagnostics)).toBe(true);
  if (!result.ok) throw new Error(JSON.stringify(result.diagnostics));
  return result;
}

function annotated(recipe: RecipeId = "voltage-divider"): FigureDocument {
  const document = loadExample(recipe);
  document.presentation.highlight = { components: [], nets: [] };
  document.presentation.annotations = {
    nets: Object.keys(document.circuit.nets).map((net, index) => {
      const tone = semanticTones[index];
      if (!tone) throw new Error("Test authors must explicitly assign additional tones.");
      return { net, label: String.fromCharCode(65 + index), description: `Conductor ${net}`, tone };
    }),
    legend: true,
    caption: "Components separate the conductors. No simulation is implied.",
  };
  return document;
}

function config(document: FigureDocument) {
  const annotations = document.presentation.annotations;
  if (!annotations) throw new Error("Expected annotations");
  return annotations;
}

function first(document: FigureDocument) {
  const annotation = config(document).nets[0];
  if (!annotation) throw new Error("Expected annotation");
  return annotation;
}

function fails(input: unknown, code: string) {
  const rendered = renderSVG(input);
  expect(rendered.ok).toBe(false);
  if (rendered.ok) throw new Error("Expected an honest rendering failure");
  expect(rendered).not.toHaveProperty("svg");
  expect(
    rendered.diagnostics.some((diagnostic) => diagnostic.code === code),
    JSON.stringify(rendered.diagnostics),
  ).toBe(true);
  expect(inspect(input)).toEqual(rendered);
  expect(validate(input)).toEqual(rendered);
  expect(renderFigureSVG(input)).toEqual(rendered);
  return rendered.diagnostics;
}

const geometry = (svg: string) =>
  [...svg.matchAll(/\b(?:d|transform|cx|cy|r|viewBox)="[^"]*"/g)].map(([value]) => value);
const symbolPaths = (svg: string, id: string) => {
  const start = svg.indexOf(`<g data-component="${escapeXML(id)}"`);
  return [...svg.slice(start, svg.indexOf("</g>", start)).matchAll(/\bd="([^"]*)"/g)].map(
    ([, d]) => d,
  );
};

function overlaps(
  a: { x: number; y: number; width: number; height: number },
  b: { x: number; y: number; width: number; height: number },
) {
  return a.x < b.x + b.width && a.x + a.width > b.x && a.y < b.y + b.height && a.y + a.height > b.y;
}

describe("immutable pre-annotation SVG fixture", () => {
  test("baseline contains exactly all nine recipes and three themes", () => {
    expect(hashes).toHaveLength(27);
    expect(new Set(hashes.map(({ recipe, preset }) => `${recipe}/${preset}`)).size).toBe(27);
  });
  for (const fixture of hashes) {
    test(`${fixture.recipe}/${fixture.preset} retains original bytes`, () => {
      const document = loadExample(recipeSchema.parse(fixture.recipe));
      document.presentation.theme.preset = themePresetSchema.parse(fixture.preset);
      const result = success(renderSVG(document));
      expect(new Bun.CryptoHasher("sha256").update(result.svg).digest("hex")).toBe(fixture.sha256);
      expect(renderFigureSVG(document)).toEqual(result);
      expect(result).not.toHaveProperty("annotations");
      expect(inspect(document)).not.toHaveProperty("annotations");
      expect(validate(document)).not.toHaveProperty("annotations");
    });
  }
});

for (const recipe of recipeIds) {
  describe(`${recipe} annotations`, () => {
    for (const preset of themePresets) {
      test(`${preset}: all nets, measured layout, portable composition and stable focus`, () => {
        const document = annotated(recipe);
        document.presentation.theme.preset = preset;
        const original = structuredClone(document);
        const result = success(renderSVG(document));
        const annotations = result.annotations;
        expect(annotations).toBeDefined();
        if (!annotations) return;
        expect(annotations.nets.map(({ net }) => net)).toEqual(
          config(document).nets.map(({ net }) => net),
        );
        expect(annotations.legend).toBe(true);
        expect(annotations.caption).toBe(config(document).caption ?? "");
        expect(document).toEqual(original);
        expect(success(renderSVG(document)).svg).toBe(result.svg);
        const detail = inspect(document);
        const checked = validate(document);
        expect(detail.ok).toBe(true);
        expect(checked.ok).toBe(true);
        if (!detail.ok || !checked.ok) return;
        expect(detail.annotations).toEqual(annotations);
        expect(checked.annotations).toEqual(annotations);
        const scene = createComplexScene(result.document, formatSI);
        const region = scene?.frame?.sceneRegion ?? { x: 48, y: 169, width: 904, height: 303 };
        for (const annotation of annotations.nets) {
          expect(annotation.paths.length).toBeGreaterThan(0);
          expect(annotation.segments.length).toBeGreaterThan(0);
          expect(contrast(annotation.color, themes[preset].background)).toBeGreaterThanOrEqual(4.5);
          expect(annotation.color).toBe(annotationPalettes[preset][annotation.tone]);
          expect(result.svg).toContain(
            `data-net-label="${escapeXML(annotation.net)}" fill="${annotation.color}"`,
          );
          for (const path of annotation.paths) {
            expect(path).toMatch(/^M[-\d.]+ [-\d.]+L/);
            expect(result.svg).toContain(`d="${path}"`);
          }
          const box = annotation.labelBounds;
          expect(box.width).toBeGreaterThan(0);
          expect(box.height).toBeGreaterThan(0);
          expect(box.x).toBeGreaterThanOrEqual(region.x);
          expect(box.y).toBeGreaterThanOrEqual(region.y);
          expect(box.x + box.width).toBeLessThanOrEqual(region.x + region.width);
          expect(box.y + box.height).toBeLessThanOrEqual(region.y + region.height);
          for (const [key, other] of Object.entries(result.bounds.labels)) {
            if (key !== `annotation:${annotations.nets.indexOf(annotation)}`)
              expect(overlaps(box, other)).toBe(false);
          }
          for (const other of Object.values(result.bounds.symbols))
            expect(overlaps(box, other)).toBe(false);
          for (const routes of Object.values(result.bounds.routes)) {
            for (const other of routes) expect(overlaps(box, other)).toBe(false);
          }
          document.presentation.highlight = { components: [], nets: [annotation.net] };
          const selected = success(renderSVG(document));
          expect(geometry(selected.svg)).toEqual(geometry(result.svg));
          expect(selected.bounds).toEqual(result.bounds);
          expect(selected.annotations).toEqual(result.annotations);
          expect(selected.svg).toContain(
            `data-net-halo="${escapeXML(annotation.net)}" stroke="${annotation.color}" stroke-width="8" stroke-opacity="0.24" stroke-linecap="butt"`,
          );
          expect(selected.svg).toContain(`stroke="${annotation.color}" stroke-width="3"`);
        }
        document.presentation.highlight = { components: [], nets: [] };
        const full = success(renderFigureSVG(document));
        expect(full.annotations).toEqual(result.annotations);
        expect(full.bounds.height).toBeGreaterThan(result.bounds.height);
        expect(full.bounds.width).toBe(result.bounds.width);
        expect(full.svg).not.toMatch(
          /<(?:text|style|script|image|foreignObject|filter)\b|\bid=|\bhref=|url\(|font-family|NaN|Infinity/,
        );
        expect(full.svg).toContain('role="img"');
        expect(full.svg).toContain("<desc>");
        expect(full.svg).toContain('data-caption="true"');
        expect(result.svg).not.toContain("data-legend-net=");
        expect(result.svg).not.toContain("data-caption=");
        const exportedOrder = [...full.svg.matchAll(/data-legend-net="([^"]*)"/g)].map(
          ([, net]) => net,
        );
        expect(exportedOrder).toEqual(annotations.nets.map(({ net }) => escapeXML(net)));
        for (const annotation of annotations.nets) {
          for (const path of annotation.paths) expect(full.svg).toContain(`d="${path}"`);
        }
        for (const box of Object.values(full.bounds.labels)) {
          expect(box.x).toBeGreaterThanOrEqual(0);
          expect(box.y).toBeGreaterThanOrEqual(0);
          expect(box.x + box.width).toBeLessThanOrEqual(full.bounds.width);
          expect(box.y + box.height).toBeLessThanOrEqual(full.bounds.height);
        }
      });
    }
    test("renamed roles and prototype-like net IDs still own their annotated leads", () => {
      const document = annotated(recipe);
      const ids = new Map([
        ...Object.keys(document.circuit.components).map((id, index) => [id, `X${index}`] as const),
        ...Object.keys(document.circuit.ports).map((id, index) => [id, `P${index}`] as const),
      ]);
      document.circuit.components = Object.fromEntries(
        Object.entries(document.circuit.components).map(([id, component]) => [
          ids.get(id),
          component,
        ]),
      );
      document.circuit.ports = Object.fromEntries(
        Object.entries(document.circuit.ports).map(([id, port]) => [ids.get(id), port]),
      );
      document.layout.roles = Object.fromEntries(
        Object.entries(document.layout.roles).map(([role, id]) => [role, ids.get(id) ?? id]),
      );
      const names = ["__proto__", "constructor", "toString", 'quoted"net', "slash/net", "amp&net"];
      const nets = new Map(
        Object.keys(document.circuit.nets).map((net, index) => [net, names[index] ?? net]),
      );
      document.circuit.nets = Object.fromEntries(
        Object.entries(document.circuit.nets).map(([net, endpoints]) => [
          nets.get(net),
          endpoints.map((endpoint) => {
            const [id, pin] = endpoint.split(".");
            return `${ids.get(id ?? "")}${pin ? `.${pin}` : ""}`;
          }),
        ]),
      );
      config(document).nets = config(document).nets.map((annotation) => ({
        ...annotation,
        net: nets.get(annotation.net) ?? annotation.net,
      }));
      const result = success(renderSVG(document));
      const detail = inspect(document);
      if (!detail.ok) throw new Error("Expected inspection");
      for (const [endpoint, outer] of Object.entries(detail.endpoints)) {
        if (!endpoint.includes(".")) continue;
        const owner = result.annotations?.nets.find(({ net }) => net === outer.net);
        expect(owner?.segments.some(({ a }) => a[0] === outer.x && a[1] === outer.y)).toBe(true);
        expect(result.svg).toContain(
          `data-net="${escapeXML(outer.net)}" data-pin-lead="${escapeXML(endpoint)}"`,
        );
      }
    });
    test("every external pin lead has its actual net owner and leaves the glyph body neutral", () => {
      const document = annotated(recipe);
      const result = success(renderSVG(document));
      const detail = inspect(document);
      if (!detail.ok) throw new Error("Expected inspect success");
      const basicLengths: Record<string, number> = {
        resistor: 20,
        capacitor: 18,
        "dc-source": 18,
        "led:anode": 19,
        "led:cathode": 32,
      };
      const complexLengths: Record<string, number> = {
        resistor: 20,
        capacitor: 50,
        diode: 38,
        led: 38,
        "dc-source": 28,
        "npn:base": 60,
        "npn:collector": 20,
        "npn:emitter": 20,
        "op-amp:inverting": 60,
        "op-amp:noninverting": 60,
        "op-amp:output": 50,
        "op-amp:vplus": 80,
        "op-amp:vminus": 80,
      };
      const complex = createComplexScene(result.document, formatSI);
      if (complex) {
        for (const endpoint of Object.keys(detail.endpoints).filter((key) => key.includes(".")))
          expect(complex.leads?.some((lead) => lead.endpoint === endpoint)).toBe(true);
      }
      const unannotated = structuredClone(document);
      delete unannotated.presentation.annotations;
      const baseline = success(renderSVG(unannotated));
      for (const [id, component] of Object.entries(document.circuit.components)) {
        expect(symbolPaths(result.svg, id)).toEqual(symbolPaths(baseline.svg, id));
        expect(result.svg).toContain(
          `<g data-component="${escapeXML(id)}" stroke="${themes[document.presentation.theme.preset].wire}"`,
        );
        const endpoints = Object.entries(detail.endpoints).filter(([key]) =>
          key.startsWith(`${id}.`),
        );
        for (const [endpoint, outer] of endpoints) {
          const pin = endpoint.slice(id.length + 1);
          const lengths = complex ? complexLengths : basicLengths;
          const length =
            !complex && component.type === "resistor" && outer.x === 600
              ? 14
              : (lengths[`${component.type}:${pin}`] ?? lengths[component.type]);
          expect(length).toBeDefined();
          const owner = result.annotations?.nets.find(({ net }) => net === outer.net);
          expect(owner).toBeDefined();
          const leadTag = [
            ...result.svg.matchAll(/<path data-net="[^"]*" data-pin-lead="[^"]*"[^>]*\/>/g),
          ]
            .map(([tag]) => tag)
            .find((tag) => tag.includes(`data-pin-lead="${escapeXML(endpoint)}"`));
          expect(leadTag).toBeDefined();
          expect(leadTag).toContain(`data-net="${escapeXML(outer.net)}"`);
          expect(leadTag).toContain(`stroke="${owner?.color}"`);
          expect(leadTag).toContain('stroke-linecap="butt"');
          const path = leadTag?.match(/\bd="([^"]*)"/)?.[1];
          expect(owner?.paths).toContain(path);
          const segment = owner?.segments.find(
            ({ a, b }) =>
              a[0] === outer.x &&
              a[1] === outer.y &&
              Math.abs(Math.hypot(b[0] - a[0], b[1] - a[1]) - (length ?? 0)) < 0.001,
          );
          expect(segment, endpoint).toBeDefined();
          if (component.type === "npn") {
            const expected: readonly [number, number] =
              pin === "base"
                ? [outer.x + 60, outer.y]
                : [outer.x, outer.y + (pin === "collector" ? 20 : -20)];
            expect(segment?.b).toEqual(expected);
          }
        }
      }
      for (const [port, entry] of Object.entries(document.circuit.ports)) {
        if (entry.kind !== "ground") continue;
        const net = detail.endpoints[port]?.net;
        const color = result.annotations?.nets.find((annotation) => annotation.net === net)?.color;
        expect(result.svg).toContain(`<g data-component="${escapeXML(port)}" stroke="${color}"`);
      }
      expect(result.svg.match(/data-junction=/g)?.length ?? 0).toBe(
        baseline.svg.match(/data-junction=/g)?.length ?? 0,
      );
      expect(result.svg).not.toContain("filter=");
    });
  });
}

describe("annotation input semantics and honest failures", () => {
  test("roles and net renames including __proto__ retain ownership and author order", () => {
    const original = annotated();
    const document: FigureDocument = JSON.parse(
      JSON.stringify(original).replaceAll("R1", "X1").replaceAll("R2", "X2"),
    );
    const entries = Object.entries(document.circuit.nets);
    const renamed = new Map(
      entries.map(([net], index) => [net, index === 0 ? "__proto__" : `renamed${index}`]),
    );
    document.circuit.nets = Object.fromEntries(
      entries.map(([net, endpoints]) => [renamed.get(net), endpoints]),
    );
    config(document).nets = config(document)
      .nets.map((annotation) => ({
        ...annotation,
        net: renamed.get(annotation.net) ?? annotation.net,
      }))
      .reverse();
    const before = JSON.stringify(document);
    const result = success(renderSVG(document));
    expect(Object.hasOwn(result.circuit.nets, "__proto__")).toBe(true);
    expect(result.annotations?.nets.map(({ net }) => net)).toEqual(
      config(document).nets.map(({ net }) => net),
    );
    expect(
      result.annotations?.nets.find(({ net }) => net === "__proto__")?.paths.length,
    ).toBeGreaterThan(0);
    expect(result.svg).toContain('data-pin-lead="X1.a"');
    expect(JSON.stringify(document)).toBe(before);
  });
  test("a partial annotation leaves all other nets unannotated and accepts explicit tone reuse", () => {
    const document = annotated();
    config(document).nets = [first(document)];
    delete config(document).caption;
    const result = success(renderSVG(document));
    expect(result.annotations?.nets).toHaveLength(1);
    expect(result.annotations?.caption).toBe("");
    expect(result.svg.match(/data-net-label=/g)).toHaveLength(1);
    const all = annotated();
    for (const annotation of config(all).nets) annotation.tone = "blue";
    const reused = success(renderSVG(all));
    expect(new Set(reused.annotations?.nets.map(({ color }) => color)).size).toBe(1);
    expect(new Set(reused.annotations?.nets.map(({ label }) => label)).size).toBe(3);
  });
  test("empty description, empty list, caption-only and hidden legend are explicit valid configurations", () => {
    const document = annotated();
    first(document).description = "";
    success(renderSVG(document));
    config(document).nets = [];
    config(document).legend = false;
    const full = success(renderFigureSVG(document));
    expect(full.svg).toContain('data-caption="true"');
    expect(full.svg).not.toContain("data-legend-net=");
    delete config(document).caption;
    expect(renderFigureSVG(document)).toEqual(renderSVG(document));
  });
  test("unknown own references, duplicate nets and ambiguous labels fail all entry points", () => {
    for (const net of ["missing", "toString", "__proto__"]) {
      const document = annotated();
      first(document).net = net;
      fails(document, "annotation.unknown_net");
    }
    const duplicate = annotated();
    config(duplicate).nets.push({ ...first(duplicate), label: "Z" });
    fails(duplicate, "annotation.duplicate_net");
    const duplicateLabel = annotated();
    const second = config(duplicateLabel).nets[1];
    if (!second) throw new Error("Expected second net");
    second.label = ` ${first(duplicateLabel).label} `;
    fails(duplicateLabel, "annotation.duplicate_label");
  });
  test("strict fields, required explicit tones and nonempty IDs/labels use schema diagnostics", () => {
    const variants: unknown[] = [];
    for (const field of ["tone", "net", "label", "description"]) {
      const document = annotated();
      Reflect.deleteProperty(first(document), field);
      variants.push(document);
    }
    for (const [field, value] of [
      ["tone", "orange"],
      ["tone", "#000000"],
      ["label", " "],
      ["net", ""],
      ["description", 2],
      ["extra", true],
    ] as const) {
      const document = annotated();
      Reflect.set(first(document), field, value);
      variants.push(document);
    }
    for (const [field, value] of [
      ["legend", "true"],
      ["caption", null],
      ["extra", false],
      ["nets", {}],
    ] as const) {
      const document = annotated();
      Reflect.set(config(document), field, value);
      variants.push(document);
    }
    const missingLegend = annotated();
    Reflect.deleteProperty(config(missingLegend), "legend");
    variants.push(missingLegend);
    for (const document of variants) fails(document, "document.invalid_field");
  });
  test("missing glyphs, XML controls and unbreakable overflow fail even with legend hidden", () => {
    for (const field of ["label", "description", "caption"] as const) {
      for (const [value, code] of [
        ["Unsupported 🧠", "font.missing_glyph"],
        ["bad\u0001text", "document.invalid_field"],
        ["W".repeat(400), "layout.label_collision"],
      ] as const) {
        const document = annotated();
        config(document).legend = false;
        if (field === "caption") config(document).caption = value;
        else first(document)[field] = value;
        fails(document, code);
      }
    }
  });
  test("plain text markup is escaped in accessible metadata, never interpreted", () => {
    const document = annotated();
    first(document).label = "<A>";
    first(document).description = '<script>alert("not markup")</script> & plain text';
    config(document).caption = "áéíóú ñ Ω µ π <b>Caption</b>";
    const before = structuredClone(document);
    const result = success(renderFigureSVG(document));
    expect(result.svg).not.toContain("<script>");
    expect(result.svg).not.toContain("<b>");
    expect(result.svg).toContain("&lt;script&gt;");
    expect(result.annotations?.nets[0]?.description).toBe(first(document).description);
    expect(document).toEqual(before);
  });
  test("legend and caption wrap at measured word boundaries without changing font size", () => {
    const document = annotated();
    first(document).description = "A connected conductor shares its electrical node. "
      .repeat(18)
      .trim();
    config(document).caption = "This is a wrapped explanatory caption. ".repeat(20).trim();
    const result = success(renderFigureSVG(document));
    const legendLines = Object.entries(result.bounds.labels).filter(([key]) =>
      key.startsWith(`legend:${first(document).net}:`),
    );
    const captionLines = Object.entries(result.bounds.labels).filter(([key]) =>
      key.startsWith("caption:"),
    );
    expect(legendLines.length).toBeGreaterThan(1);
    expect(captionLines.length).toBeGreaterThan(1);
    expect(result.svg).toContain("scale(0.018)");
    const boxes = [...legendLines, ...captionLines].map(([, box]) => box);
    for (const [index, box] of boxes.entries()) {
      for (const other of boxes.slice(index + 1)) expect(overlaps(box, other)).toBe(false);
    }
  });
  test("annotation palette is checked against custom backgrounds", () => {
    const document = annotated();
    document.presentation.theme.overrides = {
      background: "#005bb5",
      wire: "#ffffff",
      label: "#ffffff",
      muted: "#ffffff",
      highlight: "#ffffff",
    };
    first(document).tone = "blue";
    const diagnostics = fails(document, "theme.insufficient_contrast");
    expect(diagnostics.some(({ path }) => path === "/presentation/annotations/nets/0/tone")).toBe(
      true,
    );
  });
});
