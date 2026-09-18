import type { Stage, Theme } from "../../src/v2/schema.ts";

export const stages = ["teaching", "question", "correction"] as const;
export const themes = ["geist-light", "geist-dark", "geist-print"] as const;
export const families = [
  "electrical",
  "measurement",
  "signal",
  "timeline",
  "levels",
  "quantity",
  "bars",
  "scale",
  "readings",
  "breadboard",
  "pinout",
  "board",
] as const;
export const examples = [
  {
    id: "electrical",
    family: "electrical",
    title: "Six electrical symbols",
    detail: "Source, resistor, capacitor, LED, diode and button. Explicit terminals, not a solver.",
  },
  {
    id: "named-nets",
    family: "electrical",
    title: "Explicit whole-net targets",
    detail:
      "Author-approved conductor groups in teaching and correction. Question exposes no net membership hints.",
  },
  {
    id: "measurement",
    family: "measurement",
    title: "Signed ideal measurement",
    detail: "Ordered red / COM probes, an unknown question and an additive correction.",
  },
  {
    id: "signal",
    family: "signal",
    title: "Edges and debounce",
    detail: "Transitions, stable window, explicit initial state and accepted edges.",
  },
  {
    id: "samples",
    family: "signal",
    title: "Sampled logic",
    detail: "HIGH / LOW samples with temporal identities and sample labels.",
  },
  {
    id: "timeline",
    family: "timeline",
    title: "Counter wrap",
    detail: "Explicit wrap count and exclusive modulus. Elapsed time is not guessed.",
  },
  {
    id: "levels",
    family: "levels",
    title: "Logic thresholds",
    detail: "LOW, HIGH and a region with no guaranteed logic classification.",
  },
  {
    id: "quantity",
    family: "quantity",
    title: "V / I / R / P",
    detail: "Known, symbolic and derived quantities with explicit physical assumptions.",
  },
  {
    id: "bars",
    family: "bars",
    title: "Signed power bars",
    detail: "Negative supply, positive demand and an authored rating threshold.",
  },
  {
    id: "scale",
    family: "scale",
    title: "SI scale",
    detail: "Base units, prefixed ruler and an explicitly requested conversion.",
  },
  {
    id: "readings",
    family: "readings",
    title: "Mixed readings",
    detail: "Signed observations, unknown values and subscripted symbols.",
  },
  {
    id: "breadboard",
    family: "breadboard",
    title: "Contacts and jumpers",
    detail: "Explicit contact partitions and visible links, not inferred net targets.",
  },
  {
    id: "pinout",
    family: "pinout",
    title: "Typed pins",
    detail: "Explicit power, ground and GPIO roles without guessed capabilities.",
  },
  {
    id: "board",
    family: "board",
    title: "Board anatomy",
    detail: "Positioned pins and chips, including an intentionally unknown MCU.",
  },
  {
    id: "open",
    family: "electrical",
    title: "Intentional open",
    detail: "A visible return-path gap with explicit fault intent.",
  },
  {
    id: "bypass",
    family: "electrical",
    title: "Intentional bypass",
    detail: "A declared resistor bypass, distinct from an unintended short.",
  },
  {
    id: "composed",
    family: "electrical",
    title: "Multi-panel composition",
    detail: "Electrical graph, signal, quantities and board in one public drawing.",
  },
] as const;
export const adapterFamilies = [
  "loop",
  "divider",
  "led",
  "pullup",
  "fragment",
  "node-comparison",
  "potentials",
  "supply",
  "breadboard",
  "signal",
  "timeline",
  "levels",
  "power",
  "bars",
  "scale",
  "readings",
  "board",
  "record",
] as const;
export type ExampleId = (typeof examples)[number]["id"];
export type Selection = { case: ExampleId; stage: Stage; theme: Theme };
export type Search = Record<string, string | string[] | undefined>;
export const defaultSelection: Selection = {
  case: "measurement",
  stage: "question",
  theme: "geist-light",
};
export function parseSelection(params: Search): Selection | null {
  const selected = {
    case: params.case ?? defaultSelection.case,
    stage: params.stage ?? defaultSelection.stage,
    theme: params.theme ?? defaultSelection.theme,
  };
  if (
    !examples.some((entry) => entry.id === selected.case) ||
    !stages.some((stage) => stage === selected.stage) ||
    !themes.some((theme) => theme === selected.theme)
  )
    return null;
  return selected as Selection;
}
export function selectionQuery(selection: Selection) {
  return new URLSearchParams(selection).toString();
}
