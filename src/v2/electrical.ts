import { requireModel, unique } from "./safety.ts";
import type { ElectricalPanel, Point } from "./schema.ts";

export const distance = (a: Point, b: Point) => Math.hypot(b.x - a.x, b.y - a.y);
export function routePoints(
  panel: ElectricalPanel,
  route: ElectricalPanel["routes"][number],
): Point[] {
  const a = panel.terminals.find((t) => t.id === route.from);
  const b = panel.terminals.find((t) => t.id === route.to);
  requireModel(a && b, "graph.reference");
  return [a.at, ...route.via, b.at];
}

export function analyzeElectrical(panel: ElectricalPanel) {
  unique(panel.terminals.map((t) => t.id));
  unique(panel.components.map((c) => c.id));
  unique(panel.routes.map((r) => r.id));
  const terminals = new Map(panel.terminals.map((t) => [t.id, t]));
  const parents = new Map(panel.terminals.map((t) => [t.id, t.id]));
  const root = (id: string): string => {
    let current = id;
    while (parents.get(current) !== current) {
      const next = parents.get(current);
      requireModel(next, "graph.reference");
      current = next;
    }
    return current;
  };
  const union = (a: string, b: string) => {
    parents.set(root(b), root(a));
  };
  const used = new Set<string>();
  for (const component of panel.components) {
    const a = terminals.get(component.terminals[0]);
    const b = terminals.get(component.terminals[1]);
    requireModel(a && b && a.id !== b.id, "graph.component-terminals");
    requireModel(distance(a.at, b.at) >= 48, "graph.component-placement");
    if (component.kind !== "button") {
      requireModel(
        component.state === "normal" || component.intent === "intentional-fault",
        "graph.fault-intent",
      );
      if (component.value) {
        const unit =
          component.kind === "resistor" ? "Ω" : component.kind === "capacitor" ? "F" : "V";
        requireModel(component.value.unit === unit, "graph.component-unit");
        if (
          component.value.kind === "known" &&
          (component.kind === "resistor" || component.kind === "capacitor")
        )
          requireModel(component.value.value > 0, "graph.passive-value");
      }
    }
    if (component.state === "short" || component.state === "closed") union(a.id, b.id);
  }
  for (const route of panel.routes) {
    requireModel(
      terminals.has(route.from) && terminals.has(route.to) && route.from !== route.to,
      "graph.route-reference",
    );
    requireModel(
      route.state === "connected" || route.intent === "intentional-fault",
      "graph.fault-intent",
    );
    const points = routePoints(panel, route);
    requireModel(
      points.slice(1).every((p, i) => distance(points[i] ?? p, p) > 0),
      "graph.route-degenerate",
    );
    requireModel(
      points.slice(1).reduce((n, p, i) => n + distance(points[i] ?? p, p), 0) >=
        (route.state === "open" ? 16 : 1),
      "graph.route-length",
    );
    if (route.state === "connected") union(route.from, route.to);
    used.add(route.from);
    used.add(route.to);
    if (route.bypass)
      requireModel(
        route.intent === "intentional-fault" &&
          route.state === "connected" &&
          panel.components.some((c) => c.id === route.bypass),
        "graph.bypass-intent",
      );
  }
  for (const component of panel.components) {
    const bypassed = root(component.terminals[0]) === root(component.terminals[1]);
    if (bypassed && component.state !== "closed" && component.state !== "short")
      requireModel(
        component.intent === "intentional-fault" ||
          panel.routes.some((r) => r.bypass === component.id),
        "graph.unintended-bypass",
      );
  }
  for (const route of panel.routes) {
    if (!route.bypass) continue;
    const component = panel.components.find((c) => c.id === route.bypass);
    requireModel(
      component &&
        root(component.terminals[0]) === root(component.terminals[1]) &&
        root(route.from) === root(component.terminals[0]),
      "graph.false-bypass",
    );
  }
  const groups = new Map<string, string[]>();
  const potentials = new Map<string, number>();
  for (const terminal of panel.terminals) {
    requireModel(
      terminal.connection === "free" || used.has(terminal.id),
      "graph.unconnected-terminal",
    );
    const key = root(terminal.id);
    const group = groups.get(key) ?? [];
    group.push(terminal.id);
    groups.set(key, group);
    if (terminal.potential) {
      requireModel(terminal.potential.unit === "V", "graph.potential-unit");
      if (terminal.potential.kind === "known") {
        const previous = potentials.get(key);
        requireModel(
          previous === undefined || previous === terminal.potential.value,
          "graph.inconsistent-potential",
        );
        potentials.set(key, terminal.potential.value);
      }
    }
  }
  return [...groups.values()]
    .map((g) => g.sort())
    .sort((a, b) => (a[0] ?? "").localeCompare(b[0] ?? ""));
}
