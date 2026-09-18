# Testing CircuitKit

Run repository checks from the source checkout root with Bun and the pinned dependencies installed. The shipped npm CLI targets Node.js 20+. Test both the source and a fresh packed Node consumer; a registry install is for consumers, not a substitute for checking this checkout. See the [installation guide](guide.md).

## Deterministic core and focused contracts

```sh
bun install --frozen-lockfile
bun run typecheck --incremental false
bun test tests/validation.test.ts tests/renderer.test.ts tests/complex.test.ts tests/npn-symbol.test.ts
bun test tests/cli.test.ts
bun test tests/annotations.test.ts tests/react.test.tsx tests/lesson-figure.test.tsx
bun test tests/landing.test.tsx tests/gallery-routes.test.ts tests/editor.test.ts
```

The lockfile uses public npm URLs, pinned versions and integrity hashes. Installation can require network access or a populated cache. Rendering and the deterministic test corpus do not require a backend or generation service. Typechecking with `--incremental false` avoids updating build-info files.

These checks cover schema and exact role graphs, measured geometry, emitted SVG, semiconductor symbols, CLI diagnostics and file safety, React/core parity, annotations, lesson selection contracts, editor state and route compatibility. React and route tests include server rendering; they are not proof of browser hydration, pointer behavior or visual quality.

To run the complete test directory and the repository's Biome check:

```sh
bun run test
bun run check
```

`bun run test` resolves the explicit `./tests` directory, rather than using a name filter that can collect third-party tests inside temporary artifacts. It includes the stress tests below. Use the output of the actual run for pass/fail status, test totals and assertions. Totals are mutable as coverage grows; a historical count is not an acceptance requirement. Keep failure output and the exit status rather than substituting an earlier green checkpoint.

## Deterministic stress corpus

```sh
bun test tests/stress.test.ts
bun scripts/stress.ts
```

The test file covers corpus membership, systematic graph mutations, invariant-oracle probes, worker cancellation/restart and parity with the synchronous runner. The standalone script executes the shared corpus and prints actual gallery, scenario, topology and stress totals, outcomes and elapsed time. Timing is an observation, not a pass threshold.

Expected diagnostic rejections count as passing coverage. Unexpected failures produce exit 1 and retain their inputs and invariant messages. The script writes a generated JSON report under `artifacts/gallery/`; the directory is created as needed and is not required in a fresh source checkout. Reports preserve nonfinite values, signed zero and undefined with explicit encodings rather than silently converting them to null. See the [corpus contract](stress-corpus.md) and [complex-circuit geometry contracts](complex-circuits.md).

Determinism and wire-continuity checks are bounded tests of the supported recipes, not an arbitrary circuit solver, electrical-safety certification or universal correctness proof.

## Library, CLI and local package

```sh
bun run build
bun dist/cli.js --help
bun dist/cli.js validate examples/rc-lowpass.json --json
bun dist/cli.js render examples/rc-lowpass.json --json
mkdir -p artifacts
bun pm pack --destination artifacts
bun scripts/verify-package.ts artifacts/circuitkit-0.1.0.tgz
```

`build` produces the library and CLI in `dist`, not the Next.js application. The render command above returns SVG in JSON without writing a destination file. See the [CLI contract](cli-contract.md) for exit codes, structured diagnostics and no-overwrite behavior.

For package version 0.1.0, packing produces `artifacts/circuitkit-0.1.0.tgz`. Keep the artifact at the path shown and run the verifier from the repository root. The currently inspected [verifier script](../scripts/verify-package.ts) resolves that exact location internally rather than parsing a different path argument, so do not substitute another artifact location without checking its usage. Packing is local and does not publish anything. A consumer can install a copied tarball with `bun add ./circuitkit-0.1.0.tgz`; the installed bin is `./node_modules/.bin/circuitkit`, and the optional React export is `circuitkit/react`. No global CircuitKit installation is needed.

The package verifier creates isolated temporary consumer directories, installs their dependencies, typechecks and builds a Next.js consumer, compares installed CLI and React output with core, checks bundled fonts/licenses/types, and exercises the core in Node without React installed. It needs Bun, Node and dependency network/cache access. It records generated package-check metadata locally. A passing source test or library build alone does not establish any of these packed-consumer checks, and a consumer build does not prove hydration.

