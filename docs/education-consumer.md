# Final installed education consumer qualification

## Result

The final local tarball passed real clean installation, isolated Next 16.3.3 typecheck/build, installed public API imports, actual React 19.2.8 SSR/hydration/keyboard selection, installed Node CLI checks, native PNG generation, learner security checks and browser layout measurement. **Full pointer interaction qualification is not green:** an exposed red-probe hit region covers terminal B, preventing the intended pointer selection. The complete browser workflow finished, but its gate exits 1 for this unresolved finding. Packaged documentation also has the warnings below; no unconditional full-UI pass, error-free documentation, or publication is claimed.

Tarball:

`artifacts/education-consumer/runs/final-tarball-20260916/circuitkit-0.1.0.tgz`

SHA-256:

`7be82de95040a1202fd4b8fab7423e6b7d0a533042ffc1460171e701ea568669`

Live review routes:

- http://127.0.0.1:3231/gallery
- http://127.0.0.1:3231/learner
- http://127.0.0.1:3231/proof
- http://127.0.0.1:3231/regressions

The production server is retained under owned shell handle `shell-21`, without detaching. Superseded diagnostic ports 3232, 3234 and 3235 are inactive. The new consumer is outside both checkouts:

`/var/folders/t_/srzvjq016kn2zdmpxsr841b00000gn/T/education-package-QJVrDt`

The current evidence directory is `artifacts/education-consumer/runs/final-tarball-20260916/`, abbreviated as `RUN/` below. `artifacts/education-consumer/current.json` records the exact current paths.

## Real package installation, not the earlier byte-copy shortcut

The setup ran:

```sh
bun --no-env-file scripts/qualify-education.ts final-tarball-20260916 --package
```

It created a new tarball with `bun --no-env-file pm pack --filename <absolute-tarball-path>`, then created a fresh temporary consumer with no node_modules and ran `bun --no-env-file install`. Installation exited 0, installed 482 packages, and explicitly reported circuitkit from the new `.tgz`. No ignored-peer flag, force flag, global install, source install, source link, or circuitkit manifest bypass was used.

- Installed React and ReactDOM: exactly `19.2.8`.
- Installed Next: exactly `16.3.3`.
- Installed circuitkit: `0.1.0`.
- Installed peer: exactly `19.2.8 || 19.3.0`.
- Bun: `1.3.11`; Node CLI runtime: `v24.18.0`.
- All 99 installed package files match their recorded tarball/source hashes.
- `node_modules/circuitkit` is a real consumer-local package directory, not a source symlink.
- There is no consumer `compiled/` shortcut directory.
- Consumer application/runtime/test imports use public circuitkit subpaths. Original Gradual rendering is the explicit read-only snapshot exception, not an internal circuitkit import.

Public resolution was exercised for the root, React, PNG, Markdown, share, v2, v2/server, v2/public, v2/react, v2/png and gradual entrypoints. All direct React resolutions point to the same consumer-local installation. The four TypeScript example files execute from the actual installed package and retain their packaged `circuitkit/v2` imports.

### Next's bundled React is a separate fact

Next 16.3.3 App Router reports its normal bundled React version, `19.3.0-canary-cbb046ab-20260731`, in the browser. This was not overridden. Actual standalone React/DOM 19.2.8 was independently exercised using the installed public circuitkit imports, including warning-free development hydration and keyboard selection. Do not mislabel the Next canary as standalone React 19.2.8, or claim a second fresh stable React 19.3.0 package consumer was tested in this run.

## Verification inventory

| Check | Outcome |
| --- | --- |
| Fresh Bun pack and clean tarball install | Exit 0; 99 package files; no private corpus paths/IDs detected |
| Isolated consumer typecheck and Next production build | Exit 0 after the retained harness import-suffix correction |
| All 344 figures × 3 stages × 3 themes | 3,096 installed-package projection/render checks; zero failures |
| All 319 actual pairs × 3 stages × 3 themes | 2,871 installed-package checks; zero failures |
| Original/v2 Next SSR, 344 figures × 3 themes | 1,032 HTTP/SSR checks; zero failures |
| Actual React/DOM 19.2.8 standalone package proof | 23 browser commands; passed |
| Next browser workflow | 97 commands; workflow completed, exit 1 for terminal/probe pointer conflict. SSR namespace, keyboard, controls, two-axis pan, focus reveal, Fit and learner reveal completed |
| Learner boundary | 33 checks passed, including the previous 32-check coverage plus the additional client chunk |
| All generated public JavaScript assets | 30 chunks; no private corpus IDs, pair markers or test capability |
| Installed Node binaries | 21 actual CLI commands; expected 0/1/2 exits and envelopes passed |
| Native package PNG APIs | Two actual PNGs, one v2 and one legacy, with valid signatures/dimensions |
| Node CLI PNG exports | Two actual PNGs; file IHDR dimensions match CLI receipts |
| Four packaged TypeScript files | Executed under Bun; three supplied authors plus a composed helper case produce 36 stage/theme renders |
| Legacy v1 immutable fixture | All 27 existing SVG hashes matched; baseline file unchanged |
| Public annotation regression construction | 65 cases, 78 assertions; passed |
| Browser annotation regressions | 195 case/theme captures; zero measured collisions/clipping |
| Final corpus browser comparisons | 219 cases, 18 families, 37 distinct actual figures, 438 readable/Fit captures, 18 print PDFs |
| Owned source-boundary tests | 7 tests, 31 assertions, zero failures |
| Strict qualification-script TypeScript and Biome | Exit 0 |

