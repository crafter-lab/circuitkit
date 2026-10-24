import { renderBreadboardSVG } from "./index.ts";

export async function renderBreadboardPNG(input: unknown, scale = 1) {
  const rendered = renderBreadboardSVG(input);
  if (!rendered.ok) return rendered;
  if (!Number.isInteger(scale) || scale < 1 || scale > 4)
    return {
      ok: false as const,
      diagnostics: [
        {
          code: "png.invalid_scale",
          path: "/scale",
          message: "PNG scale must be an integer from 1 through 4.",
        },
      ],
    };
  const width = rendered.bounds.width * scale;
  const height = rendered.bounds.height * scale;
  if (width * height > 16_000_000)
    return {
      ok: false as const,
      diagnostics: [
        {
          code: "png.pixel_limit",
          path: "/scale",
          message: "PNG output must have at most 16,000,000 pixels.",
        },
      ],
    };
  const raster = rendered.svg.replace(/^<svg\b[^>]*>/, (root) =>
    root
      .replace(/\bwidth="[^"]*"/, `width="${width}"`)
      .replace(/\bheight="[^"]*"/, `height="${height}"`),
  );
  try {
    const { Resvg } = await import("@resvg/resvg-js");
    const image = new Resvg(raster, {
      font: { loadSystemFonts: false, fontFiles: [], fontDirs: [] },
      logLevel: "off",
    }).render();
    const { svg: _svg, ...info } = rendered;
    return { ...info, png: image.asPng(), format: "png" as const, width, height, scale };
  } catch {
    return {
      ok: false as const,
      diagnostics: [
        { code: "png.render_failed", path: "/input", message: "PNG rendering failed." },
      ],
    };
  }
}
