# Compact schematic composition

Accepted visual direction, 2026-09-19. After reviewing the real previews, Hunter approved compact as the default and requested regeneration across the web. `rc-lowpass`, `inverting-amplifier`, and `bridge-rectifier` now select it automatically. This is not the `.ck` language, a new symbol standard, an autorouter, or a simulator. The other six recipes retain their existing supported layouts.

## Contract

```ts
import { renderSchematicSVG } from "circuitkit";

const result = renderSchematicSVG(document);
```

Composition is resolved automatically, not an authored circuit edit. IDs, values, components, port declarations, pin membership, annotations and steps remain in the normalized document. No device, pin, supply, ground or connection is inferred. The schematic, PNG schematic, lesson and editor paths select compact for the three supported recipes without any flag. Explicit `composition: "classic"` remains a compatibility escape hatch, not a visible preview mode. Explicit compact on an unsupported recipe still fails with `schematic.unsupported_composition`; omitted composition preserves that recipe's existing layout.

The scene builders reuse the existing conventional symbols, pinned Geist glyphs, net routes, junctions, themes, annotation placement and renderer. Compact relocates elements and their declared connections. It does not scale the complete old scene, remove type/value labels, hide supply pins or substitute decorative cards.

- RC: shorter input/output wires, nearer capacitor and ground, resistor label closer to its body.
- Inverter: shorter feedback loop, input and output runs, ground return and supply wires. All five U1 terminals and all declared external ports remain. U1's label sits outside the signal/supply routes. Ground was moved further left after an enlarged-font regression exposed a collision.
- Rectifier: shorter diode columns and rails; load and filter aligned at the same height. Four diode polarities, both AC inputs, DC output, capacitor and load are preserved. All seven branching junctions remain explicit. The repeated `Diode` type labels are retained, not mistaken for removable authored values.

The successful schematic result also exposes `endpoints` in the same SVG user coordinates as its bounds. `SchematicRenderResult` keeps the field optional in its structural type for compatibility with existing `RenderResult` consumers; successful `renderSchematicSVG` calls populate it. Existing `inspect(document)` remains a classic-layout inspection. Do not combine classic inspect coordinates with a compact SVG.

## CLI, PNG and React

From this source checkout, use the local source CLI or an isolated build. The previously published package is not changed by this work.

```sh
bun src/cli.ts render examples/rc-lowpass.json --schematic --out circuit.svg --json
bun src/cli.ts render examples/rc-lowpass.json --schematic --format png --scale 2 --out circuit.png --json
```

Use fresh paths. The existing atomic writes and refusal to overwrite still apply. `--composition` accepts `classic` or `compact`, only with `render --schematic`. It is not a `.ck` / modular `--view` flag and cannot accompany full `--figure` output. PNG accepts `{ schematic: true, scale: 2 }` and uses the same automatic default; malformed options fail explicitly.

Markdown `--block` remains one-based. For compact rendering only the selected legacy block is validated with compact schematic geometry. Every other block still undergoes its existing full validation, even when its topology has no compact recipe. An invalid unselected block still rejects the entire input. The library parser's optional third argument is `{ index, composition? }`, where `index` is zero-based and omitted composition resolves automatically; no-selection parsing is unchanged.

```tsx
<CircuitSchematic document={document} />
<CircuitLessonFigure document={document} activeNet={net} onActiveNetChange={setNet} download />
<CircuitLessonSequence document={document} />
```

These components reuse the existing selection, screen-transform hit testing, annotation labels, keyboard controls and authored steps. Sequence validation, step requests and recovery all use the selected composition. `layout="compact"` still means compact lesson chrome; `composition="compact"` separately selects circuit placement. Even with expanded chrome, a resolved compact composition previews and downloads the annotated schematic, not a full framed lesson export. Downloads preserve saved selection, never transient hover.

Compact React diagrams stop shrinking at 75% of SVG userspace and scroll horizontally within their container. Default 18-unit component references therefore remain at least 13.5 CSS px, with 24-unit values at least 18 px. This is a tested reading policy, not accessibility certification. The full diagram may require horizontal scrolling on narrow screens. Standalone SVG hosts own their own sizing policy.

