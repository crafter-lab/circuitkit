# Main-app QA after the final visual fixes

Target: `http://127.0.0.1:3228`, the parent's rebuilt production server (shell291), 2026-09-16. Only the QA harness, this report and owned artifacts were changed. No app/core edits, package installation, deployment, parent-server operation, personal Gradual access or request to the separate 3231 consumer occurred.

## Disposition

**The seven original visual issues are closed in the reviewed coverage. The main app is not a full functional pass: valid same-origin author POSTs return 403 and prevent author workspace initialization.**

The final execution of the current complete script recorded **4,713 pass, 2 failed checks, 1 blocked phase, exit 1**: **4,715 checks total**. Both failed checks describe the same author-origin defect. Browser closure is confirmed. The separate screenshot supplement recorded **260 pass, 0 failed, 0 blocked, exit 0**. No artifact/layout assertion remains failed in the final run.

Observed runtime exceptions: **0**. Observed console errors: **0**. The real **HTTP 403 author failure is separate and is not hidden by those zero counts**.

TypeScript and Biome exit 0. The old 20 explicit-any warnings were removed using validated public documents, typed projection lookups, Zod guards for tool envelopes/snapshots/geometry/downloads, and checked nullable values. No lint suppression or unsafe Biome fix was used.

## Exact recipe

Run from `/Users/raillyhugo/Programming/railly/circuit-figures`, with the parent's production server already running:

```sh
agent-browser skills get core
agent-browser skills get dogfood --full
bun --no-env-file --no-install scripts/check-education-web.ts http://127.0.0.1:3228
bun --no-env-file --no-install node_modules/typescript/bin/tsc --noEmit --incremental false
bun --no-env-file --no-install node_modules/@biomejs/biome/bin/biome check scripts/check-education-web.ts
```

A focused screenshot recheck is also available. It is explicitly labelled as a subset, never a replacement for the full suite:

```sh
bun --no-env-file --no-install scripts/check-education-web.ts http://127.0.0.1:3228 --visual-reopen-only
```

Each process owns one uniquely named browser session and closes it in `finally`. The script never starts/restarts/stops the server. Browser commands, stdin, exit statuses, signals and output are recorded in `commands.jsonl`; HTTP request/response evidence is recorded alongside it. Independent phases continue after a failure, but failures remain red and make the full command exit 1. Full runs update `latest.json`; the focused run updates `latest-visual.json` separately.

## New blocker: AUTHOR-001, valid same-origin compile rejected

Severity: **high**, author-workflow availability. Status: **open, parent routing required**.

A generic valid measurement author model compiles to the expected selected public question when POSTed without an Origin header. The identical request with:

```text
Origin: http://127.0.0.1:3228
Content-Type: application/json
```

returns:

```text
HTTP 403
{"error":"Invalid or unsupported educational figure."}
```

The real browser at the same origin sends that Origin header. On opening `/editor/education/author?case=measurement&stage=question&theme=geist-light`, its valid untouched initial author fixture becomes “Invalid author draft,” the preview disappears and SVG/PNG/JSON are disabled. This is not malformed fixture data and not a tool-permission denial. The API's origin comparison in `app/api/education/route.ts` is the relevant server-side boundary; the precise reconstructed server origin was not logged or changed by QA.

Evidence:

- [Same-origin response](../artifacts/education-web-qa/2026-09-16T11-11-04-113Z/post-author-same-origin.txt)
- [Exact generic request body](../artifacts/education-web-qa/2026-09-16T11-11-04-113Z/author-same-origin-request.json)
- [Real failed browser output](../artifacts/education-web-qa/2026-09-16T11-11-04-113Z/failure-author-workspace-output.png)
- [Browser context](../artifacts/education-web-qa/2026-09-16T11-11-04-113Z/failure-author-workspace-context.json)
- [Browser request/response trace](../artifacts/education-web-qa/2026-09-16T11-11-04-113Z/failure-author-workspace-network.json)
- [Fresh final response](../artifacts/education-web-qa/final-same-origin-response.json), [headers](../artifacts/education-web-qa/final-same-origin-headers.txt)

The final direct HTTP reproduction was executed, with curl exit 0 and **HTTP 403**:

```sh
curl --silent --show-error --request POST http://127.0.0.1:3228/api/education \
  --header 'Content-Type: application/json' \
  --header 'Origin: http://127.0.0.1:3228' \
  --data-binary @artifacts/education-web-qa/2026-09-16T11-11-04-113Z/author-same-origin-request.json \
  --dump-header artifacts/education-web-qa/final-same-origin-headers.txt \
  --output artifacts/education-web-qa/final-same-origin-response.json \
  --write-out 'HTTP_STATUS=%{http_code}\n'
```

