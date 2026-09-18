import type { PublicFigure } from "../src/v2/schema.ts";

export function focusPreview(figure: PublicFigure): PublicFigure {
  const ids = new Set(
    figure.targets.flatMap((target) => (target.role === "net" ? target.members : [target.id])),
  );
  const display = figure.display.filter((part) => ids.has(part.id));
  return display.length ? { ...figure, display } : figure;
}
