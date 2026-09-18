import { expect, test } from "bun:test";
import { Resvg } from "@resvg/resvg-js";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { textPath } from "../src/typography.ts";
import { privacyFixture } from "../src/v2/fixtures.ts";
import {
  type AuthorFigure,
  authorFigure,
  inspectEducational,
  label,
  math,
  type Panel,
  type PublicFigure,
  part,
  point,
  projectFigure,
  type Result,
  renderEducationalSVG,
  type Shape,
  type Stage,
  stageModel,
  validateAuthorFigure,
  validateEducational,
} from "../src/v2/index.ts";
import { mathGeometry } from "../src/v2/math-text.ts";
import { EducationalFigure } from "../src/v2/react.tsx";

function success<T>(result: Result<T>) {
  if (!result.ok) throw new Error(JSON.stringify(result.diagnostics));
  return result;
}
function project(author: unknown, stage: Stage = "question") {
  return success(projectFigure(author, stage)).document;
}
function single(panel: Panel): AuthorFigure {
  const model = stageModel([panel]);
  return authorFigure("quality", { teaching: model, question: model, correction: model });
}
function textOf(shapes: Shape[]) {
  return shapes.filter((s) => s.kind === "math").map((s) => s.runs.map((r) => r.text).join(""));
}
function scale(): Extract<Panel, { kind: "scale" }> {
  return {
    kind: "scale",
    id: "scale",
    at: point(20, 60),
    unit: "A",
    prefix: "m",
    ticks: [0, 0.025, 0.05, 0.075, 0.1],
    width: 400,
    showConverted: false,
  };
}
function marker(panel: Panel) {
  const document = project(single(panel));
  const shapes = document.display.find((p) => p.id === "scale/value")?.shapes;
  if (!shapes) throw new Error("missing scale marker");
  return { document, shapes };
}

test("nonselected malformed models, private IDs, glyphs, and changed kinds cannot affect public outputs", () => {
  const baseline = privacyFixture();
  const expected = projectFigure(baseline, "question");
  const expectedDocument = project(baseline);
  const malformed: unknown[] = [
    null,
    false,
    17,
    [],
    "PRIVATE_BODY_873",
    { PRIVATE_FIELD_713: "PRIVATE_VALUE_944", id: "PRIVATE_ID_987" },
    { title: "🧪\ud800", panels: "PRIVATE_PANELS_761" },
    {
      title: "PRIVATE_TITLE_591",
      description: "",
      theme: "bad-theme",
      panels: [{ kind: "wrong", id: "PRIVATE_ID_891", value: { unit: "watts", value: 1e13 } }],
      expose: [],
    },
    stageModel([
      {
        kind: "readings",
        id: "circuit",
        at: point(0, 0),
        items: [
          {
            id: "PRIVATE_ITEM_843",
            label: math("🧪"),
            reading: { mode: "authored", value: { kind: "unknown", unit: "V" } },
          },
        ],
      },
    ]),
  ];
  for (const hidden of malformed) {
    const author = {
      ...baseline,
      stages: { teaching: hidden, question: baseline.stages.question, correction: hidden },
    };
    expect(projectFigure(author, "question")).toEqual(expected);
    const document = project(author);
    expect(renderEducationalSVG(document)).toEqual(renderEducationalSVG(expectedDocument));
    expect(inspectEducational(document)).toEqual(inspectEducational(expectedDocument));
    expect(validateEducational(document)).toEqual(validateEducational(expectedDocument));
    expect(JSON.stringify(success(renderEducationalSVG(document)))).not.toContain("PRIVATE_");
    expect(validateAuthorFigure(author).ok).toBe(false);
  }
  for (const selected of ["teaching", "correction"] as const) {
    const model = baseline.stages[selected];
    const clean = { ...baseline, stages: { teaching: model, question: model, correction: model } };
    const dirty = {
      ...baseline,
      stages: {
        teaching: null,
        question: { PRIVATE_FIELD: "x" },
        correction: null,
        [selected]: model,
      },
    };
    expect(projectFigure(dirty, selected)).toEqual(projectFigure(clean, selected));
  }
});

test("strict outer envelope, selected schema, selected IDs and resource gates still fail closed", () => {
  const author = privacyFixture();
  const bad = [
    { ...author, hidden: 123 },
    { ...author, id: "not/a/public/id" },
    { ...author, schema: "circuitkit.educational.public.v2" },
    { ...author, stages: { ...author.stages, private: {} } },
    { ...author, stages: { question: author.stages.question } },
    {
      ...author,
      stages: { ...author.stages, question: { ...author.stages.question, hidden: 123 } },
    },
    { ...author, stages: { ...author.stages, question: null } },
    { ...author, stages: { ...author.stages, correction: "x".repeat(1001) } },
  ];
  const failure = projectFigure(null, "question");
  for (const input of bad) expect(projectFigure(input, "question")).toEqual(failure);
  const duplicate = privacyFixture();
  const panel = duplicate.stages.question.panels[0];
  if (panel) duplicate.stages.question.panels.push(panel);
  expect(projectFigure(duplicate, "question")).toEqual(failure);
  for (const api of [renderEducationalSVG, inspectEducational, validateEducational])
    expect(api(author).ok).toBe(false);
});

