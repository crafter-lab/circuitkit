# EducationalFigure React v2

The client adapter lives in `src/v2/react.tsx`. It exports exactly `EducationalFigure` and the type `EducationalFigureProps`. There is no default export. Package exports, the core index, build wiring, and app integration remain parent-owned.

```tsx
import type { ReactNode } from "react";
import type { Diagnostic } from "../src/v2/safety.ts";
import type { PublicFigure } from "../src/v2/schema.ts";

export interface EducationalFigureProps {
  document: PublicFigure | unknown;
  namespace?: string;
  className?: string;
  selectedTargets?: readonly string[];
  onSelectionChange?: (ids: string[]) => void;
  onDiagnostics?: (diagnostics: Diagnostic[]) => void;
  caption?: ReactNode;
}
```

## Boundary and rendering

Only send an already-authorized PublicFigure to this component. Project the author model on the trusted host before serialization. The client adapter does not import the host index, compiler, fixtures, AuthorFigure, or projectFigure. An author document passed as unknown fails validation; it is never projected implicitly. A namespace is not authorization.

The adapter calls the core `renderEducationalSVG` directly. Its exact, validated SVG bytes are encoded into a self-contained `data:image/svg+xml` image inside a responsive outer SVG. This preserves the core glyph outlines, themes, bounds, and vector geometry without a second geometry implementation, external font fetches, DOM parsing, HTML injection, or a new dependency. The host CSP must allow `img-src data:`. The data URL is generated internally from validated core output, never accepted as an input prop.

The outer SVG uses the core viewBox and intrinsic dimensions with `display: block; max-width: 100%; height: auto`. A zero-margin figure wrapper accepts `className`. There is no lesson panel, toolbar, answer display, export button, fixed canvas, or mandatory caption. Optional `caption` is ordinary host-owned ReactNode content in a figcaption after the SVG. No HTML-string API is exposed or used by the component.

A valid empty public document (`display: []`, `targets: []`) is a successful no-op: core returns an empty SVG string and zero bounds. The component emits no DOM unless a host caption is provided, in which case it emits only the figure wrapper and figcaption. It never creates a zero-size viewBox, empty data image, target controls, or invalid-data alert for this case. Empty documents still report successful diagnostics after mounting. Nonempty target manifests without matching display parts remain invalid.

Canonical portable SVG export remains `renderEducationalSVG(publicDocument, options).svg`. Do not serialize the interactive DOM for export. Selection, focus, namespace allocation, and captions do not change the public document or canonical export. Hosts may provide their own export controls without copying selection into the document.

## Usage

```tsx
"use client";

import { useState } from "react";
import { EducationalFigure } from "../src/v2/react.tsx";
import type { PublicFigure } from "../src/v2/schema.ts";

export function Exercise({ document }: { document: PublicFigure }) {
  const [selectedTargets, setSelectedTargets] = useState<string[]>([]);

  return (
    <EducationalFigure
      document={document}
      namespace="exercise"
      className="exercise-figure"
      selectedTargets={selectedTargets}
      onSelectionChange={setSelectedTargets}
      caption={<span>Select the meter display or a visible probe.</span>}
    />
  );
}
```

For a static figure, omit `onSelectionChange`. Supplying only `selectedTargets` produces read-only highlights, with no target buttons or tab stops. Omitting `selectedTargets` means an empty selection, not uncontrolled state: a callback alone reports proposed changes but does not retain them.

Treat public documents as immutable. Keep the same document reference during selection updates, and provide a new reference when the public content changes. Validation/rendering and the encoded image are memoized by document identity and namespace. The component never mutates the input, adds fields, or returns a replacement document through a selection callback.

## Targets, selection, and accessibility

