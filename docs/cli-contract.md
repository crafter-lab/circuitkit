# CircuitKit CLI contract

## Origin and distribution

CircuitKit uses the unscoped package `circuitkit` and CLI `circuitkit`. The approved public source repository is https://github.com/crafter-lab/circuitkit under Apache-2.0. Bun is the development, test, and package tool; TypeScript is strict and Biome handles linting and formatting. The CLI uses Node APIs and a Node shebang. The public package targets Node.js 20+ and can be installed project-locally with `npm install circuitkit` or run with `npx circuitkit@latest`. Global installation is not required.

## Versioned agent guides

`circuitkit --version` identifies the installed package. `circuitkit skills list` discovers the packaged guides and `circuitkit skills get core` reads the core workflow. `skill` is an alias. Machine results include envelope `version: 1`, `packageVersion`, `diagnostics`, and `nextSteps`; list adds `skills`, get adds `name` and `content`. `--text` explicitly returns Markdown for get only and cannot be combined with `--json`.

These commands are offline and read-only. Names come from a closed allowlist, never a filesystem path or URL. Unknown names, extra arguments and unrelated flags are usage errors. A missing packaged file fails without fetching a replacement. The repository skill is only a discovery stub; the operational guide ships with the CLI version.

## Compact source language

The same binary recognizes raw source beginning with `circuit ID v1`, or that source inside a `circuitkit` Markdown fence. `grammar --json` discovers the versioned syntax; `format` produces canonical source and `expand` exposes the resolved system. Those two commands take raw source, not Markdown selection. Optional `--out` uses the same atomic no-overwrite writer as render, and formatting validates before writing.

`--scope` selects an assembly path and `--detail expanded|interface` selects its projection for source validate/inspect/render/markdown. These flags are rejected for raw JSON. Source results add `language`, complete `system` and `selection`; local `semantics.nets` belongs to the rendered projection. Read `system.nets` for complete resolved connectivity. Diagnostics add optional text ranges without changing legacy error shapes. No malformed JSON is retried as source, and no code or external include is executed. See [compact-language contract](compact-language.md).

## Coordinate-free module diagrams

The same binary also accepts `circuitkit.diagram.v1` JSON and Markdown fences. Discover its structural schema with `circuitkit schema --diagram --json`; select `--view blocks`, `--view wiring` or `--view schematic` for validate/inspect/render/markdown. These flags do not rewrite authored data. See [diagram language](diagram-language.md) for the complete grammar, output fields and limits. `--figure` and `--schematic` remain legacy-only; unsupported combinations fail instead of being ignored.

Diagram success includes normalized `document`, compiled public `figure`, `semantics.nets`, `classification` and bounds. SVG/PNG retain the existing machine-output and atomic-write guarantees below. Coordinates are rejected, source errors identify endpoints and JSON paths, and declared connectivity is not electrical verification. Each module is drawn once in a connected scene. Blocks aggregate buses, wiring joins pins directly, and schematics use signal wires with named power/ground symbols. Optional module kind and connection direction are semantic facts, not coordinates or board-specific layout templates.

The remaining document/topology sections describe the legacy contract. Its runtime behavior and bytes remain compatible. Markdown now returns a typed union; integrations must narrow diagram versus legacy entries before reading `document.presentation` or using the legacy editor/share codec.

## One document

`src/schema.ts` owns the Zod runtime schema and its inferred `FigureDocument` type. `getSchema()` returns `z.toJSONSchema(figureSchema)`, not a separately maintained schema. All structural objects are strict: unknown fields fail. No coercion, SI string parser, arbitrary CSS, URLs, HTML, or font selection. The ID-record adapter derives metadata and types from its Zod record definition while explicitly validating and preserving the own `__proto__` entry that the upstream record parser skips; value schemas are reused, not duplicated.

Required fields:

