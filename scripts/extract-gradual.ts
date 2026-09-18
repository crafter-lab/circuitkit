import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { chmod, lstat, mkdir, readFile, realpath, writeFile } from "node:fs/promises";
import { dirname, isAbsolute, join, relative, resolve } from "node:path";
import { runInNewContext } from "node:vm";

export type Json = null | boolean | number | string | Json[] | { [key: string]: Json };
type RecordValue = { [key: string]: Json };
export type Figure = RecordValue & { kind: string; caption: string };
export type Surface = "graph" | "academy" | "applications" | "inline";
export type Stage =
  | "lesson"
  | "point"
  | "example"
  | "question"
  | "solution"
  | "exam"
  | "unit-overview";

export const BASELINE_REVISION = "613085ba1cdbb61f058354546f47b515292b1db6";
export const BASELINE_SOURCE_HASH =
  "77db33ecda6679cb964610d6f2d9d9451ffa2165919b02b1505a33321d043357";
export type BaselineOptions = {
  expectedCounts?: unknown;
  expectedRevision?: string;
  expectedSourceHash?: string;
};
export const BASELINE_COUNTS = {
  lessons: 29,
  hardwareLessons: 20,
  dcLessons: 6,
  foundationLessons: 3,
  practice: 212,
  assessment: 12,
  graph: { occurrences: 408, exact: 338 },
  academy: { occurrences: 236, exact: 175 },
  applications: { occurrences: 6, exact: 5 },
  explicit: { occurrences: 650, exact: 342 },
  inline: { occurrences: 2, exact: 2 },
  total: { occurrences: 652, exact: 344 },
  hostFoundations: 10,
};

const PURE_MODULE_HASHES: Record<string, string> = {
  "course/graph/catalog.ts": "879a2d6397e381181f0364233a3aee0f4c1c40f131416a4ba0778b0eb8289420",
  "course/roadmaps.ts": "52e0ca6bfea8ed655643f961ea445cc18f6b2dca3f412e36dc66e866a9d290e7",
  "lib/learning/graph.ts": "9ea8d46177d7ab42703b395dc3e7e91c9f1b4048abf5c4908689bd044597bf54",
  "course/academy/catalog.ts": "fc570cf323d03043523d80f205f1674461433d150dbf7c82220e196ca230f782",
  "course/academy/revisions.ts": "2aa7540fbcd204ebc2fd8c72832f7cf6b16906e06bb24797f3edc48526819590",
  "lib/learning/pedagogy.ts": "69c423771bd8090620680549bfe6aa02fa8f21c86b78b072edb89dff523c3aeb",
  "lib/learning/applications.ts":
    "698683419c62458944a847ae43be892283fd2c17cc3c98491d03dab76c11b6e4",
  "course/units/dc-circuit/index.ts":
    "6a2b3e0c0f4d08679cac2484e0a5805b49a234fdf3b700fc94e68a24081f3eef",
  "course/units/dc-circuit/authoring.ts":
    "9d3cfaaed931b414ec1bea9a829a1ea47b9b65169aa62820b754fb5f43c7dd8c",
  "course/units/dc-circuit/feedback.ts":
    "a28bcc4b28d2f1f7a1eda50f8c71256081c91802307b0e84c01e45ad1304ff7a",
  "course/units/dc-circuit/investigation.ts":
    "6c260271e18bcaff5bb09d0cce71b399c35761b66bbda051b01e3c39da99bb70",
  "course/units/dc-circuit/lab.ts":
    "58f817150531815efd9edf80343fb305c966526d2046eedbef61d6323f7b2179",
  "course/units/dc-circuit/meter.ts":
    "0dd856c178a53acbaa4e7c8ccc8102d845faf7c4a83cb49838416d7e7dffd05c",
  "course/units/dc-circuit/ohm.ts":
    "3bcaa27606344fcc27a6fe0dce17caee08063f72dacf4019cd303d8a41081540",
  "course/units/dc-circuit/paths.ts":
    "edbd38dda9ef661c1a3c5aa88127e84709b0e15d7f5021e201ca7f44756a5321",
  "course/units/dc-circuit/series.ts":
    "7be3d894ca5ece3f3a475ba1bb9ba31024013bf231ac4b70c3489fb1e0376ca9",
  "course/units/dc-circuit/voltage.ts":
    "362236f83bb52439ff34c6b2e3e2cd9139f04eda01c21e33949ab8f62d30bfdf",
};
const DATA_FILES = [
  "course/graph/core.json",
  "course/graph/packages.json",
  "course/academy/courses.json",
];
const PAGE = "app/units/[unitId]/page.tsx";
const SNAPSHOT_FILES = [
  "lib/academy/types.ts",
  "lib/learning/types.ts",
  "components/academy/circuit-diagram.tsx",
  "components/academy/concept-diagram.tsx",
  "components/academy/foundation-diagram.tsx",
  "components/academy/supply-diagram.tsx",
  "components/academy/diagram.tsx",
  "components/academy/math-text.tsx",
  "components/academy/lesson-markdown.tsx",
  "components/ui/scroll-area.tsx",
  "components/ui/tooltip.tsx",
  "lib/utils.ts",
  "course/glossary.ts",
  "app/academy.css",
  "app/learning.css",
  "app/globals.css",
  "app/typeset.css",
];
const HOST_FILES = [
  "components/academy/skill-reading.tsx",
  "components/learning/workspace.tsx",
  "lib/learning/engine.ts",
] as const;
const FIGURE_KEYS = new Set(
  "kind caption signal timeline levels power bars scale readings board positional record voltmeter fragment supply upper lower open potentials potentialLabels bypass load current boardRows probes highlightNodes showNodes".split(
    " ",
  ),
);
export const FIGURE_KINDS =
  "loop divider breadboard potentials node-comparison fragment led supply pullup signal timeline levels power bars scale readings board positional record".split(
    " ",
  );

