import { renderEducationalSVG, validateEducational } from "../../src/v2/render.ts";
import type { PublicFigure } from "../../src/v2/schema.ts";

export const maxUploadBytes = 256 * 1024;
export function parsePublicDraft(source: string): PublicFigure | null {
  if (new TextEncoder().encode(source).byteLength > maxUploadBytes) return null;
  try {
    const result = renderEducationalSVG(JSON.parse(source));
    return result.ok ? result.document : null;
  } catch {
    return null;
  }
}
export function retainSelection(
  previous: PublicFigure | null,
  next: PublicFigure | null,
  selected: readonly string[],
): string[] {
  if (!previous || !next || previous.id !== next.id) return [];
  const wanted = new Set(selected);
  return next.targets.filter((target) => wanted.has(target.id)).map((target) => target.id);
}
export function publicExport(document: unknown, format: "json" | "svg") {
  const validated = validateEducational(document);
  if (!validated.ok) return null;
  const rendered = renderEducationalSVG(validated.document, { namespace: "CircuitFigure" });
  if (!rendered.ok) return null;
  return {
    text: format === "json" ? JSON.stringify(validated.document, null, 2) : rendered.svg,
    bounds: rendered.bounds,
  };
}
