import { expect, test } from "bun:test";
import { Resvg } from "@resvg/resvg-js";
import { analyzeElectrical } from "../src/v2/electrical.ts";
import { educationFixtures, privacyFixture } from "../src/v2/fixtures.ts";
import {
  type AuthorFigure,
  authorFigure,
  type ElectricalPanel,
  electricalPanel,
  inspectEducational,
  known,
  math,
  netTargetId,
  type Panel,
  type Point,
  type PublicFigure,
  point,
  projectFigure,
  type Result,
  renderEducationalSVG,
  type Shape,
  type Stage,
  stageModel,
  validateAuthorFigure,
} from "../src/v2/index.ts";
import { mathGeometry } from "../src/v2/math-text.ts";

type Box = { x: number; y: number; width: number; height: number };
type Segment = { a: Point; b: Point; stroke: number };
function success<T>(result: Result<T>) {
  if (!result.ok) throw new Error(JSON.stringify(result.diagnostics));
  return result;
}
function project(author: AuthorFigure, stage: Stage = "teaching") {
  return success(projectFigure(author, stage)).document;
}
function single(panel: Panel) {
  const model = stageModel([panel]);
  return authorFigure("annotations", { teaching: model, question: model, correction: model });
}
function segments(shape: Shape): Segment[] {
  if (shape.kind === "math" || shape.kind === "circle") return [];
  const points =
    shape.kind === "rect"
      ? [
          shape.at,
          point(shape.at.x + shape.width, shape.at.y),
          point(shape.at.x + shape.width, shape.at.y + shape.height),
          point(shape.at.x, shape.at.y + shape.height),
          shape.at,
        ]
      : shape.kind === "polygon"
        ? [...shape.points, shape.points[0] ?? point(0, 0)]
        : shape.points;
  return points.slice(1).map((b, i) => ({
    a: points[i] ?? b,
    b,
    stroke: shape.kind === "rect" ? shape.stroke : shape.width,
  }));
}
function hit(segment: Segment, box: Box): boolean {
  const margin = segment.stroke / 2 + 0.5;
  const left = box.x - margin;
  const right = box.x + box.width + margin;
  const top = box.y - margin;
  const bottom = box.y + box.height + margin;
  const inside = (p: Point) => p.x >= left && p.x <= right && p.y >= top && p.y <= bottom;
  if (inside(segment.a) || inside(segment.b)) return true;
  const cross = (a: Point, b: Point, c: Point) =>
    (b.x - a.x) * (c.y - a.y) - (b.y - a.y) * (c.x - a.x);
  const corners = [point(left, top), point(right, top), point(right, bottom), point(left, bottom)];
  return corners.some((a, i) => {
    const b = corners[(i + 1) % corners.length] ?? a;
    const ab1 = cross(segment.a, segment.b, a);
    const ab2 = cross(segment.a, segment.b, b);
    const cd1 = cross(a, b, segment.a);
    const cd2 = cross(a, b, segment.b);
    return (
      ab1 * ab2 <= 0 &&
      cd1 * cd2 <= 0 &&
      Math.max(segment.a.x, segment.b.x) >= Math.min(a.x, b.x) &&
      Math.min(segment.a.x, segment.b.x) <= Math.max(a.x, b.x) &&
      Math.max(segment.a.y, segment.b.y) >= Math.min(a.y, b.y) &&
      Math.min(segment.a.y, segment.b.y) <= Math.max(a.y, b.y)
    );
  });
}
function overlaps(a: Box, b: Box) {
  return a.x < b.x + b.width && a.x + a.width > b.x && a.y < b.y + b.height && a.y + a.height > b.y;
}
function audit(document: PublicFigure, select: (id: string, index: number) => boolean) {
  const all = document.display.flatMap((part) =>
    part.shapes.map((shape, index) => ({ id: part.id, index, shape })),
  );
  const lines = all.flatMap((item) =>
    segments(item.shape).map((segment) => ({ id: item.id, segment })),
  );
  const letters = all.filter(
    (item): item is typeof item & { shape: Extract<Shape, { kind: "math" }> } =>
      item.shape.kind === "math",
  );
  const selected = letters.filter((item) => select(item.id, item.index));
  expect(selected.length).toBeGreaterThan(0);
  for (const item of selected) {
    const box = mathGeometry(item.shape).bounds;
    expect(
      lines
        .filter((line) => hit(line.segment, box))
        .map((line) => `${item.id}:${item.index} crosses ${line.id}`),
    ).toEqual([]);
    for (const other of letters) {
      if (other === item) continue;
      expect(
        overlaps(box, mathGeometry(other.shape).bounds),
        `${item.id}:${item.index} overlaps ${other.id}:${other.index}`,
      ).toBe(false);
    }
    for (const other of all) {
      if (other.shape.kind !== "circle") continue;
      const radius = other.shape.radius + other.shape.stroke / 2;
      expect(
        overlaps(box, {
          x: other.shape.at.x - radius,
          y: other.shape.at.y - radius,
          width: radius * 2,
          height: radius * 2,
        }),
        `${item.id} intersects circle in ${other.id}`,
      ).toBe(false);
    }
  }
}
const electricalAnnotation = (id: string) => /\/(label|value|terminal-label)\//.test(id);
const geometry = (document: PublicFigure) =>
  document.display.flatMap((part) => {
    const shapes = part.shapes.filter((shape) => shape.kind !== "math");
    return shapes.length ? [{ id: part.id, shapes }] : [];
  });
