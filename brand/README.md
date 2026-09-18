# CircuitKit identity

The symbol is a capital C drawn as a connection with two open terminal rings. Hunter approved the original concept on September 18, 2026. `mark.svg` is a local vector trace of that raster, preserving its silhouette. It is the editable source for the brand kit.

The original was generated with GPT Image 2 through Vercel AI Gateway. Its prompt and untouched image remain in `output/imagegen/circuitkit-logo-v1/`. The trace used VTracer 0.6.12 in binary spline mode on the symbol region, with threshold 128, speckle filter 8, corner threshold 60, length threshold 4 and path precision 2.

## Generate

```sh
bun install
bun run brand:generate
```

The generator uses the checked-in vector and Geist font files. Resvg renders SVG to PNG; Sharp writes lossless WebP. The ICO contains actual 16, 32 and 48 px images. The local `zip` command packages the downloadable archive. No API credential or paid image call is needed to rebuild.

Generated files are in `public/brand-assets/`. `assets.json` records dimensions and hashes. The generator also writes the conventional `/favicon.ico`. The static guide and stylesheet in that directory are edited directly.

## Usage

- Prefer the horizontal signature for headers and the stacked signature for centered compositions.
- Use the standalone C for browser tabs, avatars and app icons.
- `light` assets contain dark ink for light surfaces. `dark` assets contain light ink for dark surfaces.
- Keep at least one terminal diameter of empty space around the mark. Do not stretch, rotate, add glow or redraw the connections.
- The minimum recommended standalone mark height is 24 px. Browser favicons have dedicated smaller exports. Use the wordmark at a minimum height of 20 px.
- Use Geist Sans for prose and headlines. Reserve Geist Mono for filenames, source code and compact technical labels.
- Primary colors: ink `#141414`, white `#ffffff`, paper `#fafafa`, secondary gray `#6b6b6b`. In dark compositions, secondary text uses `#a3a3a3`.

Logotype lettering is outlined from the bundled Geist Sans, with optical spacing suited to each format. This replaces generated lettering with reproducible typography while retaining the approved symbol. Outlined SVGs need no installed font. Font files retain their SIL Open Font License in `public/brand-assets/OFL.txt`.

The web manifest uses browser display mode. Its separate maskable icons keep the symbol within the central safe area. The manifest supplies identity; it does not add offline behavior or a service worker.

Social exports include 1200×630 Open Graph images, a 1280×640 GitHub preview, a 1080×1080 square, a 1500×500 banner and a 1600×480 README banner. Platform crops vary, so preview the final upload in its destination before publishing.
