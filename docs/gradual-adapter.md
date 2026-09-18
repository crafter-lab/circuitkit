# Gradual to educational v2 adapter

Local source entry point: `src/integrations/gradual.ts`. This adapter does not change `src/v2`, package exports, the original Gradual checkout, or the read-only corpus snapshot. It uses reusable family geometry, not lesson/question ID dispatch. The manifest and generated coverage/gallery remain local-only artifacts, excluded from package publication.

## API

```ts
import {
  adaptGradualFigure,
  adaptGradualPair,
  projectGradualPair,
  renderGradualFigure,
  renderGradualHost,
} from '../src/integrations/gradual.ts';
import { renderEducationalSVG } from '../src/v2/index.ts';

const adapted = adaptGradualFigure({
  kind: 'divider',
  caption: 'Read B relative to C.',
  supply: '2 AA pack',
  upper: 'R₁',
  lower: '2 kΩ',
  probes: ['B', 'C'],
}, { id: 'divider-example', theme: 'geist-dark', stage: 'question' });

if (adapted.ok) {
  const rendered = renderGradualFigure(adapted, 'divider-example');
  if (rendered.ok) {
    const { document, svg, html } = rendered;
  }
}

const pair = adaptGradualPair({
  id: 'graph:exercise-1',
  question: {
    kind: 'potentials', caption: 'Compare P with Q.',
    potentialLabels: ['P', 'Q', 'X'],
    potentials: ['−2 V', '−5 V', '0 V'], probes: ['A', 'B'],
  },
  correction: {
    kind: 'readings', caption: 'The signed difference is positive.',
    readings: { items: [{ label: 'P to Q', value: '+3', unit: 'V' }] },
  },
}, { theme: 'geist-light' });

if (pair.ok) {
  const selected = projectGradualPair(pair, 'question');
  if (selected.ok) {
    const svg = selected.document
      ? renderEducationalSVG(selected.document)
      : null;
    const html = renderGradualHost(selected.host);
  }
}
```

Signatures:

```ts
adaptGradualFigure(
  input: unknown,
  options?: { id?: string; theme?: Theme; stage?: Stage },
): Failure | {
  ok: true; model: StageModel; diagnostics: []; host: GradualHost;
};

adaptGradualPair(
  input: { id: string; question: unknown; correction?: unknown; teaching?: unknown },
  options?: { theme?: Theme },
): Failure | {
  ok: true; author: AuthorFigure; diagnostics: [];
  host: Record<Stage, GradualHost>;
};
```

Theme is `geist-light | geist-dark | geist-print`; stage is `teaching | question | correction`. Figure defaults are teaching/light. A pair defaults teaching and missing correction to independent copies of the sanitized question, never to a solution. An explicitly supplied teaching figure is independently adapted.

All figure inputs are decoded JSON figure payloads, not exercise envelopes or JSON strings. `null` and `undefined` explicitly mean no figure. Empty objects, unknown families/fields, wrong-family properties, invalid numbers, malformed nested payloads, accessors, custom prototypes, cycles and invalid electrical references fail with the fixed public `educational.invalid` diagnostic. Input objects are never mutated.

## Host boundary and current core constraints

Call these APIs on the trusted host. AuthorFigure, all stage models, and the complete pair.host map remain host-only. Authorize the requested stage before calling `projectGradualPair`; a stage string is not authorization. Send only the selected `{ document, host }` to a client. Never forward question/solution metadata, the manifest pair record, or the complete adapter result as learner props.

`projectGradualPair` now passes the original author envelope directly to the current core `projectFigure`. Only the selected model is schema-validated and compiled; malformed nonselected stage schemas, private IDs, changed panel kinds and unsupported nonselected glyphs do not affect its output. The core's whole-author bounded-JSON gate still rejects accessors, cycles, non-JSON values and resource-limit violations. The adapter reads and validates only `pair.host[stage]`, appends selected bounded public adjuncts, and revalidates/renders the complete public document. Nonselected host data is not read or returned. `renderGradualFigure` is the standalone convenience renderer.

Direct `projectFigure(pair.author, stage)` now supports empty selected stages with `display: []`; `renderEducationalSVG` returns `svg: ''` without a fabricated image. The adapter normalizes that validated empty display to `document: null` and `svg: null`, preserving the existing host API. There is no longer a substituted three-copy stage envelope or an empty-stage validation bypass. Direct core projection still does not compose separate captions, record tables or explicit adjunct geometry, so use the adapter helper for the complete Gradual composition.