No origin stripping, alternate-origin navigation, response replacement, app-state patch or app/core fix was used to force a pass. The browser initialization failure blocks successful real-input author compilation, valid recovery, author-side export/callback cancellation and late successful-author-response ordering. The script contains these scenarios, but **they are blocked/unverified, not counted as passed**. Fix the actual origin validation/server-origin setup under parent ownership, supply a fresh server and rerun the full command.

### Author API behavior that was verified

These are real generic-fixture POST requests, distinct from the blocked browser workflow:

- Valid caller-supplied author data without Origin: 200, exactly the current selected `PublicFigure`, no author/stage map returned.
- Malformed nonselected correction (`null`): 200, byte-identical question response.
- Invalid selected question and malformed JSON: fixed 422 error.
- Cross-origin header: fixed 403 error.
- Wrong media type: fixed 415 error.
- Unexpected envelope property: fixed 400 error.
- Oversized ordinary and streamed bodies: fixed 413 error.
- Invalid UTF-8: fixed 422 error.
- Error responses retain `no-store` and `nosniff`, and expose no raw diagnostic/model fields.
- Subsequent generic question GET is unchanged: no compiler persistence into the generic preset.

## Original issue closure

The initial review opened 271 unique images: 252 from the rebuilt application and 19 prior baseline images. It closed six issues and withheld ISSUE001 pending correction-stage coverage. The supplement opened 53 more images: nine overviews, all 43 coverage-listed Readable windows and the actual-browser correction PNG. That closes ISSUE001 as well.

| Issue | Final visual disposition | Evidence and scope |
| --- | --- | --- |
| ISSUE001, resistor values across wires | **Closed** | Native open/bypass/composed, editor teaching and correction. Both `1000 Ω` values clear resistor bodies and wires at 1280/320 in both themes. Correction pans and the real PNG export also show clear V/COM probe labels. |
| ISSUE002, full Case name hidden at 320 | **Closed** | Editor and landing show the complete wrapping selected name, associated through `aria-describedby`; both themes. Native closed-select text is no longer the only source of the name. |
| ISSUE003, B/C across leads | **Closed** | Native measurement/named-nets and adapter divider, including mobile pans and both themes. |
| ISSUE004, LED/pullup/breadboard label collisions | **Closed** | A/LED/K, 10 kΩ/Released and R₁/R₂/b4/d6 are separated in the Readable windows. Desktop/320 and supplemental 390 board/breadboard coverage reviewed. |
| ISSUE005, “Not guaranteed” on marker | **Closed** | Native levels, light/dark. Text clears the marker. |
| ISSUE006, fragment/loop/supply small collisions | **Closed** | C and supply pin names clear conductors/outlines in both themes. |
| ISSUE007, microscopic mobile figure labels | **Closed** | Readable board/breadboard/editor windows at 320/390 remain legible across local pans. Quantitative measurements also meet the 12 CSS-pixel math base-font floor. Fit reduction is explicitly an overview, not the default. |

No new diagram collision, unsupported-glyph box or unexpected missing drawing was observed. Composed Fit shows all four panels; its Readable coverage reaches their content and spacing. Blank inter-panel windows are legitimate background, not missing figures. The author-origin defect above remains open independently of visual closure.

Detailed exact viewed-file manifests and findings:

- [Main rebuilt review](../artifacts/education-web-qa/rebuilt-visual-review.md)
- [Correction/mobile supplement review](../artifacts/education-web-qa/rebuilt-visual-supplement-review.md)

Example correction evidence: [first Readable window](../artifacts/education-web-qa/2026-09-16T11-29-58-820Z/correction-editor-320-dark-readable-x0-y0.png), [next Readable window](../artifacts/education-web-qa/2026-09-16T11-29-58-820Z/correction-editor-320-dark-readable-x264-y0.png), [coverage map](../artifacts/education-web-qa/2026-09-16T11-29-58-820Z/correction-editor-320-dark-pan-coverage.json), [actual exported correction PNG](../artifacts/education-web-qa/2026-09-16T11-11-04-113Z/selected-net-dark.png).

The final complete run's raw viewport captures were checked against their corresponding sources in the two reviewed runs: **331/331 byte-identical** (279 main-run sources plus 52 supplemental sources). [Exact equivalence receipt](../artifacts/education-web-qa/2026-09-16T12-20-04-995Z/reviewed-raw-equivalence.json). This does not claim every raw source was separately opened: the reviewer viewed the enumerated overviews and pan-window images derived from them. Final pan-tile sampling excludes only partially covered fractional CSS fringes; uncropped originals retain those fringes.

