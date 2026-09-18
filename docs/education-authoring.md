# NEWv2 education authoring and public API

This is an additive guide to the current [v2 contract](v2-contract.md), [React API](v2-react.md), [CLI](v2-cli.md) and [Gradual adapter](gradual-adapter.md), not a replacement for those contracts or the v1 APIs. Start with the [tested migration recipe](education-migration.md); see [decisions and limits](education-decisions.md) for the rationale.

## Author on the host, distribute only a projection

An `AuthorFigure` is exactly `{ schema: 'circuitkit.educational.author.v2', id, stages: { teaching, question, correction } }`. Every stage is a complete independent `{ title, description, theme, panels, expose }` model. Author each question from its permitted givens. Do not build a full answer scene in the browser and hide its labels afterward.

```ts
import { projectFigure, validateAuthorFigure } from "circuitkit/v2/server";
import { renderEducationalSVG } from "circuitkit/v2/public";

const checked = validateAuthorFigure(author);
if (!checked.ok) throw new Error("Author review required");
const projected = projectFigure(author, authorizedStage);
if (!projected.ok) throw new Error("Projection failed");
const rendered = renderEducationalSVG(projected.document, { namespace: "exercise1" });
if (!rendered.ok) throw new Error("Public render failed");
```

Here `author` is trusted host data and `authorizedStage` is the result of host access control, not a client query parameter accepted without checking. `validateAuthorFigure` is for trusted authoring/CI and checks all stages, including cross-stage panel identity. It must not run as a prerequisite to every learner projection: malformed nonselected models must not change the selected public result. `projectFigure` performs the necessary selected-stage validation itself.