`adaptGradualPair` remains a full trusted-author construction API: all supplied raw figures must be valid and cross-stage identity is checked. It intentionally rejects malformed correction input during author construction. Selected-stage noninterference applies to `projectGradualPair` and `projectFigure` after an author bundle exists, not to authoring validation. Coverage separately verifies full-author validity/identity and malformed-nonselected-stage projection isolation.

`GradualHost` contains only:

- `kind: figure | record | no-figure`;
- safe baseline/subscript/superscript caption runs;
- safe labeled note runs, including authored meter mode, quantity hints, interval labels and pin highlights;
- optional public record rows `{ id, label, value, missing, flagged }` and verdict runs;
- optional bounded public `Part[]` additions, such as current arrows, explicit highlighted traces and interval braces. Source-unit scale markers now use native core input fields, not host adjuncts.

No host object includes the original figure, hidden identity, private solution metadata, terminal membership arrays or automatically exposed net targets. Colors are generated only where an explicit authored visibility flag requests a hint. Color/geometry is deliberately visible information; it is not a public connectivity target group.

## No figure and records

```ts
const missing = adaptGradualPair({
  id: 'without-question-image',
  question: null,
  correction: {
    kind: 'record', caption: 'Correction record.',
    record: { fields: [{ label: 'Measurement', missing: true }] },
  },
});

if (missing.ok) {
  const question = projectGradualPair(missing, 'question');
  const correction = projectGradualPair(missing, 'correction');
}
```

The question has `document: null`, `host.kind: no-figure`, and no SVG/image/placeholder. The correction returns public record rows for `renderGradualHost`, which emits an escaped semantic table with row headers and visible missing/flagged states. Long values and verdicts are retained in full, not clipped at the original renderer's 52-character limit. A missing row deliberately excludes its latent value. Record is host-composition-verified, not skipped and not falsely labeled native.

The ten manifest foundations use `diagram: none` and originally render null. Their original host contexts remain in the coverage records. The adapter does not invent diagrams for their surrounding teaching text. Host lesson prose remains the host's responsibility.

## Per-field question policy

Question policy runs before constructing the StageModel or public host content. Teaching/correction honor authored visible data and flags. No field is recovered from a solution when missing on the question.

| Field | Question | Teaching/correction |
| --- | --- | --- |
| `caption` | Only the question figure's authored caption, safe runs | Only the selected figure's authored caption |
| `supply`, `upper`, `lower`, `load`, `current` | Retain authored nominal text exactly; no inferred current or component value | Same |
| `open`, `bypass`, `probes` | Retain explicit state and ordered red/COM references | Same; no ideal-meter result is invented |
| `voltmeter` | Requires explicit probes for loop/divider/LED/potentials; missing probes fail instead of discarding the meter | Same. Only supply has the original explicit 3V3/GND default probe composition |
| node-comparison generated conclusions | Do not generate the fixed one-node/two-node host notes. An explicitly authored caption/hint is preserved unchanged | Fixed explanatory notes remain enabled for teaching/correction |
| `showNodes` | False removes node labels; explicit electrical terminals still exist as geometry | Same |
| `highlightNodes` | Retain explicitly authored highlighting, with no target/net allowlist inference; open/bypass states suppress conductor-hint strokes and their generated note | Same-kind correction uses only freshly generated conductor hints. It never inherits a question hint stroke over an opened or bypassed route; base graph IDs remain stable |
| `board.unknown` | Delete corresponding private `mcu`/`bridge` fields; emit MCU ? / USB bridge ? | Unknown flags also suppress their latent identities |
| `board.pins[].name/role/highlight` | Retain authored visible pins and highlights | Same; no inferred GPIO capabilities |
| `readings.items[].value/unit/mode/label` | Retain authored readings and mode | Same, signed strings preserved |
| `readings.difference` | Remove completely | Include only when authored, never calculate it |
| `readings.quantity` | Retain explicitly authored visible quantity hint | Same |
| `levels.value/low/high/max` | Retain given marker and thresholds | Same |
| `levels.showResult` | Force false before model construction | Classify only when true |
| `timeline.start/now/max/unit/window` | Retain counters and authored interval | Same |
| `timeline.difference/showDifference` | Remove expression, force false | Show the authored expression only when enabled; derive elapsed only when enabled with no authored expression |
| `scale.value/from/base/prefixed/factor/ticks` | Retain given quantity and rulers | Validate the exact SI factor, not an arbitrary conversion claim |
| `scale.showResult` | Force false; a prefixed given does not put its base-unit converted value into the model or public text | Show conversion only when enabled |
| `power.voltage/current/resistance/power` | Numeric known units must match the field dimension. Reject incompatible units, nonfinite values and nonzero underflow before any symbolic fallback. Symbol units are separated once | Same; no solver is invoked. Unitless prose retains its nominal display, with an unknown typed quantity rather than an invented magnitude |
| `power.formula` | Retain an explicitly authored visible formula | Retain explicit formula; omit the source renderer's automatic P = V · I default |
| `signal.samples/changes/unit` | Retain both modes when both are authored; supplied unit is used, with ticks as the default for samples and ms for transitions | Same. Samples use the explicit adapter convention start=1, period=1 in the supplied unit |
| `signal.settles/end` | Valid for transitions. Reject sample-only use rather than silently ignoring timing/state fields | Same |
| `signal.markEdges/sampleLabels` | Retain authored edges and sample-label policy. Reject sampleLabels without samples | Same |
| `signal.window/accept` | Sample-only windows and acceptance markers use the sample interval and supplied unit. Out-of-range annotations fail. With transitions, these fields annotate the transition panel | Same; sample-only acceptance is an authored marker, not a computed debounce answer |
| `record.fields[].missing` | Remove hidden latent value and show missing | Same |
| `record.fields[].flagged/verdict` | Retain explicitly authored visible content from the question itself | Retain selected correction content |