Editor schematic/annotated views, the landing's schematic components, lesson views, gallery cards, detail pages and gallery SVG downloads share the new schematic default. There is no classic/compact selector. Share JSON does not serialize a renderer option, so existing documents adopt the new default without rewriting their circuit. Legacy framed APIs (`renderSVG`, `renderFigureSVG`, `inspect`, and explicit full-figure exports) remain stable for compatibility and are not the gallery's preview renderer.

## Reproduce the evidence

```sh
bun scripts/preview-compact.ts --out artifacts/compact-composition-2026-09-19/my-fresh-run
bun scripts/preview-compact.ts --serve --out artifacts/compact-composition-2026-09-19/my-fresh-run --port 4320
```

The harness initializes absent input files from the canonical examples, rejects stale or modified existing inputs and never overwrites them. It retains one byte-identical input per circuit/theme for both modes, SHA-256 receipts, 81 pre-change default-output hashes, the source fingerprint, CLI argv and exit codes. It exports 18 SVGs and 18 scale-2 PNGs through the real CLI, not a mock renderer. The browser bundle imports the actual React lesson components. No dependency install, shared `dist` replacement, Next build, publication or remote service is needed.

Current preview generation: `artifacts/compact-composition-2026-09-19/preview-default-final/`. It shows one schematic per recipe with no comparison selector; the manifest separates 81 historical compatibility checks from 9 new-default checks. The original before/after delivery remains preserved at `artifacts/compact-composition-2026-09-19/preview-final/`.

Historical evidence files:

- `inputs/*.json`: editable same-source pairs and separate pre-existing teaching examples.
- `<recipe>-<theme>-<composition>.svg` / `.png`: actual CLI outputs.
- `<recipe>-before-after.png`: two actual CLI PNGs placed at equal reading width, with comparison headings. The circuits are not redrawn.
- `manifest.json`, `baseline-verification.json`, `receipts/`: generation provenance.
- `browser-final-*.json`: desktop/mobile DOM geometry and observed interaction state.
- `bridge-viewport.png`, `dark-viewport.png`, `print-viewport.png`, `narrow-viewport.png`: nonblank viewport captures.

### Measured bounds, identical light-theme inputs

| Circuit | Classic SVG units | Compact SVG units | Endpoint count |
| --- | --- | --- | --- |
| RC | 712.6 × 292.78 | 512.6 × 245.78 | 7 → 7 |
| Inverter | 1292.6 × 728.78 | 871.0 × 535.10 | 14 → 14 |
| Rectifier | 1374.6 × 799.52 | 964.6 × 553.52 | 16 → 16 |

These are geometric measurements, not proof of improved comprehension or superiority to another tool. The referenced research and Schemdraw image are editorial guidance, not a matched competitor benchmark or normative certification.

## Initial increment verification, 2026-09-19

This historical verification preceded promotion to the default. Subsequent default/web gates are recorded separately; the old default hashes now verify explicit compatibility output, not the new default.

All commands below exited 0:

```sh
bun --no-env-file test ./tests/compact-composition.test.ts ./tests/compact-api.test.tsx ./tests/renderer.test.ts ./tests/complex.test.ts ./tests/schematic.test.ts ./tests/stress.test.ts ./tests/png.test.ts ./tests/react.test.tsx ./tests/lesson-figure.test.tsx ./tests/compact-figure.test.tsx ./tests/steps.test.tsx ./tests/markdown.test.ts ./tests/diagram-markdown.test.ts ./tests/language-markdown.test.ts ./examples/compact-composition/harness.test.tsx
bun --no-env-file run typecheck --incremental false
bun --no-env-file ./node_modules/@biomejs/biome/bin/biome check src/renderer.ts src/complex-scenes.ts src/cli.ts src/index.ts src/png.ts src/react.tsx src/lesson-figure.tsx src/lesson-sequence.tsx src/markdown.ts tests/compact-api.test.tsx tests/compact-composition.test.ts scripts/preview-compact.ts examples/compact-composition
git diff --check
```