## Functional and readability evidence

- Primary installation/skill actions and original schematic landing default retained. Displayed commands are copied into isolated clipboard instrumentation, never installed.
- Live family/case/stage/theme navigation and real new editor/gallery links work.
- 12 native families, 17 cases, all three stages and all three figure themes: 153 GET projections and 153 actual editor combinations. GET responses and live source must equal the current selected server projection, not a stale fixture snapshot.
- All question cases retain public-only API, SSR/hydration and live DOM boundaries. Author envelopes, stage maps, raw panel/exposure/net declarations and correction-only display identities are absent. Named-nets question has no group membership/IDs. Public demo stages remain intentionally selectable; this is not assessment authorization.
- Nine gallery stage/theme combinations load all 17 native cases and all 18 generic adapter families. Record is intentionally a host table, not a fake SVG. All 34 actual SVG images decode.
- 1280/390/320 light/dark page/card widths remain bounded while inner diagrams pan locally. The 320×640 test verifies the 60vh budget as well as the 480px cap.
- **720 measured Readable observations, minimum math base text exactly 12 CSSpx, zero below the floor.** Measurements use real outer SVG width/viewBox width and each public math shape's base size. Authored subscripts/superscripts retain their relative size; this is not a 12px minimum ink-box claim.
- Readable is initial, Fit is opt-in, and controls appear only when the drawing needs an overview. Small/empty/caption-only figures do not acquire fake scroll regions or large blank canvases.
- All four real arrow keys pan the focused local viewport by 64px without moving the document. Distant SVG targets cause local focus-reveal scrolling. Tab/Shift+Tab order, Enter/Space toggles, Escape clearing and exact net membership/selection pruning remain verified.
- Invalid public drafts remove old output and disable every export; valid recovery and preset reload work. Theme changes preserve edited public content. Empty display JSON remains valid with JSON enabled and image exports disabled.
- Canonical SVG/JSON equality and actual browser PNG bytes, dimensions and decoded pixels remain checked before and after Readable/Fit/panning/selection. The view wrapper does not change the public document or export bytes.
- Public PNG late callbacks after invalid input or stage change cannot download stale content. Recovery export works. Author-specific successful-response/callback cases remain blocked by AUTHOR-001.

### Actual PNG receipts

| Case/state | Bytes | Dimensions | Canonical raster pixel differences |
| --- | ---: | --- | ---: |
| Selected named-net correction, dark | 47,147 | 1244×674 | 0 |
| Signal, light | 31,746 | 1041×510 | 0 |
| Composed, Readable with selection | 110,189 | 1804×1244 | 0 |
| Composed, explicit Fit with selection | 110,189 | 1804×1244 | 0 |
| Composed, panned Readable with selection | 110,189 | 1804×1244 | 0 |

## Capture semantics and harness fixes

`*-fit-overview.png` is a whole drawing overview. When a small drawing needs no Fit control, the overview is its already-fitting natural Readable view. `*-readable-xN-yN.png` is one panned viewport window, **not a whole figure**. Each `*-pan-coverage.json` records dimensions, offsets and the Cartesian coverage grid with overlap; `*-capture.json` records actual sampling coordinates and proof. The raw `*-viewport.png` preserves the uncropped scene.

The installed CLI's wheel diagnostic reported a pointer move to (160,320) but delivered the wheel event at (0,0), over MAIN. Capture panning therefore uses the documented `scroll ... --selector` operation. It still asserts exact local offsets and no document movement. Real arrow-key and focus-reveal behavior is tested separately; genuine pointer/trackpad/touch behavior is not claimed from that CLI wheel command.

The old assumption that every pan tile must contain ink was invalid for composed-panel whitespace. A low-color tile is accepted only against an independently rasterized current canonical SVG region with zero compared-pixel differences. Card/overview nonblank checks remain. Fractional viewport coordinates require maximal fully-contained device-pixel crops; no tolerance is added and no compared diagram-pixel mismatch is ignored. Raw originals retain all fractional fringes. The exact integer sampling rectangle is asserted. The canonical export pixel comparisons remain full-image and exact.

A separate blank-tab Chrome reference experiment is labelled as reference evidence, never as an app screenshot. It did not alter the app DOM or React state. All old failed clip/reference receipts remain.