function withoutElectricalLabels(author: AuthorFigure): AuthorFigure {
  const clone = structuredClone(author);
  for (const model of Object.values(clone.stages)) {
    for (const panel of model.panels) {
      if (panel.kind !== "electrical") continue;
      for (const terminal of panel.terminals) {
        delete terminal.label;
        delete terminal.labelAt;
      }
      for (const component of panel.components) {
        delete component.label;
        delete component.labelAt;
        if (component.kind !== "button") {
          delete component.value;
          delete component.valueAt;
        }
      }
    }
    model.expose = model.expose.filter((target) => !electricalAnnotation(target.id));
  }
  return clone;
}

test("every electrical symbol keeps annotation ink off vertical, horizontal, reversed and diagonal geometry", () => {
  const kinds = ["source", "resistor", "capacitor", "led", "diode", "button"] as const;
  for (const [dx, dy] of [
    [0, 150],
    [150, 0],
    [100, 100],
    [-100, 100],
    [0, -150],
    [-150, 0],
  ] as const) {
    for (const kind of kinds) {
      const panel = electricalPanel(
        "oriented",
        [
          { id: "a", at: point(0, 0), connection: "free", label: math("A") },
          { id: "b", at: point(dx, dy), connection: "free", label: math("B") },
        ],
        [
          kind === "button"
            ? {
                id: "part",
                kind,
                terminals: ["a", "b"],
                state: "open",
                intent: "normal",
                label: math("Released"),
              }
            : {
                id: "part",
                kind,
                terminals: ["a", "b"],
                state: "normal",
                intent: "normal",
                label: math(kind),
                value: known(
                  kind === "resistor" ? 1000 : 3.3,
                  kind === "resistor" ? "Ω" : kind === "capacitor" ? "F" : "V",
                ),
              },
        ],
        [],
      );
      const author = single(panel);
      const document = project(author);
      audit(document, electricalAnnotation);
      expect(geometry(document)).toEqual(geometry(project(withoutElectricalLabels(author))));
      expect(project(author)).toEqual(document);
    }
  }
});