The question flags are explicit adapter policy, not claims about what a raw source renderer would expose if accidentally handed a correction payload. Captions are authored public content, not automatically redacted answer prose. A host must choose the question-side figure correctly.

## Family mapping

| Gradual family | Typed v2 model and host composition |
| --- | --- |
| loop/divider | Real source, resistor(s), terminals, routes, return-path open, explicit component bypass, optional parallel load, authored current reading/arrows, nodes and ideal probes |
| led | Source and resistor in series with an actual LED component, terminal order anode then cathode; A/K labels |
| pullup | Pull-up resistor, actual open/closed button, GPIO branch and GND terminal; no fake resistor substitute for a button |
| fragment | Explicit labeled terminals, orthogonal bends, optional resistor at `resistorAfter`; open-ended fragments are legal |
| node-comparison | Separate uninterrupted P/Q wire and resistor-separated A/B electrical panels; generated count conclusions only in teaching/correction |
| potentials | Free terminals with signed host-only reference potentials, visible authored potential readings, optional ordered ideal-meter probes; no automatic subtraction |
| supply | Sensor board body and explicit 3V3/GND terminals, optional voltmeter with authored reading or unknown display |
| breadboard | Explicit contacts for the three selected rows, exact five-contact partitions, visibly authored conductor groups, aligned resistor components; no inferred center gap or rails |
| signal | Samples and/or transitions, explicit initial/settled state mapping, supplied units, sample labels/indices, edge annotations, timestamps, windows and authored acceptance. Sample-only annotations are rendered explicitly; end/settles require transitions. Debounce is enabled only for transitions with authored acceptance plus window duration |
| timeline | Counter positions, `max + 1` exclusive modulus and the source's explicit one-wrap interpretation, optional interval brace and native authored readings expression, including ≥/≤/≠ operators |
| levels | Typed thresholds and value; classification gated by policy |
| power | Typed V/I/R/P authored readings, original nominal labels, optional authored formula |
| bars | Signed typed bars, explicit role labels, threshold/rating and original display text. Recognized prefixed numeric units convert internally to base units, never arbitrary nominal strings |
| scale | Native typed SI rulers with `input: { from, magnitude }` in the authored source units and gated conversion. The native marker shows only the given label in questions; no base-unit converted scalar is put into public metadata. No host marker workaround or duplicate given-reading panel |
| readings | Typed readings plus authored mode and quantity host notes; no guessed difference |
| board | Typed board/chip bodies and a separate typed pinout using only authored pin names/roles; unknown identities are removed |
| record | Public typed host rows and safe table, not a substitute image |

Source omissions have explicit policy: no unconditional power formula; no new level result, elapsed answer or conversion when its flag is absent/false; no automatic voltmeter answer; no solution copied into question. Fixed family scaffolding from the source renderer, such as the pullup button, sensor body, breadboard partial rows or node-comparison example, is retained without lesson-ID branching.

## Text and identity