Long JSON and SVG comparison expressions use `eval --stdin`. Native textarea input/change events exercise the real input handler. A 23,088-character CLI wait argument was killed with SIGKILL during the first correction supplement; the receipt is retained and the exact comparison now uses stdin rather than weakening equality.

## Accessibility and remaining limits

Five completed axe audits have **0 violations**. All five retain an incomplete `color-contrast` rule: node counts **1, 1, 4, 1, 4**, or **11 node occurrences**. These are incomplete checks, not runtime errors and not a full accessibility approval. Author-workspace audit/recovery after successful compile is blocked.

The visible local comparison link is `http://127.0.0.1:3231/gallery`. Its presence and loopback/configuration gating were checked; its availability, original-renderer comparisons, private corpus acceptance and actual assessment authorization are owned by the separate consumer and were not tested here.

Visual conclusions cover the enumerated images, not arbitrary future author content or every possible pan position. Browser width emulation and keyboard checks do not certify real mobile hardware/touch behavior, electrical correctness, global overlap freedom, formal WCAG conformance or assessment privacy.

## Receipt index and command status ledger

Final full integration evidence: [verification](../artifacts/education-web-qa/2026-09-16T12-20-04-995Z/verification.json), [screenshot index](../artifacts/education-web-qa/2026-09-16T12-20-04-995Z/index.html), [commands](../artifacts/education-web-qa/2026-09-16T12-20-04-995Z/commands.jsonl). It contains **699 PNG files: 98 overviews, 218 Readable tiles, four host-only captures, 331 raw viewports, plus context/state/export images**. There are 98 complete pan-coverage sets. `latest.json` points to this full run.

Final focused capture evidence: [index](../artifacts/education-web-qa/2026-09-16T12-12-01-431Z/index.html), [counts](../artifacts/education-web-qa/2026-09-16T12-12-01-431Z/artifact-counts.json), [commands](../artifacts/education-web-qa/2026-09-16T12-12-01-431Z/commands.jsonl). It contains **104 PNG files: nine overviews, 43 Readable tiles and 52 raw viewports**.

| Executed command/receipt | Status | Result |
| --- | --- | --- |
| Core/dogfood workflow loading, repository inspection and archive copies | Exit 0 | Instructions read; old report/script preserved before edits. |
| Initial rebuilt TypeScript check | Failed | Two new public-source typing errors; fixed with narrowing/checked lookup. |
| `rebuilt-run-1.log`, full harness | Exit 1 | Found wheel-at-origin tool behavior and blocked author initialization; independent phases continued. |
| `rebuilt-diagnostic.log` / `.jsonl` | Exit 0 | Actual same-origin POST403; wheel event coordinates (0,0); isolated browser closed. |
| Typed-guard migration check | Failed | Remaining local comparison unknown values required string/nullable guards; fixed without suppression. |
| `rebuilt-run-2.log`, full harness | Exit 1 | Same-origin author failure plus outdated nonblank pan-tile assumptions. |
| `rebuilt-run-3.log`, full harness | Exit 1 | 4,453 pass, 2 failed checks, 1 blocked author phase; browser closed. |
| Initial visual supplement | Exit 1 | SIGKILL on long wait argument; raw command/signal saved. |
| Visual supplement attempts 2–5 | Exit 1 | Retained fractional-edge crop/reference mismatches, not app visual defects. |
| `rebuilt-visual-followup-6.log`, focused supplement | Exit 0 | 260 pass, 0 failed, 0 blocked; browser closed. |
| Read-only Codex main image review | Exit 0 | 271 unique PNGs viewed, including 19 baselines. |
| Read-only Codex correction/mobile supplement | Exit 0 | 53 additional PNGs viewed; ISSUE001 closed. |
| Final TypeScript | Exit 0 | No diagnostics. |
| Final Biome | Exit 0 | Zero warnings, no suppression. |
| Final same-origin curl | Curl exit 0, HTTP 403 | Author blocker reproduced again, not a functional pass. |
| Final current-script full execution | Exit 1 | `rebuilt-run-final.log`: 4,713 pass, 2 failed checks for AUTHOR-001, 1 blocked author phase, browser closed. No remaining artifact assertion failure. |

Historical evidence was not erased: [prior report](../artifacts/education-web-qa/report-before-readable-author.md), [prior harness](../artifacts/education-web-qa/harness-before-readable-author.ts), all `full-run-*`, earlier timestamped folders and image reviews remain under `artifacts/education-web-qa/`. The command JSONL files, not a condensed table, are the authoritative detailed invocation/status records.