test("named-net divider and multimeter annotations avoid routes and actual probe rings in all themes", () => {
  const author = privacyFixture();
  for (const name of ["teaching", "correction"] as const) {
    const model = author.stages[name];
    const panel = model.panels[0];
    if (panel?.kind !== "electrical") throw new Error("fixture");
    panel.namedNets = [
      { id: "supply", terminal: "vp" },
      { id: "midpoint", terminal: "rb" },
      { id: "return", terminal: "vn" },
    ];
    model.expose.push(
      ...panel.namedNets.map((net) => ({
        id: netTargetId(panel.id, net.id),
        role: "net" as const,
        label: net.id,
      })),
    );
  }
  const original = structuredClone(author);
  for (const stage of ["teaching", "question", "correction"] as const) {
    const baseline = project(withoutElectricalLabels(author), stage);
    const document = project(author, stage);
    audit(document, electricalAnnotation);
    expect(geometry(document)).toEqual(geometry(baseline));
    expect(
      success(inspectEducational(document)).targets.filter((target) => target.role === "net"),
    ).toEqual(
      success(inspectEducational(baseline)).targets.filter((target) => target.role === "net"),
    );
    for (const theme of ["geist-light", "geist-dark", "geist-print"] as const) {
      const rendered = success(renderEducationalSVG({ ...document, theme }));
      expect(
        new Resvg(rendered.svg, {
          font: { loadSystemFonts: false },
          fitTo: { mode: "width", value: 900 },
        }).render().width,
      ).toBe(900);
      expect(success(renderEducationalSVG({ ...document, theme })).svg).toBe(rendered.svg);
      expect(rendered.svg).not.toMatch(/<mask|<clipPath|<style|<foreignObject/);
    }
  }
  expect(author).toEqual(original);
});

test("all geometry, including a later panel's probe wire, participates in candidate rejection", () => {
  const author = privacyFixture();
  const model = author.stages.teaching;
  const meter = model.panels[1];
  if (meter?.kind !== "measurement") throw new Error("fixture");
  meter.positive.via = [point(-220, -10), point(-120, -10), point(-120, 50), point(20, 50)];
  const before = structuredClone(author);
  const panel = model.panels[0];
  if (panel?.kind !== "electrical") throw new Error("fixture");
  const groups = analyzeElectrical(panel);
  const document = project(author);
  audit(document, electricalAnnotation);
  expect(geometry(document)).toEqual(geometry(project(withoutElectricalLabels(author))));
  expect(analyzeElectrical(panel)).toEqual(groups);
  expect(author).toEqual(before);
});

test("preferred-side search keeps adjacent vertical capacitor and LED labels with their own symbols", () => {
  const author = educationFixtures().electrical;
  if (!author) throw new Error("fixture");
  for (const model of Object.values(author.stages)) {
    const panel = model.panels[0];
    if (panel?.kind !== "electrical") throw new Error("fixture");
    panel.terminals.forEach((terminal, index) => {
      terminal.at = point(Math.floor(index / 2) * 130, index % 2 ? 150 : 0);
    });
  }
  const document = project(author);
  audit(document, electricalAnnotation);
  for (let index = 0; index < 6; index++) {
    const shape = document.display.find((part) => part.id === `symbols/label/part${index}`)
      ?.shapes[0];
    if (shape?.kind !== "math") throw new Error("label");
    const box = mathGeometry(shape).bounds;
    expect(box.x).toBeGreaterThan(index * 130);
    expect(box.x + box.width).toBeLessThan((index + 1) * 130 - 10);
  }
});