`gradualText` lowers inline math into safe runs, including R₁ and R_1 subscripts, superscripts, signed text, all command forms found in the attested corpus, common SI spacing and simple fractions. It is not a TeX evaluator. Unknown commands remain inert literal text. Bare sub/superscripts require a single complete suffix token (or braces), so ordinary multi-letter identifiers such as `AUTHORED_WINDOW` retain their underscore instead of becoming a partial math script. Script/style/iframe/object bodies, HTML tags, and forbidden HTML/URL/image TeX commands are stripped; every remaining host character is escaped. No authored HTML/SVG/CSS/URL is injected. Unsupported SVG glyphs are not silently erased.

Nominal component labels such as `2 AA pack`, `R2 ±5%`, `MΩ scale`, `?`, and `R₁` stay labels, not fabricated known SI values. Dimensioned power/meter/potential fields validate recognized units before fallback: voltage `5 A` is invalid, not `5 A V`. Numeric overflow and nonzero underflow, including a literal that underflows during parsing or prefix multiplication, are rejected; actual zero remains valid. An explicit base unit is removed from the symbolic runs before attaching the typed unit, so `V_s V` renders one V unit and retains its subscript. Symbolic prefixed quantities are explicitly unsupported rather than silently dropping their prefix. Unitless prose such as `2 AA pack` stays visible in its nominal reading/measurement title while its typed quantity remains unknown, never a guessed number. Neither symbolic expressions nor captions are evaluated.

Pair IDs are deterministic bounded encodings when legacy punctuation is incompatible with v2 IDs. Panel/component/route IDs describe family roles and remain stable when only values change. Same-kind corrections merge base electrical identities and retain unaffected panels; changed-family explanations use separately positioned correction panels rather than changing a panel kind under an existing ID. Missing correction data does not remove the question figure. Same-kind conductor hints are regenerated solely from the correction figure: reserved `figure/host/hint-*` parts and their generated `figure-highlight` note are never inherited from the question. This prevents an old continuous highlight from painting across an intentional open gap or misrepresenting a bypass/changed node group. Unchanged hints retain the same semantic IDs when freshly generated, unrelated authored notes remain additive, and changed-kind additional panels retain the unchanged base question graphics. Arrays without source item IDs use stable positional slot IDs; insertions/reordering of such source arrays are not represented as identity-preserving edits. Pin IDs use authored names; core signal edge IDs use event times.

`gradualTutorTarget(legacy, panelId?)` is the only legacy `lesson-figure-*` string mapping. It returns a candidate semantic part ID, not a public permission. The caller must verify that the part exists and explicitly add an appropriate core allowlist target if desired. Default `expose` is always empty; no legacy strings or private net groups reach the public target manifest.

## Family annotation geometry: ISSUE-004 / ISSUE-006

The main-app evidence in `docs/education-web-qa.md` identified labels on leads, junction dots and board borders. The adapter now finishes the selected canonical public document with `layoutGradualAnnotations(document, model)`. This is SVG/public-part geometry, not CSS: the same positions feed `renderEducationalSVG`, native PNG checks and the application's SVG-to-PNG export path. No running production server was rebuilt or modified by this work.

Placement uses family geometry and semantic component/terminal/contact roles, never lesson IDs:

- Vertical component labels sit beside their leads. The normal preferred offset is 32 drawing units; LED labels use 44 to clear emission arrows, and load labels prefer the left side. Pullup resistor and Released/Pressed annotations are separated from leads and switch dots.
- Terminal labels prefer a 16-unit lateral offset. Bounded alternative positions avoid neighboring horizontal/vertical/diagonal wires, probe paths, node circles and other labels. This handles LED A/K and fragment/loop C without moving a terminal or wire.
- Breadboard contact labels use a 12-unit lateral offset and an ink center 18 units above their contacts. Their alternative positions are checked against the inserted resistor leads as well as row buses and contact rings. R₁/R₂ retain their component IDs and move beside their symbols.
- Supply uses the core worker's new terminal `labelAt` API: A/3V3 has baseline `(168, 45)` and C/GND `(168, 175)` inside the board, while the actual terminals remain at `(200, 40)` and `(200, 170)`. Existing explicit component/terminal `labelAt` choices are honored, not overwritten; component value parts remain under the core's `valueAt`/default handling.

