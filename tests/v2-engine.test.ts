import { describe, expect, test } from "bun:test";
import { Resvg } from "@resvg/resvg-js";
import { analyzeElectrical } from "../src/v2/electrical.ts";
import { dividerPanel, educationFixtures, privacyFixture } from "../src/v2/fixtures.ts";
import {
  type AuthorFigure,
  authored,
  authorFigure,
  debounceEvents,
  defineAuthorFigure,
  electricalPanel,
  inspectEducational,
  known,
  label,
  line,
  math,
  type Panel,
  type PublicFigure,
  part,
  placePanel,
  point,
  projectFigure,
  type Result,
  renderEducationalSVG,
  resolveReading,
  type Stage,
  signalEvents,
  stageModel,
  symbolic,
  targetDOMId,
  unknown,
  validateAuthorFigure,
  validateEducational,
} from "../src/v2/index.ts";

function success<T>(result: Result<T>): T & { ok: true; diagnostics: [] } {
  expect(result.ok, JSON.stringify(result.diagnostics)).toBe(true);
  if (!result.ok) throw new Error(JSON.stringify(result.diagnostics));
  return result;
}
function doc(author = privacyFixture(), stage: Stage = "question") {
  return success(projectFigure(author, stage)).document;
}
function single(panel: Panel): AuthorFigure {
  const model = stageModel([panel]);
  return authorFigure("custom", { teaching: model, question: model, correction: model });
}
function freeze(value: unknown) {
  if (!value || typeof value !== "object" || Object.isFrozen(value)) return;
  for (const item of Object.values(value)) freeze(item);
  Object.freeze(value);
}
const stages = ["teaching", "question", "correction"] as const;
const themes = ["geist-light", "geist-dark", "geist-print"] as const;

