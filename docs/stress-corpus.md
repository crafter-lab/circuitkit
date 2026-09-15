# Gallery corpus and deterministic renderer stress

## Scope: nine topologies, not hundreds of circuit solvers

The gallery covers the nine fixed version-1 role graphs in the current catalog: three basic graphs and six genuinely different complex graphs. Values, author IDs, focus targets, theme presets and deliberate wiring mistakes produce many cases of those graphs. Case counts do not imply arbitrary topology support, device simulation, electrical-safety certification or a universal correctness guarantee.

Gallery generation lives in `app/gallery/corpus.ts` and `app/gallery/complex-corpus.ts`. The shared runner is `app/gallery/stress.ts`, with `app/gallery/stress.worker.ts` for worker execution, `scripts/stress.ts` for the terminal, and `tests/stress.test.ts` for regression coverage. All use the same core renderer, scene builders, schema and themes.

## Gallery contract

`getGalleryCases(): GalleryCase[]` returns fresh documents, tags and expectations. `getGalleryCase(id)` returns a fresh matching case or `undefined`. IDs are `${recipe}/${scenario}/${theme}`; `scenarioId` omits the theme. Every scenario is crossed with every defined theme preset. Gallery documents round-trip through JSON. Nonfinite values and explicit undefined remain runtime stress inputs only.

Rows expose `id`, `scenarioId`, `title`, `description`, `recipe`, `preset`, `group`, `tags`, `document: unknown` and `expectation`.

- `group: 'examples'` contains intended successful drawings.
- `group: 'edge-cases'` includes valid boundaries and explicit expected rejections.
- `{ kind: 'render' }` requires successful rendering.
- `{ kind: 'diagnostic', code }` requires rejection, the named diagnostic and no SVG. Accompanying diagnostics are allowed.
- An expected rejection is a passing case, not a bug. Group alone does not determine validity.

The UI should display the expectation and never enable SVG export for a rejected document. Complex descriptions explain actual node connections and model limitations rather than merely labeling palette changes. Tags include `feedback`, `multi-pin`, `sharedground`, `parallelbranch`, `differential`, `bridge`, `2stage` and JSON pointers for focused/mutated entities.

## Measured gallery matrix

The current generator produces **272 scenarios × 3 themes = 816 cases**: **474 expected renders** and **342 expected diagnostics**. These are measured counts, not limits embedded in generation or stress acceptance.

| Topology | Scenarios | Cases |
| --- | ---: | ---: |
| RC low-pass | 39 | 117 |
| Voltage divider | 40 | 120 |
| LED series | 40 | 120 |
| Loaded divider | 20 | 60 |
| RC ladder | 21 | 63 |
| Wheatstone bridge | 21 | 63 |
| Bridge rectifier | 27 | 81 |
| Transistor switch | 29 | 87 |
| Inverting amplifier | 35 | 105 |

The original 357 basic cases remain unchanged in scope. Their hardcoded role loops use `basicRecipeIds`, never the expanded `recipeIds`. Tests retain the historical basic count only after filtering to basic recipes; the complete gallery matrix is derived from actual recipe/scenario/theme membership.

Basic variants retain low/audio/high RC cutoffs and inverse R/C scaling; ideal divider ratios and micro/giga-ohm scaling; drawing-only LED 3.3/5/9/12 V sources and varied resistance; custom/prototype-like IDs; supported Spanish/Greek glyphs; accents; individual component/net focus; escaped titles; endpoint ordering; and finite extremes. Explicit invalid cases retain pin, connectivity, role/topology, highlight, typography, contrast, token, SI and version/schema failures.

Each complex graph has its actual original values, four meaningful value variants, every individual component focus, every individual net focus, author-selected component/port/net IDs, and a valid declaration-order permutation. The author-ID scenario uses short `X` IDs and the net name `node/one~`, exercising slash/tilde handling without deliberately overflowing labels.

### Six complex graph families

