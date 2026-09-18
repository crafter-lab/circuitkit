import { beforeAll, describe, expect, test } from "bun:test";
import { execFileSync, spawnSync } from "node:child_process";
import { lstat, mkdir, readdir, readFile, rm, symlink } from "node:fs/promises";
import { join, resolve } from "node:path";
import {
  assertBaseline,
  auditPureModules,
  BASELINE_COUNTS,
  BASELINE_REVISION,
  type CorpusInput,
  canonical,
  extractCorpus,
  extractInlineFigures,
  type Figure,
  figureSignatures,
  generateCorpus,
  type Json,
  parseArgs,
  parseStaticLiteral,
  prerequisiteClosure,
  resolvePureImport,
  sha256,
  snapshotMetadata,
  validateFigure,
  validateOutputPath,
  walkFigureSlots,
  writeCorpus,
} from "../scripts/extract-gradual";

const root = resolve(import.meta.dir, "..");
const output = join(root, "artifacts/gradual-corpus");
const figure: Figure = { kind: "loop", caption: "Synthetic loop", supply: "3 V" };

function fixture(): CorpusInput {
  const exercise = {
    id: "hw.fixture.practice.1",
    prompt: "Synthetic prompt",
    answer: 1,
    explanation: "Synthetic explanation",
    figure,
    solution: { title: "Synthetic solution", body: "Synthetic body", figure },
  };
  const node = {
    id: "hw.fixture",
    domain: "hardware",
    status: "published",
    version: 1,
    content: {
      id: "hw.fixture",
      title: "Fixture lesson",
      body: "Synthetic lesson",
      rule: "Fixture rule",
      diagram: "none",
      figure,
      example: { prompt: "Example prompt", steps: ["Example step"], figure },
      exercises: [exercise],
    },
    points: [
      {
        id: "hw.fixture.point",
        title: "Fixture point",
        body: "Point body",
        rule: "Point rule",
        figure,
        example: { prompt: "Point example", steps: ["Point step"], figure },
        exerciseIds: [exercise.id],
      },
    ],
    assessment: [{ ...exercise, id: "hw.fixture.exam.1" }],
  };
  const catalog = {
    knowledgeGraph: { nodes: [node], edges: [], goals: [{ id: "hardware", targets: [node.id] }] },
    courses: [],
    applicationCases: [],
    courseCatalog: [],
    learningUnits: [],
  };
  const files = new Map([
    ["course/graph/catalog.ts", "synthetic graph export"],
    ["course/graph/core.json", canonical(catalog.knowledgeGraph)],
    ["course/graph/packages.json", "[]"],
    ["course/academy/courses.json", "[]"],
  ]);
  return {
    catalog,
    files,
    sourceDir: "/synthetic-read-only-source",
    revision: "fixture",
    sourceHash: sha256("fixture"),
    sourceFiles: [],
    inline: [],
  };
}
function first<T>(items: readonly T[]): T {
  const item = items[0];
  if (item === undefined) throw new Error("Expected a nonempty result");
  return item;
}
function records(value: Json | undefined): [{ [key: string]: Json }, ...{ [key: string]: Json }[]] {
  if (
    !Array.isArray(value) ||
    value.length === 0 ||
    value.some((item) => !item || typeof item !== "object" || Array.isArray(item))
  ) {
    throw new Error("Expected nonempty fixture records");
  }
  return value as [{ [key: string]: Json }, ...{ [key: string]: Json }[]];
}

