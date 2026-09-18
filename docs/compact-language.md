# CircuitKit text language v1

Contract for the selected bus-grouped syntax, available after building this local revision. JSON remains supported. This is bounded module-diagram authoring, not universal EDA or a claim of measured agent reliability. No global installation or publication is authorized.

## Defined contract

This is a locally defined compiler, not a wrapper over an external service. Reuse existing machine envelopes, bounded input, Node entrypoint, native PNG isolation and atomic output. Do not introduce another CLI framework or global link. Source text is inert data.

A source starts with `circuit ID v1`, followed by `title "text"`, optional `view blocks|wiring|schematic`, optional `theme geist-light|geist-dark|geist-print`, module declarations and connections. The title is required. View defaults to wiring, matching the JSON model.

A module is `ID: KIND "optional label" (PORTS...)`. Ports are explicit whitespace-separated IDs or exact quoted IDs, optionally `ID as "label"`. Module kinds and identifier/label constraints are the existing diagram contract. Parentheses allow line breaks; indentation has no semantics. A statement ends at newline or EOF. Comments start with `#` outside strings. Formatting may discard comments, but must retain all semantic data.

A connection is `[power|ground|audio|signal] MODULE.PORT OP MODULE.PORT ["label"]`, where OP is `--`, `->` or `<->`. These lower to the existing kind and optional direction, never to simulated current. `bus NAME { connections }` supplies the bus label; it never unions distinct signal nets. No contextual port-map variant, positional zipping, executable expressions, imports or loops are accepted.

`define NAME (PUBLIC_PORTS...) { ... expose PORT = MODULE.PORT ... }` declares a reusable module. Definitions live at document scope. Bodies contain modules, instances, connections and bus blocks, not global metadata or nested definitions. `ID: NAME ["label"]` instantiates a definition. Every public port must be exposed exactly once to an existing local endpoint. Unknown types, recursive definitions, duplicate declarations, unknown ports and alias-induced duplicate/self connections fail. Unused definitions are validated too.

## Semantic model and projections

The source program retains definitions, instances and source ranges. Resolution produces a typed hierarchical system with expanded primitive leaves, logical paths, aliases, connections and nets. Nested instances receive stable encoded renderer IDs; flat source retains its original IDs to preserve the existing Cueva SVG bytes.

Source resolution has its own finite budgets, independent of one drawing. Drawing still uses the current diagram validator, layout and export budgets. A selected assembly can be rendered with an explicit boundary/interface marker, clearly labelled as not hardware. An interface-level projection keeps modules collapsed and does not claim their internals are visible. Whole-system resolved connectivity is retained separately from local rendered-net metadata.

`scope` selects an assembly path, default root. `detail` selects expanded or interface, default expanded. View and theme remain independent. No projection silently mutates the authored system. Large systems that do not fit one drawing require an explicit scope/interface projection; there is no panel fallback or unbounded raster allocation. This increment does not claim arbitrary-scale support, automatic pagination or new physical/CAD domains.

## API and CLI

The browser-safe `circuitkit/language` entry exposes parsing/resolution, canonical formatting, projection and SVG rendering. PNG uses the existing public figure and lazy native exporter. Failures share Diagnostic/Failure with optional source ranges in UTF-16 offsets and 1-based line/column. JSON Pointer diagnostics from lowering map back to authored tokens.

The main CLI retains existing JSON and Markdown behavior. Versioned source text is accepted directly or in a circuitkit fence. Invalid JSON is never retried as source syntax. Add `grammar` for discovery, `format` for canonical text, and `expand` for inspectable hierarchical/resolved data. `--scope` and `--detail` apply to source diagrams only. Explicit output paths keep the existing no-overwrite/atomic rules. There is no in-place format mutation.

## Use the language

After building this revision, the same CLI supports raw `.ck` text and mixed Markdown fences:

```sh
node dist/cli.js grammar --json
node dist/cli.js validate examples/diagrams/cueva.ck --json
node dist/cli.js render examples/diagrams/cueva.md --block 1 --view schematic --out cueva.svg
node dist/cli.js format examples/diagrams/cueva.ck --out formatted.ck
node dist/cli.js expand examples/diagrams/audio-system.ck --out audio-system.json
node dist/cli.js render examples/diagrams/audio-system.ck --scope audio --out audio.svg
node dist/cli.js render examples/diagrams/audio-system.ck --detail interface --view blocks --out interfaces.svg
```

`format` and `expand` accept raw source, not Markdown selection. Formatting validates first, discards comments, preserves semantic data and writes only to an explicit new path unless overwrite is requested. It never edits a source file implicitly. `expand` returns the source program and resolved hierarchical system; its optional file contains the resolved system. That inspection format is not itself a new accepted author-JSON format. The projected `document` returned by render/compile is valid flat diagram JSON and can be rendered by the existing API. Keep text source to retain reusable definitions.

```ts
import { compileCircuitSource, renderCircuitSource, resolveCircuitSource, formatCircuitSource } from "circuitkit/language";

const system = resolveCircuitSource(source);
const svg = renderCircuitSource(source, { view: "schematic", scope: "audio" });
const compiled = compileCircuitSource(source, { detail: "interface", view: "blocks" });
const formatted = formatCircuitSource(source);
```

