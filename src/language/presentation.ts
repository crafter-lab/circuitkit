import type { CompiledDiagram } from "../diagram/index.ts";
import { semanticModel } from "../diagram/semantics.ts";
import { sourceError } from "./parser.ts";
import {
  languageLimits,
  type PresentationMember,
  type PresentationPlan,
  type PresentationSelector,
  type ResolvedPresentation,
  type ResolvedSystem,
  type SourcePresentation,
  type SourceSelection,
} from "./types.ts";

const endpointName = (value: { module: string; port: string }) => `${value.module}.${value.port}`;
const pair = (from: string, to: string) => JSON.stringify([from, to].sort());
const dedupe = (members: PresentationMember[]) => [
  ...new Map(members.map((member) => [JSON.stringify(member), member])).values(),
];

export function resolvePresentation(
  source: SourcePresentation,
  system: ResolvedSystem,
): ResolvedPresentation {
  const aliases = new Map(system.aliases.map((alias) => [alias.from, alias.to]));
  const canonical = (value: string) => aliases.get(value) ?? value;
  const nodes = new Map(system.nodes.map((node) => [node.path, node]));
  const links = new Map(system.connections.map((link) => [pair(link.from, link.to), link]));
  const sections = new Map<string, PresentationMember[]>();
  const endpoint = (value: { module: string; port: string }, selector: PresentationSelector) => {
    const node = nodes.get(value.module);
    if (!node?.ports.some((port) => port.id === value.port))
      sourceError(
        "presentation_reference",
        `Unknown presentation port '${endpointName(value)}'.`,
        selector.range,
      );
    return canonical(endpointName(value));
  };
  const select = (selector: PresentationSelector): PresentationMember[] => {
    switch (selector.kind) {
      case "module":
        if (!nodes.has(selector.name))
          sourceError(
            "presentation_reference",
            `Unknown module path '${selector.name}'.`,
            selector.range,
          );
        return [{ kind: "module", path: selector.name }];
      case "port":
        return [{ kind: "port", endpoint: endpoint(selector.endpoint, selector) }];
      case "link": {
        const from = endpoint(selector.from, selector),
          to = endpoint(selector.to, selector);
        const link = links.get(pair(from, to));
        if (!link)
          sourceError(
            "presentation_reference",
            "Select an existing connection; highlights never add wires.",
            selector.range,
          );
        return [{ kind: "link", from: link.from, to: link.to }];
      }
      case "bus": {
        const matches = system.connections.filter(
          (link) =>
            link.bus !== undefined &&
            `${link.scope ? `${link.scope}/` : ""}${link.bus}` === selector.name,
        );
        if (!matches.length)
          sourceError(
            "presentation_reference",
            `Unknown bus '${selector.name}'. Use an instance-qualified path for nested buses.`,
            selector.range,
          );
        if (new Set(matches.map((link) => JSON.stringify([link.scope, link.bus]))).size !== 1)
          sourceError(
            "presentation_reference",
            "Ambiguous bus path. Rename the colliding bus label.",
            selector.range,
          );
        return matches.map((link) => ({ kind: "link", from: link.from, to: link.to }));
      }
      case "section": {
        const members = sections.get(selector.name);
        if (!members)
          sourceError(
            "presentation_reference",
            `Unknown section '${selector.name}'.`,
            selector.range,
          );
        return members;
      }
    }
  };
  for (const section of source.sections) {
    if (sections.has(section.id))
      sourceError("duplicate", `Duplicate section '${section.id}'.`, section.range);
    sections.set(section.id, dedupe(section.selectors.flatMap(select)));
  }
  const sceneIds = new Set<string>();
  const scenes = source.scenes.map((scene) => {
    if (sceneIds.has(scene.id))
      sourceError("duplicate", `Duplicate scene '${scene.id}'.`, scene.range);
    sceneIds.add(scene.id);
    const used = new Set<string>();
    const flows = scene.flows.flatMap((flow) =>
      select(flow.selector).map((member) => {
        if (member.kind !== "link")
          sourceError("presentation", "Flow requires a connection.", flow.range);
        const link = links.get(pair(member.from, member.to));
        if (!link)
          sourceError("presentation_reference", "Flow connection was not resolved.", flow.range);
        if (flow.direction === "declared" && link.direction !== "forward")
          sourceError(
            "presentation_direction",
            "This connection has no single declared direction. Set direction forward or reverse relative to its authored endpoints.",
            flow.range,
          );
        if (link.direction === "forward" && flow.direction === "reverse")
          sourceError(
            "presentation_direction",
            "Reverse flow conflicts with the declared forward arrow.",
            flow.range,
          );
        const id = pair(member.from, member.to);
        if (used.has(id))
          sourceError("duplicate", "A connection can have only one flow per scene.", flow.range);
        used.add(id);
        if (used.size > languageLimits.presentationFlows)
          sourceError("budget", "A scene can animate at most 32 connections.", flow.range);
        return {
          from: flow.direction === "reverse" ? link.to : link.from,
          to: flow.direction === "reverse" ? link.from : link.to,
          periodMs: flow.periodMs,
        };
      }),
    );
    return {
      id: scene.id,
      label: scene.label,
      highlights: dedupe(scene.highlights.flatMap(select)),
      dim: scene.dim,
      flows,
      range: scene.range,
    };
  });
  return { sections: [...sections].map(([id, members]) => ({ id, members })), scenes };
}

