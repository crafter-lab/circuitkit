# Education web showcase

## Routes and ownership

- `/`: retains the primary Install package / Install skill actions, honest source/tarball instructions and original pure schematic default. Adds a live v2 family selector after installation, with links to the public editor, full gallery and separate local comparison. The additional v2 preview mounts after hydration; its controls and selected public props are SSR-safe. The primary legacy schematic remains server rendered.
- `/education`: public engine introduction and minimal live v2 preview.
- `/editor/education?case=measurement&stage=question&theme=geist-light`: public JSON editor, 12-family selector, case selector, three stages, three themes, explicit target interaction, optional host caption and SVG/PNG/JSON downloads.
- `/editor/education/author` with the same selectors: deliberately labelled author workspace. This route, and only this route, sends the generic author's complete three-stage model to the browser. It explicitly disclaims assessment privacy and CSS protection.
- `/gallery/education`: all 12 engine panel kinds through 17 public fixture-derived cases, plus generic demonstrations of all 18 adapter families. Stage/theme form applies to the whole gallery. The selected case is labelled and linked directly to its public editor. Each native figure has its own controlled, allowlisted selection.
- `/gallery/education/local`: explanatory public fallback and an opt-in link to a separately operated local comparison worker. It never imports or reads a corpus file.
- `/api/education`: selected projection GET and intentional bounded author compilation POST.

Existing `/editor`, `/?case=...`, `/gallery` and `/gallery/view?case=...` retain their previous case namespaces and behavior. Prominent new links are additive. The nine original recipe families are compatibility surfaces, not universal circuit simulation. No shared layout, header, theme provider, global CSS, playground, core, package or existing test files are changed by this UI work.

## Selectors

`app/education/catalog.ts` contains only public descriptive metadata, not author models. Defaults are `case=measurement`, `stage=question`, `theme=geist-light`.

- Families: electrical, measurement, signal, timeline, levels, quantity, bars, scale, readings, breadboard, pinout, board.
- Cases: electrical, named-nets, measurement, signal, samples, timeline, levels, quantity, bars, scale, readings, breadboard, pinout, board, open, bypass, composed.
- Stages: teaching, question, correction.
- Themes: geist-light, geist-dark, geist-print.

Unknown or array-valued selectors yield route not-found responses. API selectors additionally reject duplicate or unknown keys. Changing case or stage reloads that public preset and replaces draft edits; the UI labels this behavior. Changing the theme of valid public JSON keeps its edited public geometry. Reload preset recovers invalid public drafts; author mode explicitly reloads its author template.

The examples demonstrate six electrical symbols, arbitrary positioned graph composition, explicit intentional opens/bypasses, ideal non-loading measurements and polarity, transition/sample traces, temporal identities, edges, windows and debounce, explicit counter wrap, non-guaranteed logic regions, known/unknown/symbolic quantities, signed power and bars, SI scaling, typed readings, explicit contact partitions, pin roles and unknown board identities. Some examples intentionally use identical given geometry in multiple stages. Stage controls do not invent separate solutions. Timeline, level and scale question models explicitly omit their result flags; stage copies are independent even where an upstream fixture shares references.

## Explicit whole-net demonstration

Open `/editor/education?case=named-nets&stage=teaching&theme=geist-light`, then enable **Select targets**. The electrical family's case selector lists **Explicit whole-net targets**, and the landing workbench and gallery link directly to it. `/gallery/education?case=named-nets&stage=teaching&theme=geist-light` displays the same projected public groups with interactive figures.

This seventeenth case derives from the real `measurement` fixture's divider graph, not the symbol-only `electrical` fixture. That divider actually declares `vp`, `vn`, `ra`, `rb`, `rc`, `rd`, and routes `top`, `middle`, `bottom`. The symbol fixture instead has `a0`/`b0`-style free terminals and is left unchanged. No nonexistent terminal is invented.

On the trusted server, teaching and correction each declare `panel.namedNets` with `supply → vp`, `midpoint → rb`, `return → vn`, then explicitly expose `netTargetId(panel.id, name)` with role `net`. Core projection resolves the conductor members. The public target schema carries `id`, `label`, `role: "net"`, `kind: "group"` and `members`. For example:

```json
{
  "id": "circuit/net/supply",
  "label": "Supply conductor",
  "role": "net",
  "kind": "group",
  "members": ["circuit/route/top", "circuit/terminal/ra", "circuit/terminal/vp"]
}
```

The midpoint group contains `circuit/route/middle`, `circuit/terminal/rb`, `circuit/terminal/rc`; the return group contains `circuit/route/bottom`, `circuit/terminal/rd`, `circuit/terminal/vn`. The browser does not resolve connectivity or import the host net resolver. It passes the selected public document and controlled selected IDs to the existing `EducationalFigure`; that adapter owns whole-member overlays and keyboard interaction. The expandable **Public net targets (3)** inspector shows only typed metadata already present in that selected public document. Individual targets remain independently selectable. Selection and hover state do not alter canonical exports.

Question deliberately has no `namedNets` declarations and no net exposures. Its public JSON, target controls and exports contain no group members or `/net/` IDs, even if the unselected teaching/correction declarations become malformed. Changing teaching to correction preserves stable allowed net identities; returning to question removes those IDs, and they are not silently restored on a later correction switch.

Privacy warning: exposing a whole-net group's members explicitly publishes connectivity information and may reveal an exercise answer. CSS or an unselected highlight does not protect it. The demo intentionally approves this data for teaching/correction only; it does not offer assessment-stage authorization. All demo stages are publicly selectable, and a production host must separately authorize requests. Generic discovery text is not a hidden question-side net manifest.

## Server/client boundary

`app/education/examples.ts` is the shared server-only catalog helper for SSR and GET. It imports the authored engine fixtures and the Gradual adapter only on the host. A `next/headers` side-effect import marks the Next server-component boundary using the already-installed Next package: Next rejects importing this module into a client component. This avoids adding a new `server-only` package dependency or changing package files. Bun SSR tests can import the helper directly without mocking the server-only package. Production Next boundary verification is reserved for the parent's fresh build.

Ordinary client entrypoints import `EducationalFigure` from `src/v2/react.tsx`, `renderEducationalSVG` / `validateEducational` from `src/v2/render.ts`, public-only metadata and erased types. They do not import the host index/compiler, fixtures, adapter runtime, author example helper, corpus or native PNG dependencies.

Only the chosen `PublicFigure` crosses ordinary SSR/client/API boundaries. There is no three-stage public map, author envelope, source reference, private terminal/potential graph or unselected correction in those props. Explicitly approved public net groups are an intentional exception to absent membership metadata: their `members` are public display-part IDs, never hidden author net declarations. No such groups are exposed by the named-nets question. Public diagrams may of course contain deliberately visible labels and geometry. This public demo permits all its generic stages; a production assessment host still must authorize stage requests before projection. A stage selector, namespace or CSS is not authorization.

Adapter gallery entries contain only their chosen public projection and typed public host content. Adjunct geometry is already incorporated into the projection; redundant host additions are removed before props. `HostContent` renders baseline/subscript/superscript runs, labelled notes and semantic record tables as escaped React text. Missing record values are not displayed. No `dangerouslySetInnerHTML`, HTML parser, SVG-string injection or `renderGradualHost` HTML fallback is used. Record is host composition, not a fake native panel. No-figure cases require host prose, not a placeholder drawing.

## API

GET `/api/education?case=measurement&stage=question&theme=geist-light`

Success is exactly `{ "document": PublicFigure }`, not an author or complete stage map. There is no author-source GET parameter. Defaults match SSR.

POST `/api/education`, Content-Type `application/json`:

```json
{
  "author": {
    "schema": "circuitkit.educational.author.v2",
    "id": "example",
    "stages": {
      "teaching": null,
      "question": {
        "title": "Public lesson",
        "description": "A caption-only stage",
        "theme": "geist-light",
        "panels": [],
        "expose": []
      },
      "correction": null
    }
  },
  "stage": "question",
  "theme": "geist-light"
}
```

The example above is a valid empty question projection even though its nonselected stages are null. It returns exactly `{ "document": PublicFigure }` with `display: []` and `targets: []` for its chosen stage/theme. POST is used only by the explicit author workspace, with a 300 ms debounce. It accepts intentional caller-provided author uploads; there is no author database, solution lookup, file write, upload logging or automatic storage. Consumers must not upload private sources to the public demonstration endpoint. Production hosts should add authentication, quotas and deployment-level rate limits before exposing a private authoring service.

