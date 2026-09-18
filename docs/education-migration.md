# NEWv2 pedagogical migration from v1

## Compatibility first

V1 remains fully supported. Keep existing `FigureDocument` version 1 files, all nine curated recipe families, `circuitkit` CLI, `circuitkit`/`circuitkit/react` imports, Markdown/share integrations and legacy SVG/PNG workflows. Existing `/editor`, `/?case=...`, `/gallery` and `/gallery/view?case=...` routes retain their v1 contracts. The v2 `/editor/education` public editor and `/gallery/education` gallery routes and package entry points are additive. See [portable authoring](authoring-contract.md) and the [README web demo](../README.md#try-the-web-demo). Nothing in this recipe changes a v1 API or upgrades a saved document in place.

V1 is legacy teaching/presentation data, **not question-safe data**. Formula/metadata can be auto-derived from the complete circuit, and the document still carries component values, annotations and steps when a view omits them. Schematic mode, inactive steps, hidden layers and CSS are not an answer boundary. Do not send a full v1 document to a learner and describe it as a sanitized v2 question.

V2's public SDK renders only `circuitkit.educational.public.v2`, selected on an authorized host from an explicit `AuthorFigure`. V1 input is intentionally rejected by v2 projection/rendering rather than silently converted. The existing v1 renderer still accepts it.

## What this migration actually implements

This is an executable, manually authored pedagogical migration of two checked-in basic examples, not an automatic topology translator:

| Original | Explicit author fixture | Preserved facts | New author decisions |
| --- | --- | --- | --- |
| `examples/led-series.json` | `examples/education/led.ts`, `ledAuthor` | V1=5 V, R1=330 Ω, D1 LED, GND, every original pin and conductor group | Assume a conducting LED with 2 V drop; choose resistor-voltage probes, permitted targets and three independent stage models |
| `examples/voltage-divider.json` | `examples/education/divider.ts`, `dividerAuthor` | R1=R2=10000 Ω, VIN/VOUT/GND, every pin and conductor group | Choose 6 V input for the question, common ground, no load, ohmic resistors, ideal voltmeter and three stage models |

The v1 divider does not contain a source voltage. The v1 LED does not contain a forward-drop model. The new values and assumptions above are deliberately supplied by an author, not recovered from hidden v1 metadata or guessed by a converter. Titles, layout, labels and lesson framing are reauthored. V2 SVG need not match v1 SVG; the regression promise is that continuing to render v1 produces its original bytes.

There is no `migrateV1`, no `src/v2/migration.ts`, and no helper export in this change. `dividerCircuit`, `ledCircuit` and `measuredStage` compose examples; they do not accept arbitrary v1 documents. `loaded-divider.ts` is a separately authored extension, not migration coverage for the v1 `loaded-divider` recipe. No automatic all-nine topology migration is claimed. If an automatic helper is added later for only LED/divider, it must validate its supported inputs and reject all other families instead of fabricating a conversion. The other seven legacy families remain usable through v1 and require individual authoring/capability review before any v2 rewrite; some contain components outside the current six-symbol v2 electrical vocabulary.

## 1. Inventory values and preserve identities explicitly

Keep a host-side mapping alongside your source migration review. V1 component/port/net IDs and role aliases are data, not fixed names such as `R1`, `VIN` or `ground`. Read `layout.roles` and the actual net endpoint lists. Never drop an unfamiliar ID or treat an inherited object property as an entity. Duplicate/colliding mappings must fail author review.

V1 IDs are nonempty strings without `.`; the dot is reserved for `component.pin` endpoints. Otherwise the ID schema permits spaces, punctuation and aliases, including prototype-like keys. Glyph availability, topology and other validation rules still apply separately. For example, `upper R:1` is a valid tested legacy alias; an ID containing a glyph missing from the pinned font can still fail rendering.

V2 local figure/panel/entity IDs match `[A-Za-z][A-Za-z0-9_-]{0,47}`. Semantic display/target IDs match `[A-Za-z][A-Za-z0-9_/-]{0,191}`. They are intentionally stricter. A v1 endpoint string `R1.a` is therefore mapped to local terminal `R1_a`, not reused as a v2 entity ID. Do not apply a lossy global punctuation replacement: `a:b` and `a b` might collide. Allocate explicit stable IDs and retain the reversible alias map on the host, not as extra public metadata.

For these two fixtures the complete pin/port mapping is:

| V1 endpoint | LED v2 terminal | Divider v2 terminal |
| --- | --- | --- |
| `V1.positive` | `V1_positive` | Not present |
| `V1.negative` | `V1_negative` | Not present |
| `R1.a` | `R1_a` | `R1_a` |
| `R1.b` | `R1_b` | `R1_b` |
| `D1.anode` | `D1_anode` | Not present |
| `D1.cathode` | `D1_cathode` | Not present |
| `R2.a` | Not present | `R2_a` |
| `R2.b` | Not present | `R2_b` |
| `VIN` | Not present | `VIN` |
| `VOUT` | Not present | `VOUT` |
| `GND` | `GND` | `GND` |

The terminal's public part ID is `circuit/terminal/<local ID>`. Component IDs remain `V1`, `R1`, `D1` or `R1`, `R2`, yielding `circuit/component/<ID>`. A host alias map may therefore contain `{ 'upper R:1': 'circuit/component/R1' }`. Resolve the original endpoint references and role mapping consistently; the regression test actually renames a legacy component and verifies v1 still accepts it. Invalid raw IDs in a v2 model fail, rather than being silently dropped.

Conductor groups are also preserved before adding any new scenario:

| Fixture | Named net anchor | Mapped terminal members |
| --- | --- | --- |
| LED | `supply → V1_positive` | `V1_positive`, `R1_a` |
| LED | `series → R1_b` | `R1_b`, `D1_anode` |
| LED | `ground → GND` | `D1_cathode`, `V1_negative`, `GND` |
| Divider | `input → VIN` | `VIN`, `R1_a` |
| Divider | `output → VOUT` | `R1_b`, `R2_a`, `VOUT` |
| Divider | `ground → GND` | `R2_b`, `GND` |

V1 net arrays become explicit terminal-to-terminal routes. Multi-member nets need enough routes to join all endpoints. Route IDs name drawing segments, not necessarily entire nets: the divider's `middle` and `output` routes jointly form its output conductor. Names are stable anchors, not secret automatic public graph metadata. The test compares every v1 endpoint and conductor group with the host-only `inspectElectricalNets` result and verifies original component kinds/values.

## 2. Write independent teaching, question and correction models

Inspect the source fixtures rather than cloning the entire correction into question and masking it later:

| Stage | LED resistor-voltage lesson | Divider lesson |
| --- | --- | --- |
| Teaching | Symbolic `V` with subscript `R`, 5 V supply, explicit 2 V LED-drop assumption | Symbolic input/output, known resistor values, explicit unloaded/ohmic model |
| Question | Same permitted circuit givens; meter `unknown('V')`, no terminal potentials or correction prose | Given 6 V input; meter `unknown('V')`, no solution or correction prose |
| Correction | Authored common-reference terminal potentials; ideal meter derives 5 − 2 = +3 V | Explicit `divider` scalar derivation with known inputs and exact assumptions yields 3 V |

The same panel/entity IDs appear in each stage. The question is its own complete model, not a mode flag on an answer scene. `stageModel` and `authorFigure` clone their inputs. All arrays remain ordinary typed, JSON-portable author data.

Stable target IDs include the component, node and probe identities documented in [authoring](education-authoring.md). These examples deliberately allow selection of the output/series conductor in every stage. That is a pedagogical choice, not a safe default for a question asking which terminals are connected. Remove net exposures for that exercise; the visible circuit still remains public. All titles, descriptions, display labels, allowed target labels and separately supplied host captions need answer review.

## 3. Validate on the authoring host and project before distribution

From the repository root after `bun run build`, which makes the examples' public `circuitkit/v2` self-imports resolve the current build:

```sh
bun test tests/education-examples.test.ts
bun -e 'import { dividerAuthor } from "./examples/education/divider.ts"; console.log(JSON.stringify(dividerAuthor));' \
  | bun src/education-cli.ts project - --stage question \
  | bun -e 'const result = await Bun.stdin.json(); if (!result.ok) process.exit(1); console.log(JSON.stringify(result.document));' \
  | bun src/education-cli.ts render - --namespace migration
```

The final stdout is the CLI JSON envelope containing the public document and canonical SVG. Replace `dividerAuthor`/`divider.ts` with `ledAuthor`/`led.ts` or `loadedDividerAuthor`/`loaded-divider.ts` to exercise the other examples. The input author is private host data. The first CLI command performs explicit projection; the extraction step passes only the raw public document to rendering. Never render the author or project/render receipt envelope directly.

For file-based authoring, write the serialized author into a trusted local file, then use:

```sh
bun src/education-cli.ts project author.json --stage question --out question.public.json
bun src/education-cli.ts validate question.public.json
bun src/education-cli.ts inspect question.public.json
bun src/education-cli.ts render question.public.json --namespace migration --out question.svg
bun src/education-cli.ts render question.public.json --format png --scale 2 --out question.png
```

The CLI writes raw artifacts to `--out` and a receipt to stdout. Existing files are not overwritten unless `--overwrite` is explicit; parent directories must already exist. `circuitkit-education` is the registered built binary equivalent, separate from the unchanged v1 `circuitkit` command. PNG behavior is covered by the separate PNG suite; this example suite exercises core SVG and CLI projection/validation/rendering, not native PNG or installed-package behavior.

In a real host, authorize stage access before calling `projectFigure(author, stage)`. Keep the full author and alias map private. Send only `.document` to `EducationalFigure`, public Data/JSON, inspection, accessibility and export code. There is no cryptographic provenance or access control embedded in a stage string or namespace. Demo stage selectors do not represent assessment authorization.

## 4. Add a new scenario without changing the renderer

`loaded-divider.ts` reuses the same typed electrical, measurement and layout composition. It changes the input to 9 V, R1 to 1000 Ω and R2 to 2000 Ω, then connects a new 2000 Ω load from `VOUT` to `GND`. This changes actual terminal/route connectivity, not just a caption. Existing IDs are retained; `R3_a`, `R3_b`, `R3`, `load` and `load-return` are additions.

All three extension stages compile under `geist-light`, `geist-dark` and `geist-print`. The permitted `circuit/net/output` still identifies the output node, now including `R3_a` and its connected route; it excludes the nonconducting resistor body and ideal probes. The correction's 4.5 V is explicitly authored from a stated parallel-resistance calculation, not inferred by a hidden solver or the unloaded-divider operation. No core symbol, lesson branch, plugin registry or renderer implementation was added.

These generic migration/extension fixtures contain no Gradual data and no private answers from Gradual. They do not prove the Gradual adapter's corpus coverage. Keep real corpus qualification separate, private and governed by its existing adapter/coverage documentation.

## 5. Regression acceptance and remaining work

`tests/education-examples.test.ts` directly checks:

- All 27 immutable original v1 recipe/theme SHA-256 hashes against `tests/fixtures/unannotated-svg-hashes.json`, without regenerating the baseline.
- Complete LED/divider endpoint, conductor-group and component/value correspondence to the actual v1 examples.
- All three generic authors across three stages and three themes, deterministic rendering, public JSON roundtrips, identical existing part/target IDs and target bounds.
- Symbolic subscripts, unknown unit-bearing question readings, explicit correction values, reversed probe polarity and no probe-induced net merging.
- Opt-in net membership only; changed connectivity in the extension and anchor behavior after an intentional open.
- Rejection of invalid units, missing fault intent, raw legacy IDs in v2, author/public mixtures, and v1 documents passed to v2 APIs.
- Identical selected public documents, inspection, SVG/accessibility and fixed public diagnostics despite malformed/private nonselected stages. The whole-author bounded-JSON resource gate still applies.
- Source CLI projection followed by public-only validation and canonical rendering for each example.

This is behavior regression, not a pixel-level visual audit or a proof of an automatic migration algorithm. The three guides and all four public-import examples are already allowlisted and packed, and the examples have executed in the clean installed-tarball consumer. `test:education` already includes this regression file; see [packaged files](education-authoring.md#verification-and-packaged-files). There is no pending package-integration or import-rewriting step for these fixtures. This documentation correction modifies no package/app/index/core files. A general automatic migration implementation remains absent by design; do not document or export one as complete.

### Original authoring verification, 2026-09-16

The original authoring pass recorded these checks using Bun 1.3.11, before the subsequent installed-package qualification. These historical counts are not a new run of the current build:

```sh
bun test tests/education-examples.test.ts
bun test tests/education-examples.test.ts tests/v2-safety.test.ts tests/v2-nets.test.ts tests/v2-boundaries.test.ts
bunx --no-install tsc --noEmit --incremental false
bunx --no-install biome check examples/education/*.ts tests/education-examples.test.ts
```

All exited 0. The example suite passed **68 tests, 0 failures, 1664 assertions**, including all 27 original hashes. The combined boundary run passed **123 tests, 0 failures, 2307 assertions**. Full-project TypeScript emitted no diagnostics. Biome checked five files with no warnings or fixes required. The exact divider pipeline in step 3 also completed successfully with a public `divider-migration` document, seven allowed targets and a 16767-byte canonical SVG under namespace `migration`.

Initial local checks exposed an unsupported α glyph in a legacy alias test and three TypeScript issues in the new mapping assertions. The fixture now uses the renderable alias `upper R:1`, missing endpoint mappings fail explicitly, and ordered pin/component checks are correctly narrowed; all final checks above passed after those corrections. No v1 renderer or hash fixture was changed to obtain a pass.

Those authoring checks did not themselves qualify browser behavior or package installation. Subsequent clean installed-tarball qualification executed all four packaged examples and exercised standalone React/DOM 19.2.8, Next 16.3.3 and native PNG APIs. The [React peer decision](education-decisions.md#8-widen-react-peer-support-only-after-real-consumer-proof) records that evidence and its limits, including Next's separately bundled React canary. This docs-only correction does not rerun those consumer checks or claim an unconditional full-UI pass.
