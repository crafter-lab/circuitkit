import { createHash } from "node:crypto";
import { mkdir, readdir, readFile, rename, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { Resvg } from "@resvg/resvg-js";
import opentype from "opentype.js";
import sharp from "sharp";

const root = fileURLToPath(new URL("../", import.meta.url));
const out = `${root}public/brand-assets`;
const ink = "#141414";
const paper = "#fafafa";
const source = await readFile(`${root}brand/mark.svg`, "utf8");
const markPath = source.match(/<path[\s\S]*?\/>/)?.[0];
if (!markPath) throw new Error("The approved symbol source is missing its path.");
const font = opentype.parse(await Bun.file(`${root}fonts/Geist-Regular.ttf`).arrayBuffer());
const mono = opentype.parse(await Bun.file(`${root}fonts/GeistMono-Regular.ttf`).arrayBuffer());
const assets: { file: string; width?: number; height?: number; bytes: number; sha256: string }[] =
  [];

await mkdir(out, { recursive: true });

function escapeXML(text: string) {
  return text.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll('"', "&quot;");
}

function text(value: string, x: number, y: number, size: number, color: string, code = false) {
  const path = (code ? mono : font).getPath(value, x, y, size);
  for (const command of path.commands) {
    Object.assign(
      command,
      Object.fromEntries(
        Object.entries(command).map(([key, coordinate]) => [
          key,
          typeof coordinate === "number" ? Number(coordinate.toFixed(2)) : coordinate,
        ]),
      ),
    );
  }
  const d = path.toPathData(2);
  if (/NaN|Infinity/.test(d)) throw new Error(`Invalid glyph coordinates for ${value}`);
  return `<path d="${d}" fill="${color}"/>`;
}

function mark(x: number, y: number, height: number, color: string) {
  return `<g transform="translate(${x} ${y}) scale(${height / 341})">${markPath?.replace('fill="#141414"', `fill="${color}"`)}</g>`;
}

function svg(width: number, height: number, body: string, title: string) {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}"><title>${escapeXML(title)}</title>${body}</svg>\n`;
}

function background(width: number, height: number, color: string) {
  return `<path fill="${color}" d="M0 0H${width}V${height}H0Z"/>`;
}

async function save(file: string, data: string | Uint8Array, width?: number, height?: number) {
  await writeFile(`${out}/${file}`, data);
  assets.push({
    file,
    ...(width === undefined ? {} : { width, height }),
    bytes: Buffer.byteLength(data),
    sha256: createHash("sha256").update(data).digest("hex"),
  });
}

async function render(name: string, width: number, height: number, body: string, webp = false) {
  const vector = svg(width, height, body, `CircuitKit ${name.replaceAll("-", " ")}`);
  const png = new Resvg(vector).render().asPng();
  await save(`${name}.svg`, vector, width, height);
  await save(`${name}.png`, png, width, height);
  if (webp) {
    await save(`${name}.webp`, await sharp(png).webp({ lossless: true }).toBuffer(), width, height);
  }
  return png;
}

function horizontal(color: string) {
  return mark(8, 4, 96, color) + text("CircuitKit", 127, 83, 87, color);
}

function square(size: number, foreground: string, surface: string, maskable = false) {
  const height = size * (maskable ? 0.52 : 0.72);
  return (
    background(size, size, surface) +
    mark((size - (height * 320) / 341) / 2, (size - height) / 2, height, foreground)
  );
}