Request body limit is 256 KiB including the envelope. The server checks Content-Length when present and also counts streamed bytes, so an omitted or incorrect header cannot bypass the limit. UTF-8 decoding is strict. Core bounded-JSON limits and the strict author outer envelope still apply. The handler invokes `projectFigure` without full-author validation: only the selected stage must satisfy its model schema. Bounded malformed nonselected payloads, including `correction: null`, do not change a valid question response. The requested validated theme is applied to the projected public document without reading or rewriting another stage. Full-author/cross-stage validation is a separate optional host authoring action, not a prerequisite for this endpoint. Cross-origin browser POSTs are rejected by Origin; requests without Origin can be made by local tools. No CORS permission is added. Extra envelope keys are rejected.

All responses are `Cache-Control: no-store` and `X-Content-Type-Options: nosniff`. Failures return only `{ "error": "Invalid or unsupported educational figure." }`, never raw fields, author diagnostics, stack traces or partial figures. Statuses: 400 invalid selectors/envelope, 403 cross-origin POST, 413 oversized body, 415 unsupported media type, 422 invalid compilation. No response contains all three stages.

## Author browser origin follow-up (AUTHOR-001)

The latest report in `docs/education-web-qa.md` records **4,713 passes, two failed checks and one blocked author phase**, exit 1. The seven original visual findings are closed in that reviewed coverage, but valid browser author initialization fails with HTTP 403. That existing report and its artifacts are unchanged by this patch. Unit success below does not close the live author blocker; the parent must rebuild/restart and rerun the actual flow.

The route now derives the expected origin from the request URL's HTTP(S) **protocol plus the validated actual Host header**. Only an absent Host falls back to the request URL's host. An empty, malformed or multiple Host value is rejected, not ignored. For the reported Next rewrite:

```text
request.url: http://localhost:3228/api/education
Host: 127.0.0.1:3228
Origin: http://127.0.0.1:3228
expected origin: http://127.0.0.1:3228
```

Both origins are compared after URL canonicalization. DNS/scheme case, default HTTP/HTTPS ports and equivalent IPv6 spellings normalize; distinct schemes, ports, addresses, localhost versus 127.0.0.1 and hostname suffixes do not become aliases. Host authority validation permits bounded DNS labels or a valid bracketed IPv6 address with an optional valid numeric port. Origin must be one HTTP(S) serialized origin, without a path (even `/`), query, fragment, credentials, wildcard, embedded whitespace or a list. Literal `Origin: null` and an empty Origin are rejected. Multiple appended Host/Origin values are rejected.

`X-Forwarded-Host`, `X-Forwarded-Proto` and `Forwarded` never participate in this decision, including fallback. A proxy must provide the correct request URL protocol through its trusted application/server configuration; arbitrary forwarding headers do not grant an origin. Browsers cannot choose an arbitrary Host header through page JavaScript. Direct tools can choose request headers and still may omit Origin, as before: this generic compilation service is **not authentication or assessment authorization**. Malformed Host values are rejected even for no-Origin requests. Production authentication/quotas remain host responsibilities.

The 256 KiB declared/streamed body limit, strict UTF-8 decoding, selected-stage projection and fixed no-store/nosniff error payloads are unchanged. The origin gate runs before body reading. No debug endpoint, uploaded-body logging, environment override, permissive suffix check or CORS wildcard was added.

### Fresh-restart author-flow verification

This patch has not been exercised against a rebuilt browser app yet. No build, server restart, live POST or browser session was started. Once the parent confirms the fresh production server includes the route change, rerun the existing complete QA command, not the visual-only subset:

```sh
bun --no-env-file --no-install scripts/check-education-web.ts http://127.0.0.1:3228
```

