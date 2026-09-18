import { expect, test } from "bun:test";
import { z } from "zod";
import {
  compileDiagram,
  type DiagramDocument,
  type DiagramOptions,
  type DiagramView,
  diagramJSONSchema,
  diagramSchema,
  isDiagramDocument,
  renderDiagramSVG,
  validateDiagram,
} from "../src/diagram/index.ts";
import { validateEducational } from "../src/v2/render.ts";

const views: DiagramView[] = ["blocks", "wiring", "schematic"];
const basic = (): DiagramDocument => ({
  schema: "circuitkit.diagram.v1",
  id: "sensor-link",
  title: "Telemetry link",
  modules: [
    { id: "sensor", label: "Optical sensor", ports: ["OUT", { id: "V+", label: "Supply" }, "GND"] },
    { id: "logger", ports: [{ id: "RX/TX", label: "Receive" }, "V−", "GND"] },
  ],
  connections: [
    { from: "sensor.OUT", to: "logger.RX/TX", bus: "telemetry", label: "Samples" },
    { from: "sensor.V+", to: "logger.V−", kind: "power" },
  ],
});

function compiled(input: unknown, options?: DiagramOptions) {
  const result = compileDiagram(input, options);
  if (!result.ok) throw new Error(JSON.stringify(result));
  return result;
}

function frozen<T>(value: T): T {
  if (value && typeof value === "object") {
    for (const child of Object.values(value)) frozen(child);
    Object.freeze(value);
  }
  return value;
}

function fails(input: unknown) {
  const result = validateDiagram(input);
  expect(result.ok).toBe(false);
  if (result.ok) throw new Error("Expected failure");
  expect(compileDiagram(input)).toEqual(result);
  expect(renderDiagramSVG(input)).toEqual(result);
  expect(diagramSchema.safeParse(input).success).toBe(false);
  expect(isDiagramDocument(input)).toBe(false);
  for (const diagnostic of result.diagnostics) {
    expect(diagnostic.code).toStartWith("diagram.");
    expect(typeof diagnostic.path).toBe("string");
    expect(diagnostic.message.length).toBeGreaterThan(0);
  }
  return result.diagnostics;
}

test("normalizes authored data without changing input, and accepts typed shorthand", () => {
  const input = frozen(basic());
  const result = compiled(input);
  expect(result.document.view).toBe("wiring");
  expect(result.document.theme).toBe("geist-light");
  expect(result.document.modules[1]?.label).toBe("logger");
  expect(result.document.modules[0]?.ports[0]).toEqual({ id: "OUT", label: "OUT" });
  expect(result.document.connections[0]?.kind).toBe("signal");
  expect(result.document).toEqual(diagramSchema.parse(input));
  expect(result.document).not.toBe(input);
  expect(input).toEqual(basic());
  expect(validateDiagram(result.document)).toEqual({
    ok: true,
    document: result.document,
    diagnostics: [],
  });
  expect(isDiagramDocument(result.document)).toBe(true);
  expect(result.classification).toEqual({
    kind: "module-diagram",
    view: "wiring",
    connectivity: "declared",
  });
  expect(result).not.toHaveProperty("verification");
  expect(result).not.toHaveProperty("certification");
});

test("view and theme overrides affect presentation, not the normalized authored document", () => {
  const input = frozen({ ...basic(), view: "blocks" as const, theme: "geist-print" as const });
  const original = compiled(input);
  for (const view of views) {
    const result = compiled(input, frozen({ view, theme: "geist-dark" }));
    expect(result.document).toEqual(original.document);
    expect(result.figure.theme).toBe("geist-dark");
    expect(result.classification.view).toBe(view);
    expect(result.semantics).toEqual(original.semantics);
    expect(validateEducational(result.figure).ok).toBe(true);
  }
});

test("all three views share nets, pins, edges and stable public target IDs", () => {
  const outputs = views.map((view) => compiled(basic(), { view }));
  const first = outputs[0];
  if (!first) throw new Error("Missing first view");
  for (const result of outputs) {
    expect(result.semantics).toEqual(first.semantics);
    expect(result.figure.targets.map((target) => target.id).sort()).toEqual(
      first.figure.targets.map((target) => target.id).sort(),
    );
    for (const net of result.semantics.nets) {
      const target = result.figure.targets.find((target) => target.id === net.id);
      expect(target?.role).toBe("net");
      if (target?.role === "net")
        expect(target.members).toHaveLength(net.pins.length + net.connections.length);
    }
  }
  expect(new Set(outputs.map((result) => JSON.stringify(result.figure.display))).size).toBe(3);
  expect(outputs[0]?.semantics.nets).toHaveLength(4);
});