`parseCircuitSource` checks syntax only; `resolveCircuitSource` validates definitions, all references and complete expansion. `compileCircuitSource` additionally validates the selected drawing; `renderCircuitSource` adds SVG and bounds. Success returns the current diagram fields plus `language`, complete `system` and `selection`. Use `system.nets` for complete resolved connectivity: `semantics.nets` belongs to the selected rendered projection. Interface views explicitly mark omitted internal connections and append `/ interfaces` to the title; they are not full electrical netlists.

The source editor at `/markdown` has accessible CodeMirror editing, line numbers, lexical highlighting, optional wrapping, live preview, example selection, clickable source ranges, assembly scope/detail controls and an inspectable resolved model. Live preview can be disabled; Cmd/Ctrl+Enter validates explicitly. SVG/PNG exports use the full validated figure. Opt-in device-local draft storage is not encrypted or synchronized, and existing drafts require explicit restoration. Highlighting does not establish validity. The source remains public data, not an assessment privacy boundary or a way to hide answers by choosing a simpler view.

## Presentation layer

The optional document-level `presentation` block adds reusable `section` selections and named `scene` states. Highlights can select modules, ports, buses, links or sections; `flow` follows explicitly directed bus/link geometry without changing nets or layout. The same viewer is available in `/editor?mode=circuitkit`, Markdown previews and the landing. Reduced motion uses static cues; exports remain the static base diagram. See [the complete presentation contract](presentation.md) for syntax, direction, projection limitations and budgets, and [Cueva with scenes](../examples/diagrams/cueva-presentation.ck) for a runnable source example. Legacy `/editor` recipes and share links remain separate.

## Bounds and verification

Source text is limited to 64 KiB UTF-8 and 16384 lexical tokens. There are at most 512 source declarations, 32 definitions and eight definition/instance levels. Expansion is bounded to 256 modules including assemblies, 2048 ports and 2048 connections. Scope selectors are at most 256 characters. One drawing still permits 16 modules, 64 ports and 32 links, including explicit boundary markers. PNG retains its 16-megapixel cap.

No imports, network resolution, evaluation, inferred device pinouts, recursive expansion or silent semantic fixes are allowed. The source language currently covers the module diagram domain, not all educational-v2 panels or arbitrary CAD.

Run `bun run test:language` for deterministic parser, hierarchy, Markdown, CLI and editor checks. `bun run measure:language` uses pinned gpt-tokenizer 4.0.0 and o200k_base to compare source-only tokens with minified and readable JSON while checking the same normalized model and SVG bytes. It does not measure instructions, tool output, reattempts, total-session savings or agent error rates.

## Breadboard

| Place | Surface |
| --- | --- |
| P1 | CLI and its stdout/files |
| P2 | Markdown source/preview |
| P3 | Compiler/library |

| ID | Place | Visible affordance | Calls / data source |
| --- | --- | --- | --- |
| U1 | P1 | grammar discovery | N1 |
| U2 | P1 | validate, inspect, expand, render, format | N2, N3, N4 |
| U3 | P2 | source text and syntax examples | S1 |
| U4 | P2 | view/scope/detail selection | N3 |
| U5 | P2 | diagnostics with source positions | N2, N3 |
| U6 | P2 | readable SVG preview | N4 |
| U7 | P1 | output receipt and files | N5 |

| ID | Place | Code affordance | Wires out | Returns to |
| --- | --- | --- | --- | --- |
| N1 | P3 | grammar description | none | U1 |
| N2 | P3 | parse/resolve source | typed system, diagnostics | U2, U5, N3 |
| N3 | P3 | select projection | existing diagram validation | N4, U4, U5 |
| N4 | P3 | render source diagram | existing SVG/public PNG | U2, U6, N5 |
| N5 | P1 | existing atomic write | S2 | U7 |
| S1 | P2 | source draft, revision, selected view/scope | N2, N3 | U3, U4 |
| S2 | P1 | generated output files | none | U7 |

## Observable increments

1. Flat language in Markdown and CLI, with Cueva byte parity in all views, precise error locations and canonical format.
2. Reusable definitions and explicit exposure, resolved tree inspection, scoped/interface projections and bounded expansion; demo two instances and a selected subsystem.
3. Real installed consumer, syntax-highlighted authoring examples, documentation, regression evidence and honest token measurements.

Each increment reuses the existing renderer and must preserve legacy behavior. No increment may replace the connected drawings with repetitive card inventories.

## Verification gates

- Cueva source lowers to the same normalized flat JSON and yields identical SVG/PNG across all three views and themes.
- Typos, Unicode-confusable ports, invalid fields, duplicates, unmatched delimiters and recursive/oversized expansion fail with useful ranges and no partial output.
- Syntax source maps remain correct in Markdown containers and CRLF input; successful formatting round-trips semantically.
- Two definition instances do not collide; public aliases resolve to the intended leaf pins; scope boundaries are explicit and not presented as new hardware.
- Current JSON schemas, legacy bytes, CLI flags, atomic writes and privacy boundaries stay intact.
- Compare actual tokenizer output for source fixtures versus readable and minified JSON where an explicit tokenizer is available. Character counts are not token counts. Do not claim lower agent error rates or total-session savings without an actual agent evaluation.
