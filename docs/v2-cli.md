# Isolated education CLI and PNG entry

`src/education-cli.ts` is the separate Node-compatible executable source for `circuitkit-education`. It does not import or dispatch through the autorunning v1 `src/cli.ts`. The legacy `circuitkit` binary, core exports, workflows, package and build files are unchanged by this implementation. Parent integration must register and build the new binary.

## Trust boundary and workflow

This is a defined contract over the existing [v2 education engine](v2-contract.md), not a discovered remote API. It performs local JSON transforms with no prompts, network, simulation or electrical-safety certification.

```sh
circuitkit-education schema author
circuitkit-education project author.json --stage question --out public.json
circuitkit-education validate public.json
circuitkit-education inspect public.json
circuitkit-education render public.json --namespace exercise1 --out figure.svg
circuitkit-education render public.json --format png --scale 2 --out figure.png
```

Until registered, substitute `bun src/education-cli.ts` for the binary. Run from the repository or supply an absolute source path.

`project` is a trusted local authoring operation. It requires an explicit `teaching`, `question` or `correction` stage and passes the author input to `projectFigure`. It is not an authorization server or role check. Hosts must decide who may request each stage and project before distributing client props, exports, accessibility data or logs. The CLI never returns the author model, unselected stages, input filename or author diagnostics. Intentionally visible content in the selected projection is public.

`validate`, `inspect`, and `render` accept ONLY `circuitkit.educational.public.v2` documents. They reject author models, v1 documents, envelopes wrapping documents, arbitrary SVG, unknown fields and `--stage`. They do not infer a projection or silently strip private fields. Copy `.document` out of an envelope or use the raw public JSON written by `project --out`.

## Commands and options

| Command | Input | Success payload |
| --- | --- | --- |
| `schema [author\|public]` | No document; default `public` | `model`, `schema` |
| `project <file\|-> --stage STAGE [--out PATH]` | Trusted author JSON | `document`, optional `output` |
| `validate <file\|->` | Public JSON | `document` |
| `inspect <file\|->` | Public JSON | `document`, `bounds`, `targets` |
| `render <file\|-> [--format svg] [--namespace ID] [--out PATH]` | Public JSON | `document`, `bounds`, `targets`, `svg`, optional `output` |
| `render <file\|-> --format png [--scale N] --out PATH` | Public JSON | `document`, `bounds`, `targets`, `format: "png"`, `width`, `height`, `scale`, `bytes`, `output` |

All commands support `--json` and `-h`/`--help`. Bare invocation and `help` return successful workflow help. `--` terminates options for dash-prefixed filenames. Unknown commands, duplicate flags, wrong arity, missing values and command-inappropriate flags fail without reading input.

Schema discovery uses `z.toJSONSchema` directly on the existing strict Zod author/public schemas, in input mode. JSON Schema expresses structural checks, not every runtime text refinement, cross-reference, geometric or resource limit. `schema author` describes authoring types; it never reads or exports an author instance. `schema public` contains no author schema.

`--namespace` applies only to SVG rendering. It must match `[A-Za-z][A-Za-z0-9_-]{0,63}`; default `figure`. The core namespaces title/description and explicitly allowed target IDs, hex-encodes semantic target IDs, and escapes public text. Namespace is neither stage selection nor authorization. PNG has no DOM namespace option.

`--scale` applies only to PNG and is a canonical integer `1`, `2`, `3` or `4`; default `1`. PNG requires `--out`, and neither binary data nor base64 is emitted on stdout. SVG defaults to in-memory output. Project defaults to an in-memory public document.

## Output and exits

Captured/non-TTY stdout automatically emits one JSON object, with or without `--json`:

```json
{"ok":true,"version":2,"diagnostics":[],"nextSteps":["..."],"document":{"schema":"circuitkit.educational.public.v2"}}
```

The example's document is abbreviated. Every envelope has `ok`, `version: 2`, `diagnostics`, and `nextSteps`, plus the command payload above. Output receipts refer to an absolute destination path only after successful publication. No source path, private author state, graph/net membership or stage model is attached to export metadata. SVG text remains in a successful SVG receipt even when written to disk. PNG receipts substitute byte count for the API's byte array.

TTY mode shows help or SVG directly, a concise publication receipt when writing, and readable JSON for structured schema/document/inspection data. Diagnostics go to stderr. There are no banners, color codes, timers or interactive questions. With `--json` or non-TTY stdout, failures also have a JSON envelope on stdout; operational/usage failures have fixed diagnostics on stderr.

| Exit | Meaning |
| --- | --- |
| 0 | Successful help, schema, projection, validation, inspection or export |
| 1 | Invalid UTF-8/JSON/document, resource-bound violation, or PNG pixel limit |
| 2 | Usage error (including invalid CLI flags), input/output failure, unexpected CLI failure, or unavailable/failing native rasterizer |

