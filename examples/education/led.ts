import {
  authorFigure,
  defineAuthorFigure,
  electricalPanel,
  known,
  type MeasurementPanel,
  point,
  symbolic,
  unknown,
} from "circuitkit/v2";
import { measuredStage } from "./composition.ts";

export function ledCircuit() {
  const circuit = electricalPanel(
    "circuit",
    [
      { id: "V1_positive", at: point(0, 0), connection: "required" },
      { id: "V1_negative", at: point(0, 200), connection: "required" },
      { id: "R1_a", at: point(180, 0), connection: "required" },
      { id: "R1_b", at: point(180, 100), connection: "required" },
      { id: "D1_anode", at: point(300, 100), connection: "required" },
      { id: "D1_cathode", at: point(300, 200), connection: "required" },
      { id: "GND", at: point(160, 240), connection: "required" },
    ],
    [
      {
        id: "V1",
        kind: "source",
        terminals: ["V1_positive", "V1_negative"],
        value: known(5, "V"),
        state: "normal",
        intent: "normal",
      },
      {
        id: "R1",
        kind: "resistor",
        terminals: ["R1_a", "R1_b"],
        value: known(330, "Ω"),
        state: "normal",
        intent: "normal",
      },
      {
        id: "D1",
        kind: "led",
        terminals: ["D1_anode", "D1_cathode"],
        value: known(2, "V"),
        state: "normal",
        intent: "normal",
      },
    ],
    [
      {
        id: "supply",
        from: "V1_positive",
        to: "R1_a",
        via: [],
        state: "connected",
        intent: "normal",
      },
      { id: "series", from: "R1_b", to: "D1_anode", via: [], state: "connected", intent: "normal" },
      {
        id: "return",
        from: "D1_cathode",
        to: "V1_negative",
        via: [],
        state: "connected",
        intent: "normal",
      },
      {
        id: "ground",
        from: "V1_negative",
        to: "GND",
        via: [point(0, 240)],
        state: "connected",
        intent: "normal",
      },
    ],
  );
  circuit.namedNets = [
    { id: "supply", terminal: "V1_positive" },
    { id: "series", terminal: "R1_b" },
    { id: "ground", terminal: "GND" },
  ];
  return circuit;
}

function ledStage(reading: MeasurementPanel["reading"], title: string, description: string) {
  const circuit = ledCircuit();
  if (reading.mode === "potential-difference") {
    for (const terminal of circuit.terminals) {
      terminal.potential = known(
        ["V1_positive", "R1_a"].includes(terminal.id)
          ? 5
          : ["R1_b", "D1_anode"].includes(terminal.id)
            ? 2
            : 0,
        "V",
      );
    }
  }
  return measuredStage(circuit, {
    title,
    description,
    positive: "R1_a",
    negative: "R1_b",
    reading,
    expose: [
      { id: "circuit/component/R1", label: "Series resistor", role: "component" },
      { id: "circuit/component/D1", label: "LED", role: "component" },
      { id: "circuit/terminal/R1_a", label: "Resistor input", role: "terminal" },
      { id: "circuit/terminal/R1_b", label: "Resistor output", role: "terminal" },
      { id: "circuit/net/series", label: "Series conductor", role: "net" },
    ],
  });
}

export const ledAuthor = defineAuthorFigure(
  authorFigure("led-migration", {
    teaching: ledStage(
      {
        mode: "authored",
        value: symbolic(
          [
            { text: "V", script: "base" },
            { text: "R", script: "sub" },
          ],
          "V",
        ),
      },
      "Voltage across the series resistor",
      "Assume a conducting LED with an authored 2 V drop. Red minus COM defines the sign.",
    ),
    question: ledStage(
      { mode: "authored", value: unknown("V") },
      "Read the resistor voltage",
      "Given a 5 V supply and assumed 2 V LED drop, read red at the resistor input relative to COM at its output.",
    ),
    correction: ledStage(
      { mode: "potential-difference", assumptions: ["common-reference", "ideal-voltmeter"] },
      "Subtract the probe potentials",
      "Authored potentials share ground: red is 5 V, COM is 2 V, so the ideal meter reads +3 V. No diode simulation is implied.",
    ),
  }),
);
