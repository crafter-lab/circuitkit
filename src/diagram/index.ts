import { z } from "zod";
import type { Failure } from "../types.ts";
import {
  type Bounds,
  type PublicTarget,
  publicLayout,
  renderEducationalSVG,
} from "../v2/render.ts";
import { type PublicFigure, publicSchema, themeSchema } from "../v2/schema.ts";
import { layoutDiagram } from "./layout.ts";
import { diagramFailure, plainJSON, pointer, reject } from "./safety.ts";
import {
  type NormalizedDiagramDocument as DiagramDocument,
  type DiagramView,
  diagramViewSchema,
  type Theme,
  validateDiagram,
} from "./schema.ts";
import { type DiagramSemantics, semanticModel } from "./semantics.ts";

export type {
  ConnectionKind,
  DiagramConnection,
  DiagramDocument,
  DiagramModule,
  DiagramPort,
  DiagramView,
  ModuleKind,
  NormalizedDiagramDocument,
  Theme,
} from "./schema.ts";
export {
  diagramJSONSchema,
  diagramLimits,
  diagramSchema,
  isDiagramDocument,
  validateDiagram,
} from "./schema.ts";
export type { DiagramNet, DiagramSemantics } from "./semantics.ts";

export type DiagramOptions = { view?: DiagramView; theme?: Theme };
export type DiagramClassification = {
  kind: "module-diagram";
  view: DiagramView;
  connectivity: "declared";
};
export type DiagramRoute = {
  target: string;
  from: string;
  to: string;
  points: { x: number; y: number }[];
};
export type CompiledDiagram = {
  ok: true;
  document: DiagramDocument;
  figure: PublicFigure;
  semantics: DiagramSemantics;
  routes: DiagramRoute[];
  classification: DiagramClassification;
  diagnostics: [];
};
export type RenderedDiagram = CompiledDiagram & {
  svg: string;
  bounds: Bounds;
  targets: PublicTarget[];
};

const optionsSchema = z.strictObject({
  view: diagramViewSchema.optional(),
  theme: themeSchema.optional(),
});

export function compileDiagram(
  input: unknown,
  options?: DiagramOptions,
): CompiledDiagram | Failure {
  const validated = validateDiagram(input);
  if (!validated.ok) return validated;
  try {
    let supplied: unknown;
    try {
      supplied = options === undefined ? {} : plainJSON(options);
    } catch (error) {
      const failure = diagramFailure(error);
      return {
        ...failure,
        diagnostics: failure.diagnostics.map((diagnostic) => ({
          ...diagnostic,
          path: `/options${diagnostic.path}`,
        })),
      };
    }
    const parsed = optionsSchema.safeParse(supplied);
    if (!parsed.success)
      return {
        ok: false,
        diagnostics: parsed.error.issues.flatMap((issue) =>
          (issue.code === "unrecognized_keys"
            ? issue.keys.map((key) => [...issue.path, key])
            : [issue.path]
          ).map((path) => ({
            code: "diagram.options",
            path: `/options${pointer(path)}`,
            message: issue.message,
          })),
        ),
      };
    const document = validated.document;
    const view = parsed.data.view ?? document.view;
    const theme = parsed.data.theme ?? document.theme;
    const model = semanticModel(document);
    const routes: DiagramRoute[] = [];
    const figure = publicSchema.parse(
      layoutDiagram(model, view, theme, (edge, points) =>
        routes.push({ target: edge.id, from: edge.from, to: edge.to, points }),
      ),
    );
    publicLayout(figure);
    return {
      ok: true,
      document,
      figure,
      semantics: { nets: model.nets },
      routes,
      classification: { kind: "module-diagram", view, connectivity: "declared" },
      diagnostics: [],
    };
  } catch (error) {
    return diagramFailure(error);
  }
}

export function renderDiagramSVG(
  input: unknown,
  options?: DiagramOptions,
): RenderedDiagram | Failure {
  const compiled = compileDiagram(input, options);
  if (!compiled.ok) return compiled;
  try {
    const rendered = renderEducationalSVG(compiled.figure, {
      namespace: `${compiled.document.id}-${compiled.classification.view}`,
    });
    if (!rendered.ok)
      reject("diagram.render", "", "The generated public figure exceeded a renderer safety limit.");
    return { ...compiled, svg: rendered.svg, bounds: rendered.bounds, targets: rendered.targets };
  } catch (error) {
    return diagramFailure(error);
  }
}
