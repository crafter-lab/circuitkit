# Teaching sequences

Teaching steps are authored presentation for FigureDocument version 1. They select existing components and whole nets without changing circuit connectivity, component values, curated recipe routing or symbols. There are no timers, automatic transitions, current-flow animation or inferred operating results.

## Authoring contract

`presentation.steps` is optional. Its array order is the teaching order, with at most 32 entries. Each entry is a strict object with required fields:

| Field | Contract |
| --- | --- |
| `id` | Unique, non-whitespace string, at most 128 UTF-16 code units. Prototype-like names remain data. |
| `title` | Non-whitespace plain text, at most 160 UTF-16 code units. |
| `description` | Plain text, at most 2,000 UTF-16 code units; empty text is allowed. |
| `highlight.components` | Required array of existing component IDs, at most 32 entries, each at most 128 code units. |
| `highlight.nets` | Required array of existing net IDs, at most 32 entries, each at most 128 code units. |

Step text rejects XML control characters and unpaired surrogates. Highlight references use the existing entity ID rules. Unknown fields are rejected at every object level. Rendering still enforces the pinned font and measured text layout; unsupported glyphs or unbreakable text can produce diagnostics rather than clipped output.

`presentation.activeStep` is optional and must exactly match an existing step ID. Omission restores the normal authored `presentation.highlight`, not the union of all step highlights. `null` is not a document value. An empty steps array is valid only without an active step.

All references are validated, including inactive steps. Duplicate step IDs produce `presentation.duplicate_step`; missing references produce `presentation.unknown_highlight`; an unknown saved active ID produces `presentation.unknown_active_step`. Diagnostic paths identify the exact step and reference index. Canonicalization deduplicates and sorts highlight sets but preserves step order and authored text.

## Rendering and persistence

`renderSVG`, `inspect` and `validate` compile with a derived presentation but return the canonical authored document. An active step replaces visible component/net highlights. Its title and description follow the authored caption in resolved annotation metadata and the SVG accessible description. `renderSVG` retains the circuit-only frame; `renderFigureSVG` adds the visible caption below the circuit, even when there are no authored annotations.

The authored caption and base highlights are never rewritten. Rendering a returned document again produces the same output, without cumulatively appending step text. Existing no-step figures retain their original SVG bytes.

`CircuitLessonFigure` computes pressed legend labels from the effective step highlights. An explicit `activeNet` or hover/focus preview takes priority over the step for the visible net. This clears the active step only in a derived preview, and retains the step's effective component highlights. Downloads retain the original saved step, never a hover selection. To persist a manual net instead, the host must explicitly create a new document without `presentation.activeStep` and update its authored highlight. Without a saved active step, the existing controlled `activeNet` export behavior is unchanged.

## Circuit-only and compact React layers

```tsx
import { CircuitSchematic, CircuitLessonFigure } from "circuitkit/react";

<CircuitSchematic document={document} />
<CircuitLessonFigure document={document} activeNet={net} onActiveNetChange={setNet} />
<CircuitLessonFigure document={document} layout="expanded" download />
```

`CircuitSchematic({ document, className?, onDiagnostics? })` renders only the pure `renderSchematicSVG(document)` SVG. It does not render controls, padding, captions, downloads or an error panel. The SVG retains its intrinsic aspect ratio and shrinks to its container with `max-width: 100%`. Invalid input clears the diagram and reports structured diagnostics after mount; the host owns any error UI. Callbacks do not run during SSR. `CircuitFigure` remains the unchanged legacy adapter for `renderSVG`.

`CircuitLessonFigure` defaults to `layout="compact"`. It uses `renderSchematicSVG(document, { annotations: true })` for inline markers and colors, not a framed lesson SVG hidden by CSS. The diagram has no minimum height, forced minimum width or padding. Its hit layer uses the exact tight SVG viewBox, including its nonzero origin. Annotation paths and segments remain in original user space; do not translate them by the viewBox origin or by cropped bounds. `getScreenCTM()` performs that mapping for screen-space hit testing.

Compact chrome is one row of All and annotation labels, with an optional closed Notes disclosure and a quiet SVG download action. There is no instruction paragraph, visible selection-status duplicate, full default legend grid or default caption. A single selected or previewed annotation can show its own description below the row. Multiple authored selections without a preview do not choose an arbitrary description. Notes contains the detailed legend when authored `legend` is enabled and the caption when present. It starts closed and expands only on user request. Closed Notes adds no content height or grid-row gap, including at 320px. Keyboard Tab reaches the Notes summary after the annotation labels; Enter/Space toggles it with visible focus retained, and closed details are skipped when tabbing onward to the SVG action. Annotation focus outlines are inset so horizontal control scrolling cannot clip them.

