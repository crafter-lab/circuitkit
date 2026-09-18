# Flow highlights MVP

Local route: `/flow`.

This page documents the earlier hand-composed experiment only. Source-driven sections, highlights and scenes now have a separate [presentation contract](presentation.md) and editor at `/editor?mode=circuitkit`; they do not turn this switch demo into a general contact/state model.

This is one hand-composed SVG scene, not a language extension, general diagram animation API or electrical simulator. It demonstrates a short feathered highlight following an explicitly authored external route through an ideal switch and resistive load. The source is labeled +5 V; no current, power, propagation time or component behavior is calculated.

## Behavior

- The initial closed circuit plays a repeating directional sweep where motion is permitted.
- Open switch immediately removes the sweep and active-route emphasis. The source remains present.
- Closing rotates the contact first; the route becomes active after the 240 ms illustrative transition.
- Pause freezes animation without changing the switch or circuit state. Replay restarts the sweep.
- Visual speed uses Web Animations playback rate, independent of electrical quantities.
- Reduced motion removes the sweep and switch transition, leaving static direction arrows. Motion controls are disabled, but the switch still works.
- A hidden document pauses the sweep without changing the user's playback preference.
- Mobile keeps the diagram at a readable minimum width in a keyboard-focusable horizontal scroll region.

## Implementation

`app/flow/flow-demo.tsx` owns the authored paths, open/closing/closed state, playback and reduced-motion subscription. Four layered dashed strokes approximate a feathered traveling band; there is no per-frame React state update. `app/flow/flow.css` defines motion and route-scoped presentation. `app/flow/page.tsx` clearly labels the limited prototype.

This original experiment did not change the renderer, net model, Markdown format or exporters. The later declarative presentation increment integrates renderer routes and semantic identities separately; its verification is not covered by the MVP checks below. Relays, branch selection, switching transients and simulation-driven current remain out of scope.

## Verification

- `bun --no-env-file test tests/flow-highlights.test.tsx`: five focused tests cover state gating, static fallback, the external return path and SSR safety.
- `bun --no-env-file run typecheck` and focused Biome checks.
- `node artifacts/flow-highlights/check-web.mjs`: measures changing stroke offset, frozen offset during pause, 2× playback rate, replay, open contact gating, four viewport/theme cases and reduced motion. Screenshots and a receipt are retained beside the script.
- Axe findings are retained, including incomplete SVG contrast checks. No general accessibility or electrical-certification claim is made.

The preview is a local development build, not a deployment or a qualified package release.
