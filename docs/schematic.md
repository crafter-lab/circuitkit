# Schematic-only rendering

For new integrations, start with `renderSchematicSVG`. It renders the circuit, not a lesson page. Lesson headings, explanations, controls, legends and captions belong in the parent UI. Choose full-figure composition explicitly when those editorial elements belong in the exported image.

## Public API

```ts
import { renderSchematicSVG } from "circuitkit";

const result = renderSchematicSVG(document);
if (!result.ok) {
  console.error(result.diagnostics);
} else {
  console.log(result.svg, result.bounds);
}
```

The exact signature is `renderSchematicSVG(input: unknown, options?: { annotations?: boolean }): RenderResult`. The input remains the existing version-1 `FigureDocument`; no new document schema or layout recipe is introduced.

Default output includes wires, component symbols, component IDs and values, port labels, junctions, terminals and selected component/net highlights. There are no visible title, subtitle, formula, assumption, header/footer rules, caption, legend or inline annotation badges. The title remains escaped accessibility metadata. A theme-colored background covers the cropped viewport, without a decorative frame.

```ts
const interactive = renderSchematicSVG(document, { annotations: true });
```

This enables inline net colors, conductor halos, colored external pin leads and measured net labels for compact React interaction. It does not append a legend, caption or frame. Resolved annotation paths, segments and label bounds remain available on the result. Authored legend/caption settings remain metadata, not instructions to paint external UI.

Use `CircuitSchematic` from `circuitkit/react` for a bare, responsive circuit with no controls. `CircuitLessonFigure` uses the annotated form in its default compact layout, with one control row and optional notes; `layout="expanded"` opts into the full teaching interface. The editor defaults to Schematic only and offers Annotated circuit and Full lesson figure explicitly.

## Geometry and validation

Compilation selects paint before SVG serialization. This is not CSS hiding, post-render SVG stripping, or a scaled-down lesson page. The scene is not relaid out: the viewport is cropped to its painted union plus 16 SVG user units on each side. Bounds account for symbol strokes, highlighted wire strokes, junctions, terminal strokes, pin leads, enabled halos and visible measured text. Caption and legend layout never enlarge the schematic viewport.

`bounds.x`, `bounds.y`, `bounds.width` and `bounds.height` match the SVG `viewBox`. The origin can be nonzero. Symbol/route/label bounds, inline annotation paths and segments, and the endpoint coordinates returned by the existing `inspect` API all use the original scene userspace. Do not subtract the viewport origin from some geometry but not others. For pointer interactions, convert client coordinates with the SVG screen transformation matrix rather than assuming a zero origin. Schematic route bounds also cover painted junctions, terminals and annotated leads/halos.

The renderer preserves the canonical document and circuit returned by the existing validator, including authored annotations and teaching steps. It does not mutate input, repair graphs, drop invalid references, or rewrite authored state. The selected teaching step still determines highlights; step prose is not painted.

Validation remains deliberately as strict as the existing renderer, including geometry and text checks for hidden editorial content and annotations. Omitting annotation paint is not a way to bypass unknown/duplicate net references, unsupported glyphs, XML controls, tone contrast, annotation placement or unbreakable legend/caption text diagnostics. Oversized hidden titles can therefore still fail existing layout checks. Schema, topology, themes, scene label collisions, symbol gaps and finite derived values are checked as before. Invalid input returns diagnostics and no SVG. Invalid options, including unknown keys or a nonboolean `annotations`, return `schematic.invalid_options` at `/options`.

## PNG

```ts
import { renderPNG } from "circuitkit/png";

const result = await renderPNG(document, { schematic: true, scale: 2 });
```

PNG uses the same minimal SVG API and cropped viewport, with no inline annotations. Dimensions are `ceil(bounds.width * scale)` and `ceil(bounds.height * scale)`. Scale remains an integer from 1 through 4, with the existing 16,000,000-pixel limit checked before native rasterization. `figure: true` and `schematic: true` together return `png.invalid_options`. Native dependencies remain isolated from the browser core.

## CLI

```sh
circuitkit render examples/rc-lowpass.json --schematic --out circuit.svg --json
circuitkit render examples/rc-lowpass.json --schematic --format png --scale 2 --out circuit.png --json
circuitkit render lesson.md --block 2 --schematic --out circuit.svg --json
```

`--schematic` is render-only and mutually exclusive with `--figure`. It supports JSON files, piped JSON and the existing explicit Markdown `--block` selection. All Markdown blocks validate before selection. SVG can be returned in memory without `--out`; PNG requires `--out` and never emits binary stdout. Existing atomic writes, refusal to replace without `--overwrite`, JSON envelopes and exit codes remain unchanged: 0 success, 1 invalid input/document, 2 usage or IO failure.

## Compatibility and scope

`renderSVG`, `renderFigureSVG`, default `renderPNG`, and CLI rendering without `--schematic` retain their existing contracts. `renderFigureSVG` and `--figure` remain the explicit full lesson composition. The existing 27 immutable SVG fixture hashes are not updated.

This extends the locally defined library/CLI contract and retains the published distribution and command surface. No CLI primitives, global tools, dependency installs, manifest changes, React wiring, or new command envelopes are required.

## Verification snapshot

Local verification on 2026-09-16:

- `bun test tests/schematic.test.ts tests/png.test.ts tests/cli.test.ts tests/annotations.test.ts`: 316 passed, zero failed, exit 0. Includes all nine recipes and three themes, actual raster containment, graph/endpoint consistency, hidden-content diagnostics and all 27 immutable hashes.
- `bun x --no-install tsc --noEmit --incremental false`: passed, exit 0.
- `bun x --no-install biome check src/renderer.ts src/png.ts src/index.ts src/cli.ts tests/schematic.test.ts tests/png.test.ts tests/cli.test.ts`: passed, no fixes needed.
- `bun scripts/build.ts --skip-fonts`: passed in an isolated temporary build directory. Generated declarations expose the exact public signature above. No existing checkout build artifacts were replaced.
- `bun test tests/cli.test.ts` with `CIRCUITKIT_TEST_CLI` pointing to that build and `CIRCUITKIT_TEST_RUNTIME` pointing to Node: 90 passed, zero failed, exit 0.
- `bun test ./tests`: 1,684 passed, two browser tests skipped, one failed, exit 1. The concurrent landing UI now renders a minimal schematic, while `tests/site-shell.test.tsx:163` still compares it with `renderSVG` and strips the old inline style. That out-of-scope assertion was inspected but not changed. Browser interaction was not verified by this run.

The aggregate SHA-256 of 108 legacy outputs was identical before and after implementation: `583e8093257f07481e93ed9af74b3d06dc69ce1516f532477f30f6773ad498f5`. This covers every recipe/theme, unannotated and all-net-annotated documents, through both legacy SVG APIs in recipe/theme order. The annotated fixture uses labels A onward, descriptions `Conductor <net>`, sequential semantic tones, legend enabled and caption `Canonical baseline`.

For the default `rc-lowpass` example, the old 1000 by 600 SVG is 48,084 bytes. The pure schematic is 7,993 bytes with `viewBox="146.6 178.22 712.6 292.78"` and SHA-256 `0ac5caf29d169b233385e624d9d14682a378fc1517d324f469892535a5cdd9b0`.
