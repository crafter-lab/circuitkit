# Education engine v2 contract

Status: implemented and locally verified. Core lives in `src/v2/`, excluding parent-owned `react.tsx`. This change does not modify legacy source, package, build, CLI, React, or app files. Import the source entry point until the parent adds package exports.

## Required entry points

```ts
import {
  projectFigure, renderEducationalSVG, validateEducational, inspectEducational,
  defineAuthorFigure,
  type AuthorFigure, type PublicFigure, type Stage,
} from '../src/v2/index.ts';

const projected = projectFigure(author, 'question');
if (projected.ok) {
  const rendered = renderEducationalSVG(projected.document, { namespace: 'exercise1' });
}
```

`Stage = 'teaching' | 'question' | 'correction'`.

`projectFigure(author: unknown, stage: Stage)` returns `{ ok: true, document: PublicFigure, diagnostics: [] }` or `{ ok: false, diagnostics }`. Projection runs on the trusted host BEFORE any client props, accessibility, scene, export, logging, or inspection. Stage authorization is entirely the host's responsibility. A stage string is not authorization.

`renderEducationalSVG(input: unknown, options?: { namespace?: string })` accepts ONLY the public schema and returns `{ ok: true, svg, bounds, document, targets, diagnostics: [] }` or failure. It never accepts AuthorFigure. `validateEducational(input)` validates public documents. `inspectEducational(input)` inspects only public document bounds and explicitly permitted targets, never connectivity or hidden net groups.

## Privacy boundary

AuthorFigure uses `schema: 'circuitkit.educational.author.v2'`, `id`, and explicit `stages: { teaching, question, correction }`. Every stage is a complete independent model with its own title, description, theme, panels, and `expose` target allowlist. Models may reuse IDs and composition helpers. No inference about which value is an answer, no masking a full answer scene after rendering, no automatic projection from a stage flag.

PublicFigure uses `schema: 'circuitkit.educational.public.v2'`, `id`, `title`, `description`, `theme`, a bounded geometric `display` list, and `targets`. It contains no author model, stage models, typed values, assumptions, source references, or hidden metadata. Net identities and member-part references are absent by default; they appear only on explicitly exposed net group targets, never as terminal membership arrays or an implicit graph. It is JSON-portable render-ready data, not an opaque wrapper over authored source. A public schema is a serialization boundary, not cryptographic provenance: hosts must only send the chosen projection. Deliberately visible labels and geometry remain public.

Errors returned by public APIs are fixed codes/messages with no input paths, field names, values, stack traces, or partial documents. Author-side validation is a separate API. Selected-stage noninterference means equal selected stages produce equal public documents, SVG, targets, accessibility and public diagnostics even when nonselected stages contain malformed schemas, unsupported glyphs, changed kinds, or private IDs. The strict outer envelope and whole-input bounded-JSON resource gate still apply.

## Composition and identity

Stage panels are independently positioned typed models: electrical, measurement, signal, timeline, levels, quantity, bars, scale, readings, breadboard, pinout, and board. Electrical models are arbitrary bounded terminal/component/route graphs, not lesson-name branches. Measurements are ideal non-loading overlays and never union graph nodes. Values discriminate known/symbolic/unknown and keep numeric units separate from display runs. Only explicitly authored readings or supported derivations with explicit assumptions are accepted.

Panel IDs and primitive semantic IDs are stable across stage projections. Reuse the same IDs for unchanged correction geometry; additions are additive. A changed panel kind must use a separate panel ID. Targets are explicit allowlisted semantic parts that actually exist. DOM IDs are namespace-qualified and are not semantic IDs. No implicit public net target/group exposure.

## Opt-in electrical net targets: React/host contract

Contract settled for the core net-target addition. Electrical panels may declare `namedNets: [{ id: 'supply', terminal: 'vp' }]`. These are host-only stable anchor names, not public targets by themselves. A stage must explicitly request `{ id: 'circuit/net/supply', label: 'Supply node', role: 'net' }` in `expose`. No stage name automatically enables nets.

Old individual public target objects remain exactly `{ id, label, role }`. Only an explicitly exposed net gains this strict public shape:

```ts
{
  id: 'circuit/net/supply',
  label: 'Supply node',
  role: 'net',
  kind: 'group',
  members: ['circuit/route/top', 'circuit/terminal/ra', 'circuit/terminal/vp'],
}
```

Rendering and inspection add `bounds`, the union of the actual member-part bounds. Members are semantic IDs from the same electrical panel in this public display, never namespaced DOM IDs, terminal membership arrays, another target group, or another figure/panel. They include terminal circles, connected routes, and closed-button/explicit-short component parts. Nonconducting component bodies, open routes (whose two disconnected halves share one display part), labels, and ideal probes are excluded. Existing public display parts and their paint order stay unchanged; no wire is duplicated.

React worker: narrow with `target.role === 'net'` (equivalently `target.kind === 'group'` after a property check), select the stable target ID, and use `target.members` to highlight the allowed existing parts. `PublicTarget.bounds` is the group selection envelope, not proof that every point inside the bounding rectangle is conductive. Core SVG assigns namespaced DOM IDs to allowed member parts and emits one empty group marker with `data-target`, `data-kind="group"`, `data-members`, and `aria-owns` referencing those same-instance DOM IDs. It emits no `<use>` or duplicate drawing. Individual targets and their DOM behavior are unchanged. React-owned files are not changed by this core task.

HOST-only `inspectElectricalNets(input)` accepts one electrical panel and returns `{ ok: true, nets: SemanticNet[], diagnostics: [] }` or author-only diagnostics. `SemanticNet` contains `{ id, anchor, terminals, members }`; it is not safe learner props. `netTargetId(panelId, netId)` builds stable semantic IDs. Exported `NetTarget`, `PublicTargetDefinition`, and `SemanticNet` types support the adapter/editor workers. Public `inspectEducational` still returns only the chosen public allowlist, never this host manifest.

