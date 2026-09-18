# Coordinate-free diagram language

Describe the system, not its drawing. A `circuitkit` Markdown fence accepts one JSON document with schema `circuitkit.diagram.v1`. The same document produces blocks, wiring, or a modular schematic. No agent-authored positions, routes, label offsets, SVG, JavaScript, or layout hints are required or accepted.

## Minimal document

````md
```circuitkit
{
  "schema": "circuitkit.diagram.v1",
  "id": "audio",
  "title": "Audio connection",
  "modules": [
    { "id": "amp", "label": "Amplifier", "ports": ["out"] },
    { "id": "speaker", "label": "Speaker", "ports": ["in"] }
  ],
  "connections": [
    { "from": "amp.out", "to": "speaker.in", "kind": "audio" }
  ]
}
```
````

This abstract example does not specify a real amplifier pinout. For a complete source-based example use `examples/diagrams/cueva.md`, with `schematic` as its authored view, or the equivalent `examples/diagrams/cueva.json`. The same Markdown renders as wiring or blocks using `--view`; no duplicate diagram models are needed. Its eleven pin connections reproduce Cueva's ESP32/OLED/MAX98357/speaker example, including GPIO23 for SDA and separate SPK+/SPK−. A twelfth link models USB power at module level, not individual USB conductors. It therefore has eleven declared nets including the opaque USB connection, not ten as in the pin-only source. `5V/VIN` is the supplied port name, not a measured or verified voltage.

## Grammar

Root fields:

| Field | Meaning |
| --- | --- |
| `schema` | Exactly `circuitkit.diagram.v1` |
| `id` | Stable diagram identity |
| `title` | Visible plain-text title, 1–120 characters |
| `view` | Optional `blocks`, `wiring` (default), or `schematic` |
| `theme` | Optional `geist-light` (default), `geist-dark`, or `geist-print` |
| `modules` | Explicit modules with `id`, optional `label`/`kind`, and `ports` |
| `connections` | Explicit endpoint pairs, with optional kind, bus, label and direction |

Diagram/module IDs start with an ASCII letter and contain up to 48 ASCII letters, digits, underscores or hyphens. IDs are case-sensitive. Labels need not equal IDs. Keep IDs stable when changing wording or choosing another view.

A port can be a string such as `"GPIO23"`, or `{ "id": "data", "label": "SDA" }`. Port IDs contain 1–32 ASCII letters, digits, underscores, plus, hyphen, slash, or Unicode minus U+2212. No dots or spaces. The endpoint `module.port` refers to IDs, never display labels. Unicode minus and ASCII hyphen are distinct; the compiler does not silently rewrite them.

A module can optionally declare `kind`: `module` (default), `source`, `connector`, `controller`, `sensor`, `display`, `amplifier`, `speaker` or `load`. This states its function, not its position, physical package or internal circuit. Use `speaker` only for an actual speaker; two drawn contacts receive its conventional symbol in the schematic. The compiler never identifies boards by their names.

A connection contains `from` and `to`, plus optional `kind` (`signal`, `power`, `ground`, `audio`; default `signal`), `bus` (up to 32 characters), `label` (up to 48 characters), and `direction` (`none`, `forward`, `both`). Connectivity remains undirected: `from`/`to` alone do not assert current or data-flow direction. Explicit `direction` adds functional arrows in blocks, and on connector links. It is authored flow, not a simulation. A grouped data bus does not inherit the direction of its supply conductors. A bus is an annotation, not a conductor: two I2C signals do not become one electrical net because they share `bus: "I2C"`.

Port labels accept up to 32 characters, module labels up to 64. Text must be visible and supported by the pinned font. Every object rejects unknown fields, including `x`, `y`, `at`, `layout`, `points`, `shapes` and custom styles. A malformed input fails rather than being silently approximated.

This document is public diagram data, not an assessment privacy boundary. There is no hidden correction stage or reveal authorization. Do not include answers that a learner must not receive; use the separate educational v2 trusted-host projection workflow when staged privacy is required.

Disconnected modules, unconnected ports, fanout, cycles and connections between distinct ports of one module are allowed. Duplicate modules/ports, duplicate undirected endpoint pairs and connections to the same endpoint are rejected. A disconnected port remains an isolated declared net. Electrical correctness is not inferred from this structural validation.

## Agent workflow

Run the installed/local binary's help and structural schema first:

```sh
circuitkit --help
circuitkit schema --diagram --json
circuitkit validate examples/diagrams/cueva.json --json
circuitkit inspect examples/diagrams/cueva.json --json
circuitkit render examples/diagrams/cueva.json --view blocks --out blocks.svg --json
circuitkit render examples/diagrams/cueva.json --view wiring --out wiring.svg --json
circuitkit render examples/diagrams/cueva.json --view schematic --format png --out schematic.png --json
circuitkit markdown examples/diagrams/sensor.md --json
circuitkit render examples/diagrams/sensor.md --block 1 --view wiring --out sensor.svg --json
```

