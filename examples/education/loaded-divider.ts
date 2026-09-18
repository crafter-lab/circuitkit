import { authorFigure, defineAuthorFigure, known, point, symbolic, unknown } from "circuitkit/v2";
import { dividerCircuit, dividerStage, inputSymbol, outputSymbol } from "./divider.ts";

export function loadedDividerCircuit() {
  const circuit = dividerCircuit(1000, 2000);
  circuit.terminals.push(
    { id: "R3_a", at: point(420, 200), connection: "required" },
    { id: "R3_b", at: point(420, 300), connection: "required" },
  );
  circuit.components.push({
    id: "R3",
    kind: "resistor",
    terminals: ["R3_a", "R3_b"],
    label: [
      { text: "R", script: "base" },
      { text: "L", script: "sub" },
    ],
    value: known(2000, "Ω"),
    state: "normal",
    intent: "normal",
  });
  circuit.routes.push(
    {
      id: "load",
      from: "VOUT",
      to: "R3_a",
      via: [point(420, 100)],
      state: "connected",
      intent: "normal",
    },
    {
      id: "load-return",
      from: "R3_b",
      to: "GND",
      via: [point(160, 300)],
      state: "connected",
      intent: "normal",
    },
  );
  return circuit;
}

export const loadedDividerAuthor = defineAuthorFigure(
  authorFigure("loaded-divider-extension", {
    teaching: dividerStage(
      loadedDividerCircuit(),
      symbolic(inputSymbol, "V"),
      symbolic(outputSymbol, "V"),
      "A load changes the divider",
      "The added 2000 Ω branch is in parallel with the lower resistor. An ideal meter adds no further load.",
    ),
    question: dividerStage(
      loadedDividerCircuit(),
      known(9, "V"),
      unknown("V"),
      "Read the loaded divider",
      "Given 9 V input, 1000 Ω upper resistance, and two parallel 2000 Ω lower branches, find the signed reading.",
    ),
    correction: dividerStage(
      loadedDividerCircuit(),
      known(9, "V"),
      known(4.5, "V"),
      "Account for both lower branches",
      "Authored ohmic calculation: 2000 Ω parallel 2000 Ω is 1000 Ω; 9 × 1000 / (1000 + 1000) = 4.5 V. Not a graph-solver result.",
    ),
  }),
);