describe("deterministic extractor fixtures", () => {
  test("canonicalization is recursive, key-order independent and array-order sensitive", () => {
    expect(canonical({ b: [2, 1], a: { z: true, x: null } })).toBe(
      canonical({ a: { x: null, z: true }, b: [2, 1] }),
    );
    expect(canonical([1, 2])).not.toBe(canonical([2, 1]));
    expect(canonical({ a: undefined })).toBe("{}");
    expect(() => canonical({ x: Number.NaN })).toThrow("Non-JSON");
    expect(() => canonical([undefined])).toThrow("Non-JSON");
  });

  test("exact and caption-independent signatures never conflate distinct occurrences", () => {
    const changed = { ...figure, caption: "Different caption" };
    expect(figureSignatures(figure).exactSignature).not.toBe(
      figureSignatures(changed).exactSignature,
    );
    expect(figureSignatures(figure).semanticSignature).toBe(
      figureSignatures(changed).semanticSignature,
    );
    const result = extractCorpus(fixture());
    expect(result.counts.total).toEqual({ occurrences: 8, exact: 1 });
    expect(first(result.exactFigures).occurrenceIds).toHaveLength(8);
    expect(new Set(result.occurrences.map((o) => o.stage))).toEqual(
      new Set(["lesson", "point", "example", "question", "solution", "exam"]),
    );
    expect(canonical(result)).toBe(canonical(extractCorpus(fixture())));
  });

  test("repeated references keep property paths and question/solution pairing", () => {
    const result = extractCorpus(fixture());
    const question = result.occurrences.find((o) => o.stage === "question");
    if (!question) throw new Error("Expected a question occurrence");
    expect(question?.pointId).toBe("hw.fixture.point");
    expect(question?.sourceQuestionId).toBe("hw.fixture.practice.1");
    expect(question?.sourceSolutionId).toBe("hw.fixture.practice.1/solution");
    const pair = result.questionSolutionPairs.find((p) => p.pairId === question?.pairId);
    expect(pair?.questionCaseIds).toEqual([question?.caseId]);
    expect(pair?.solutionCaseIds).toHaveLength(1);
    expect(question?.context.solution).toEqual({
      title: "Synthetic solution",
      body: "Synthetic body",
    });
    expect(question?.source.propertyPath).toBe(
      "/knowledgeGraph/nodes/0/content/exercises/0/figure",
    );
    expect(question?.source.authoredAt.length).toBeGreaterThan(0);
    expect(first(question.source.derivationSites).file).toBe("course/graph/core.json");
  });

  test("source IDs survive exercise and point reorder without merging", () => {
    const input = fixture();
    const node = records((input.catalog.knowledgeGraph as { nodes: Json }).nodes)[0];
    const content = node.content as { [key: string]: Json };
    const bank = records(content.exercises);
    bank.push({ ...bank[0], id: "hw.fixture.practice.2" });
    const points = records(node.points);
    points.push({ ...points[0], id: "hw.fixture.point.2", exerciseIds: ["hw.fixture.practice.2"] });
    const before = extractCorpus(input).occurrences.map((o) => o.caseId);
    bank.reverse();
    points.reverse();
    expect(extractCorpus(input).occurrences.map((o) => o.caseId)).toEqual(before);
  });

  test("unknown populated families, properties, containers and stages hard fail", () => {
    expect(() => validateFigure({ kind: "future", caption: "Future" }, "/figure")).toThrow(
      "Unrecognized",
    );
    expect(() => validateFigure({ ...figure, hiddenWiring: true }, "/figure")).toThrow("property");
    expect(() => walkFigureSlots({ figure: "not-a-figure" }, () => {})).toThrow("Expected object");
    expect(() => walkFigureSlots({ figures: [figure] }, () => {})).toThrow("container");
    expect(() => walkFigureSlots({ futureFigure: false }, () => {})).toThrow("container");
    const input = fixture();
    const node = records((input.catalog.knowledgeGraph as { nodes: Json }).nodes)[0];
    node.futureStage = { figure };
    expect(() => extractCorpus(input)).toThrow("Unrecognized populated figure slot");
    const top = fixture();
    top.catalog.unclassified = { figure };
    expect(() => extractCorpus(top)).toThrow("outside classified roots");
  });

  test("null and absent figures are not occurrences; effective point fallbacks are retained", () => {
    const input = fixture();
    const node = records((input.catalog.knowledgeGraph as { nodes: Json }).nodes)[0];
    (node.content as { [key: string]: Json }).figure = null;
    records(node.points)[0].figure = null;
    const result = extractCorpus(input);
    expect(result.counts.total.occurrences).toBe(6);
    expect(result.hostFoundations).toHaveLength(1);
    const host = first(result.hostFoundations);
    expect(host.rendered).toBe("null");
    expect(host.pointId).toBe("hw.fixture.point");
    expect(host.compatible).toBe(false);
  });

  test("closure follows only incoming prerequisites and rejects cycles, duplicates and dangling IDs", () => {
    const graph = {
      nodes: [{ id: "a" }, { id: "b" }, { id: "c" }],
      edges: [
        { from: "a", to: "b", kind: "prerequisite" },
        { from: "c", to: "b", kind: "practices" },
      ],
      goals: [{ id: "hardware", targets: ["b"] }],
    };
    expect(prerequisiteClosure(graph, "hardware")).toEqual(["a", "b"]);
    expect(() =>
      prerequisiteClosure({ ...graph, nodes: [{ id: "b" }, { id: "c" }] }, "hardware"),
    ).toThrow("Dangling");
    expect(() =>
      prerequisiteClosure({ ...graph, nodes: [...graph.nodes, { id: "b" }] }, "hardware"),
    ).toThrow("Duplicate");
    expect(() =>
      prerequisiteClosure(
        { ...graph, edges: [...graph.edges, { from: "b", to: "a", kind: "prerequisite" }] },
        "hardware",
      ),
    ).toThrow("Cyclic");
  });

  test("drafts, planned courses and out-of-scope positional figures are explicitly excluded", () => {
    const input = fixture();
    const graph = input.catalog.knowledgeGraph as { [key: string]: Json };
    records(graph.nodes).push(
      {
        id: "re.outside",
        status: "published",
        content: {
          figure: { kind: "positional", caption: "Synthetic bytes", positional: { digits: ["1"] } },
        },
      },
      { id: "draft.future", status: "draft", content: { figure } },
    );
    input.catalog.courseCatalog = [{ id: "planned", title: "Planned", status: "planned" }];
    const result = extractCorpus(input);
    expect(result.counts.total).toEqual({ occurrences: 8, exact: 1 });
    expect(result.scope.exclusions.map((e) => e.reason)).toContain("draft-not-compatible");
    expect(result.scope.exclusions.map((e) => e.reason)).toContain("planned-not-compatible");
    expect(result.scope.excludedFigureSlots).toHaveLength(2);
    expect(result.scope.excludedFigureSlots.some((e) => e.family === "positional")).toBe(true);
  });

  test("duplicate source exercise identities fail rather than overwrite pairs", () => {
    const input = fixture();
    const node = records((input.catalog.knowledgeGraph as { nodes: Json }).nodes)[0];
    const exercises = records((node.content as { [key: string]: Json }).exercises);
    exercises.push(exercises[0]);
    expect(() => extractCorpus(input)).toThrow("Duplicate occurrence");
  });

  test("duplicate questions with no figure still fail pair identity validation", () => {
    const input = fixture();
    const node = records((input.catalog.knowledgeGraph as { nodes: Json }).nodes)[0];
    const exercises = records((node.content as { [key: string]: Json }).exercises);
    exercises[0].figure = null;
    exercises[0].solution = null;
    exercises.push(exercises[0]);
    expect(() => extractCorpus(input)).toThrow("Duplicate question/solution pair");
  });

  test("literal parser preserves colons, braces, escaped text, nested arrays and trailing commas", () => {
    const source =
      '<CircuitDiagram figure={{ kind: "breadboard", caption: "Reference layout: {R1}, \\"quoted\\"", boardRows: [5, 10, 15,], }} />';
    const result = extractInlineFigures(source);
    const inline = first(result);
    expect(inline.figure.caption).toBe('Reference layout: {R1}, "quoted"');
    expect(inline.figure.boardRows).toEqual([5, 10, 15]);
    expect(parseStaticLiteral("{nested: {a: true, b: null}, value: -1.25e2}").value).toEqual({
      nested: { a: true, b: null },
      value: -125,
    });
  });

  test("inline expressions, duplicate keys, spreads, extra props and unknown component props fail closed", () => {
    for (const literal of [
      "{kind: run()}",
      "{...value}",
      '{kind: "loop", kind: "led"}',
      "{get value() {}}",
      "{[key]: 1}",
    ])
      expect(() => parseStaticLiteral(literal)).toThrow();
    expect(() => extractInlineFigures("<CircuitDiagram figure={getFigure()} />")).toThrow();
    expect(() =>
      extractInlineFigures('<CircuitDiagram figure={{kind:"loop",caption:"x"}} targetable />'),
    ).toThrow();
    expect(() => extractInlineFigures('<Other figure={{kind:"loop",caption:"x"}} />')).toThrow();
  });

  test("import audit rejects changes and allows only the declared static pure dependency graph", () => {
    const source = "export const value = 1;";
    const files = new Map([["a.ts", source]]);
    expect(() => auditPureModules(files, { "a.ts": sha256(source) })).not.toThrow();
    expect(() => auditPureModules(files, { "a.ts": sha256("changed") })).toThrow("re-audit");
    for (const unsafe of [
      'import x from "node:fs"; export { x };',
      "export const value = process.env.SECRET;",
      'export const value = import("./a");',
    ]) {
      expect(() =>
        auditPureModules(new Map([["a.ts", unsafe]]), { "a.ts": sha256(unsafe) }),
      ).toThrow();
    }
    expect(resolvePureImport("a/b.ts", "./c", new Set(["a/c.ts"]))).toBe("a/c.ts");
    expect(() => resolvePureImport("a.ts", "../../private", new Set(["a.ts"]))).toThrow(
      "Unaudited",
    );
  });

  test("baseline mismatch never silently shrinks and custom complete counts are explicit", () => {
    expect(() => assertBaseline(BASELINE_COUNTS)).not.toThrow();
    expect(() =>
      assertBaseline({ ...BASELINE_COUNTS, total: { occurrences: 650, exact: 342 } }),
    ).toThrow("baseline drift");
    expect(() => assertBaseline({ ...BASELINE_COUNTS, practice: 211 })).toThrow("baseline drift");
    expect(() => assertBaseline({ total: 1 }, { total: 1 })).not.toThrow();
  });

  test("CLI requires explicit source and constrains output to the owned ignored artifact root", () => {
    expect(() => parseArgs([])).toThrow("--source is required");
    expect(() => parseArgs(["--source"])).toThrow("Missing value");
    expect(() => parseArgs(["--source", "x", "--source", "y"])).toThrow("Duplicate");
    expect(() => parseArgs(["--unknown"])).toThrow("Unknown");
    expect(parseArgs(["--source", "/explicit/source"]).source).toBe("/explicit/source");
    expect(validateOutputPath(join(output, "test"), "/synthetic-source")).toBe(
      join(output, "test"),
    );
    expect(() => validateOutputPath(join(root, "tests"), "/synthetic-source")).toThrow("--out");
    expect(() => validateOutputPath(output, join(output, "source"))).toThrow("overlaps");
  });

  test("import is reusable and does not auto-run CLI or emit output", () => {
    const child = spawnSync(
      process.execPath,
      [
        "--no-env-file",
        "--no-install",
        "-e",
        `const m = await import(${JSON.stringify(join(root, "scripts/extract-gradual.ts"))}); if (typeof m.extractCorpus !== "function") throw Error("missing helper");`,
      ],
      { cwd: root, encoding: "utf8" },
    );
    expect(child.status).toBe(0);
    expect(child.stdout).toBe("");
    expect(child.stderr).toBe("");
  });
});