export function sha256(value: string | Uint8Array): string {
  return createHash("sha256").update(value).digest("hex");
}
export function canonical(value: unknown): string {
  if (value === null || typeof value === "string" || typeof value === "boolean")
    return JSON.stringify(value);
  if (typeof value === "number" && Number.isFinite(value)) return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  if (typeof value === "object" && value) {
    return `{${Object.entries(value)
      .filter(([, v]) => v !== undefined)
      .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
      .map(([k, v]) => `${JSON.stringify(k)}:${canonical(v)}`)
      .join(",")}}`;
  }
  throw new Error(`Non-JSON value: ${String(value)}`);
}
function object(value: Json | undefined, label: string): RecordValue {
  if (!value || Array.isArray(value) || typeof value !== "object")
    throw new Error(`Expected object: ${label}`);
  return value;
}
function array(value: Json | undefined, label: string): Json[] {
  if (!Array.isArray(value)) throw new Error(`Expected array: ${label}`);
  return value;
}
function text(value: Json | undefined, label: string): string {
  if (typeof value !== "string" || !value) throw new Error(`Expected string: ${label}`);
  return value;
}
function pointer(key: string | number): string {
  return String(key).replaceAll("~", "~0").replaceAll("/", "~1");
}
export function validateFigure(value: Json, path: string): Figure {
  const figure = object(value, path);
  if (!FIGURE_KINDS.includes(text(figure.kind, `${path}.kind`)))
    throw new Error(`Unrecognized populated figure: ${path} (${figure.kind})`);
  if (typeof figure.caption !== "string") throw new Error(`Missing figure caption: ${path}`);
  for (const key of Object.keys(figure))
    if (!FIGURE_KEYS.has(key)) throw new Error(`Unrecognized figure property: ${path}/${key}`);
  return figure as Figure;
}
export function figureSignatures(figure: Figure) {
  const { caption: _, ...withoutCaption } = figure;
  return {
    exactSignature: sha256(canonical(figure)),
    semanticSignature: sha256(canonical(withoutCaption)),
  };
}
export function walkFigureSlots(
  value: Json,
  visit: (figure: Figure, path: string) => void,
  path = "",
) {
  if (!value || typeof value !== "object") return;
  if (Array.isArray(value)) {
    value.forEach((item, index) => {
      walkFigureSlots(item, visit, `${path}/${index}`);
    });
    return;
  }
  for (const [key, item] of Object.entries(value)) {
    const next = `${path}/${pointer(key)}`;
    if (key === "figure") {
      if (item !== null && item !== undefined) visit(validateFigure(item, next), next);
    } else {
      if (key.toLowerCase().includes("figure") && item !== null && item !== undefined)
        throw new Error(`Unrecognized figure container: ${next}`);
      walkFigureSlots(item, visit, next);
    }
  }
}
export function prerequisiteClosure(graph: RecordValue, goalId: string): string[] {
  const nodes = array(graph.nodes, "nodes").map((n) => object(n, "node"));
  const ids = nodes.map((n) => text(n.id, "node.id"));
  if (new Set(ids).size !== ids.length) throw new Error("Duplicate graph node");
  const goal = array(graph.goals, "goals")
    .map((g) => object(g, "goal"))
    .find((g) => g.id === goalId);
  if (!goal) throw new Error(`Unknown goal: ${goalId}`);
  const edges = array(graph.edges, "edges").map((e) => object(e, "edge"));
  const active = new Set<string>();
  const seen = new Set<string>();
  function visit(id: string) {
    if (!ids.includes(id)) throw new Error(`Dangling prerequisite: ${id}`);
    if (active.has(id)) throw new Error(`Cyclic prerequisite: ${id}`);
    if (seen.has(id)) return;
    active.add(id);
    for (const edge of edges)
      if (edge.kind === "prerequisite" && edge.to === id) visit(text(edge.from, "edge.from"));
    active.delete(id);
    seen.add(id);
  }
  for (const id of array(goal.targets, "targets")) visit(text(id, "target"));
  return [...seen].sort();
}

