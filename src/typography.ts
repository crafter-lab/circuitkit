import data from "./font-data.json";
import type { Box } from "./types.ts";

export type Family = "sans" | "mono";
interface Glyph {
  path: string;
  advance: number;
  box: number[];
}
interface Font {
  glyphs: Record<string, Glyph>;
  kerning: Record<string, number>;
}
const fonts: Record<Family, Font> = data;
export const number = (value: number) => String(Number(value.toPrecision(15)));
export const escapeXML = (text: string) =>
  text
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&apos;");

export function textPath(
  text: string,
  family: Family,
  size: number,
  x: number,
  y: number,
  align: "left" | "center" | "right" = "left",
) {
  const font = fonts[family];
  const scale = size / 1000;
  const missing: string[] = [];
  const placements: { glyph: Glyph; offset: number }[] = [];
  let advance = 0;
  let previous = "";
  for (const character of text) {
    const code = String(character.codePointAt(0));
    const glyph = font.glyphs[code];
    if (!glyph) {
      missing.push(character);
      continue;
    }
    advance += (font.kerning[`${previous},${code}`] ?? 0) * scale;
    placements.push({ glyph, offset: advance });
    advance += glyph.advance * scale;
    previous = code;
  }
  const start = x - (align === "center" ? advance / 2 : align === "right" ? advance : 0);
  let x1 = Infinity;
  let y1 = Infinity;
  let x2 = -Infinity;
  let y2 = -Infinity;
  const paths: string[] = [];
  for (const { glyph, offset } of placements) {
    if (!glyph.path) continue;
    x1 = Math.min(x1, start + offset + (glyph.box[0] ?? 0) * scale);
    y1 = Math.min(y1, y + (glyph.box[1] ?? 0) * scale);
    x2 = Math.max(x2, start + offset + (glyph.box[2] ?? 0) * scale);
    y2 = Math.max(y2, y + (glyph.box[3] ?? 0) * scale);
    paths.push(
      `<path d="${glyph.path}" transform="translate(${number(start + offset)} ${number(y)}) scale(${number(scale)})"/>`,
    );
  }
  const box: Box =
    x1 === Infinity
      ? { x: start, y, width: 0, height: 0 }
      : { x: x1, y: y1, width: x2 - x1, height: y2 - y1 };
  return { svg: paths.join(""), box, advance, missing: [...new Set(missing)] };
}