for (const [name, fixture] of Object.entries(educationFixtures())) {
  describe(`v2 fixture ${name}`, () => {
    test("author validation and every stage/theme render, immutable and deterministic", () => {
      success(validateAuthorFigure(fixture));
      const initial = structuredClone(fixture);
      freeze(fixture);
      for (const stage of stages) {
        const projection = doc(fixture, stage);
        for (const theme of themes) {
          const publicDocument = { ...projection, theme };
          freeze(publicDocument);
          const rendered = success(renderEducationalSVG(publicDocument));
          expect(success(renderEducationalSVG(publicDocument)).svg).toBe(rendered.svg);
          expect(success(inspectEducational(publicDocument)).bounds).toEqual(rendered.bounds);
          expect(success(validateEducational(publicDocument)).document).toEqual(publicDocument);
          expect(rendered.svg).not.toMatch(
            /<(?:text|script|style|foreignObject|image|filter)\b|url\(|href=|font-family|NaN|Infinity/,
          );
          expect(rendered.bounds.width).toBeGreaterThan(0);
          expect(rendered.bounds.height).toBeGreaterThan(0);
          expect(rendered.diagnostics).toEqual([]);
        }
      }
      expect(fixture).toEqual(initial);
    });
    test("native SVG rasterizes without external fonts", () => {
      for (const theme of themes) {
        const rendered = success(renderEducationalSVG({ ...doc(fixture, "teaching"), theme }));
        const image = new Resvg(rendered.svg, {
          font: { loadSystemFonts: false },
          fitTo: { mode: "width", value: 800 },
        }).render();
        expect(image.width).toBe(800);
        expect(image.height).toBeGreaterThan(0);
        expect(image.asPng().subarray(0, 8)).toEqual(
          Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
        );
      }
    });
  });
}

describe("v2 projection privacy and public targets", () => {
  test("unselected numeric, symbolic, text, and topology changes do not alter any question output", () => {
    const first = privacyFixture();
    const second = privacyFixture();
    for (const stage of ["teaching", "correction"] as const) {
      const model = second.stages[stage];
      model.title = "PRIVATE_TITLE_93421";
      model.description = "PRIVATE_DESCRIPTION_73419";
      const circuit = model.panels[0];
      if (circuit?.kind !== "electrical") throw new Error("fixture");
      for (const terminal of circuit.terminals) terminal.potential = known(937123, "V");
      const resistor = circuit.components.find((c) => c.id === "R1");
      if (resistor && resistor.kind === "resistor")
        resistor.value = symbolic(math("PRIVATE_SYMBOL_731"), "Ω");
      circuit.routes.push({
        id: "privateJumper",
        from: "ra",
        to: "rb",
        via: [point(300, 0), point(300, 80)],
        state: "connected",
        intent: "intentional-fault",
        bypass: "R1",
      });
    }
    const a = doc(first);
    const b = doc(second);
    expect(b).toEqual(a);
    expect(renderEducationalSVG(b)).toEqual(renderEducationalSVG(a));
    expect(inspectEducational(b)).toEqual(inspectEducational(a));
    expect(validateEducational(b)).toEqual(validateEducational(a));
    const json = JSON.stringify(success(renderEducationalSVG(b)));
    expect(json).not.toMatch(
      /PRIVATE_|937123|potential|terminals|components|assumptions|teaching|correction|net|stages/,
    );
    expect(json).not.toContain("-12 V");
    expect(success(renderEducationalSVG(doc(first, "correction"))).svg).toContain("-12 V");
  });
  test("a stage flag or author cast is not a public projection", () => {
    for (const api of [renderEducationalSVG, validateEducational, inspectEducational]) {
      expect(api(privacyFixture()).ok).toBe(false);
      expect(api({ ...privacyFixture(), stage: "question" }).ok).toBe(false);
      expect(api({ ...privacyFixture(), schema: "circuitkit.educational.public.v2" }).ok).toBe(
        false,
      );
    }
  });
  test("errors never retain private keys, values, paths, or partial documents", () => {
    const author = privacyFixture();
    Object.assign(author.stages.question, { SECRET_FIELD_192: "SECRET_VALUE_774" });
    const result = projectFigure(author, "question");
    expect(result).toEqual({
      ok: false,
      diagnostics: [
        { code: "educational.invalid", message: "Invalid or unsupported educational figure." },
      ],
    });
    expect(JSON.stringify(result)).not.toMatch(/SECRET|document|svg|path/);
    expect(projectFigure(privacyFixture(), "secret-stage" as Stage)).toEqual(result);
  });
  test("manifest permits only requested existing parts, never implicit net groups", () => {
    const document = doc();
    const rendered = success(renderEducationalSVG(document, { namespace: "question1" }));
    const inspected = success(inspectEducational(document));
    expect(inspected.targets.map((t) => t.id)).toEqual(document.targets.map((t) => t.id));
    expect(rendered.svg.match(/data-target=/g)).toHaveLength(document.targets.length);
    for (const target of rendered.targets) {
      expect(document.display.some((p) => p.id === target.id)).toBe(true);
      expect(rendered.svg).toContain(`id="${targetDOMId("question1", target.id)}"`);
      expect(target.bounds.width).toBeGreaterThan(0);
    }
    expect(rendered.svg).not.toContain("data-node");
    expect(rendered.svg).not.toContain("data-net");
    expect(inspected).not.toHaveProperty("groups");
    const empty = structuredClone(document);
    empty.targets = [];
    expect(success(renderEducationalSVG(empty)).svg).not.toContain("data-target=");
    const author = privacyFixture();
    author.stages.question.expose.push({
      id: "circuit/net/answer",
      label: "Hidden grouping",
      role: "route",
    });
    expect(projectFigure(author, "question").ok).toBe(false);
  });
  test("namespace changes DOM identity only", () => {
    const document = doc();
    const a = success(renderEducationalSVG(document, { namespace: "one" }));
    const b = success(renderEducationalSVG(document, { namespace: "two" }));
    expect(a.document).toEqual(b.document);
    expect(a.targets).toEqual(b.targets);
    expect(a.bounds).toEqual(b.bounds);
    expect(a.svg.replaceAll("edu-one-", "edu-two-")).toBe(b.svg);
    expect(targetDOMId("one", "a/b")).not.toBe(targetDOMId("one", "a-b"));
  });
  test("correction retains base geometry and adds parts", () => {
    const author = privacyFixture();
    const question = doc(author);
    const correction = doc(author, "correction");
    for (const p of question.display.filter((p) => p.id !== "meter/reading"))
      expect(correction.display.find((c) => c.id === p.id)).toEqual(p);
    expect(correction.display.length).toBeGreaterThan(question.display.length);
    expect(correction.targets).toEqual(question.targets);
    const conflict = privacyFixture();
    conflict.stages.correction.panels = [
      {
        kind: "readings",
        id: "circuit",
        at: point(0, 0),
        items: [{ id: "a", label: math("Answer"), reading: authored(known(2, "V")) }],
      },
    ];
    expect(validateAuthorFigure(conflict).ok).toBe(false);
    expect(projectFigure(conflict, "correction").ok).toBe(false);
    const changed = privacyFixture();
    const c = changed.stages.correction.panels[0];
    if (c?.kind === "electrical" && c.components[1]?.kind === "resistor")
      c.components[1] = { ...c.components[1], kind: "capacitor", value: known(1e-6, "F") };
    expect(validateAuthorFigure(changed).ok).toBe(false);
  });
  test("projection and client results do not alias authored data", () => {
    const author = privacyFixture();
    const baseline = structuredClone(author);
    const document = doc(author);
    if (document.targets[0]) document.targets[0].label = "changed";
    const result = success(renderEducationalSVG(document));
    result.document.targets.length = 0;
    expect(document.targets.length).toBeGreaterThan(0);
    expect(author).toEqual(baseline);
    expect(defineAuthorFigure(author)).toEqual(author);
    expect(defineAuthorFigure(author)).not.toBe(author);
  });
});

describe("v2 electrical topology", () => {
  test("only explicit wires, shorts, and closed buttons union terminals", () => {
    const circuit = dividerPanel();
    expect(analyzeElectrical(circuit)).toEqual([
      ["ra", "vp"],
      ["rb", "rc"],
      ["rd", "vn"],
    ]);
    const before = structuredClone(circuit);
    const author = privacyFixture();
    success(projectFigure(author, "teaching"));
    expect(analyzeElectrical(circuit)).toEqual(analyzeElectrical(before));
    expect(circuit).toEqual(before);
    const components = educationFixtures().electrical?.stages.teaching.panels[0];
    if (components?.kind !== "electrical") throw new Error("fixture");
    expect(analyzeElectrical(components)).toHaveLength(12);
    const button = components.components.find((c) => c.kind === "button");
    if (button?.kind === "button") button.state = "closed";
    expect(analyzeElectrical(components)).toHaveLength(11);
  });
  test("crossing routes do not create hidden junctions", () => {
    const panel = electricalPanel(
      "cross",
      [
        { id: "a", at: point(0, 50), connection: "required" },
        { id: "b", at: point(100, 50), connection: "required" },
        { id: "c", at: point(50, 0), connection: "required" },
        { id: "d", at: point(50, 100), connection: "required" },
      ],
      [],
      [
        { id: "horizontal", from: "a", to: "b", via: [], state: "connected", intent: "normal" },
        { id: "vertical", from: "c", to: "d", via: [], state: "connected", intent: "normal" },
      ],
    );
    expect(analyzeElectrical(panel)).toEqual([
      ["a", "b"],
      ["c", "d"],
    ]);
    success(projectFigure(single(panel), "question"));
  });
  test("opens and intentional bypass are distinct from malformed graphs", () => {
    const fixtures = educationFixtures();
    for (const name of ["open", "bypass"]) success(validateAuthorFigure(fixtures[name]));
    const panel = dividerPanel();
    for (const t of panel.terminals) delete t.potential;
    panel.routes.push({
      id: "oops",
      from: "ra",
      to: "rb",
      via: [],
      state: "connected",
      intent: "normal",
    });
    expect(validateAuthorFigure(single(panel)).diagnostics[0]?.code).toBe(
      "graph.unintended-bypass",
    );
    const route = panel.routes[3];
    if (route) {
      route.intent = "intentional-fault";
      route.bypass = "R1";
    }
    success(validateAuthorFigure(single(panel)));
    if (route) route.bypass = "R2";
    expect(validateAuthorFigure(single(panel)).ok).toBe(false);
  });
  test("bad references, duplicates, zero passives, inconsistent potentials, and disconnected required terminals fail", () => {
    const mutations: ((p: ReturnType<typeof dividerPanel>) => void)[] = [
      (p) => {
        if (p.terminals[0]) p.terminals.push(structuredClone(p.terminals[0]));
      },
      (p) => {
        if (p.routes[0]) p.routes[0].to = "absent";
      },
      (p) => {
        if (p.components[1]?.kind === "resistor") p.components[1].value = known(0, "Ω");
      },
      (p) => {
        if (p.terminals[0]) p.terminals[0].potential = known(99, "V");
      },
      (p) => {
        p.routes.shift();
      },
      (p) => {
        if (p.routes[0]) p.routes[0].state = "open";
      },
      (p) => {
        if (p.components[0]?.kind === "source") p.components[0].state = "short";
      },
      (p) => {
        if (p.routes[0]) p.routes[0].via = [point(0, 0)];
      },
    ];
    for (const mutate of mutations) {
      const panel = dividerPanel();
      mutate(panel);
      expect(projectFigure(single(panel), "teaching").ok).toBe(false);
    }
  });
  test("arbitrary diagonal placements and bent routes compile without recipe branches", () => {
    const panel = dividerPanel();
    for (const terminal of panel.terminals)
      terminal.at = point(terminal.at.x + terminal.at.y / 2, terminal.at.y + terminal.at.x / 4);
    const moved = placePanel(panel, point(-300, 230));
    const result = success(renderEducationalSVG(doc(single(moved))));
    expect(result.bounds.x).toBeLessThan(0);
    expect(analyzeElectrical(moved)).toEqual(analyzeElectrical(panel));
  });
});

describe("v2 quantities and signal semantics", () => {
  test("signed potential differences, authored readings and exact assumptions", () => {
    expect(
      resolveReading({
        mode: "derived",
        operation: "voltage-difference",
        inputs: [known(0, "V"), known(3.3, "V")],
        assumptions: ["ideal-voltmeter", "common-reference"],
      }),
    ).toEqual(known(-3.3, "V"));
    expect(resolveReading(authored(unknown("V")))).toEqual(unknown("V"));
    expect(resolveReading(authored(symbolic(math("R"), "Ω")))).toEqual(symbolic(math("R"), "Ω"));
    expect(() =>
      resolveReading({
        mode: "derived",
        operation: "power",
        inputs: [known(-2, "V"), known(3, "A")],
        assumptions: [],
      }),
    ).toThrow();
    expect(() =>
      resolveReading({
        mode: "derived",
        operation: "power",
        inputs: [known(2, "V"), known(3, "V")],
        assumptions: ["passive-sign"],
      }),
    ).toThrow();
    expect(() =>
      resolveReading({
        mode: "derived",
        operation: "ohm-current",
        inputs: [known(2, "V"), known(0, "Ω")],
        assumptions: ["ohmic", "passive-sign"],
      }),
    ).toThrow();
    expect(() =>
      resolveReading({
        mode: "derived",
        operation: "power",
        inputs: [unknown("V"), known(3, "A")],
        assumptions: ["passive-sign"],
      }),
    ).toThrow();
    expect(() =>
      resolveReading({
        mode: "derived",
        operation: "power",
        inputs: [known(1e12, "V"), known(1e12, "A")],
        assumptions: ["passive-sign"],
      }),
    ).toThrow();
  });
  test("V I R P and divider formulas are supported, not circuit simulation", () => {
    for (const [operation, inputs, assumptions, expected] of [
      [
        "ohm-current",
        [known(-10, "V"), known(100, "Ω")],
        ["ohmic", "passive-sign"],
        known(-0.1, "A"),
      ],
      [
        "ohm-voltage",
        [known(0.1, "A"), known(100, "Ω")],
        ["ohmic", "passive-sign"],
        known(10, "V"),
      ],
      [
        "ohm-resistance",
        [known(10, "V"), known(0.1, "A")],
        ["ohmic", "passive-sign"],
        known(100, "Ω"),
      ],
      ["power", [known(-10, "V"), known(0.1, "A")], ["passive-sign"], known(-1, "W")],
      [
        "divider",
        [known(12, "V"), known(1000, "Ω"), known(1000, "Ω")],
        ["ohmic", "unloaded-divider"],
        known(6, "V"),
      ],
    ] as const)
      expect(
        resolveReading({
          mode: "derived",
          operation,
          inputs: [...inputs],
          assumptions: [...assumptions],
        }),
      ).toEqual(expected);
  });
  test("reversing ideal probes reverses sign but never connectivity", () => {
    const author = privacyFixture();
    const meter = author.stages.teaching.panels[1];
    if (meter?.kind !== "measurement") throw new Error("fixture");
    [meter.positive, meter.negative] = [meter.negative, meter.positive];
    const rendered = success(renderEducationalSVG(doc(author, "teaching")));
    expect(rendered.svg).toContain("12 V");
    expect(rendered.svg).not.toContain("-12 V");
    meter.reading = { mode: "authored", value: known(-0.007, "V", math("-0.007")) };
    expect(success(renderEducationalSVG(doc(author, "teaching"))).svg).toContain("-0.007 V");
    meter.positive.terminal = "missing";
    expect(projectFigure(author, "teaching").ok).toBe(false);
  });
  test("transitions alternate and debounce accepts only stable intervals", () => {
    expect(
      debounceEvents(
        "HIGH",
        [
          { at: 4, level: "LOW" },
          { at: 6, level: "HIGH" },
          { at: 8, level: "LOW" },
        ],
        0,
        40,
        10,
        "HIGH",
      ),
    ).toEqual([{ at: 18, level: "LOW" }]);
    expect(debounceEvents("LOW", [{ at: 2, level: "HIGH" }], 0, 9, 10, "LOW")).toEqual([]);
    expect(
      debounceEvents(
        "LOW",
        [
          { at: 2, level: "HIGH" },
          { at: 12, level: "LOW" },
        ],
        0,
        30,
        10,
        "LOW",
      ),
    ).toEqual([
      { at: 12, level: "HIGH" },
      { at: 22, level: "LOW" },
    ]);
    const panel = educationFixtures().samples?.stages.teaching.panels[0];
    if (panel?.kind !== "signal") throw new Error("fixture");
    expect(signalEvents(panel).events).toEqual([
      { at: 2, level: "HIGH" },
      { at: 6, level: "LOW" },
      { at: 8, level: "HIGH" },
    ]);
    panel.data = {
      mode: "transitions",
      start: 0,
      end: 10,
      initial: "LOW",
      changes: [
        { at: 2, level: "HIGH" },
        { at: 1, level: "LOW" },
      ],
    };
    expect(validateAuthorFigure(single(panel)).ok).toBe(false);
  });
  test("timeline wrap is explicit and logic undefined region is not guessed", () => {
    const fixtures = educationFixtures();
    expect(success(renderEducationalSVG(doc(fixtures.timeline))).svg).toContain("9 ms");
    expect(success(renderEducationalSVG(doc(fixtures.levels))).svg).toContain("Not guaranteed");
    const timeline = fixtures.timeline?.stages.question.panels[0];
    if (timeline?.kind !== "timeline") throw new Error("fixture");
    timeline.wraps = 0;
    expect(projectFigure(fixtures.timeline, "question").ok).toBe(false);
    const levels = fixtures.levels?.stages.question.panels[0];
    if (levels?.kind !== "levels") throw new Error("fixture");
    levels.value = unknown("V");
    expect(projectFigure(fixtures.levels, "question").ok).toBe(false);
    levels.showClassification = false;
    success(projectFigure(fixtures.levels, "question"));
  });
  test("breadboard groups partition contacts but stay out of unexposed questions", () => {
    const fixture = educationFixtures().breadboard;
    if (!fixture) throw new Error("fixture");
    const panel = fixture.stages.question.panels[0];
    if (panel?.kind !== "breadboard") throw new Error("fixture");
    panel.showGroups = false;
    const a = doc(fixture);
    panel.groups = [
      { id: "privateGroup1", contacts: ["a1", "a2"] },
      { id: "privateGroup2", contacts: ["b1", "b2"] },
    ];
    expect(doc(fixture)).toEqual(a);
    expect(JSON.stringify(a)).not.toContain("group");
    panel.groups[0]?.contacts.push("b1");
    expect(projectFigure(fixture, "question").ok).toBe(false);
  });
  test("primitive builders support bounded MathText scripts without HTML", () => {
    const document: PublicFigure = {
      schema: "circuitkit.educational.public.v2",
      id: "math",
      title: "Math",
      description: "",
      theme: "geist-light",
      display: [
        part("formula", [
          line([point(-10, 10), point(120, 10)]),
          label(point(0, 0), [
            { text: "V", script: "base" },
            { text: "out", script: "sub" },
            { text: "2", script: "sup" },
          ]),
        ]),
      ],
      targets: [{ id: "formula", label: "Formula", role: "label" }],
    };
    const result = success(renderEducationalSVG(document));
    expect(result.svg).toContain("Vout2");
    expect(result.svg).not.toContain("<text");
    expect(result.bounds.y).toBeLessThan(-10);
    expect(result.bounds.x).toBe(-13);
  });
});