test("annotations cannot be hidden under later opaque rectangles, but may sit inside earlier board bodies", () => {
  const circuit = electricalPanel(
    "circuit",
    [
      { id: "a", at: point(0, 0), connection: "free" },
      { id: "b", at: point(120, 0), connection: "free" },
    ],
    [
      {
        id: "R",
        kind: "resistor",
        terminals: ["a", "b"],
        state: "normal",
        intent: "normal",
        label: math("R"),
        value: known(1000, "Ω"),
      },
    ],
    [],
  );
  const board: Panel = {
    id: "board",
    kind: "board",
    at: point(0, 15),
    width: 120,
    height: 100,
    pins: [],
    chips: [],
  };
  const model = stageModel([circuit, board]);
  const author = authorFigure("opaque", { teaching: model, question: model, correction: model });
  const document = project(author);
  audit(document, electricalAnnotation);
  for (const part of document.display.filter((part) => electricalAnnotation(part.id))) {
    const shape = part.shapes[0];
    if (shape?.kind !== "math") throw new Error("annotation");
    expect(overlaps(mathGeometry(shape).bounds, { x: 0, y: 15, width: 120, height: 100 })).toBe(
      false,
    );
  }
  const enclosure = { ...board, at: point(-20, -100), width: 180, height: 240 };
  const enclosedModel = stageModel([enclosure, circuit]);
  const enclosed = project(
    authorFigure("enclosed", {
      teaching: enclosedModel,
      question: enclosedModel,
      correction: enclosedModel,
    }),
  );
  const value = enclosed.display.find((part) => part.id === "circuit/value/R")?.shapes[0];
  if (value?.kind !== "math") throw new Error("value");
  expect(overlaps(mathGeometry(value).bounds, { x: -20, y: -100, width: 180, height: 240 })).toBe(
    true,
  );
  audit(enclosed, electricalAnnotation);
});

test("levels zone annotations avoid marker ink at zero, maximum, thresholds and the undefined region", () => {
  const source = educationFixtures().levels?.stages.teaching.panels[0];
  if (source?.kind !== "levels") throw new Error("fixture");
  for (const width of [200, 420]) {
    for (const voltage of [0, 0.8, 1.4, 2, 3.3]) {
      for (const classification of [false, true]) {
        const panel = {
          ...source,
          width,
          value: known(voltage, "V"),
          showClassification: classification,
          at: point(60, 40),
        };
        const document = project(single(panel));
        audit(document, (id) => id === "levels/axis" || id === "levels/value");
        const zones = document.display.find((part) => part.id === "levels/axis")?.shapes.slice(7);
        expect(zones?.length).toBe(3);
        const centers = [
          panel.low / 2,
          (panel.low + panel.high) / 2,
          (panel.high + panel.max) / 2,
        ].map((v) => panel.at.x + (v / panel.max) * width);
        (zones ?? []).forEach((zone, index) => {
          if (zone.kind !== "math") throw new Error("zone");
          const box = mathGeometry(zone).bounds;
          expect(box.x).toBeGreaterThanOrEqual(panel.at.x - 1e-8);
          expect(box.x + box.width).toBeLessThanOrEqual(panel.at.x + width + 1e-8);
          const center = Math.max(
            panel.at.x + box.width / 2,
            Math.min(panel.at.x + width - box.width / 2, centers[index] ?? 0),
          );
          expect(box.x + box.width / 2).toBeCloseTo(center, 8);
          expect(box.y + box.height).toBeLessThan(panel.at.y - 24);
        });
        for (const [i, first] of (zones ?? []).entries()) {
          if (first.kind !== "math") throw new Error("zone");
          const a = mathGeometry(first).bounds;
          for (const second of (zones ?? []).slice(i + 1)) {
            if (second.kind !== "math") throw new Error("zone");
            const b = mathGeometry(second).bounds;
            if (a.y < b.y + b.height && a.y + a.height > b.y)
              expect(Math.max(b.x - a.x - a.width, a.x - b.x - b.width)).toBeGreaterThanOrEqual(
                11.99999,
              );
          }
        }
        for (const shape of document.display.find((part) => part.id === "levels/value")?.shapes ??
          []) {
          if (shape.kind !== "math") continue;
          const box = mathGeometry(shape).bounds;
          const center = Math.max(
            panel.at.x + box.width / 2,
            Math.min(
              panel.at.x + width - box.width / 2,
              panel.at.x + (voltage / panel.max) * width,
            ),
          );
          expect(box.x + box.width / 2).toBeCloseTo(center, 8);
        }
        const marker = document.display
          .find((part) => part.id === "levels/value")
          ?.shapes.find((shape) => shape.kind === "line");
        if (marker?.kind !== "line") throw new Error("marker");
        expect(marker.points).toEqual([
          point(panel.at.x + (voltage / panel.max) * width, panel.at.y),
          point(panel.at.x + (voltage / panel.max) * width, panel.at.y + 64),
        ]);
      }
    }
  }
});