- **Loaded divider:** three resistors with an explicit bottom/load parallel branch and common output/return nodes. Light versus heavy loading, practical unequal legs and whole-network scaling preserve that graph. This is not the unloaded two-resistor recipe.
- **RC ladder:** two series resistors and two shunt capacitors with distinct interstage and output nodes and a common return. Sensor/audio values, unequal shunts and inverse R/C scaling retain the coupled unbuffered transfer. Independent stage cutoff multiplication is not assumed.
- **Wheatstone bridge:** two excitation legs with separate left/right midpoint terminals. Balanced, unequal-arm and ratio-balanced examples retain differential outputs without a wire between midpoints.
- **Bridge rectifier:** four oriented diodes, two separate AC terminals and parallel DC load/filter branches. Load/filter variants do not imply ripple, diode-drop, inrush or output-voltage simulation.
- **Transistor switch:** a three-pin NPN collector path, separate control/base resistor node, LED branch and shared emitter/supply-negative return. 3.3/5/9/12 V drawings do not infer gain, saturation, current or switching time.
- **Inverting amplifier:** five explicit op-amp pins, an inverting summing node, output feedback branch, grounded noninverting input and separate positive/negative rails. Unity inversion, gain -2, attenuation and scaled gain -10 are ideal linear-feedback examples. Virtual ground is not a wire to ground; rail saturation and bandwidth are not simulated.

Complex gallery rejections include representative endpoint movement/exchange, disconnection, legal node splitting where possible, missing branches, wrong role types, all pairwise polarity/input/rail permutations on oriented or multi-pin components, mistaken ground bonds, differential midpoint shorts and virtual-ground/supply-rail bonds. A missing branch may fail schema first if removing its pin leaves a singleton net; it is correctly labeled `document.invalid_field`, not falsely required to reach the topology validator.

## Deterministic stress matrix

`getStressCases(): StressCase[]` returns stable fresh `{ id, document, expectation, tags? }` rows. Optional tags retain family and JSON-pointer provenance in result/failure rows. Every gallery case appears with a `gallery/` prefix. The systematic complex mutation matrix also includes the selected gallery mutations; those are explicit overlapping coverage, not additional topologies.

Only finite boundary sweeps use `{ kind: 'either' }`: rendering or an actionable representability/layout rejection is allowed, while every applicable invariant still applies. Ordinary values and all complex E12/value/order cases require rendering. Deliberate wiring mutations require their exact expected diagnostic, never `either`.

The current sweep has **5,486 cases**:

| Family | Construction | Cases |
| --- | --- | ---: |
| Gallery | 272 scenarios × 3 themes | 816 |
| Basic RC E12 | 12 resistances × 6 capacitors × 3 themes | 216 |
| Basic divider E12 | 12 top × 12 bottom × 3 scales × 3 themes | 1,296 |
| Basic LED values | 4 sources × 12 resistors × 3 themes | 144 |
| Basic IEEE754 | 8 × 8 values × 3 recipes × 3 themes | 576 |
| Invalid basic SI | 3 recipes × 2 roles × 6 invalid values × 3 themes | 108 |
| Finite basic theme metrics | 3 recipes × 2 tokens × 9 values × 3 themes | 162 |
| Invalid basic theme metrics | 3 recipes × 2 tokens × 6 invalid values × 3 themes | 108 |
| Optional undefined tokens | 3 basic recipes × 3 themes | 9 |
| Non-document public inputs | null, array, empty object, text, undefined | 5 |
| Complex graph mutations | Every endpoint target, net pair, component and oriented pin pair | 1,404 |
| Complex ordinary values | Each numeric component independently swept across all themes | 624 |
| Complex declaration order | 6 graphs × 3 themes | 18 |

E12 mantissas are `1, 1.2, 1.5, 1.8, 2.2, 2.7, 3.3, 3.9, 4.7, 5.6, 6.8, 8.2`. Basic RC uses kilo-ohms crossed with 100 pF through 10 µF. Basic dividers use micro-ohm, kilo-ohm and giga-ohm scales; basic LED resistors use E12 × 100 Ω. These baseline cross-products remain restricted to the three original recipes.

