# Editor authoring and local exports

## Implementation

- `app/playground.tsx`: current revision, source editing, fragment lifecycle, selected-view preview, four-panel inspector, export controls and feedback.
- `src/editor.ts`: pure JSON/source transitions, lazy Markdown import, selected-view evaluation, safe Markdown fences and step mutations.
- `app/editor/editor.css`: route-scoped editor layout, inspector and authoring styles.
- `app/authoring-controls.tsx`: annotation and step controls using the existing schema.
- `app/browser-export.ts`: local browser PNG rasterization, clipboard capability detection, delivery and download cleanup.
- `app/markdown/page.tsx` and `app/markdown/markdown-client.tsx`: a content-only route for validating and previewing every CircuitKit fence.
- `tests/editor.test.ts` and `tests/authoring-ui.test.tsx`: state, SSR, browser-adapter and dependency-boundary checks.

## Current-document behavior

`createEditor(document, view = "schematic")` stores three `EditorState.view` values:

- `"schematic"` (Schematic only): `renderSchematicSVG(document)`, a pure cropped circuit without lesson framing or inline annotations.
- `"annotated"` (Annotated circuit): `renderSchematicSVG(document, { annotations: true })`, with inline net colors, halos and labels but no caption or legend.
- `"figure"` (Full lesson figure): `renderFigureSVG(document)`, including authored caption, legend and active-step explanation.

View is UI state, not a FigureDocument field. Switching views preserves the document and pending drafts; JSON and Markdown imports retain the selected view. Choosing a recipe explicitly resets to the default schematic view. SVG download uses the selected render's exact preview string, and browser PNG rasterizes that same SVG. JSON and Markdown exports retain the complete document, not the view. Site theme is never read by the editor or copied into authored presentation. The landing also defaults to pure schematics; legacy core and CLI defaults remain unchanged for compatibility.

Every source keystroke pauses preview, copy, download and sharing. Invalid numeric controls, schema errors, unsupported glyphs, bad annotations and invalid step references also pause every export. Source text is preserved on validation errors. Choosing an example or applying valid source is an explicit replacement of the draft.

Edits, view changes, source validation, source-format changes, example changes, PNG-scale changes, hash document navigation, page hiding and unmount invalidate pending asynchronous work. PNG work uses an AbortController in addition to a captured revision; old jobs cannot initiate a later copy/download, report late success, or trigger download fallback after cancellation. The browser cannot retract a clipboard write or download already handed to its operating system while that revision was valid.

## Annotation and step controls

Annotations can be added for any existing net and removed individually. Each exposes label, description and semantic tone. Legend visibility and figure caption are explicit controls. Text is plain data, never HTML. The renderer remains authoritative for glyph, single-paragraph/control-character, contrast and reference diagnostics; the UI does not sanitize or silently rewrite authored text.

Steps expose title, description, component/net focus, current selection, add, move up/down and remove. Add creates a unique `step-N` ID and selects it, with at most 32 steps. Reordering preserves active ID. Removing the selected step clears `activeStep`, restoring authored focus. Manual component/net focus and Clear focus also clear `activeStep`.

Generated IDs remain stable while editing text. IDs can be edited in JSON; invalid or dangling references are diagnosed, not repaired by changing the circuit. Unknown step highlight references from shape-valid JSON are also shown as removable chips. The helpers mutate only presentation; their callers clone documents before editing. Share and Markdown adapters normalize endpoint array ordering without changing connectivity.

## Share links

Copy link uses `encodeShareDocument(result.document, { view: state.view })` and copies an absolute same-origin `/editor#v=1&doc=...&view=schematic|annotated|figure` URL. The optional fragment view is separate from FigureDocument. It preserves the selected view and complete valid authored document, including its theme, annotations, steps and active selection. Omitting view options retains the original codec format; editor links without a view load as schematic. Unknown views and duplicate parameters fail closed. It does not update the address bar, make a network request or store anything remotely. The 16 KiB codec limit and all encoding errors are exposed as feedback. Links are readable document data, not encrypted private storage.

Mount and `hashchange` load through `decodeShareDocument`. Invalid share payloads clear the current figure and expose codec diagnostics without a fallback image. The server cannot see fragments, so server rendering and initial hydration intentionally contain no SVG and disable export controls until mount inspects the hash. Existing invalid initial-document diagnostics remain visible during that check.

The one known non-share anchor, `#main`, and a history return from it to its original fragment are handled as navigation rather than passed to the share codec. This preserves the root skip link, Back navigation and existing gallery editor links without discarding in-memory drafts or canceling pending validation. Other malformed fragments fail closed. Removing a share fragment through hash navigation also fails closed rather than showing the default circuit.

## Markdown

The editor retains JSON editing and adds an explicit Markdown import mode. Switching source format clears source text and pauses output. Validate Markdown dynamically imports `src/markdown.ts` only when used. Every block must validate before any figure can be selected. One valid block imports immediately into canonical JSON; multiple valid blocks require an explicit block/title/source-line choice. Both import paths preserve the selected view. New text invalidates previous choices immediately.

Copy Markdown serializes the current valid full document as JSON in a `circuitkit` fence. The fence contains at least three backticks and is longer than every backtick run anywhere in the serialized document.