- The only interactive targets are entries in the validated core manifest. Routes, probes, traces, axes, edges, terminal/contact/pin targets, and any individual part made entirely of lines use exact public shapes for selection paint and hits, never their union rectangle. Other individual controls retain bounded rectangular overlays. Explicit net groups use member-specific geometry. Visible but unexposed parts do not become independent controls. There is no inferred net, connectivity, membership, or hidden target group.
- `selectedTargets` contains semantic IDs, not DOM IDs. Unknown IDs are ignored and never echoed into DOM attributes or callback results. Duplicates are removed. Callback arrays are fresh and ordered by the manifest.
- Each target is an SVG button with `tabIndex={0}`, its public label as its accessible name, and controlled `aria-pressed`. Tab follows manifest order; Shift+Tab reverses it. Enter, Space, and click toggle that target. Repeated keydowns do not toggle repeatedly. Space prevents page scrolling.
- Escape emits `[]`, keeps focus on the target, and stops propagation so clearing figure selection does not also dismiss an enclosing host control. The host must apply the callback to change selection.
- Focus has a two-tone, dashed, non-scaling ring, distinct from the theme-colored selection outline and translucent fill. Blur removes the ring. No global keyboard or focus listener is installed.
- The static SVG is an accessible image. An interactive SVG is a labelled group so its target buttons remain exposed. Title, description, visible math text, and target labels come only from validated public data. React escapes these strings. Decorative vector content and rings are hidden from accessibility and excluded from tab order.
- Host captions are separate host content, not part of document validation or canonical SVG accessibility. Hosts remain responsible for their caption content and public authorization.

## Wire hits and terminal priority

Individual wire-like targets reuse the same public-shape overlay renderer as net members. Each polyline retains every vertex and each disconnected segment remains a separate path. Dashed gaps and unfilled shapes remain unpainted. Probe wires and their contact circles remain reachable on their actual geometry, without a giant invisible bounding rectangle blocking other controls. Selection uses the same geometry, not a rectangular fill that would visually connect open routes.

Interactive figures have a final transparent, pointer-only hit layer for terminal, contact, and pin targets. It uses their validated public shapes, paints larger bounds first and smaller bounds last, and therefore gives the most specific small contact priority where painted geometry overlaps. A probe ring outside a terminal's smaller circle remains a probe hit. Equal-area contacts retain manifest paint order. No extra DOM IDs, roles, keyboard stops, or selected target IDs are created: `data-hit-target` identifies the proxy, and its click focuses and toggles the original `targetDOMId` control. `data-target` still identifies exactly the original manifest controls in their unchanged Tab order.

Pointer-down default focus is prevented on controls and proxies. Click activation then focuses the original control and reports selection. This matters for host viewports that pan on focus: focusing a large probe during pointer-down could otherwise move its geometry before mouse-up and cancel the click. Keyboard focus/activation stays on the original controls and requires no special host behavior. The layer performs no electrical inference and does not modify public geometry, core SVG bytes, or portable export.

## Explicit net groups

A public net target has `{ id, label, role: 'net', kind: 'group', members }`; core inspection adds its union `bounds`. The adapter narrows on `role === 'net'` and reads member shapes exclusively from the validated public display. It never imports `nets.ts`, the author compiler, electrical analysis, or host net inspection. Core still rejects malformed, missing, cross-panel, nested, or ambiguous member references.

The group remains one SVG button and one tab stop, for example the public label `Supply node`. Controlled selection uses the net's semantic ID (for example `circuit/net/supply`), not a list of selected member IDs. Individual targets retain their existing selection and keyboard order. A member exposed as an individual target keeps its own pointer surface; the group remains keyboard-accessible even if all its members are also individual controls. The contact-priority layer below handles a group route endpoint overlapping an individual terminal. There is no bounding-rectangle click redirection, which could otherwise incorrectly select a probe whose wire is elsewhere.

Group overlays reproduce each member's own shapes independently: polylines keep their vertices, width and dash pattern; separate paths stay separate; circles, polygons and rounded rectangles retain their geometry and original filled/unfilled regions. Selection changes overlay color only. The pointer hit area is the same painted geometry, including when its overlay color is transparent. There is no widened hit stroke, line joining across parts, rectangular group fill, or group-bounds hit area. Thus empty interior regions and excluded open-route halves/gaps do not become conductive selection surfaces, and unrelated controls inside the union bounds remain reachable. Actual overlapping painted geometry follows SVG hit testing, with explicit individual-member priority as described above.

For public math shapes used as members, the adapter extracts only path geometry/transform/fill-rule attributes from core-generated glyph outlines and creates React SVG paths. It never parses input HTML or accepts arbitrary SVG paths. Member geometry is prepared once per memoized public result and reused for focus/selection updates. `data-member` marks only validated public member IDs; `data-kind="group"` marks the single group control. These overlays do not add IDs that could alias an individual control. A dashed, non-interactive focus ring may outline the union bounds, but is never selection paint or a pointer hit area.

