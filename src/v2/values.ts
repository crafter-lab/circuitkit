import { number } from "../typography.ts";
import { requireModel, unique } from "./safety.ts";
import type { MathRun, Reading, Unit, Value } from "./schema.ts";

export const math = (text: string): MathRun[] => [{ text, script: "base" }];
export const known = (value: number, unit: Unit, display?: MathRun[]): Value => ({
  kind: "known",
  value,
  unit,
  ...(display ? { display } : {}),
});
export const unknown = (unit: Unit): Value => ({ kind: "unknown", unit });
export const symbolic = (symbol: MathRun[], unit: Unit): Value => ({
  kind: "symbolic",
  symbol,
  unit,
});
export const authored = (value: Value): Reading => ({ mode: "authored", value });
export function valueRuns(value: Value): MathRun[] {
  const body =
    value.kind === "known"
      ? (value.display ?? math(number(value.value)))
      : value.kind === "symbolic"
        ? value.symbol
        : math("?");
  return [...body, ...(value.unit === "scalar" ? [] : math(` ${value.unit}`))];
}
const rules = {
  "voltage-difference": {
    units: ["V", "V"],
    output: "V",
    assumptions: ["common-reference", "ideal-voltmeter"],
  },
  "ohm-current": { units: ["V", "Ω"], output: "A", assumptions: ["ohmic", "passive-sign"] },
  "ohm-voltage": { units: ["A", "Ω"], output: "V", assumptions: ["ohmic", "passive-sign"] },
  "ohm-resistance": { units: ["V", "A"], output: "Ω", assumptions: ["ohmic", "passive-sign"] },
  power: { units: ["V", "A"], output: "W", assumptions: ["passive-sign"] },
  divider: { units: ["V", "Ω", "Ω"], output: "V", assumptions: ["ohmic", "unloaded-divider"] },
} as const;

export function resolveReading(reading: Reading): Value {
  if (reading.mode === "authored") return reading.value;
  const rule = rules[reading.operation];
  unique(reading.assumptions);
  requireModel(
    reading.assumptions.length === rule.assumptions.length &&
      rule.assumptions.every((a) => reading.assumptions.some((b) => a === b)),
    "value.assumptions",
  );
  requireModel(
    reading.inputs.length === rule.units.length &&
      reading.inputs.every((v, i) => v.unit === rule.units[i]),
    "value.units",
  );
  requireModel(
    reading.inputs.every((v) => v.kind === "known"),
    "value.unsupported-symbolic-derivation",
  );
  const values = reading.inputs.map((v) => (v.kind === "known" ? v.value : 0));
  const a = values[0] ?? 0;
  const b = values[1] ?? 0;
  const c = values[2] ?? 0;
  let result: number;
  switch (reading.operation) {
    case "voltage-difference":
      result = a - b;
      break;
    case "ohm-current":
      requireModel(b > 0, "value.resistance");
      result = a / b;
      break;
    case "ohm-voltage":
      requireModel(b > 0, "value.resistance");
      result = a * b;
      break;
    case "ohm-resistance":
      requireModel(b !== 0 && a / b > 0, "value.resistance");
      result = a / b;
      break;
    case "power":
      result = a * b;
      break;
    case "divider":
      requireModel(b > 0 && c > 0, "value.resistance");
      result = a * (c / (b + c));
      break;
  }
  requireModel(Number.isFinite(result) && Math.abs(result) <= 1e12, "value.range");
  const expectedNonzero =
    reading.operation === "voltage-difference"
      ? a !== b
      : reading.operation === "power" || reading.operation === "ohm-voltage"
        ? a !== 0 && b !== 0
        : a !== 0;
  requireModel(!expectedNonzero || result !== 0, "value.underflow");
  return known(result, rule.output);
}