Public invalid-input failures are content-independent:

```json
{"ok":false,"version":2,"diagnostics":[{"code":"educational.invalid","message":"Invalid or unsupported educational figure."}],"nextSteps":["circuitkit-education --help"]}
```

They contain no input paths, field names, values, excerpts, stack traces, partial documents or artifacts. Usage and IO errors likewise do not echo supplied arguments or underlying exception text. PNG resource/native failures have fixed `png.pixel_limit` / `png.render_failed` diagnostics without document payloads.

## Input and publication safety

Both file and stdin input are limited to 4 MiB of UTF-8 bytes before JSON parsing. UTF-8 decoding is fatal, not replacement-based. JSON BOMs are rejected. A quote/escape-aware preflight caps nesting at 24 containers before `JSON.parse`; the core subsequently enforces its full bounded JSON and strict semantic validation. Files are opened nonblocking and must be regular files, preventing a FIFO/device argument from blocking. Regular-file input symlinks are allowed. `-` requires piped stdin, never a TTY prompt; byte overflow destroys the stream. An unfinished pipe may wait for its producer's EOF; this is not an interactive prompt.

`--out` is accepted only for project/render, must be a real path rather than empty or `-`, and requires an existing parent directory. Publication adapts the existing CLI's adjacent temporary-file pattern: exclusive create, complete write, fsync, close, then hard-link publication for no-clobber or atomic rename for explicit `--overwrite`. Temporary files are cleaned up on handled failures. No delete-existing fallback exists. Validation/rendering succeeds before any temporary output is created.

By default, existing files and destination symlinks, including dangling links, fail with `io.destination_exists`. `--overwrite` requires `--out`; it replaces the directory entry, not the target of a final-component symlink. Parent-directory symlinks are resolved by the filesystem; this is not a sandbox against a hostile directory owner. Hard-link publication lets exactly one of concurrent no-clobber writers succeed. A process killed mid-write can leave its adjacent temporary file; no crash-recovery or directory-fsync durability guarantee is claimed.

## Standalone PNG API

```ts
import { renderEducationalPNG } from '../src/v2/png.ts';

const result = await renderEducationalPNG(publicDocument, { scale: 2 });
if (result.ok) await savePublicPNG(result.png);
```

`renderEducationalPNG(inputPublic: unknown, options?: EducationalPNGOptions): Promise<EducationalPNGResult>` accepts decoded public JSON, not an author model, stage flag or SVG string. Options allow only an optional scale. Omit optional keys instead of assigning `undefined`, following the core's JSON boundary. Options are copied through the accessor-rejecting bounded JSON checker. Unknown keys, accessors, symbols, cycles and non-JSON values fail without evaluating accessors.

Success has `ok: true`, `diagnostics: []`, the core's public `document`, `bounds`, `targets`, and `png`, `format: "png"`, `width`, `height`, `scale`. No SVG or private author data is returned. Failures have only `ok: false` and fixed `diagnostics`; invalid public inputs preserve the core's exact failure. Invalid options use `png.invalid_options` or `png.invalid_scale`.

The wrapper calls `renderEducationalSVG`, computes `ceil(bounds.width * scale)` and `ceil(bounds.height * scale)`, and rejects nonpositive, unsafe or greater-than-16,000,000-pixel dimensions BEFORE dynamically importing or allocating the native rasterizer. Only root SVG width/height are changed to those checked pixel dimensions; viewBox and public content remain unchanged. Resvg uses no system fonts or font directories, and native dimensions are checked before PNG encoding. The native `@resvg/resvg-js` binding is loaded asynchronously only for a valid, bounded render. Import or render exceptions become `png.render_failed` without exposing their text.

## Parent build handoff

No dependency, package, script, existing CLI, core or renderer edits are included here. The existing dependency on `@resvg/resvg-js` is reused.

Parent integration must:

1. Register `bin["circuitkit-education"] = "./dist/education-cli.js"`, preserving `bin.circuitkit` and all legacy entries.
2. Build `src/education-cli.ts` as Node-target ESM with its Node shebang preserved and chmod the emitted binary to `0755`.
3. Build `src/v2/png.ts` as a separate Node-target ESM entry (for example `dist/v2/png.js`); keep `@resvg/resvg-js` external so native platform packages resolve at runtime and no `.node` binary is bundled/emitted. Add its declarations and the chosen public package subpath. Do not re-export PNG from browser v2 core.
4. For an isolated-subpath build like the v1 CLI, externalize CLI imports `./v2/index.ts`, `./v2/schema.ts`, `./v2/png.ts` and `zod`, then rewrite the three local extensions to `.js` in the emitted CLI. Emit corresponding v2 index/schema modules, or adjust paths to the parent's chosen layout. Preserve the dynamic PNG import. Do not import the autorunning v1 CLI to share helpers.
5. The standalone PNG can bundle its local public render/safety/schema modules and font data, leaving `@resvg/resvg-js` (and optionally `zod`) external. If instead externalizing its locals, rewrite `./render.ts` and `./safety.ts` to emitted `.js` paths as well. Type-only imports need no runtime rewrite.
6. Verify the registered executable, package installation, declarations and native binding on supported Node/Bun platforms. This task does not register, globally link or publish the binary.