## Web build and opt-in browser checks

Build and serve the production app in one terminal:

```sh
bun run build:web
bun run start --port 3218
```

Alternatively, use the development server instead of those two commands:

```sh
bun run dev --port 3218
```

Wait for readiness before running browser checks in another terminal. Port 3218 is an example, not a required global setting. The five browser scripts below accept the base URL as their first argument; pass the actual server URL explicitly.

Browser checks are opt-in. They require a separately provisioned `agent-browser` CLI on PATH and a supported browser runtime. `bun install` for this repository does not supply that optional tool. Use an existing approved local tool setup or project-local executable; no global installation is required. The PATH prefix below exposes a project-local binary to the scripts without changing repository dependencies:

```sh
PATH="$PWD/node_modules/.bin:$PATH" bun scripts/check-landing.ts http://127.0.0.1:3218
PATH="$PWD/node_modules/.bin:$PATH" bun scripts/browser-check.ts http://127.0.0.1:3218
PATH="$PWD/node_modules/.bin:$PATH" bun scripts/check-lesson-figure.ts http://127.0.0.1:3218
PATH="$PWD/node_modules/.bin:$PATH" bun scripts/check-app-theme.ts http://127.0.0.1:3218
PATH="$PWD/node_modules/.bin:$PATH" bun scripts/check-theme-regressions.ts http://127.0.0.1:3218
```

The app-theme checker covers system preference, persisted overrides, root/background colors, shared-header identity, all-route navigation, reloads, 404 recovery, viewport containment and document-theme isolation. Set `CIRCUITKIT_THEME_ARTIFACTS` to choose a different output directory. Native macOS rubber-band scrolling is not faithfully reproduced by headless Chromium; resized viewports are not physical-device certification. The script records coarse-pointer emulation limitations and axe incomplete checks instead of treating them as passes.

The focused theme-regression checker verifies filter synchronization after both direct and locally edited gallery URLs, rapid typing, browser Back, invalid editor drafts, and document-aware keyboard focus when site and SVG themes differ.

The editor checker opens `/editor` and compares actual SVG paths/glyph bounds with core, exercises document/value/theme/focus controls and failures, and inspects standalone exports. Clipboard cases are injected and download Blob bytes are observed; this does not prove that every browser successfully saves a user-selected file. The lesson checker exercises `/lesson`, independent annotated figures, selection previews and exported figure behavior. Both generate local evidence under `artifacts/` rather than relying on files shipped in the source repository.

After successful package verification, the optional consumer browser check can start its own temporary production server using the recorded consumer location:

```sh
PATH="$PWD/node_modules/.bin:$PATH" bun scripts/consumer-browser-check.ts
```

Missing browser tooling, denied local server access or a failed browser launch is an environment blocker, not a passing test. These scripts are not part of the deterministic core requirement. Screenshots and assertions still need human visual/accessibility review.

## Route and visual review

The routes are `/` for the landing, `/editor` for the editor, `/gallery` for the gallery and `/lesson` for the teaching pilot. Gallery cases use `/editor?case=...`; legacy `/?case=...` links must keep opening the same editor. Unknown, empty and repeated case parameters must retain their rejection behavior, while unrelated root query parameters keep the landing.

Before public sharing, check landing theme changes with a selected net, hover/focus restoration, Escape/Show all, saved-selection downloads, keyboard navigation, 320px/coarse-pointer layouts, overflow and editor/gallery/lesson round trips. The editor and lesson scripts do not by themselves establish the new landing's complete browser behavior.

The [landing design record](landing-design.md) records the 2026-09-15 verification: 1,281 project tests passed, typechecking and library/web builds passed, the renamed tarball passed isolated-consumer verification, and `bun scripts/check-landing.ts` passed 27 browser checks. The landing checker covers both themes, saved versus preview selection, exact export bytes, aligned actions, viewport containment, route round trips and automatic accessibility audits. These dated observations do not replace running the commands against later changes. Chromium resized-viewports are not physical-device or cross-browser certification, and no npm release or hosted deployment is implied.
