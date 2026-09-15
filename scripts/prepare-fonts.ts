import { createHash } from "node:crypto";
import { parse } from "opentype.js";

const characters = [
  ...new Set([
    ...Array.from({ length: 95 }, (_, index) => String.fromCodePoint(index + 32)),
    ...Array.from({ length: 96 }, (_, index) => String.fromCodePoint(index + 160)),
    "Ω",
    "μ",
    "π",
    "→",
    "−",
    "·",
    "×",
  ]),
];
const fonts: Record<string, unknown> = {};
for (const [family, filename] of [
  ["sans", "Geist-Regular.ttf"],
  ["mono", "GeistMono-Regular.ttf"],
]) {
  const bytes = await Bun.file(`fonts/${filename}`).arrayBuffer();
  const font = parse(bytes);
  const glyphs: Record<string, unknown> = {};
  const kerning: Record<string, number> = {};
  for (const character of characters) {
    if (!font.hasChar(character)) continue;
    const glyph = font.charToGlyph(character);
    const path = glyph.getPath(0, 0, 1000);
    const box = path.getBoundingBox();
    glyphs[String(character.codePointAt(0))] = {
      path: path.toPathData(4),
      advance: ((glyph.advanceWidth ?? 0) * 1000) / font.unitsPerEm,
      box: [box.x1, box.y1, box.x2, box.y2],
    };
    for (const next of characters) {
      const value = (font.getKerningValue(glyph, font.charToGlyph(next)) * 1000) / font.unitsPerEm;
      if (value !== 0) kerning[`${character.codePointAt(0)},${next.codePointAt(0)}`] = value;
    }
  }
  fonts[family ?? ""] = {
    filename,
    sha256: createHash("sha256").update(new Uint8Array(bytes)).digest("hex"),
    glyphs,
    kerning,
  };
}
await Bun.write("src/font-data.json", `${JSON.stringify(fonts)}\n`);
console.log("Prepared pinned Geist outlines and metrics.");