test("union-find preserves cycles, fanout, disconnected modules and intra-module connections", () => {
  const input: DiagramDocument = {
    schema: "circuitkit.diagram.v1",
    id: "patchbay",
    title: "Audio patch network",
    modules: [
      { id: "mixer", ports: ["L", "R", "SEND"] },
      { id: "effect", ports: ["IN", "OUT"] },
      { id: "amp", ports: ["IN", "SPARE"] },
      { id: "spare", ports: [] },
    ],
    connections: [
      { from: "mixer.L", to: "effect.IN", kind: "audio" },
      { from: "effect.IN", to: "amp.IN", kind: "audio" },
      { from: "amp.IN", to: "mixer.L", kind: "audio" },
      { from: "mixer.L", to: "mixer.R", kind: "audio" },
    ],
  };
  for (const view of views) {
    const result = compiled(input, { view });
    expect(result.semantics.nets.map((net) => net.pins).sort()).toEqual(
      [
        ["amp.IN", "effect.IN", "mixer.L", "mixer.R"],
        ["amp.SPARE"],
        ["effect.OUT"],
        ["mixer.SEND"],
      ].sort(),
    );
    expect(result.figure.targets.some((target) => target.id === "patchbay/component/spare")).toBe(
      true,
    );
  }
});

test("no hidden internals, text-derived grounds, bus unions or assumed voltages", () => {
  const input: DiagramDocument = {
    schema: "circuitkit.diagram.v1",
    id: "logic",
    title: "Independent lanes",
    modules: [
      { id: "left", ports: ["GND", "5V"] },
      { id: "right", ports: ["GND", "5V"] },
    ],
    connections: [
      { from: "left.GND", to: "right.GND", bus: "shared" },
      { from: "left.5V", to: "right.5V", bus: "shared", kind: "audio" },
    ],
  };
  const result = compiled(input, { view: "schematic" });
  expect(result.semantics.nets).toHaveLength(2);
  expect(result.semantics.nets.map((net) => net.kinds)).toEqual([["audio"], ["signal"]]);
  expect(result.semantics.nets.every((net) => net.buses[0] === "shared")).toBe(true);
  const changed = compiled(
    { ...input, connections: input.connections.map((edge) => ({ ...edge, kind: "ground" })) },
    { view: "schematic" },
  );
  expect(result.figure.display).not.toEqual(changed.figure.display);
  expect(result.semantics.nets.map((net) => net.pins)).toEqual(
    changed.semantics.nets.map((net) => net.pins),
  );
  expect(JSON.stringify(result.semantics)).not.toContain("voltage");
});

test("reordering and undirected endpoint reversal preserve figure and semantic identity", () => {
  const input = basic();
  const reordered = {
    ...input,
    modules: [...input.modules]
      .reverse()
      .map((module) => ({ ...module, ports: [...module.ports].reverse() })),
    connections: [...input.connections]
      .reverse()
      .map((edge) => ({ ...edge, from: edge.to, to: edge.from })),
  };
  for (const view of views) {
    const first = renderDiagramSVG(input, { view });
    const next = renderDiagramSVG(reordered, { view });
    expect(first.ok).toBe(true);
    expect(next.ok).toBe(true);
    if (first.ok && next.ok) {
      expect(next.figure).toEqual(first.figure);
      expect(next.svg).toBe(first.svg);
      expect(next.semantics).toEqual(first.semantics);
      expect(next.targets).toEqual(first.targets);
      expect(renderDiagramSVG(input, { view })).toEqual(first);
    }
  }
  const extended = compiled({
    ...input,
    modules: [{ id: "aaa", ports: ["new"] }, ...input.modules],
  });
  for (const target of compiled(input).figure.targets.filter((target) => target.role !== "net")) {
    expect(extended.figure.targets.some((entry) => entry.id === target.id)).toBe(true);
  }
});

test("reference diagnostics include exact pointers and valid declared endpoints", () => {
  const input = basic();
  const diagnostics = fails({
    ...input,
    connections: [{ from: "sensor.missing", to: "absent.IN" }],
  });
  expect(diagnostics).toEqual([
    {
      code: "diagram.reference",
      path: "/connections/0/from",
      message: "Unknown endpoint 'sensor.missing'. Choose a declared port on 'sensor'.",
      validPins: ["sensor.GND", "sensor.OUT", "sensor.V+"],
    },
    {
      code: "diagram.reference",
      path: "/connections/0/to",
      message:
        "Unknown endpoint 'absent.IN'. Declare module 'absent' or choose a declared endpoint.",
      validPins: [
        "logger.GND",
        "logger.RX/TX",
        "logger.V−",
        "sensor.GND",
        "sensor.OUT",
        "sensor.V+",
      ],
    },
  ]);
});