In a checkout, `bun src/cli.ts` is the source invocation; `node dist/cli.js` tests the prepared Node artifact. Global installation is unnecessary. Consumers can use `npx circuitkit@latest` or a project-local installation from npm.

`--view` changes the rendered view, not the returned authored document. Read `classification.view` or the public `figure` for the actual projection. `--figure` and `--schematic` retain their legacy meanings and are rejected for diagram documents. Use `--view schematic` instead.

Diagnostics include `code`, JSON Pointer `path`, `message`, and `validPins` for missing endpoints. In Markdown, paths also identify the block, line and column. Correct the reference, do not add coordinates to work around an error. Every block must validate before a selected block renders. No partial figures are returned on failure.

Output uses the existing CLI envelope with `ok`, `diagnostics`, and `nextSteps`. Successful diagrams include normalized `document`, compiled public `figure`, `semantics.nets`, `classification`, and bounds. SVG rendering adds `svg` and targets. PNG adds dimensions, format, scale, byte count and output path without exposing raw binary in JSON. Files are written atomically only after successful rendering; existing files require explicit `--overwrite`. Exit 0 means success, 1 invalid input, 2 usage or IO failure.

## Library and Markdown integration

```ts
import { compileDiagram, renderDiagramSVG } from "circuitkit/diagram";
import { renderCircuitMarkdown } from "circuitkit/markdown";
import { renderEducationalPNG } from "circuitkit/v2/png";

const compiled = compileDiagram(document, { view: "schematic" });
if (compiled.ok) {
  const png = await renderEducationalPNG(compiled.figure, { scale: 1 });
}
const svg = renderDiagramSVG(document, { view: "blocks" });
const figures = renderCircuitMarkdown(markdown, { view: "wiring" });
```

`compileDiagram`, `renderDiagramSVG` and Markdown are synchronous and browser-compatible. Native PNG is a separate lazy/server-side subpath. The returned authored document remains coordinate-free; only the compiled public figure contains geometry. Reuse `EducationalFigure` from `circuitkit/v2/react` with that public figure for existing target interactions.

The Markdown adapter still accepts unchanged legacy version-1 figures. Diagram results have a `figure`, `classification` and `semantics`; legacy results do not. Narrow this union before accessing legacy `document.presentation`. The `/markdown` preview offers the three diagram views without rewriting source JSON. Diagram documents are not passed to the legacy share codec/editor.

## Layout and scope

Every view is a connected scene with exactly one occurrence of each module. Blocks group functional buses and show explicitly authored flow arrows; wiring joins module pins directly; the modular schematic keeps signal wires, module references, named supply/ground symbols and an explicitly declared speaker symbol. There is no inventory, per-link card layout or net-schedule fallback. A ground or power symbol is used only when the whole declared net has that explicit kind, except opaque connector links which remain drawn connections.

Graph ranks, measured labels, aligned pin lanes and bounded orthogonal routing determine placement. Long module names wrap without shrinking the font. Cycles and cross-links route around module bodies; crossings do not create connections. Repeated labels for a terminal on one module mean the same declared terminal, not verified physical duplicate pins. Routing or renderer limits produce a diagnostic rather than switching to the rejected panel layout.

All views derive identical nets from the same connection graph. Generated `N1`, `N2`, etc. are local display names, not stable references; target IDs are derived from semantic identities and are stable across view/theme/input ordering. No component internals, physical positions, protocol correctness, pull-ups, supply regulation or operation are invented. This is not an automatic full-chip schematic, PCB layout, simulation, or hardware certification.

The approved Cueva illustrations are acceptance references for the visual grammar, not a source of fixed coordinates or a hidden template. The compiler must keep their single-module connected composition rather than merely conserve connectivity in a different presentation. Exact positions can differ as labels and data change. This compiler has no module-name-specific branches. Physical/breadboard placement is outside this language version; existing educational APIs remain available separately.

## Limits

16 modules, 16 ports per module, 64 ports total, 32 connections. Plain JSON is bounded to 4096 values, eight nesting levels, 256 characters per individual raw string and 16000 total string characters, with no accessors, custom prototypes or execution. Markdown retains 1 MiB/32 blocks/64 KiB per payload and 64 JSON nesting levels before diagram-specific limits apply. JSON Schema describes structural constraints; runtime additionally checks references, aggregate budgets and font support. Renderer and 16-megapixel PNG limits also apply; reduce PNG scale or split a large document instead of supplying positions.
