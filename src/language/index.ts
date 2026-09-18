import {
  type CompiledDiagram,
  compileDiagram,
  type RenderedDiagram,
  renderDiagramSVG,
} from "../diagram/index.ts";
import { moduleKindSchema } from "../diagram/schema.ts";
import type { Diagnostic, Failure } from "../types.ts";
import { projectPresentation } from "./presentation.ts";
import { parseSourceOptions, projectSystem } from "./project.ts";
import { resolveCircuitSource } from "./resolve.ts";
import type { PresentationPlan } from "./types.ts";

export type { PresentationPlan, SourcePresentation } from "./types.ts";

import {
  languageLimits,
  type ResolvedSystem,
  type SourceOptions,
  type SourceRange,
  type SourceSelection,
} from "./types.ts";

export { formatCircuitSource } from "./format.ts";
export { highlightCircuitSource } from "./highlight.ts";
export { isCircuitSource, parseCircuitSource } from "./parser.ts";
export { resolveCircuitSource } from "./resolve.ts";
export type {
  ResolvedSystem,
  SourceConnection,
  SourceDefinition,
  SourceModule,
  SourceOptions,
  SourcePort,
  SourceProgram,
  SourceRange,
  SourceResult,
  SourceSelection,
  SystemConnection,
  SystemNode,
} from "./types.ts";
export { languageLimits } from "./types.ts";
export type CompiledSource = CompiledDiagram & {
  language: "circuitkit.source.v1";
  system: ResolvedSystem;
  selection: SourceSelection;
  presentation?: PresentationPlan;
};
export type RenderedSource = RenderedDiagram & {
  language: "circuitkit.source.v1";
  system: ResolvedSystem;
  selection: SourceSelection;
  presentation?: PresentationPlan;
};
export const languageGrammar = Object.freeze({
  version: 1,
  syntax: "circuitkit.source.v1",
  header: "circuit ID v1",
  moduleKinds: [...moduleKindSchema.options],
  operators: {
    "--": "connection without functional direction",
    "->": "forward functional flow",
    "<->": "bidirectional functional flow",
  },
  statements: [
    'title "text"',
    "view blocks|wiring|schematic",
    "theme geist-light|geist-dark|geist-print",
    'ID: KIND ["label"] (PORT [as "label"] ...)',
    'ID: DEFINITION ["label"]',
    '[power|ground|audio|signal] MODULE.PORT OP MODULE.PORT ["label"]',
    "bus NAME { connections }",
    'presentation {\n  section ID {\n    SELECTORS\n  }\n  scene ID ["label"] {\n    highlight SELECTOR\n    dim others\n    flow bus NAME {\n      style sweep\n      period 2s\n    }\n  }\n}',
    "define NAME (PORTS...) {\n  MODULE_DECLARATIONS\n  CONNECTIONS\n  expose PORT = MODULE.PORT\n}",
  ],
  rules: [
    "Statements end at a newline or block boundary, not semicolons.",
    "Indentation is cosmetic; ports and block bodies may span lines.",
    "Names may be quoted; quoted strings use JSON escapes. Identifiers retain exact case and Unicode.",
    "Ports are declared, never inferred. A bus label does not join its signal nets.",
    "Definitions are document-local, must expose every interface port exactly once, and cannot recurse.",
    "# starts a comment outside a quoted string. Canonical formatting discards comments.",
    "No coordinates, executable expressions, imports or implicit hardware profiles.",
    "scope selects an assembly, detail selects expanded or interface. Boundaries are labelled, not hardware.",
    "JSON input remains supported by the existing APIs; malformed JSON is never interpreted as source.",
    "Presentation selectors: module PATH, port PATH.PORT, bus SCOPED_NAME, link ENDPOINT -- ENDPOINT, section ID (highlights only).",
    "Flow accepts bus/link, style sweep, period 500ms..30s, direction declared|forward|reverse. Default direction requires ->; explicit directions follow the authored connection, not canonical sorting.",
    "Unknown presentation references fail. Omitted targets or aggregated/split routes mark scenes unavailable. Exported SVG/PNG remains the static base diagram.",
  ],
  limits: languageLimits,
  drawingLimits: { modules: 16, ports: 64, connections: 32, pngPixels: 16000000 },
});
function locatedFailure(
  result: Failure,
  sourceMap: Map<string, SourceRange>,
  fallback: SourceRange,
): Failure {
  return {
    ok: false,
    diagnostics: result.diagnostics.map((diagnostic): Diagnostic => {
      let key = diagnostic.path;
      while (key && !sourceMap.has(key)) key = key.slice(0, key.lastIndexOf("/"));
      return { ...diagnostic, range: sourceMap.get(key) ?? fallback };
    }),
  };
}
function prepare(source: string, options?: SourceOptions) {
  const parsedOptions = parseSourceOptions(options);
  if (!parsedOptions.ok) return parsedOptions;
  const resolved = resolveCircuitSource(source);
  if (!resolved.ok) return resolved;
  const projected = projectSystem(resolved.program, resolved.system, parsedOptions.options);
  if (!projected.ok) return projected;
  const renderOptions = {
    ...(parsedOptions.options.view === undefined ? {} : { view: parsedOptions.options.view }),
    ...(parsedOptions.options.theme === undefined ? {} : { theme: parsedOptions.options.theme }),
  };
  return { ok: true as const, resolved, projected, renderOptions };
}
export function compileCircuitSource(
  source: string,
  options?: SourceOptions,
): CompiledSource | Failure {
  const prepared = prepare(source, options);
  if (!prepared.ok) return prepared;
  const { projected, resolved, renderOptions } = prepared;
  const result = compileDiagram(projected.document, renderOptions);
  if (!result.ok) return locatedFailure(result, projected.sourceMap, resolved.program.range);
  return {
    ...result,
    language: "circuitkit.source.v1",
    system: resolved.system,
    selection: projected.selection,
    ...(resolved.presentation
      ? {
          presentation: projectPresentation(
            resolved.presentation,
            resolved.system,
            projected.selection,
            result,
          ),
        }
      : {}),
  };
}
export function renderCircuitSource(
  source: string,
  options?: SourceOptions,
): RenderedSource | Failure {
  const prepared = prepare(source, options);
  if (!prepared.ok) return prepared;
  const { projected, resolved, renderOptions } = prepared;
  const result = renderDiagramSVG(projected.document, renderOptions);
  if (!result.ok) return locatedFailure(result, projected.sourceMap, resolved.program.range);
  return {
    ...result,
    language: "circuitkit.source.v1",
    system: resolved.system,
    selection: projected.selection,
    ...(resolved.presentation
      ? {
          presentation: projectPresentation(
            resolved.presentation,
            resolved.system,
            projected.selection,
            result,
          ),
        }
      : {}),
  };
}
