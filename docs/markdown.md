# Markdown figures and local share fragments

CircuitKit's Markdown adapter extracts validated figures from inert CommonMark. It is not a Markdown-to-HTML renderer. The host retains the original source, prose, links, and non-CircuitKit blocks and decides how to display them safely.

## Authoring

Use a fenced code block whose CommonMark language is exactly `circuitkit`. Put one versioned `circuit ID v1` text source, one coordinate-free `circuitkit.diagram.v1` JSON diagram, or one complete legacy version-1 JSON FigureDocument in each block. Text source supports bus groups, reusable definitions and explicit interfaces; see [compact language](compact-language.md). For the JSON model, see [diagram language](diagram-language.md). Backtick and tilde fences, longer fences, and fences inside lists or block quotes follow CommonMark rules. Language matching is case-sensitive; optional fence metadata is ignored, never executed.

Generate Markdown text from an existing figure without a special export:

```ts
import { loadExample } from "circuitkit";
import { renderCircuitMarkdown } from "circuitkit/markdown";

const document = loadExample("rc-lowpass");
const source = [
  "# RC lesson",
  "",
  "Explain the input before the figure.",
  "",
  "```circuitkit",
  JSON.stringify(document, null, 2),
  "```",
  "",
  "Discuss the output after the figure.",
].join("\n");
const result = renderCircuitMarkdown(source);
```

JSON string escaping keeps authored backticks and newlines inside strings from terminating these generated fences. There is no `toCircuitMarkdown` convenience export.

## Interfaces

Import `parseCircuitMarkdown` and `renderCircuitMarkdown` from `circuitkit/markdown` in a prepared local package build. The browser-compatible subpath does not import native PNG bindings.

```ts
parseCircuitMarkdown(source: string):
  | {
      ok: true;
      figures: Array<{
        document: FigureDocument;
        index: number;
        line: number;
        column: number;
      }>;
      diagnostics: [];
    }
  | Failure;

renderCircuitMarkdown(source: string):
  | {
      ok: true;
      figures: Array<{
        document: FigureDocument;
        index: number;
        line: number;
        column: number;
        svg: string;
        bounds: FigureBounds;
      }>;
      diagnostics: [];
    }
  | Failure;
```

The signatures above describe legacy results. Both functions also accept an optional second argument `{ view?: "blocks" | "wiring" | "schematic" }`, applied only to diagram blocks. Diagram entries return a normalized coordinate-free diagram in `document`, plus compiled `figure`, `semantics.nets` and `classification`; rendered entries additionally include `targets`. Narrow with `entry.figure !== undefined` before reading diagram fields; legacy entries have no `figure` and retain exactly their prior shape. The exported `MarkdownFigure`, `RenderedMarkdownFigure`, `ParsedCircuitMarkdown` and `RenderedCircuitMarkdown` types describe the full unions.

Both functions are synchronous. Legacy blocks validate through `renderFigureSVG`, including topology, typography, theme contrast, highlights, annotation references, legend and caption layout. Diagram blocks validate and compile through `renderDiagramSVG`, including strict data fields, declared references and bounded generated geometry. `parseCircuitMarkdown` performs the same renderability checks but omits SVG, bounds and rendered targets. Returned documents are normalized, not byte-preserving JSON editors. A view override does not rewrite the authored document; `classification.view` records the displayed view.

Figures appear in source order. `index` is zero-based among CircuitKit blocks, not among all code blocks. `line` and `column` are one-based positions of the opening fence in the original source, including container indentation. They are not byte offsets or JSON-field positions.

An invalid CircuitKit block makes the entire result a failure. No partial `figures` or SVG is returned. For documents within resource limits, diagnostics from all invalid CircuitKit blocks are collected. Unknown languages and HTML nodes are ignored; a document with no CircuitKit code blocks returns `markdown.no_figures`. Unclosed CircuitKit fences are rejected using AST positions, the original closing-marker text, and payload line counts, even though CommonMark itself permits an implicit closing fence at EOF.

Failures have the existing shape:

```ts
type Failure = {
  ok: false;
  diagnostics: Array<{
    code: string;
    path: string;
    message: string;
    validPins?: string[];
  }>;
};
```

Block diagnostics preserve renderer codes and `validPins`. A renderer path such as `/circuit/nets/input/1` is prefixed with `/markdown/line/7/column/1/figures/1`, and the message identifies block 2 at line 7, column 1. JSON syntax diagnostics also identify the original opening fence rather than inventing an exact offending JSON token position.

## Limits and trust boundary

- Markdown source: at most 1 MiB of UTF-8, checked before AST parsing.
- CircuitKit blocks: at most 32, checked before figure rendering.
- Each extracted JSON payload: at most 64 KiB of UTF-8, checked before JSON parsing.
- JSON nesting: at most 64 levels, checked before JSON parsing and recursive schema normalization. Brackets inside JSON strings do not contribute to depth.
- Resource-limit failures return diagnostics, not partially rendered figures.

The only Markdown parser is `mdast-util-from-markdown`, without MDX, HTML execution, or executable extensions. JavaScript expressions are not JSON. HTML comments, raw HTML blocks, indented code, escaped fences, and shorter fences inside a longer outer code block are interpreted by CommonMark, not by a regular-expression block extractor. Only actual CircuitKit code nodes become figures.

There is no eval, remote document loading, API call, cloud storage, publication, or network access in these adapters. Links, image destinations, raw HTML, and component-looking MDX tags are inert data. A host that renders the surrounding Markdown must apply its own safe rendering policy. Never inject the original Markdown or raw HTML as trusted HTML. Generated CircuitKit SVG comes from the existing portable figure renderer, including its escaping and font/geometry validation.

IDs such as `__proto__`, `constructor`, and `toString` remain own JSON data and are not filtered out as reserved names.

## Text-language results

A source block adds `language: "circuitkit.source.v1"`, the complete resolved `system` and a `selection` describing scope/detail, stable path mappings, boundary ports and omitted internal connections. Its `document` is the selected flat diagram projection, not the full hierarchy. Use `system.nets` for complete resolved connectivity; `semantics.nets` describes the rendered projection.

Source options also accept `scope` and `detail: "expanded" | "interface"`. These apply to source blocks, not JSON. Every source is fully resolved before projection, including unused definitions and invalid references outside the selected scope. Mixed documents remain all-or-nothing. Scope selection applies to all text blocks in a Markdown call; use separate source documents if their assembly paths differ.

Source diagnostics retain the original codes and add `range` with UTF-16 offsets and 1-based line/column in the original Markdown, including container prefixes. System-node provenance ranges remain relative to the individual source block. Invalid JSON is never retried as text language.

## Declarative presentation in source blocks

Text-language blocks may include sections, highlights and scenes as specified in [presentation](presentation.md). Parsed/rendered entries retain optional `presentation.scenes` plans, including projected targets, oriented flow geometry and unavailability reasons. Scene ranges, like system provenance, are relative to the individual .ck block; error diagnostics still map to original Markdown positions. Unknown references invalidate the entire document. Valid scenes omitted by a projection are listed as unavailable instead of drawing invented paths.

The bundled `/markdown` viewer supports scene selection, static highlights, illustrative playback, pause/replay, visual speed and reduced motion. Its SVG/PNG downloads remain the static base figure. Other Markdown hosts receive static SVG unless they implement a viewer for the plans. Keep the original fenced source to preserve sections and scenes; projected diagram JSON and legacy share fragments are not presentation storage formats.

## Share codec

```ts
type ShareView = "schematic" | "annotated" | "figure";

