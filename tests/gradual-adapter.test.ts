import { describe, expect, test } from "bun:test";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { publicAdapterExamples } from "../app/education/examples.ts";
import {
  hostReasons,
  hostStatus,
  type Manifest,
  occurrenceStage,
  pairFigures,
  themes,
  verifyCorrectionIdentity,
  verifySelectedIsolation,
} from "../scripts/check-gradual-coverage.ts";
import {
  adaptGradualFigure,
  adaptGradualPair,
  type GradualAdapted,
  type GradualPair,
  gradualAnnotationCollisions,
  gradualId,
  gradualText,
  gradualTutorTarget,
  layoutGradualAnnotations,
  projectGradualPair,
  renderGradualFigure,
  renderGradualHost,
} from "../src/integrations/gradual.ts";
import { analyzeElectrical } from "../src/v2/electrical.ts";
import {
  type AuthorFigure,
  type ElectricalPanel,
  projectFigure,
  renderEducationalSVG,
  type Stage,
  validateAuthorFigure,
} from "../src/v2/index.ts";
import { debounceEvents, signalEvents } from "../src/v2/signals.ts";

const root = resolve(import.meta.dir, "../artifacts/gradual-corpus");
const privateCorpus = process.env.CIRCUITKIT_PRIVATE_CORPUS === "1";
const manifest: Manifest | null = privateCorpus
  ? JSON.parse(await readFile(resolve(root, "manifest.json"), "utf8"))
  : null;
const adapt = (input: unknown, stage: Stage = "teaching"): GradualAdapted => {
  const result = adaptGradualFigure(input, { stage });
  if (!result.ok) throw new Error(JSON.stringify(result.diagnostics));
  return result;
};
const pair = (question: unknown, correction?: unknown): GradualPair => {
  const result = adaptGradualPair({ id: "test-pair", question, correction });
  if (!result.ok) throw new Error(JSON.stringify(result.diagnostics));
  return result;
};
const circuit = (a: GradualAdapted): ElectricalPanel => {
  const p = a.model.panels.find((p): p is ElectricalPanel => p.kind === "electrical");
  if (!p) throw new Error("No electrical panel");
  return p;
};
const publicOutput = (p: GradualPair, stage: Stage = "question") => {
  const result = projectGradualPair(p, stage);
  if (!result.ok) throw new Error("Projection failed");
  const rendered = result.document ? renderEducationalSVG(result.document) : null;
  if (rendered && !rendered.ok) throw new Error("Render failed");
  return {
    document: result.document,
    svg: rendered?.svg ?? null,
    host: result.host,
    html: renderGradualHost(result.host),
  };
};
const author = (a: GradualAdapted): AuthorFigure => ({
  schema: "circuitkit.educational.author.v2",
  id: "test",
  stages: { teaching: a.model, question: a.model, correction: a.model },
});
const base = {
  kind: "divider",
  caption: "Given circuit",
  supply: "2 AA pack",
  upper: "R₁",
  lower: "2 kΩ",
};

function frozen<T>(value: T): T {
  if (value && typeof value === "object") {
    Object.freeze(value);
    for (const child of Object.values(value)) frozen(child);
  }
  return value;
}