Additional lesson props:

| Prop | Default | Behavior |
| --- | --- | --- |
| `layout` | `"compact"` | `"expanded"` explicitly restores the previous course-style legend, instructions, visible status, caption and download placement. |
| `notes` | `true` | Compact only. `false` omits the disclosure and its detailed content entirely. |
| `showDescription` | `true` | Compact only. `false` omits the selected/preview description. |
| `download` | `false` | Opt-in persisted SVG export matching `layout`: annotated compact schematic in compact mode, full figure in expanded mode. Never a transient hover/focus preview. |

Selection remains controlled by `activeNet` and `onActiveNetChange`. Omitted `activeNet` uses authored highlights, including active-step highlights; `null` clears net selection. Without a selection callback the labels remain focusable for preview but announce read-only state. Pointer hover and keyboard focus preview independently of pressed selection. Enter/Space activate native buttons, Escape clears preview and requests no selection, and touch does not leave a hover preview behind. Diagnostics callbacks use the current callback prop and run after rendering.

`CircuitLessonSequence` explicitly uses compact diagrams with `notes={false}` and `showDescription={false}`. Its existing step controls and live explanation own the teaching content, so the child does not duplicate it in a legend or caption. Annotation labels still support transient previews. Sequence downloads are compact annotated schematics of the saved step, without adding a visible caption or full-figure frame. Sequence persistence, controlled/uncontrolled selection and rejection recovery are unchanged.

Host CSS can set `--circuit-control-size` (default `32px`), `--circuit-control-radius` (default `0px`), `--circuit-control-border`, `--circuit-control-color` and `--circuit-control-background`. Color fallbacks come from the document theme; semantic net colors and selected/focus outlines remain meaningful. For coarse pointers, set the size on the host without adding padding around the graphic:

```css
@media (pointer: coarse) {
  .course-circuit {
    --circuit-control-size: 44px;
  }
}
```

Use `className="course-circuit"` on the lesson or an ancestor. Compact classes include `.circuit-lesson-compact-chrome`, `.circuit-lesson-controls`, `.circuit-lesson-description`, `.circuit-lesson-notes`, `.circuit-lesson-notes-content` and `.circuit-lesson-download`; the root exposes `[data-layout="compact"]`. Scope legacy grid, caption and figure-padding rules to `[data-layout="expanded"]` rather than applying them to every lesson figure. The compact row scrolls labels when needed instead of wrapping into multiple rows. No application CSS, manifest or core renderer files are owned by this React change.

## React API

```tsx
import { CircuitLessonSequence } from "circuitkit/react";

<CircuitLessonSequence document={document} download />
```

With `activeStep` omitted, the component owns selection internally. It initially uses the document's saved step, or Show all when none is saved. Previous stops at the first step. Next from Show all selects the first step and stops at the last. Numbered buttons select any step directly. Show all restores authored highlights. Controls are ordinary keyboard-accessible buttons with unique diagram associations; selected step buttons use `aria-current="step"`, and authored descriptions appear in a polite live region. No selection callback runs during render.

Treat the document as immutable. A different document object discards uncontrolled selection and uses that document's authored state. Returning later to the same earlier object does not revive its old local selection. Entering or leaving controlled mode also discards local selection; returning to uncontrolled mode uses the current document's authored step. Controlled selection always remains the host's responsibility. These resets do not emit selection callbacks.

Internal selection does not mutate the supplied document; downloads use the locally selected step. Hover/focus in the nested figure only previews a net. To preserve progress across document replacements or unmounts, keep a controlled step-ID map in the host, keyed by stable lesson identity. Explicit `null` must remain Show all rather than falling back to an authored active step.

```tsx
import { useState } from "react";
import { CircuitLessonSequence } from "circuitkit/react";

function ControlledLesson({ document, lessonId, saveAuthoredDocument }) {
  const [steps, setSteps] = useState<Record<string, string | null>>({});
  const activeStep = Object.hasOwn(steps, lessonId)
    ? steps[lessonId]
    : (document.presentation.activeStep ?? null);
  return (
    <CircuitLessonSequence
      document={document}
      activeStep={activeStep}
      onActiveStepChange={(nextStep, selectedDocument) => {
        setSteps((previous) => ({ ...previous, [lessonId]: nextStep }));
        saveAuthoredDocument(selectedDocument);
      }}
      download
    />
  );
}
```

