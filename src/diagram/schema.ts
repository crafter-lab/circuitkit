import { z } from "zod";
import type { Diagnostic, Failure } from "../types.ts";
import { measureMath } from "../v2/math-text.ts";
import { themeSchema } from "../v2/schema.ts";
import { diagnosticFrom, plainJSON, pointer } from "./safety.ts";

export const diagramLimits = Object.freeze({
  modules: 16,
  portsPerModule: 16,
  ports: 64,
  connections: 32,
});
export const diagramViewSchema = z.enum(["blocks", "wiring", "schematic"]);
export type DiagramView = z.infer<typeof diagramViewSchema>;
export type Theme = z.infer<typeof themeSchema>;
export type ConnectionKind = "signal" | "power" | "ground" | "audio";
export type DiagramPort = { id: string; label: string };
export const moduleKindSchema = z.enum([
  "module",
  "source",
  "connector",
  "controller",
  "sensor",
  "display",
  "amplifier",
  "speaker",
  "load",
]);
export type ModuleKind = z.infer<typeof moduleKindSchema>;
export type DiagramModule = { id: string; label: string; kind: ModuleKind; ports: DiagramPort[] };
export type DiagramConnection = {
  from: string;
  to: string;
  kind: ConnectionKind;
  bus?: string;
  label?: string;
  direction?: "none" | "forward" | "both";
};
export type NormalizedDiagramDocument = {
  schema: "circuitkit.diagram.v1";
  id: string;
  title: string;
  view: DiagramView;
  theme: Theme;
  modules: DiagramModule[];
  connections: DiagramConnection[];
};

const safeId = z.string().regex(/^[A-Za-z][A-Za-z0-9_-]{0,47}$/);
const portId = z
  .string()
  .regex(/^[A-Za-z0-9_+−/-]{1,32}$/)
  .describe(
    "1–32 ASCII letters, digits, underscore, plus, hyphen, slash or Unicode minus (U+2212). No spaces, dots or controls. Case-sensitive, with no Unicode normalization.",
  );
const text = (maximum: number) =>
  z
    .string()
    .min(1)
    .max(maximum)
    .regex(
      /^(?!\s*$)(?!.*[\u00AD\u0600-\u0605\u061C\u06DD\u070F\u0890-\u0891\u08E2\u180E\u200B-\u200F\u2028-\u202E\u2060-\u206F\uFEFF\uFFF9-\uFFFD])[\u0020-\u007E\u00A0-\uD7FF\uE000-\uFFFD]+$/,
      "Use visible text without controls, formatting controls, lone surrogates or XML noncharacters.",
    );
const endpoint = z
  .string()
  .max(81)
  .regex(/^[A-Za-z][A-Za-z0-9_-]{0,47}\.[A-Za-z0-9_+−/-]{1,32}$/);
const authoredSchema = z
  .strictObject({
    schema: z.literal("circuitkit.diagram.v1"),
    id: safeId,
    title: text(120),
    view: diagramViewSchema.default("wiring"),
    theme: themeSchema.default("geist-light"),
    modules: z
      .array(
        z.strictObject({
          id: safeId,
          label: text(64).optional(),
          kind: moduleKindSchema.default("module"),
          ports: z
            .array(z.union([portId, z.strictObject({ id: portId, label: text(32).optional() })]))
            .max(diagramLimits.portsPerModule),
        }),
      )
      .min(1)
      .max(diagramLimits.modules),
    connections: z
      .array(
        z.strictObject({
          from: endpoint,
          to: endpoint,
          kind: z.enum(["signal", "power", "ground", "audio"]).default("signal"),
          bus: text(32).optional(),
          label: text(48).optional(),
          direction: z.enum(["none", "forward", "both"]).optional(),
        }),
      )
      .max(diagramLimits.connections),
  })
  .describe(
    "Coordinate-free module diagram. All objects reject unknown keys. Runtime also checks unique identities and undirected edges, existing endpoints, distinct endpoints, at most 64 total ports, bounded plain JSON and renderable pinned-font text. Bus strings are annotations, never connectivity. Views are presentation, not electrical verification.",
  );

export const diagramJSONSchema = z.toJSONSchema(authoredSchema, { io: "input" });
export type DiagramDocument = z.input<typeof authoredSchema>;
type Authored = z.output<typeof authoredSchema>;

