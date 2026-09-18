import { renderFigureSVG } from "./figure-svg.ts";
import { renderSchematicSVG, renderSVG } from "./renderer.ts";
import type { Failure, FigureInfo } from "./types.ts";

export interface PNGOptions {
  figure?: boolean;
  schematic?: boolean;
  scale?: number;
}

export type PNGResult =
  | (FigureInfo & {
      png: Uint8Array;
      format: "png";
      width: number;
      height: number;
      scale: number;
    })
  | Failure;

function failure(code: string, path: string, message: string): Failure {
  return { ok: false, diagnostics: [{ code: `png.${code}`, path, message }] };
}

export async function renderPNG(input: unknown, options: PNGOptions = {}): Promise<PNGResult> {
  if (
    options === null ||
    typeof options !== "object" ||
    Array.isArray(options) ||
    Reflect.ownKeys(options).some(
      (key) => key !== "figure" && key !== "schematic" && key !== "scale",
    ) ||
    (options.figure !== undefined && typeof options.figure !== "boolean") ||
    (options.schematic !== undefined && typeof options.schematic !== "boolean") ||
    (options.figure === true && options.schematic === true)
  )
    return failure(
      "invalid_options",
      "/options",
      "Expected only figure and schematic (mutually exclusive booleans), and scale (integer 1 through 4).",
    );
  const scale = options.scale === undefined ? 1 : options.scale;
  if (!Number.isInteger(scale) || scale < 1 || scale > 4)
    return failure(
      "invalid_scale",
      "/options/scale",
      "PNG scale must be an integer from 1 through 4.",
    );
  const result = options.schematic
    ? renderSchematicSVG(input)
    : options.figure
      ? renderFigureSVG(input)
      : renderSVG(input);
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
      "/options/scale",
      "PNG output must have positive finite dimensions and at most 16,000,000 pixels. Reduce scale or figure content.",
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
      return failure(
        "render_failed",
        "",
        "Raster dimensions did not match the checked figure bounds.",
      );
    return { ...info, png: image.asPng(), format: "png", width, height, scale };
  } catch {
    return failure(
      "render_failed",
      "",
      "PNG rendering failed. Ensure the platform-specific @resvg/resvg-js native binding is available in Node or Bun.",
    );
  }
}