The six complex families sweep every numeric component role, one at a time with the other values unchanged: resistors use E12 × 1 kΩ, capacitors use E12 × 100 nF, and the transistor supply uses 3.3/5/9/12 V. All require rendering with the actual complex frames at every theme. These are ordinary values, not extreme-label cases allowed to reject. Joint changes are represented separately by the four meaningful variants per graph.

Basic IEEE754 values are `Number.MIN_VALUE`, `2 ** -1022`, `1e-310`, `1e-200`, `1`, `1e200`, `1e308` and `Number.MAX_VALUE`. Invalid values are zero, negative zero, -1, NaN and both infinities. Font/stroke metric sweeps retain smallest subnormal/normal, `1e-6`, `0.75`, `1`, `1.1`, `2`, `10` and the largest finite value, plus invalid values. There is no random seed, time-limited sweep or arbitrary repetition target.

### Systematic graph mutation coverage

For a graph with E endpoints and N nets, each endpoint is targeted at every other net: E × (N−1) cases per theme. If its source net has more than two members, the endpoint is moved. If it has exactly two, the endpoint is exchanged with the target's first endpoint. Both operations preserve unique membership and net cardinality ≥2, allowing the exact role-graph validator, rather than the schema, to reject the wrong wiring.

Measured totals across the six graphs and three themes:

| Mutation | Cases | Required outcome |
| --- | ---: | --- |
| Endpoint moves | 510 | topology mismatch |
| Endpoint exchanges | 300 | topology mismatch |
| Every endpoint disconnected | 225 | unconnected endpoint, or invalid field for singleton net |
| Every unordered pair of nets merged | 153 | topology mismatch |
| Every net with ≥4 endpoints split into two legal nets | 9 | topology mismatch |
| Every branch component and its endpoints deleted | 75 | topology mismatch or schema cardinality rejection |
| Every component role given the wrong type | 75 | topology mismatch, possibly with pin diagnostics |
| Every pair of pins exchanged on diode/LED/NPN/op-amp/source | 57 | topology mismatch |

This covers signal/ground and supply/ground shorts, bridge midpoint bonds, NPN base/collector/emitter permutations, op-amp differential inputs and positive/negative rail permutations. It does not imply all malformed JavaScript objects or every physical failure mode were enumerated. Mutation tags contain JSON pointers with `~0`/`~1` escaping and are retained in summary rows and unexpected failure reproductions.

## Shared execution and invariants

`runStress(): Generator<StressProgress, StressReport>` is synchronous. Consume `.next()` until `done` to obtain its returned report; `for...of` alone drops that return value. Each yield is exactly one completed case with `completed`, `total`, `passed`, `failed`, `rendered`, `rejected`, `elapsedMs` and `currentCase`. Timing is measured with `performance.now()`, not a performance guarantee or pass threshold.

Every case calls render twice, full validate and inspect. API exceptions are retained individually as unexpected invariant failures, not reclassified as ordinary rejections. Infrastructure errors surface through the worker's error message or fail the CLI.

Generic checks apply to all nine recipes and all catalog component types:

- Input immutability after every API call, preserving ordering, undefined, nonfinite values and signed zero in comparisons.
- Repeated complete render equality, including SVG, diagnostics, normalized documents and geometry.
- Full validate/inspect/render acceptance, diagnostics, bounds, versions and normalized circuit agreement; no SVG on rejected or non-render API results.
- Public schema acceptance of valid input/output; every catalog pin and declared terminal occurs exactly once, including NPN and op-amp pins.
- Original versus normalized values, IDs, ports, role mappings and endpoint graph; sorted endpoint membership and normalized focus IDs.
- Exact inspected endpoint/net membership, finite coordinates and standalone accessible SVG without executable/external content or NaN/Infinity.
- Finite nonnegative bounds, idempotent normalized rendering, and component-only/net-only focus invariance for paths, transforms, bounds and connectivity.
- Basic RC cutoff agrees with an independent logarithmic reference within display/subnormal rounding; basic divider ratios remain positive and finite and agree with a max-scaled reference. Near-one rounding to one is allowed; positive-value underflow must not fabricate zero.
- The original LED disclaimer/current invariant is restricted explicitly to `led-series`, not used as a catch-all for new graphs. Complex formulas are symbolic catalog models, not invented numerical simulations.