describe("family annotation ink layout", () => {
  test("actual eighteen main-app demos have no label/stroke collisions in any stage/theme", () => {
    for (const theme of themes)
      for (const stage of ["teaching", "question", "correction"] as const) {
        const demos = publicAdapterExamples(stage, theme);
        expect(demos).toHaveLength(18);
        for (const demo of demos) {
          if (!demo.document) {
            expect(demo.family).toBe("record");
            continue;
          }
          expect(
            gradualAnnotationCollisions(demo.document, 1),
            `${demo.family} ${stage} ${theme}`,
          ).toEqual([]);
          expect(renderEducationalSVG(demo.document).ok).toBe(true);
        }
      }
  });

  test("ISSUE004 and ISSUE006 labels are beside their leads, nodes and board borders", () => {
    const demos = publicAdapterExamples("question", "geist-light");
    const text = (family: string, id: string) => {
      const shape = demos
        .find((demo) => demo.family === family)
        ?.document?.display.find((part) => part.id === id)
        ?.shapes.find((s) => s.kind === "math");
      if (shape?.kind !== "math") throw new Error(`Missing given label ${family}/${id}`);
      return shape;
    };
    expect(text("pullup", "figure/label/upper").at.x).toBeGreaterThan(0);
    expect(text("pullup", "figure/label/button").at.x).toBeGreaterThan(16);
    expect(text("led", "figure/label/lower").at.x).toBeGreaterThan(390);
    expect(text("led", "figure/terminal-label/B").at.x).not.toBe(360);
    expect(text("led", "figure/terminal-label/C").at.x).not.toBe(360);
    expect(text("breadboard", "figure-parts/label/lower").at.x).not.toBe(280);
    expect(text("breadboard", "figure/contact-label/contact-b-4").at.x).not.toBe(120);
    expect(text("breadboard", "figure/contact-label/contact-d-6").at.x).not.toBe(280);
    expect(text("fragment", "figure/terminal-label/point-2").at.x).not.toBe(360);
    expect(text("loop", "figure/terminal-label/C").at.x).not.toBe(360);
    for (const id of ["A", "C"]) {
      expect(text("supply", `figure/terminal-label/${id}`).align).toBe("center");
      expect(text("supply", `figure/terminal-label/${id}`).at.x).toBeLessThan(200);
    }
    expect(text("supply", "figure/terminal-label/A").at).toEqual({ x: 168, y: 45 });
    expect(text("supply", "figure/terminal-label/C").at).toEqual({ x: 168, y: 175 });
  });

  test.skipIf(!privateCorpus)(
    "all corpus layouts preserve topology, label text, font size, paints and semantic identities",
    () => {
      if (!manifest) throw new Error("The private Gradual manifest is required");
      for (const exact of manifest.exactFigures) {
        const a = adapt(exact.figure);
        const projected = projectFigure(author(a), "teaching");
        if (!projected.ok) throw new Error(`Core rejected ${exact.id}`);
        const raw = {
          ...projected.document,
          display: [...projected.document.display, ...(a.host.additions ?? [])],
        };
        const before = JSON.stringify(raw);
        const placed = layoutGradualAnnotations(raw, a.model);
        const solids = (doc: typeof placed) =>
          doc.display.flatMap((part) =>
            part.shapes
              .filter((shape) => shape.kind !== "math")
              .map((shape) => ({ id: part.id, shape })),
          );
        const labels = (doc: typeof placed) =>
          doc.display.flatMap((part) =>
            part.shapes.flatMap((shape) =>
              shape.kind === "math"
                ? [
                    {
                      id: part.id,
                      runs: shape.runs,
                      size: shape.size,
                      family: shape.family,
                      tone: shape.tone,
                    },
                  ]
                : [],
            ),
          );
        expect(solids(placed), exact.id).toEqual(solids(raw));
        expect(labels(placed), exact.id).toEqual(labels(raw));
        expect(placed.targets).toEqual(raw.targets);
        expect(placed.display.map((part) => part.id)).toEqual(raw.display.map((part) => part.id));
        expect(JSON.stringify(raw)).toBe(before);
        expect(layoutGradualAnnotations(placed, a.model)).toEqual(placed);
      }
    },
  );

  test("collision checks detect diagonal strokes, opaque dots and enclosing painted regions", () => {
    const a = adapt({
      kind: "readings",
      caption: "",
      readings: { items: [{ label: "Label", value: "Given" }] },
    });
    const p = projectFigure(author(a), "question");
    if (!p.ok) throw new Error("fixture");
    const labelPart = p.document.display[0];
    const label = labelPart?.shapes[0];
    if (!labelPart || label?.kind !== "math") throw new Error("label");
    for (const obstacle of [
      {
        kind: "line" as const,
        points: [
          { x: -5, y: -15 },
          { x: 40, y: 5 },
        ],
        tone: "ink" as const,
        width: 2,
        dashed: false,
      },
      {
        kind: "circle" as const,
        at: { x: 10, y: -5 },
        radius: 4,
        tone: "ink" as const,
        fill: "ink" as const,
        stroke: 2,
      },
      {
        kind: "rect" as const,
        at: { x: -20, y: -30 },
        width: 100,
        height: 60,
        radius: 0,
        tone: "ink" as const,
        fill: "ink" as const,
        stroke: 2,
      },
    ])
      expect(
        gradualAnnotationCollisions({
          ...p.document,
          display: [labelPart, { id: "obstacle", shapes: [obstacle] }],
        }).some((hit) => hit.obstacle === "obstacle"),
      ).toBe(true);
    const cover = {
      kind: "rect" as const,
      at: { x: -50, y: -50 },
      width: 300,
      height: 100,
      radius: 0,
      tone: "muted" as const,
      fill: "background" as const,
      stroke: 1,
    };
    expect(
      gradualAnnotationCollisions({
        ...p.document,
        display: [labelPart, { id: "whiteout", shapes: [cover] }],
      }).some((hit) => hit.obstacle === "whiteout"),
    ).toBe(true);
    expect(
      gradualAnnotationCollisions({
        ...p.document,
        display: [{ id: "body", shapes: [cover] }, labelPart],
      }),
    ).toEqual([]);
  });
});