function social(width: number, height: number, dark: boolean) {
  const fg = dark ? paper : ink;
  const bg = dark ? ink : "#ffffff";
  const muted = dark ? "#a3a3a3" : "#6b6b6b";
  const line = dark ? "#484848" : "#d4d4d4";
  const scale = Math.min(width / 1200, height / 630);
  const x = (width - 1200 * scale) / 2;
  const y = (height - 630 * scale) / 2;
  const content =
    mark(64, 58, 46, fg) +
    text("CircuitKit", 124, 97, 40, fg) +
    text("circuitkit.crafter.ing", 842, 89, 18, muted, true) +
    text("Circuit diagrams", 64, 259, 73, fg) +
    text("for coding agents.", 64, 342, 73, muted) +
    mark(906, 200, 195, fg) +
    `<path d="M82 448H267M285 448H509" stroke="${fg}" stroke-width="2" fill="none"/>
    <circle cx="72" cy="448" r="9" fill="${bg}" stroke="${fg}" stroke-width="2"/>
    <circle cx="276" cy="448" r="9" fill="${bg}" stroke="${fg}" stroke-width="2"/>
    <circle cx="519" cy="448" r="9" fill="${bg}" stroke="${fg}" stroke-width="2"/>` +
    text("circuit.ck", 65, 491, 18, fg, true) +
    text("SVG + PNG", 430, 491, 18, fg, true) +
    `<path d="M64 546H1136" stroke="${line}" fill="none"/>` +
    text("Blocks  /  Wiring  /  Schematics", 64, 590, 18, muted) +
    text("Open source · By Crafter Lab", 890, 590, 16, muted);
  return `${background(width, height, bg)}<g transform="translate(${x} ${y}) scale(${scale})">${content}</g>`;
}

for (const [theme, color] of [
  ["light", ink],
  ["dark", paper],
] as const) {
  await render(`mark-${theme}`, 320, 341, mark(0, 0, 341, color));
  await render(`logo-horizontal-${theme}`, 520, 104, horizontal(color));
  const wordWidth = font.getAdvanceWidth("CircuitKit", 94);
  await render(
    `logo-stacked-${theme}`,
    640,
    560,
    mark(176, 42, 306, color) + text("CircuitKit", (640 - wordWidth) / 2, 485, 94, color),
  );
  await render(`wordmark-${theme}`, 420, 110, text("CircuitKit", 5, 87, 94, color));
  await render(
    `avatar-${theme}`,
    1024,
    1024,
    square(1024, color, theme === "light" ? "#ffffff" : ink),
  );
  await render(`og-${theme}`, 1200, 630, social(1200, 630, theme === "dark"), true);
}

await render("github-social", 1280, 640, social(1280, 640, true), true);
await render(
  "social-square",
  1080,
  1080,
  background(1080, 1080, ink) +
    mark(414, 115, 270, paper) +
    text("CircuitKit", 315, 523, 112, paper) +
    text("Circuit diagrams", 135, 714, 102, paper) +
    text("for coding agents.", 118, 830, 102, "#a3a3a3") +
    text("circuitkit.crafter.ing", 345, 986, 25, "#a3a3a3", true),
  true,
);
await render(
  "social-banner",
  1500,
  500,
  background(1500, 500, ink) +
    mark(155, 78, 249, paper) +
    text("Circuit diagrams", 487, 188, 83, paper) +
    text("for coding agents.", 487, 283, 83, "#a3a3a3") +
    text("CircuitKit", 491, 386, 33, paper) +
    text("circuitkit.crafter.ing", 984, 382, 21, "#a3a3a3", true),
  true,
);
await render(
  "readme-banner",
  1600,
  480,
  background(1600, 480, "#ffffff") +
    mark(99, 97, 280, ink) +
    text("CircuitKit", 435, 213, 124, ink) +
    text("Circuit diagrams for coding agents.", 442, 302, 48, "#6b6b6b") +
    text("Blocks  /  Wiring  /  Schematics", 444, 371, 23, "#6b6b6b", true),
  true,
);

const icoImages: { size: number; data: Uint8Array }[] = [];
for (const size of [16, 32, 48, 64, 192, 512]) {
  const icon = new Resvg(svg(size, size, square(size, paper, ink), "CircuitKit icon"))
    .render()
    .asPng();
  const name = size < 192 ? `favicon-${size}` : `icon-${size}`;
  await save(`${name}.png`, icon, size, size);
  if (size <= 48) icoImages.push({ size, data: icon });
}
for (const size of [192, 512]) {
  const icon = new Resvg(
    svg(size, size, square(size, paper, ink, true), "CircuitKit maskable icon"),
  )
    .render()
    .asPng();
  await save(`icon-maskable-${size}.png`, icon, size, size);
}
const apple = new Resvg(svg(180, 180, square(180, paper, ink), "CircuitKit Apple touch icon"))
  .render()
  .asPng();
