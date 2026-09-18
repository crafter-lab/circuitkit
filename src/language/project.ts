import { z } from "zod";
import { plainJSON, pointer } from "../diagram/safety.ts";
import {
  type DiagramConnection,
  type DiagramDocument,
  diagramViewSchema,
  validateDiagram,
} from "../diagram/schema.ts";
import { token } from "../diagram/semantics.ts";
import { themeSchema } from "../v2/schema.ts";
import { sourceError, sourceFailure } from "./parser.ts";
import type {
  ResolvedSystem,
  SourceBody,
  SourceOptions,
  SourceProgram,
  SourceRange,
  SourceResult,
  SourceSelection,
  SystemNode,
} from "./types.ts";

const optionsSchema = z.strictObject({
  view: diagramViewSchema.optional(),
  theme: themeSchema.optional(),
  scope: z
    .string()
    .max(256)
    .regex(/^(?:\/?[A-Za-z][A-Za-z0-9_-]{0,47}(?:\/[A-Za-z][A-Za-z0-9_-]{0,47})*)?$/)
    .optional(),
  detail: z.enum(["expanded", "interface"]).optional(),
});
export function parseSourceOptions(
  options?: SourceOptions,
): SourceResult<{ options: SourceOptions }> {
  try {
    const result = optionsSchema.safeParse(options === undefined ? {} : plainJSON(options));
    if (!result.success)
      return {
        ok: false,
        diagnostics: result.error.issues.map((issue) => ({
          code: "language.options",
          path: `/options${pointer(issue.path)}`,
          message: issue.message,
        })),
      };
    return { ok: true, options: result.data, diagnostics: [] };
  } catch {
    return {
      ok: false,
      diagnostics: [
        {
          code: "language.options",
          path: "/options",
          message: "Use plain data for source options.",
        },
      ],
    };
  }
}
export function projectSystem(
  program: SourceProgram,
  system: ResolvedSystem,
  options: SourceOptions,
): SourceResult<{
  document: DiagramDocument;
  selection: SourceSelection;
  sourceMap: Map<string, SourceRange>;
}> {
  try {
    const scope = (options.scope ?? "").replace(/^\//, "");
    const detail = options.detail ?? "expanded";
    const assembly = scope
      ? system.nodes.find((n) => n.path === scope && n.kind === "assembly")
      : undefined;
    if (scope && !assembly)
      sourceError(
        "scope",
        "Choose the root or a declared assembly path. Use expand to inspect available scopes.",
        undefined,
        "/options/scope",
      );
    const definition = assembly
      ? program.definitions.find((d) => d.id === assembly.type)
      : undefined;
    const body: SourceBody = definition ?? program;
    const contains = (path: string) => !scope || path.startsWith(`${scope}/`);
    const visible =
      detail === "interface"
        ? system.nodes.filter((n) => n.parent === scope)
        : system.nodes.filter((n) => n.kind !== "assembly" && contains(n.path));
    const sourceMap = new Map<string, SourceRange>([
      ["", definition?.range ?? program.range],
      ["/title", program.titleRange],
    ]);
    const modulePaths: Record<string, string> = Object.create(null);
    const ids = new Map<string, string>();
    const used = new Set<string>();
    const idFor = (node: SystemNode) => {
      const id = node.path.includes("/") ? `x_${token(node.path)}` : node.id;
      if (used.has(id))
        sourceError(
          "identity",
          "Generated identity collides with an authored module. Rename the conflicting identifier.",
          node.range,
        );
      used.add(id);
      ids.set(node.path, id);
      modulePaths[id] = node.path;
      return id;
    };
    const modules: DiagramDocument["modules"] = visible.map((node, index) => {
      const relative = scope ? node.path.slice(scope.length + 1) : node.path;
      const qualifier = relative.includes("/") ? relative.slice(0, relative.lastIndexOf("/")) : "";
      sourceMap.set(`/modules/${index}`, node.range);
      return {
        id: idFor(node),
        kind: node.kind === "assembly" ? "module" : node.kind,
        label: qualifier ? `${node.label} [${qualifier}]` : node.label,
        ports: node.ports.map((p) => ({ ...p })),
      };
    });
    const endpoint = (value: string) => {
      const dot = value.lastIndexOf(".");
      const id = ids.get(value.slice(0, dot));
      if (!id)
        sourceError(
          "projection",
          `Endpoint '${value}' is outside the selected projection.`,
          program.range,
        );
      return `${id}.${value.slice(dot + 1)}`;
    };
    const connections: DiagramConnection[] = [];
    if (detail === "expanded") {
      for (const link of system.connections.filter(
        (link) =>
          (!scope || link.scope === scope || link.scope.startsWith(`${scope}/`)) &&
          contains(link.from.slice(0, link.from.lastIndexOf("."))) &&
          contains(link.to.slice(0, link.to.lastIndexOf("."))),
      )) {
        const index = connections.length;
        sourceMap.set(`/connections/${index}`, link.range);
        connections.push({
          from: endpoint(link.from),
          to: endpoint(link.to),
          kind: link.kind,
          ...(link.bus === undefined ? {} : { bus: link.bus }),
          ...(link.label === undefined ? {} : { label: link.label }),
          ...(link.direction === undefined ? {} : { direction: link.direction }),
        });
      }
    } else {
      for (const link of body.connections) {
        const prefix = scope ? `${scope}/` : "";
        const index = connections.length;
        sourceMap.set(`/connections/${index}`, link.range);
        connections.push({
          from: endpoint(`${prefix}${link.from.module}.${link.from.port}`),
          to: endpoint(`${prefix}${link.to.module}.${link.to.port}`),
          kind: link.kind,
          ...(link.bus === undefined ? {} : { bus: link.bus }),
          ...(link.label === undefined ? {} : { label: link.label }),
          ...(link.direction === undefined ? {} : { direction: link.direction }),
        });
      }
    }
    const boundaryPorts: SourceSelection["boundaryPorts"] = [];
    if (assembly && definition) {
      let boundaryId = `b_${token(scope)}`;
      while (used.has(boundaryId)) boundaryId = `b_${token(boundaryId)}`;
      modules.push({
        id: boundaryId,
        kind: "module",
        label: "External interface (not hardware)",
        ports: assembly.ports.map((p) => ({ ...p })),
      });
      modulePaths[boundaryId] = `${scope}/@boundary`;
      for (const exposure of definition.exposures) {
        const alias = system.aliases.find((a) => a.from === `${scope}.${exposure.port}`);
        if (!alias)
          sourceError("exposure", "Public interface alias was not resolved.", exposure.range);
        const actual =
          detail === "expanded"
            ? alias.to
            : `${scope}/${exposure.target.module}.${exposure.target.port}`;
        boundaryPorts.push({ port: exposure.port, endpoint: alias.to });
        const kinds = [
          ...new Set(
            system.connections
              .filter((link) => link.from === alias.to || link.to === alias.to)
              .map((link) => link.kind),
          ),
        ];
        sourceMap.set(`/connections/${connections.length}`, exposure.range);
        connections.push({
          from: `${boundaryId}.${exposure.port}`,
          to: endpoint(actual),
          kind: kinds.length === 1 ? (kinds[0] ?? "signal") : "signal",
        });
      }
    }
    const document: DiagramDocument = {
      schema: "circuitkit.diagram.v1",
      id: scope ? `s_${token(`${program.id}/${scope}`)}` : program.id,
      title: `${scope ? `${program.title} / ${scope}` : program.title}${detail === "interface" ? " / interfaces" : ""}`,
      view: program.view,
      theme: program.theme,
      modules,
      connections,
    };
    const checked = validateDiagram(document);
    if (!checked.ok)
      return {
        ok: false,
        diagnostics: checked.diagnostics.map((diagnostic) => {
          let key = diagnostic.path;
          while (!sourceMap.has(key) && key) key = key.slice(0, key.lastIndexOf("/"));
          return {
            ...diagnostic,
            range: sourceMap.get(key) ?? program.range,
            message: `${diagnostic.message} This is a per-view constraint; select a smaller --scope or --detail interface when needed.`,
          };
        }),
      };
    return {
      ok: true,
      document: checked.document,
      selection: {
        scope,
        detail,
        modulePaths,
        boundaryPorts,
        limits: "per-projection",
        omittedInternalConnections:
          detail === "interface"
            ? system.connections.filter(
                (link) => link.scope !== scope && (!scope || link.scope.startsWith(`${scope}/`)),
              ).length
            : 0,
      },
      sourceMap,
      diagnostics: [],
    };
  } catch (error) {
    return sourceFailure(error);
  }
}