Test result: 1,364 passed, 3 skipped, 0 failed, 176,997 assertions. Two existing opt-in browser tests and the harness's opt-in completed-export test were skipped by this combined command. Export verification was performed by the generator and browser behavior separately by agent-browser. This is not a claim that the entire repository test suite ran.

The package build ran in `artifacts/compact-composition-2026-09-19/build-ZkUsSl`, copied from the current source, using `bun --no-env-file scripts/build.ts --skip-fonts`. Shared `dist` was not replaced. The built CLI rendered the compact inverter successfully. `CIRCUITKIT_TEST_CLI="$BUILD/dist/cli.js" CIRCUITKIT_TEST_RUNTIME="$(command -v bun)" bun --no-env-file test ./tests/cli.test.ts` passed 90 tests / 1,562 assertions, exit 0. This was a build qualification, not a new published package or installed-consumer claim.

Coverage includes exact pre-change hashes; deterministic output and input immutability; all three themes; renamed IDs, reordered declarations and SI value variants; all-net highlights; endpoint continuity; capacitor separation and diode polarity; mandatory dots at every branch; injected missing wires/false junctions/shorts/crossings; wire-versus-symbol intrusion; measured labels; actual raster containment; enlarged fonts/strokes; invalid options, unsupported recipes, Markdown all-block validation and destination safety. These layouts avoid cross-net crossings entirely; no new crossing/bridge convention was introduced.

Browser observations at 1440×1100 and 390×844: ten SVGs present, zero diagnostic alerts, every glyph group within its viewBox, no document-wide horizontal overflow. Compact lesson scale is approximately 0.75 on mobile, with local scroll widths of 384 and 653 px. Keyboard selection saved the RC `output` net; Escape cleared it. Clicking existing step controls selected the RC output-node step and the op-amp supply-pin step. A theme change resets uncontrolled sequence progress because the host supplies a new document, as before.

Limits: the browser daemon did not persist across shell calls, so final checks ran within one owned command and closed its session. Some selector-cropped screenshots of offscreen content were blank; they are retained but excluded from evidence. Later full viewport screenshots have nonzero pixel content. This session could inspect DOM geometry, raster pixels and interaction state, but had no tool that returned local image pixels to the model for direct visual judgment. At that initial delivery the previews awaited human visual acceptance. Hunter subsequently approved them and requested compact as the default. That approval does not replace an electronics-expert review. No electronics-expert review, simulation, IEC/IEEE audit, arbitrary topology support, external browser matrix or production deployment was performed.

## Next increments, not implemented here

### 1. Component authoring from `.ck`

Separate grammar/contract increment. Reuse component schemas, pins, symbols and existing diagnostics; author resistors, capacitors, diodes, transistors and op-amps with explicit refs, SI values and net membership. Keep modular views semantically valid: a rectangle can correctly denote an IC or module. Never infer a module's internal circuit or pinout. Acceptance: equivalent `.ck` and JSON produce the same declared graph and compact output for these three cases; unsupported constructs diagnose with source ranges. Requires an explicit authoring decision, not more layout work.

### 2. Consistent interaction across entry points

Consolidate component/net selection and step context in the main editor/reader using the existing lesson components and hit-testing primitives. Define keyboard, pointer, touch, hover-versus-saved selection, shared links and exports consistently. Acceptance: one declared target maps to one explanation and survives the chosen persistence rules across themes/views without changing connectivity; print remains understandable without color. No replacement interaction renderer is needed.

### 3. Linked signal graphics

A separate data contract for samples linked to declared nodes or buses, with explicit provenance: authored illustration, measured data or externally simulated data. Reuse existing signal/timing capabilities where suitable. Acceptance: cross-selection links the correct IDs and displays source/units/timebase and limitations. Do not claim an electrical solver, derive fictional traces, or animate illustrative flow as measured current.