Names resolve against `analyzeElectrical`'s effective conductor groups. Opens split groups; connected routes, closed buttons and explicit shorts merge them; probes never union anything. An exposed anchor must exist, and two exposed names resolving to the same effective group are ambiguous and fail. Full author validation and the host helper check every declaration; projection resolves only exposed names so unused, schema-valid host-only names/anchors do not affect question output. Normal JSON/schema limits still apply to the selected stage. An invalid anchor or ambiguous unused declaration is still reported by full author validation, not silently accepted as a valid author model. Stable anchors follow their current connected fragment after a split. After a merge, projection can expose one stable name, but a fully valid author stage must remove or retarget other merged declarations rather than guessing an alias.

Public group validation rejects missing/duplicate/empty members, cross-panel or DOM-namespaced IDs, nested groups, group/display identity collisions, and overlapping memberships between two net targets. Public validation verifies references, not electrical truth or stage authorization; only trusted host projection derives connectivity. Public failure diagnostics remain fixed and private-field-free.

## Safety and rendering

Strict unknown-key-rejecting schemas, bounded JSON depth/node counts/string sizes/arrays/coordinates, finite numbers, unique IDs, reference checks, and bounded rendering. No arbitrary HTML, CSS, SVG paths, URLs, transforms, or event handlers in the public schema. SVG uses fixed geometry and existing deterministic Geist glyph outlines from `src/typography.ts`. Math runs support bounded baseline/subscript/superscript text without changing v1 font assets. Themes: geist-light, geist-dark, geist-print. Bounds include strokes and glyph extents. Native SVG and parent-owned PNG wrappers consume the same standalone SVG.

## Concrete schemas and return types

The exhaustive strict schemas and inferred types are in `src/v2/schema.ts`. `Panel` is a discriminated union on `kind`. All API inputs are decoded JSON objects, not JSON strings. Optional properties should be omitted, not assigned `undefined`.

```ts
type MathRun = { text: string; script: 'base' | 'sub' | 'sup' };
type Value =
  | { kind: 'known'; value: number; unit: Unit; display?: MathRun[] }
  | { kind: 'symbolic'; symbol: MathRun[]; unit: Unit }
  | { kind: 'unknown'; unit: Unit };
type Unit = 'V' | 'A' | 'Ω' | 'W' | 'F' | 's' | 'Hz' | 'scalar';
type Bounds = { x: number; y: number; width: number; height: number };
type Target = { id: string; label: string; role: TargetRole };
type NetTarget = { id: string; label: string; role: 'net'; kind: 'group'; members: string[] };
type PublicTargetDefinition = { id: string; label: string; role: Exclude<TargetRole, 'net'> } | NetTarget;
type PublicTarget = PublicTargetDefinition & { bounds: Bounds };
```

Known values are signed base-unit quantities. `display` overrides only the visible numeric/symbol text, never calculation, and the base unit is appended separately. It is not a second numeric input or an automatic unit conversion. Use the scale panel for a prefixed axis. Unknown displays `?` plus its unit. Symbolic values are not evaluated. No formula parser, HTML MathText, LaTeX execution, or arbitrary SVG string is accepted.

A stage model is `{ title, description, theme, panels, expose }`. Each panel has `{ kind, id, at: { x, y }, title? }`. Panel coordinates and paths are local; `at` translates the entire panel. All panels share the final drawing coordinate system. Arrays define paint order, and panel placement is authored rather than automatically packed. Long labels contribute to actual bounds. Authors remain responsible for meaningful spacing and avoidance of overlapping labels or components.

A public document has exactly these fields:

```ts
{
  schema: 'circuitkit.educational.public.v2',
  id: 'exercise1',
  title: 'Read the meter',
  description: 'Choose the signed reading.',
  theme: 'geist-light',
  display: [{ id: 'meter/reading', shapes: [{
    kind: 'math', at: { x: 70, y: 46 }, runs: [{ text: '? V', script: 'base' }],
    size: 18, align: 'center', family: 'sans', tone: 'ink',
  }] }],
  targets: [{ id: 'meter/reading', label: 'Meter display', role: 'reading' }]
}
```

`display` contains `Part[]`, each `{ id, shapes }`. The only shape kinds are `line`, `polygon`, `rect`, `circle`, and `math`. Geometry is numerical, text is bounded runs, paints are enums. `ink`, `muted`, `accent`, `positive`, and `negative` are theme-resolved tones. Fills additionally permit `none` and `background`. No source reference, arbitrary path `d`, transform, style, class, event, URL, or extra metadata field is allowed.

`validateEducational` returns `{ ok: true, document, diagnostics: [] }`. `inspectEducational` returns `{ ok: true, document, bounds, targets, diagnostics: [] }`. Both return a fresh parsed public document. Inspection provides only explicit public target references and bounds, not the authored graph or unexposed groups. `renderEducationalSVG` adds `svg` to the inspection result. All public failures have exactly one fixed diagnostic: `{ code: 'educational.invalid', message: 'Invalid or unsupported educational figure.' }` and no other payload.

`validateAuthorFigure(input)` is HOST-ONLY. It validates and compiles all three stages and checks cross-stage identity, returning `{ ok: true, diagnostics: [] }` or author-only diagnostic codes such as `graph.unintended-bypass`. Never forward these author diagnostics to a student. `defineAuthorFigure(author)` validates and returns a detached author copy or throws a fixed error.

`projectFigure` now checks only the strict outer author envelope (`schema`, public `id`, and a strict `stages` object requiring exactly teaching/question/correction), then parses and compiles the selected stage. Nonselected stage payloads are opaque JSON, not parsed against stage/value/glyph schemas and not used for identity checks. Their IDs, changed kinds, unknown fields, invalid value units, and unsupported glyphs cannot affect selected output or public diagnostics. Selected IDs, references, allowlists, units, geometry, and glyphs remain fully validated. The whole-author bounded-JSON gate still rejects non-JSON/accessor/cyclic/oversized data before selection; that resource gate is not an information-flow guarantee for malformed executable JavaScript. This is output noninterference, not statistical/noise-adding differential privacy or a timing-side-channel guarantee.

## Electrical graph

`electrical` contains `terminals`, `components`, and `routes`, with no lesson-specific recipes.

