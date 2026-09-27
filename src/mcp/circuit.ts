import { z } from "zod";
import { loadExample } from "../catalog.ts";
import { renderCircuitSource } from "../language/index.ts";
import { renderSchematicSVG } from "../renderer.ts";
import { recipeSchema } from "../schema.ts";

export const circuitInputSchema = z.strictObject({
  recipe: recipeSchema.optional(),
  document: z.record(z.string(), z.unknown()).optional(),
  source: z.string().min(1).max(65_536).optional(),
});

export type CircuitInput = z.infer<typeof circuitInputSchema>;
export type Selection = { kind: "component" | "net" | "module" | "scene"; id: string } | null;

export function prepareCircuit(input: CircuitInput) {
  const parsed = circuitInputSchema.parse(input);
  if (
    [parsed.recipe, parsed.document, parsed.source].filter((value) => value !== undefined).length >
    1
  )
    throw new Error(
      "Provide exactly one of recipe, document or source, or omit all for the RC demo.",
    );
  if (new TextEncoder().encode(JSON.stringify(parsed)).length > 65_536)
    throw new Error("Circuit input exceeds 64 KiB.");
  if (parsed.source !== undefined) {
    const result = renderCircuitSource(parsed.source);
    if (!result.ok) throw new Error(JSON.stringify(result.diagnostics));
    return { kind: "source" as const, input: { source: parsed.source }, result };
  }
  const result = renderSchematicSVG(parsed.document ?? loadExample(parsed.recipe ?? "rc-lowpass"));
  if (!result.ok) throw new Error(JSON.stringify(result.diagnostics));
  return {
    kind: "recipe" as const,
    input: { document: result.document },
    result,
  };
}

export type PreparedCircuit = ReturnType<typeof prepareCircuit>;

export function circuitSummary(circuit: PreparedCircuit) {
  return circuit.kind === "recipe"
    ? {
        title: circuit.result.document.presentation.title,
        kind: circuit.kind,
        components: circuit.result.circuit.components,
        nets: circuit.result.circuit.nets,
        scenes:
          circuit.result.document.presentation.steps?.map(({ id, title }) => ({ id, title })) ?? [],
      }
    : {
        title: circuit.result.figure.title,
        kind: circuit.kind,
        modules: circuit.result.document.modules,
        nets: circuit.result.semantics.nets,
        scenes:
          circuit.result.presentation?.scenes.map(({ id, label, unavailable }) => ({
            id,
            title: label,
            unavailable,
          })) ?? [],
      };
}

export function selectionContext(circuit: PreparedCircuit, selection: Selection) {
  if (selection) {
    const valid =
      circuit.kind === "recipe"
        ? selection.kind === "component"
          ? Object.hasOwn(circuit.result.circuit.components, selection.id)
          : selection.kind === "net"
            ? Object.hasOwn(circuit.result.circuit.nets, selection.id)
            : selection.kind === "scene" &&
              circuit.result.document.presentation.steps?.some(({ id }) => id === selection.id)
        : selection.kind === "module"
          ? circuit.result.document.modules.some(({ id }) => id === selection.id)
          : selection.kind === "scene" &&
            circuit.result.presentation?.scenes.some(({ id }) => id === selection.id);
    if (!valid) throw new Error("Selection does not belong to this circuit.");
  }
  return {
    selection,
    circuit: circuitSummary(circuit),
  };
}
