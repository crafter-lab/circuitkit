export { getCatalog, getSchema, loadExample } from "./catalog.ts";
export { renderFigureSVG } from "./figure-svg.ts";
export {
  defineFigure,
  formatSI,
  inspect,
  rendererVersion,
  renderSchematicSVG,
  renderSVG,
  type SchematicComposition,
  type SchematicOptions,
  type SchematicRenderResult,
  validate,
} from "./renderer.ts";
export type {
  FigureDocument,
  RecipeId,
  SemanticTone,
  TeachingStep,
  ThemePreset,
} from "./schema.ts";
export type {
  Box,
  Diagnostic,
  FigureBounds,
  FigureInfo,
  InspectResult,
  RenderResult,
  ResolvedAnnotations,
  ResolvedNetAnnotation,
  ValidationResult,
} from "./types.ts";
