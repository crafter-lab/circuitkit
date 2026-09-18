import { authorFigure, electricalPanel, placePanel, stageModel } from "./builders.ts";
import { point } from "./primitives.ts";
import type { AuthorFigure, Component, ElectricalPanel, Panel } from "./schema.ts";
import { authored, known, math, symbolic, unknown } from "./values.ts";

function allStages(id: string, panels: Panel[]): AuthorFigure {
  const model = stageModel(panels, { title: id });
  return authorFigure(id, { teaching: model, question: model, correction: model });
}

export function dividerPanel(): ElectricalPanel {
  return electricalPanel(
    "circuit",
    [
      { id: "vp", at: point(0, 0), connection: "required", potential: known(12, "V") },
      { id: "vn", at: point(0, 160), connection: "required", potential: known(0, "V") },
      {
        id: "ra",
        at: point(180, 0),
        connection: "required",
        potential: known(12, "V"),
        label: math("A"),
      },
      {
        id: "rb",
        at: point(180, 80),
        connection: "required",
        potential: known(6, "V"),
        label: math("B"),
      },
      { id: "rc", at: point(280, 80), connection: "required", potential: known(6, "V") },
      {
        id: "rd",
        at: point(280, 160),
        connection: "required",
        potential: known(0, "V"),
        label: math("C"),
      },
    ],
    [
      {
        id: "V1",
        kind: "source",
        terminals: ["vp", "vn"],
        state: "normal",
        intent: "normal",
        value: known(12, "V"),
      },
      {
        id: "R1",
        kind: "resistor",
        terminals: ["ra", "rb"],
        state: "normal",
        intent: "normal",
        value: known(1000, "Ω"),
      },
      {
        id: "R2",
        kind: "resistor",
        terminals: ["rc", "rd"],
        state: "normal",
        intent: "normal",
        value: known(1000, "Ω"),
      },
    ],
    [
      { id: "top", from: "vp", to: "ra", via: [], state: "connected", intent: "normal" },
      { id: "middle", from: "rb", to: "rc", via: [], state: "connected", intent: "normal" },
      { id: "bottom", from: "rd", to: "vn", via: [], state: "connected", intent: "normal" },
    ],
  );
}

export function privacyFixture(): AuthorFigure {
  const teachingCircuit = dividerPanel();
  const questionCircuit = dividerPanel();
  for (const terminal of questionCircuit.terminals) delete terminal.potential;
  for (const component of questionCircuit.components)
    if (component.kind !== "button") delete component.value;
  const meter: Panel = {
    kind: "measurement",
    id: "meter",
    at: point(420, 50),
    model: "ideal-voltmeter",
    positive: {
      panel: "circuit",
      terminal: "rd",
      via: [point(-40, 110), point(-40, 150), point(20, 150)],
    },
    negative: {
      panel: "circuit",
      terminal: "ra",
      via: [point(-20, -50), point(180, -50), point(180, 140), point(120, 140)],
    },
    reading: { mode: "potential-difference", assumptions: ["common-reference", "ideal-voltmeter"] },
  };
  const questionMeter: Panel = { ...meter, reading: { mode: "authored", value: unknown("V") } };
  const expose = [
    { id: "circuit/terminal/ra", label: "Point A", role: "terminal" as const },
    { id: "circuit/terminal/rd", label: "Point C", role: "terminal" as const },
    { id: "meter/probe/positive", label: "Red probe", role: "probe" as const },
    { id: "meter/reading", label: "Meter display", role: "reading" as const },
  ];
  return authorFigure("signed-measurement", {
    teaching: stageModel([teachingCircuit, meter], { title: "Compare potentials", expose }),
    question: stageModel([questionCircuit, questionMeter], {
      title: "Read the meter",
      description: "Choose the signed reading.",
      expose,
    }),
    correction: stageModel(
      [
        teachingCircuit,
        meter,
        {
          kind: "readings",
          id: "explanation",
          at: point(0, 310),
          items: [
            { id: "difference", label: math("Red - COM"), reading: authored(known(-12, "V")) },
          ],
        },
      ],
      { title: "Compare potentials", expose },
    ),
  });
}

