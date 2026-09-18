import { analyzeElectrical } from "./electrical.ts";
import { AuthorError, boundedJSON, type Result, requireModel, unique } from "./safety.ts";
import { type ElectricalPanel, electricalSchema } from "./schema.ts";

export type SemanticNet = { id: string; anchor: string; terminals: string[]; members: string[] };
export const netTargetId = (panelId: string, netId: string) => `${panelId}/net/${netId}`;

export function resolveNamedNets(
  panel: ElectricalPanel,
  groups: string[][],
  exposed?: Set<string>,
): SemanticNet[] {
  const declarations = (panel.namedNets ?? []).filter(
    (net) => exposed === undefined || exposed.has(netTargetId(panel.id, net.id)),
  );
  unique(declarations.map((net) => net.id));
  const groupByTerminal = new Map(
    groups.flatMap((terminals, index) => terminals.map((terminal) => [terminal, index] as const)),
  );
  const claimed = new Set<number>();
  return declarations.map((net) => {
    const group = groupByTerminal.get(net.terminal);
    requireModel(group !== undefined, "net.unresolved-anchor");
    requireModel(!claimed.has(group), "net.ambiguous-anchor");
    claimed.add(group);
    const terminals = [...(groups[group] ?? [])].sort();
    const includes = (terminal: string) => groupByTerminal.get(terminal) === group;
    const members = [
      ...terminals.map((terminal) => `${panel.id}/terminal/${terminal}`),
      ...panel.routes
        .filter(
          (route) => route.state === "connected" && includes(route.from) && includes(route.to),
        )
        .map((route) => `${panel.id}/route/${route.id}`),
      ...panel.components
        .filter(
          (component) =>
            (component.state === "closed" || component.state === "short") &&
            component.terminals.every(includes),
        )
        .map((component) => `${panel.id}/component/${component.id}`),
    ].sort();
    return { id: netTargetId(panel.id, net.id), anchor: net.terminal, terminals, members };
  });
}

export function inspectElectricalNets(input: unknown): Result<{ nets: SemanticNet[] }> {
  try {
    const panel = electricalSchema.parse(boundedJSON(input));
    return { ok: true, nets: resolveNamedNets(panel, analyzeElectrical(panel)), diagnostics: [] };
  } catch (error) {
    return {
      ok: false,
      diagnostics: [
        {
          code: error instanceof AuthorError ? error.code : "author.schema",
          message: "Invalid educational author model.",
        },
      ],
    };
  }
}