await save("apple-touch-icon.png", apple, 180, 180);
await save("favicon.svg", svg(64, 64, square(64, paper, ink), "CircuitKit"));

const header = Buffer.alloc(6 + icoImages.length * 16);
header.writeUInt16LE(1, 2);
header.writeUInt16LE(icoImages.length, 4);
let offset = header.length;
icoImages.forEach(({ size, data }, index) => {
  const entry = 6 + index * 16;
  header[entry] = size;
  header[entry + 1] = size;
  header.writeUInt16LE(1, entry + 4);
  header.writeUInt16LE(32, entry + 6);
  header.writeUInt32LE(data.length, entry + 8);
  header.writeUInt32LE(offset, entry + 12);
  offset += data.length;
});
await save("favicon.ico", Buffer.concat([header, ...icoImages.map(({ data }) => data)]));

await save(
  "site.webmanifest",
  `${JSON.stringify(
    {
      name: "CircuitKit",
      short_name: "CircuitKit",
      description: "Circuit diagrams for coding agents.",
      id: "/",
      start_url: "/",
      scope: "/",
      display: "browser",
      background_color: "#ffffff",
      theme_color: ink,
      icons: [
        ...[192, 512].map((size) => ({
          src: `/brand-assets/icon-${size}.png`,
          sizes: `${size}x${size}`,
          type: "image/png",
          purpose: "any",
        })),
        ...[192, 512].map((size) => ({
          src: `/brand-assets/icon-maskable-${size}.png`,
          sizes: `${size}x${size}`,
          type: "image/png",
          purpose: "maskable",
        })),
      ],
    },
    null,
    2,
  )}\n`,
);
await save("Geist-Regular.ttf", await readFile(`${root}fonts/Geist-Regular.ttf`));
await save("GeistMono-Regular.ttf", await readFile(`${root}fonts/GeistMono-Regular.ttf`));
await save("OFL.txt", await readFile(`${root}fonts/OFL.txt`));
await save(
  "README.txt",
  "CircuitKit brand kit\n\nLight variants contain dark ink for light surfaces. Dark variants contain light ink for dark surfaces.\nOpen index.html for previews and usage guidelines. Icons with maskable in their name include extra safe space for operating-system crops.\nAll logos are supplied as outlined SVG and transparent PNG. Social compositions also include WebP. Typeface files are Geist Sans and Geist Mono, licensed under OFL.txt.\n\nSource repository: https://github.com/crafter-lab/circuitkit\n",
);
await writeFile(`${root}public/favicon.ico`, await readFile(`${out}/favicon.ico`));
await writeFile(
  `${out}/assets.json`,
  `${JSON.stringify(
    {
      version: 1,
      name: "CircuitKit",
      palette: { ink, paper, white: "#ffffff", muted: "#6b6b6b" },
      typography: ["Geist Sans", "Geist Mono"],
      source: "brand/mark.svg",
      generation: "bun run brand:generate",
      provenance:
        "Approved GPT Image 2 logo, vectorized locally; text outlined with bundled Geist.",
      assets,
    },
    null,
    2,
  )}\n`,
);
console.log(`Generated ${assets.length} assets in ${out}`);
const archiveNames = (await readdir(out)).filter(
  (file) =>
    assets.some((asset) => asset.file === file) ||
    ["assets.json", "index.html", "brand.css"].includes(file),
);
const archiveDirectory = await import("node:os").then(({ tmpdir }) => tmpdir());
const archive = `${archiveDirectory}/circuitkit-brand-kit-${process.pid}.zip`;
const zip = Bun.spawnSync(["zip", "-q", "-X", archive, ...archiveNames.sort()], { cwd: out });
if (zip.exitCode !== 0) throw new Error(`Brand archive failed: ${zip.stderr.toString()}`);
await rename(archive, `${out}/circuitkit-brand-kit.zip`);
console.log(`Packaged ${archiveNames.length} files in circuitkit-brand-kit.zip`);