Use the agent-browser workflow for real browser interaction. Open `/editor/education/author?case=measurement&stage=question&theme=geist-light` on that same origin and retain its actual Origin header. Verify the untouched initial draft compiles with 200 and exactly one selected public document. Then verify genuine input edits, invalid selected source, valid recovery, stage/theme changes, malformed nonselected correction independence, exports, late successful-author responses and delayed export callbacks. Repeat same-origin operation through localhost when serving that hostname; it is a separate browser origin, not an alias permission for 127.0.0.1. Keep cross-origin and malformed-origin requests rejected, with original stream and output checks intact. Do not strip Origin, navigate to a substituted origin, patch app state, spoof forwarding headers, overwrite responses or count blocked cases as passes. Preserve the two failures and blocked-phase evidence until a fresh full run actually supersedes it.

## Draft, target and export behavior

Public JSON edits validate and render locally through the public renderer. Author edits compile only through the bounded POST. Every draft edit or selected-stage request immediately pauses prior output and invalidates in-flight requests and PNG export. Invalid drafts show no previous figure and disable downloads. Request abort signals and revision checks prevent late responses from restoring stale output. Fixing source or reloading a preset recovers.

Selection lives outside the document. A successful document update retains IDs only when the document identity is unchanged and the new target manifest allows them. Correction-only targets disappear when returning to question; changing cases clears selection. Unknown IDs and duplicates are never promoted into public geometry. Gallery figures also prune selection across document updates. Invalid-preview pauses keep no active displayed target or export; valid recovery intersects the last valid selection with the newly allowed targets.

The default preview has no caption or interactive toolbar inside the figure. The host's Select targets toggle opts into controlled interaction; Host caption opts into ordinary React caption text. Tab, Shift+Tab, Enter, Space and Escape are provided by `EducationalFigure`. Native selects and buttons have explicit labels; status and selection updates are announced. Scoped monochrome CSS uses 32 px controls, 44 px with coarse pointers, visible keyboard focus, flexible wrapping and single-column grids below 760 px. No shared root styling was modified.

A valid empty public document is a successful no-op, not an invalid draft. Core returns `svg: ""` with zero bounds, and `EducationalFigure` emits nothing unless a host caption is requested, then only the caption wrapper. The editor disables SVG and PNG for this case while keeping JSON export enabled. The PNG helper returns before allocating an image, Blob URL or canvas for an empty SVG, rather than attempting zero-size rasterization or reporting an error. Returning to nonempty valid geometry restores image export availability.

Downloads use `CircuitFigure.svg`, `CircuitFigure.png`, `CircuitFigure.json`. Only the validated selected public document is exported, with no caption, selection overlay or author model. Canonical SVG comes from the public renderer with namespace `CircuitFigure`, never serialization of interactive DOM. JSON is the selected public schema. PNG lazily loads a browser-only canvas rasterizer of that same standalone SVG, at 2× with the existing 16-megapixel bound. Edits abort stale raster downloads. SVG and JSON remain alternatives when browser PNG encoding is unavailable. Data-image SVG rendering requires CSP `img-src data:`; canvas PNG also needs blob image support. No native Resvg package is imported client-side.

## Readable figure viewports and mobile case names

The parent browser report `docs/education-web-qa.md` found that functional/overflow checks alone did not catch tiny labels. This host change addresses ISSUE-002 (closed Case-select truncation) and ISSUE-007 (whole-SVG shrinking to microscopic mobile labels). Annotation/conductor collisions in ISSUE-001 and ISSUE-003 through ISSUE-006 remain separately owned core/adapter geometry work. This wrapper does not move labels, hide collisions, rewrite geometry or declare those findings resolved.

`app/education/FigureViewport.tsx` is shared by the editor, the landing live v2 preview, and every native/adapter gallery figure through `GalleryFigure`. The original legacy landing schematic is unchanged. `viewport-layout.ts` inspects only the selected validated public document. It uses actual core bounds and the smallest nonblank public math shape's base `size`, then computes `minReadableScale = max(1, 12 / minimumBaseSize)`. With no math, native scale is used. The inner canvas width is the actual content width times that scale, rounded up; height follows the SVG aspect ratio. There is no fixed large canvas or minimum height. Authored subscripts/superscripts retain their normal relative size; 12px is the math base-font floor, not a claim that every glyph's ink box is 12px high.