- Terminal: `{ id, at, connection: 'required' | 'free', label?, labelAt?: Point, potential?: Value }`. `required` must occur as a route endpoint. `free` explicitly permits isolated or unfinished terminals. Potential is author-only input to supported measurement derivation, never automatically rendered or attached to public terminal targets.
- Component: `{ id, kind, terminals: [a, b], label?, labelAt?: Point, intent, state, value?, valueAt?: Point }`. `value` and `valueAt` apply only to non-button components. Kinds: `source`, `resistor`, `capacitor`, `led`, `diode`, `button`. The two references must exist, differ, and be at least 48 drawing units apart. The symbol rotates to the vector between them. Source terminal order is positive then negative; diode/LED order is anode then cathode. Passive order defines the chosen reference orientation.
- Non-button states: `normal`, `open`, `short`. Any non-normal state requires `intent: 'intentional-fault'`. Resistance/capacitance must be positive when known, with units Ω/F; source and diode/LED value labels use V. A diode/LED voltage value is an authored label, not a nonlinear model or an inferred conducting state.
- Button states: `open`, `closed`. An ordinary open button is valid with `intent: 'normal'`. Closed buttons union their two terminals; open ones do not.
- Route: `{ id, from, to, via: Point[], state: 'connected' | 'open', intent: 'normal' | 'intentional-fault', bypass?: componentId }`. Endpoints come from terminals; `via` contains only intermediate bends. Connected routes union their endpoints. Open routes have a visible centered gap and do not union endpoints; they require intentional-fault intent. Route points must not repeat consecutively.
- An unintended conductor path around an open button or a non-shorted non-button component fails. Normal closed buttons are exempt because their own state already joins the terminals; an open button is not exempt. A deliberate bypass route needs `intent: 'intentional-fault'` and `bypass: componentId`; it must actually connect both component terminals into the same conductor group. A component may itself declare intentional-fault intent for a deliberately bypassed condition. Intent never excuses absent references, wrong units, impossible geometry, duplicate IDs, or inconsistent known potentials on one conductor group.
- Only connected routes, explicit component shorts, and closed buttons union terminals. Resistors, sources, capacitors, diodes and LEDs do not collapse conductor nodes. Geometry intersections alone never union terminals. Add explicit shared endpoints for an intended junction. Disconnected fragments are supported; this is not a closed-loop-only validator.

No general circuit solver, transient simulation, diode forward-current inference, default zero potential, or guessed reference node is used. An intentional fault is drawable, not a guarantee that a powered physical circuit is safe or internally solvable. These graph rules are confined to v2 and do not relax any v1 validation.

## Orientation-aware annotation placement and manual overrides

`src/v2/annotation-layout.ts` performs a deferred placement pass after the complete selected scene has been compiled. This includes later panels' probe routes/rings, so a resistor value cannot be placed on a wire that had not yet been emitted when the component was compiled. It uses `measureMath` ink bounds and the same glyph metrics as final SVG rendering, not character-count estimates.

- Near-vertical components prefer side labels/values, with a stronger preference for staying on their own side before flipping into a neighboring component's label column. Near-horizontal components prefer above/below positions. Diagonal/reversed symbols use the same orientation and geometric candidate logic, without lesson IDs or recipe branches.
- Terminal labels try bounded corner/side positions rather than a fixed y−12 offset on a vertical lead. All selected geometry participates, including probe rings.
- Candidate ink boxes are tested against line segments with stroke clearance, circle/symbol extents, existing text, and later opaque rectangles that would cover the glyphs. Labels may sit inside an earlier container body if they clear its borders and other contents. Geometry, connectivity, terminal points, routes, symbol shapes, semantic IDs, and net memberships are not moved or cut to make labels fit.
- No font shrinking, CSS mask, clipping path, background rectangle behind a label, or hidden text fallback is used. The pass moves only annotation math baselines. Existing glyph outlines and fonts are unchanged.
- Placement order reserves explicit positions first, then terminal labels, component names, component values, and chart headings. Search is deterministic and bounded: at most 1024 queued annotations, 94 electrical candidates per annotation, and 57 track candidates. Candidates must fit public coordinate bounds. If no collision-free candidate exists, author validation reports `layout.annotation-placement`; public projection fails with the existing fixed `educational.invalid` diagnostic rather than drawing a known collision.

For physical/adapter layouts, optional `labelAt` on components and terminals and `valueAt` on non-button components specify exact panel-local **center-aligned baselines**. They do not relocate a symbol, change connectivity, change text, or add public author metadata. Existing `at` on a panel still translates these coordinates. Omit unused overrides; a field without a corresponding visible label/value produces no graphic.

```ts
component.labelAt = { x: 140, y: 35 };
component.valueAt = { x: 140, y: 55 };
terminal.labelAt = { x: 166, y: 102 };
```

Overrides are collision-checked and never silently moved. A colliding override reports author-side `layout.annotation-override-collision` and the same fixed public failure. Schema bounds and unknown-key rejection still apply. Automatic labels reserve valid manual placements before searching. These fields are ready for the adapter/physical-layout owner; no adapter file was edited here. Host adjuncts appended after core projection are not visible to this pass and remain the host's layout responsibility. Arbitrary edits to an already-public display list are not re-authored by the public renderer.

Levels retain their original bands and marker geometry. LOW / Not guaranteed / HIGH headings are centered on their corresponding bands above the threshold row, with 12-unit heading separation; narrow tracks use vertical staggering rather than drifting a heading into another band. Numeric readings and enabled classifications follow the actual marker x-coordinate, with ink clamped inward at both track edges. They are not centered on the overall chart when the marker is at zero or maximum. `showClassification` policy is unchanged and remains explicit author/host responsibility.

## Measurement

`measurement` has `model: 'ideal-voltmeter'`, `positive`, `negative`, and `reading`. Each probe is `{ panel: electricalPanelId, terminal: terminalId, via: Point[] }`. Probe bends are local to the measurement panel. The terminal coordinate is resolved across panel translations; the wire ends at the meter's fixed V or COM socket.

