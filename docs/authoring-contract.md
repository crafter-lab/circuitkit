# Portable authoring contract

This extension keeps FigureDocument version 1 and the nine exact curated graphs. Existing documents and their SVG bytes remain compatible. No simulation, arbitrary routing, public render endpoint, remote storage, publication or external resources are added.

## Render views and React

`renderSchematicSVG(input, { annotations?: boolean })` is the pure circuit API: a tightly cropped viewport with no visible lesson framing, caption, legend or inline annotations by default. `{ annotations: true }` adds inline net colors, halos and labels, not external lesson chrome. Hidden authored content still validates; view selection never strips document data. See [schematic rendering](schematic.md).

`EditorState.view` is `"schematic" | "annotated" | "figure"`, defaulting to `"schematic"`. These select pure schematic, annotated schematic and `renderFigureSVG` respectively. View is UI state, not a FigureDocument field. JSON and Markdown imports preserve the selected view; SVG and browser PNG exports use that view's exact render result. The editor and landing default to pure schematics. Legacy `renderSVG`, `renderFigureSVG`, default `renderPNG` and CLI rendering without a mode flag retain their compatibility contracts.

`circuitkit/react` exports `CircuitSchematic`, `CircuitFigure`, `CircuitLessonFigure`, `CircuitLessonSequence` and their props types. `CircuitSchematic` is bare responsive output without controls; `CircuitFigure` retains `renderSVG`. `CircuitLessonFigure` defaults to `layout="compact"`, an annotated schematic with one control row and optional Notes; `layout="expanded"` opts into the full teaching interface. Its download uses the selected layout and persistent selection, never hover/focus preview. Teaching sequences keep their explanation outside the compact child figure.

## Document and steps

The existing circuit, layout and presentation remain authoritative. Optional `presentation.steps` is an ordered array of at most 32 entries. Each entry has a unique nonempty `id`, nonempty `title`, plain-text `description`, and `highlight: { components: string[], nets: string[] }` referencing existing entities. Optional `presentation.activeStep` names an existing step ID. Omission means the normal authored highlight. Steps never alter connectivity or component values.

An active step overrides the visible highlight. Full-figure SVG/PNG exports include its title and description with the authored caption. This is derived at render time without repeatedly appending text or rewriting the original document. A basic circuit render can expose the selected step in accessible description while retaining its circuit-only frame. Invalid step IDs and references produce diagnostics. No automatic animation, timer or inferred current is introduced.

Manual net selection may clear activeStep. Hover/focus may temporarily preview a net, but exports and links must retain only persistent state. Existing figures without steps must preserve their immutable regression hashes.

## Sharing

`encodeShareDocument(input, options?: { view?: ShareView })` returns `{ ok: true, hash, document }` or the existing Failure envelope. `ShareView` is `"schematic" | "annotated" | "figure"`. `decodeShareDocument(hash)` returns `{ ok: true, document, view?: ShareView }` or Failure. The fragment is `#v=1&doc=<base64url UTF-8 JSON>` with optional `&view=schematic|annotated|figure`, capped at 16 KiB including the view. Omitting options preserves the original fragment format; links without a view open as schematic in the editor. View stays outside the document. Invalid options, unknown views, duplicated or unsupported parameters fail closed. There is no compression or network request. Prototype-like author IDs remain data. A link carries all authored presentation, including activeStep; it is not encrypted or a private publication mechanism.

The editor loads fragments on mount/hash navigation and exposes failure rather than showing an unrelated valid figure. Copying an explicit share link uses the current valid document. Pending/invalid input disables all export/share actions. No automatic URL update should destroy in-progress source edits.

## Markdown

`circuitkit/markdown` exposes `parseCircuitMarkdown(source)` and `renderCircuitMarkdown(source)`. The former returns `{ ok: true, figures: [{ document, index, line, column }], diagnostics: [] }`; the latter includes SVG and bounds per figure. Failures use the existing diagnostics shape with source locations. CircuitKit fences contain only FigureDocument JSON, never JS/MDX/Python. CommonMark parsing recognizes real fences, not regex matches inside unrelated code or HTML.

Limits: 1 MiB UTF-8 source, 64 KiB per JSON block, 32 blocks, 64 JSON nesting levels. All blocks must validate before output is treated as successful. The host owns prose/HTML rendering; this adapter never executes or renders arbitrary HTML. Static generated images remain the fallback for Markdown hosts without an adapter.

## PNG

`circuitkit/png` is an isolated Node/Bun subpath backed by resvg-js. `renderPNG(input, { figure?: boolean, schematic?: boolean, scale?: number })` returns a structured success with PNG bytes, pixel dimensions and figure information, or diagnostics. `schematic: true` uses the pure cropped circuit; `figure: true` uses full-figure composition. Setting both to true returns `png.invalid_options`; omitting both retains legacy `renderSVG` output. Default scale is 1, with a bounded integer range 1 through 4 and a 16-megapixel output cap checked before allocation. Raw SVG/HTML input and external resources are not accepted. System font discovery is disabled because the renderer embeds glyph paths.

Browser export uses the existing generated SVG and local rasterization; it does not import the Node addon. Copy PNG respects Clipboard support/permission and offers download as fallback. Blob URLs are cleaned up. Output captures the current valid revision and persistent state.

## CLI compatibility and extensions

Contract origin: defined local transform. Preserve the Node shebang, existing verbs, automatic non-TTY JSON, one envelope per invocation, exits 0/1/2, diagnostics and nextSteps, and atomic no-overwrite behavior. No prompts, global install, registry publication, accounts or network rendering.

`render` supports `--format svg|png` and `--scale 1|2|3|4` for PNG. PNG requires `--out` so binary data cannot corrupt the JSON stream. Its result contains format, pixel dimensions, byte count and output path, not raw bytes in JSON. Render-only `--schematic` and `--figure` apply to both formats and are mutually exclusive (usage exit 2); they select pure circuit and full-figure composition respectively. With neither flag, legacy output is unchanged.

`markdown <file|->` validates/renders all fenced figures into one structured result in memory. `--block <1-based integer>` selects a validated Markdown figure as input to validate/inspect/render; selection never ignores another invalid block. No batch filesystem writes or silent guessing from extensions. CLI continues to support JSON inputs by default.

Qualify each release with a fresh packed consumer, scoped PATH and Node execution, not a global link. Named `circuitkit/markdown`, `circuitkit/png` and `circuitkit/share` subpaths are registered; Markdown and native PNG dependencies stay isolated from the browser core.

## Recorded verification

See the existing 2026-09-16 [full-suite log](../artifacts/schematic-final-tests.log) (1,706 pass, 2 opt-in skips, 0 fail), [component opt-in log](../artifacts/schematic-component-browser.log) (74 pass, 0 fail), and [package receipt](../artifacts/schematic-package/receipt.json) (23 consumer checks and 90 installed CLI tests passed). These checks were not rerun for this documentation sync. The integrated editor/landing browser check is still running at this snapshot; no integrated browser pass is claimed.
