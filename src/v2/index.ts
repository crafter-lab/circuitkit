import { compileStage, validatePanelIdentity } from "./compiler.ts";
import { parsePublic, publicLayout } from "./render.ts";
import { AuthorError, boundedJSON, failure, type Result } from "./safety.ts";
import {
  type AuthorFigure,
  authorEnvelopeSchema,
  authorSchema,
  type PublicFigure,
  type Stage,
  stageModelSchema,
  stageSchema,
} from "./schema.ts";

export { authorFigure, electricalPanel, placePanel, stageModel } from "./builders.ts";
export { partId } from "./compiler.ts";
export { inspectElectricalNets, netTargetId, type SemanticNet } from "./nets.ts";
export { circle, label, line, part, point, polygon, rect, translateShape } from "./primitives.ts";
export type { Bounds, PublicTarget } from "./render.ts";
export {
  inspectEducational,
  renderEducationalSVG,
  targetDOMId,
  validateEducational,
} from "./render.ts";
export type { Diagnostic, Failure, Result, Success } from "./safety.ts";
export type {
  AuthorFigure,
  Component,
  ElectricalPanel,
  MathRun,
  MeasurementPanel,
  NetTarget,
  Panel,
  Part,
  Point,
  PublicFigure,
  PublicTargetDefinition,
  Reading,
  Shape,
  SignalPanel,
  Stage,
  StageModel,
  Target,
  Theme,
  Unit,
  Value,
} from "./schema.ts";
export { debounceEvents, signalEvents, signalTimeId } from "./signals.ts";
export { authored, known, math, resolveReading, symbolic, unknown, valueRuns } from "./values.ts";

export function projectFigure(author: unknown, stage: Stage): Result<{ document: PublicFigure }> {
  try {
    const selected = stageSchema.parse(stage);
    const parsed = authorEnvelopeSchema.parse(boundedJSON(author));
    const model = stageModelSchema.parse(parsed.stages[selected]);
    const document = parsePublic(compileStage(parsed.id, model));
    publicLayout(document);
    return { ok: true, document, diagnostics: [] };
  } catch {
    return failure();
  }
}

export function validateAuthorFigure(input: unknown): Result<Record<never, never>> {
  try {
    const author = authorSchema.parse(boundedJSON(input));
    validatePanelIdentity(Object.values(author.stages));
    for (const model of Object.values(author.stages))
      publicLayout(parsePublic(compileStage(author.id, model, true)));
    return { ok: true, diagnostics: [] };
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

export function defineAuthorFigure(author: AuthorFigure): AuthorFigure {
  const result = validateAuthorFigure(author);
  if (!result.ok) throw new Error("Invalid educational author model.");
  return authorSchema.parse(boundedJSON(author));
}