The Node commands invoke `node node_modules/.bin/circuitkit` and `node node_modules/.bin/circuitkit-education`, with realpaths pointing into the installed package. They exercise help, schema, catalog, project, validate, inspect, SVG, PNG, invalid inputs, usage errors and no-clobber behavior. Education public commands reject author inputs. Legacy diagnostics remain the legacy contract, including field paths; v1 is not claimed to be an assessment privacy boundary.

The annotation cases follow the inspected reader's current regressions: six symbols in six orientations, adjacent symbols, later opaque rectangles versus earlier enclosures, levels at endpoints/thresholds/undefined regions, exact manual baselines, rejected colliding/out-of-bounds overrides, exhausted bounded placement with an explicit override escape, named-net membership/bounds invariance, later probe geometry, and private nonselected-stage isolation. They are clearly labeled generic regression fixtures, not replacements for the real Gradual corpus.

## Readable default, local pan and Fit

The harness adopts the parent's FigureViewport/viewport-layout concept using installed public inspection APIs. It retains a minimum **12px base-label size**, bounded local scrolling, arrow-key panning, focus-driven target reveal, and an explicit Fit overview. Its SVG must fill the computed canvas width, as it does in the parent app.

The final 219-case matrix records:

- Minimum default readable base-label size: 12px; zero cases below the floor.
- 143 default views require panning to see all labels. **Default pan does not show all labels simultaneously.**
- Zero page-level horizontal overflow.
- Zero measured v2 text overlap, intrinsic SVG label clipping, or scoped electrical/levels annotation collisions.
- Four original overlap cases and 17 original SVG clipping cases remain visible and documented. No original source or stylesheet was modified to conceal them.
- Fit is a smaller overview when needed and may have text below 12px. It is not the readable default.

`viewport-interaction.json` records actual scroll offsets, two-axis arrow-key movement, focus reveal of an allowed terminal, the separate failed pointer hit, and readable/Fit metrics. `viewport-readable-detail.png`, `viewport-fit-overview.png` and `viewport-board-panned-detail.png` provide targeted captures. The full set is in `visual-package-final/`. Print PDFs are vector overviews, not a claim that every printed glyph has a 12px physical size.

Browser measurements use actual SVG glyph bounds, rendered viewport scale, label intersections and annotation-vs-stroke/circle/opaque-rectangle checks. They do not constitute a human pixel-equivalence approval or electrical simulation/certification.

## Unresolved pointer-target conflict

Reproduce at 320px on:

http://127.0.0.1:3231/gallery?family=divider&id=figure%3A9b44280001e18ea9255a99e04d479bb52a40c9ef0713c984a8add13a35868b22

Focus `gallery/terminal/B`. The terminal center is hit-tested as `gallery-meter/probe/positive`, whose transparent hit rectangle is above it. A locator click is refused because the probe covers it. A separate actual mouse down/up at the same point left selection empty rather than selecting B. Keyboard Enter/Space selection and focus-driven scrolling do work.

Evidence: `next-browser-pointer-click-failure.json`, final `next-browser.json`, `pointer-repro.json`, `pointer-before-final.png`, `pointer-after-final.png`, and `pointer-overlap-final.webm`. This is an interaction/hit-region finding, distinct from text/line layout collisions and not identified as React-version-specific. Both legitimate targets remain exposed; no targets were removed, no forced selector click was used, and no library hit-testing code was changed to conceal it.

The parent must resolve or explicitly accept the target-priority/hit-region behavior before claiming a complete pointer-interaction pass. The consumer cannot repair package code within its ownership scope.

## Private corpus and learner boundary

All 37 snapshot source files remain byte-identical and read-only in both the source snapshot and the consumer. Counts remain 344 exact figures, 652 occurrences, 319 pairs and 18 families. The private corpus, original source modules, test capability and generated evidence are not in the tarball. Package inventory and private-marker scans are recorded separately from client-asset scans.

The gallery explicitly states `AUTHOR GALLERY: SOLUTIONS INCLUDED. Not a question-security surface.` Its original CircuitDiagram, fonts, stylesheet imports, TooltipProvider and host context come from the protected snapshot. Captions, records, missing/flagged rows, verdicts and notes are real host composition, not placeholder SVGs. Targets come from scoped adapter references intersected with actual rendered parts.

The learner uses the actual `dc.investigation.exam.1` question and its `/solution` pair. Initial HTML/API responses contain only selected question public data and permitted prompt/choices/ID. The corpus and full pair stay server-only. Query parameters do not grant correction access. A capability-authorized POST issues a signed expiring HttpOnly/SameSite cookie; only that server-controlled state permits correction projection. The test capability remains a `0600` server file and is never placed in browser code or receipts.