export function educationFixtures(): Record<string, AuthorFigure> {
  const gallery = electricalPanel("symbols", [], [], []);
  const kinds = ["source", "resistor", "capacitor", "led", "diode", "button"] as const;
  kinds.forEach((kind, index) => {
    const a = `a${index}`;
    const b = `b${index}`;
    gallery.terminals.push(
      { id: a, at: point(index * 130, 0), connection: "free" },
      { id: b, at: point(index * 130 + 90, 0), connection: "free" },
    );
    const common = {
      id: `part${index}`,
      terminals: [a, b] as [string, string],
      intent: "normal" as const,
      label: math(kind),
    };
    const component: Component =
      kind === "button"
        ? { ...common, kind, state: "open" }
        : {
            ...common,
            kind,
            state: "normal",
            value: symbolic(
              math(kind === "resistor" ? "R" : kind === "capacitor" ? "C" : "V"),
              kind === "resistor" ? "Ω" : kind === "capacitor" ? "F" : "V",
            ),
          };
    gallery.components.push(component);
  });
  const signal: Panel = {
    kind: "signal",
    id: "signal",
    at: point(0, 0),
    width: 480,
    height: 50,
    unit: "ms",
    data: {
      mode: "transitions",
      start: 0,
      end: 40,
      initial: "HIGH",
      changes: [
        { at: 4, level: "LOW" },
        { at: 6, level: "HIGH" },
        { at: 8, level: "LOW" },
      ],
    },
    edges: "both",
    sampleLabels: false,
    debounce: { duration: 10, initial: "HIGH" },
    window: { from: 8, to: 18, label: math("10 ms stable") },
  };
  const samples: Panel = {
    ...signal,
    id: "samples",
    data: { mode: "samples", values: ["LOW", "HIGH", "HIGH", "LOW", "HIGH"], period: 2, start: 0 },
    sampleLabels: true,
  };
  delete samples.debounce;
  delete samples.window;
  const timeline: Panel = {
    kind: "timeline",
    id: "time",
    at: point(0, 0),
    width: 440,
    start: 4294967290,
    now: 3,
    modulus: 4294967296,
    wraps: 1,
    unit: "ms",
    showElapsed: true,
  };
  const levels: Panel = {
    kind: "levels",
    id: "levels",
    at: point(0, 0),
    width: 420,
    low: 0.8,
    high: 2,
    max: 3.3,
    value: known(1.4, "V"),
    showClassification: true,
  };
  const quantity: Panel = {
    kind: "quantity",
    id: "quantities",
    at: point(0, 0),
    items: [
      { id: "voltage", quantity: "V", reading: authored(known(10, "V")) },
      {
        id: "current",
        quantity: "I",
        reading: {
          mode: "derived",
          operation: "ohm-current",
          inputs: [known(10, "V"), known(100, "Ω")],
          assumptions: ["ohmic", "passive-sign"],
        },
      },
      {
        id: "resistance",
        quantity: "R",
        reading: authored(
          symbolic(
            [
              { text: "R", script: "base" },
              { text: "load", script: "sub" },
            ],
            "Ω",
          ),
        ),
      },
      {
        id: "power",
        quantity: "P",
        reading: {
          mode: "derived",
          operation: "power",
          inputs: [known(-10, "V"), known(0.1, "A")],
          assumptions: ["passive-sign"],
        },
      },
    ],
  };
  const bars: Panel = {
    kind: "bars",
    id: "bars",
    at: point(0, 0),
    width: 300,
    unit: "W",
    min: -2,
    max: 5,
    items: [
      { id: "source", label: math("Source"), value: known(-1, "W") },
      { id: "demand", label: math("Demand"), value: known(1, "W") },
      { id: "rating", label: math("Rating"), value: known(4, "W") },
    ],
    threshold: { value: 4, label: math("Limit") },
  };
  const scale: Panel = {
    kind: "scale",
    id: "scale",
    at: point(0, 0),
    width: 400,
    unit: "A",
    prefix: "m",
    ticks: [0, 0.025, 0.05, 0.075, 0.1],
    value: known(0.04, "A"),
    showConverted: true,
  };
  const readings: Panel = {
    kind: "readings",
    id: "readings",
    at: point(0, 0),
    items: [
      { id: "negative", label: math("Measured"), reading: authored(known(-3.3, "V")) },
      { id: "unknown", label: math("Next"), reading: authored(unknown("A")) },
      {
        id: "symbolic",
        label: math("Voltage"),
        reading: authored(
          symbolic(
            [
              { text: "V", script: "base" },
              { text: "out", script: "sub" },
            ],
            "V",
          ),
        ),
      },
    ],
  };
  const breadboard: Panel = {
    kind: "breadboard",
    id: "breadboard",
    at: point(0, 0),
    width: 240,
    height: 140,
    contacts: [
      { id: "a1", at: point(30, 40), label: math("a1") },
      { id: "b1", at: point(70, 40), label: math("b1") },
      { id: "a2", at: point(30, 100), label: math("a2") },
      { id: "b2", at: point(70, 100), label: math("b2") },
    ],
    groups: [
      { id: "row1", contacts: ["a1", "b1"] },
      { id: "row2", contacts: ["a2", "b2"] },
    ],
    showGroups: true,
    links: [{ id: "jumper", from: "b1", to: "b2", via: [point(110, 40), point(110, 100)] }],
  };
  const pinout: Panel = {
    kind: "pinout",
    id: "pinout",
    at: point(0, 0),
    width: 250,
    height: 180,
    pins: [
      { id: "vcc", at: point(10, 30), label: math("3V3"), role: "power" },
      { id: "gpio", at: point(10, 90), label: math("GPIO 4"), role: "gpio" },
      { id: "gnd", at: point(10, 150), label: math("GND"), role: "ground" },
    ],
  };
  const board: Panel = {
    kind: "board",
    id: "board",
    at: point(0, 0),
    width: 320,
    height: 220,
    pins: pinout.pins,
    chips: [
      { id: "mcu", at: point(150, 30), width: 140, height: 60, label: math("MCU ?") },
      { id: "bridge", at: point(150, 130), width: 140, height: 40, label: math("USB bridge") },
    ],
  };
  const open = dividerPanel();
  const bottom = open.routes.find((r) => r.id === "bottom");
  if (bottom) {
    bottom.state = "open";
    bottom.intent = "intentional-fault";
  }
  for (const terminal of open.terminals) delete terminal.potential;
  const bypass = structuredClone(open);
  if (bypass.routes[2])
    bypass.routes[2] = { ...bypass.routes[2], state: "connected", intent: "normal" };
  bypass.routes.push({
    id: "jumper",
    from: "ra",
    to: "rb",
    via: [point(130, 0), point(130, 80)],
    state: "connected",
    intent: "intentional-fault",
    bypass: "R1",
  });
  const panels = [
    signal,
    timeline,
    levels,
    quantity,
    bars,
    scale,
    readings,
    breadboard,
    pinout,
    board,
  ];
  return {
    electrical: allStages("electrical-symbols", [gallery]),
    measurement: privacyFixture(),
    samples: allStages("signal-samples", [samples]),
    ...Object.fromEntries(panels.map((p) => [p.kind, allStages(`${p.kind}-example`, [p])])),
    open: allStages("intentional-open", [open]),
    bypass: allStages("intentional-bypass", [bypass]),
    composed: allStages("composed-panels", [
      placePanel(dividerPanel(), point(30, 60)),
      placePanel(signal, point(430, 80)),
      placePanel(quantity, point(30, 440)),
      placePanel(board, point(500, 420)),
    ]),
  };
}