- `version`: literal 1.
- `circuit.components`: author ID to resistor `{type,resistance}`, capacitor `{type,capacitance}`, LED `{type:"led"}`, diode `{type:"diode"}`, NPN `{type:"npn"}`, op-amp `{type:"op-amp"}`, or source `{type:"dc-source",voltage}`. Electrical values are positive finite SI numbers: Ω, F, V respectively.
- `circuit.ports`: author ID to `{kind:"terminal"|"ground"}`.
- `circuit.nets`: author ID to at least two endpoint strings.
- `layout`: `{preset,roles}`. The nine presets are `rc-lowpass`, `voltage-divider`, `led-series`, `loaded-divider`, `rc-ladder`, `wheatstone-bridge`, `bridge-rectifier`, `transistor-switch`, and `inverting-amplifier`. Roles must match the selected catalog recipe exactly, bind distinct appropriately typed entities, and cover every declaration.
- `presentation`: `{title,theme,highlight?,annotations?,steps?,activeStep?}`. Steps are at most 32 ordered entries with unique nonempty `id`, nonempty `title`, plain-text `description`, and `highlight: {components,nets}` referencing existing entities. `activeStep` names an existing step and overrides the visible highlight without mutating authored state. Full-figure SVG/PNG includes its title and description with the caption. Title is text. Theme is `{preset,overrides?}` with `geist-light`, `geist-dark`, or `geist-print`. Overrides allow only background/wire/label/muted/border/highlight as opaque #RGB or #RRGGBB, plus positive finite strokeWidth/fontScale. Highlight, when supplied, has both `components` and `nets` ID arrays. Annotations, when supplied, has `nets` entries `{net,label,description,tone}`, a required `legend` boolean, and optional `caption`. Annotated net IDs must exist; net IDs and trimmed labels must be unique within annotations. Tones are `blue`, `amber`, `violet`, `green`, `rose`, and `cyan`.

Every ID is nonempty and cannot contain `.`. That delimiter exclusively separates component IDs from pins; port endpoints are bare IDs. Slash and tilde are allowed and are escaped as `~1` and `~0` in JSON Pointer diagnostic paths. Names such as `constructor`, `toString`, and `__proto__` are data, never inherited lookups. Components and ports cannot share an ID. Net IDs are a separate namespace.

Resistor/capacitor pins are a/b; LED/diode pins anode/cathode; NPN pins base/collector/emitter; op-amp pins noninverting/inverting/output/vplus/vminus; DC source pins positive/negative. Every declared endpoint occurs exactly once across all nets, including duplicates inside one net. The complete net graph must equal the selected recipe's role-resolved endpoint sets, independent of net names. Extra components, ports, roles, nets, inverted polarity, and missing endpoints fail.

Validation returns a fresh document with recursively ordered object keys, sorted net endpoints, and deduplicated/sorted highlight sets. Stable IDs never change. Integer-like keys retain JavaScript's numeric enumeration order; all other keys use locale-independent lexical order. Input objects and example fixtures are not mutated. Output contains no timestamps or generated IDs.

`validateDocument(unknown)` checks structure, SI values, graph, theme token shape, and highlight references. It returns `{ok:true,document,diagnostics}` or `{ok:false,diagnostics}`. Public `validate(unknown)` additionally checks rendered geometry, fonts, and contrast. CLI calls only the public API, never bypassing those checks. Successful validation is not a simulation, electrical-safety approval, or manufacturing check.

## Commands and flags

```sh
circuitkit --help
circuitkit schema --json
circuitkit catalog --json
circuitkit validate examples/rc-lowpass.json --json
circuitkit inspect examples/rc-lowpass.json --json
circuitkit render examples/rc-lowpass.json --out rc.svg --json
circuitkit render - --out rc.svg --overwrite --json
circuitkit render examples/rc-lowpass.json --schematic --out circuit.svg --json
circuitkit render examples/rc-lowpass.json --schematic --format png --scale 2 --out circuit.png --json
circuitkit render annotated.json --figure --out lesson.svg --json
circuitkit render annotated.json --figure --format png --scale 2 --out lesson.png --json
circuitkit markdown lesson.md --json
circuitkit validate lesson.md --block 1 --json
circuitkit inspect lesson.md --block 2 --json
circuitkit render lesson.md --block 2 --figure --format png --out block.png --json
```

`-` means stdin only as the input argument. A terminal stdin is refused rather than prompting. Use `--` before positional filenames beginning with a dash. `--out=PATH` is also accepted. `annotated.json` denotes an author-supplied document with `presentation.annotations`. `--schematic` uses `renderSchematicSVG` for a pure, tightly cropped circuit without inline annotations or lesson framing. `--figure` uses `renderFigureSVG` to include the annotation legend, caption and active-step explanation. These flags are mutually exclusive (usage exit 2); with neither, render still uses legacy `renderSVG`. `--out`, `--overwrite`, `--figure`, and `--schematic` are render-only; `--overwrite` requires `--out`. `--out -` is rejected: omit `--out` to return SVG in the result. Duplicate flags, unknown flags, extra arguments, and missing arguments fail as usage errors. Bare invocation, `help`, `-h`, `--help`, and command `--help` expose help. `--json` always selects output mode, never input.