describe("review regressions", () => {
  test("node comparison questions do not receive generated node-count conclusions", () => {
    const figure = { kind: "node-comparison", caption: "How many nodes?" };
    for (const theme of themes) {
      const a = adaptGradualFigure(figure, { stage: "question", theme });
      expect(a.ok).toBe(true);
      if (!a.ok) throw new Error("question");
      expect(a.host.notes).toEqual([]);
      const rendered = renderGradualFigure(a);
      expect(rendered.ok).toBe(true);
      expect(JSON.stringify(rendered).toLowerCase()).not.toContain("one node");
      expect(JSON.stringify(rendered).toLowerCase()).not.toContain("two nodes");
    }
    for (const stage of ["teaching", "correction"] as const) {
      expect(renderGradualHost(adapt(figure, stage).host).toLowerCase()).toContain("one node");
      expect(renderGradualHost(adapt(figure, stage).host).toLowerCase()).toContain("two nodes");
    }
    const authored = adapt(
      { ...figure, caption: "Authored hint: P and Q share one node." },
      "question",
    );
    expect(renderGradualHost(authored.host)).toContain("share one node");
    expect(authored.host.notes).toEqual([]);
    expect(publicOutput(pair(figure, { ...figure, caption: "Private correction" }))).toEqual(
      publicOutput(pair(figure)),
    );
  });

  test("correction annotations cannot paint over an intentionally opened conductor", () => {
    const question = {
      kind: "loop",
      caption: "Question",
      supply: "Battery",
      upper: "R",
      highlightNodes: true,
    };
    const baseline = publicOutput(pair(question));
    for (const correction of [
      { ...question, caption: "Open", open: true },
      { kind: "loop", caption: "Open", supply: "Battery", upper: "R", open: true },
      { ...question, caption: "No highlight", highlightNodes: false },
      { ...question, caption: "Bypass", bypass: "upper" },
    ]) {
      const p = pair(question, correction);
      expect(publicOutput(p)).toEqual(baseline);
      expect(p.host.question.additions?.some((part) => part.id === "figure/host/hint-return")).toBe(
        true,
      );
      const c = publicOutput(p, "correction");
      expect(c.document?.display.some((part) => part.id.includes("/host/hint-"))).toBe(false);
      expect(c.host.notes.some((note) => note.id === "figure-highlight")).toBe(false);
      expect(p.author.stages.correction.panels[0]?.id).toBe("figure");
      if ("open" in correction) {
        const route = c.document?.display.find((part) => part.id === "figure/route/return");
        expect(route?.shapes.length).toBeGreaterThan(1);
        const coversGap = c.document?.display.some((part) =>
          part.shapes.some(
            (shape) =>
              shape.kind === "line" &&
              shape.points.slice(1).some((b, i) => {
                const a = shape.points[i];
                return (
                  a?.y === 420 &&
                  b.y === 420 &&
                  Math.min(a.x, b.x) < 105 &&
                  Math.max(a.x, b.x) > 105
                );
              }),
          ),
        );
        expect(coversGap).toBe(false);
      }
    }
    const unchanged = publicOutput(
      pair(question, { ...question, caption: "Same circuit" }),
      "correction",
    );
    expect(
      unchanged.document?.display.find((part) => part.id === "figure/host/hint-return"),
    ).toEqual(baseline.document?.display.find((part) => part.id === "figure/host/hint-return"));
    const additional = publicOutput(
      pair(question, {
        kind: "levels",
        caption: "Other kind",
        levels: { low: 0.8, high: 2, max: 3.3 },
      }),
      "correction",
    );
    expect(additional.document?.display.some((part) => part.id === "figure/host/hint-return")).toBe(
      true,
    );
    const observed = {
      kind: "readings",
      caption: "Given",
      readings: {
        items: [{ label: "Meter", value: "3", unit: "V" }],
        quantity: "Explicit authored quantity hint",
      },
    };
    const preserved = publicOutput(
      pair(observed, { ...observed, readings: { items: observed.readings.items } }),
      "correction",
    );
    expect(preserved.html).toContain("Explicit authored quantity hint");
  });

  test("dimension mismatches and nonzero numeric underflow are rejected rather than symbolic or zero", () => {
    for (const voltage of [
      "5 A",
      "5mA",
      "? A",
      "V_s A",
      "1e-320 nV",
      "1e-400 V",
      "NaN V",
      "Infinity V",
    ]) {
      expect(
        adaptGradualFigure({ kind: "power", caption: "Invalid", power: { voltage } }).ok,
        voltage,
      ).toBe(false);
      expect(
        adaptGradualFigure({ kind: "supply", caption: "Invalid", voltmeter: { reading: voltage } })
          .ok,
        voltage,
      ).toBe(false);
    }
    const zero = adapt({ kind: "power", caption: "Zero", power: { voltage: "0e-400 nV" } });
    const p = zero.model.panels[0];
    expect(p?.kind === "quantity" && p.items[0]?.reading).toEqual({
      mode: "authored",
      value: { kind: "known", value: 0, unit: "V" },
    });
  });

  test("symbol units are separated once and nominal pack labels never acquire invented SI values", () => {
    for (const voltage of ["V_s V", "$V_s\\,\\mathrm{V}$"]) {
      const a = adapt({ kind: "power", caption: "Symbolic", power: { voltage } });
      const panel = a.model.panels[0];
      expect(panel?.kind === "quantity" && panel.items[0]?.reading).toEqual({
        mode: "authored",
        value: { kind: "symbolic", symbol: gradualText("V_s"), unit: "V" },
      });
      expect(JSON.stringify(renderGradualFigure(a))).not.toContain("Vs V V");
    }
    for (const input of [
      { kind: "loop", caption: "Nominal", supply: "2 AA pack", upper: "R" },
      { kind: "power", caption: "Nominal", power: { voltage: "2 AA pack" } },
      { kind: "supply", caption: "Nominal", voltmeter: { reading: "2 AA pack" } },
    ]) {
      const a = adapt(input);
      const r = renderGradualFigure(a);
      expect(r.ok).toBe(true);
      expect(JSON.stringify(r)).toContain("2 AA pack");
      expect(JSON.stringify(r)).not.toContain("2 AA pack V");
    }
  });

  test("sample-only units, authored windows and acceptance remain visible; unsupported fields fail", () => {
    const signal = {
      samples: ["LOW", "HIGH"],
      unit: "ms",
      window: { from: 1, length: 1, label: "AUTHORED_WINDOW" },
      accept: 2,
    };
    const a = adapt({ kind: "signal", caption: "Given", signal }, "question");
    const p = a.model.panels[0];
    expect(p).toMatchObject({
      kind: "signal",
      unit: "ms",
      window: { from: 1, to: 2, label: gradualText("AUTHORED_WINDOW") },
    });
    const r = renderGradualFigure(a);
    expect(r.ok && r.svg).toContain("AUTHORED_WINDOW");
    expect(r.ok && r.svg).toContain("2 ms");
    expect(a.host.additions?.some((part) => part.id.endsWith("/sample-accept"))).toBe(true);
    const unitOnly = adapt({
      kind: "signal",
      caption: "Unit",
      signal: { samples: ["LOW", "HIGH"], unit: "ms" },
    });
    expect(unitOnly.model.panels[0]).toMatchObject({ kind: "signal", unit: "ms" });
    for (const extra of [
      { end: 10 },
      { settles: "HIGH" },
      { accept: 4 },
      { window: { from: 2, length: 10 } },
    ])
      expect(
        adaptGradualFigure({
          kind: "signal",
          caption: "Unsupported",
          signal: { samples: ["LOW", "HIGH"], ...extra },
        }).ok,
      ).toBe(false);
  });

  test("a voltmeter without probe references cannot disappear in accepted electrical input", () => {
    for (const kind of ["loop", "divider", "led", "potentials"]) {
      expect(
        adaptGradualFigure({ kind, caption: "Missing probes", voltmeter: { reading: "7 V" } }).ok,
      ).toBe(false);
      const a = adapt({
        kind,
        caption: "Explicit probes",
        voltmeter: { reading: "7 V" },
        probes: ["A", "C"],
      });
      expect(a.model.panels.some((p) => p.kind === "measurement")).toBe(true);
      const r = renderGradualFigure(a);
      expect(r.ok && r.svg).toContain("7 V");
    }
    const supplied = adapt({
      kind: "supply",
      caption: "Source contract defaults",
      voltmeter: { reading: "7 V" },
    });
    expect(supplied.model.panels.find((p) => p.kind === "measurement")).toMatchObject({
      positive: { terminal: "A" },
      negative: { terminal: "C" },
    });
  });
});