describe("real Gradual corpus, not replaceable by fixtures", () => {
  let result: Awaited<ReturnType<typeof generateCorpus>>;
  let recorded: ReturnType<typeof extractCorpus> & {
    snapshot: ReturnType<typeof snapshotMetadata> & { metadata: string };
  };
  beforeAll(async () => {
    const raw = await readFile(join(output, "manifest.json"), "utf8").catch(() => {
      throw new Error(
        "Generate the real manifest first with --source /absolute/path/to/gradual. Real corpus tests are mandatory and never skipped.",
      );
    });
    recorded = JSON.parse(raw);
    result = await generateCorpus(recorded.source.sourceDir);
  });

  test("attested real revision, source bytes, closure and every planned baseline count match", () => {
    expect(result.input.revision).toBe(BASELINE_REVISION);
    expect(result.input.sourceHash).toBe(recorded.source.sourceHash);
    expect(result.manifest.counts).toEqual(BASELINE_COUNTS);
    expect(recorded.counts).toEqual(BASELINE_COUNTS);
    expect(
      result.manifest.scope.lessonIds.filter(
        (id) => !id.startsWith("hw.") && !id.startsWith("dc."),
      ),
    ).toEqual(["math.rearrange", "re.experiment", "re.observation"]);
    expect(result.manifest.hostFoundations).toHaveLength(10);
    expect(
      result.manifest.hostFoundations.every(
        (h) => h.diagram === "none" && h.rendered === "null" && h.compatible === false,
      ),
    ).toBe(true);
  });

  test("revision and same-count source-content drift fail without source mutation", async () => {
    await expect(
      generateCorpus(result.input.sourceDir, { expectedRevision: "0".repeat(40) }),
    ).rejects.toThrow("Source revision drift");
    await expect(
      generateCorpus(result.input.sourceDir, { expectedSourceHash: "0".repeat(64) }),
    ).rejects.toThrow("Source content drift");
    const changed = new Map(result.input.files);
    changed.set("course/graph/catalog.ts", `${changed.get("course/graph/catalog.ts")}\n`);
    expect(() => auditPureModules(changed)).toThrow("re-audit");
  });

  test("all stages, IDs, pairings, source hashes and source JSON/property paths are retained", () => {
    const manifest = result.manifest;
    expect(new Set(manifest.occurrences.map((o) => o.caseId)).size).toBe(652);
    expect(new Set(manifest.occurrences.map((o) => o.exactFigureId)).size).toBe(344);
    expect(new Set(manifest.questionSolutionPairs.map((p) => p.pairId)).size).toBe(
      manifest.questionSolutionPairs.length,
    );
    for (const occurrence of manifest.occurrences) {
      expect(occurrence.source.sourceHash).toBe(result.input.sourceHash);
      expect(occurrence.source.revision).toBe(BASELINE_REVISION);
      expect(occurrence.source.fileHash).toBe(
        sha256(result.input.files.get(occurrence.source.file) ?? ""),
      );
      expect(occurrence.source.propertyPath.startsWith("/")).toBe(true);
      expect(
        manifest.exactFigures.find((f) => f.id === occurrence.exactFigureId)?.occurrenceIds,
      ).toContain(occurrence.caseId);
      if (occurrence.stage === "solution") {
        expect(occurrence.context.solution).toBeDefined();
        expect(occurrence.context.question).toBeDefined();
        expect(
          manifest.questionSolutionPairs.find((p) => p.pairId === occurrence.pairId)
            ?.solutionCaseIds,
        ).toContain(occurrence.caseId);
      }
      if (occurrence.lessonId.startsWith("dc.") && occurrence.surface === "graph")
        expect(
          occurrence.source.derivationSites.some((s) =>
            s.file.startsWith("course/units/dc-circuit/"),
          ),
        ).toBe(true);
    }
    expect(manifest.coverageMatrix.stages.every((s) => s.occurrences > 0)).toBe(true);
    expect(manifest.families.some((f) => f.family === "positional")).toBe(false);
    expect(manifest.scope.excludedFigureSlots.some((f) => f.family === "positional")).toBe(true);
    expect(manifest.scope.exclusions.some((e) => e.reason === "draft-not-compatible")).toBe(true);
    expect(manifest.scope.exclusions.some((e) => e.reason === "planned-not-compatible")).toBe(true);
  });

  test("repeated materialization yields byte-identical manifests and semantic buckets do not merge exact figures", async () => {
    const second = await generateCorpus(result.input.sourceDir);
    expect(canonical(second.manifest)).toBe(canonical(result.manifest));
    expect(canonical(recorded.occurrences)).toBe(canonical(result.manifest.occurrences));
    const semantic = new Set(result.manifest.exactFigures.map((f) => f.semanticSignature));
    expect(semantic.size).toBeLessThan(344);
    expect(result.manifest.exactFigures.reduce((n, f) => n + f.occurrenceIds.length, 0)).toBe(652);
  });

  test("snapshot has complete local renderer imports, read-only verified bytes and local-only licensing", async () => {
    const metadata = snapshotMetadata(result.input);
    expect(metadata.distribution).toBe("local-only-not-bundled");
    expect(metadata.license).toContain("unknown");
    const { metadata: _metadataPath, ...savedMetadata } = recorded.snapshot;
    expect(metadata).toEqual(savedMetadata);
    const local = new Set(metadata.files.map((f) => f.path.slice("source/".length)));
    for (const item of metadata.imports)
      if (!item.external) expect(local.has(item.resolved)).toBe(true);
    for (const file of metadata.files) {
      const path = join(output, "snapshot", file.path);
      expect(sha256(await readFile(path))).toBe(file.sha256);
      expect((await lstat(path)).mode & 0o222).toBe(0);
      expect(file.path).not.toMatch(
        /(?:^|\/)(?:sessions|progress|uploads|node_modules|\.env)(?:\/|$)/,
      );
      expect(file.path).not.toContain("store.ts");
      expect(file.path).not.toBe("source/app/units/[unitId]/page.tsx");
    }
    expect(sha256(await readFile(join(output, "snapshot/inline-figures.json")))).toBe(
      sha256(`${canonical(result.input.inline)}\n`),
    );
  });

  test("artifact root is ignored and neither fixtures nor source answers enter published file allowlist", async () => {
    expect(
      execFileSync("git", ["check-ignore", "artifacts/gradual-corpus/manifest.json"], {
        cwd: root,
        encoding: "utf8",
      }).trim(),
    ).toBe("artifacts/gradual-corpus/manifest.json");
    const pkg = JSON.parse(await readFile(join(root, "package.json"), "utf8")) as {
      files: string[];
    };
    expect(
      pkg.files.some(
        (path) =>
          path.startsWith("artifacts") ||
          path.startsWith("tests") ||
          path.startsWith("scripts/extract-gradual"),
      ),
    ).toBe(false);
  });

  test("output symlink escape is rejected before creating nested directories", async () => {
    const testRoot = join(output, "safety-test");
    await mkdir(testRoot, { recursive: true });
    const target = join(testRoot, "target");
    await mkdir(target, { recursive: true });
    await symlink(target, join(testRoot, "alias"));
    try {
      await expect(writeCorpus(join(testRoot, "alias/forbidden"), result)).rejects.toThrow(
        "Symlink",
      );
      expect(await readdir(target)).toEqual([]);
    } finally {
      await rm(join(testRoot, "alias"));
      await rm(target, { recursive: true });
      await rm(testRoot, { recursive: true });
    }
  });

  test("regeneration writes identical bytes and does not mutate source or snapshot", async () => {
    const manifestPath = join(output, "manifest.json");
    const before = await readFile(manifestPath, "utf8");
    await writeCorpus(output, result);
    expect(await readFile(manifestPath, "utf8")).toBe(before);
    for (const file of result.input.sourceFiles)
      expect(sha256(await readFile(join(result.input.sourceDir, file.path)))).toBe(file.sha256);
  });
});