The bounded placement search uses measured glyph-outline bounds with six drawing units of clearance, rejecting segment/circle/filled-region intersections and text overlaps. Paint order matters: labels can be inside an earlier board body, but cannot be hidden by a later opaque background shape. If no safe candidate exists, the projection fails rather than erasing text, shrinking fonts, adding white masks or moving topology. `gradualAnnotationCollisions(document, clearance)` supplies a separate report of text-bound/stroke, dot and paint-occlusion collisions. Its boxes conservatively enclose actual glyph ink, including subscripts and operator outlines.

Regression checks cover every real payload and the actual 18 demos from readonly `app/education/examples.ts` (the supplied shorthand `app/examples.ts` does not exist). They verify all stages/themes, one-unit ink/stroke clearance, idempotence, input non-mutation, unchanged non-text shapes, and unchanged text runs, font sizes, paints, target definitions and part IDs. Caption math and no-reveal policies are unchanged; no conclusions or labels are introduced by placement.

Visual evidence and limits:

- `artifacts/gradual-corpus/coverage-layout-before.md` records read-only inspection of the paired pullup/LED/breadboard main-app screenshots. An isolated CLI attempt without user configuration failed authentication; the configured read-only profile succeeded.
- `artifacts/gradual-corpus/coverage-layout-png-review.md` records inspection of 12 current 640-pixel canonical PNG previews, light/dark pairs for pullup, LED, breadboard, fragment, loop and supply. Every requested label was visible and no label/lead/node intersection was observed. Temporary 640-pixel PNG files used for inspection were removed; coverage retains separate deterministic 256-pixel native-raster hashes for the same canonical geometry.
- Remaining observations: some outer labels have tight padding under the core's snug export bounds; existing duplicate `R · R` text and the LED's node-A/anode-A naming can look ambiguous. Their content was deliberately preserved rather than rewritten as part of a collision fix. Mobile small-text/density findings (ISSUE-007), Case-select clipping, and a freshly rebuilt main-app browser pass remain outside this annotation-only change. These PNG previews are not a claim of mobile or live main-app approval.

## Coverage and gallery

```sh
bun --no-env-file --no-install test tests/gradual-adapter.test.ts
bun --no-env-file --no-install scripts/check-gradual-coverage.ts
bun --no-env-file --no-install node_modules/typescript/bin/tsc --ignoreConfig --noEmit --strict --noUncheckedIndexedAccess --target ES2022 --module ESNext --moduleResolution Bundler --allowImportingTsExtensions --resolveJsonModule --esModuleInterop --skipLibCheck --types bun,node src/integrations/gradual.ts scripts/check-gradual-coverage.ts tests/gradual-adapter.test.ts
bun --no-env-file --no-install node_modules/@biomejs/biome/bin/biome check src/integrations/gradual.ts scripts/check-gradual-coverage.ts tests/gradual-adapter.test.ts
```

The runner reads the actual manifest shape. It joins pairs through `questionCaseIds` / `solutionCaseIds` → occurrence → exact figure, not through nonexistent inline `pair.question.figure` fields. It retains all original occurrence stage, bank, source and context fields. No occurrence is deduplicated away. All 344 exact payloads are tested in all three stages and all three themes, including independent question sanitization. All 319 pairs receive three-theme selected-stage rendering, full core author validation, base panel/component/terminal/route identity checks and correction-caption differential checks. Each pair/theme also receives five changed or malformed nonselected-stage variants with malformed nonselected host payloads, comparing the complete selected response, direct core document, SVG and host HTML. Additional tests verify that nonselected host getters are never read, selected malformed data still fails closed, and returned correction objects cannot mutate question data.

Outputs:

- `artifacts/gradual-corpus/coverage.json`: every occurrence/exact/pair/foundation, per-stage/theme status and actual host reasons, public document/SVG/host hashes, native PNG hashes and dimensions, source/manifest hashes, fingerprinted current core/adapter inputs, reasons for failures, and resolved/open core requests. Core and adapter inputs are hashed before and after the run; changing inputs invalidate the proof.
- `artifacts/gradual-corpus/coverage.md`: summary, all 18 families and all 652 occurrence statuses.
- `artifacts/gradual-corpus/coverage-gallery.md`: all 12 exact records rendered through the safe host table plus current canonical question SVGs for the actual 18 main-app demos, in all three themes. Host CSS inherits the gallery/application theme; no standalone native record raster is claimed.

Status meanings:

- `native-verified`: the complete selected figure has no host content or adjuncts after sanitization; its SVG renders deterministically and its native panel passes raster verification.
- `host-composition-verified`: actual selected host content is present, including a caption, notes, a record table, or public adjunct geometry, or the selection is explicitly no-figure. The host renderer validates and safely serializes it; any native panel portion passes the same native checks.
- Each stage/theme check records `hostReasons`, `nativePanelVerified` and `inkCollisionCount` separately. Collision failures are blocked, never counted compatible. Classification is computed from the returned host data and rendering behavior, never a static family compatibility catalog. A caption-only figure is host composition even when every diagram primitive is native. An empty or stripped caption does not create a caption reason.
- `blocked`: a required check failed, with a reason. Never counted compatible.
- `pending`: no successful proof yet. Never counted compatible.

Pair checks verify the composed selected-stage SVG and ink clearance but do not add pair PNG raster counts. Exact checks supply the 344-payload native raster proof; the actual 18 generic main-app demos add 162 stage/theme checks and 153 native rasters. Null/record host-only stages correctly contribute no fake PNG. The runner exits nonzero if any occurrence, exact figure, pair or foundation is blocked/pending, and rejects a changed count baseline rather than silently accepting corpus drift.

Current-core regeneration: all 652 occurrences, 344 exact payloads, 319 pairs and ten explicit no-figure foundations are host-composition-verified, with zero blocked/pending. This status now includes actual caption handling; the real payloads have host captions, so the older 299-native/353-host split is superseded rather than reused as a static catalog. Native portions still pass independently: 3,096 exact stage/theme checks include 2,988 native rasters (332 visual payloads × nine checks; twelve record payloads intentionally have no SVG). The runner also passed 957 correction-caption differential checks, 957 full-author/identity checks and 4,785 changed/malformed-nonselected-stage cases. The 18 actual generic demos add 162 stage/theme checks with 153 native rasters. Across corpus and generic standalone native images, 3,141 ink-collision checks pass; the composed pair checks also report zero collisions.

The adapter now has 54 tests, including four annotation-layout tests that cover the corpus, all actual generic demos, topology/text preservation and occlusion detection. Six review-regression tests first reproduced the reported failures, then passed after the fixes; they cover node-count no-reveal, rendered open-gap preservation, unit/underflow rejection, symbolic/nominal text, sample-only annotations, and mandatory meter probe references. Combined verification with `bun --no-env-file --no-install test tests/gradual-adapter.test.ts tests/v2-engine.test.ts tests/v2-safety.test.ts tests/v2-boundaries.test.ts tests/v2-quality.test.ts tests/v2-annotation-layout.test.ts` passed 167 tests, zero failures, and 36,024 assertions (exit 0). Focused TypeScript, Biome and the coverage runner also exited 0. Exact commands and results are in `artifacts/gradual-corpus/coverage-verification.json`. Regenerate after core/adapter changes; reports are deterministic and contain input fingerprints instead of a timestamp.

This is functional adaptation/raster/serialization proof, not original-renderer screenshot equivalence, a browser accessibility audit, or a general layout-overlap guarantee. No original source writes, dependency installation, commits, publishing or deployment are part of this work.

## Current core handoff

Resolved in the current core and exercised by this adapter:

1. Empty selected stages: native validation/projection accepts empty panels/display and returns an empty SVG string. The adapter normalizes the validated empty display to null, with no placeholder.
2. Source-unit scales: native `input.from` and `input.magnitude` preserve prefixed givens without exposing converted question text. Both directions now use this native path; the host marker workaround has been removed.
3. Operator outlines: `≥`, `≤`, `≠`, `←`, `↑`, `↓`, `↔`, and `Δ` have bounded v2 outlines. The two previously failing real ≥ timeline payloads now render their expressions as native reading panels. Ordinary text still uses the pinned font; unsupported characters outside the supported sets still fail closed.
4. Readings layout: measured glyph advances/ink bounds now determine value-column and row spacing. The old fixed 80-unit gap is no longer a core limitation. Tests exercise long adapter labels and the core quality suite checks ink separation. Arbitrary panel-to-panel overlap is still an author-layout responsibility, not a blanket guarantee.
5. Selection independence: the core validates only the selected stage schema. Full `validateAuthorFigure` still catches cross-stage kind/identity violations and remains a separate authoring check. The adapter no longer substitutes selected copies for other stages during projection.

Only native Record remains optional/unimplemented. Records are valid public host data rendered through safe semantic tables, with full functional coverage and no fabricated image. This is not a coverage blocker.

Package exports/build wiring, React/CLI integration, host lesson prose, richer tutor targets, original-renderer comparison and browser visual review remain outside the assigned adapter files.