test("duplicate modules, ports and undirected edges fail; a self endpoint fails", () => {
  const input = basic();
  fails({ ...input, modules: [...input.modules, input.modules[0]] });
  fails({ ...input, modules: [{ id: "a", ports: ["x", { id: "x" }] }] });
  expect(
    fails({
      ...input,
      connections: [
        input.connections[0],
        { from: "logger.RX/TX", to: "sensor.OUT", kind: "audio", bus: "other" },
      ],
    })[0]?.code,
  ).toBe("diagram.duplicate");
  expect(
    fails({ ...input, connections: [{ from: "sensor.OUT", to: "sensor.OUT" }] })[0]?.path,
  ).toBe("/connections/0/to");
});

for (const field of [
  "x",
  "y",
  "at",
  "position",
  "coordinates",
  "layout",
  "width",
  "height",
  "shape",
  "shapes",
  "via",
  "rotation",
  "display",
  "targets",
]) {
  test(`strictly rejects ${field} at every authoring level`, () => {
    const input = basic();
    fails({ ...input, [field]: 1 });
    fails({ ...input, modules: [{ id: "a", ports: [], [field]: 1 }] });
    fails({ ...input, modules: [{ id: "a", ports: [{ id: "x", [field]: 1 }] }] });
    fails({ ...input, connections: [{ ...input.connections[0], [field]: 1 }] });
  });
}

test("JSON pointer escapes unknown property names", () => {
  expect(fails({ ...basic(), "layout/with~escape": 1 })[0]?.path).toBe("/layout~1with~0escape");
});

test("safe technical IDs are precise, bounded and case sensitive", () => {
  const valid = ["+", "−", "A/B", "a-b", "5V", "_", "A".repeat(32)];
  expect(
    validateDiagram({ ...basic(), modules: [{ id: "Alpha_1-x", ports: valid }], connections: [] })
      .ok,
  ).toBe(true);
  for (const id of ["", "a.b", "a b", "a\n", "\u0000", "é", "A".repeat(33)])
    fails({ ...basic(), modules: [{ id: "a", ports: [id] }], connections: [] });
  for (const id of ["0a", "a.b", "a b", "a".repeat(49)]) fails({ ...basic(), id });
  fails({ ...basic(), connections: [{ from: "Sensor.OUT", to: "logger.GND" }] });
});

test("bounded plain JSON rejects accessors without invoking them", () => {
  let calls = 0;
  const getter = () => {
    calls++;
    throw new Error("must not run");
  };
  for (const location of ["root", "module", "port", "connection", "array"]) {
    const input = basic();
    const object =
      location === "root"
        ? input
        : location === "module"
          ? input.modules[0]
          : location === "port"
            ? input.modules[0]?.ports[1]
            : location === "array"
              ? input.modules
              : input.connections[0];
    if (!object || typeof object !== "object") throw new Error("fixture");
    Object.defineProperty(object, "x", { enumerable: true, get: getter });
    fails(input);
  }
  expect(calls).toBe(0);
});

test("hostile non-JSON inputs fail closed and do not pollute prototypes", () => {
  const cycle: Record<string, unknown> = {};
  cycle.self = cycle;
  let deep: unknown = {};
  for (let i = 0; i < 12; i++) deep = { next: deep };
  const array = [...basic().modules];
  Object.assign(array, { extra: true });
  const hidden = basic();
  Object.defineProperty(hidden, "hidden", { value: 1 });
  const proxy = Proxy.revocable({}, {});
  proxy.revoke();
  for (const input of [
    null,
    undefined,
    NaN,
    Infinity,
    1n,
    () => 1,
    "{}",
    new Date(),
    Object.create({ title: "bad" }),
    cycle,
    deep,
    hidden,
    proxy.proxy,
    { ...basic(), [Symbol("key")]: 1 },
    JSON.parse('{"__proto__":{"polluted":true}}'),
    { ...basic(), modules: array },
    { ...basic(), modules: new Array(5) },
    { ...basic(), modules: new Array(1000000) },
  ])
    fails(input);
  expect({}).not.toHaveProperty("polluted");
});

test("exception handling does not inspect hostile thrown objects", () => {
  const revoked = Proxy.revocable({}, {});
  revoked.revoke();
  const hostile = new Proxy(
    {},
    {
      getPrototypeOf: () => {
        throw revoked.proxy;
      },
    },
  );
  fails(hostile);
  const result = compileDiagram(basic(), hostile);
  expect(result.ok).toBe(false);
  if (result.ok) throw new Error("Expected hostile options failure");
  expect(result.diagnostics[0]?.path).toBe("/options");
});

