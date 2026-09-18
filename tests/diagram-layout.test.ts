import { expect, test } from "bun:test";
import cueva from "../examples/diagrams/cueva.json";
import {
  compileDiagram,
  type DiagramDocument,
  type DiagramView,
  renderDiagramSVG,
} from "../src/diagram/index.ts";
import { type Bounds, publicLayout } from "../src/v2/render.ts";
import type { Point, Shape } from "../src/v2/schema.ts";

const views: DiagramView[] = ["blocks", "wiring", "schematic"];
const overlaps = (a: Bounds, b: Bounds, epsilon = 0.05) =>
  a.x < b.x + b.width - epsilon &&
  a.x + a.width > b.x + epsilon &&
  a.y < b.y + b.height - epsilon &&
  a.y + a.height > b.y + epsilon;

function segmentEnters(a: Point, b: Point, box: Bounds): boolean {
  const inset = 1.1;
  if (a.y === b.y)
    return (
      a.y > box.y + inset &&
      a.y < box.y + box.height - inset &&
      Math.max(a.x, b.x) > box.x + inset &&
      Math.min(a.x, b.x) < box.x + box.width - inset
    );
  if (a.x === b.x)
    return (
      a.x > box.x + inset &&
      a.x < box.x + box.width - inset &&
      Math.max(a.y, b.y) > box.y + inset &&
      Math.min(a.y, b.y) < box.y + box.height - inset
    );
  let low = 0;
  let high = 1;
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  for (const [p, q] of [
    [-dx, a.x - box.x - inset],
    [dx, box.x + box.width - inset - a.x],
    [-dy, a.y - box.y - inset],
    [dy, box.y + box.height - inset - a.y],
  ] as const) {
    if (p === 0) {
      if (q <= 0) return false;
      continue;
    }
    if (p < 0) low = Math.max(low, q / p);
    else high = Math.min(high, q / p);
    if (low >= high) return false;
  }
  return low < high;
}

function checkGeometry(document: unknown, view: DiagramView) {
  const result = compileDiagram(document, { view });
  if (!result.ok) throw new Error(JSON.stringify(result));
  const layout = publicLayout(result.figure);
  const shapes = layout.parts.flatMap((entry) =>
    entry.part.shapes.map((shape, i) => ({
      shape,
      bounds: entry.geometry[i]?.bounds as Bounds,
      id: entry.part.id,
    })),
  );
  const labels = shapes.filter((item) => item.shape.kind === "math");
  const bodies = shapes.filter((item) => item.shape.kind === "rect");
  const lines = shapes.filter(
    (item): item is typeof item & { shape: Extract<Shape, { kind: "line" }> } =>
      item.shape.kind === "line",
  );
  for (let i = 0; i < labels.length; i++) {
    const a = labels[i];
    if (!a) continue;
    expect(a.shape.kind === "math" && a.shape.size >= 14).toBe(true);
    for (const b of labels.slice(i + 1)) {
      if (overlaps(a.bounds, b.bounds))
        throw new Error(`${view}: labels overlap: ${a.id}, ${b.id}`);
    }
    for (const body of bodies) {
      if (!overlaps(a.bounds, body.bounds)) continue;
      expect(a.bounds.x).toBeGreaterThan(body.bounds.x + 8);
      expect(a.bounds.y).toBeGreaterThan(body.bounds.y + 4);
      expect(a.bounds.x + a.bounds.width).toBeLessThan(body.bounds.x + body.bounds.width - 8);
      expect(a.bounds.y + a.bounds.height).toBeLessThan(body.bounds.y + body.bounds.height - 4);
    }
  }
  for (const route of lines) {
    for (let i = 1; i < route.shape.points.length; i++) {
      const a = route.shape.points[i - 1];
      const b = route.shape.points[i];
      if (!a || !b) continue;
      for (const body of bodies)
        if (route.id !== body.id && segmentEnters(a, b, body.bounds))
          throw new Error(`${view}: route ${route.id} enters body ${body.id}`);
      for (const label of labels)
        if (segmentEnters(a, b, label.bounds))
          throw new Error(`${view}: route ${route.id} enters label ${label.id}`);
    }
  }
  for (let i = 0; i < bodies.length; i++)
    for (const b of bodies.slice(i + 1))
      expect(overlaps(bodies[i]?.bounds as Bounds, b.bounds)).toBe(false);
  expect(layout.bounds.width).toBeLessThanOrEqual(10000);
  expect(layout.bounds.height).toBeLessThanOrEqual(10000);
  for (const target of layout.targets) {
    expect(target.bounds.x).toBeGreaterThanOrEqual(layout.bounds.x);
    expect(target.bounds.y).toBeGreaterThanOrEqual(layout.bounds.y);
    expect(target.bounds.x + target.bounds.width).toBeLessThanOrEqual(
      layout.bounds.x + layout.bounds.width,
    );
    expect(target.bounds.y + target.bounds.height).toBeLessThanOrEqual(
      layout.bounds.y + layout.bounds.height,
    );
  }
  return result;
}

