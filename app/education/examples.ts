import "next/headers";
import {
  adaptGradualPair,
  type GradualHost,
  projectGradualPair,
} from "../../src/integrations/gradual.ts";
import { educationFixtures } from "../../src/v2/fixtures.ts";
import { projectFigure } from "../../src/v2/index.ts";
import { netTargetId } from "../../src/v2/nets.ts";
import type { AuthorFigure, PublicFigure, Stage, Target, Theme } from "../../src/v2/schema.ts";
import { adapterFamilies, type ExampleId, examples, type Selection } from "./catalog.ts";

const targets: Partial<Record<ExampleId, Target[]>> = {
  electrical: [{ id: "symbols/component/part1", label: "Resistor", role: "component" }],
  signal: [
    { id: "signal/trace/raw", label: "Raw signal", role: "trace" },
    { id: "signal/trace/debounced", label: "Debounced signal", role: "trace" },
  ],
  samples: [{ id: "samples/trace/raw", label: "Sampled signal", role: "trace" }],
  timeline: [{ id: "time/now", label: "Current counter", role: "terminal" }],
  levels: [{ id: "levels/value", label: "Given voltage", role: "reading" }],
  quantity: [{ id: "quantities/reading/power", label: "Signed power", role: "reading" }],
  bars: [{ id: "bars/bar/source", label: "Source power", role: "reading" }],
  scale: [{ id: "scale/axis", label: "SI ruler", role: "axis" }],
  readings: [{ id: "readings/reading/negative", label: "Measured voltage", role: "reading" }],
  breadboard: [{ id: "breadboard/contact/a1", label: "Contact a1", role: "contact" }],
  pinout: [{ id: "pinout/pin/gpio", label: "GPIO 4", role: "pin" }],
  board: [{ id: "board/chip/mcu", label: "Unknown MCU", role: "body" }],
  open: [{ id: "circuit/route/bottom", label: "Open return path", role: "route" }],
  bypass: [{ id: "circuit/route/jumper", label: "Declared bypass", role: "route" }],
  composed: [{ id: "circuit/component/R1", label: "Upper resistor", role: "component" }],
};

export function authorExample(id: ExampleId, theme: Theme): AuthorFigure {
  const source = educationFixtures()[id === "named-nets" ? "measurement" : id];
  if (!source) throw new Error("Example unavailable.");
  const author = structuredClone(source);
  author.stages = {
    teaching: structuredClone(source.stages.teaching),
    question: structuredClone(source.stages.question),
    correction: structuredClone(source.stages.correction),
  };
  const entry = examples.find((example) => example.id === id);
  for (const stage of Object.values(author.stages)) {
    stage.theme = theme;
    stage.description = entry?.detail ?? "Public engine demonstration.";
    if (targets[id]) stage.expose = structuredClone(targets[id]);
  }
  if (id === "named-nets") {
    author.id = "named-nets-demo";
    for (const name of ["teaching", "correction"] as const) {
      const stage = author.stages[name];
      const panel = stage.panels.find(
        (candidate) => candidate.kind === "electrical" && candidate.id === "circuit",
      );
      if (panel?.kind !== "electrical") throw new Error("Example unavailable.");
      panel.namedNets = [
        { id: "supply", terminal: "vp" },
        { id: "midpoint", terminal: "rb" },
        { id: "return", terminal: "vn" },
      ];
      stage.title = "Approved conductor groups";
      stage.expose.push(
        { id: netTargetId(panel.id, "supply"), label: "Supply conductor", role: "net" },
        { id: netTargetId(panel.id, "midpoint"), label: "Divider midpoint conductor", role: "net" },
        { id: netTargetId(panel.id, "return"), label: "Return conductor", role: "net" },
      );
    }
    author.stages.question.title = "Conductor question without net hints";
    for (const panel of author.stages.question.panels)
      if (panel.kind === "electrical") delete panel.namedNets;
    author.stages.question.expose = author.stages.question.expose.filter(
      (target) => target.role !== "net",
    );
  }
  if (id === "measurement")
    author.stages.correction.expose.push({
      id: "explanation/reading/difference",
      label: "Signed difference explanation",
      role: "reading",
    });
  for (const panel of author.stages.question.panels) {
    if (panel.kind === "timeline") panel.showElapsed = false;
    if (panel.kind === "levels") panel.showClassification = false;
    if (panel.kind === "scale") panel.showConverted = false;
  }
  return author;
}