A reading is either `{ mode: 'authored', value }` in V or `{ mode: 'potential-difference', assumptions: ['common-reference', 'ideal-voltmeter'] }`. The second form requires known V potentials at both referenced terminals and computes positive minus negative, preserving sign. It never falls back to zero or guesses unknown potentials. Same-terminal probes may derive zero only with known potentials and those explicit assumptions. Probe wires are never added to the electrical graph and never union nodes.

## Supported scalar derivations

Quantity and readings panels use `Reading = { mode: 'authored', value } | { mode: 'derived', operation, inputs, assumptions }`. Derivations accept known values only, enforce dimensional input order, require the exact assumption set without duplicates, and reject zero denominators, overflow, out-of-range output, and nonzero results that underflow to zero.

| Operation | Inputs, in order | Result | Required assumptions |
| --- | --- | --- | --- |
| voltage-difference | V, V | positive − negative, V | common-reference, ideal-voltmeter |
| ohm-current | V, Ω | V / R, A | ohmic, passive-sign |
| ohm-voltage | A, Ω | I × R, V | ohmic, passive-sign |
| ohm-resistance | V, A | V / I, Ω, positive | ohmic, passive-sign |
| power | V, A | V × I, W, signed | passive-sign |
| divider | supply V, upper Ω, lower Ω | V × lower / (upper + lower), V | ohmic, unloaded-divider |

These are explicit scalar calculations, not topology-derived solutions. `unloaded-divider` is an author assertion; no load resistance is silently ignored by an electrical solver.

## Other panel kinds

- `signal`: `width`, `height`, `unit: 's' | 'ms' | 'us' | 'ticks'`, `data`, `edges: 'none' | 'rising' | 'falling' | 'both'`, `sampleLabels`, optional `window` and `debounce`. Samples use `{ mode: 'samples', start, period, values: ('HIGH' | 'LOW')[] }` and a right-open interval ending at start + count × period. Transitions use `{ mode: 'transitions', start, end, initial, changes: [{ at, level }] }`; changes are strictly ordered, strictly inside the interval, and alternate levels. A window is `{ from, to, label: MathRun[] }`. Debounce is `{ duration, initial }`, where `initial` is the explicit output state. Each input level must remain stable for the duration before output changes; acceptance exactly at the next transition is processed before that transition. Raw and debounced traces are separate parts.
- `timeline`: integer `start`, `now`, optional `modulus`, explicit integer `wraps`, `unit`, `width`, `showElapsed`. Elapsed = now − start + wraps × modulus. No wrap count is inferred. A modulus is exclusive, so a 32-bit counter uses 4294967296, not 4294967295. Counters must be below modulus; negative elapsed fails. Wrap markers and elapsed labels are separate parts. Equal counters with zero wraps show zero without division by zero.
- `levels`: V thresholds `0 <= low < high <= max`, positive `max`, `width`, optional `value`, `showClassification`. Values at/below low are LOW, at/above high are HIGH, between them are explicitly not guaranteed. Unknown/symbolic values have no position marker and cannot request classification.
- `quantity`: `items: [{ id, quantity: 'V' | 'I' | 'R' | 'P', reading }]`. Units must match V/A/Ω/W respectively.
- `readings`: `items: [{ id, label: MathRun[], reading }]`. Useful for authored observations, potentials, signed deltas, and additive correction panels. Reading and quantity columns use the same glyph-outline measurement as the SVG renderer. The value column starts at least 24 units beyond the widest label's ink/advance, with a minimum column origin of 80. Row spacing is at least 38 units and expands to maintain a 16-unit vertical ink gap for scripts/operators. No text is truncated or shrunk to hide overlap. Panel-to-panel placement remains authored.
- `bars`: `unit`, `min`, `max`, `width`, `items: [{ id, label, value }]`, optional `threshold: { value, label }`. The explicit range must include zero. Negative values extend left of the zero baseline. Unknown/symbolic entries show their text only, never an invented bar length. Known values and threshold must be inside range. All-zero datasets remain valid with a nondegenerate authored range.
- `scale`: `unit`, `prefix: 'n' | 'u' | 'm' | '' | 'k' | 'M'`, strictly increasing base-unit `ticks`, `width`, `showConverted`, and either optional legacy `value` or optional `input: { from: 'base' | 'prefixed', magnitude: number, display?: MathRun[] }`, never both. Legacy `value` remains a base-unit Value, including unknown/symbolic text with no conversion. New `input.magnitude` is the given number in its declared source ruler's units, not a base-unit Value. For example, unit A/prefix m/input `{ from: 'prefixed', magnitude: 40 }` means 40 mA. The marker sits at 0.04 on the base-unit ruler but labels only `40 mA` below the prefixed ruler until `showConverted` is true; correction then adds `0.04 A` and a base-ruler dot without replacing source geometry. Base-source inputs invert that arrangement. Positions use the input quantity, not the ruler maximum. Bounds are checked after conversion; only tiny floating-point conversion error at a boundary is tolerated. Negative/zero and exact-maximum inputs work. The prefix supplies a fixed SI factor, not an arbitrary conversion claim. Source text preserves the supplied number/display; converted text uses eight significant digits. `u` renders as µ. Neither source magnitude nor the computed scalar is retained in public metadata.
- `breadboard`: `width`, `height`, `contacts: [{ id, at, label? }]`, `groups: [{ id, contacts: contactId[] }]`, `showGroups`, `links: [{ id, from, to, via }]`. Groups must partition all contacts exactly once. Explicit contact positions support split rails, gaps, partial boards, and arbitrary row arrangements without hard-coded breadboard membership. Group conductor strokes exist only when `showGroups` is true. Otherwise changing group IDs/membership alone produces identical public output. The public document never carries the membership arrays. Jumpers are authored visible geometry.
- `pinout`: `width`, `height`, `pins: [{ id, at, label, role }]`. Roles: gpio, input-only, power, ground, strapping, passive, unknown. Pins must be within the body.
- `board`: pinout-style body and pins plus `chips: [{ id, at, width, height, label }]`. Chip boxes must lie inside the body; labels can explicitly show unknown identities. No board pin function or internal electrical topology is guessed.