test("public failure diagnostics are independent of nonselected malformed data", () => {
  const author = privacyFixture();
  const question = { ...author.stages.question, theme: "PRIVATE_BAD_THEME" };
  const first = { ...author, stages: { ...author.stages, question } };
  const second = {
    ...author,
    stages: {
      teaching: { PRIVATE_FIELD: 19 },
      question,
      correction: { id: "PRIVATE_ID_77", secret: "🧪" },
    },
  };
  expect(projectFigure(first, "question")).toEqual(projectFigure(second, "question"));
  expect(JSON.stringify(projectFigure(second, "question"))).not.toContain("PRIVATE_");
});

test("reading columns and row spacing use the same outlines as the actual SVG", () => {
  const panel: Panel = {
    kind: "readings",
    id: "readings",
    at: point(100, 200),
    items: [
      {
        id: "long",
        label: math("Measured voltage between reference and output terminals"),
        reading: { mode: "authored", value: { kind: "known", value: -0.125, unit: "V" } },
      },
      {
        id: "scripts",
        label: [
          { text: "V", script: "base" },
          { text: "reference", script: "sub" },
          { text: "2", script: "sup" },
          { text: " ≥ threshold", script: "base" },
        ],
        reading: {
          mode: "authored",
          value: {
            kind: "symbolic",
            unit: "V",
            symbol: [
              { text: "V", script: "base" },
              { text: "out", script: "sub" },
              { text: "2", script: "sup" },
            ],
          },
        },
      },
      {
        id: "longest",
        label: math("W".repeat(120)),
        reading: { mode: "authored", value: { kind: "unknown", unit: "A" } },
      },
    ],
  };
  const original = structuredClone(panel);
  const document = project(single(panel));
  let previousBottom = -Infinity;
  const positions: number[] = [];
  for (const part of document.display) {
    const name = part.shapes[0];
    const value = part.shapes[1];
    if (name?.kind !== "math" || value?.kind !== "math") throw new Error("reading shape");
    const left = mathGeometry(name).bounds;
    const right = mathGeometry(value).bounds;
    expect(right.x - (left.x + left.width)).toBeGreaterThanOrEqual(23.99999);
    expect(Math.min(left.y, right.y) - previousBottom).toBeGreaterThanOrEqual(15.99999);
    previousBottom = Math.max(left.y + left.height, right.y + right.height);
    positions.push(value.at.x);
  }
  expect(Math.min(...positions)).toBeGreaterThan(180);
  for (const theme of ["geist-light", "geist-dark", "geist-print"] as const) {
    const rendered = success(renderEducationalSVG({ ...document, theme }));
    expect(success(renderEducationalSVG({ ...document, theme })).svg).toBe(rendered.svg);
    expect(
      new Resvg(rendered.svg, {
        font: { loadSystemFonts: false },
        fitTo: { mode: "width", value: 1000 },
      }).render().width,
    ).toBe(1000);
  }
  expect(panel).toEqual(original);
});

test("v2 operator outlines support scripts and native SVG while preserving pinned font text", () => {
  expect(textPath("≥", "sans", 18, 0, 0).missing).toEqual(["≥"]);
  for (const family of ["sans", "mono"] as const) {
    const shape: Extract<Shape, { kind: "math" }> = {
      kind: "math",
      at: point(13, 19),
      runs: math("AV 12 Ω"),
      size: 18,
      align: "left",
      family,
      tone: "ink",
    };
    const pinned = textPath("AV 12 Ω", family, 18, 13, 19);
    expect(mathGeometry(shape).paths).toBe(pinned.svg);
    expect(mathGeometry(shape).bounds).toEqual(pinned.box);
    const operatorShape = {
      ...shape,
      runs: [
        { text: "Δt ≥ 10 → HIGH; V ≤ 0.8 ← LOW; ↑ ↓ ↔ ≠", script: "base" as const },
        { text: "≥2", script: "sup" as const },
        { text: "≤1", script: "sub" as const },
      ],
    };
    const document: PublicFigure = {
      schema: "circuitkit.educational.public.v2",
      id: "operators",
      title: "Operators",
      description: "",
      theme: "geist-light",
      display: [part("operators", [operatorShape])],
      targets: [],
    };
    for (const theme of ["geist-light", "geist-dark", "geist-print"] as const) {
      const rendered = success(renderEducationalSVG({ ...document, theme }));
      expect(rendered.svg).toContain("Δt ≥ 10 → HIGH");
      expect(rendered.svg).not.toMatch(/<text|foreignObject|<style|href=|NaN|Infinity/);
      expect(
        new Resvg(rendered.svg, { font: { loadSystemFonts: false } }).render().width,
      ).toBeGreaterThan(0);
      expect(success(inspectEducational({ ...document, theme })).bounds).toEqual(rendered.bounds);
    }
    const invalid = { ...document, display: [part("operators", [label(point(0, 0), "∰ 🧪")])] };
    expect(validateEducational(invalid).ok).toBe(false);
  }
});

