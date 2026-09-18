# Gradual corpus extraction

The extractor inventories authored figure slots. It does not assert CircuitKit compatibility, electrical equivalence, original-renderer SSR equivalence, or screenshot coverage.

## Run

Run from the CircuitKit checkout with the existing Bun and Biome installations. No installation, environment-file loading, source app startup, or package script is needed.

```sh
bun --no-env-file --no-install scripts/extract-gradual.ts --source /Users/raillyhugo/Programming/crafter-station/gradual --out artifacts/gradual-corpus
bun --no-env-file --no-install test tests/gradual-corpus.test.ts
bun --no-env-file --no-install node_modules/@biomejs/biome/bin/biome check scripts/extract-gradual.ts tests/gradual-corpus.test.ts
```

`--source` is required. There is no implicit source checkout. `--out` defaults to this repo's `artifacts/gradual-corpus` and may only select that directory or a descendant. Output cannot overlap the source. Symlinked source files, symlinked output parents, and hardlinked output files are rejected.

The real-corpus tests read the source path from the generated manifest, re-extract the real checkout, and fail if the artifact/source is missing or changed. Synthetic fixture tests are additional logic tests, not a substitute for the corpus. They contain synthetic prompts only.

Importing `scripts/extract-gradual.ts` does not run the CLI, load a source checkout, or write anything. Reusable exports include `canonical`, `sha256`, `validateFigure`, `figureSignatures`, `walkFigureSlots`, `prerequisiteClosure`, `parseStaticLiteral`, `extractInlineFigures`, `auditPureModules`, `resolvePureImport`, `materialize`, `extractCorpus`, `loadGradual`, `generateCorpus`, `snapshotMetadata`, `validateOutputPath`, `writeCorpus`, and `parseArgs`.

## Attested source and boundaries

- Revision: `613085ba1cdbb61f058354546f47b515292b1db6`.
- Source-content SHA-256: `77db33ecda6679cb964610d6f2d9d9451ffa2165919b02b1505a33321d043357`.
- The source hash covers the canonical sorted array of `{path, sha256}` for 44 explicitly selected source files. It is not a hash of the whole checkout and excludes absolute directory names.
- Initial source checkout: `main`, with only `next-env.d.ts` dirty. That file is neither opened nor copied.
- Gradual's `AGENTS.md` is read and hashed. No root/scoped AGENTS file was present in CircuitKit's owned source paths during implementation.
- Seventeen pure TypeScript modules are SHA-256 pinned before materialization. Their runtime imports are scanned and resolved against an explicit allowlist, including three authored JSON catalogs.
- Bun builds that audited module graph from captured strings into memory. All import resolution/load hooks reject files outside the allowlist. No Gradual TypeScript module is imported through Bun's runtime resolver, and no source checkout config, storage module, package installation, transpilation cache, or environment file is needed.
- The audited bundle is evaluated without filesystem, process, Bun, require, or network APIs. Hash pinning and the import allowlist are the trust boundary; the VM is not offered as a general sandbox for untrusted code.
- Source files and HEAD are revalidated after materialization. Different source bytes, even with unchanged counts, fail the source-hash baseline.
- The route and host components are text evidence only. The two route figure props are parsed as restricted static literals, never evaluated as application code.
- No personal progress, persisted sessions, uploads, credentials, environment files, or learner records are accessed. Authored question/solution content stays in ignored local artifacts, never published fixtures or package outputs.

## Composition and scope

The graph is the actual `knowledgeGraph` export from `course/graph/catalog.ts`: core JSON, package JSON, roadmap unit targets, and the six generated DC lessons, composed by Gradual's audited `composeGraph`. Academy content is the actual revised `courses` export, not the stale raw academy JSON. Applications come from the pure `applicationCases` export.

The hardware goal's incoming prerequisite closure has 29 published lessons: 20 `hw.*`, six `dc.*`, and `math.rearrange`, `re.observation`, `re.experiment`. It has 212 practice questions and 12 assessment questions. Practice edges do not expand the closure.

Published nodes outside that closure are scoped out, not claimed as failures. Positional figures are explicitly recorded under `scope.excludedFigureSlots`; none belongs to the selected corpus. Both draft graph nodes (`firmware.uart-frame`, `vision.image-shape`) and all 36 planned roadmap courses are recorded as not compatible/not covered. A planned course is not evidence of implemented content.