export function projectPresentation(
  presentation: ResolvedPresentation,
  system: ResolvedSystem,
  selection: SourceSelection,
  compiled: CompiledDiagram,
): PresentationPlan {
  const model = semanticModel(compiled.document);
  const aliases = new Map(system.aliases.map((alias) => [alias.from, alias.to]));
  const canonical = (value: string) => aliases.get(value) ?? value;
  const systemEndpoint = (value: string) => {
    const dot = value.lastIndexOf(".");
    const module = value.slice(0, dot),
      port = value.slice(dot + 1);
    const path = selection.modulePaths[module];
    if (path?.endsWith("/@boundary")) {
      const boundary = selection.boundaryPorts.find((item) => item.port === port);
      return canonical(boundary?.endpoint ?? value);
    }
    return canonical(`${path}.${port}`);
  };
  const components = new Map(
    Object.entries(selection.modulePaths).map(([id, path]) => [
      path,
      `${compiled.document.id}/component/${id}`,
    ]),
  );
  const pins = new Map(model.pins.map((pin) => [systemEndpoint(pin.reference), pin.target]));
  const edges = new Map(
    model.edges.map((edge) => [pair(systemEndpoint(edge.from), systemEndpoint(edge.to)), edge]),
  );
  const routes = new Map(compiled.routes.map((route) => [route.target, route]));
  return {
    scenes: presentation.scenes.map((scene) => {
      const unavailable: string[] = [];
      const targets = new Set<string>();
      for (const member of scene.highlights) {
        const target =
          member.kind === "module"
            ? components.get(member.path)
            : member.kind === "port"
              ? pins.get(member.endpoint)
              : edges.get(pair(member.from, member.to))?.id;
        if (target) targets.add(target);
        else
          unavailable.push(
            `A highlighted ${member.kind} is omitted by scope/detail. Select a view that includes it.`,
          );
      }
      const flows: PresentationPlan["scenes"][number]["flows"] = [];
      for (const flow of scene.flows) {
        const edge = edges.get(pair(flow.from, flow.to));
        const route = edge ? routes.get(edge.id) : undefined;
        if (!edge || !route) {
          unavailable.push(
            compiled.classification.view === "blocks"
              ? "Blocks aggregate connections. Use wiring or schematic for per-wire flow."
              : "A flow route is omitted or represented by separate power/ground symbols. Use wiring or expand its scope.",
          );
          continue;
        }
        targets.add(edge.id);
        flows.push({
          target: edge.id,
          points:
            systemEndpoint(route.from) === flow.from ? route.points : [...route.points].reverse(),
          periodMs: flow.periodMs,
        });
      }
      return {
        id: scene.id,
        label: scene.label,
        targets: [...targets],
        dim: scene.dim,
        flows,
        unavailable: [...new Set(unavailable)],
        range: scene.range,
      };
    }),
  };
}