describe("real Gradual corpus", () => {
  if (!manifest) {
    test.skip("requires CIRCUITKIT_PRIVATE_CORPUS=1 and the local corpus", () => {});
    return;
  }
  test("the attested manifest includes every occurrence, exact figure, pair and null host", () => {
    expect(manifest.occurrences).toHaveLength(652);
    expect(manifest.exactFigures).toHaveLength(344);
    expect(manifest.families).toHaveLength(18);
    expect(manifest.questionSolutionPairs).toHaveLength(319);
    expect(manifest.hostFoundations).toHaveLength(10);
    expect(new Set(manifest.occurrences.map((o) => o.caseId)).size).toBe(652);
    expect(occurrenceStage("exam")).toBe("question");
    expect(occurrenceStage("solution")).toBe("correction");
    expect(occurrenceStage("unit-overview")).toBe("teaching");
  });

  for (const family of manifest.families)
    test(`${family.family}: all exact payloads, all themes and stages`, () => {
      for (const exact of manifest.exactFigures.filter((e) => e.family === family.family))
        for (const theme of themes)
          for (const stage of ["teaching", "question", "correction"] as const) {
            const before = JSON.stringify(exact.figure);
            const adapted = adaptGradualFigure(frozen(exact.figure), {
              theme,
              stage,
              id: exact.id,
            });
            expect(adapted.ok, `${exact.id} ${theme} ${stage}`).toBe(true);
            if (!adapted.ok) continue;
            const r = renderGradualFigure(adapted, exact.id);
            expect(r.ok, exact.id).toBe(true);
            if (!r.ok) continue;
            expect(JSON.stringify(exact.figure)).toBe(before);
            expect(adapted.model.expose).toEqual([]);
            if (family.family === "record") {
              expect(r.svg).toBeNull();
              expect(r.html).toContain("<table>");
              expect(r.html).toContain('scope="row"');
            } else {
              expect(r.document?.theme).toBe(theme);
              expect(r.svg).toContain("<svg");
              expect(r.document?.targets).toEqual([]);
              if (r.document)
                expect(
                  gradualAnnotationCollisions(r.document, 1),
                  `${exact.id} ${stage} ${theme}`,
                ).toEqual([]);
            }
          }
    });

  test("319 real pairs join figures by case IDs, never by solution metadata", () => {
    for (const source of manifest.questionSolutionPairs) {
      const input = pairFigures(manifest, source);
      const before = JSON.stringify(input);
      const a = adaptGradualPair(input);
      expect(a.ok, source.pairId).toBe(true);
      if (!a.ok) continue;
      expect(() => verifyCorrectionIdentity(a), source.pairId).not.toThrow();
      expect(verifySelectedIsolation(a), source.pairId).toBe(5);
      const q = publicOutput(a);
      const c = publicOutput(a, "correction");
      expect(q.document?.targets ?? []).toEqual([]);
      if (!source.questionCaseIds.length) {
        expect(q.svg).toBeNull();
        expect(q.host.kind).toBe("no-figure");
      }
      expect(c).toBeDefined();
      expect(JSON.stringify(input)).toBe(before);
    }
  });

  test("all ten source foundations stay null with their original host context", () => {
    for (const host of manifest.hostFoundations) {
      expect(host.diagram).toBe("none");
      const a = adapt(null);
      expect(a.host.kind).toBe("no-figure");
      expect(a.model.panels).toEqual([]);
      expect(renderGradualFigure(a)).toEqual({
        ok: true,
        diagnostics: [],
        svg: null,
        document: null,
        html: "",
      });
      expect(host.context).toBeDefined();
    }
  });
});