function graph(seed: number): DiagramDocument {
  let state = seed;
  const random = (limit: number) => {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    return state % limit;
  };
  const count = 3 + random(7);
  const names = [
    "router",
    "display",
    "motor",
    "sensor",
    "keyboard",
    "recorder",
    "filter",
    "interface",
    "spare",
  ];
  const modules = Array.from({ length: count }, (_, i) => ({
    id: names[i] ?? `unit${i}`,
    label: `Subsystem ${i} ${"W".repeat(random(25))}`,
    ports: Array.from({ length: 2 + random(4) }, (_, j) => ({
      id: `P${j}`,
      label: `Channel ${j} ${"m".repeat(random(12))}`,
    })),
  }));
  const pins = modules.flatMap((module) => module.ports.map((port) => `${module.id}.${port.id}`));
  const connections: DiagramDocument["connections"] = [];
  const keys = new Set<string>();
  for (let i = 0; i < 30; i++) {
    const from = pins[random(pins.length)] as string;
    const to = pins[random(pins.length)] as string;
    const key = [from, to].sort().join("|");
    if (from === to || keys.has(key)) continue;
    keys.add(key);
    connections.push({
      from,
      to,
      kind: (["signal", "power", "ground", "audio"] as const)[random(4)],
      label: `Link ${i}`,
      bus: `Lane ${i % 3}`,
    });
  }
  return {
    schema: "circuitkit.diagram.v1",
    id: `network${seed}`,
    title: `Network ${seed}`,
    modules,
    connections,
  };
}

for (const seed of [1, 5, 17, 29, 101, 2026, 65535, 999999]) {
  test(`generated unrelated graph ${seed} has collision-free deterministic geometry in every view`, () => {
    const document = graph(seed);
    const results = views.map((view) => checkGeometry(document, view));
    const first = results[0];
    const wiring = results[1];
    if (!first || !wiring) throw new Error("Missing generated views");
    for (const result of results) expect(result.semantics).toEqual(first.semantics);
    expect(compileDiagram(document)).toEqual(wiring);
  });
}

test("maximum modules, ports, connections and wide labels fit renderer budgets in every view", () => {
  const modules = Array.from({ length: 16 }, (_, i) => ({
    id: `M${"W".repeat(45)}${String(i).padStart(2, "0")}`,
    label: "W".repeat(64),
    ports: Array.from({ length: 4 }, (_, j) => ({
      id: `P${"W".repeat(30)}${j}`,
      label: "M".repeat(32),
    })),
  }));
  const pins = modules.flatMap((module) => module.ports.map((port) => `${module.id}.${port.id}`));
  const document: DiagramDocument = {
    schema: "circuitkit.diagram.v1",
    id: "budget",
    title: "W".repeat(120),
    modules,
    connections: Array.from({ length: 32 }, (_, i) => ({
      from: pins[i * 2] as string,
      to: pins[i * 2 + 1] as string,
      kind: "ground",
      bus: "W".repeat(32),
      label: "M".repeat(48),
    })),
  };
  for (const view of views) {
    const result = checkGeometry(document, view);
    expect(result.semantics.nets).toHaveLength(32);
    const rendered = renderDiagramSVG(document, { view });
    if (!rendered.ok) throw new Error(JSON.stringify(rendered));
    expect(rendered.svg.length).toBeLessThan(8000000);
    expect(rendered.targets).toHaveLength(144);
  }
}, 30000);

test("a 16-pin cycle and fanout route around unique modules without repeated wiring panels", () => {
  const ports = Array.from({ length: 16 }, (_, i) => `P${i}`);
  const document: DiagramDocument = {
    schema: "circuitkit.diagram.v1",
    id: "cyclic",
    title: "Feedback patch panel",
    modules: [
      { id: "panel", label: "Feedback panel", ports },
      { id: "unused", ports: ["NC"] },
    ],
    connections: ports.map((port, i) => ({ from: `panel.${port}`, to: `panel.P${(i + 1) % 16}` })),
  };
  for (let i = 2; i < 15; i++)
    document.connections.push({ from: "panel.P0", to: `panel.P${i}`, kind: "audio" });
  for (const view of views) checkGeometry(document, view);
  const result = compileDiagram(document, { view: "wiring" });
  if (!result.ok) throw new Error(JSON.stringify(result));
  const connections = result.figure.display.filter((part) => /\/route\/[^/]+$/.test(part.id));
  expect(connections).toHaveLength(document.connections.length);
  expect(
    connections.every((part) => part.shapes.filter((shape) => shape.kind === "line").length === 1),
  ).toBe(true);
});