Readable is the default, including the initial server-rendered canvas, regardless of container width. `EducationalFigure` and its canonical SVG/viewBox are unchanged: their existing max-width behavior applies inside the explicitly wide inner canvas, not against the narrow page/card. Excess content remains available in a local `overflow: auto` section, bounded to the card width and at most 60vh/480px high. No `overflow: hidden`, `clip` or data filtering is used; all offscreen content stays reachable by local scrolling. Captions wrap to the measured local viewport width. Native scrolling, touch panning and visible horizontal/vertical pan cues expose offscreen content.

A ResizeObserver measures available width and responds to parent layout changes; window resize updates the height budget. Compact Readable / Fit buttons appear only when the drawing exceeds the available width or height. Fit is an explicit overview which may make text small, and is labelled accordingly. It never becomes the initial microtext default. Small figures keep their actual content dimensions without unnecessary controls or a large blank panel. Empty/caption-only public figures add no scroll region, viewport controls or fake error.

The overflow region is keyboard-focusable and labelled. Arrow keys pan that region by 64 CSS pixels, including when an allowed SVG target is focused. Local focus-reveal scrolling brings offscreen target bounds into the viewport without calling document/window scrolling. Enter, Space, Escape and Tab remain owned by the existing target interaction/browser behavior. Scroll position and viewing scale are host state only: they never alter selected target IDs, the public document, core renderer bytes, JSON, SVG or PNG exports. Case changes and remounts start readable; an explicit Fit choice is not stored in the public JSON.

Below 760px the Case select gets a full-width row and native selects use 16px text. A separately visible, wrapping complete selected case name and help remain associated through `aria-describedby`, so a platform's closed native-select clipping cannot be the only place the name appears. This applies to both editor and landing workbenches.

### Fresh-build browser follow-up

No server, build or browser was started for this host patch. Do not use the earlier server or treat unit/CSS assertions as a replacement for the parent's visual QA. After the parent supplies a fresh build with the core/adapter collision fixes:

1. Retain the existing QA script's functional, stage/privacy, export, overflow and accessibility assertions. Keep all ISSUE-001 through ISSUE-007 evidence; do not erase them based on this implementation.
2. At 1280, 390 and 320px, inspect landing live, editor and every native/adapter gallery surface in light/dark. In default Readable mode, measure the actual rendered outer SVG width divided by its viewBox width, times each public math shape base size; it must be at least 12px (allowing only subpixel rounding tolerance). Document and card widths must remain bounded. The inner drawing may exceed its local scroll region, not the page.
3. Confirm Fit/Readable controls appear only when needed, Fit is opt-in, and returning to Readable restores the base-font floor. Capture the readable local view, an explicit overview, and panned views that cover all offscreen diagram regions. A viewport screenshot alone must not be reported as complete inspection of a wide SVG.
4. Focus the local scroll region and use all four arrow keys. Verify its scroll offsets change without horizontal document scrolling. Tab/Shift+Tab through distant individual and net targets, confirm local focus reveal, and exercise Enter/Space/Escape without changing target permissions. Also pan by pointer/trackpad/touch.
5. Check complete Case names at 320px in both editor and landing, including named nets and long titles. Check small, empty and caption-only figures for unnecessary controls/blank padding or fake alerts.
6. Keep canonical SVG/JSON comparisons and the real PNG pixel/export checks before and after mode changes, panning and selection. Use normal UI actions to reach offscreen targets; do not patch React state, substitute geometry, crop away collisions or relax expected output bytes.

## Private corpus and comparison

The app contains no manifest import, private source, solution bank, original-renderer asset or generated corpus image. The public generic 18-family adapter examples are not substitutes for the private 344 exact figures, 652 occurrences, 319 pairs, ten no-figure foundations, functional acceptance or original visual comparison. No coverage badge is inferred from the generic gallery.

The local link is enabled only when BOTH server variables are set:

```sh
CIRCUITKIT_LOCAL_CORPUS=1
CIRCUITKIT_LOCAL_COMPARISON_URL=http://127.0.0.1:4317/results
```

The URL is illustrative, not a claim that any process listens there. Only HTTP localhost, 127.0.0.1 or IPv6 loopback URLs without credentials are accepted. The app neither fetches the URL nor starts the isolated consumer. These are never `NEXT_PUBLIC` variables. Disabled/unconfigured setups explain that the corpus is not bundled. The parent coordinates the separate original-renderer comparison worker and its actual output URL. This implementation does not build, pack, publish or inspect a generated tarball.