Tests cover forged stage queries, missing/wrong capabilities, invalid/expired/Unicode cookies, authorized correction, independent unauthenticated requests, direct private-file URL rejection, initial learner chunks, and all generated public JavaScript. This is an isolated local test-auth harness, not production user identity or grading infrastructure.

## Packaged documentation warnings

The required three new guides, all four TypeScript examples and the updated skill are packaged. The skill's public imports and education CLI commands were checked against the actual installation. Parent-owned documentation remains untouched, with these recorded warnings:

1. `education-authoring.md` still describes source-relative fixture imports and pending allowlist additions, although public-import examples and the allowlist are already packaged.
2. `education-migration.md` retains superseded package-integration handoff wording.
3. `education-decisions.md:77` still calls `19.3.0` the current peer; the package ships the exact disjunction.
4. `education-migration.md` links `education-web.md`, which is not included in the tarball.

See `documentation-audit.json`. These do not invalidate the executed installation/API/browser checks, but prevent claiming the package documentation has no distribution defects.

## Evidence and failure history

Key files under `RUN/`:

- `receipt.json`: complete final machine-readable result and command outcomes.
- `integrity.json`, `final-verification.json`: tarball hash, installed file hashes/realpath, public-import audit, no shortcut directory, immutable legacy baseline and snapshot verification.
- `pack.log`, `tar-inventory.log`, `package-inventory.json`, `install.log`, `consumer.bun.lock`, `resolution.log`.
- `installed-package-check.json`, `package-check-final/`, `cli-png-validation.json`.
- `structural.json`, `next-ssr-corpus.json`, `annotation-regressions.json`.
- `browser-proof.json`, `hydration-final.json`, `next-browser.json`, `viewport-interaction.json`.
- `security.json`, `all-client-assets.json`, `documentation-audit.json`.
- `visual-package-final/`, `annotation-browser-final/`, and `consumer-sources/`.

Failures were retained rather than rewritten as never having happened:

- All earlier byte-copy receipts remain in their original locations; the preceding consumer report is preserved as `previous-consumer-report.md` in this run.
- `typecheck.log` preserves the copied `.ts` suffix failure. The consumer import was corrected; `typecheck-final.log` and the build logs pass.
- `package-check.log` and `package-check/legacy-invalid.stdout.json` preserve the overstrict harness assertion that incorrectly demanded v2 privacy diagnostics from v1. The corrected test scopes that rule to education CLI and records actual legacy diagnostics unchanged.
- `visual-package/` preserves the first final-package matrix, including 10px board/breadboard observations caused by the missing SVG width rule. `visual-package-final/` is the corrected complete run.
- `next-browser-readiness-failure.json` preserves a harness race that used old-page hydration as navigation readiness. The final runner waits for the requested family/stage/theme. `pointer-coordinate-failure.json` preserves a failed mouse command with floating-point coordinates; integer viewport pixels were used for the completed raw-input reproduction. These corrections did not resolve or suppress the pointer-target conflict.
- Initial and corrected annotation/browser proof receipts remain separate where applicable. No core, adapter, original source, package metadata, parent guide or legacy golden was changed to obtain these results.

## Reproduction

The setup requires a new unique run directory and never overwrites old run receipts:

```sh
bun --no-env-file scripts/qualify-education.ts NEW_RUN_ID --package
```

Run public-import library checks from the generated consumer, not from repository-local modules:

```sh
bun --no-env-file fixtures.ts
bun --no-env-file final-package-check.ts ABSOLUTE_ARTIFACT_DIRECTORY package-check-final
bun --no-env-file annotation-regressions.ts ABSOLUTE_ARTIFACT_DIRECTORY
bun --no-env-file run typecheck
bun --no-env-file run build
bun --no-env-file run start
```

The additional test scripts and regression route are retained in the run's `consumer-sources/`, with their generating resources under `artifacts/education-consumer/`. Server launch must use an owned shell handle, never detach. Temporarily run `proof-server.tsx 3235` for the standalone browser proof and stop that owned proof handle afterward.

Repository-side browser/security runners use `current.json`:

```sh
bun --no-env-file artifacts/education-consumer/browser-proof.ts
bun --no-env-file artifacts/education-consumer/final-next-browser.ts
bun --no-env-file artifacts/education-consumer/final-visual-matrix.ts NEW_VISUAL_DIRECTORY
bun --no-env-file artifacts/education-consumer/annotation-browser.ts NEW_ANNOTATION_DIRECTORY
bun --no-env-file artifacts/education-consumer/security-check.ts
bun --no-env-file artifacts/education-consumer/audit-client-assets.ts
bun --no-env-file artifacts/education-consumer/ssr-corpus.ts
bun --no-env-file artifacts/education-consumer/final-verify.ts
```

No commit, push, publish, deploy, global install, Gradual write, or parent main-app build was performed.