The tests can run against a parent-compiled CLI without edits:

```sh
bun test tests/education-cli.test.ts tests/v2-png.test.ts
CIRCUITKIT_EDUCATION_TEST_CLI="$PWD/dist/education-cli.js" \
CIRCUITKIT_EDUCATION_TEST_RUNTIME=node bun test tests/education-cli.test.ts
CIRCUITKIT_EDUCATION_TEST_CLI="$PWD/dist/education-cli.js" \
CIRCUITKIT_EDUCATION_TEST_RUNTIME=bun bun test tests/education-cli.test.ts
```

The test runner is Bun; the child CLI runtime is selected independently by the environment. PNG tests exercise actual native bytes, dimensions, determinism, immutable public metadata, noninterference, malicious options, native-load ordering, native failures and browser-core isolation. CLI tests cover each command, strict public rejection, schema discovery, stdin/file byte limits and UTF-8, namespace IDs, PNG receipts, exit codes, no-clobber, symlink replacement, concurrent writers and temporary cleanup.

## Implementation decisions

CLI-build skill classification: defined, local-only, Node-compatible distribution with Bun development/testing. Existing published v2 privacy and v1 envelope/file-safety conventions take precedence over new infrastructure. Parsing, TTY detection, JSON envelopes and atomic writes are adapted locally; no cligentic installation or extra dependencies. Shared presentation/banner blocks are not adopted for this intentionally isolated export surface. Network trust ladders, audit ledgers, approval tokens, polling, and prompts are inapplicable. Explicit overwrite is the only potentially destructive action and remains opt-in.

The five-file ownership boundary excludes editing `friction.md`, adding a separate skill/case artifact, linking the package globally, or changing the package/build to exercise the final registered bin. This document records those decisions and provides the agent workflow instead. Final package registration and installed-bin verification remain parent work.

## Observed verification

Verified locally on 2026-09-16 with Bun 1.3.11 and Node v24.18.0:

```sh
bun test tests/education-cli.test.ts tests/v2-png.test.ts
bun test tests/education-cli.test.ts tests/v2-png.test.ts tests/v2-engine.test.ts tests/v2-safety.test.ts tests/v2-boundaries.test.ts
bun test tests/cli.test.ts tests/png.test.ts
bun test tests/annotations.test.ts --test-name-pattern 'immutable pre-annotation SVG fixture'
bunx --no-install biome check src/education-cli.ts src/v2/png.ts tests/education-cli.test.ts tests/v2-png.test.ts
bunx --no-install tsc --ignoreConfig --noEmit --strict --noUncheckedIndexedAccess --target ES2022 --module ESNext --moduleResolution Bundler --allowImportingTsExtensions --resolveJsonModule --esModuleInterop --skipLibCheck --types bun,node src/education-cli.ts src/v2/png.ts tests/education-cli.test.ts tests/v2-png.test.ts
bun src/education-cli.ts --help
```

All commands above passed with exit 0. New tests: **89 pass, 0 fail, 1307 assertions**. Combined v2 tests: **184 pass, 0 fail, 3903 assertions**. Existing CLI/PNG tests: **144 pass, 0 fail, 1932 assertions**. Original SVG fixture checks: **28 pass, 0 fail, 164 assertions**, including all 27 original recipe/theme hashes. Biome checked four files without changes; focused TypeScript emitted no diagnostics after correcting initial local narrowing errors. Help was also inspected through a real TTY.

A temporary split ESM build separately emitted the education CLI and v2 index/schema/PNG modules, externalized Zod and Resvg, applied the three CLI `.ts` to `.js` rewrites above, preserved the Node shebang and executable mode, and verified no emitted native binary or direct CLI Resvg dependency. Using the environment overrides documented above, **all 65 CLI tests passed under Node and all 65 passed under Bun**, each with 1109 assertions and exit 0. Those tests included actual native PNG output, not just help. Temporary artifacts were removed. This verifies the split-build pattern, not the still-parent-owned package registration or installation.

Full-project `bunx --no-install tsc --noEmit --incremental false` was also attempted and **failed** on out-of-scope concurrent work in `scripts/extract-gradual.ts` and `tests/gradual-corpus.test.ts` (unsupported `BuildConfig.write` and nullable/indexed-value typing). Neither file was changed. Full repository QA and installed-bin verification remain outstanding; no claim is made that the full project typechecks.