The core SVG embedded in the image, the original PublicFigure object, its display geometry, and portable export bytes remain unchanged by group selection. Public authorization and electrical truth remain trusted-host responsibilities; the adapter does not infer either from geometry.

## Namespace and SSR

`namespace`, when provided, uses the core option syntax `[A-Za-z][A-Za-z0-9_-]{0,63}`. Invalid options fail closed with the same fixed diagnostic as invalid public data.

Each mounted figure also uses React `useId`. An injective hexadecimal encoding of that opaque ID qualifies the namespace, including when several figures share the same document and supplied namespace. No document ID, random number, time, counter, browser-only API, or effect allocates IDs. IDs survive hydration and ordinary selection rerenders.

The outer SVG exposes its effective opaque namespace in `data-educational-namespace`. Every allowed overlay ID is exactly `targetDOMId(effectiveNamespace, semanticId)` from core. `data-target` retains the public semantic ID; consumers should not parse or persist the opaque namespace. The effective DOM namespace is not the portable export namespace and can exceed the core export option's length limit. IDs inside the encoded SVG image are isolated in its image document, not duplicated in the host DOM.

Within a React root, no special host setup is needed. For independently server-rendered/hydrated roots in the same page, supply a distinct React `identifierPrefix` per root and use the same prefix on the server and in `hydrateRoot`. This is React's cross-root `useId` requirement, not a figure-document field. Server and client must receive the same initial public data and props.

## Invalid data and diagnostics

Core validation rejects unknown keys, absent target parts, author envelopes, unsupported glyphs, malformed JSON objects, accessors, cycles, invalid namespaces, and resource-limit violations. The component renders the same accessible alert for every failure:

> Figure unavailable. Invalid or unsupported educational figure.

No partial diagram, original values, input paths, field names, stack traces, or author diagnostics appear in the fallback. Optional host captions remain outside it. A valid-to-invalid update removes the prior SVG and controls; a later valid update recovers.

`onDiagnostics` runs in an effect after mounting and when the memoized render result changes, never during rendering or SSR. A separate effect keeps the latest committed callback in a ref; replacing the callback alone does not replay diagnostics. Inline parent callbacks that call setState are supported without a notification loop, provided the public document reference remains stable. Adding a callback after mounting takes effect on the next result notification rather than replaying the current result.

Each notification receives a detached array and detached diagnostic objects: `[]` on success (including empty documents) or exactly `[{ code: "educational.invalid", message: "Invalid or unsupported educational figure." }]` on failure. Host mutation of received diagnostics cannot mutate the core result or fallback. React development StrictMode can replay effects; callbacks must tolerate repeated reports.

## Real consumer pointer regression

The required regression comes from `artifacts/education-consumer/runs/final-tarball-20260916/pointer-repro.json` and its `pointer-overlap-final.webm` recording: divider `figure:9b44280001e18ea9255a99e04d479bb52a40c9ef0713c984a8add13a35868b22`, teaching/light, 320px viewport. The original native click at Terminal B's center hit the later positive-probe rectangle instead. B's measured bounds were 8×8, while that probe rectangle was 207×222.

The test file includes the complete public document extracted through the real installed consumer's adapter and target allowlist, not a simplified replacement scene or an author model. Browser acceptance renders two instances inside 702-unit readable canvases at a 320px viewport, with the installed consumer's focus-reveal pan calculation. Actual screen coordinates are computed from the rendered SVG transform, followed by native `mouse move/down/up` input. No selector click, forced focus, synthetic event dispatch, or manual selection update substitutes for this pointer regression.

Acceptance covers B center `(360,220)`, positive-probe wire `(510,230)`, its ring outside the terminal `(365,220)`, blank space inside its old bounding rectangle `(430,240)`, both instances, and A→B→C→positive→negative→next-instance-A keyboard order. An independently exposed open-route fixture verifies both real line segments can be clicked while their gap cannot. Original IDs, five divider keyboard controls, public document identity, and canonical export/image bytes remain intact. The harness declares UTF-8 explicitly so the real fixture's non-ASCII labels hydrate unchanged.

This browser acceptance is mandatory before handing off this pointer fix, even though the default no-browser unit command skips the CLI-gated test. Source-level proof does not replace the parent's installed-package acceptance: the parent must perform the last repack and rerun the original Next consumer coordinate repro. This task does not build, repack, or modify the installed consumer.