`--format svg|png` is render-only and defaults to SVG without changing the existing SVG result or bytes. `--scale 1|2|3|4` is allowed only with `--format png`, defaults to 1, and rejects fractions, exponent notation, and leading zeroes. PNG requires a real `--out` path; it never writes binary data or base64 to stdout. `--schematic` and `--figure` apply to both formats: pure schematic or full-figure composition, respectively, with persistent active-step highlights. JSON files, stdin and explicit Markdown `--block` selection support either mode. Unlike the editor and landing's pure default, CLI rendering without either flag remains unchanged for compatibility.

`markdown <file|->` calls `renderCircuitMarkdown` and returns every validated fence's document, zero-based index, 1-based line/column, SVG, and bounds in memory. It never writes files or renders surrounding prose/HTML. Its only flags are `--json` and help. `--block <1-based positive integer>` applies only to validate/inspect/render, explicitly changes their input mode from JSON to Markdown, and selects after all blocks validate through `parseCircuitMarkdown`. Invalid unselected blocks still fail the whole invocation, without a partial result or output write. An out-of-range selector is usage error 2 only after successful validation of the source. There is no filename-extension guessing or batch publication.

Input files are opened and stat-checked before bounded chunked reading; stdin and growing files are limited during reading. JSON input is at most 64 KiB of UTF-8 and 64 nesting levels, with string-aware nesting checks before JSON parsing and recursive validation. Markdown source is at most 1 MiB; its adapter enforces 32 blocks, 64 KiB per JSON block, and 64 nesting levels. Limit failures are input errors (exit 1). Exact byte limits are accepted. Terminal stdin and directory input fail without prompting.

## PNG API and build isolation

`import { renderPNG } from "circuitkit/png"` exposes an asynchronous Node/Bun API:

```ts
const result = await renderPNG(document, { figure: true, scale: 2 });
```

Exports are `renderPNG`, `PNGOptions`, and `PNGResult`. Options are `figure?: boolean`, `schematic?: boolean` and `scale?: number`; scale defaults to 1 and must be an integer from 1 through 4. `schematic: true` selects pure `renderSchematicSVG`, `figure: true` selects `renderFigureSVG`, and neither selects legacy `renderSVG`. Both true return `png.invalid_options`. Success is `FigureInfo & { png: Uint8Array, format: "png", width: number, height: number, scale: number }`; no SVG field is returned. Failure is `{ok:false,diagnostics}`. Pixel dimensions are the ceilings of the shared SVG bounds multiplied by scale. Both dimensions must be positive safe integers and their product must be at most 16,000,000. These checks happen before loading or constructing resvg and allocating its raster. The generated SVG's root dimensions are set to those checked integers while retaining its viewBox. System font discovery is disabled, with no font directories/files. Only validated FigureDocument input is accepted, never raw SVG/HTML or external resources.

PNG diagnostics include `png.invalid_options`, `png.invalid_scale`, `png.pixel_limit`, and `png.render_failed`, alongside shared renderer diagnostics. The last is an operational/native failure (CLI exit 2); other PNG validation failures use exit 1. No native exception text is exposed.

The build emits index/react/cli plus png/markdown/share JavaScript and declarations. `bun scripts/build.ts --skip-fonts` reuses the existing pinned font data without regenerating it; the ordinary build retains its font preparation step. Core, React, Markdown and share target browsers; PNG and CLI target Node. PNG leaves `@resvg/resvg-js` external so its platform binding resolves at runtime. Markdown bundles its CommonMark dependency with the `worker` export condition, selecting its DOM-free character-entity decoder so the browser bundle also works in Node. CLI retains external index/png/markdown entry imports through an explicit resolver, rewritten from `.ts` to `.js` in dist, with build assertions preventing accidental rebundling. The core entry must never import native PNG or Markdown dependencies. The package export map exposes core, React, PNG, Markdown and share with matching JavaScript and declaration entries. Distribution qualification uses a private tarball consumer and scoped PATH with Node, never a global link.

## Streams, envelope, and exit status

Explicit `--json` or any non-TTY stdout emits exactly one complete JSON object and a newline on stdout, including help and errors. No logs, banner, ANSI, or progress. `NO_JSON` and `FORCE_COLOR` cannot override this. No command prompts. Human help is compact plain text; structured introspection remains pretty JSON in a TTY. Operational diagnostics go to stderr; they also remain available as structured diagnostics in the envelope.

Common fields are `ok`, `diagnostics`, and `nextSteps` (array of safe guidance strings):