export function publicExample(selection: Selection): PublicFigure {
  const projected = projectFigure(authorExample(selection.case, selection.theme), selection.stage);
  if (!projected.ok) throw new Error("Example unavailable.");
  return projected.document;
}

const adapterInputs: Record<(typeof adapterFamilies)[number], Record<string, unknown>> = {
  loop: { supply: "5 V", upper: "R", open: true },
  divider: { supply: "5 V", upper: "R_1", lower: "R_2", probes: ["B", "C"] },
  led: { supply: "5 V", upper: "R" },
  pullup: { supply: "3.3 V", upper: "10 kΩ", open: true },
  fragment: { fragment: { labels: ["A", "B", "C"], resistorAfter: 1, bent: true } },
  "node-comparison": {},
  potentials: { potentials: ["-2 V", "-5 V", "0 V"], probes: ["A", "B"] },
  supply: { voltmeter: { reading: "?" } },
  breadboard: { boardRows: [2, 4, 6], upper: "R_1", lower: "R_2" },
  signal: {
    signal: {
      samples: ["LOW", "HIGH", "HIGH", "LOW"],
      markEdges: "both",
      sampleLabels: true,
      unit: "ms",
    },
  },
  timeline: { timeline: { start: 250, now: 6, max: 255, unit: "ms", showDifference: true } },
  levels: { levels: { low: 0.8, high: 2, max: 3.3, value: 1.4, showResult: true } },
  power: { power: { voltage: "5 V", current: "20 mA", formula: "P = V · I" } },
  bars: {
    bars: {
      unit: "W",
      items: [
        { label: "Source", value: -1, display: "-1 W" },
        { label: "Demand", value: 1, display: "1 W" },
      ],
      max: 3,
      threshold: { value: 2, label: "Rating" },
    },
  },
  scale: {
    scale: {
      base: "A",
      prefixed: "mA",
      factor: 1000,
      value: 0.02,
      from: "base",
      showResult: true,
      ticks: [0, 0.01, 0.02, 0.03],
    },
  },
  readings: {
    readings: {
      items: [{ label: "Meter", value: "-3.3", unit: "V", mode: "DC" }],
      quantity: "Voltage",
      difference: "Red - COM",
    },
  },
  board: {
    board: {
      unknown: ["mcu"],
      bridge: "USB",
      pins: [
        { name: "3V3", role: "power" },
        { name: "GPIO 4", role: "gpio" },
      ],
    },
  },
  record: {
    record: {
      fields: [
        { label: "Reading", missing: true },
        { label: "Unit", value: "V", flagged: true },
      ],
      verdict: "Record the observed value.",
    },
  },
};

export type AdapterProjection = {
  family: string;
  document: PublicFigure | null;
  host: GradualHost;
};
export function publicAdapterExamples(stage: Stage, theme: Theme): AdapterProjection[] {
  return adapterFamilies.map((family) => {
    const figure = {
      kind: family,
      caption: `Generic ${family} example. Not a private corpus case.`,
      ...adapterInputs[family],
    };
    const pair = adaptGradualPair(
      { id: `public-${family}`, teaching: figure, question: figure, correction: figure },
      { theme },
    );
    if (!pair.ok) throw new Error(`Public adapter example unavailable: ${family}`);
    const projected = projectGradualPair(pair, stage);
    if (!projected.ok) throw new Error(`Public adapter projection unavailable: ${family}`);
    const { additions: _additions, ...host } = projected.host;
    return { family, document: projected.document, host };
  });
}
