import { type DiagramModule, moduleKindSchema, validateDiagram } from "../diagram/schema.ts";
import { token } from "../diagram/semantics.ts";
import type { Diagnostic } from "../types.ts";
import { parseCircuitSource, sourceError, sourceFailure } from "./parser.ts";
import { resolvePresentation } from "./presentation.ts";
import type { ResolvedPresentation } from "./types.ts";
import {
  languageLimits,
  type ResolvedSystem,
  type SourceBody,
  type SourceConnection,
  type SourceDefinition,
  type SourceEndpoint,
  type SourceModule,
  type SourceProgram,
  type SourceRange,
  type SourceResult,
  type SystemConnection,
  type SystemNode,
} from "./types.ts";

const kinds = new Set<string>(moduleKindSchema.options);
const ref = (endpoint: SourceEndpoint) => `${endpoint.module}.${endpoint.port}`;
const pathJoin = (scope: string, id: string) => (scope ? `${scope}/${id}` : id);
function failDiagnostic(diagnostic: Diagnostic, range: SourceRange): never {
  throw new ErrorWithDiagnostic({ ...diagnostic, range });
}
const diagnostics = new WeakMap<object, Diagnostic>();
class ErrorWithDiagnostic extends Error {
  constructor(diagnostic: Diagnostic) {
    super(diagnostic.message);
    diagnostics.set(this, diagnostic);
  }
}
function normalized(
  module: SourceModule,
  ports = module.ports,
  kind = kinds.has(module.type) ? module.type : "module",
): DiagramModule {
  const input = {
    schema: "circuitkit.diagram.v1",
    id: "source_validation",
    title: "Source validation",
    modules: [
      {
        id: module.id,
        label: module.label,
        kind,
        ports: ports?.map((p) => ({
          id: p.id,
          ...(p.label === undefined ? {} : { label: p.label }),
        })),
      },
    ],
    connections: [],
  };
  if (module.label === undefined) delete (input.modules[0] as { label?: string }).label;
  const result = validateDiagram(input);
  if (!result.ok) {
    const diagnostic = result.diagnostics[0] as Diagnostic;
    const index = diagnostic.path.match(/\/ports\/(\d+)/)?.[1];
    failDiagnostic(
      diagnostic,
      index === undefined ? module.range : (ports?.[Number(index)]?.range ?? module.range),
    );
  }
  return result.document.modules[0] as DiagramModule;
}
function validateLink(link: SourceConnection) {
  const result = validateDiagram({
    schema: "circuitkit.diagram.v1",
    id: "source_validation",
    title: "Source validation",
    modules: [
      { id: "a", ports: ["p"] },
      { id: "b", ports: ["p"] },
    ],
    connections: [
      {
        from: "a.p",
        to: "b.p",
        kind: link.kind,
        ...(link.bus === undefined ? {} : { bus: link.bus }),
        ...(link.label === undefined ? {} : { label: link.label }),
        ...(link.direction === undefined ? {} : { direction: link.direction }),
      },
    ],
  });
  if (!result.ok) {
    const diagnostic = result.diagnostics[0] as Diagnostic;
    failDiagnostic(
      diagnostic,
      diagnostic.path.endsWith("/bus") ? (link.busRange ?? link.range) : link.range,
    );
  }
}
function resolveProgram(program: SourceProgram, checkUnused = true): ResolvedSystem {
  const definitions = new Map<string, SourceDefinition>();
  const normalizedModules = new Map<SourceModule, DiagramModule>();
  const title = validateDiagram({
    schema: "circuitkit.diagram.v1",
    id: program.id,
    title: program.title,
    view: program.view,
    theme: program.theme,
    modules: [{ id: "check", ports: [] }],
    connections: [],
  });
  if (!title.ok) failDiagnostic(title.diagnostics[0] as Diagnostic, program.titleRange);
  for (const definition of program.definitions) {
    if (definitions.has(definition.id) || kinds.has(definition.id))
      sourceError(
        "definition",
        `Definition '${definition.id}' conflicts with another definition or a built-in kind.`,
        definition.range,
      );
    normalized({
      id: definition.id,
      type: "module",
      ports: definition.ports,
      range: definition.range,
    });
    definitions.set(definition.id, definition);
  }
  const checkBody = (body: SourceBody, definition?: SourceDefinition) => {
    const modules = new Map<string, DiagramModule>();
    for (const module of body.modules) {
      if (modules.has(module.id))
        sourceError(
          "duplicate",
          `Module '${module.id}' is already declared in this scope.`,
          module.range,
        );
      const primitive = kinds.has(module.type);
      if (!primitive && !definitions.has(module.type))
        sourceError(
          "type",
          `Unknown module type '${module.type}'. Declare it with define or use a built-in module kind.`,
          module.range,
        );
      if (primitive && module.ports === undefined)
        sourceError(
          "ports",
          "Declare ports explicitly with (...), including () for no ports.",
          module.range,
        );
      if (!primitive && module.ports !== undefined)
        sourceError(
          "ports",
          "An instance gets its explicit public ports from its definition; do not redeclare them.",
          module.range,
        );
      const ports = primitive ? module.ports : definitions.get(module.type)?.ports;
      const checked = normalized(module, ports);
      modules.set(module.id, checked);
      normalizedModules.set(module, checked);
    }
    const endpoint = (value: SourceEndpoint) => {
      const module = modules.get(value.module);
      const possible = module
        ? module.ports.map((p) => `${value.module}.${p.id}`)
        : [...modules.values()].flatMap((m) => m.ports.map((p) => `${m.id}.${p.id}`));
      if (!module?.ports.some((p) => p.id === value.port))
        sourceError(
          "reference",
          `Unknown endpoint '${ref(value)}'. Choose a declared module and port in this scope.`,
          value.range,
          "/source/connections",
          possible,
        );
    };
    const pairs = new Set<string>();
    for (const link of body.connections) {
      endpoint(link.from);
      endpoint(link.to);
      validateLink(link);
      const pair = [ref(link.from), ref(link.to)].sort().join("\u0000");
      if (ref(link.from) === ref(link.to))
        sourceError("self_endpoint", "Connect two distinct endpoints.", link.to.range);
      if (pairs.has(pair))
        sourceError("duplicate", "This undirected endpoint pair is already connected.", link.range);
      pairs.add(pair);
    }
    const exposed = new Set<string>();
    for (const exposure of body.exposures) {
      if (!definition?.ports.some((p) => p.id === exposure.port))
        sourceError(
          "exposure",
          `Public port '${exposure.port}' is not declared by this definition.`,
          exposure.range,
        );
      if (exposed.has(exposure.port))
        sourceError(
          "duplicate",
          `Public port '${exposure.port}' is exposed more than once.`,
          exposure.range,
        );
      endpoint(exposure.target);
      exposed.add(exposure.port);
    }
    if (definition)
      for (const port of definition.ports)
        if (!exposed.has(port.id))
          sourceError(
            "exposure",
            `Expose public port '${port.id}' to one declared internal endpoint.`,
            port.range,
          );
  };
  for (const definition of program.definitions) checkBody(definition, definition);
  checkBody(program);
  const heights = new Map<string, number>();
  const visit = (name: string, active: string[]): number => {
    if (active.includes(name))
      sourceError(
        "recursive_definition",
        `Recursive definitions are not allowed: ${[...active, name].join(" -> ")}.`,
        definitions.get(name)?.range,
      );
    const cached = heights.get(name);
    if (cached !== undefined) return cached;
    let height = 1;
    for (const module of definitions.get(name)?.modules ?? [])
      if (!kinds.has(module.type))
        height = Math.max(height, 1 + visit(module.type, [...active, name]));
    if (height > languageLimits.depth)
      sourceError(
        "budget",
        "Definition nesting exceeds eight levels.",
        definitions.get(name)?.range,
      );
    heights.set(name, height);
    return height;
  };
  for (const name of definitions.keys()) visit(name, []);
  const system: ResolvedSystem = {
    schema: "circuitkit.system.v1",
    id: program.id,
    title: program.title,
    view: program.view,
    theme: program.theme,
    nodes: [],
    connections: [],
    aliases: [],
    nets: [],
  };
  const aliases = new Map<string, string>();
  const direct: SystemConnection[] = [];
  let totalPorts = 0;
  const expand = (body: SourceBody, scope: string, depth: number) => {
    if (depth > languageLimits.depth)
      sourceError("budget", "Instance nesting exceeds eight levels.", program.range);
    for (const module of body.modules) {
      const checked = normalizedModules.get(module) as DiagramModule;
      const path = pathJoin(scope, module.id);
      const primitive = kinds.has(module.type);
      const node: SystemNode = {
        path,
        id: module.id,
        type: module.type,
        label: checked.label,
        kind: primitive ? checked.kind : "assembly",
        ports: checked.ports.map((p) => ({ ...p })),
        parent: scope,
        range: module.range,
      };
      system.nodes.push(node);
      totalPorts += node.ports.length;
      if (
        system.nodes.length > languageLimits.expandedModules ||
        totalPorts > languageLimits.expandedPorts
      )
        sourceError(
          "expansion_limit",
          "Expanded system exceeds 256 modules or 2048 ports. Reduce instances or split the source.",
          module.range,
        );
      if (!primitive) {
        const definition = definitions.get(module.type) as SourceDefinition;
        expand(definition, path, depth + 1);
        for (const exposure of definition.exposures) {
          const from = `${path}.${exposure.port}`,
            to = `${pathJoin(path, exposure.target.module)}.${exposure.target.port}`;
          aliases.set(from, to);
          system.aliases.push({ from, to, range: exposure.range });
        }
      }
    }
    for (const link of body.connections) {
      direct.push({
        from: `${pathJoin(scope, link.from.module)}.${link.from.port}`,
        to: `${pathJoin(scope, link.to.module)}.${link.to.port}`,
        kind: link.kind,
        ...(link.bus === undefined ? {} : { bus: link.bus }),
        ...(link.label === undefined ? {} : { label: link.label }),
        ...(link.direction === undefined ? {} : { direction: link.direction }),
        scope,
        range: link.range,
      });
      if (direct.length > languageLimits.expandedConnections)
        sourceError("expansion_limit", "Expanded system exceeds 2048 connections.", link.range);
    }
  };
  expand(program, "", 0);
  const terminal = (value: string): string => {
    let next = value;
    const seen = new Set<string>();
    while (aliases.has(next)) {
      if (seen.has(next))
        sourceError("recursive_alias", "Recursive public-port alias.", program.range);
      seen.add(next);
      next = aliases.get(next) as string;
    }
    return next;
  };
  system.aliases = system.aliases.map((alias) => ({ ...alias, to: terminal(alias.to) }));
  const pairs = new Set<string>();
  for (const link of direct) {
    const from = terminal(link.from),
      to = terminal(link.to),
      pair = [from, to].sort().join("\u0000");
    if (from === to)
      sourceError("self_endpoint", "These aliases resolve to the same terminal.", link.range);
    if (pairs.has(pair))
      sourceError(
        "duplicate",
        "This connection duplicates an existing pair after expanding interfaces.",
        link.range,
      );
    pairs.add(pair);
    system.connections.push({ ...link, from, to });
  }
  const parents = new Map<string, string>();
  for (const node of system.nodes.filter((n) => n.kind !== "assembly"))
    for (const port of node.ports) {
      const id = `${node.path}.${port.id}`;
      parents.set(id, id);
    }
  const root = (value: string): string => {
    const parent = parents.get(value);
    if (parent === undefined)
      sourceError("reference", `Unresolved terminal '${value}'.`, program.range);
    if (parent === value) return value;
    const result = root(parent);
    parents.set(value, result);
    return result;
  };
  for (const link of system.connections) {
    const a = root(link.from),
      b = root(link.to);
    if (a !== b) parents.set(a < b ? b : a, a < b ? a : b);
  }
  const groups = new Map<string, string[]>();
  for (const pin of parents.keys()) {
    const id = root(pin);
    groups.set(id, [...(groups.get(id) ?? []), pin]);
  }
  system.nets = [...groups.values()]
    .map((pins) => pins.sort())
    .sort((a, b) => ((a[0] ?? "") < (b[0] ?? "") ? -1 : (a[0] ?? "") > (b[0] ?? "") ? 1 : 0))
    .map((pins) => ({ id: `${program.id}/net/${token(JSON.stringify(pins))}`, pins }));
  if (checkUnused) {
    const instantiated = new Set(
      system.nodes.filter((node) => node.kind === "assembly").map((node) => node.type),
    );
    for (const definition of program.definitions) {
      if (instantiated.has(definition.id)) continue;
      resolveProgram(
        {
          ...program,
          modules: [{ id: "validation_instance", type: definition.id, range: definition.range }],
          connections: [],
          exposures: [],
        },
        false,
      );
    }
  }
  return system;
}
export function resolveCircuitSource(source: string): SourceResult<{
  program: SourceProgram;
  system: ResolvedSystem;
  presentation?: ResolvedPresentation;
}> {
  const parsed = parseCircuitSource(source);
  if (!parsed.ok) return parsed;
  try {
    const system = resolveProgram(parsed.program);
    return {
      ok: true,
      program: parsed.program,
      system,
      ...(parsed.program.presentation
        ? { presentation: resolvePresentation(parsed.program.presentation, system) }
        : {}),
      diagnostics: [],
    };
  } catch (error) {
    const diagnostic =
      typeof error === "object" && error !== null ? diagnostics.get(error) : undefined;
    return diagnostic ? { ok: false, diagnostics: [diagnostic] } : sourceFailure(error);
  }
}
