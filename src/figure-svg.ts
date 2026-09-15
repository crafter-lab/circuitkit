import { layoutAnnotationFigure } from "./annotations.ts";
import { renderSVG } from "./renderer.ts";
import { resolveTheme } from "./theme.ts";
import type { RenderResult } from "./types.ts";
import { number } from "./typography.ts";

export function renderFigureSVG(input: unknown): RenderResult {
  const result = renderSVG(input);
  if (!result.ok || !result.annotations) return result;
  const { theme } = resolveTheme(result.document);
  const composition = layoutAnnotationFigure(
    result.annotations,
    theme,
    result.bounds.width,
    result.bounds.height,
  );
  if (composition.diagnostics.length) return { ok: false, diagnostics: composition.diagnostics };
  if (!composition.svg) return result;
  const width = number(result.bounds.width);
  const originalHeight = number(result.bounds.height);
  const height = number(composition.height);
  const svg = result.svg
    .replace(
      `viewBox="0 0 ${width} ${originalHeight}" width="${width}" height="${originalHeight}"`,
      `viewBox="0 0 ${width} ${height}" width="${width}" height="${height}"`,
    )
    .replace(
      /<\/g><\/svg>$/,
      `<path d="M0 ${originalHeight}H${width}V${height}H0Z" fill="${theme.background}"/>${composition.svg}</g></svg>`,
    );
  return {
    ...result,
    svg,
    bounds: {
      ...result.bounds,
      height: composition.height,
      labels: { ...result.bounds.labels, ...composition.labels },
    },
  };
}
