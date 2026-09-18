import {
  authorFigure,
  defineAuthorFigure,
  type ElectricalPanel,
  electricalPanel,
  known,
  type MathRun,
  point,
  resolveReading,
  type StageModel,
  symbolic,
  unknown,
  type Value,
} from "circuitkit/v2";
import { measuredStage } from "./composition.ts";

export const inputSymbol: MathRun[] = [
  { text: "V", script: "base" },
  { text: "in", script: "sub" },
];
export const outputSymbol: MathRun[] = [
  { text: "V", script: "base" },
  { text: "out", script: "sub" },
];

export function dividerCircuit(upper = 10000, lower = 10000): ElectricalPanel {
  const circuit = electricalPanel(
    "circuit",
    [
      { id: "VIN", at: point(0, 0), connection: "required", label: inputSymbol },
      { id: "R1_a", at: point(160, 0), connection: "required" },
      { id: "R1_b", at: point(160, 100), connection: "required" },
      { id: "R2_a", at: point(300, 100), connection: "required" },
      { id: "R2_b", at: point(300, 200), connection: "required" },
      { id: "VOUT", at: point(400, 100), connection: "required", label: outputSymbol },
      { id: "GND", at: point(160, 240), connection: "required" },
    ],
    [
      {
        id: "R1",
        kind: "resistor",
        terminals: ["R1_a", "R1_b"],
        label: [
          { text: "R", script: "base" },
          { text: "1", script: "sub" },
        ],
        state: "normal",
        intent: "normal",
        value: known(upper, "Ω"),
      },
      {
        id: "R2",
        kind: "resistor",
        terminals: ["R2_a", "R2_b"],
        label: [
          { text: "R", script: "base" },
          { text: "2", script: "sub" },
        ],
        state: "normal",
        intent: "normal",
        value: known(lower, "Ω"),
      },
    ],
    [
      { id: "input", from: "VIN", to: "R1_a", via: [], state: "connected", intent: "normal" },
      { id: "middle", from: "R1_b", to: "R2_a", via: [], state: "connected", intent: "normal" },
      { id: "output", from: "R2_a", to: "VOUT", via: [], state: "connected", intent: "normal" },
      {
        id: "ground",
        from: "R2_b",
        to: "GND",
        via: [point(300, 240)],
        state: "connected",
        intent: "normal",
      },
    ],
  );
  circuit.namedNets = [
    { id: "input", terminal: "VIN" },
    { id: "output", terminal: "VOUT" },
    { id: "ground", terminal: "GND" },
  ];
  return circuit;
}

export function dividerStage(
  circuit: ElectricalPanel,
  input: Value,
  reading: Value,
  title: string,
  description: string,
): StageModel {
  const model = measuredStage(circuit, {
    title,
    description,
    positive: "VOUT",
    negative: "GND",
    reading: { mode: "authored", value: reading },
    expose: [
      { id: "circuit/component/R1", label: "Upper resistor", role: "component" },
      { id: "circuit/component/R2", label: "Lower resistor", role: "component" },
      { id: "circuit/terminal/VOUT", label: "Output terminal", role: "terminal" },
      { id: "circuit/net/output", label: "Output conductor", role: "net" },
    ],
  });
  model.panels.push({
    kind: "readings",
    id: "givens",
    at: point(40, 440),
    items: [{ id: "input", label: inputSymbol, reading: { mode: "authored", value: input } }],
  });
  return model;
}

export const dividerAuthor = defineAuthorFigure(
  authorFigure("divider-migration", {
    teaching: dividerStage(
      dividerCircuit(),
      symbolic(inputSymbol, "V"),
      symbolic(outputSymbol, "V"),
      "An unloaded divider",
      "An ideal voltmeter compares the output with ground. The resistors are ohmic.",
    ),
    question: dividerStage(
      dividerCircuit(),
      known(6, "V"),
      unknown("V"),
      "Read the divider",
      "Given 6 V input, equal 10000 Ω resistors and no load, find the signed meter reading.",
    ),
    correction: dividerStage(
      dividerCircuit(),
      known(6, "V"),
      resolveReading({
        mode: "derived",
        operation: "divider",
        inputs: [known(6, "V"), known(10000, "Ω"), known(10000, "Ω")],
        assumptions: ["ohmic", "unloaded-divider"],
      }),
      "Equal resistors divide the input in half",
      "With no load and ohmic resistors, 6 × 10000 / (10000 + 10000) = 3 V.",
    ),
  }),
);