The extractor retains 104 out-of-scope materialized figure slots with their family, signatures, reason, and provenance. These are not added to selected occurrence or exact-figure totals. Unexpected populated figure locations outside the classified graph, academy, and application roots fail rather than disappearing.

## Baseline

| Surface | Occurrences | Exact figures |
| --- | ---: | ---: |
| Graph closure | 408 | 338 |
| Revised academy in closure | 236 | 175 |
| Hardware applications | 6 | 5 |
| Explicit-slot union | 650 | 342 |
| Inline unit-page slots | 2 | 2 |
| Total union | 652 | 344 |

The inline slots are the divider in the DC unit hero and the breadboard in the bench-project section of `app/units/[unitId]/page.tsx`. They introduce two additional exact figures. Counts represent authored slots, not the number of simultaneously visible figures or learner visits.

The ten null host-foundation paths are separate from all 652 figure occurrences:

- Graph: `hw.meter.continuity`, four `math.rearrange.*` points, `re.observation`, and `re.experiment`.
- Academy: first-reading paths for `hw.meter`, `re.observation`, and `re.experiment`.

Graph composition uses `point.figure ?? content.figure`; the host calls `LearningDiagram` only if the effective figure is absent. Academy calls it only for the first reading without a figure. All ten paths have `diagram: "none"`, so the original renderer returns null. Their surrounding teaching text and composition evidence remain in `hostFoundations`; they are not fabricated schematic figures or dropped content.

| Stage | Occurrences | Exact within stage |
| --- | ---: | ---: |
| lesson | 44 | 24 |
| point | 59 | 45 |
| example | 101 | 44 |
| question | 225 | 144 |
| solution | 213 | 131 |
| exam | 8 | 8 |
| unit-overview | 2 | 2 |

`bank` distinguishes practice, assessment, and application solutions. Four assessment questions have no question-side figure, so 12 assessments produce eight `exam` figure occurrences. All questions, including those with no figure, remain in the 319 `questionSolutionPairs` records.

| Family | Occurrences | Exact figures |
| --- | ---: | ---: |
| bars | 22 | 10 |
| board | 18 | 8 |
| breadboard | 9 | 7 |
| divider | 69 | 49 |
| fragment | 29 | 15 |
| led | 38 | 14 |
| levels | 22 | 10 |
| loop | 96 | 49 |
| node-comparison | 1 | 1 |
| potentials | 26 | 21 |
| power | 48 | 30 |
| pullup | 34 | 4 |
| readings | 70 | 40 |
| record | 26 | 12 |
| scale | 36 | 20 |
| signal | 44 | 20 |
| supply | 16 | 4 |
| timeline | 48 | 30 |

Do not sum exact counts across surfaces or stages: the same figure can occur in multiple groups.

## Manifest contract

`artifacts/gradual-corpus/manifest.json` contains canonical JSON with a trailing newline, no generated timestamp, and no output-directory-dependent values.

```text
schemaVersion: 1
source: { sourceDir, revision, sourceHash, files: [{ path, sha256, bytes, role }] }
scope: { goalId, lessonIds, exclusions, excludedFigureSlots }
signaturePolicy: { exact, semantic, occurrence }
counts: { lessons, hardwareLessons, dcLessons, foundationLessons, practice,
          assessment, graph, academy, applications, explicit, inline, total,
          hostFoundations }
coverageMatrix: { surfaces, stages, lessons }
occurrences: [{
  caseId, surface, stage, bank, courseId, lessonId, pointId, applicationId,
  sourceQuestionId, sourceSolutionId, pairId,
  exactFigureId, exactSignature, semanticSignature, family,
  context: { lesson, point?, example?, question?, solution? },
  source: { sourceDir, revision, sourceHash, file, fileHash, propertyPath,
            authoredAt, derivationSites }
}]
exactFigures: [{ id, exactSignature, semanticSignature, family, figure, occurrenceIds }]
families: [{ family, occurrences, exact, semantic, occurrenceIds, exactFigureIds }]
hostFoundations: [{ caseId, surface, lessonId, pointId, stage, diagram, rendered,
                    compatible, renderer, caller, composition, context, source }]
questionSolutionPairs: [{ pairId, surface, lessonId, bank, sourceQuestionId,
                         sourceSolutionId, sourceSolutionIdKind, source,
                         questionPropertyPath, solutionPropertyPath,
                         questionCaseIds, solutionCaseIds, question, solution }]
snapshot: { metadata, access, distribution, license, rendererEntry, foundationEntry,
            sourceAlias, sourceRevision, sourceHash, dependencies, dependencyVersions,
            imports, galleryHost, files, exclusions }
```