### Actual SVG wire checks for the six complex graphs

`routingInvariants` reconstructs segments from emitted `data-net` SVG paths and junction circles, not from `createComplexScene`'s internal route arrays. It uses inspected endpoint positions to verify:

- Every declared net has emitted orthogonal M/L wires.
- Each net's segment graph is connected; no isolated wire islands remain.
- Every endpoint is on its own net's wire and no other net's wire.
- Different nets neither touch nor cross in the current crossing-free curated routes.
- Every junction dot lies on its named net, does not touch another net, and has at least three incident wire directions.
- Reversing net/endpoint declaration order yields the identical normalized render and does not mutate the permuted input.

The test suite deliberately removes a wire, inserts an isolated same-net segment, adds a cross-net overlap and inserts a false junction. Each corrupt SVG is detected. The oracle is specific to the current explicit crossing-free orthogonal routing contract; a future intentional bridge/crossover or new path-command representation needs a deliberate test/contract update, not silent acceptance. It is not a general arbitrary-SVG circuit extractor.

`tests/complex.test.ts` independently measures direct-scene label/symbol/frame geometry and segment connectivity. The stress suite complements those checks with public-output invariants.

## Worker, terminal and artifacts

The worker receives `{ type: 'run' }`, sends one `{ type: 'progress', progress }` per completed case, then `{ type: 'done', report }`; infrastructure errors use `{ type: 'error', message }`. Cancel by terminating the worker and restart with a fresh worker. The Bun worker test verifies termination after real progress, restart and row-for-row parity with the synchronous runner, excluding measured elapsed times.

`StressCaseResult` contains ID, optional tags, expectation, pass flag, outcome (`rendered`, `rejected`, `threw`), diagnostics, invariant messages and elapsed time. Successful/expected-invalid rows retain neither documents nor SVG. `StressFailure` preserves original input, tags, expectation, diagnostics and invariant messages. Each failed case is counted once even if several invariants fail. A thrown initial render increments neither rendered nor rejected.

```sh
bun scripts/stress.ts
bun test tests/stress.test.ts
bun test tests/complex.test.ts
bun run typecheck --incremental false
./node_modules/.bin/biome check app/gallery/corpus.ts app/gallery/complex-corpus.ts app/gallery/stress.ts app/gallery/stress.worker.ts tests/stress.test.ts scripts/stress.ts
```

The CLI writes `artifacts/gallery/stress-report.json`, prints actual gallery/scenario/topology counts plus stress totals and timing, and exits 1 for unexpected failures. Its artifact path is relative to the script, not the caller's working directory. The JSON contains complete failure reproductions but no per-case SVG payloads. Nonfinite numbers/signed zero use `{ "$number": "NaN" | "Infinity" | "-Infinity" | "-0" }`; undefined uses `{ "$undefined": true }`, so those values are not silently changed to null or omitted. Worker messages use native structured cloning.

## Verification and regression expectations

Run the focused commands above against the checkout being evaluated. The matrix tables describe the corpus construction, not a fresh pass report; use the runner's printed totals and JSON report for actual outcomes. Test counts and timings can change as coverage grows. Expected diagnostics are successful rejection coverage, while unexpected failures produce a nonzero exit status and preserved reproductions.

Regression expectations include successful rendering for ordinary 3.3 V LED gallery and E12 cases, rejection without SVG for the retained positive finite divider-underflow input, and a rendered ratio of 0.5 for equal `Number.MAX_VALUE` resistors. These expectations must not be weakened to obtain a passing sweep.

See [testing](testing.md) for full-suite commands, local package verification and opt-in browser checks. Deterministic tests provide bounded corpus evidence, not universal correctness, electrical-safety certification or visual acceptance. Browser-engine parity, actual interaction and cancellation, UI routes and visual review require separate browser verification. Rerun after renderer changes rather than treating an earlier checkpoint as evidence for later code.