| Command | Additional success fields |
| --- | --- |
| help | `version:1`, `help` |
| schema | `version:1`, `schema` from the live Zod definition |
| catalog | `version:1`, `catalog` with version, symbols, pins, SI parameters, roles, required nets, themes, and example paths |
| validate | the public ValidationResult fields, without adding SVG |
| inspect | the public InspectResult fields including version, components, ports, nets, roles, and verified bounds |
| render (SVG) | the public render result fields including svg, normalized circuit, bounds, rendererVersion; `--schematic` uses the pure cropped circuit, `--figure` uses complete-figure composition; with neither flag, legacy output is retained; `output` is the absolute path only after a successful file write |
| render (PNG) | FigureInfo fields plus `format:"png"`, `width`, `height` (pixels), `scale`, `bytes` (encoded byte count), and absolute `output`; no `png`, `svg`, or raw binary field |
| markdown | `figures:[{document,index,line,column,svg,bounds}]`; no `output`, no partial figures on failure |

Failure is `{ok:false,diagnostics,nextSteps}` without `svg`. Diagnostics have `code`, JSON Pointer `path`, `message`, and actionable `validPins` for unknown pins. The root pointer is the empty string. Operational paths name `/input` or `/out` in the CLI request, not document fields.

Exit 0 is success (including help); exit 1 is invalid JSON or invalid document; exit 2 is usage or IO/system failure. Invalid JSON reports `document.invalid_json`; unsupported versions report `document.unsupported_version`. Other stable diagnostic codes are exposed by validation/rendering. CLI usage reports `document.invalid_field` with a usage message; IO reports `io.read_failed`, `io.write_failed`, or `io.destination_exists`.

## File publication and risk

The discovery/validation commands, Markdown command, and SVG rendering without a destination are read-only. `render --out` creates an SVG or PNG only after full render success. The SVG envelope includes the full SVG even when a file is also written; PNG returns only metadata and the output receipt. Existing destinations, including symlinks, are refused unless `--overwrite` is explicit. No input or existing artifact is altered on validation failure, even with `--overwrite`.

The CLI exclusively creates a random neighboring temporary file, writes the complete SVG text or PNG bytes without text conversion, flushes and closes it. Without overwrite it atomically links the temporary to the destination and unlinks the temporary, so two simultaneous writers cannot both succeed. With overwrite it renames the temporary over the destination. It never deletes the old destination first, never uses check-then-rename to authorize no-overwrite, and never silently falls back to unsafe replacement. Missing directories are IO errors, not implicit directory creation. Unsupported hard links or rename semantics fail closed. Temporary files are cleaned after ordinary failures; process termination can leave an orphan neighbor. This guarantees atomic visibility, not directory-fsync power-loss durability.

`--overwrite` is the sole explicit local replacement gate. There is no account, network submission, audit log, killswitch, global config, or hidden prompt. A failure after publication during temporary cleanup can report an IO error with the destination already present; inspect the reported path before retrying.

## Recovery workflow

Consult schema/catalog. Validate a file; an `R1.c` error names valid pins a/b. Correct the document to `R1.a`, validate again, inspect role-resolved nets and bounds, then render to a fresh output path. A destination-exists error requires choosing a different destination or explicitly authorizing `--overwrite`; the CLI never makes that choice for the caller. `nextSteps` never interpolates untrusted IDs or shell paths into executable shell strings.

## Recorded verification

Existing 2026-09-16 evidence, not commands rerun for this documentation sync:

- [Full suite](../artifacts/schematic-final-tests.log): 1,706 pass, 2 opt-in browser skips, 0 fail.
- [Component opt-in checks](../artifacts/schematic-component-browser.log): 74 pass, 0 fail, including compact-figure and teaching-sequence browser interaction.
- [Package receipt](../artifacts/schematic-package/receipt.json) and [consumer results](../artifacts/schematic-package/consumer-results.json): 23 consumer checks passed under Node; final consumer command exited 0. Named core/React/PNG/Markdown/share imports, schematic output, compact React exports and legacy compatibility are covered.
- [Installed CLI suite](../artifacts/schematic-package/installed-cli-suite.stderr.log): 90 pass, 0 fail, exit 0. The receipt records `bun test ./tests/cli.test.ts` with `CIRCUITKIT_TEST_CLI` selecting the installed tarball CLI and `CIRCUITKIT_TEST_RUNTIME` selecting Node.

The 2026-09-15 consumer's missing-subpath export-map failure was historical. The current manifest registers PNG, Markdown and share with JavaScript and type entries, and the linked package checks supersede that integration note. Native-platform portability beyond the recorded macOS/Node environment remains unverified. The integrated editor/landing browser check is still running at this documentation snapshot; no integrated browser pass is claimed.