test("bounded manual label/value baselines remain exact and are reserved before automatic placement", () => {
  const author = privacyFixture();
  const panel = author.stages.teaching.panels[0];
  if (panel?.kind !== "electrical") throw new Error("fixture");
  const component = panel.components.find((c) => c.id === "R1");
  if (component?.kind !== "resistor") throw new Error("fixture");
  component.label = math("R1");
  component.labelAt = point(140, 35);
  component.valueAt = point(140, 55);
  const terminal = panel.terminals.find((t) => t.id === "rb");
  if (!terminal) throw new Error("fixture");
  terminal.labelAt = point(166, 102);
  panel.at = point(20, 10);
  const document = project(author);
  for (const [id, at] of [
    ["circuit/label/R1", point(160, 45)],
    ["circuit/value/R1", point(160, 65)],
    ["circuit/terminal-label/rb", point(186, 112)],
  ] as const) {
    const shape = document.display.find((p) => p.id === id)?.shapes[0];
    if (shape?.kind !== "math") throw new Error("annotation");
    expect(shape.at).toEqual(at);
  }
  expect(JSON.stringify(document)).not.toMatch(/labelAt|valueAt|directions|annotation-placement/);
  component.valueAt = point(180, 45);
  expect(validateAuthorFigure(author).diagnostics[0]?.code).toBe(
    "layout.annotation-override-collision",
  );
  expect(projectFigure(author, "teaching").ok).toBe(false);
  component.valueAt = point(10001, 10);
  expect(projectFigure(author, "teaching").ok).toBe(false);
});

test("an exhausted bounded search fails instead of drawing over a conductor, with an explicit override escape", () => {
  const terminals: ElectricalPanel["terminals"] = [
    { id: "origin", at: point(0, 0), connection: "free", label: math("A") },
  ];
  const routes: ElectricalPanel["routes"] = [];
  for (let i = 0; i <= 100; i++) {
    terminals.push(
      { id: `left${i}`, at: point(-2000, -800 + i * 16), connection: "required" },
      { id: `right${i}`, at: point(2000, -800 + i * 16), connection: "required" },
    );
    routes.push({
      id: `wire${i}`,
      from: `left${i}`,
      to: `right${i}`,
      via: [],
      state: "connected",
      intent: "normal",
    });
  }
  const panel = electricalPanel("crowded", terminals, [], routes);
  const author = single(panel);
  expect(analyzeElectrical(panel).length).toBe(102);
  expect(validateAuthorFigure(author).diagnostics[0]?.code).toBe("layout.annotation-placement");
  expect(projectFigure(author, "teaching")).toEqual({
    ok: false,
    diagnostics: [
      { code: "educational.invalid", message: "Invalid or unsupported educational figure." },
    ],
  });
  const terminal = panel.terminals[0];
  if (!terminal) throw new Error("fixture");
  terminal.labelAt = point(-2100, 900);
  const document = project(single(panel));
  audit(document, electricalAnnotation);
  expect(geometry(document)).toEqual(geometry(project(withoutElectricalLabels(single(panel)))));
});

test("annotation layout uses selected stage only and cannot expose private overrides or values", () => {
  const first = privacyFixture();
  const second = privacyFixture();
  for (const stage of ["teaching", "correction"] as const) {
    const panel = second.stages[stage].panels[0];
    if (panel?.kind !== "electrical") throw new Error("fixture");
    for (const component of panel.components) {
      component.label = math("PRIVATE_ANNOTATION_831");
      component.labelAt = point(9000, 9000);
      if (component.kind !== "button") {
        component.valueAt = point(-9000, -9000);
        component.value = known(1e13, "V");
      }
    }
  }
  expect(projectFigure(second, "question")).toEqual(projectFigure(first, "question"));
  expect(renderEducationalSVG(project(second, "question"))).toEqual(
    renderEducationalSVG(project(first, "question")),
  );
  expect(validateAuthorFigure(second).ok).toBe(false);
});