test("returned documents, figures and nets are detached across calls", () => {
  const input = basic();
  const first = compiled(input);
  const snapshot = structuredClone(first);
  first.document.modules[0]?.ports.push({ id: "ADDED", label: "Added" });
  first.figure.display.length = 0;
  first.semantics.nets[0]?.pins.push("fake.pin");
  expect(compiled(input)).toEqual(snapshot);
  expect(input).toEqual(basic());
});

test("individual and global safety budgets reject before rendering", () => {
  const input = basic();
  fails({ ...input, modules: Array.from({ length: 17 }, (_, i) => ({ id: `M${i}`, ports: [] })) });
  fails({ ...input, modules: [{ id: "a", ports: Array.from({ length: 17 }, (_, i) => `P${i}`) }] });
  fails({
    ...input,
    modules: Array.from({ length: 5 }, (_, i) => ({
      id: `M${i}`,
      ports: Array.from({ length: 13 }, (_, j) => `P${j}`),
    })),
  });
  fails({ ...input, connections: new Array(33).fill(input.connections[0]) });
  for (const title of [
    "x".repeat(121),
    "x".repeat(1000000),
    "\u0000",
    "\uffff",
    "\ud800",
    "\u202e",
    "   ",
    "🧪",
  ])
    fails({ ...input, title });
  fails({ ...input, modules: [{ id: "a", label: "x".repeat(65), ports: [] }] });
  fails({ ...input, modules: [{ id: "a", ports: [{ id: "p", label: "x".repeat(33) }] }] });
  fails({ ...input, connections: [{ ...input.connections[0], bus: "x".repeat(33) }] });
  fails({ ...input, connections: [{ ...input.connections[0], label: "x".repeat(49) }] });
});

test("option failures use the same diagnostic envelope and never invoke accessors", () => {
  let invoked = false;
  const accessor = Object.defineProperty({}, "view", {
    enumerable: true,
    get: () => {
      invoked = true;
      return "blocks";
    },
  });
  for (const options of [null, { view: "unknown" }, { theme: "custom" }, { x: 10 }, accessor]) {
    const compiled = compileDiagram(basic(), options as DiagramOptions);
    expect(compiled.ok).toBe(false);
    if (compiled.ok) throw new Error("Expected invalid options");
    expect(renderDiagramSVG(basic(), options as DiagramOptions)).toEqual(compiled);
    expect(compiled.diagnostics[0]?.path).toStartWith("/options");
  }
  expect(invoked).toBe(false);
});

test("published JSON Schema matches runtime structural checks and states graph refinements", () => {
  const schema = z.fromJSONSchema(diagramJSONSchema);
  expect(typeof diagramJSONSchema).toBe("object");
  expect(diagramJSONSchema.additionalProperties).toBe(false);
  expect(diagramJSONSchema.description).toContain("at most 64 total ports");
  const input = basic();
  const cases = [
    input,
    { ...input, view: "schematic" },
    { ...input, view: "graph" },
    { ...input, title: "\u0000" },
    { ...input, title: " " },
    { ...input, x: 1 },
    { ...input, modules: [{ id: "a", ports: [{ id: "x", position: {} }] }] },
    { ...input, modules: [] },
    { ...input, modules: [{ id: "a", ports: ["has space"] }] },
    { ...input, connections: [{ ...input.connections[0], kind: "voltage" }] },
  ];
  for (const entry of cases)
    expect(schema.safeParse(entry).success).toBe(validateDiagram(entry).ok);
});

test("SVG uses escaped authored text and only public target geometry", () => {
  const result = renderDiagramSVG({ ...basic(), title: "<script>alert(1)</script> & samples" });
  expect(result.ok).toBe(true);
  if (!result.ok) return;
  expect(result.svg).not.toContain("<script>");
  expect(result.svg).toContain("&lt;script&gt;");
  expect(result.svg).not.toContain("<mask");
  expect(result.svg).not.toContain("<foreignObject");
  expect(result.svg).toContain('data-kind="group"');
  expect(result.svg).toContain(
    'aria-labelledby="edu-sensor-link-wiring-title edu-sensor-link-wiring-desc"',
  );
  expect(result.bounds.width).toBeGreaterThan(0);
  expect(
    result.targets.every((target) => target.bounds.width > 0 && target.bounds.height > 0),
  ).toBe(true);
});