`activeStep: string | null` enables controlled mode; `null` means Show all. In controlled mode the host must update the prop after a callback. With no callback, controlled mode is read-only. In uncontrolled mode the same callback can observe selections without taking ownership. Its second argument is a canonical document with the selected `activeStep` saved, or omitted for Show all, and the original authored caption/highlights intact. The example's `saveAuthoredDocument` is a host-owned function, not a CircuitKit service.

Props:

```ts
interface CircuitLessonSequenceProps {
  document: unknown;
  activeStep?: string | null;
  onActiveStepChange?: (activeStep: string | null, document: FigureDocument) => void;
  className?: string;
  onDiagnostics?: (diagnostics: Diagnostic[]) => void;
  download?: boolean;
}
```

A requested step must render successfully before selection is accepted or `onActiveStepChange` is called. Glyph/layout failures reject the candidate, keep the previous accepted figure and navigation, and show an explicit error. Another step or Show all can recover without replacing the document. If an initially saved or controlled selection cannot render, no stale SVG is displayed; Show all remains available when the unselected document can render. Controlled recovery requires the host callback to update the prop.

`onDiagnostics` includes render failures, rejected candidates and child SVG-download failures. It reports changes in diagnostic content, including an empty array on recovery, rather than emitting again because the host supplied a new callback identity. Inline callbacks that update host state do not create a notification loop. Replacing the callback alone does not replay unchanged diagnostics.

The selection callback receives the canonical authored document for JSON copy, share encoding or full-figure export, with the selected ID saved and no derived caption appended. Copy/share/export controls must use that selected document, not the original unselected input or a hover preview. If the host changes values or theme later, derive a fresh selected document from the updated source and saved step ID before exporting; a previously captured callback document is only a snapshot. The lesson page does this with `resolveLessonSequence`.

Documents without steps render a normal lesson figure without sequence controls. The component has no network, storage or URL behavior.

## Demonstrations and portable examples

The `/lesson` page preserves the original divider and amplifier node-selection demonstrations and labels. Open teaching sequences to try three independent sequences: voltage divider, RC low-pass and feedback amplifier. A host-owned controlled map preserves each current step, including Show all, across theme/value changes, invalid-input recovery and hide/show. The page rebuilds canonical selected documents for the current theme and values, so SVG downloads keep both the selected step and latest values. This state lasts for the mounted lesson page, not across reloads. The existing divider value and invalid-document controls remain available.

New portable files are paired JSON and Markdown in `examples/lessons/`:

- `voltage-divider.json` and `voltage-divider.md`
- `rc-lowpass.json` and `rc-lowpass.md`
- `feedback-amplifier.json` and `feedback-amplifier.md`

Each Markdown file contains a real `circuitkit` fenced JSON document, with complete authored prose outside the fence. Hosts without an adapter show inert code. A static export is an explicit fallback:

```sh
circuitkit render examples/lessons/voltage-divider.json --figure --out divider.svg
```

Embed the generated image using the host's normal Markdown image syntax. These examples need no other checkout. They do not claim integration with Gradual or any other course host.

## Parent integration handoff

Core exports available for the parent-owned `src/index.ts`:

```ts
export { teachingStepSchema, type TeachingStep } from "./schema.ts";
export { deriveStepPresentation } from "./renderer.ts";
```

`deriveStepPresentation(presentation: FigureDocument["presentation"]): FigureDocument["presentation"]` expects validated presentation. It returns the original presentation when no step is selected. For an active step it returns derived highlights/caption with `activeStep` removed, making repeated derivation idempotent. Use the original document for persistence, not this derived preview.

React-local helpers:

- `resolveLessonSequence(document: unknown, activeStep?: string | null): RenderResult`, exported by `src/lesson-sequence.tsx`, validates selection and returns a canonical selected document.
- `resolveLessonFigure(document: unknown, activeNet?: string | null, options?: ResolveLessonFigureOptions): RenderResult`, exported by `src/lesson-figure.tsx`, renders a net preview while retaining a saved active step in its returned document. Its helper default deliberately remains legacy/expanded for existing callers. Pass `{ layout: "compact" }` as the third argument for a tight annotated schematic. The React component itself defaults to compact.
- `exportLessonFigure(persisted: RenderResult, options?: ResolveLessonFigureOptions): RenderResult`, exported by `src/lesson-figure.tsx`, retains full-figure export by default for existing helper callers. `{ layout: "expanded" }` explicitly selects that legacy export; `{ layout: "compact" }` rerenders the persisted document with `renderSchematicSVG(document, { annotations: true })`. The component passes its current layout, so its compact download cannot restore the rejected header/footer/caption spacing. Rendering from the persisted document rather than preview SVG preserves saved steps and controlled selections during hover/focus. Failure results pass through unchanged.

