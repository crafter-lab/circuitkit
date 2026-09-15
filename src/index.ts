export { getCatalog, getSchema, loadExample } from "./catalog.ts";
export { renderFigureSVG } from "./figure-svg.ts";
export {
  defineFigure,
  formatSI,
  inspect,
  rendererVersion,
  renderSVG,
  validate,
} from "./renderer.ts";
export type { FigureDocument, RecipeId, SemanticTone, ThemePreset } from "./schema.ts";
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
