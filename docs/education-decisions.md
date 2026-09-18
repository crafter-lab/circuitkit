# NEWv2 education decisions

Status: accepted documentation of the current implementation and its boundaries, 2026-09-16. This ADR does not replace the [v2 schema/API contract](v2-contract.md), change v1 APIs, or declare a new release. Executable examples and regressions are in [authoring](education-authoring.md) and [migration](education-migration.md).

## 1. Typed author models compile to a bounded display list

Decision: compose typed electrical, measurement and other supported panels on the host. Compile the selected model into a strict public display list and explicit target allowlist. The public renderer accepts that list, not author graphs or opaque wrappers over source.

Why: a generic model supports changed values, connections and panel placement without adding a renderer per lesson. Bounded geometric primitives, enum paints and math runs prevent arbitrary HTML, SVG paths, URLs or executable markup entering the public schema. Public SVG and the React/PNG adapters share core output instead of independently implementing electrical geometry.

Cost: layout is author-controlled and must be reviewed for spacing. A valid display list is not proof of electrical truth, provenance, authorization or good pedagogy. A new component/panel capability needs real typed/schema/compiler review, not a disguised lesson-specific branch. Native PNG stays a separate Node/Bun entry.

Evidence: the loaded-divider fixture appends a real load branch while reusing the divider and ideal-meter composition. Tests compile all three examples through every stage and theme, validate JSON roundtrips and check deterministic SVG/target bounds. This is not a browser screenshot or installed-package qualification.

## 2. Select a stage before any public processing

Decision: authors provide independent teaching, question and correction models. `projectFigure` validates the strict author envelope, applies the bounded-JSON resource gate and compiles only the selected stage. `validateAuthorFigure` separately validates all three models and cross-stage identities on the authoring host.

Why: answer redaction after drawing or serializing cannot remove all side channels through labels, accessibility, metadata, target identities or errors. Equal selected stages must yield equal public data/rendering/inspection/diagnostics even if nonselected stage schemas, IDs or glyphs are malformed. Full-author validation in every learner request would reintroduce dependence on private stages.

Cost: authors must explicitly review question givens, visible geometry, text and target allowlists. Whole-input limits still reject cyclic, accessor-bearing, non-JSON or oversized author data; the guarantee is selected-stage output noninterference within that resource boundary, not timing-side-channel resistance or cryptographic privacy. Hosts authorize stages before projection. Full author Data never travels as client question props or downloads. A stage string, UI toggle or namespace is not authorization.

Evidence: each example has an unknown unit-bearing question reading and a separately authored correction. Tests replace both nonselected stages with malformed models/private sentinels and compare the complete public document, inspected targets, SVG/accessibility and public diagnostics. Public renderers reject author inputs and mixed public/author objects.

## 3. Stable identities with explicit, allowed net targets

Decision: retain semantic IDs for unchanged entities across stages/themes. `expose` declares selectable parts. Net names are stable host-only anchors until explicitly exposed; exposed nets become strict public groups of permitted same-panel display-part IDs. DOM namespaces prevent instance collisions but are not semantic identity.

Why: selection and saved references must survive correction, reordering and theme changes. A conductor node is more useful pedagogically than choosing unrelated terminal circles, but publishing all net membership by default can give away an answer. Allowed public groups provide intentional interaction without attaching a hidden author graph.

Cost: exposing members intentionally discloses connectivity information. It must be appropriate for the selected question. Nonselectable geometry is still visible and public. Opens split conductor groups; shorts/closed buttons merge them. Anchors follow their connected fragment, and conflicting merged names require explicit author resolution. Probes never union nodes. Normal resistor bodies, labels and open routes are not net-group members.

Evidence: migration tests verify all original endpoints and conductor groups, stable part/target IDs, the extension's additional output members, no probe membership and absence of all net metadata when exposures are removed. Legacy aliases are explicitly mapped to stricter v2 IDs, never silently discarded.

## 4. Intentional faults are explicit models, not validation bypasses

Decision: open routes, open/short non-button components and deliberate bypasses require `intent: 'intentional-fault'`. A bypass route also identifies the component it really bypasses. Ordinary open buttons are legitimate normal states. Wrong references, conflicting potentials, unit errors, duplicate IDs and degenerate geometry remain invalid regardless of intent.

Why: education must depict broken circuits and compare faults, while accidental shorts and omissions should still be caught. Automatically treating every invalid circuit as an intentional lesson would hide author mistakes.

Cost: author diagnostics remain host-only (`graph.fault-intent`, `graph.unintended-bypass` and related codes). Public failures remain fixed, with no private paths, values or partial scene. A valid intentional-fault drawing is not a recommendation to build or energize that circuit, and validation is not electrical-safety certification.

Evidence: the example regression opens the divider output route, observes author failure without intent, then accepts explicit fault intent and checks that the exposed output anchor resolves to the isolated output terminal. The broader [core contract](v2-contract.md) specifies bypass/reference/potential checks; this example test is not exhaustive fault qualification.

## 5. Captions and records belong to the host

Decision: keep captions, record/table content and surrounding lesson prose outside electrical geometry unless intentionally authored as supported diagram text. The Gradual adapter owns family translation; its pair result and complete stage-host map stay on the host. Only the selected `{ document, host }` is distributed. `EducationalFigure.caption` is host-owned React content, not arbitrary HTML input or an author-model field.