`src/react.tsx` exports `CircuitSchematic`, `CircuitSchematicProps`, `CircuitFigure`, `CircuitFigureProps`, `CircuitLessonFigure`, `CircuitLessonFigureProps`, `CircuitLessonSequence` and `CircuitLessonSequenceProps`. React-local resolvers remain direct-file helpers, not new package-root exports. The parent-owned build should continue emitting the React entrypoint; no manifest change is needed for these named React exports. No CSS or package/build files are changed by this implementation. Parent CSS can target `.circuit-lesson-sequence`, `.circuit-lesson-sequence-controls`, `.circuit-lesson-sequence-steps`, `.circuit-lesson-sequence-description` and `[data-sequence-mode]`. Provide wrapping controls, readable spacing, disabled states, visible keyboard focus and selected-step styling through `[aria-current="step"]`; no motion is needed.

## Verification

The download-layout correction passed focused verification on 2026-09-16: 94 tests across three files, including both real `agent-browser` harnesses, with zero failures. Typechecking and scoped Biome checks exited 0. Regression coverage compares downloaded SVG bytes against compact and expanded renderers during hover, retains the saved step in sequence downloads, and verifies at 320px that closed Notes contributes no layout space, keeps visible keyboard focus through Enter/Space toggles, and tabs onward to the download action. The closed control row measures exactly 32px, or 44px with the host override.

```sh
bunx --no-install biome check src/{lesson-figure,compact-legend}.tsx tests/{compact-figure,steps}.test.tsx
bun run typecheck
CIRCUITKIT_BROWSER_COMPACT=1 CIRCUITKIT_BROWSER_STEPS=1 bun test ./tests/{compact-figure,lesson-figure,steps}.test.tsx
```

Before that correction, the broader rearchitecture verification passed 414 tests across eight files on the same date. That broader suite was not rerun for the focused download correction. Legacy SVG fixtures were not regenerated. No app, manifest or core files were changed by this React work; no installs, commits or deploys were performed.

```sh
bunx --no-install biome check src/{react,lesson-figure,lesson-sequence,compact-legend}.tsx tests/{react,lesson-figure,steps,compact-figure}.test.tsx
bun run typecheck
CIRCUITKIT_BROWSER_COMPACT=1 CIRCUITKIT_BROWSER_STEPS=1 bun test ./tests/{compact-figure,lesson-figure,react,steps}.test.tsx ./tests/{annotations,renderer,validation,schematic}.test.ts
```

Focused checks:

```sh
bun test ./tests/steps.test.tsx ./tests/lesson-figure.test.tsx ./tests/react.test.tsx ./tests/validation.test.ts ./tests/renderer.test.ts ./tests/annotations.test.ts
bun test ./tests/annotations.test.ts --test-name-pattern 'immutable pre-annotation SVG fixture'
CIRCUITKIT_BROWSER_STEPS=1 bun test ./tests/steps.test.tsx --test-name-pattern 'browser:'
bun test ./tests/compact-figure.test.tsx ./tests/react.test.tsx
CIRCUITKIT_BROWSER_COMPACT=1 bun test ./tests/compact-figure.test.tsx --test-name-pattern 'browser:'
```

The compact browser harness also runs entirely in memory through `agent-browser`, in its own session. It checks actual SVG/hit-layer matrices at desktop and narrow widths, zero graphic padding/min-height, one-row chrome, closed Notes, host-provided 44px controls, keyboard selection and disclosure, pointer preview, touch hit testing, unchanged controlled selection until the host applies it, replacement callbacks, pure invalid-input recovery and persisted export URL cleanup. Expanded-mode tests explicitly request `layout="expanded"`; no legacy fixture hashes are regenerated.

The opt-in browser test requires an existing `agent-browser` installation. It builds a React harness entirely in memory, serves it on an ephemeral loopback port, uses its own browser session, then closes both. It verifies uncontrolled and controlled navigation, callbacks, keyboard operation, document round-trips and mode switches without stale-selection revival, rejected-step recovery, saved-step recovery, export diagnostics without callback loops, canonical callback documents through JSON/share/static exports, exporting during hover, and the real lesson host retaining independent selections through theme/value changes and hide/show. The default test run skips this browser-only test.

The immutable fixture must retain all 27 existing recipe/theme hashes without regeneration. Step tests additionally cover all nine curated recipes and three themes with step-only captions, canonical persistence, strict failures, plain-text escaping, React accessibility and portable examples.
