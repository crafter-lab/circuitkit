import type { Bounds, PublicTarget } from "./render.ts";
import { renderEducationalSVG } from "./render.ts";
import { boundedJSON, type Failure, type Result } from "./safety.ts";
import type { PublicFigure } from "./schema.ts";

export interface EducationalPNGOptions {
  scale?: number;
}

export type EducationalPNGResult = Result<{
  document: PublicFigure;
  bounds: Bounds;
  targets: PublicTarget[];
  png: Uint8Array;
  format: "png";
  width: number;
  height: number;
  scale: number;
}>;

function failure(code: string, message: string): Failure {
  return { ok: false, diagnostics: [{ code: `png.${code}`, message }] };
}

export async function renderEducationalPNG(
  inputPublic: unknown,
  options?: EducationalPNGOptions,
): Promise<EducationalPNGResult> {
  let scale: number;
  try {
    const supplied = options === undefined ? {} : boundedJSON(options);
    if (
      supplied === null ||
      typeof supplied !== "object" ||
      Array.isArray(supplied) ||
      Object.keys(supplied).some((key) => key !== "scale")
    )
      return failure("invalid_options", "Expected only an optional PNG scale.");
    const value: unknown = Reflect.get(supplied, "scale");
    if (
      value !== undefined &&
      (typeof value !== "number" || !Number.isInteger(value) || value < 1 || value > 4)
    )
      return failure("invalid_scale", "PNG scale must be an integer from 1 through 4.");
    scale = value === undefined ? 1 : (value as number);
  } catch {
    return failure("invalid_options", "Expected only an optional PNG scale.");
  }
  const result = renderEducationalSVG(inputPublic);
  if (!result.ok) return result;
  const width = Math.ceil(result.bounds.width * scale);
  const height = Math.ceil(result.bounds.height * scale);
  if (
    !Number.isSafeInteger(width) ||
    !Number.isSafeInteger(height) ||
    width < 1 ||
    height < 1 ||
    width * height > 16_000_000
  )
    return failure(
      "pixel_limit",
      "PNG output must have positive finite dimensions and at most 16,000,000 pixels.",
    );
  const { svg, ...info } = result;
  const rasterSVG = svg.replace(/^<svg\b[^>]*>/, (root) =>
    root
      .replace(/\bwidth="[^"]*"/, `width="${width}"`)
      .replace(/\bheight="[^"]*"/, `height="${height}"`),
  );
  try {
    const { Resvg } = await import("@resvg/resvg-js");
    const image = new Resvg(rasterSVG, {
      font: { loadSystemFonts: false, fontFiles: [], fontDirs: [] },
      logLevel: "off",
    }).render();
    if (image.width !== width || image.height !== height)
      return failure("render_failed", "Raster dimensions did not match the checked figure bounds.");
    return { ...info, png: image.asPng(), format: "png", width, height, scale };
  } catch {
    return failure(
      "render_failed",
      "PNG rendering failed. Ensure the platform-specific @resvg/resvg-js native binding is available in Node or Bun.",
    );
  }
}