describe("typed reusable geometry", () => {
  test("source/divider/load/current/probes are explicit and do not mutate inputs", () => {
    const input = frozen({
      ...base,
      load: "New branch",
      current: "I",
      probes: ["B", "C"],
      highlightNodes: true,
    });
    const a = adapt(input);
    const p = circuit(a);
    expect(p.components.map((c) => c.kind)).toEqual(["resistor", "source", "resistor", "resistor"]);
    expect(p.components.find((c) => c.id === "source")?.label).toEqual(gradualText("2 AA pack"));
    expect(JSON.stringify(a)).not.toContain("2 AA pack V");
    expect(a.model.panels.some((p) => p.kind === "measurement")).toBe(true);
    expect(a.model.panels.some((p) => p.kind === "readings")).toBe(true);
    expect(a.host.additions?.length).toBeGreaterThan(0);
    expect(a.model.expose).toEqual([]);
    expect(analyzeElectrical(p)).toHaveLength(3);
  });

  test("intentionally open is not dangling and an explicit bypass is not a normal wire", () => {
    const open = adapt({
      kind: "loop",
      caption: "Open",
      open: true,
      upper: "R",
      supply: "Battery",
    });
    expect(circuit(open).routes.find((r) => r.id === "return")).toMatchObject({
      state: "open",
      intent: "intentional-fault",
    });
    expect(projectFigure(author(open), "question").ok).toBe(true);
    const broken = structuredClone(open);
    const route = circuit(broken).routes[0];
    if (!route) throw new Error("route");
    route.to = "absent";
    expect(projectFigure(author(broken), "question").ok).toBe(false);
    const accidental = structuredClone(open);
    const gap = circuit(accidental).routes.find((r) => r.id === "return");
    if (!gap) throw new Error("gap");
    gap.intent = "normal";
    expect(projectFigure(author(accidental), "question").ok).toBe(false);
    for (const bypass of ["upper", "lower"]) {
      const a = adapt({ ...base, bypass });
      expect(circuit(a).routes.find((r) => r.id === "bypass")?.bypass).toBe(bypass);
      expect(projectFigure(author(a), "question").ok).toBe(true);
    }
    expect(adaptGradualFigure({ kind: "loop", caption: "invalid", bypass: "lower" }).ok).toBe(
      false,
    );
  });

  test("LED terminal order is anode then cathode, pullup contains a real button", () => {
    const led = circuit(adapt({ kind: "led", caption: "LED", supply: "5 V", upper: "R" }));
    expect(led.components.find((c) => c.kind === "led")?.terminals).toEqual([
      "lower-positive",
      "lower-negative",
    ]);
    expect(led.terminals.find((t) => t.id === "B")?.label).toEqual(gradualText("A"));
    expect(led.terminals.find((t) => t.id === "C")?.label).toEqual(gradualText("K"));
    for (const open of [true, false]) {
      const p = circuit(adapt({ kind: "pullup", caption: "Button", open }));
      expect(p.components.find((c) => c.kind === "button")?.state).toBe(open ? "open" : "closed");
      expect(analyzeElectrical(p).length).toBe(open ? 3 : 2);
    }
  });

  test("fragments use only declared connections, node comparison has separate geometry", () => {
    const a = adapt({
      kind: "fragment",
      caption: "Fragment",
      fragment: { labels: ["A", "B", "C"], bent: true, resistorAfter: 1 },
    });
    expect(analyzeElectrical(circuit(a))).toHaveLength(2);
    expect(circuit(a).components).toHaveLength(1);
    expect(
      adaptGradualFigure({
        kind: "fragment",
        caption: "Bad",
        fragment: { labels: ["A", "B"], resistorAfter: 1 },
      }).ok,
    ).toBe(false);
    const comparison = adapt({ kind: "node-comparison", caption: "Comparison" });
    expect(comparison.model.panels.filter((p) => p.kind === "electrical")).toHaveLength(2);
  });

  test("signed potentials and negative reference readings are never solved automatically", () => {
    const a = adapt({
      kind: "potentials",
      caption: "Common reference",
      potentials: ["−2 V", "−5 V", "0 V"],
      potentialLabels: ["P", "Q", "X"],
      probes: ["A", "B"],
    });
    expect(circuit(a).terminals[0]?.potential).toEqual({ kind: "known", value: -2, unit: "V" });
    expect(circuit(a).terminals[1]?.potential).toEqual({ kind: "known", value: -5, unit: "V" });
    const m = a.model.panels.find((p) => p.kind === "measurement");
    expect(m?.reading).toEqual({ mode: "authored", value: { kind: "unknown", unit: "V" } });
    const signed = adapt({
      kind: "supply",
      caption: "Reversed reading",
      voltmeter: { reading: "−3.27 V" },
    });
    const meter = signed.model.panels.find((p) => p.kind === "measurement");
    expect(meter?.reading).toEqual({
      mode: "authored",
      value: { kind: "known", value: -3.27, unit: "V" },
    });
    const result = renderGradualFigure(signed);
    expect(result.ok && result.svg).toContain("-3.27 V");
  });

  test("signals preserve both samples and changes, numbers and authored acceptance", () => {
    const a = adapt({
      kind: "signal",
      caption: "Both",
      signal: {
        samples: ["HIGH", "LOW"],
        changes: [100, 104, 109],
        settles: "LOW",
        end: 150,
        unit: "ms",
        window: { from: 109, length: 30 },
        accept: 139,
        sampleLabels: false,
        markEdges: "both",
      },
    });
    const signals = a.model.panels.filter((p) => p.kind === "signal");
    expect(signals).toHaveLength(2);
    expect(signals[0]?.data.mode).toBe("samples");
    const changes = signals[1];
    if (!changes) throw new Error("changes");
    expect(changes.data.mode).toBe("transitions");
    expect(changes.debounce).toEqual({ duration: 30, initial: "HIGH" });
    const e = signalEvents(changes);
    expect(debounceEvents(e.initial, e.events, e.start, e.end, 30, "HIGH")).toEqual([
      { at: 139, level: "LOW" },
    ]);
    expect(renderGradualHost(a.host)).toContain("139 ms");
    expect(
      adaptGradualFigure({ kind: "signal", caption: "Bad", signal: { changes: [4, 3], end: 10 } })
        .ok,
    ).toBe(false);
  });

  test("timeline wrap uses exclusive modulus and keeps an authored interval", () => {
    const a = adapt({
      kind: "timeline",
      caption: "Wrap",
      timeline: {
        start: 4294967295,
        now: 2,
        max: 4294967295,
        unit: "ms",
        window: 30,
        showDifference: true,
        difference: "1 + 2 = 3 ms",
      },
    });
    expect(a.model.panels[0]).toMatchObject({
      kind: "timeline",
      modulus: 4294967296,
      wraps: 1,
      showElapsed: false,
    });
    const rendered = renderGradualFigure(a);
    expect(rendered.ok && rendered.svg).toContain("1 + 2 = 3 ms");
    expect(renderGradualHost(a.host)).not.toContain("1 + 2 = 3 ms");
    expect(a.host.additions?.some((p) => p.id.endsWith("/interval"))).toBe(true);
  });

  test("quantity, bars, scale, readings, breadboard, board and pinout stay typed", () => {
    const power = adapt({
      kind: "power",
      caption: "Power",
      power: { voltage: "5 V", current: "2 mA", power: "?", formula: "P = V² / R" },
    });
    expect(power.model.panels[0]?.kind).toBe("quantity");
    expect(JSON.stringify(power.model)).toContain('"value":0.002');
    expect(JSON.stringify(power.model)).not.toContain('"mode":"derived"');
    const bars = adapt({
      kind: "bars",
      caption: "Signed",
      bars: {
        unit: "mW",
        items: [
          { label: "Demand", value: -2, display: "−2 mW", role: "demand" },
          { label: "Rating", value: 4, display: "4 mW", role: "rating" },
        ],
        threshold: { value: 3, label: "Limit" },
      },
    });
    expect(bars.model.panels[0]).toMatchObject({ kind: "bars", min: -0.002, unit: "W" });
    expect(
      adaptGradualFigure({
        kind: "bars",
        caption: "zero",
        bars: { unit: "W", items: [{ label: "Zero", value: 0, display: "0 W" }] },
      }).ok,
    ).toBe(true);
    const board = adapt({ kind: "breadboard", caption: "Partial", boardRows: [4, 9, 14] });
    expect(board.model.panels[0]).toMatchObject({ kind: "breadboard", showGroups: true });
    const p = board.model.panels[0];
    if (p?.kind !== "breadboard") throw new Error("board");
    expect(p.contacts).toHaveLength(15);
    expect(p.groups.flatMap((g) => g.contacts)).toHaveLength(15);
    expect(p.contacts.some((c) => c.id === "contact-a-9")).toBe(true);
    const pinout = adapt({
      kind: "board",
      caption: "Board",
      board: {
        bridge: "CH9102X",
        unknown: ["mcu"],
        pins: [{ name: "GPIO4", role: "gpio", highlight: true }],
      },
    });
    expect(pinout.model.panels.map((p) => p.kind)).toEqual(["board", "pinout"]);
  });
});

