# CircuitKit schematic preview

The root preview shows one default schematic per recipe, SVG/PNG downloads, three theme choices, and the existing interactive lesson selection and step controls. It calls `renderSchematicSVG(document)`, `CircuitLessonFigure`, and `CircuitLessonSequence` without a composition option or prop. There is no composition switch, paired view, or comparison link. Downloads expose only the new compact output.

## Generate after the core default is ready

Wait until the core and web edits are finished before exporting, so the source snapshot cannot drift. From the repository root:

```sh
bun scripts/preview-compact.ts --out artifacts/compact-composition-2026-09-19/preview-default-final
```

The output directory must not exist. Omit `--out` to choose a fresh timestamped directory automatically. All generated files stay under `artifacts/compact-composition-2026-09-19/`. No shared `dist`, Next.js build, package edit, install, publication, browser launch, or server startup is part of export. Existing historical exports, comparison pages, and baseline files are never rewritten or removed.

A clean checkout needs Bun and the repository dependencies (`bun install --frozen-lockfile` if not installed), but no pre-existing ignored artifacts. Generation creates the artifact root when absent. `--help` and `--serve` do not initialize inputs or create directories.

The command runs two separate gates before preparing inputs or invoking the CLI:

1. Historical compatibility: all 81 SVG hashes in `classic-baseline.json` must match. Legacy `renderSVG` and `renderFigureSVG` remain unchanged. Schematic checks explicitly use `renderSchematicSVG(input, { composition: "classic" })`. These are historical compatibility hashes, not hashes of the new default. The baseline is a byte-exact copy of the original pre-edit artifact and is never regenerated. Each input is its checked-in `examples/<recipe>.json` with the baseline theme. Results go to `baseline-verification.json`.
2. New default: no-option `renderSchematicSVG(document)` must match explicit compact SVG, bounds, and endpoints for all three recipes in all three themes, without mutating the input. These nine checks go to `default-verification.json`. A mismatch blocks export until the core default is ready.

For the nine CLI inputs, the script reads each canonical `examples/<recipe>.json`, replaces only `presentation.theme` with `{ preset: theme }`, and serializes with `JSON.stringify(document, null, 2) + "\n"`. This reproduces the original nine saved inputs byte-for-byte. Every existing `artifacts/compact-composition-2026-09-19/<recipe>-<theme>.json` is checked before creating missing inputs or running the CLI. Wrong identity, changed values, or different serialization fail as stale input rather than being silently reused or overwritten. Missing inputs are created exclusively; existing files and symlinks are never replaced. Reconcile a stale source/artifact explicitly, not with an overwrite flag.

The command retains 36 underlying CLI exports for evidence: three recipes, three themes, explicit classic/compact, SVG/PNG. Both compositions use the exact same prepared input path. PNG uses `--scale 2`. Copies in `inputs/` preserve the original bytes. Only the 18 compact exports are designated as current downloads. Classic exports remain internal compatibility evidence and have no preview links. New exports do not generate comparison HTML pages.

Each invocation has a receipt under `receipts/` containing argv, cwd, exit code, stdout, stderr, input SHA-256, Git HEAD and working-source SHA-256. Manifest version 2 separates `baseline` historical compatibility from `default` verification, labels each export's `purpose`, and lists only current `downloads`. It also records output hashes, bounds, endpoint counts, source file hashes, runtime version, dirty Git status, created/reused inputs, preserved hashes and bundle hashes. Baseline and all nine input hashes are checked again before completion. A source change during export fails completion. Git HEAD alone is not sufficient provenance for a dirty checkout.

The isolated browser bundle is produced with `Bun.build` from this harness and current source APIs. Each recipe inserts its unmodified default API SVG. The two lessons reuse `CircuitLessonFigure` for controlled selection and `CircuitLessonSequence` for authored steps. Annotations and steps come from `examples/lessons/rc-lowpass.json` and `feedback-amplifier.json`; only the selected theme is overlaid in memory.

## Serve later

Export does not start a server. To serve a completed run separately:

```sh
bun scripts/preview-compact.ts --serve --out artifacts/compact-composition-2026-09-19/preview-default-final --port 4319
```

This read-only server binds only `127.0.0.1`. Open `http://127.0.0.1:4319/`. It serves only that run directory, rejects escaping paths and external symlink targets, and does not expose the repository. An incomplete export without a successful manifest is refused. Stop with Ctrl-C. Serving an older completed run does not upgrade or modify its historical UI.

## Checks without final generation

```sh
bunx --no-install biome check scripts/preview-compact.ts examples/compact-composition
bunx --no-install tsc --ignoreConfig --noEmit --incremental false --target ES2022 --lib DOM,DOM.Iterable,ES2022 --module ESNext --moduleResolution Bundler --jsx react-jsx --strict --noUncheckedIndexedAccess --allowImportingTsExtensions --resolveJsonModule --esModuleInterop --skipLibCheck --types bun,node,react,react-dom scripts/preview-compact.ts examples/compact-composition/app.tsx examples/compact-composition/client.tsx examples/compact-composition/harness.test.tsx
bun test ./examples/compact-composition/harness.test.tsx
```

The tests use server-side React rendering and direct HTTP handler calls, not a browser or listening server. They check all 81 historical hashes, nine default=compact cases, one schematic per recipe, compact-only download links, absence of comparison UI, and no-prop lessons matching explicit compact through authored net selections and steps in all themes. Fixtures derive from canonical examples. Fresh temporary test directories under the artifact root cover missing-directory initialization, all nine deterministic input bytes, idempotent reuse without writes, stale-input rejection and export path guards; these are not final exports.

After the parent generates a completed version 2 export, verify its receipts and manifest:

```sh
COMPACT_PREVIEW_OUT=artifacts/compact-composition-2026-09-19/preview-default-final bun test ./examples/compact-composition/harness.test.tsx
```

Without `COMPACT_PREVIEW_OUT`, completed-export verification is skipped. Historical version 1 exports remain evidence, not fixtures for the new-default manifest test.

Parent browser review: switch light/dark/print, inspect the single default schematic and downloads for every recipe, and exercise both lesson selections and step controls. Check a 390px viewport for page overflow; schematic panels scale to their container and lesson diagrams retain the existing component's scroll container. No global overflow suppression is used. Actual browser geometry, pointer/keyboard behavior and screenshots remain unverified until that review.