`source.propertyPath` identifies the property of the materialized named export, with JSON-pointer escaping. JSON `authoredAt` locations are exact-payload matches in authored catalogs, not assertions that every matching location caused this occurrence. `derivationSites` identifies the input node, academy revision, or DC exported lesson/builders supplying the materialized content. Each site carries its own file hash. TS export paths describe the resulting exported objects, not character offsets or lexical object literals.

Examples of stable case identity patterns:

```text
graph:<lesson-id>:/content/exercises/<source-question-id>/figure
graph:<lesson-id>:/assessment/<source-question-id>/solution/figure
graph:<lesson-id>:/points/<source-point-id>/example/figure
academy:<lesson-id>:/reading/<source-core-point-id>/figure
applications:<application-id>:/exercise/<source-question-id>/figure
inline:dc-circuit:hero
inline:dc-circuit:lab
```

Array indices remain in provenance, not graph exercise/point case identities. Revised academy readings recover core point IDs where available. Exact IDs depend only on the complete figure payload, not context or surface. Changes to a caption change the exact figure ID but not its source-slot case ID.

Gradual solutions have no independent authored ID. `sourceSolutionId` is explicitly derived as `<sourceQuestionId>/solution`, or null when absent. `pairId` includes surface, lesson/application ID, bank, and source question ID. Academy legacy question IDs are retained as the revised source exports them; they are not merged with graph IDs. Use `questionCaseIds` and `solutionCaseIds` to join visual slots, including empty lists when either side has no figure. The pair records also retain prompt, choices, answer, explanation, solution body, and their property paths.

Exact signatures hash recursive key-sorted JSON including captions, preserving array order and all populated fields. Undefined object properties are omitted, matching materialization to JSON. Semantic signatures omit only the top-level caption. They are caption-independent payload buckets, not topology analysis, circuit equivalence, or a deduplication key. Neither signature ever removes an occurrence.

## Read-only local gallery snapshot

The snapshot has 37 selected pure catalog/helper, renderer/dependency, type, and stylesheet files under `snapshot/source`, plus `snapshot/metadata.json` and `snapshot/inline-figures.json`. Copied source bytes and metadata are mode `0444`, verified by tests. It contains no source routes, storage modules, node_modules, source checkout, personal state, or runnable source app shell.

A separate gallery can resolve `@/` to `snapshot/source`, render `CircuitDiagram` with a manifest exact figure, and use `LearningDiagram` for host evidence. `galleryHost` records the tooltip provider, original classes, light/dark theme attribute, Geist font entrypoints, and stylesheet order, including KaTeX. `imports` records all statically resolved local runtime renderer dependencies. Package versions are the source's declared ranges, not installed/resolved dependency versions; the extractor installs nothing.

License permission for these Gradual sources has not been established. The snapshot is explicitly `local-only-not-bundled`. Do not copy it, authored solutions, or this manifest into `dist`, public package fixtures, or deployed assets. The existing package file allowlist excludes artifacts, tests, and the extractor.

Original-renderer SSR, dependency provisioning, visual comparison, and screenshots are deferred to the other worker. Snapshot presence is not render proof.

## Drift and verification

Default extraction requires the attested revision, selected-source hash, complete count baseline, recognized figure kinds/properties, classified figure slots, and the hash-pinned pure module graph. There is no `--skip-baseline`, auto-accept, or silent fallback.

After explicit review, `--baseline artifacts/gradual-corpus/baseline.json` accepts a local JSON object with `revision`, `sourceHash`, and the complete `counts` object. Count configuration does not authorize a changed executable module: a module hash change still needs code review and a deliberate update to the pure-module hash table. Source-content checks catch changed labels, prompts, renderer code, or input data even when all counts remain unchanged.

Focused verification covers deterministic synthetic extraction and mandatory live-corpus re-extraction, all stages and counts, exact-versus-semantic distinctions, stable source IDs, pair uniqueness, null fallbacks, scope exclusions, malicious/unknown literal forms, import rejection, source drift, output escape rejection, snapshot bytes/permissions, source non-mutation, package exclusion, and byte-identical regeneration.

Verification records belong in the ignored artifact directory. No commit, push, deployment, SSR, screenshots, or unrelated repository-wide test/build gate is part of this extraction task.
