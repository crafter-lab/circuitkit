import { z } from "zod";
import bridgeRectifier from "../examples/bridge-rectifier.json";
import invertingAmplifier from "../examples/inverting-amplifier.json";
import led from "../examples/led-series.json";
import loadedDivider from "../examples/loaded-divider.json";
import rcLadder from "../examples/rc-ladder.json";
import rc from "../examples/rc-lowpass.json";
import transistorSwitch from "../examples/transistor-switch.json";
import divider from "../examples/voltage-divider.json";
import wheatstoneBridge from "../examples/wheatstone-bridge.json";
import { complexRecipes } from "./complex-recipes.ts";
import {
  componentPins,
  type FigureDocument,
  figureSchema,
  type RecipeId,
  recipeIds,
  themeOverridesSchema,
  themePresets,
} from "./schema.ts";

export const recipes = {
  ...complexRecipes,
  "rc-lowpass": {
    title: "RC low-pass filter",
    roles: {
      series: "resistor",
      shunt: "capacitor",
      input: "terminal",
      output: "terminal",
      ground: "ground",
    },
    nets: [
      ["input", "series.a"],
      ["series.b", "shunt.a", "output"],
      ["shunt.b", "ground"],
    ],
    derived: { formula: "fc = 1/(2πRC)", assumption: "Ideal RC model; not a simulation." },
  },
  "voltage-divider": {
    title: "Voltage divider",
    roles: {
      top: "resistor",
      bottom: "resistor",
      input: "terminal",
      output: "terminal",
      ground: "ground",
    },
    nets: [
      ["input", "top.a"],
      ["top.b", "bottom.a", "output"],
      ["bottom.b", "ground"],
    ],
    derived: {
      formula: "VOUT/VIN = Rbottom/(Rtop+Rbottom)",
      assumption: "Ideal unloaded divider.",
    },
  },
  "led-series": {
    title: "LED series circuit",
    roles: { supply: "dc-source", resistor: "resistor", led: "led", ground: "ground" },
    nets: [
      ["supply.positive", "resistor.a"],
      ["resistor.b", "led.anode"],
      ["led.cathode", "supply.negative", "ground"],
    ],
    derived: {
      formula: null,
      assumption: "Drawing values only; no LED voltage drop or current assumed.",
    },
  },
} as const;

export function getCatalog() {
  return structuredClone({
    version: 1,
    components: {
      resistor: {
        pins: componentPins.resistor,
        parameters: {
          resistance: { unit: "Ω", quantity: "resistance", finite: true, exclusiveMinimum: 0 },
        },
        convention: "IEC rectangular",
      },
      capacitor: {
        pins: componentPins.capacitor,
        parameters: {
          capacitance: { unit: "F", quantity: "capacitance", finite: true, exclusiveMinimum: 0 },
        },
      },
      led: { pins: componentPins.led, parameters: {} },
      diode: { pins: componentPins.diode, parameters: {} },
      npn: { pins: componentPins.npn, parameters: {} },
      "op-amp": { pins: componentPins["op-amp"], parameters: {} },
      "dc-source": {
        pins: componentPins["dc-source"],
        parameters: {
          voltage: { unit: "V", quantity: "voltage", finite: true, exclusiveMinimum: 0 },
        },
      },
    },
    ports: { terminal: { endpoint: "port ID" }, ground: { endpoint: "port ID" } },
    recipes: recipeIds.map((id) => ({ id, ...recipes[id], example: `examples/${id}.json` })),
    themes: { presets: themePresets, overrides: z.toJSONSchema(themeOverridesSchema) },
    endpoints: {
      syntax: "componentId.pin or portId",
      idConstraint: "Nonempty IDs; '.' is reserved for endpoint pin separation.",
      membership:
        "Every declared endpoint must belong to exactly one net; each net has at least two endpoints.",
      topology: "Exact role-resolved endpoint sets; net names are author-defined.",
    },
    limitations: [
      "No arbitrary topology, simulation, electrical-safety certification, or LED current estimate.",
    ],
  });
}

export function loadExample(id: RecipeId): FigureDocument {
  const examples = new Map<RecipeId, unknown>([
    ["rc-lowpass", rc],
    ["voltage-divider", divider],
    ["led-series", led],
    ["loaded-divider", loadedDivider],
    ["rc-ladder", rcLadder],
    ["wheatstone-bridge", wheatstoneBridge],
    ["bridge-rectifier", bridgeRectifier],
    ["transistor-switch", transistorSwitch],
    ["inverting-amplifier", invertingAmplifier],
  ]);
  if (!examples.has(id))
    throw new RangeError(
      `Unknown recipe ${JSON.stringify(id)}. Valid recipes: ${recipeIds.join(", ")}.`,
    );
  return figureSchema.parse(examples.get(id));
}

export function getSchema() {
  return z.toJSONSchema(figureSchema);
}