## Core limits for the parent

The updated core and adapter contracts resolve the former empty-stage rejection, scale-marker workaround, missing operator outlines and fixed readings column gap. Empty stages now project successfully. Source-unit scales use native `input.from` / `input.magnitude` without exposing converted question text. Bounded v2 outlines support `≥`, `≤`, `≠`, `←`, `↑`, `↓`, `↔` and `Δ`. Measured glyph advances/ink bounds determine reading-column and row spacing. Selected projection no longer validates malformed nonselected stages; full author validation remains a separate action.

Native Record remains optional/unimplemented: records are valid typed host tables, not fabricated images or coverage blockers. Unsupported characters outside the supported font/operator sets still fail closed. Arbitrary panel-to-panel placement remains the author's responsibility; global overlap freedom, original screenshot equivalence and browser visual acceptance are not claimed. No general circuit solver, transient simulation or fabricated missing answer is provided.

## Focused verification

Commands run without starting a build, dev server or production server:

```sh
bun --no-env-file --no-install test tests/education-web.test.tsx tests/landing.test.tsx tests/gallery-routes.test.ts tests/site-shell.test.tsx tests/editor-layout.test.tsx tests/authoring-ui.test.tsx
bun run typecheck --incremental false
bun --no-env-file --no-install node_modules/@biomejs/biome/bin/biome check app/api/education/route.ts tests/education-web.test.tsx
```

Latest origin-boundary verification on 2026-09-16 with Bun 1.3.11: the six-file test command exited 0 with **198 pass, 0 fail, 19,786 assertions**. The focused `bun --no-env-file --no-install test tests/education-web.test.tsx` run exited 0 with **43 pass, 0 fail, 8,394 assertions**. Repository-wide `bun run typecheck --incremental false` exited 0 with no diagnostics after correcting a new test-fixture array type. Biome exited 0: **2 files checked, no fixes applied**. Changes are limited to the education API route, its owned web tests and this document. No core/package, app UI, legacy test, QA script or QA evidence was changed in this follow-up.

Origin regressions reproduce Next's internal localhost URL with actual 127.0.0.1 Host, mismatched internal ports, localhost/IPv4 distinctions, canonical default ports/casing/IPv6, absent-Host fallback, malformed/null/credential/path/list origins, invalid/multiple Hosts, forwarded-header spoofing, retained no-Origin tool uploads and unchanged stream/media/UTF-8 limits and safe public responses.

New viewport tests check the computed base-font floor and explicit Fit sizing across native/adapter projections at mobile/desktop width budgets, content-derived canvas dimensions, small/empty/caption-only behavior, bounded local CSS overflow, complete Case-name associations, arrow/focus pan calculations and unchanged public document/selection/export bytes. Every gallery SVG is asserted to have a viewport wrapper. These unit/SSR calculations do not claim that the fresh app has passed real 320px visual or keyboard review; the follow-up workflow above remains required.

Whole-net regressions cover actual divider anchors, exact generated member IDs, all three themes, public group schema metadata, question GET/POST noninterference under malformed unselected declarations, React member overlays with pressed selection, unchanged exports, and net selection removal/recovery across stages. Existing regressions still cover malformed nonselected payloads, empty selected projection and JSON round-trip, disabled empty SVG/PNG exports, caption-only SSR without a fake alert, and the PNG no-op without browser allocation.

The new test file covers the complete public engine/adapter stage/theme matrix, chosen-stage API payloads, author upload noninterference, streamed size bounds, fixed errors, invalid draft parsing/recovery, canonical public exports, target allowlists and identity, SSR route content, host escaping and missing records, client import boundaries, CSS control sizing and the local comparison gate.

The latest parent QA report verifies the public Readable UI, actual exports and closure of the seven visual findings within its recorded coverage. This origin-boundary patch has not been tested in a freshly restarted main app. AUTHOR-001's two failed checks and blocked author workflow remain pending that full live rerun. No server on port 3228 or elsewhere was started, restarted or contacted for this patch. Use the agent-browser workflow after the parent confirms the new server is ready; unit/SSR success is not live author-flow acceptance.