## Stable parts and adapter targeting

Use `partId(panelId, category, itemId?)` to build allowlist IDs. Item IDs are authored IDs except signal temporal items, which use `signalTimeId(time)` (for example `t4`, `tn2`, `t0d5`). Inserting an earlier transition therefore does not rename later edges. No DOM ID is stored in a PublicFigure.

| Panel | Generated semantic parts |
| --- | --- |
| any titled panel | panel/title |
| electrical | panel/component/id, panel/label/id, panel/value/id, panel/terminal/id, panel/terminal-label/id, panel/route/id |
| measurement | panel/body, panel/reading, panel/probe/positive, panel/probe/negative |
| signal | panel/axis, panel/trace/raw, panel/edge/timeId, panel/sample/timeId, panel/window, panel/trace/debounced, panel/accepted/timeId |
| timeline | panel/axis, panel/start, panel/now, panel/wrap/count, panel/elapsed |
| levels | panel/axis, panel/value |
| quantity, readings | panel/reading/id |
| bars | panel/axis, panel/bar/id, panel/threshold |
| scale | panel/axis, panel/value |
| breadboard | panel/body, panel/group/id (only if shown), panel/contact/id, panel/contact-label/id, panel/link/id |
| pinout, board | panel/body, panel/pin/id, panel/chip/id (board only) |

A part exists only when its content is actually drawn. Allowlist entries for omitted values, hidden contact groups, absent edges, or missing parts fail. The compiler also checks the target role against the generated part role. Terminal/start/now parts use `terminal`; value/bar/elapsed/reading parts use `reading`; routes/groups/links use `route`; contact parts use `contact`; title/labels/samples use `label`; body/chips use `body`; other roles match their category (`component`, `probe`, `trace`, `edge`, `window`, `axis`, `pin`). Threshold uses `axis`; accepted signal markers use `edge`.

Only allowlisted targets receive `data-target` SVG attributes. Individually allowed parts and members of explicitly allowed net groups receive namespaced `id` attributes; unrelated visible parts receive no semantic DOM attributes. `targets` contains only allowlisted individual parts or net groups, with measured global bounds. These bounds are independent of namespace. Use `targetDOMId(namespace, target.id)` to find an allowed part. The renderer accepts namespace `[A-Za-z][A-Za-z0-9_-]{0,63}`, default `figure`. Hosts should supply a unique namespace for each mounted SVG. IDs hex-encode the semantic ID and use a separate namespace prefix, preventing slash/hyphen collisions. Namespace is not stage authorization.

Corrections preserve base IDs and geometry when the author reuses the same model parts. Value/caption additions can be additive. Full host-side `validateAuthorFigure` rejects changing a panel kind under the same ID or changing a component kind under the same panel/component ID across stages. Put a changed-kind explanation in a separate panel instead of claiming identity with an unrelated diagram. `projectFigure` deliberately does not consult another stage to enforce this invariant; author CI must use full author validation. The compiler does not automatically merge stage models.

## Builders and runnable examples

Exported builders: `authorFigure`, `stageModel`, `placePanel`, `electricalPanel`, `known`, `unknown`, `symbolic`, `authored`, `math`, `point`, `line`, `polygon`, `circle`, `rect`, `label`, `part`, `translateShape`, and `partId`. Builder inputs are trusted typed authoring data; runtime validation happens in the entry points. `defineAuthorFigure` performs full validation immediately. Low-level primitive builders can construct a public display list directly when the host already has explicitly public content.

```ts
import {
  authorFigure, stageModel, authored, known, unknown, point,
  projectFigure, renderEducationalSVG, type Panel,
} from '../src/v2/index.ts';

const question: Panel = {
  kind: 'quantity', id: 'power', at: point(0, 0),
  items: [{ id: 'result', quantity: 'P', reading: authored(unknown('W')) }],
};
const correction: Panel = {
  ...question,
  items: [{
    id: 'result', quantity: 'P',
    reading: {
      mode: 'derived', operation: 'power',
      inputs: [known(5, 'V'), known(0.02, 'A')],
      assumptions: ['passive-sign'],
    },
  }],
};
const expose = [{ id: 'power/reading/result', label: 'Power', role: 'reading' as const }];
const author = authorFigure('power-exercise', {
  teaching: stageModel([correction], { title: 'Power', expose }),
  question: stageModel([question], { title: 'Find power', expose }),
  correction: stageModel([correction], { title: 'Power', expose }),
});
const projected = projectFigure(author, 'question');
if (projected.ok) {
  const exported = renderEducationalSVG(projected.document, { namespace: 'power1' });
}
```

The complete corpus lives in `src/v2/fixtures.ts`: `educationFixtures()` returns 16 author figures spanning every panel kind, all six electrical symbols, sample and transition signals, debounce, counter wrap, undefined logic levels, signed power/bars, scaling, mixed readings, board/pinout/contact groups, intentional opens, bypass, and multi-panel composition. `privacyFixture()` provides a signed ideal measurement with explicit separate question and correction models; `dividerPanel()` is a reusable positioned graph. These fixture models are host-only and must not be forwarded to a client.

```ts
import { privacyFixture } from '../src/v2/fixtures.ts';
import { projectFigure, renderEducationalSVG, inspectEducational } from '../src/v2/index.ts';

const projected = projectFigure(privacyFixture(), 'question');
if (projected.ok) {
  const svg = renderEducationalSVG(projected.document, { namespace: 'meter1' });
  const publicTargets = inspectEducational(projected.document);
}
```

The question contains `? V`, not the −12 V correction. Reversing positive and negative probe references produces +12 V with no topology changes. Mutating values, labels, and graph data in valid unselected stages leaves the question document, SVG, bounds, accessibility description, diagnostics, and target manifest unchanged.

## Empty projections and host coordination

