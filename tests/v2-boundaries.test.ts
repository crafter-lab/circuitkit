import { expect, test } from "bun:test";
import { educationFixtures, privacyFixture } from "../src/v2/fixtures.ts";
import {
  type AuthorFigure,
  known,
  math,
  projectFigure,
  renderEducationalSVG,
  resolveReading,
  type Stage,
  signalTimeId,
  symbolic,
  unknown,
  validateAuthorFigure,
} from "../src/v2/index.ts";

function projected(author: AuthorFigure, stage: Stage = "question") {
  const result = projectFigure(author, stage);
  if (!result.ok) throw new Error(JSON.stringify(result.diagnostics));
  return result.document;
}

test("signal edge identity survives inserting earlier transitions", () => {
  const fixture = educationFixtures().signal;
  if (!fixture) throw new Error("fixture");
  const before = projected(fixture);
  const signal = fixture.stages.correction.panels[0];
  if (signal?.kind !== "signal" || signal.data.mode !== "transitions") throw new Error("fixture");
  signal.data.changes.unshift({ at: 1, level: "LOW" }, { at: 2, level: "HIGH" });
  const after = projected(fixture, "correction");
  for (const item of before.display.filter((p) => p.id.includes("/edge/")))
    expect(after.display.find((p) => p.id === item.id)).toEqual(item);
  expect(after.display.some((p) => p.id === `signal/edge/${signalTimeId(1)}`)).toBe(true);
});

test("known-value display is separate from physical calculation", () => {
  const reading = resolveReading({
    mode: "derived",
    operation: "power",
    inputs: [known(2, "V", math("PRIVATE_DISPLAY_NOT_A_NUMBER")), known(3, "A")],
    assumptions: ["passive-sign"],
  });
  expect(reading).toEqual(known(6, "W"));
  expect(() =>
    resolveReading({
      mode: "derived",
      operation: "ohm-current",
      inputs: [known(Number.MIN_VALUE, "V"), known(1e12, "Ω")],
      assumptions: ["ohmic", "passive-sign"],
    }),
  ).toThrow();
});

test("unknown bars and scales have no invented quantitative geometry", () => {
  const fixtures = educationFixtures();
  const bars = fixtures.bars;
  const scale = fixtures.scale;
  if (!bars || !scale) throw new Error("fixture");
  const barPanel = bars.stages.question.panels[0];
  const scalePanel = scale.stages.question.panels[0];
  if (barPanel?.kind !== "bars" || scalePanel?.kind !== "scale") throw new Error("fixture");
  if (barPanel.items[0]) barPanel.items[0].value = unknown("W");
  if (barPanel.items[1]) barPanel.items[1].value = symbolic(math("P"), "W");
  const publicBars = projected(bars);
  for (const id of ["source", "demand"])
    expect(
      publicBars.display
        .find((p) => p.id === `bars/bar/${id}`)
        ?.shapes.every((s) => s.kind === "math"),
    ).toBe(true);
  scalePanel.value = unknown("A");
  scalePanel.showConverted = false;
  expect(
    projected(scale)
      .display.find((p) => p.id === "scale/value")
      ?.shapes.every((s) => s.kind === "math"),
  ).toBe(true);
  scalePanel.showConverted = true;
  expect(projectFigure(scale, "question").ok).toBe(false);
});

test("same-node probes remain independent and produce zero under explicit assumptions", () => {
  const fixture = privacyFixture();
  const meter = fixture.stages.teaching.panels[1];
  if (meter?.kind !== "measurement") throw new Error("fixture");
  meter.negative.terminal = meter.positive.terminal;
  const result = renderEducationalSVG(projected(fixture, "teaching"));
  expect(result.ok).toBe(true);
  if (result.ok) expect(result.svg).toContain("0 V");
  const circuit = fixture.stages.teaching.panels[0];
  if (circuit?.kind !== "electrical") throw new Error("fixture");
  const terminal = circuit.terminals.find((t) => t.id === meter.positive.terminal);
  if (terminal) terminal.potential = unknown("V");
  expect(projectFigure(fixture, "teaching").ok).toBe(false);
});

test("all-zero bars and equal counters have finite bounds", () => {
  const fixtures = educationFixtures();
  const bars = fixtures.bars;
  const timeline = fixtures.timeline;
  if (!bars || !timeline) throw new Error("fixture");
  for (const model of Object.values(bars.stages)) {
    const panel = model.panels[0];
    if (panel?.kind !== "bars") throw new Error("fixture");
    panel.items.forEach((item) => {
      item.value = known(0, "W");
    });
  }
  for (const model of Object.values(timeline.stages)) {
    const panel = model.panels[0];
    if (panel?.kind !== "timeline") throw new Error("fixture");
    panel.start = 0;
    panel.now = 0;
    panel.wraps = 0;
  }
  expect(validateAuthorFigure(bars).ok).toBe(true);
  expect(validateAuthorFigure(timeline).ok).toBe(true);
  for (const fixture of [bars, timeline]) {
    const result = renderEducationalSVG(projected(fixture));
    expect(result.ok).toBe(true);
    if (result.ok) expect(Object.values(result.bounds).every(Number.isFinite)).toBe(true);
  }
});

test("target roles cannot claim a different generated part role", () => {
  const fixture = privacyFixture();
  const target = fixture.stages.question.expose[0];
  if (target) target.role = "reading";
  expect(projectFigure(fixture, "question").ok).toBe(false);
});