function graphDiagnostics(document: Authored): Diagnostic[] {
  const diagnostics: Diagnostic[] = [];
  const add = (code: string, path: string, message: string, validPins?: string[]) =>
    diagnostics.push({ code, path, message, ...(validPins ? { validPins } : {}) });
  const modules = new Map<string, string[]>();
  const pins = new Set<string>();
  let count = 0;
  const glyph = (value: string, path: string) => {
    try {
      measureMath([{ text: value, script: "base" }]);
    } catch {
      add("diagram.text", path, "Use visible characters supported by the renderer's pinned font.");
    }
  };
  glyph(document.title, "/title");
  document.modules.forEach((module, i) => {
    const path = `/modules/${i}`;
    if (modules.has(module.id))
      add("diagram.duplicate", `${path}/id`, `Module ID '${module.id}' is already declared.`);
    const local = new Set<string>();
    glyph(module.label ?? module.id, `${path}/label`);
    module.ports.forEach((port, j) => {
      const id = typeof port === "string" ? port : port.id;
      const portPath = `${path}/ports/${j}`;
      if (local.has(id))
        add(
          "diagram.duplicate",
          typeof port === "string" ? portPath : `${portPath}/id`,
          `Port '${id}' is already declared on '${module.id}'.`,
        );
      local.add(id);
      pins.add(`${module.id}.${id}`);
      glyph(
        typeof port === "string" ? port : (port.label ?? port.id),
        typeof port === "string" ? portPath : `${portPath}/label`,
      );
      count++;
    });
    modules.set(module.id, [...local].map((id) => `${module.id}.${id}`).sort());
  });
  if (count > diagramLimits.ports)
    add("diagram.budget", "/modules", "Use at most 64 total ports across all modules.");
  const edges = new Set<string>();
  document.connections.forEach((connection, i) => {
    const path = `/connections/${i}`;
    for (const end of ["from", "to"] as const) {
      const reference = connection[end];
      if (!pins.has(reference)) {
        const moduleId = reference.split(".")[0] ?? "";
        const validPins = modules.get(moduleId) ?? [...pins].sort();
        add(
          "diagram.reference",
          `${path}/${end}`,
          `Unknown endpoint '${reference}'. ${modules.has(moduleId) ? `Choose a declared port on '${moduleId}'.` : `Declare module '${moduleId}' or choose a declared endpoint.`}`,
          validPins,
        );
      }
    }
    if (connection.from === connection.to)
      add(
        "diagram.self-endpoint",
        `${path}/to`,
        "Connect two distinct endpoints; connections within a module are allowed.",
      );
    const key = JSON.stringify([connection.from, connection.to].sort());
    if (edges.has(key))
      add(
        "diagram.duplicate",
        path,
        "This undirected endpoint pair is already connected, regardless of kind, label or bus.",
      );
    edges.add(key);
    if (connection.bus) glyph(connection.bus, `${path}/bus`);
    if (connection.label) glyph(connection.label, `${path}/label`);
  });
  return diagnostics;
}

const checkedSchema = authoredSchema
  .superRefine((document, context) => {
    for (const diagnostic of graphDiagnostics(document)) {
      context.addIssue({
        code: "custom",
        message: diagnostic.message,
        path: diagnostic.path
          .split("/")
          .slice(1)
          .map((key) => key.replaceAll("~1", "/").replaceAll("~0", "~")),
        params: { diagnostic },
      });
    }
  })
  .transform(
    (document): NormalizedDiagramDocument => ({
      ...document,
      modules: document.modules.map((module) => ({
        ...module,
        label: module.label ?? module.id,
        ports: module.ports.map((port) =>
          typeof port === "string"
            ? { id: port, label: port }
            : { id: port.id, label: port.label ?? port.id },
        ),
      })),
    }),
  );

export const diagramSchema = z.preprocess((input, context) => {
  try {
    return plainJSON(input);
  } catch (error) {
    const diagnostic: Diagnostic = diagnosticFrom(error) ?? {
      code: "diagram.json",
      path: "",
      message: "Unable to inspect plain JSON input safely.",
    };
    context.addIssue({ code: "custom", message: diagnostic.message, params: { diagnostic } });
    return z.NEVER;
  }
}, checkedSchema);

export function validateDiagram(
  input: unknown,
): { ok: true; document: NormalizedDiagramDocument; diagnostics: [] } | Failure {
  const parsed = diagramSchema.safeParse(input);
  if (parsed.success) return { ok: true, document: parsed.data, diagnostics: [] };
  return {
    ok: false,
    diagnostics: parsed.error.issues.flatMap((issue): Diagnostic[] => {
      if (issue.code === "custom" && issue.params?.diagnostic)
        return [issue.params.diagnostic as Diagnostic];
      if (issue.code === "unrecognized_keys")
        return issue.keys.map((key) => ({
          code: "diagram.field",
          path: pointer([...issue.path, key]),
          message: `Unknown field '${key}'. Author modules and connections only; coordinates, layout and shapes are not accepted.`,
        }));
      return [{ code: "diagram.schema", path: pointer(issue.path), message: issue.message }];
    }),
  };
}

export function isDiagramDocument(input: unknown): boolean {
  return validateDiagram(input).ok;
}