A selected stage may have `panels: []` and `expose: []`. It projects to a valid PublicFigure with `display: []` and `targets: []`. Public validation and inspection succeed; bounds are `{ x: 0, y: 0, width: 0, height: 0 }`. `renderEducationalSVG` returns success with `svg: ''` and `diagnostics: []`, without an SVG element, background, fabricated part, or placeholder image. Nonempty targets on an empty display still fail. A null raw input is still invalid; no API signature was widened to silently treat malformed data as a document.

Hosts should skip mounting/exporting an image when `document.display.length === 0`, and may normalize that case to their own `document: null` no-figure representation. The Gradual adapter already returns a null document for host-only/no-figure stages, so its existing null guard remains correct. No record framework is necessary. Parent-owned React and PNG wrappers are not edited here. The inspected current React wrapper now handles empty core SVG by returning null or the host caption alone; an actual null document prop remains invalid. An empty public document produces success diagnostics, not an error. Hosts may still branch before mounting and retain prose/captions separately. Do not repurpose `onDiagnostics` to signal no-figure as an error. The optional callback remains optional.

```ts
const selected = projectFigure(author, 'question');
const document = selected.ok && selected.document.display.length > 0
  ? selected.document
  : null;
```

## V2-only mathematical operator outlines

`src/v2/math-text.ts` supplies a fixed, bounded outline set for `≥`, `≤`, `≠`, `←`, `↑`, `↓`, `↔`, and `Δ`. They remain ordinary safe `MathRun.text` characters, including sub/superscript runs. The existing pinned `→` and ordinary text still use `src/typography.ts` exactly; no legacy glyph/font asset is changed. Operator polygons are engine-owned constants, not caller-supplied paths. The same advances and actual outline bounds drive column spacing, SVG bounds, and rasterization. Unsupported characters outside the pinned font and this finite set still fail closed. No HTML, font-loading or text-node fallback is introduced.

## Runtime limits

- JSON: depth 24, 80,000 visited nodes, 250,000 total string characters, 1,000 characters per raw string, bounded object/array key counts. Cycles, accessors, sparse arrays, symbol keys, non-JSON values, custom prototypes, and prototype-pollution keys fail. Accessors are not evaluated. This accepts JSON data, not arbitrary executable JavaScript proxies.
- IDs: authored IDs start with a letter and contain up to 48 ASCII letters/digits/underscore/hyphen. Semantic part IDs add slash and allow up to 192 characters.
- Text: 240 characters per text field and per complete math run list; 1–16 runs. XML-invalid characters, controls and lone surrogates fail. Visible unsupported glyphs fail instead of silently disappearing. No font loading or HTML fallback occurs.
- Numbers: finite base scalars in [−1e12, 1e12]; geometry coordinates in [−10000, 10000]; panel dimensions at most 10000. Final bounds at most 24000 per axis. Numeric overflow and degenerate intervals are rejected.
- Per stage: 32 panels; per electrical panel: 256 terminals, 128 components, 256 routes, 64 bends per route, 256 optional named-net anchors. Signal data: 128 samples/transitions; quantity/bars/readings: 32 items; breadboard: 256 contacts, 128 groups/links; board/pinout: 128 pins; board: 32 chips.
- Public display: 2048 parts, 128 shapes per part, aggregate 8192 shapes, 32768 path points, 16000 visible characters, 4 MB of generated glyph markup, final SVG capped at 8 MB. Public targets: 512 total, at most 640 members per net group and 2048 member references overall, with no overlapping membership between net groups. Aggregate JSON limits can reject a model before an individual collection reaches its cap.

Bounds are the union of actual glyph outlines and geometry expanded by half the stroke width, with a two-unit outer margin. No fixed lesson-sized canvas or browser-measured font box is used. SVG includes an explicit theme background, title, description including only visible math and permitted target labels, and deterministic glyph paths. The top-level SVG is an accessible image; the geometry group is aria-hidden. Parent UI owns richer keyboard interactions, captions outside the SVG, and target focus behavior.

## Verification and handoff

Read-only design corpus inspected: Gradual's `lib/academy/types.ts`, `lib/learning/types.ts`, and all four `components/academy/{circuit,concept,foundation,supply}-diagram.tsx` renderers. No Gradual files were changed. Existing `src/typography.ts` and theme presets are reused without edits. No new dependency was added.

Initial implementation proof from the target repository (the follow-up regression run is recorded below):

```sh
bun test tests/v2-engine.test.ts tests/v2-safety.test.ts tests/v2-boundaries.test.ts
bun test tests/annotations.test.ts --test-name-pattern 'immutable pre-annotation SVG fixture'
bunx --no-install tsc --ignoreConfig --noEmit --strict --noUncheckedIndexedAccess --target ES2022 --module ESNext --moduleResolution Bundler --allowImportingTsExtensions --resolveJsonModule --esModuleInterop --skipLibCheck --types bun,node src/v2/index.ts src/v2/fixtures.ts tests/v2-engine.test.ts tests/v2-safety.test.ts tests/v2-boundaries.test.ts
bunx --no-install biome check src/v2/index.ts src/v2/schema.ts src/v2/values.ts src/v2/render.ts src/v2/compiler.ts src/v2/electrical.ts src/v2/primitives.ts src/v2/signals.ts src/v2/safety.ts src/v2/builders.ts src/v2/fixtures.ts tests/v2-engine.test.ts tests/v2-safety.test.ts tests/v2-boundaries.test.ts
```

Verified 2026-09-16 with Bun 1.3.11. All four commands above exited 0. V2: **95 pass, 0 fail, 2596 assertions**. Legacy hash proof: **28 pass, 0 fail, 54 unrelated tests filtered out, 164 assertions**, including all 27 unchanged SHA-256 fixtures. Focused TypeScript: no diagnostics. Biome: **14 files checked, no fixes applied**. Initial TypeScript command invocation and intermediate type/lint failures were fixed before these final checks; no unresolved failures remain in this focused surface.

The v2 suite covers 16 fixtures × 3 stages × 3 themes, deterministic immutable rendering, 48 native Resvg rasterizations with system fonts disabled, differential output privacy, hostile JSON and mutation cases, graph connectivity/fault validation, probe polarity/non-union, target allowlists and namespace separation, correction and temporal identity, scalar assumptions/units/underflow, and signal/physical edge cases. The existing pre-annotation suite checks the original 27 SVG hashes.