## Verification

No dependencies were installed and no package, build, app, core index, or other core files were changed. The adapter uses stable React 19 hooks, not APIs specific to a 19.3 prerelease. The parent owns the separate React 19.2/19.3 peer compatibility matrix and package-level integration checks. Package rebuilding may be concurrent with adapter edits: after this handoff, the parent must run a final package rebuild to include these fixes.

Run from the repository root:

```sh
bun test tests/v2-react.test.tsx tests/v2-nets.test.ts tests/v2-engine.test.ts tests/v2-safety.test.ts tests/v2-boundaries.test.ts
CIRCUITKIT_BROWSER_TEST=1 bun test tests/v2-react.test.tsx
bunx --no-install tsc --ignoreConfig --noEmit --strict --noUncheckedIndexedAccess --target ES2022 --module ESNext --moduleResolution Bundler --allowImportingTsExtensions --resolveJsonModule --esModuleInterop --skipLibCheck --jsx react-jsx --types bun,node,react,react-dom src/v2/react.tsx tests/v2-react.test.tsx
bunx --no-install biome check src/v2/react.tsx tests/v2-react.test.tsx docs/v2-react.md
```

Verified locally on 2026-09-16 with Bun 1.3.11, React 19.3.0, and ReactDOM 19.3.0 after the real divider pointer fix. All four commands above exited 0. Combined React/core/net suite: **140 pass, 0 fail, 1 CLI-gated browser test skipped, 3648 assertions**. Browser-enabled React suite: **35 pass, 0 fail, 1230 assertions**, including the required exact-divider native-coordinate acceptance. The browser-only command `CIRCUITKIT_BROWSER_TEST=1 bun test tests/v2-react.test.tsx --test-name-pattern 'standalone browser'` also passed: **1 pass, 0 fail, 34 filtered, 285 assertions**. Focused TypeScript: no diagnostics. Biome: **2 source/test files checked, no fixes needed** after formatting; this installed Biome does not check Markdown. The new fixture initially exposed a missing UTF-8 declaration in the harness; that encoding issue was corrected without changing core SVG bytes or suppressing hydration warnings. React 19.2 was not separately installed or tested; the adapter uses React 19.2-compatible hooks. The existing installed Next consumer was inspected but not rebuilt or repacked by this task.

The real browser parent passes a fresh inline diagnostics callback on every render and calls setState with each received array. The regression asserts one initial notification and two parent renders, no notification on callback-only replacement, delivery to the latest callback on result changes, and detached diagnostic objects even when the host mutates them. It also covers SSR hydration of an initially empty caption-only figure, nonempty/invalid/empty/recovery transitions, and adding a caption to an empty figure without replaying diagnostics. Nonempty embedded SVG remains byte-identical to core output across the fixture corpus.

The default test command needs no browser. It covers SSR for 16 fixtures across three stages and three themes, byte-identical embedded core SVG, bounds/manifest correspondence, immutable selection, namespace separation, public-only ARIA, host captions, uniform invalid-data fallback, and the client import boundary. Group regressions additionally cover one control per net, member-only paint, separate polyline segments, dashed strokes, unfilled polygons, rounded rectangles, glyph fill rules, malformed member rejection, and collision-free same-document instances.

The opt-in browser test requires an already-installed `agent-browser` CLI and browser. It builds and serves its standalone harness entirely in memory on loopback using Bun, uses its own named browser session, and closes both server and browser in cleanup. It does not start or modify the parent app. It verifies three same-document/same-namespace instances, hydration ID preservation without warnings, SVG image loading, real Tab/Enter/Space/Escape behavior, repeat suppression, focus-ring cleanup, instance isolation, controlled callbacks, unknown-ID filtering, unchanged document identity/export, a 320px viewport, diagnostics, and valid/invalid/recovery transitions. Two additional same-document/same-namespace net figures verify the `Supply node` keyboard control, actual L-shaped route and short-component hits, untouched open gaps and unrelated controls inside group bounds, native mouse activation and overlapping-terminal priority, group/individual controlled selection, unchanged document identity/core export/image bytes, and unique DOM IDs. Native mouse clicks use validated, rounded onscreen pixel coordinates for the installed CLI.