export function resolvePureImport(
  importer: string,
  specifier: string,
  allowed: ReadonlySet<string>,
): string {
  const stem = specifier.startsWith("@/")
    ? specifier.slice(2)
    : specifier.startsWith(".")
      ? join(dirname(importer), specifier)
      : "";
  for (const candidate of [stem, `${stem}.ts`, `${stem}.tsx`, `${stem}/index.ts`])
    if (stem && allowed.has(candidate)) return candidate;
  throw new Error(`Unaudited import: ${importer} -> ${specifier}`);
}
export function auditPureModules(files: ReadonlyMap<string, string>, hashes = PURE_MODULE_HASHES) {
  const allowed = new Set([...Object.keys(hashes), ...DATA_FILES]);
  for (const [path, expected] of Object.entries(hashes)) {
    const source = files.get(path);
    if (!source || sha256(source) !== expected)
      throw new Error(`Pure module needs re-audit: ${path}`);
    const scan = new Bun.Transpiler({ loader: "ts" }).scan(source);
    for (const dependency of scan.imports) {
      if (dependency.kind !== "import-statement") throw new Error(`Non-static import: ${path}`);
      resolvePureImport(path, dependency.path, allowed);
    }
    if (
      /\b(?:process\s*\.|Bun\s*\.|fetch\s*\(|require\s*\(|import\s*\(|eval\s*\(|new\s+Function\b|globalThis\s*\.)/.test(
        source,
      )
    )
      throw new Error(`Impure module: ${path}`);
  }
}
export async function materialize(files: ReadonlyMap<string, string>): Promise<RecordValue> {
  auditPureModules(files);
  const allowed = new Set([...Object.keys(PURE_MODULE_HASHES), ...DATA_FILES]);
  const entry = [
    'export { knowledgeGraph } from "./course/graph/catalog.ts";',
    'export { courses } from "./course/academy/catalog.ts";',
    'export { applicationCases } from "./lib/learning/applications.ts";',
    'export { courseCatalog, learningUnits } from "./course/roadmaps.ts";',
  ].join("\n");
  const result = await Bun.build({
    entrypoints: ["entry.ts"],
    target: "browser",
    format: "cjs",
    plugins: [
      {
        name: "audited-memory-only",
        setup(build) {
          build.onResolve({ filter: /.*/ }, (args) => {
            const path =
              args.path === "entry.ts"
                ? "entry.ts"
                : resolvePureImport(args.importer || "entry.ts", args.path, allowed);
            return { path, namespace: "audited" };
          });
          build.onLoad({ filter: /.*/, namespace: "audited" }, (args) => {
            const contents = args.path === "entry.ts" ? entry : files.get(args.path);
            if (contents === undefined) throw new Error(`Missing audited module: ${args.path}`);
            return { contents, loader: args.path.endsWith(".json") ? "json" : "ts" };
          });
        },
      },
    ],
  });
  const [output] = result.outputs;
  if (!result.success || result.outputs.length !== 1 || !output)
    throw new Error(`Memory compilation failed: ${result.logs.join("\n")}`);
  const code = await output.text();
  const serialized = runInNewContext(
    `const module = { exports: {} }; const exports = module.exports;\n${code}\nJSON.stringify(module.exports);`,
    { URL },
    { timeout: 5000, contextCodeGeneration: { strings: false, wasm: false } },
  );
  return object(JSON.parse(serialized), "materialized catalog");
}

export type SourceFile = { path: string; sha256: string; bytes: number; role: string };
export type Provenance = {
  sourceDir: string;
  revision: string;
  sourceHash: string;
  file: string;
  fileHash: string;
  propertyPath: string;
  authoredAt: { file: string; fileHash: string; propertyPath: string }[];
  derivationSites: { file: string; fileHash: string; propertyPath: string }[];
};
export type Occurrence = {
  caseId: string;
  surface: Surface;
  stage: Stage;
  bank: string | null;
  lessonId: string;
  pointId: string | null;
  courseId: string;
  applicationId: string | null;
  sourceQuestionId: string | null;
  sourceSolutionId: string | null;
  pairId: string | null;
  exactFigureId: string;
  exactSignature: string;
  semanticSignature: string;
  family: string;
  context: RecordValue;
  source: Provenance;
};
type Root = {
  value: RecordValue;
  surface: Surface;
  lessonId: string;
  courseId: string;
  applicationId?: string;
  readingPointIds?: string[];
  file: string;
  propertyPath: string;
};
export type CorpusInput = {
  catalog: RecordValue;
  files: ReadonlyMap<string, string>;
  sourceDir: string;
  revision: string;
  sourceHash: string;
  sourceFiles: SourceFile[];
  inline: { figure: Figure; propertyPath: string; context: RecordValue }[];
};
function atPath(value: Json, path: string): Json {
  let current = value;
  for (const part of path.split("/").slice(1)) {
    const key = part.replaceAll("~1", "/").replaceAll("~0", "~");
    const next: Json | undefined = Array.isArray(current)
      ? current[Number(key)]
      : object(current, path)[key];
    if (next === undefined) throw new Error(`Unresolved property path: ${path}`);
    current = next;
  }
  return current;
}
function contextFields(value: RecordValue): RecordValue {
  const result: RecordValue = {};
  for (const key of [
    "id",
    "title",
    "body",
    "rule",
    "prompt",
    "steps",
    "choices",
    "answer",
    "unit",
    "tolerance",
    "explanation",
    "presentation",
    "check",
    "context",
    "reason",
  ])
    if (value[key] !== undefined) result[key] = value[key];
  return result;
}
function slotDetails(root: Root, path: string) {
  let stage: Stage;
  let bank: string | null = null;
  let exercise: RecordValue | null = null;
  let point: RecordValue | null = null;
  let pointId: string | null = null;
  let identity = path;
  const pointMatch = path.match(/^\/(points|reading)\/(\d+)\//);
  if (pointMatch) {
    point = object(atPath(root.value, `/${pointMatch[1]}/${pointMatch[2]}`), "point");
    pointId =
      typeof point.id === "string"
        ? point.id
        : (root.readingPointIds?.[Number(pointMatch[2])] ??
          `${root.lessonId}.reading:${sha256(text(point.title, "reading.title")).slice(0, 16)}`);
    identity = identity.replace(
      `/${pointMatch[1]}/${pointMatch[2]}`,
      `/${pointMatch[1]}/${pointId}`,
    );
  }
  const match = path.match(
    /^(\/content)?\/(exercises|assessment)\/(\d+)\/(figure|solution\/figure)$/,
  );
  if (match) {
    bank = match[2] === "assessment" ? "assessment" : "practice";
    exercise = object(atPath(root.value, `${match[1] ?? ""}/${match[2]}/${match[3]}`), "exercise");
    identity = identity.replace(
      `/${match[2]}/${match[3]}`,
      `/${match[2]}/${text(exercise.id, "exercise.id")}`,
    );
    stage =
      match[4] === "solution/figure" ? "solution" : bank === "assessment" ? "exam" : "question";
  } else if (
    root.surface === "applications" &&
    /^\/exercise\/(figure|solution\/figure)$/.test(path)
  ) {
    exercise = object(root.value.exercise, "application exercise");
    identity = identity.replace("/exercise/", `/exercise/${text(exercise.id, "exercise.id")}/`);
    bank = "application";
    stage = path.includes("/solution/") ? "solution" : "question";
  } else if (/^(\/content)?\/figure$/.test(path)) stage = "lesson";
  else if (/^\/(points|reading)\/\d+\/figure$/.test(path)) stage = "point";
  else if (/^(\/content|\/(points|reading)\/\d+)?\/example\/figure$/.test(path)) stage = "example";
  else
    throw new Error(`Unrecognized populated figure slot: ${root.surface}:${root.lessonId}${path}`);
  if (exercise && root.surface === "graph") {
    const owner = array(root.value.points ?? [], "points")
      .map((p) => object(p, "point"))
      .find((p) => array(p.exerciseIds, "exerciseIds").includes(exercise?.id ?? null));
    if (owner) {
      point = owner;
      pointId = text(owner.id, "point.id");
    }
  }
  const sourceQuestionId = exercise ? text(exercise.id, "exercise.id") : null;
  const pairId = sourceQuestionId
    ? `${root.surface}:${root.applicationId ?? root.lessonId}:${bank}:${sourceQuestionId}`
    : null;
  const lesson = root.surface === "graph" ? object(root.value.content, "content") : root.value;
  const context: RecordValue = { lesson: contextFields(lesson) };
  if (point) context.point = contextFields(point);
  if (exercise) {
    context.question = contextFields(exercise);
    if (exercise.solution) context.solution = contextFields(object(exercise.solution, "solution"));
  }
  if (stage === "example")
    context.example = contextFields(object(atPath(root.value, path.slice(0, -7)), "example"));
  return {
    stage,
    bank,
    pointId,
    sourceQuestionId,
    sourceSolutionId: exercise?.solution ? `${sourceQuestionId}/solution` : null,
    pairId,
    context,
    identity,
  };
}

export function extractCorpus(input: CorpusInput) {
  const { catalog, files } = input;
  const graph = object(catalog.knowledgeGraph, "knowledgeGraph");
  const closure = prerequisiteClosure(graph, "hardware");
  const roots: Root[] = [];
  const exclusions: RecordValue[] = [];
  const graphNodes = array(graph.nodes, "nodes").map((n) => object(n, "node"));
  const core = object(JSON.parse(files.get("course/graph/core.json") ?? '{"nodes":[]}'), "core");
  const coreNodes = array(core.nodes, "core.nodes").map((n) => object(n, "core.node"));
  graphNodes.forEach((node, index) => {
    const id = text(node.id, "node.id");
    if (!closure.includes(id)) {
      const kinds = new Set<string>();
      walkFigureSlots(node, (figure) => kinds.add(figure.kind));
      exclusions.push({
        surface: "graph",
        id,
        status: node.status ?? null,
        reason:
          node.status === "draft"
            ? "draft-not-compatible"
            : "outside-hardware-prerequisite-closure",
        families: [...kinds].sort(),
      });
      return;
    }
    if (node.status !== "published") throw new Error(`Unpublished closure node: ${id}`);
    roots.push({
      value: node,
      surface: "graph",
      lessonId: id,
      courseId: "hardware",
      file: "course/graph/catalog.ts",
      propertyPath: `/knowledgeGraph/nodes/${index}`,
    });
  });
  array(catalog.courses, "courses").forEach((c, ci) => {
    const course = object(c, "course");
    array(course.topics, "topics").forEach((t, ti) => {
      array(object(t, "topic").skills, "skills").forEach((s, si) => {
        const skill = object(s, "skill");
        const id = text(skill.id, "skill.id");
        if (!closure.includes(id)) return;
        roots.push({
          value: skill,
          surface: "academy",
          lessonId: id,
          courseId: text(course.id, "course.id"),
          readingPointIds: array(
            coreNodes.find((node) => node.id === id)?.points ?? [],
            "core.points",
          ).map((p) => text(object(p, "point").id, "point.id")),
          file: "course/academy/catalog.ts",
          propertyPath: `/courses/${ci}/topics/${ti}/skills/${si}`,
        });
      });
    });
  });
  array(catalog.applicationCases, "applications").forEach((a, ai) => {
    const application = object(a, "application");
    if (application.goalId !== "hardware") return;
    array(application.steps, "steps").forEach((s, si) => {
      const step = object(s, "step");
      const id = text(step.nodeId, "step.nodeId");
      if (!closure.includes(id)) throw new Error(`Application outside closure: ${id}`);
      roots.push({
        value: {
          ...step,
          context: application.context ?? null,
          reason: application.reason ?? null,
          title: application.title ?? null,
        },
        surface: "applications",
        lessonId: id,
        courseId: "hardware",
        applicationId: text(application.id, "application.id"),
        file: "lib/learning/applications.ts",
        propertyPath: `/applicationCases/${ai}/steps/${si}`,
      });
    });
  });
  for (const c of array(catalog.courseCatalog, "courseCatalog")) {
    const course = object(c, "planned course");
    if (course.status === "planned")
      exclusions.push({
        surface: "roadmap",
        id: text(course.id, "planned course.id"),
        title: text(course.title, "planned course.title"),
        status: "planned",
        reason: "planned-not-compatible",
      });
  }
  const authored = new Map<string, Provenance["authoredAt"]>();
  for (const file of DATA_FILES) {
    const raw = files.get(file);
    if (!raw) continue;
    walkFigureSlots(JSON.parse(raw), (figure, propertyPath) => {
      const signature = figureSignatures(figure).exactSignature;
      const matches = authored.get(signature) ?? [];
      matches.push({ file, fileHash: sha256(raw), propertyPath });
      authored.set(signature, matches);
    });
  }
  function provenance(file: string, propertyPath: string, figure?: Figure): Provenance {
    const raw = files.get(file);
    if (raw === undefined) throw new Error(`Missing provenance file: ${file}`);
    const derivationSites: Provenance["derivationSites"] = [];
    const site = (path: string, property: string) => {
      const contents = files.get(path);
      if (contents !== undefined)
        derivationSites.push({ file: path, fileHash: sha256(contents), propertyPath: property });
    };
    const root = roots.find(
      (r) => r.file === file && propertyPath.startsWith(`${r.propertyPath}/`),
    );
    if (root) {
      const coreIndex = coreNodes.findIndex((n) => n.id === root.lessonId);
      if (coreIndex >= 0)
        site(
          "course/graph/core.json",
          `/nodes/${coreIndex}${root.surface === "graph" ? propertyPath.slice(root.propertyPath.length) : ""}`,
        );
      if (root.surface === "graph" && root.lessonId.startsWith("dc.")) {
        const name = root.lessonId.slice(3);
        site(
          `course/units/dc-circuit/${name}.ts`,
          `/${name}${propertyPath.slice(root.propertyPath.length)}`,
        );
        site("course/units/dc-circuit/authoring.ts", "/lesson");
        site("course/units/dc-circuit/feedback.ts", "/exerciseNotes");
      }
      if (root.surface === "graph") {
        const packages = JSON.parse(files.get("course/graph/packages.json") ?? "[]") as Json[];
        packages.forEach((p, pi) => {
          array(object(p, "package").nodes, "package.nodes").forEach((n, ni) => {
            if (object(n, "node").id === root.lessonId)
              site(
                "course/graph/packages.json",
                `/${pi}/nodes/${ni}${propertyPath.slice(root.propertyPath.length)}`,
              );
          });
        });
      }
      if (root.surface === "academy") {
        site("course/academy/courses.json", root.propertyPath.slice("/courses".length));
        site("course/academy/revisions.ts", "/reviseAcademy");
      }
    }
    return {
      sourceDir: input.sourceDir,
      revision: input.revision,
      sourceHash: input.sourceHash,
      file,
      fileHash: sha256(raw),
      propertyPath,
      authoredAt: figure ? (authored.get(figureSignatures(figure).exactSignature) ?? []) : [],
      derivationSites,
    };
  }
  const excludedFigureSlots: RecordValue[] = [];
  walkFigureSlots(catalog, (figure, path) => {
    if (roots.some((root) => path.startsWith(`${root.propertyPath}/`))) return;
    const graphMatch = path.match(/^\/knowledgeGraph\/nodes\/(\d+)\//);
    const academyMatch = path.match(/^\/courses\/\d+\/topics\/\d+\/skills\/\d+\//);
    const applicationMatch = path.match(/^\/applicationCases\/\d+\/steps\/\d+\//);
    const file = graphMatch
      ? "course/graph/catalog.ts"
      : academyMatch
        ? "course/academy/catalog.ts"
        : applicationMatch
          ? "lib/learning/applications.ts"
          : null;
    if (!file) throw new Error(`Unrecognized populated figure outside classified roots: ${path}`);
    excludedFigureSlots.push({
      propertyPath: path,
      family: figure.kind,
      ...figureSignatures(figure),
      compatible: false,
      reason:
        graphMatch && object(graphNodes[Number(graphMatch[1])], path).status === "draft"
          ? "draft-not-compatible"
          : "outside-hardware-prerequisite-closure",
      source: provenance(file, path, figure) as unknown as Json,
    });
  });
  const occurrences: Occurrence[] = [];
  const exactFigures = new Map<
    string,
    {
      id: string;
      exactSignature: string;
      semanticSignature: string;
      family: string;
      figure: Figure;
      occurrenceIds: string[];
    }
  >();
  const hostFoundations: RecordValue[] = [];
  const pairs: RecordValue[] = [];
  const pairIds = new Set<string>();
  const ids = new Set<string>();
  function add(
    figure: Figure,
    occurrence: Omit<
      Occurrence,
      "exactFigureId" | "exactSignature" | "semanticSignature" | "family"
    >,
  ) {
    if (ids.has(occurrence.caseId))
      throw new Error(`Duplicate occurrence identity: ${occurrence.caseId}`);
    ids.add(occurrence.caseId);
    const signatures = figureSignatures(figure);
    const id = `figure:${signatures.exactSignature}`;
    const entry = exactFigures.get(id) ?? {
      id,
      ...signatures,
      family: figure.kind,
      figure,
      occurrenceIds: [],
    };
    entry.occurrenceIds.push(occurrence.caseId);
    exactFigures.set(id, entry);
    occurrences.push({ ...occurrence, ...signatures, family: figure.kind, exactFigureId: id });
  }
  for (const root of roots) {
    walkFigureSlots(root.value, (figure, path) => {
      const { identity, ...details } = slotDetails(root, path);
      add(figure, {
        ...details,
        caseId: `${root.surface}:${root.applicationId ?? root.lessonId}:${identity}`,
        surface: root.surface,
        lessonId: root.lessonId,
        courseId: root.courseId,
        applicationId: root.applicationId ?? null,
        source: provenance(root.file, `${root.propertyPath}${path}`, figure),
      });
    });
    const lesson = root.surface === "graph" ? object(root.value.content, "content") : root.value;
    const hostSlots: { value: RecordValue; path: string; id: string }[] = [];
    if (root.surface === "graph") {
      if (root.value.points)
        array(root.value.points, "points").forEach((p, index) => {
          const point = object(p, "point");
          if (!(point.figure ?? lesson.figure))
            hostSlots.push({
              value: point,
              path: `/points/${index}`,
              id: text(point.id, "point.id"),
            });
        });
      else if (!lesson.figure)
        hostSlots.push({ value: lesson, path: "/content", id: root.lessonId });
    } else if (root.surface === "academy") {
      const first = root.value.reading
        ? object(array(root.value.reading, "reading")[0], "first reading")
        : lesson;
      if (!first.figure)
        hostSlots.push({
          value: first,
          path: root.value.reading ? "/reading/0" : "",
          id: root.lessonId,
        });
    }
    for (const host of hostSlots) {
      const kind = text(lesson.diagram, "diagram");
      hostFoundations.push({
        caseId: `${root.surface}:${host.id}:host-foundation`,
        surface: root.surface,
        lessonId: root.lessonId,
        pointId: host.id,
        stage: host.path.startsWith("/points/") ? "point" : "lesson",
        diagram: kind,
        rendered: kind === "none" ? "null" : "host-composition",
        compatible: false,
        renderer: "components/academy/diagram.tsx#LearningDiagram",
        caller: root.surface === "graph" ? HOST_FILES[1] : HOST_FILES[0],
        composition:
          root.surface === "graph"
            ? "point.figure ?? content.figure; LearningDiagram if absent"
            : "first reading.figure; LearningDiagram if absent",
        context: contextFields(host.value),
        source: provenance(root.file, `${root.propertyPath}${host.path}`) as unknown as Json,
      });
    }
    const banks: [string, Json[]][] =
      root.surface === "applications"
        ? [["application", [object(root.value.exercise, "application exercise")]]]
        : [
            ["practice", array(lesson.exercises, "exercises")],
            ["assessment", root.value.assessment ? array(root.value.assessment, "assessment") : []],
          ];
    for (const [bank, exercises] of banks)
      for (const q of exercises) {
        const question = object(q, "question");
        const sourceQuestionId = text(question.id, "question.id");
        const pairId = `${root.surface}:${root.applicationId ?? root.lessonId}:${bank}:${sourceQuestionId}`;
        if (pairIds.has(pairId)) throw new Error(`Duplicate question/solution pair: ${pairId}`);
        pairIds.add(pairId);
        const index = exercises.indexOf(q);
        const questionPath =
          bank === "application"
            ? "/exercise"
            : bank === "assessment"
              ? `/assessment/${index}`
              : `${root.surface === "graph" ? "/content" : ""}/exercises/${index}`;
        pairs.push({
          pairId,
          surface: root.surface,
          lessonId: root.lessonId,
          bank,
          sourceQuestionId,
          sourceSolutionId: question.solution ? `${sourceQuestionId}/solution` : null,
          sourceSolutionIdKind: "derived-property-id",
          source: provenance(root.file, `${root.propertyPath}${questionPath}`) as unknown as Json,
          questionPropertyPath: `${root.propertyPath}${questionPath}`,
          solutionPropertyPath: question.solution
            ? `${root.propertyPath}${questionPath}/solution`
            : null,
          questionCaseIds: occurrences
            .filter((o) => o.pairId === pairId && o.stage !== "solution")
            .map((o) => o.caseId),
          solutionCaseIds: occurrences
            .filter((o) => o.pairId === pairId && o.stage === "solution")
            .map((o) => o.caseId),
          question: contextFields(question),
          solution: question.solution ? contextFields(object(question.solution, "solution")) : null,
        });
      }
  }
  input.inline.forEach(({ figure, propertyPath, context }, index) => {
    add(figure, {
      caseId: `inline:dc-circuit:${index === 0 ? "hero" : "lab"}`,
      surface: "inline",
      stage: "unit-overview",
      bank: null,
      lessonId: "dc-circuit",
      pointId: null,
      courseId: "hardware",
      applicationId: null,
      sourceQuestionId: null,
      sourceSolutionId: null,
      pairId: null,
      context,
      source: provenance(PAGE, propertyPath, figure),
    });
  });
  occurrences.sort((a, b) => (a.caseId < b.caseId ? -1 : 1));
  for (const entry of exactFigures.values()) entry.occurrenceIds.sort();
  const tally = (items: Occurrence[]) => ({
    occurrences: items.length,
    exact: new Set(items.map((o) => o.exactSignature)).size,
  });
  const counts = {
    lessons: closure.length,
    hardwareLessons: closure.filter((id) => id.startsWith("hw.")).length,
    dcLessons: closure.filter((id) => id.startsWith("dc.")).length,
    foundationLessons: closure.filter((id) => !id.startsWith("hw.") && !id.startsWith("dc."))
      .length,
    practice: pairs.filter((p) => p.surface === "graph" && p.bank === "practice").length,
    assessment: pairs.filter((p) => p.surface === "graph" && p.bank === "assessment").length,
    graph: tally(occurrences.filter((o) => o.surface === "graph")),
    academy: tally(occurrences.filter((o) => o.surface === "academy")),
    applications: tally(occurrences.filter((o) => o.surface === "applications")),
    explicit: tally(occurrences.filter((o) => o.surface !== "inline")),
    inline: tally(occurrences.filter((o) => o.surface === "inline")),
    total: tally(occurrences),
    hostFoundations: hostFoundations.length,
  };
  const families = [...new Set(occurrences.map((o) => o.family))].sort().map((family) => {
    const members = occurrences.filter((o) => o.family === family);
    return {
      family,
      ...tally(members),
      semantic: new Set(members.map((o) => o.semanticSignature)).size,
      occurrenceIds: members.map((o) => o.caseId),
      exactFigureIds: [...new Set(members.map((o) => o.exactFigureId))].sort(),
    };
  });
  return {
    schemaVersion: 1,
    source: {
      sourceDir: input.sourceDir,
      revision: input.revision,
      sourceHash: input.sourceHash,
      files: input.sourceFiles,
    },
    scope: { goalId: "hardware", lessonIds: closure, exclusions, excludedFigureSlots },
    coverageMatrix: {
      surfaces: ["graph", "academy", "applications", "inline"].map((surface) => ({
        surface,
        ...tally(occurrences.filter((o) => o.surface === surface)),
      })),
      stages: ["lesson", "point", "example", "question", "solution", "exam", "unit-overview"].map(
        (stage) => ({ stage, ...tally(occurrences.filter((o) => o.stage === stage)) }),
      ),
      lessons: closure.map((lessonId) => ({
        lessonId,
        ...tally(occurrences.filter((o) => o.lessonId === lessonId)),
        occurrenceIds: occurrences.filter((o) => o.lessonId === lessonId).map((o) => o.caseId),
      })),
    },
    signaturePolicy: {
      exact:
        "SHA-256 of recursive key-sorted JSON, including caption; array order retained; undefined object fields omitted",
      semantic:
        "SHA-256 of the same figure with only top-level caption omitted; not electrical equivalence; never used to merge",
      occurrence:
        "surface + source lesson/application ID + ID-based slot path; separate from exactFigureId",
    },
    counts,
    occurrences,
    exactFigures: [...exactFigures.values()].sort((a, b) => (a.id < b.id ? -1 : 1)),
    families,
    hostFoundations,
    questionSolutionPairs: pairs.sort((a, b) => (String(a.pairId) < String(b.pairId) ? -1 : 1)),
  };
}

export function parseStaticLiteral(source: string, start = 0): { value: Json; end: number } {
  let cursor = start;
  function space() {
    while (/\s/.test(source[cursor] ?? "") && cursor < source.length) cursor++;
  }
  function string(): string {
    const begin = cursor++;
    while (cursor < source.length) {
      if (source[cursor] === "\\") cursor += 2;
      else if (source[cursor++] === '"') return JSON.parse(source.slice(begin, cursor));
    }
    throw new Error("Unterminated literal string");
  }
  function value(): Json {
    space();
    if (source[cursor] === '"') return string();
    const open = source[cursor];
    if (open === "{" || open === "[") {
      cursor++;
      const close = open === "{" ? "}" : "]";
      const result: RecordValue | Json[] = open === "{" ? Object.create(null) : [];
      space();
      while (source[cursor] !== close) {
        if (Array.isArray(result)) result.push(value());
        else {
          space();
          let key: string;
          if (source[cursor] === '"') key = string();
          else {
            const match = source.slice(cursor).match(/^[A-Za-z_$][\w$]*/);
            if (!match) throw new Error("Only literal property keys are supported");
            key = match[0];
            cursor += key.length;
          }
          if (Object.hasOwn(result, key)) throw new Error(`Duplicate literal property: ${key}`);
          space();
          if (source[cursor++] !== ":")
            throw new Error("Only static property values are supported");
          result[key] = value();
        }
        space();
        if (source[cursor] === close) break;
        if (source[cursor++] !== ",")
          throw new Error("Executable or malformed inline figure literal");
        space();
      }
      cursor++;
      return result;
    }
    const token = source
      .slice(cursor)
      .match(/^(?:true\b|false\b|null\b|-?(?:0|[1-9]\d*)(?:\.\d+)?(?:[eE][+-]?\d+)?)/)?.[0];
    if (!token) throw new Error("Executable or malformed inline figure literal");
    cursor += token.length;
    return JSON.parse(token);
  }
  const parsed = value();
  return { value: parsed, end: cursor };
}
export function extractInlineFigures(source: string): CorpusInput["inline"] {
  const matches = [...source.matchAll(/<CircuitDiagram\s+figure=\{/g)];
  const componentCount = [...source.matchAll(/<CircuitDiagram\b/g)].length;
  const figureCount = [...source.matchAll(/\bfigure\s*=/g)].length;
  if (matches.length !== componentCount || matches.length !== figureCount)
    throw new Error("Unrecognized populated inline figure slot");
  return matches.map((match, index) => {
    const literal = parseStaticLiteral(source, match.index + match[0].length);
    if (!/^\s*}\s*\/>/.test(source.slice(literal.end)))
      throw new Error("Unrecognized inline figure expression or props");
    const figure = validateFigure(literal.value, `${PAGE}#${index}`);
    const line = source.slice(0, match.index).split("\n").length;
    return {
      figure,
      propertyPath: `/UnitPage/JSX/CircuitDiagram/${index}/props/figure`,
      context: {
        line,
        host: index === 0 ? "dc-unit-hero" : "dc-unit-lab",
        unitId: "dc-circuit",
        caption: figure.caption,
      },
    };
  });
}
export function assertBaseline(actual: unknown, expected: unknown = BASELINE_COUNTS) {
  if (canonical(actual) !== canonical(expected))
    throw new Error(
      `Corpus baseline drift. Expected ${canonical(expected)}; observed ${canonical(actual)}. Review source and explicitly configure a complete new baseline; never silently shrink.`,
    );
}
async function readWithin(root: string, path: string): Promise<string> {
  if (isAbsolute(path) || path.split("/").includes(".."))
    throw new Error(`Unsafe source path: ${path}`);
  const target = join(root, path);
  if ((await realpath(target)) !== target || !(await lstat(target)).isFile())
    throw new Error(`Symlink or non-file source: ${path}`);
  return readFile(target, "utf8");
}
function git(source: string, args: string[]): string {
  return execFileSync("git", ["--no-optional-locks", "-C", source, ...args], {
    encoding: "utf8",
  }).trim();
}
export async function loadGradual(
  source: string,
  expectedRevision = BASELINE_REVISION,
): Promise<CorpusInput> {
  if (!source) throw new Error("--source requires an explicit Gradual checkout path");
  const sourceDir = await realpath(resolve(source));
  const revision = git(sourceDir, ["rev-parse", "HEAD"]);
  if (revision !== expectedRevision)
    throw new Error(`Source revision drift: expected ${expectedRevision}, received ${revision}`);
  const files = new Map<string, string>();
  const roles = new Map<string, string>([
    ...Object.keys(PURE_MODULE_HASHES).map((p): [string, string] => [p, "audited-pure-module"]),
    ...DATA_FILES.map((p): [string, string] => [p, "authored-catalog"]),
    ...SNAPSHOT_FILES.map((p): [string, string] => [p, "renderer-style-dependency"]),
    ...HOST_FILES.map((p): [string, string] => [p, "host-evidence-not-executed"]),
    [PAGE, "inline-evidence-not-executed"],
    ["app/layout.tsx", "style-host-evidence-not-executed"],
    ["AGENTS.md", "instructions"],
    ["package.json", "dependency-metadata"],
  ]);
  for (const path of [...roles.keys()].sort()) files.set(path, await readWithin(sourceDir, path));
  const sourceFiles = [...files].map(([path, contents]) => ({
    path,
    sha256: sha256(contents),
    bytes: Buffer.byteLength(contents),
    role: roles.get(path) ?? "unknown",
  }));
  const sourceHash = sha256(
    canonical(sourceFiles.map(({ path, sha256: hash }) => ({ path, sha256: hash }))),
  );
  const catalog = await materialize(files);
  for (const { path, sha256: hash } of sourceFiles)
    if (sha256(await readWithin(sourceDir, path)) !== hash)
      throw new Error(`Source changed during extraction: ${path}`);
  if (git(sourceDir, ["rev-parse", "HEAD"]) !== revision)
    throw new Error("Source revision changed during extraction");
  return {
    sourceDir,
    revision,
    sourceHash,
    sourceFiles,
    files,
    catalog,
    inline: extractInlineFigures(files.get(PAGE) ?? ""),
  };
}
export async function generateCorpus(source: string, options: BaselineOptions = {}) {
  const input = await loadGradual(source, options.expectedRevision);
  const expectedHash = options.expectedSourceHash ?? BASELINE_SOURCE_HASH;
  if (input.sourceHash !== expectedHash)
    throw new Error(
      `Source content drift: expected ${expectedHash}, observed ${input.sourceHash}. Re-audit before configuring a new baseline.`,
    );
  const manifest = extractCorpus(input);
  assertBaseline(manifest.counts, options.expectedCounts ?? BASELINE_COUNTS);
  return { input, manifest };
}
export function snapshotMetadata(input: CorpusInput) {
  const paths = [
    ...new Set([...Object.keys(PURE_MODULE_HASHES), ...DATA_FILES, ...SNAPSHOT_FILES]),
  ].sort();
  const allowed = new Set(paths);
  const externalAllowed = new Set([
    "react",
    "next/link",
    "react-markdown",
    "rehype-katex",
    "remark-gfm",
    "remark-math",
    "@base-ui/react/scroll-area",
    "@base-ui/react/tooltip",
    "clsx",
    "tailwind-merge",
  ]);
  const imports: { file: string; specifier: string; resolved: string; external: boolean }[] = [];
  for (const path of paths) {
    const source = input.files.get(path);
    if (source === undefined) throw new Error(`Missing snapshot dependency: ${path}`);
    if (!/\.tsx?$/.test(path)) continue;
    const scan = new Bun.Transpiler({ loader: path.endsWith(".tsx") ? "tsx" : "ts" }).scan(source);
    for (const dependency of scan.imports) {
      if (dependency.kind !== "import-statement")
        throw new Error(`Non-static snapshot import: ${path}`);
      const external = externalAllowed.has(dependency.path);
      const resolved = external
        ? dependency.path
        : resolvePureImport(path, dependency.path, allowed);
      imports.push({ file: path, specifier: dependency.path, resolved, external });
    }
  }
  const pkg = object(JSON.parse(input.files.get("package.json") ?? "{}"), "package");
  const declared = {
    ...object(pkg.dependencies, "dependencies"),
    ...object(pkg.devDependencies, "devDependencies"),
  };
  const dependencies: RecordValue = {};
  for (const name of [
    "react",
    "react-dom",
    "next",
    "@base-ui/react",
    "react-markdown",
    "rehype-katex",
    "remark-gfm",
    "remark-math",
    "clsx",
    "tailwind-merge",
    "katex",
    "geist",
    "tailwindcss",
    "@tailwindcss/postcss",
    "tw-animate-css",
    "shadcn",
  ]) {
    dependencies[name] = text(declared[name], `dependency ${name}`);
  }
  return {
    access: "read-only",
    distribution: "local-only-not-bundled",
    license: "unknown; no redistribution permission established",
    rendererEntry: "source/components/academy/circuit-diagram.tsx#CircuitDiagram",
    foundationEntry: "source/components/academy/diagram.tsx#LearningDiagram",
    sourceAlias: "@/ -> snapshot/source/",
    sourceRevision: input.revision,
    sourceHash: input.sourceHash,
    dependencies,
    dependencyVersions: "declared source ranges, not resolved or installed by extractor",
    imports,
    galleryHost: {
      provider: "components/ui/tooltip.tsx#TooltipProvider",
      classes: "academy knowledge-app",
      dataCourse: "hardware",
      themes: ["light", "dark"],
      themeAttribute: "data-theme",
      fonts: ["geist/font/sans#GeistSans", "geist/font/mono#GeistMono"],
      styles: [
        "katex/dist/katex.min.css",
        "source/app/globals.css",
        "source/app/academy.css",
        "source/app/learning.css",
      ],
      cssImports: ["tailwindcss", "./typeset.css", "tw-animate-css", "shadcn/tailwind.css"],
      layoutEvidence: "app/layout.tsx",
      rendering: "SSR and original screenshots deferred; no render equivalence asserted",
    },
    files: paths.map((path) => ({
      path: `source/${path}`,
      sha256: sha256(input.files.get(path) ?? ""),
      mode: "0444",
    })),
    exclusions: [
      "application routes",
      "storage",
      "personal progress",
      "sessions",
      "environment files",
      "node_modules",
      "whole checkout",
      "SSR and screenshots deferred",
    ],
  };
}
export function validateOutputPath(output: string, source: string): string {
  const root = resolve(output);
  const ownedRoot = resolve(import.meta.dir, "../artifacts/gradual-corpus");
  if (root !== ownedRoot && !root.startsWith(`${ownedRoot}/`))
    throw new Error("--out must remain inside artifacts/gradual-corpus");
  const sourceRoot = resolve(source);
  if (root === sourceRoot || root.startsWith(`${sourceRoot}/`) || sourceRoot.startsWith(`${root}/`))
    throw new Error("Output overlaps source");
  return root;
}
async function safeDirectory(path: string): Promise<void> {
  try {
    const stat = await lstat(path);
    if (!stat.isDirectory() || stat.isSymbolicLink() || (await realpath(path)) !== path)
      throw new Error(`Symlink or non-directory output: ${path}`);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
    await safeDirectory(dirname(path));
    await mkdir(path);
  }
}
export async function writeCorpus(
  output: string,
  result: Awaited<ReturnType<typeof generateCorpus>>,
) {
  const root = validateOutputPath(output, result.input.sourceDir);
  const snapshot = snapshotMetadata(result.input);
  const snapshotPaths = snapshot.files.map(({ path }) => path.slice("source/".length));
  await safeDirectory(root);
  async function put(path: string, contents: string, readOnly = false) {
    const target = join(root, path);
    await safeDirectory(dirname(target));
    try {
      const stat = await lstat(target);
      if (!stat.isFile() || stat.isSymbolicLink() || stat.nlink !== 1)
        throw new Error(`Unsafe output: ${path}`);
      if ((await readFile(target, "utf8")) === contents) {
        if (readOnly && stat.mode & 0o222) await chmod(target, 0o444);
        return;
      }
      await chmod(target, 0o644);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
    }
    await writeFile(target, contents, { mode: readOnly ? 0o444 : 0o644 });
    if (readOnly) await chmod(target, 0o444);
  }
  for (const path of snapshotPaths)
    await put(`snapshot/source/${path}`, result.input.files.get(path) ?? "", true);
  await put("snapshot/metadata.json", `${canonical(snapshot)}\n`, true);
  await put("snapshot/inline-figures.json", `${canonical(result.input.inline)}\n`, true);
  await put(
    "manifest.json",
    `${canonical({ ...result.manifest, snapshot: { ...snapshot, metadata: "snapshot/metadata.json" } })}\n`,
  );
  return join(root, "manifest.json");
}
export function parseArgs(args: string[]) {
  const result: { source?: string; out: string; baseline?: string; help?: boolean } = {
    out: resolve(import.meta.dir, "../artifacts/gradual-corpus"),
  };
  for (let i = 0; i < args.length; i++) {
    const key = args[i];
    if (key === "--help") {
      result.help = true;
      continue;
    }
    if (key === undefined || !["--source", "--out", "--baseline"].includes(key))
      throw new Error(`Unknown argument: ${key}`);
    const value = args[++i];
    if (!value || value.startsWith("--")) throw new Error(`Missing value: ${key}`);
    if (key === "--source") {
      if (result.source) throw new Error("Duplicate --source");
      result.source = value;
    }
    if (key === "--out") result.out = value;
    if (key === "--baseline") result.baseline = value;
  }
  if (!result.help && !result.source)
    throw new Error("--source is required; there is no default source checkout");
  return result;
}
if (import.meta.main) {
  try {
    const args = parseArgs(process.argv.slice(2));
    if (args.help)
      console.log(
        "bun --no-env-file --no-install scripts/extract-gradual.ts --source /absolute/path/to/gradual [--out artifacts/gradual-corpus] [--baseline artifacts/gradual-corpus/baseline.json]",
      );
    else {
      validateOutputPath(args.out, args.source ?? "");
      let options: BaselineOptions = {};
      if (args.baseline) {
        const baseline = object(
          JSON.parse(
            await readWithin(
              resolve(import.meta.dir, "../artifacts/gradual-corpus"),
              relative(
                resolve(import.meta.dir, "../artifacts/gradual-corpus"),
                resolve(args.baseline),
              ),
            ),
          ),
          "baseline",
        );
        options = {
          expectedCounts: baseline.counts,
          expectedRevision: text(baseline.revision, "baseline.revision"),
          expectedSourceHash: text(baseline.sourceHash, "baseline.sourceHash"),
        };
        if (!options.expectedCounts) throw new Error("Complete baseline counts required");
      }
      const result = await generateCorpus(args.source ?? "", options);
      const output = await writeCorpus(args.out, result);
      console.log(
        JSON.stringify(
          {
            manifest: output,
            revision: result.input.revision,
            sourceHash: result.input.sourceHash,
            counts: result.manifest.counts,
          },
          null,
          2,
        ),
      );
    }
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  }
}