A direct `privacyFixture()` question smoke run returned the public schema, 19 display parts, and exactly four targets: `circuit/terminal/ra`, `circuit/terminal/rd`, `meter/probe/positive`, `meter/reading`. Its SVG contained `? V` and did not contain `-12 V`. Bounds were `{ x: -19, y: -23.939999999999998, width: 622, height: 226.94 }`; the SVG uses the existing deterministic number formatter for attribute serialization.

### Adapter quality follow-up

Core handoff gaps 1, 3, 4, and 5 from `docs/gradual-adapter.md` are addressed: empty projections, source-unit scale input, bounded operator outlines, and measured reading columns. Record stays host composition. Selected projection is additionally independent of malformed nonselected schemas and identities. Adapter workarounds remain compatible and can be simplified by their owner; neither adapter files nor generated coverage artifacts are rewritten by this core change. Previous generated SVG/raster hashes should be regenerated by the coverage owner because intentional layout improvements change v2 geometry.

```sh
bun test tests/v2-engine.test.ts tests/v2-safety.test.ts tests/v2-boundaries.test.ts tests/v2-quality.test.ts tests/gradual-adapter.test.ts tests/gradual-corpus.test.ts tests/v2-react.test.tsx
bun test tests/annotations.test.ts --test-name-pattern 'immutable pre-annotation SVG fixture'
bunx --no-install tsc --ignoreConfig --noEmit --strict --noUncheckedIndexedAccess --target ES2022 --module ESNext --moduleResolution Bundler --jsx react-jsx --allowImportingTsExtensions --resolveJsonModule --esModuleInterop --skipLibCheck --types bun,node src/v2/index.ts src/v2/fixtures.ts tests/v2-engine.test.ts tests/v2-safety.test.ts tests/v2-boundaries.test.ts tests/v2-quality.test.ts tests/gradual-adapter.test.ts tests/gradual-corpus.test.ts tests/v2-react.test.tsx
bunx --no-install biome check src/v2/index.ts src/v2/schema.ts src/v2/values.ts src/v2/render.ts src/v2/compiler.ts src/v2/electrical.ts src/v2/primitives.ts src/v2/signals.ts src/v2/safety.ts src/v2/builders.ts src/v2/fixtures.ts src/v2/math-text.ts tests/v2-engine.test.ts tests/v2-safety.test.ts tests/v2-boundaries.test.ts tests/v2-quality.test.ts
```

Follow-up verification: combined core/adapter/corpus/React suite **194 pass, 0 fail, 1 skipped, 24141 assertions**, exit 0. The skipped test is the opt-in standalone browser hydration/keyboard test; React SSR and core-vector parity tests ran. Legacy: **28 pass, 0 fail**, all 27 original SVG hashes unchanged, exit 0. Focused TypeScript passes with no diagnostics, exit 0, after correcting a widened literal in the new hostile-input test. Biome checks 16 owned files with no fixes applied, exit 0. The nine new quality regressions assert actual ink separation, native operator rasterization, unchanged pinned-font text, source/converted marker placement including zero/negative/maximum cases, strict scale failures, malformed-stage output equality, and empty host composition. No new lesson count or native record support is claimed.

### Electrical net and open-button audit follow-up

The open-button bypass exemption is removed: a normal open button with a normal conductor path joining its terminals fails `graph.unintended-bypass`. Explicit component fault intent or a validated bypass route can authorize that educational fault; closed buttons retain their normal conducting behavior. Structural graph errors are never excused by fault intent or net declarations.

Implemented the opt-in net contract above in `src/v2/nets.ts`, schema, compiler and public renderer. Tests cover anchored splits/merges, ambiguous and unresolved definitions, explicit shorts and button states, ideal-probe independence, unchanged display parts, no default question grouping, explicit question exposure, group bounds, same-instance SVG references, hostile/dangling/cross-instance membership, and detached deterministic metadata. Native Resvg PNG bytes are identical with and without exposed net metadata in all three themes: no wire drawing is duplicated.

```sh
bun test tests/v2-nets.test.ts tests/v2-engine.test.ts tests/v2-safety.test.ts tests/v2-boundaries.test.ts tests/v2-quality.test.ts tests/gradual-adapter.test.ts tests/gradual-corpus.test.ts tests/v2-react.test.tsx
bun test tests/annotations.test.ts --test-name-pattern 'immutable pre-annotation SVG fixture'
bunx --no-install tsc --ignoreConfig --noEmit --strict --noUncheckedIndexedAccess --target ES2022 --module ESNext --moduleResolution Bundler --jsx react-jsx --allowImportingTsExtensions --resolveJsonModule --esModuleInterop --skipLibCheck --types bun,node src/v2/index.ts src/v2/fixtures.ts tests/v2-nets.test.ts tests/v2-engine.test.ts tests/v2-safety.test.ts tests/v2-boundaries.test.ts tests/v2-quality.test.ts tests/gradual-adapter.test.ts tests/gradual-corpus.test.ts tests/v2-react.test.tsx
bunx --no-install biome check src/v2/index.ts src/v2/schema.ts src/v2/render.ts src/v2/compiler.ts src/v2/electrical.ts src/v2/nets.ts tests/v2-nets.test.ts
```

All final commands exited 0. Combined core/adapter/corpus/React tests: **217 pass, 0 fail, 1 skipped, 32254 assertions**. The skipped case is the opt-in browser hydration/keyboard test. Legacy proof: **28 pass, 0 fail, 164 assertions**, including all 27 original unchanged SVG hashes. Focused TypeScript: no diagnostics after fixing a widened `false` literal in a new test expectation. Biome: **7 changed core/test files checked, no fixes applied**. React group-specific highlighting is worker-owned; this core run verifies compatibility with the current React tests, not completion of that new UI behavior. No React, adapter, app or package files were edited by this follow-up.

### Visual annotation QA follow-up: ISSUE-001 / ISSUE-003 / ISSUE-005