test("Cueva retains the approved connected visual grammar, never an inventory or repeated cards", () => {
  for (const view of views) {
    const result = checkGeometry(cueva, view);
    const components = result.figure.display.filter((part) => part.id.includes("/component/"));
    expect(components).toHaveLength(5);
    const strings = result.figure.display.flatMap((part) =>
      part.shapes.flatMap((shape) =>
        shape.kind === "math" ? shape.runs.map((run) => run.text) : [],
      ),
    );
    const componentStrings = components.flatMap((part) =>
      part.shapes.flatMap((shape) =>
        shape.kind === "math" ? shape.runs.map((run) => run.text) : [],
      ),
    );
    for (const module of cueva.modules)
      expect(componentStrings.filter((text) => text === (module.label ?? module.id))).toHaveLength(
        1,
      );
    expect(strings.join(" ")).not.toMatch(/Net schedule|Module relationships|repeated references/i);
    if (view === "blocks") {
      expect(strings).toContain("I2C");
      expect(strings).toContain("I2S");
      expect(strings).toContain("Audio");
      expect(strings.join(" ")).not.toContain("GPIO23");
    }
    if (view === "wiring") {
      const routes = result.figure.display.filter((part) => /\/route\/[^/]+$/.test(part.id));
      expect(routes).toHaveLength(12);
      expect(
        routes.every((part) =>
          part.shapes.some((shape) => shape.kind === "line" && shape.points.length === 2),
        ),
      ).toBe(true);
    }
    if (view === "schematic") {
      for (const value of ["U1", "U2", "DS1", "LS1", "J1", "GND", "3V3", "5V/VIN"])
        expect(strings).toContain(value);
      expect(
        result.figure.display
          .find((part) => part.id === "cueva/component/Speaker")
          ?.shapes.some((shape) => shape.kind === "polygon"),
      ).toBe(true);
    }
  }
});

test("multi-port connectors stay unique and expose all port labels across branches", () => {
  const document: DiagramDocument = {
    schema: "circuitkit.diagram.v1",
    id: "harness",
    title: "Branching connector",
    modules: [
      { id: "plug", kind: "connector", ports: ["input", "return"] },
      { id: "sensor", kind: "sensor", ports: ["IN", "GND"] },
      { id: "screen", kind: "display", ports: ["IN", "GND"] },
    ],
    connections: [
      { from: "plug.input", to: "sensor.IN" },
      { from: "plug.input", to: "screen.IN" },
      { from: "plug.return", to: "sensor.GND", kind: "ground" },
      { from: "plug.return", to: "screen.GND", kind: "ground" },
    ],
  };
  for (const view of views) checkGeometry(document, view);
});

test("data flow arrows never borrow the direction of a grouped power connection", () => {
  const document: DiagramDocument = {
    schema: "circuitkit.diagram.v1",
    id: "flows",
    title: "Flow is authored",
    modules: [
      { id: "a", ports: ["D", "P"] },
      { id: "b", ports: ["D", "P"] },
    ],
    connections: [
      { from: "a.D", to: "b.D", bus: "Data" },
      { from: "a.P", to: "b.P", kind: "power", direction: "forward" },
    ],
  };
  const without = checkGeometry(document, "blocks");
  const arrows = (figure: typeof without.figure) =>
    figure.display
      .filter((part) => part.id.includes("/route/"))
      .flatMap((part) => part.shapes.filter((shape) => shape.kind === "polygon"));
  expect(arrows(without.figure)).toHaveLength(0);
  const link = document.connections[0];
  if (!link) throw new Error("Missing fixture connection");
  link.direction = "both";
  const withFlow = checkGeometry(document, "blocks");
  expect(arrows(withFlow.figure)).toHaveLength(2);
  expect(withFlow.semantics).toEqual(without.semantics);
});

test("all-unconnected ports, modules without ports and duplicate labels remain distinguishable", () => {
  const document: DiagramDocument = {
    schema: "circuitkit.diagram.v1",
    id: "inventory",
    title: "Spare modules",
    modules: [
      {
        id: "a",
        label: "Module",
        ports: [
          { id: "L", label: "Channel" },
          { id: "R", label: "Channel" },
        ],
      },
      { id: "b", label: "Module", ports: [] },
    ],
    connections: [],
  };
  for (const view of views) {
    const result = checkGeometry(document, view);
    expect(result.semantics.nets.map((net) => net.pins)).toEqual([["a.L"], ["a.R"]]);
  }
});