`/markdown` starts with editable example source and live preview enabled. Rendering is lazy-loaded and debounced by 350 ms; Live preview can be disabled for manual validation, and Cmd/Ctrl+Enter validates immediately. Source changes immediately remove stale previews and links. Any invalid block suppresses all output and displays located diagnostics; source-range buttons select the offending text in the editor. Successful legacy figures offer an editor share link when within the share size cap. Module diagrams remain in Markdown. Each valid figure offers full-resolution SVG/PNG downloads, independent of preview sizing. Prose, HTML, JavaScript and MDX are never rendered or executed.

## Browser export helpers

All helpers are in `app/browser-export.ts`; they do not import the native PNG subpath.

- `pngDimensions(width, height, scale)`: requires finite positive dimensions, integer scale 1 through 4, rounds pixel dimensions upward, and checks the 16,000,000-pixel cap before any image or canvas allocation.
- `canCopyPNG()`: checks ClipboardItem, clipboard write capability and optional `ClipboardItem.supports("image/png")`, including unsupported/throwing capability probes.
- `rasterizeFigurePNG(successfulRender, scale, signal)`: loads only a local Blob URL for the generated SVG through Image, draws to Canvas and returns an image/png Blob. It aborts during image loading or PNG encoding, revokes image URLs on every exit, and clears canvas dimensions to release its backing allocation.
- `deliverPNG(blob, copy, signal, download)`: copies where supported, otherwise requests a download of the same Blob. Permission rejection falls back only while the signal is still current. Returns `copied`, `downloaded` or `fallback`.
- `downloadBlob(blob, filename, onRelease?)`: clicks a temporary anchor, removes it, schedules idempotent URL revocation after one second and returns immediate cleanup. The optional release callback removes it from the editor's tracked downloads. Page hide and unmount release outstanding URLs as well.

PNG scale is export-only UI state and is not serialized into the FigureDocument. Pixel dimensions and over-cap errors are visible before export. Download PNG remains an explicit alternative; Copy PNG also requests download if clipboard access is missing or rejected. Actual clipboard and download destination permissions remain browser-owned.

## Editor layout and drafts

`app/editor/page.tsx` imports `app/editor/editor.css`. The route-scoped stylesheet implements the toolbar, export disclosure and four inspector panels: Circuit, Style, Explain and Source. Panel switching changes only local panel state; inactive panels are hidden rather than navigating away, preserving pending source and numeric drafts. Invalid input keeps preview and exports paused regardless of panel.

The circuit workspace sits beside a 320px inspector and stacks below 800px. On wide screens Source expands the inspector for readable code. The canvas has Undo/Redo for up to 40 document-state changes and a separate preview zoom that does not change export dimensions. Undo/Redo also cancel pending asynchronous exports; share navigation starts a new history. Native field editing retains its own keyboard undo.

Both routes use `app/source-editor.tsx`: an accessible plain-text fallback progressively enhanced by a lazy-loaded CodeMirror editor, with line numbers, syntax colors, bracket matching, source undo/redo and optional line wrapping. Tab moves focus rather than trapping it for indentation. Highlighting is not validation, and the renderer remains unchanged. Source selection uses UTF-16 offsets from existing diagnostics. The source viewport supports keyboard scrolling. Complete dependency notices are served at `/licenses/code-editor.txt`.

Markdown uses a responsive source/preview split with advanced scope/detail and syntax help collapsed by default. Draft persistence is opt-in, browser-local and unencrypted. Existing saved text is offered for restoration, never silently substituted. Storage failures preserve the open source and suggest downloading Markdown; unchecking persistence attempts to remove the saved draft. No source upload or remote synchronization is added. SVG/PNG downloads always require a current valid render; downloading authored Markdown is allowed even when invalid.

## Recorded verification

2026-09-17 local UX increment: [delivery receipt](../artifacts/editor-ux/delivery.json), [production browser receipt](../artifacts/editor-ux/web-receipt.json), [regression log](../artifacts/editor-ux/regression-tests.log). TypeScript, focused tests (103), regression tests (397 pass, one opt-in skip), production Next build and the dedicated browser flow passed. The browser flow covers 12 Markdown viewport/theme/view cases, real source editing, error selection, local draft consent, exports, scoped interfaces, circuit undo/redo and source-format switching. Axe reports zero violations; Markdown retains one incomplete contrast rule for clipped text, with syntax-palette contrast separately checked at at least 5.83:1 light and 7.94:1 dark. No claim of universal accessibility, agent reliability, installed-tarball requalification or deployment.

Historical 2026-09-16 artifacts, not checks rerun for this documentation sync:

- [Full suite](../artifacts/schematic-final-tests.log): 1,706 pass, 2 opt-in browser skips, 0 fail.
- [Component opt-in checks](../artifacts/schematic-component-browser.log): 74 pass, 0 fail, including compact-figure and teaching-sequence browser interaction.
- [Package qualification receipt](../artifacts/schematic-package/receipt.json): 23 consumer checks and 90 installed CLI tests passed; see the [CLI verification notes](cli-contract.md#recorded-verification).

The earlier 2026-09-15 editor checks and SSR integration failures were historical snapshots, not current blockers. The integrated editor/landing browser check is still running at this documentation snapshot; no integrated browser pass is claimed. Component checks do not substitute for that result.
