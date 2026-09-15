# CircuitKit CLI contract

## Origin and distribution

CircuitKit uses the unscoped package `circuitkit` and CLI `circuitkit`. The approved public source repository is https://github.com/crafter-lab/circuitkit under Apache-2.0. Bun is the development, test, and package tool; TypeScript is strict and Biome handles linting and formatting. The CLI uses Node APIs and a Node shebang. Binary distribution remains a private local tarball; npm publication and global installation have not been performed.

## One document

`src/schema.ts` owns the Zod runtime schema and its inferred `FigureDocument` type. `getSchema()` returns `z.toJSONSchema(figureSchema)`, not a separately maintained schema. All structural objects are strict: unknown fields fail. No coercion, SI string parser, arbitrary CSS, URLs, HTML, or font selection. The ID-record adapter derives metadata and types from its Zod record definition while explicitly validating and preserving the own `__proto__` entry that the upstream record parser skips; value schemas are reused, not duplicated.

Required fields:

- `version`: literal 1.
- `circuit.components`: author ID to resistor `{type,resistance}`, capacitor `{type,capacitance}`, LED `{type:"led"}`, diode `{type:"diode"}`, NPN `{type:"npn"}`, op-amp `{type:"op-amp"}`, or source `{type:"dc-source",voltage}`. Electrical values are positive finite SI numbers: Ω, F, V respectively.
- `circuit.ports`: author ID to `{kind:"terminal"|"ground"}`.
- `circuit.nets`: author ID to at least two endpoint strings.
- `layout`: `{preset,roles}`. The nine presets are `rc-lowpass`, `voltage-divider`, `led-series`, `loaded-divider`, `rc-ladder`, `wheatstone-bridge`, `bridge-rectifier`, `transistor-switch`, and `inverting-amplifier`. Roles must match the selected catalog recipe exactly, bind distinct appropriately typed entities, and cover every declaration.
- `presentation`: `{title,theme,highlight?,annotations?}`. Title is text. Theme is `{preset,overrides?}` with `geist-light`, `geist-dark`, or `geist-print`. Overrides allow only background/wire/label/muted/border/highlight as opaque #RGB or #RRGGBB, plus positive finite strokeWidth/fontScale. Highlight, when supplied, has both `components` and `nets` ID arrays. Annotations, when supplied, has `nets` entries `{net,label,description,tone}`, a required `legend` boolean, and optional `caption`. Annotated net IDs must exist; net IDs and trimmed labels must be unique within annotations. Tones are `blue`, `amber`, `violet`, `green`, `rose`, and `cyan`.

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
circuitkit render annotated.json --figure --out lesson.svg --json
```

`-` means stdin only as the input argument. A terminal stdin is refused rather than prompting. Use `--` before positional filenames beginning with a dash. `--out=PATH` is also accepted. `annotated.json` denotes an author-supplied document with `presentation.annotations`. `--figure` uses `renderFigureSVG` to include the annotation legend and caption; without it, render uses `renderSVG`. `--out`, `--overwrite`, and `--figure` are render-only; `--overwrite` requires `--out`. `--out -` is rejected: omit `--out` to return SVG in the result. Duplicate flags, unknown flags, extra arguments, and missing arguments fail as usage errors. Bare invocation, `help`, `-h`, `--help`, and command `--help` expose help. `--json` always selects output mode, never input.

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
| render | the public render result fields including svg, normalized circuit, bounds, rendererVersion; `--figure` uses the shared complete-figure composition; `output` is the absolute path only after a successful file write |

Failure is `{ok:false,diagnostics,nextSteps}` without `svg`. Diagnostics have `code`, JSON Pointer `path`, `message`, and actionable `validPins` for unknown pins. The root pointer is the empty string. Operational paths name `/input` or `/out` in the CLI request, not document fields.

Exit 0 is success (including help); exit 1 is invalid JSON or invalid document; exit 2 is usage or IO/system failure. Invalid JSON reports `document.invalid_json`; unsupported versions report `document.unsupported_version`. Other stable diagnostic codes are exposed by validation/rendering. CLI usage reports `document.invalid_field` with a usage message; IO reports `io.read_failed`, `io.write_failed`, or `io.destination_exists`.

## File publication and risk

The four discovery/validation commands and rendering without a destination are read-only. `render --out` creates an SVG only after full render success. The output envelope includes the full SVG even when a file is also written. Existing destinations, including symlinks, are refused unless `--overwrite` is explicit. No input or existing SVG is altered on validation failure, even with `--overwrite`.

The CLI exclusively creates a random neighboring temporary file, writes the complete SVG, flushes and closes it. Without overwrite it atomically links the temporary to the destination and unlinks the temporary, so two simultaneous writers cannot both succeed. With overwrite it renames the temporary over the destination. It never deletes the old destination first, never uses check-then-rename to authorize no-overwrite, and never silently falls back to unsafe replacement. Missing directories are IO errors, not implicit directory creation. Unsupported hard links or rename semantics fail closed. Temporary files are cleaned after ordinary failures; process termination can leave an orphan neighbor. This guarantees atomic visibility, not directory-fsync power-loss durability.

`--overwrite` is the sole explicit local replacement gate. There is no account, network submission, audit log, killswitch, global config, or hidden prompt. A failure after publication during temporary cleanup can report an IO error with the destination already present; inspect the reported path before retrying.

## Recovery workflow

Consult schema/catalog. Validate a file; an `R1.c` error names valid pins a/b. Correct the document to `R1.a`, validate again, inspect role-resolved nets and bounds, then render to a fresh output path. A destination-exists error requires choosing a different destination or explicitly authorizing `--overwrite`; the CLI never makes that choice for the caller. `nextSteps` never interpolates untrusted IDs or shell paths into executable shell strings.