describe("current core integration", () => {
  test("host status follows sanitized caption and functions, not the family catalog", () => {
    const bare = adapt({ kind: "loop", caption: "", supply: "Battery", upper: "R" });
    const captioned = adapt({
      kind: "loop",
      caption: "Visible caption",
      supply: "Battery",
      upper: "R",
    });
    const stripped = adapt({
      kind: "loop",
      caption: "<script>PRIVATE</script>",
      supply: "Battery",
      upper: "R",
    });
    expect(hostStatus(bare.host)).toBe("native-verified");
    expect(hostReasons(captioned.host)).toEqual(["caption"]);
    expect(hostStatus(captioned.host)).toBe("host-composition-verified");
    expect(hostStatus(stripped.host)).toBe("native-verified");
    expect(hostReasons(adapt(null).host)).toEqual(["explicit-no-figure"]);
    expect(
      hostReasons(
        adapt({
          kind: "record",
          caption: "",
          record: { fields: [{ label: "Test", missing: true }] },
        }).host,
      ),
    ).toEqual(["record-table"]);
    expect(hostReasons(adapt({ ...base, caption: "", current: "I" }).host)).toContain(
      "public-adjunct-geometry",
    );
  });

  test("empty selected stages pass core validation and remain null in host responses", () => {
    const p = pair(null, base);
    expect(validateAuthorFigure(p.author).ok).toBe(true);
    const core = projectFigure(p.author, "question");
    expect(core.ok).toBe(true);
    if (!core.ok) throw new Error("empty core projection");
    expect(core.document.display).toEqual([]);
    const rendered = renderEducationalSVG(core.document);
    expect(rendered.ok && rendered.svg).toBe("");
    expect(publicOutput(p).document).toBeNull();
    const bad = structuredClone(p);
    bad.author.stages.question.expose.push({ id: "missing", label: "Invalid", role: "label" });
    expect(projectGradualPair(bad, "question").ok).toBe(false);
  });

  test("current operator outlines and measured reading columns handle adapter labels natively", () => {
    const a = adapt({
      kind: "readings",
      caption: "",
      readings: {
        items: [
          {
            label: "Long authored instrument label requiring a measured value column",
            value: "≥ ≤ ≠ ← ↑ ↓ ↔ Δ →",
          },
        ],
      },
    });
    const result = renderGradualFigure(a);
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error("native readings");
    expect(result.svg).toContain("≥ ≤ ≠ ← ↑ ↓ ↔ Δ →");
    expect(result.html).toBe("");
    const shapes = result.document?.display[0]?.shapes;
    const value = shapes?.[1];
    expect(value?.kind === "math" && value.at.x).toBeGreaterThan(400);
    const timeline = adapt({
      kind: "timeline",
      caption: "",
      timeline: {
        start: 100,
        now: 131,
        unit: "ms",
        showDifference: true,
        difference: "131 − 100 = 31 ms ≥ 30 ms",
      },
    });
    const native = renderGradualFigure(timeline);
    expect(native.ok && native.svg).toContain("31 ms ≥ 30 ms");
    expect(renderGradualHost(timeline.host)).not.toContain("31 ms");
  });

  test("full author identity is enforced separately from selected-stage projection", () => {
    const p = pair(base, {
      kind: "levels",
      caption: "Extra",
      levels: { low: 0.8, high: 2, max: 3.3 },
    });
    expect(validateAuthorFigure(p.author).ok).toBe(true);
    const baseline = publicOutput(p);
    const changed = structuredClone(p);
    const extra = changed.author.stages.correction.panels.find((panel) => panel.kind === "levels");
    if (!extra) throw new Error("extra panel");
    extra.id = "figure";
    changed.author.stages.correction.panels = [extra];
    expect(validateAuthorFigure(changed.author).ok).toBe(false);
    expect(publicOutput(changed)).toEqual(baseline);
    expect(verifySelectedIsolation(p)).toBe(5);
  });

  test("only selected host data is read and selected malformed data still fails closed", () => {
    const p = pair(base, base);
    const baseline = publicOutput(p);
    let accessed = 0;
    Object.defineProperty(p.host, "correction", {
      get() {
        accessed++;
        throw new Error("PRIVATE getter");
      },
    });
    Object.defineProperty(p.host, "teaching", {
      get() {
        accessed++;
        throw new Error("PRIVATE getter");
      },
    });
    Object.assign(p.author.stages, { teaching: { PRIVATE: "malformed" }, correction: null });
    expect(publicOutput(p)).toEqual(baseline);
    expect(accessed).toBe(0);
    const selected = projectGradualPair(p, "question");
    expect(Object.keys(selected).sort()).toEqual(["diagnostics", "document", "host", "ok"]);
    expect(JSON.stringify(selected)).not.toContain("PRIVATE");
    Object.assign(p.host, { question: { PRIVATE: "malformed selected" } });
    expect(projectGradualPair(p, "question")).toEqual({
      ok: false,
      diagnostics: [
        { code: "educational.invalid", message: "Invalid or unsupported educational figure." },
      ],
    });
  });
});