test("prefixed scale input labels the source ruler and reveals conversion only when enabled", () => {
  const panel = scale();
  panel.input = { from: "prefixed", magnitude: 40 };
  const before = structuredClone(panel);
  const question = marker(panel);
  expect(textOf(question.shapes)).toEqual(["40 mA"]);
  expect(question.shapes.filter((s) => s.kind === "circle").map((s) => s.at.y)).toEqual([140]);
  const given = question.shapes.find((s) => s.kind === "math");
  expect(given?.at.x).toBeCloseTo(180, 10);
  expect(given?.at.y).toBe(194);
  panel.showConverted = true;
  const correction = marker(panel);
  expect(textOf(correction.shapes)).toEqual(["40 mA", "0.04 A"]);
  expect(correction.shapes.slice(0, question.shapes.length)).toEqual(question.shapes);
  expect(correction.shapes.filter((s) => s.kind === "circle").map((s) => s.at.y)).toEqual([
    140, 60,
  ]);
  expect(before.input?.magnitude).toBe(40);
  const json = JSON.stringify(question.document);
  expect(json).not.toContain('"magnitude"');
  expect(json).not.toContain('"from"');
});

test("base, negative, zero, and converted-maximum markers use their quantity rather than ruler maximum", () => {
  const panel = scale();
  panel.input = { from: "base", magnitude: 0.04 };
  expect(textOf(marker(panel).shapes)).toEqual(["0.04 A"]);
  panel.showConverted = true;
  expect(textOf(marker(panel).shapes)).toEqual(["0.04 A", "40 mA"]);
  panel.showConverted = false;
  for (const [magnitude, expectedX] of [
    [0, 20],
    [100, 420],
  ] as const) {
    panel.input = { from: "prefixed", magnitude };
    const { shapes } = marker(panel);
    expect(textOf(shapes)).toEqual([`${magnitude} mA`]);
    const circle = shapes.find((s) => s.kind === "circle");
    expect(circle?.at.x).toBe(expectedX);
  }
  panel.ticks = [-0.1, 0, 0.1];
  panel.input = { from: "prefixed", magnitude: -40, display: math("-40.0") };
  const { shapes } = marker(panel);
  expect(textOf(shapes)).toEqual(["-40.0 mA"]);
  const dot = shapes.find((s) => s.kind === "circle");
  expect(dot?.at.x).toBeCloseTo(140, 10);
});

test("scale input stays strict and rejects ambiguous, out-of-range and underflowed quantities", () => {
  const panel = scale();
  panel.input = { from: "prefixed", magnitude: 101 };
  expect(projectFigure(single(panel), "question").ok).toBe(false);
  panel.input.magnitude = -1e-10;
  expect(projectFigure(single(panel), "question").ok).toBe(false);
  panel.input.magnitude = Number.MIN_VALUE;
  expect(projectFigure(single(panel), "question").ok).toBe(false);
  panel.input.magnitude = 40;
  panel.value = { kind: "known", value: 0.04, unit: "A" };
  expect(projectFigure(single(panel), "question").ok).toBe(false);
  delete panel.input;
  expect(textOf(marker(panel).shapes)).toEqual(["0.04 A"]);
  const bad = {
    ...panel,
    input: { from: "prefixed" as const, magnitude: 40, unit: "invented", html: "<script>" },
  };
  expect(projectFigure(single(bad), "question").ok).toBe(false);
});

test("empty stages are public no-figure projections, not placeholders or author-schema errors", () => {
  const author = privacyFixture();
  author.stages.question = stageModel([], { title: "No figure", description: "Host prose only" });
  expect(validateAuthorFigure(author).ok).toBe(true);
  const document = project(author);
  expect(document.display).toEqual([]);
  expect(document.targets).toEqual([]);
  const rendered = success(renderEducationalSVG(document));
  expect(rendered.svg).toBe("");
  expect(rendered.bounds).toEqual({ x: 0, y: 0, width: 0, height: 0 });
  expect(rendered.diagnostics).toEqual([]);
  expect(success(inspectEducational(document)).targets).toEqual([]);
  expect(success(validateEducational(document)).document).toEqual(document);
  expect(project(author, "correction").display.length).toBeGreaterThan(0);
  const client = document.display.length ? createElement(EducationalFigure, { document }) : null;
  expect(renderToStaticMarkup(client)).toBe("");
  expect(
    validateEducational({
      ...document,
      targets: [{ id: "fake", role: "body", label: "Placeholder" }],
    }).ok,
  ).toBe(false);
  author.stages.question.expose = [{ id: "fake", role: "body", label: "Placeholder" }];
  expect(projectFigure(author, "question").ok).toBe(false);
  expect(renderEducationalSVG(null).ok).toBe(false);
});