Why: not every educational item is a circuit. Fake electrical panels for records would obscure meaning and couple generic drawing to one corpus. Host prose may itself contain an answer, so projecting the diagram alone does not authorize an unselected caption or table.

Cost: canonical public SVG does not automatically include host captions, selection state or records. The host must render and authorize them separately, handle empty diagrams intentionally, and decide whether a separate composite export is needed. Do not serialize an interactive React tree as the portable circuit export.

Evidence: current React and Gradual contracts define these boundaries. The new examples are standalone generic fixtures without corpus records or copied Gradual answers; their success does not replace real adapter/corpus verification.

## 6. No general circuit simulation or inferred lesson answers

Decision: allow explicitly authored known/symbolic/unknown values and the limited scalar operations with exact units and assumptions. Ideal voltmeters may subtract explicit known terminal potentials. Connectivity analysis identifies conductor groups, not physical solutions. There is no nonlinear LED solver, transient simulator, implicit reference potential, symbolic algebra engine or automatic derivation from lesson names.

Why: unstated electrical assumptions would produce plausible but incorrect answers and leak results into question models. Known numeric base units and typed assumptions make author intent testable. Symbolic values are displayed, not secretly evaluated.

Cost: an author supplies the LED's 2 V forward-drop assumption and the divider's 6 V input, because neither exists in the corresponding v1 source. The loaded scenario needs a separate author-approved calculation; the unloaded-divider operation must not silently ignore a connected load. New unsupported topology/component families remain in v1 or await separately reviewed capabilities.

Evidence: tests check +3 V and reversed -3 V LED readings, the 3 V unloaded result, explicitly authored 4.5 V loaded result, unit rejection and failure of a derivation missing required assumptions. These are idealized pedagogical facts, not predictions for physical hardware.

## 7. Preserve v1, migrate pedagogy deliberately

Decision: add v2 entry points without changing v1 documents, routes, curated family validation or legacy renderer behavior. Do not present v1 as question-safe because a schematic view hides its automatically derived formula/framing/metadata. Provide tested explicit LED/divider rewrites before claiming any automatic migration.

Why: existing authored content and consumers must continue to work. The original nine exact v1 topologies and broader v1 ID/role-alias vocabulary are not equivalent to the v2 graph/schema. Blanket conversion would fabricate unsupported components, omit unfamiliar IDs, or infer missing answer data.

Cost: there is no automatic migration implementation in this work, including no `src/v2/migration.ts`. An eventual two-family helper must reject unsupported families and require explicit teaching/question/correction decisions. The generic loaded-divider extension is not migration coverage for the other seven v1 recipes. Any package export for a future helper remains parent-owned.

Evidence: all 27 immutable original recipe/theme hashes are checked directly. Explicit migration tests compare every original endpoint, conductor group and component/value, and prove the old renderer still accepts aliased v1 IDs while v2 rejects invalid raw IDs. No baseline is regenerated.

## 8. Widen React peer support only after real consumer proof

Decision: retain the current exact React peer disjunction, `19.2.8 || 19.3.0`, as recorded in the [package overview](../README.md#educational-figures-v2). React 19.2.8 support was added on real installed-consumer evidence, not compatibility inferred from TypeScript, a public ReactNode type or source-only render tests. This documentation correction does not change that declaration or broaden it to an untested range.

Recorded proof: the clean installed-tarball consumer used standalone React and ReactDOM exactly `19.2.8` with Next exactly `16.3.3`, Bun `1.3.11` and Node `v24.18.0`. Installation, public import resolution, consumer typecheck/production build, standalone React 19.2.8 SSR and warning-free development hydration, keyboard selection, installed CLI and native PNG checks passed. All four packaged examples executed with public imports. The consumer's full pointer-interaction gate retained a terminal/probe hit-region conflict, so this is not an unconditional full-UI pass.

Next 16.3.3 App Router separately reported its bundled React `19.3.0-canary-cbb046ab-20260731`; that runtime was not overridden. It is not the standalone React 19.2.8 proof and is not evidence of a second fresh stable React 19.3.0 package consumer in that run. The existing exact 19.3.0 support remains distinct from the newly qualified 19.2.8 consumer.

Required proof before any further widening: install a freshly packed artifact in clean consumers using each proposed React/React DOM version, check import/export/type resolution, run server rendering and actual browser hydration, exercise keyboard and pointer target selection, verify multiple namespaces, confirm public-only bundle boundaries, and run standalone SVG/PNG exports where applicable. Record exact runtime/dependency versions, commands, failures and outcomes with the package change. Avoid duplicate React installations that can mask or create hook failures.

Why/cost: optional peers allow non-React core consumers, but they do not certify a broad React version range. Source fixture success is useful regression evidence, not a substitute for real consumer or hydration qualification. This docs-only correction records the existing installed-consumer evidence without rerunning it or changing package/peer fields.

## Documentation scope and package status

This correction changes only the three education authoring/migration/decision docs. The existing four generic TypeScript examples and `tests/education-examples.test.ts` are unchanged. No code comments, package/app/index edits, core changes, renderer plugins, copied Gradual data or private corpus answers are introduced. The three guides and four public-import examples are already allowlisted and packed; their current status is listed in [authoring](education-authoring.md#verification-and-packaged-files). No allowlist additions or import rewrites remain pending for these files. Existing contracts and exports remain intact.