encodeShareDocument(input: unknown, options?: { view?: ShareView }):
  | { ok: true; hash: string; document: FigureDocument }
  | Failure;

decodeShareDocument(hash: string):
  | { ok: true; document: FigureDocument; view?: ShareView }
  | Failure;
```

Import these functions from `circuitkit/share`. They validate complete figures with `renderFigureSVG`, just like the Markdown adapter. Passing `{ view: "schematic" }`, `{ view: "annotated" }` or `{ view: "figure" }` appends that optional UI choice to the fragment without adding it to FigureDocument. Omitting the option preserves the legacy fragment bytes. The entire fragment, including `view`, must fit the same 16 KiB limit.

The encoding is `#v=1&doc=<base64url UTF-8 JSON>`. It has no compression and no network dependency. The complete fragment, including `#v=1&doc=`, is limited to 16 KiB. The encoder serializes the validated, normalized document; repeated encoding is stable under the renderer's normalization. It accepts bounded, acyclic plain JSON data, not accessors, custom class instances, sparse arrays, JSON hooks, undefined values, or non-finite numbers. JSON accessors and `toJSON` methods are not invoked. Arbitrary JavaScript proxies are not a sandbox boundary; untrusted external input should arrive as a fragment or JSON text, not as executable objects.

Decoding accepts exactly one `v`, one `doc` and at most one `view`, in any order. A supplied view must be `schematic`, `annotated` or `figure`; an omitted view remains absent from the decoded result and opens as Schematic only in the editor. Missing, duplicate, unknown, empty, percent-encoded, or malformed parameters fail. The version must be exactly `1`, and `doc` must be canonical unpadded base64url. Standard base64 `+`, `/`, padding, invalid trailing bits, malformed UTF-8, BOM-prefixed JSON, invalid JSON, excessive nesting, and oversize fragments fail with diagnostics. Pass only the fragment including `#`, not a full URL.

The codec does not rewrite, split, or interpret teaching steps. Optional `presentation.steps` and `presentation.activeStep` pass through the same renderer validation and remain in the returned and encoded document. The codec does not select an active step itself.

The host owns reading or changing `location.hash`, URL construction, clipboard access, and any user-facing share action. A fragment is not encryption or access control: anyone who receives the URL can decode its figure, and scripts running on the page can read it. Do not put secrets in share documents.

## Integration and verification

The package declares `mdast-util-from-markdown` as a runtime dependency and registers separate Markdown and share subpaths. The editor imports Markdown lazily; the CLI supports `markdown` and explicit `--block` selection. `renderCircuitMarkdown` retains full-figure output. For minimal images, parse the blocks and call `renderSchematicSVG` for each validated document, or use CLI `render lesson.md --block 1 --schematic`.

Run the focused suites from the repository root after dependencies are available:

```sh
bun test ./tests/share.test.ts ./tests/markdown.test.ts
bun node_modules/@biomejs/biome/bin/biome check src/share.ts src/markdown.ts tests/share.test.ts tests/markdown.test.ts
```