Read `docs/education-web-qa.md` and inspected the cited before PNGs through a separate read-only, ephemeral Codex image review: `editor-output-1280-light.png`, `native-measurement-light.png`, and `native-levels-light.png` from `artifacts/education-web-qa/2026-09-16T09-04-15-515Z/`. The review confirmed B/C crossing vertical leads, resistor values crossing conductors/probe rings, and the levels marker crossing the “o” in “Not guaranteed.” No original screenshot or external coverage artifact was modified.

The first collision-free implementation was **not** accepted on its unit-test results. Actual review of ten fresh native PNGs found displaced levels labels/readouts and ambiguous neighboring capacitor/LED labels. Preferred-side placement, band-centered headings, marker-centered readouts and track-edge clamping corrected those defects. A subsequent review passed nine images but found crowding at the minimum levels width; increased heading separation and vertical staggering then passed a final read-only image review. This is native-image acceptance for these scenarios, not a claim that the running production app was rebuilt or that every browser/layout case was reviewed.

Current reviewed images are local temporary evidence under `/tmp/circuitkit-annotations-final.gQzt1T/`. All ten corresponding SVGs were re-rendered from the final source and compared byte-for-byte to the reviewed versions. Use `levels-narrow-spaced.png`, not the superseded `levels-narrow.png`. The earlier rejected preview remains separate under `/tmp/circuitkit-annotations.oKvnNF/`.

| Final PNG | SHA-256 |
| --- | --- |
| named-nets-teaching-geist-light.png | 3e8e90599033432547a8be244fbc192d5b5b194ed353411d730b45aa00a5525d |
| measurement-question-geist-light.png | 519804ab56729f3f79c52b4e775cd4f14486ae93c9bcb1288651d8a2d3765f4d |
| levels-middle-geist-light.png | eba16c839499bee65419618fe158665f93704ed11178a8f9a303f9499956ad71 |
| named-nets-teaching-geist-dark.png | 1f8a4c21184d7a8b680a1b70aa499693d67b5e0148a790c5178754de7e675862 |
| measurement-question-geist-dark.png | 968aeb0854f4854ad10e0ffb504b9d08c34131158c62f5c493dce492e2765a2b |
| levels-middle-geist-dark.png | 35799f31ea5d0f85a072da5a5457403bf7b03148442ab705a4facff2de027297 |
| levels-zero.png | c1bfd9d86dbb5af909ac1515852e48e3150c9529075519fa56f7e0ac0101d499 |
| levels-maximum.png | 40ee944dba2b8006d445fa24bc4606f75df73803aae34400a4020d0572d9e092 |
| levels-narrow-spaced.png | aa3b5a913d8247c00d1d764c39e9d26fc134d49e0dbb5659fb4ec00d8ca46f41 |
| vertical-symbols.png | 1cfd1ff84bf2105ea9bec9b0e620d885297de52bd99d838c486257922a263704 |

Images were rasterized at width 900 with native Resvg and system fonts disabled, from the reusable core measurement/divider, levels and electrical-symbol fixtures. Net metadata does not change native pixels; named-net membership and bounds are additionally checked by the explicit named-net regression. Levels edge and minimum-width cases use the same core panel schema, not lesson branches. The final image reviewer reported clear band/marker association, separated headings and no visible collision/clipping. An initial Codex shell-wrapper invocation omitted its prompt and exited 1; retrying the discovered executable with an explicit stdin prompt succeeded. Image reviews exited 0. Configured startup OAuth warnings were unrelated to app rendering and did not block attached-image review.

```sh
bun test tests/v2-annotation-layout.test.ts tests/v2-engine.test.ts tests/v2-safety.test.ts tests/v2-boundaries.test.ts tests/v2-quality.test.ts tests/v2-nets.test.ts tests/gradual-adapter.test.ts tests/gradual-corpus.test.ts tests/v2-react.test.tsx tests/v2-png.test.ts
bun test tests/annotations.test.ts --test-name-pattern 'immutable pre-annotation SVG fixture'
bunx --no-install tsc --ignoreConfig --noEmit --strict --noUncheckedIndexedAccess --target ES2022 --module ESNext --moduleResolution Bundler --jsx react-jsx --allowImportingTsExtensions --resolveJsonModule --esModuleInterop --skipLibCheck --types bun,node src/v2/index.ts src/v2/fixtures.ts tests/v2-annotation-layout.test.ts tests/v2-engine.test.ts tests/v2-safety.test.ts tests/v2-boundaries.test.ts tests/v2-quality.test.ts tests/v2-nets.test.ts tests/gradual-adapter.test.ts tests/gradual-corpus.test.ts tests/v2-react.test.tsx tests/v2-png.test.ts
bunx --no-install biome check src/v2/annotation-layout.ts src/v2/compiler.ts src/v2/schema.ts tests/v2-annotation-layout.test.ts
```

Final combined run: **257 pass, 0 fail, 1 skipped, 41655 assertions**, exit 0. The skip is the opt-in standalone browser hydration/keyboard test, not native image review. Legacy: **28 pass, 0 fail**, preserving all nine recipes across all three themes (27 original SVG hashes). TypeScript: no diagnostics, exit 0. Biome: **4 files, no fixes applied**, exit 0. The nine new annotation tests independently intersect line segments with actual glyph ink boxes, check circles/text separation, component/band/marker association, later-panel probes and paint-order occlusion, exact manual overrides and collision failures, exhausted-search failure, immutable non-text geometry, net identity/bounds, and selected-stage privacy.

Parent must rebuild/re-run the main-app visual QA to close its production-browser issues. No adapter, web, legacy font, package or external coverage files were edited or regenerated here. There is no blanket visual approval for arbitrary user-edited public display lists or host adjuncts added after projection.

Parent owns package exports/build wiring, CLI dispatch, React client props/wrappers, native PNG API integration, adapter migration, browser visual review, and full repository QA. The core does not claim those integration steps are complete. Do not send an AuthorFigure to those client wrappers or log it in a public diagnostic. No commit, push, publish, or deployment was performed.