describe("privacy, composition, text and identity", () => {
  test("correction secrets cannot influence question JSON, SVG, host HTML or diagnostics", () => {
    const q = { ...base, probes: ["A", "C"] };
    const corrections = [
      { ...base, supply: "PRIVATE_PACK", upper: "876543 Ω", caption: "PRIVATE_CORRECTION" },
      {
        kind: "record",
        caption: "PRIVATE_RECORD",
        record: { fields: [{ label: "Secret", value: "876543" }], verdict: "PRIVATE_VERDICT" },
      },
      {
        kind: "board",
        caption: "PRIVATE_BOARD",
        board: {
          mcu: "PRIVATE_MCU",
          bridge: "PRIVATE_BRIDGE",
          pins: [{ name: "PRIVATE_PIN", role: "gpio" }],
        },
      },
      {
        kind: "potentials",
        caption: "PRIVATE_POTENTIAL",
        potentials: ["−11 V", "3 V", "0 V"],
        probes: ["B", "A"],
      },
    ];
    const baseline = publicOutput(pair(q));
    for (const correction of corrections)
      expect(publicOutput(pair(q, correction))).toEqual(baseline);
    expect(JSON.stringify(baseline)).not.toContain("PRIVATE");
  });

  test("mutating returned correction models and host content cannot mutate the question", () => {
    const inputs = [
      pair(
        { ...base, current: "I", highlightNodes: true },
        { kind: "levels", caption: "Extra", levels: { low: 0.8, high: 2, max: 3.3 } },
      ),
      pair(
        {
          kind: "record",
          caption: "Given",
          record: {
            fields: [
              { label: "Setup", value: "Given setup" },
              { label: "Observation", value: "Given observation" },
            ],
          },
        },
        {
          kind: "record",
          caption: "Extra",
          record: { fields: [{ label: "Setup", value: "Corrected setup" }] },
        },
      ),
    ];
    for (const p of inputs) {
      const before = publicOutput(p);
      const correction = p.author.stages.correction;
      const circuit = correction.panels.find((panel) => panel.kind === "electrical");
      if (circuit?.components[0]) circuit.components[0].label = gradualText("PRIVATE_MODEL_CHANGE");
      for (const note of p.host.correction.notes) note.value = gradualText("PRIVATE_HOST_CHANGE");
      for (const row of p.host.correction.record ?? [])
        row.value = gradualText("PRIVATE_ROW_CHANGE");
      for (const part of p.host.correction.additions ?? [])
        for (const shape of part.shapes)
          if (shape.kind === "line" && shape.points[0]) shape.points[0].x += 1;
      p.host.correction.caption = gradualText("PRIVATE_CAPTION_CHANGE");
      expect(publicOutput(p)).toEqual(before);
      expect(JSON.stringify(publicOutput(p))).not.toContain("PRIVATE");
    }
  });

  test("question policies remove hidden fields before projection, retain authored visible hints", () => {
    const board = {
      kind: "board",
      caption: "Given",
      board: { unknown: ["mcu", "bridge"], mcu: "PRIVATE_MCU", bridge: "PRIVATE_BRIDGE" },
    };
    expect(JSON.stringify(adapt(board, "question"))).not.toContain("PRIVATE");
    const r = {
      kind: "readings",
      caption: "Given",
      readings: {
        items: [{ label: "Meter", value: "3.2", unit: "V", mode: "DC V" }],
        difference: "PRIVATE_DIFFERENCE",
        quantity: "Visible hint",
      },
    };
    const readings = adapt(r, "question");
    expect(JSON.stringify(readings)).not.toContain("PRIVATE_DIFFERENCE");
    expect(JSON.stringify(readings)).toContain("Visible hint");
    const levels = adapt(
      {
        kind: "levels",
        caption: "Given",
        levels: { low: 0.8, high: 2, max: 3.3, value: 1.4, showResult: true },
      },
      "question",
    );
    expect(levels.model.panels[0]).toMatchObject({
      showClassification: false,
      value: { value: 1.4 },
    });
    const timeline = adapt(
      {
        kind: "timeline",
        caption: "Given",
        timeline: {
          start: 100,
          now: 124,
          unit: "ms",
          showDifference: true,
          difference: "PRIVATE_TIME",
        },
      },
      "question",
    );
    expect(JSON.stringify(timeline)).not.toContain("PRIVATE_TIME");
    expect(timeline.model.panels[0]).toMatchObject({ showElapsed: false });
    const power = adapt(
      { kind: "power", caption: "Given", power: { formula: "P = V · I" } },
      "question",
    );
    expect(JSON.stringify(power)).toContain("P = V · I");
    const noFormula = adapt({ kind: "power", caption: "Given", power: {} });
    expect(JSON.stringify(noFormula)).not.toContain("P = V");
  });

  test("reverse-scale question exposes only the given label and geometric marker", () => {
    const input = {
      kind: "scale",
      caption: "Read the other ruler",
      scale: {
        base: "A",
        prefixed: "mA",
        factor: 1000,
        from: "prefixed",
        ticks: [0, 0.01, 0.02, 0.03, 0.04],
        value: 35,
        showResult: true,
      },
    };
    const a = adapt(input, "question");
    const s = a.model.panels.find((p) => p.kind === "scale");
    expect(s?.value).toBeUndefined();
    expect(s?.showConverted).toBe(false);
    const r = renderGradualFigure(a);
    expect(r.ok && r.svg).toContain("35 mA");
    expect(r.ok && r.svg).not.toContain("0.035 A");
    expect(JSON.stringify(a)).not.toContain("0.035");
    expect(s?.input).toEqual({ from: "prefixed", magnitude: 35 });
    expect(a.host.additions).toBeUndefined();
    expect(a.model.panels).toHaveLength(1);
    const correction = renderGradualFigure(adapt(input, "correction"));
    expect(correction.ok && correction.svg).toContain("0.035 A");
    expect(correction.ok && correction.svg).toContain("35 mA");
  });

  test("correction augments the base, changed kinds use new identities", () => {
    const p = pair(base, { ...base, load: "New branch", current: "2 mA", probes: ["B", "C"] });
    const q = p.author.stages.question.panels[0];
    const c = p.author.stages.correction.panels[0];
    expect(q?.id).toBe(c?.id);
    if (q?.kind !== "electrical" || c?.kind !== "electrical") throw new Error("electrical");
    for (const item of q.terminals)
      expect(c.terminals.find((t) => t.id === item.id)?.at).toEqual(item.at);
    for (const item of q.components)
      expect(c.components.find((t) => t.id === item.id)).toEqual(item);
    const mixed = pair(base, {
      kind: "levels",
      caption: "Correction",
      levels: { low: 0.8, high: 2, max: 3.3 },
    });
    expect(mixed.author.stages.correction.panels.map((p) => p.kind)).toEqual([
      "electrical",
      "levels",
    ]);
    expect(new Set(mixed.author.stages.correction.panels.map((p) => p.id)).size).toBe(2);
    expect(projectFigure(mixed.author, "correction").ok).toBe(true);
  });

  test("null question remains null when correction has an image or table", () => {
    for (const correction of [
      base,
      {
        kind: "record",
        caption: "Record",
        record: { fields: [{ label: "Finding", value: "Only correction" }] },
      },
    ]) {
      const p = pair(null, correction);
      const q = publicOutput(p);
      expect(q.document).toBeNull();
      expect(q.svg).toBeNull();
      expect(q.html).toBe("");
      expect(q.host.kind).toBe("no-figure");
      expect(publicOutput(p, "correction").html).not.toBe("");
    }
  });

  test("safe host records preserve complete values, missing flags and verdicts", () => {
    const value =
      "A complete observation that is deliberately longer than the original renderer fifty-two-character clipping threshold.";
    const a = adapt({
      kind: "record",
      caption: "Record",
      record: {
        fields: [
          { label: "Observation", value, flagged: true },
          { label: "Probe", value: "PRIVATE_MISSING", missing: true },
        ],
        verdict: "Repeat <script>alert(1)</script> safely",
      },
    });
    const html = renderGradualHost(a.host);
    expect(html).toContain(value);
    expect(html).toContain('data-flagged="true"');
    expect(html).toContain('data-missing="true"');
    expect(html).not.toContain("PRIVATE_MISSING");
    expect(html).not.toContain("<script");
    expect(html).not.toContain("alert(1)");
    expect(a.model.panels).toEqual([]);
  });

  test("LaTeX and Unicode subscripts become safe runs, arbitrary markup is never executed", () => {
    expect(gradualText("R₁")).toEqual([
      { text: "R", script: "base" },
      { text: "1", script: "sub" },
    ]);
    expect(gradualText("$R_1 = 2\\,\\mathrm{k}\\Omega$")).toEqual([
      { text: "R", script: "base" },
      { text: "1", script: "sub" },
      { text: " = 2 kΩ", script: "base" },
    ]);
    const a = adapt({
      kind: "record",
      caption: "<img src=x onerror=alert(1)>$V^2$ <b>safe</b> \\href{javascript:evil}{click}",
      record: { fields: [{ label: "<img src=x>Read", value: "x < 3 and y > 1 & stable" }] },
    });
    const html = renderGradualHost(a.host);
    expect(html).toContain("<sup>2</sup>");
    expect(html).toContain("x &lt; 3 and y &gt; 1 &amp; stable");
    expect(html).not.toContain("onerror");
    expect(html).not.toContain("javascript:");
    expect(html).not.toContain("<img");
    expect(gradualText("2 AA pack")).toEqual([{ text: "2 AA pack", script: "base" }]);
  });

  test("IDs are deterministic, bounded, separate from old Tutor DOM strings", () => {
    for (const id of ["safe-id", "academy:hw.board:practice:hw.board.1", "x".repeat(48)]) {
      const a = adaptGradualFigure(base, { id });
      const b = adaptGradualFigure(structuredClone(base), { id });
      expect(a).toEqual(b);
      expect(a.ok).toBe(true);
      expect(gradualId(id)).toMatch(/^[A-Za-z][A-Za-z0-9_-]{0,47}$/);
    }
    expect(gradualTutorTarget("lesson-figure-node-a")).toBe("figure/terminal/A");
    expect(gradualTutorTarget("lesson-figure-red-probe")).toBe("figure-meter/probe/positive");
    expect(gradualTutorTarget("lesson-figure-private-net")).toBeUndefined();
    expect(JSON.stringify(adapt(base))).not.toContain("lesson-figure");
  });

  test("invalid/hostile inputs return fixed failures without touching getters", () => {
    let called = 0;
    const getter = Object.defineProperty({}, "kind", {
      enumerable: true,
      get() {
        called++;
        return "loop";
      },
    });
    const cyclic: Record<string, unknown> = { kind: "loop", caption: "Bad" };
    cyclic.self = cyclic;
    for (const input of [
      false,
      1,
      "loop",
      [],
      {},
      { kind: "future", caption: "Bad" },
      { ...base, invented: true },
      { ...base, signal: { samples: ["HIGH"] } },
      { kind: "levels", caption: "Bad", levels: { low: 2, high: 1, max: 3 } },
      { kind: "readings", caption: "Bad", readings: { items: [] } },
      getter,
      cyclic,
      { ...base, supply: "x".repeat(1001) },
      { ...base, upper: Number.NaN },
    ]) {
      const result = adaptGradualFigure(input);
      expect(result).toEqual({
        ok: false,
        diagnostics: [
          { code: "educational.invalid", message: "Invalid or unsupported educational figure." },
        ],
      });
    }
    expect(called).toBe(0);
    expect(adaptGradualFigure(base, { stage: "private" as Stage }).ok).toBe(false);
    expect(
      adaptGradualPair(
        Object.defineProperty({ id: "pair", question: null }, "correction", {
          get() {
            called++;
            return base;
          },
        }),
      ).ok,
    ).toBe(false);
    expect(called).toBe(0);
  });
});