The local package registers `circuitkit/v2`, `/v2/server`, `/v2/public`, `/v2/react`, `/v2/png`, `/gradual`, and the separate `circuitkit-education` binary. These entries have been exercised in a clean installed-tarball consumer; this is not a claim of registry publication. `/v2` and `/v2/server` expose the same authoring entry; `/v2/public` keeps client imports away from the compiler. All four packaged `examples/education/*.ts` files import the public `circuitkit/v2` entry, with relative imports only between companion examples. They require no source-import rewriting in an installed package. In a source checkout, run `bun run build` before executing them so package self-references resolve the current `dist` output. See the [local package workflow](../README.md#install-package).

## API boundaries

| Operation | Input | Successful result, in addition to `ok: true` and `diagnostics: []` |
| --- | --- | --- |
| `validateAuthorFigure` | Host-only author | No document payload |
| `projectFigure` | Unknown author input, explicit `Stage` | `document: PublicFigure` |
| `validateEducational` | Public document only | `document` |
| `inspectEducational` | Public document only | `document`, `bounds`, allowed `targets` |
| `renderEducationalSVG` | Public document, optional namespace | Same as inspection, plus `svg` |
| `renderEducationalPNG` | Public document, optional scale 1–4 | Public document/bounds/targets, `png: Uint8Array`, `format: 'png'`, `width`, `height`, `scale` |

Unlike these result-envelope APIs, `defineAuthorFigure(author)` returns a detached validated author directly or throws a fixed error. PNG is an async, separate Node/Bun subpath; it is not imported by browser core. The PNG CLI receipt reports a byte count instead of the API's byte array. Public functions accept decoded JSON objects, not JSON strings or `{ document }` envelopes. Copy out `.document` first. Unknown keys are rejected, not silently stripped. Omit optional fields rather than assigning `undefined`.

Public failures contain only `ok: false` and the fixed `educational.invalid` diagnostic, never partial output, input paths or private fields. PNG operational failures have their own fixed codes. Author diagnostics such as `graph.component-unit` stay on the host.

## Data: the complete public shape

A learner-facing Data tab, JSON download, React prop, accessibility description, SVG/PNG export, inspection response, cache or log must be based on the selected `PublicFigure`. A trusted author editor may show all stages, but that full author Data is never client question data. This is a distribution boundary, not a promise that a deliberately visible answer becomes secret.

This is a complete valid public document, not an abbreviated author wrapper:

```json
{
  "schema": "circuitkit.educational.public.v2",
  "id": "meter-example",
  "title": "Read the meter",
  "description": "Choose the signed voltage.",
  "theme": "geist-light",
  "display": [
    {
      "id": "meter/reading",
      "shapes": [
        {
          "kind": "math",
          "at": { "x": 70, "y": 46 },
          "runs": [{ "text": "? V", "script": "base" }],
          "size": 18,
          "align": "center",
          "family": "sans",
          "tone": "ink"
        }
      ]
    }
  ],
  "targets": [{ "id": "meter/reading", "label": "Meter reading", "role": "reading" }]
}
```

Those seven top-level fields are the full public shape. Display parts have stable `id` and bounded `shapes`: `line`, `polygon`, `rect`, `circle` or `math`. There is no `stages`, typed value model, source reference, assumptions, private metadata or implicit connectivity graph. The display includes nonselectable parts too: `expose` controls selection metadata, not the visibility of labels or geometry. Do not hide a solution merely by omitting it from `expose`.

## Small authoring examples

The source fixtures are generic, independently authored teaching material. They contain no Gradual payloads or private answers, do not dispatch on lesson IDs, and are not substitutes for the separate real-corpus adapter/coverage qualification.

| File | Purpose |
| --- | --- |
| [`composition.ts`](../examples/education/composition.ts) | `measuredStage`: compose a positioned electrical panel and ideal measurement overlay |
| [`led.ts`](../examples/education/led.ts) | Explicit v1 LED rewrite: given 5 V supply, 330 Ω resistor and an explicitly added 2 V LED-drop assumption |
| [`divider.ts`](../examples/education/divider.ts) | Explicit v1 divider rewrite: preserve its two 10000 Ω resistors and ports; author an additional 6 V question input |
| [`loaded-divider.ts`](../examples/education/loaded-divider.ts) | Extend the divider composition with different values and an additional load branch, without a plugin or renderer change |

`authorFigure`, `electricalPanel`, `stageModel`, and `placePanel` compose detached JSON-shaped models. Builders are not general validators; finish authoring with `defineAuthorFigure` or `validateAuthorFigure`. All three models are explicit in each example's `stages` object. Shared composition does not imply shared answer data or automatic stage redaction.

### Known, symbolic, unknown and math text

```ts
import { known, symbolic, unknown, type MathRun } from "circuitkit/v2";

const output: MathRun[] = [
  { text: "V", script: "base" },
  { text: "out", script: "sub" }
];
const resistance = known(10000, "Ω");
const teachingReading = symbolic(output, "V");
const questionReading = unknown("V");
const correctionReading = known(3, "V");
```

Units are `V | A | Ω | W | F | s | Hz | scalar`. Store signed finite base-unit numbers. `known(0.002, 'A')` means 2 mA, not 0.002 mA. An optional known-value `display` changes only the visible body, and the unit is appended separately; `known(0.002, 'A', math('2 mA'))` would misleadingly display `2 mA A`, so do not use it for prefix conversion. Unknown values render `?` with their unit; symbolic values are never numerically evaluated. Subscripts/superscripts are bounded `MathRun` data, not HTML or LaTeX. Supported glyphs are also validated.

Only authored readings and the contract's explicit scalar derivations are supported. The divider correction calls `resolveReading` with `operation: 'divider'`, known V/Ω/Ω inputs, and exactly `['ohmic', 'unloaded-divider']`. No topology solver inferred those assumptions. The extension's loaded result is separately authored: two 2000 Ω branches in parallel give 1000 Ω, so a 9 V supply with 1000 Ω upper resistance gives 4.5 V. Applying the unloaded formula to the original lower branch alone would be incorrect.

### Nodes, probes and stable targets

V2 electrical panels contain terminal/component/route arrays with explicit endpoints and local coordinates. Resistor and capacitor values require Ω and F; source/diode/LED labels use V. Known passive values must be positive. Source terminal order is positive then negative; LED order is anode then cathode. Terminal separation must be at least 48 drawing units for a component. `required` terminals must be route endpoints; `free` deliberately permits unattached terminals.

A route joins terminals only when `state: 'connected'`; line crossings alone do not join nodes. Normal resistors, sources, capacitors and LEDs separate conductor groups. Closed buttons and explicit shorts join them. `at` translates a panel, and probe references resolve across these translations. Authors own spacing: the core computes bounds, not automatic panel packing or a visual overlap approval.

An ideal meter references two electrical terminals, positive and negative, with probe bends local to the measurement panel. It never loads or joins the circuit. Authored readings can be known/symbolic/unknown. A `potential-difference` reading requires known V potentials at both terminals and exactly `['common-reference', 'ideal-voltmeter']`; it computes positive minus negative, never guesses a reference or defaults missing potentials to zero. The LED correction explicitly supplies 5 V and 2 V potentials and gets +3 V; reversing probes gives -3 V.

Stable semantic identities include `circuit/component/R1`, `circuit/terminal/VOUT`, `meter/probe/positive` and `meter/reading`. Use these for saved selection, not array indices or DOM IDs. Reuse a panel ID only for the same panel kind. Changing values, theme or stage does not require new entity IDs. Namespace-qualified DOM IDs come from `targetDOMId(namespace, semanticId)` and may change per rendered instance.

A declaration such as `namedNets: [{ id: 'output', terminal: 'VOUT' }]` is host-only. Only explicit stage exposure publishes a group:

```ts
{ id: "circuit/net/output", label: "Output conductor", role: "net" }
```

The corresponding public target adds `kind: 'group'` and `members: string[]`, containing same-panel visible terminal/connected-route/closed-or-short component part IDs. It does not contain a terminal graph; probes, ordinary resistor bodies and open routes are not group members. Inspection adds union bounds. Anchor names follow their current fragment after a split; merged names require explicit author resolution, not guessed aliases. Exposing a net intentionally discloses its allowed member identities, so review that choice for each question.

The examples explicitly permit the output/series node in all three stages and keep other named nets host-only. Removing all net exposures leaves the drawing unchanged and emits no net membership manifest. `inspectElectricalNets` is a host-only authoring aid and must not be forwarded to learners.

### Extend by composition, not a lesson renderer

`loadedDividerCircuit()` calls `dividerCircuit(1000, 2000)`, appends terminals `R3_a`/`R3_b`, resistor `R3`, and routes from `VOUT` to the load and from the load to `GND`. It reuses `dividerStage()` and `measuredStage()`, including the v2 layout and ideal measurement APIs. All original part IDs remain, while the explicit output net acquires the additional connected terminal and route. This is a new generic scenario, not an automatic migration of the legacy `loaded-divider` preset.

Add your own parameters/typed panels in author code. Do not add a renderer branch for a particular question or lesson. Unsupported component families require a separately reviewed core capability or must remain in v1; fabricated substitutions are not extensions.

## React and adapters

```tsx
import { EducationalFigure } from "circuitkit/v2/react";

<EducationalFigure
  document={publicDocument}
  namespace="exercise1"
  selectedTargets={selectedIds}
  onSelectionChange={setSelectedIds}
  caption="Select a visible probe or the meter reading."
/>
```

These host variables contain only already-authorized public data and local selection state. The component does not accept author models for implicit projection, does not authorize stages, and does not show answers on request. Selection is controlled; omit the callback for static/read-only use. Export with the public renderer, not serialized interactive DOM. Captions are host-owned React content, separately authorized and not automatically included in canonical SVG. The current adapter requires CSP `img-src data:` for its internally generated SVG image.

The Gradual adapter is a separate host integration. `adaptGradualPair` consumes independently supplied stages; `projectGradualPair` returns only the selected `{ document, host }`. Keep the author and complete `pair.host` map server-side. Captions and non-diagram records remain host content, not electrical geometry. The adapter is not a v1 `FigureDocument` converter, nor does generic example success prove coverage of its real corpus.

## Verification and packaged files

After `bun run build` in the source checkout, run `bun test tests/education-examples.test.ts`. The test covers the three examples across all three stages and themes, public roundtrips, stable target/display identities, probe polarity, explicit net exposure, intentional-open diagnostics, legacy-to-v2 endpoint mappings, CLI projection, private-stage noninterference and all 27 original v1 SVG hashes.

These entries are already present in `package.json`'s `files` allowlist. The installed-tarball audit confirmed all three guides and all four TypeScript examples are packaged:

```json
[
  "docs/education-authoring.md",
  "docs/education-migration.md",
  "docs/education-decisions.md",
  "examples/education/*.ts"
]
```

The explicit `examples/education/*.ts` entry packages `composition.ts`, `led.ts`, `divider.ts` and `loaded-divider.ts`; `examples/*.json` is a separate legacy entry. The installed examples executed under Bun using their public `circuitkit/v2` imports: the three supplied authors and a composed helper case produced 36 stage/theme renders. No import rewriting or additional allowlist entries are pending. Tests remain repository-only, and `test:education` already includes `tests/education-examples.test.ts`. This documentation correction does not change package/build/app/index files, dependencies or exports. It does not add an automatic migration helper.
