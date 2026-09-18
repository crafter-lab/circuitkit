import { createHash } from "node:crypto";
import { lstat, readdir, readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { Resvg } from "@resvg/resvg-js";
import { publicAdapterExamples } from "../app/education/examples.ts";
import {
  adaptGradualFigure,
  adaptGradualPair,
  type GradualHost,
  type GradualPair,
  gradualAnnotationCollisions,
  projectGradualPair,
  renderGradualFigure,
  renderGradualHost,
} from "../src/integrations/gradual.ts";
import {
  projectFigure,
  renderEducationalSVG,
  type Stage,
  type Theme,
  validateAuthorFigure,
} from "../src/v2/index.ts";

export const themes: Theme[] = ["geist-light", "geist-dark", "geist-print"];
export const stages: Stage[] = ["teaching", "question", "correction"];
export type CoverageStatus =
  | "native-verified"
  | "host-composition-verified"
  | "blocked"
  | "pending";
type Exact = {
  id: string;
  family: string;
  figure: Record<string, unknown>;
  occurrenceIds: string[];
};
type Occurrence = {
  caseId: string;
  exactFigureId: string;
  family: string;
  stage: string;
  context: unknown;
  [key: string]: unknown;
};
type Pair = {
  pairId: string;
  questionCaseIds: string[];
  solutionCaseIds: string[];
  [key: string]: unknown;
};
type Foundation = { caseId: string; diagram: string; rendered: string; [key: string]: unknown };
export type Manifest = {
  source: { revision: string; sourceHash: string; [key: string]: unknown };
  exactFigures: Exact[];
  occurrences: Occurrence[];
  questionSolutionPairs: Pair[];
  hostFoundations: Foundation[];
  families: { family: string; occurrences: number; exact: number }[];
};
const sha = (input: string | Uint8Array) => createHash("sha256").update(input).digest("hex");
const count = (items: { status: CoverageStatus }[]) =>
  Object.fromEntries(
    (["native-verified", "host-composition-verified", "blocked", "pending"] as const).map(
      (status) => [status, items.filter((item) => item.status === status).length],
    ),
  );
export const occurrenceStage = (stage: string): Stage =>
  stage === "solution"
    ? "correction"
    : stage === "question" || stage === "exam"
      ? "question"
      : "teaching";
export function hostReasons(host: GradualHost): string[] {
  renderGradualHost(host);
  return [
    ...(host.kind === "no-figure" ? ["explicit-no-figure"] : []),
    ...(host.kind === "record" ? ["record-table"] : []),
    ...(host.caption.length ? ["caption"] : []),
    ...(host.notes.length ? ["notes"] : []),
    ...(host.verdict?.length ? ["verdict"] : []),
    ...(host.additions?.length ? ["public-adjunct-geometry"] : []),
  ];
}
export const hostStatus = (host: GradualHost): CoverageStatus =>
  hostReasons(host).length ? "host-composition-verified" : "native-verified";
const combine = (statuses: CoverageStatus[]): CoverageStatus =>
  statuses.includes("blocked")
    ? "blocked"
    : statuses.includes("pending")
      ? "pending"
      : statuses.includes("host-composition-verified")
        ? "host-composition-verified"
        : "native-verified";
function raster(svg: string) {
  const image = new Resvg(svg, {
    fitTo: { mode: "width", value: 256 },
    font: { loadSystemFonts: false },
  }).render();
  const png = image.asPng();
  if (!image.width || !image.height || png.byteLength < 100) throw new Error("native-raster");
  return { pngHash: sha(png), width: image.width, height: image.height };
}

export function pairFigures(manifest: Manifest, pair: Pair) {
  if (pair.questionCaseIds.length > 1 || pair.solutionCaseIds.length > 1)
    throw new Error("pair-cardinality");
  const lookup = (ids: string[]) => {
    if (!ids.length) return null;
    const occurrence = manifest.occurrences.find((item) => item.caseId === ids[0]);
    const exact = manifest.exactFigures.find((item) => item.id === occurrence?.exactFigureId);
    if (!exact) throw new Error("pair-reference");
    return exact.figure;
  };
  return {
    id: pair.pairId,
    question: lookup(pair.questionCaseIds),
    correction: lookup(pair.solutionCaseIds),
  };
}

type Check = {
  stage: Stage;
  theme: Theme;
  status: CoverageStatus;
  reason?: string;
  hostReasons?: string[];
  nativePanelVerified?: boolean;
  inkCollisionCount?: number;
  svgHash?: string;
  htmlHash?: string;
  documentHash?: string;
  pngHash?: string;
  width?: number;
  height?: number;
};
export function checkExact(exact: Exact): Check[] {
  const checks: Check[] = [];
  for (const stage of stages)
    for (const theme of themes) {
      try {
        const before = JSON.stringify(exact.figure);
        const a = adaptGradualFigure(exact.figure, { id: exact.id, stage, theme });
        if (!a.ok) throw new Error("adapter-or-core-projection-rejected");
        const r = renderGradualFigure(a, exact.id);
        if (!r.ok) throw new Error("public-render-rejected");
        const collisions = r.document ? gradualAnnotationCollisions(r.document, 1) : [];
        if (collisions.length)
          throw new Error(
            `annotation-ink-collision:${collisions[0]?.label}:${collisions[0]?.obstacle}`,
          );
        if (JSON.stringify(exact.figure) !== before) throw new Error("input-mutated");
        const again = renderGradualFigure(a, exact.id);
        if (!again.ok || again.svg !== r.svg || again.html !== r.html)
          throw new Error("nondeterministic-render");
        if (
          a.host.kind === "record" &&
          (!r.html.includes("<table>") || !r.html.includes("</table>"))
        )
          throw new Error("record-host-table-missing");
        checks.push({
          stage,
          theme,
          status: hostStatus(a.host),
          hostReasons: hostReasons(a.host),
          nativePanelVerified: Boolean(r.svg),
          inkCollisionCount: collisions.length,
          documentHash: sha(JSON.stringify(r.document)),
          htmlHash: sha(r.html),
          ...(r.svg ? { svgHash: sha(r.svg), ...raster(r.svg) } : {}),
        });
      } catch (error) {
        checks.push({
          stage,
          theme,
          status: "blocked",
          reason: error instanceof Error ? error.message : "verification-failed",
        });
      }
    }
  return checks;
}

export function verifyCorrectionIdentity(pair: GradualPair): void {
  if (!validateAuthorFigure(pair.author).ok) throw new Error("full-author-validation-failed");
  for (const base of pair.author.stages.question.panels) {
    const correction = pair.author.stages.correction.panels.find((p) => p.id === base.id);
    if (
      !correction ||
      correction.kind !== base.kind ||
      JSON.stringify(correction.at) !== JSON.stringify(base.at)
    )
      throw new Error("correction-base-identity-failed");
    if (base.kind === "electrical" && correction.kind === "electrical") {
      for (const component of base.components)
        if (
          !correction.components.some(
            (c) =>
              c.id === component.id &&
              c.kind === component.kind &&
              JSON.stringify(c.terminals) === JSON.stringify(component.terminals),
          )
        )
          throw new Error("correction-component-identity-failed");
      for (const terminal of base.terminals)
        if (
          !correction.terminals.some(
            (t) => t.id === terminal.id && JSON.stringify(t.at) === JSON.stringify(terminal.at),
          )
        )
          throw new Error("correction-terminal-identity-failed");
      for (const route of base.routes)
        if (
          !correction.routes.some(
            (r) => r.id === route.id && r.from === route.from && r.to === route.to,
          )
        )
          throw new Error("correction-route-identity-failed");
    }
  }
}

export function verifySelectedIsolation(pair: GradualPair): number {
  const snapshot = (candidate: GradualPair) => {
    const selected = projectGradualPair(candidate, "question");
    const direct = projectFigure(candidate.author, "question");
    if (!selected.ok || !direct.ok) throw new Error("selected-question-rejected");
    const rendered = selected.document ? renderEducationalSVG(selected.document) : null;
    if (rendered && !rendered.ok) throw new Error("selected-question-render-rejected");
    return JSON.stringify({
      selected,
      direct,
      svg: rendered?.svg ?? null,
      html: renderGradualHost(selected.host),
    });
  };
  const before = snapshot(pair);
  const model = pair.author.stages.question;
  const malformed: unknown[] = [
    null,
    { PRIVATE_NONSELECTED: "invalid stage schema" },
    { ...model, theme: "PRIVATE_INVALID_THEME" },
    {
      ...model,
      panels: [
        {
          kind: "levels",
          id: model.panels[0]?.id ?? "figure",
          at: { x: 0, y: 0 },
          low: 0.8,
          high: 2,
          max: 3.3,
          width: 300,
          showClassification: false,
        },
      ],
    },
    {
      ...model,
      panels: [
        {
          kind: "readings",
          id: "private",
          at: { x: 0, y: 0 },
          items: [
            {
              id: "private",
              label: [{ text: "😀", script: "base" }],
              reading: { mode: "authored", value: { kind: "unknown", unit: "scalar" } },
            },
          ],
        },
      ],
    },
  ];
  for (const value of malformed) {
    const changed = structuredClone(pair);
    Object.assign(changed.author.stages, { teaching: value, correction: value });
    Object.assign(changed.host, { teaching: { PRIVATE_HOST: "invalid" }, correction: null });
    if (snapshot(changed) !== before) throw new Error("malformed-nonselected-interference");
  }
  return malformed.length;
}

export function checkPair(manifest: Manifest, pair: Pair) {
  const checks: Check[] = [];
  let differentialVerified = 0;
  let authorIdentityVerified = 0;
  let malformedNonselectedCases = 0;
  for (const theme of themes) {
    try {
      const input = pairFigures(manifest, pair);
      const before = JSON.stringify(input);
      const a = adaptGradualPair(input, { theme });
      if (!a.ok) throw new Error("pair-adaptation-rejected");
      verifyCorrectionIdentity(a);
      authorIdentityVerified++;
      malformedNonselectedCases += verifySelectedIsolation(a);
      for (const stage of stages) {
        const p = projectGradualPair(a, stage);
        if (!p.ok) throw new Error("pair-projection-rejected");
        const r = p.document ? renderEducationalSVG(p.document) : null;
        if (r && !r.ok) throw new Error("pair-render-rejected");
        const collisions = p.document ? gradualAnnotationCollisions(p.document, 1) : [];
        if (collisions.length)
          throw new Error(
            `pair-annotation-ink-collision:${collisions[0]?.label}:${collisions[0]?.obstacle}`,
          );
        const html = renderGradualHost(p.host);
        checks.push({
          stage,
          theme,
          status: hostStatus(p.host),
          hostReasons: hostReasons(p.host),
          nativePanelVerified: Boolean(r?.ok && r.svg),
          inkCollisionCount: collisions.length,
          documentHash: sha(JSON.stringify(p.document)),
          htmlHash: sha(html),
          ...(r?.ok ? { svgHash: sha(r.svg) } : {}),
        });
      }
      const changed = adaptGradualPair(
        {
          ...input,
          correction: input.correction
            ? { ...input.correction, caption: "CORRECTION_PRIVATE_729193" }
            : {
                kind: "record",
                caption: "CORRECTION_PRIVATE_729193",
                record: { fields: [{ label: "Secret", value: "729193" }] },
              },
        },
        { theme },
      );
      if (!changed.ok) throw new Error("differential-adaptation-rejected");
      const original = projectGradualPair(a, "question");
      const mutated = projectGradualPair(changed, "question");
      if (!original.ok || !mutated.ok || JSON.stringify(original) !== JSON.stringify(mutated))
        throw new Error("question-noninterference-failed");
      if (JSON.stringify(input) !== before) throw new Error("pair-input-mutated");
      differentialVerified++;
    } catch (error) {
      checks.push({
        stage: "question",
        theme,
        status: "blocked",
        reason: error instanceof Error ? error.message : "pair-verification-failed",
      });
    }
  }
  return {
    ...pair,
    status: combine(checks.map((c) => c.status)),
    checks,
    differentialVerified,
    authorIdentityVerified,
    malformedNonselectedCases,
  };
}

export function checkGenericDemos() {
  const checks: (Check & { family: string })[] = [];
  for (const stage of stages)
    for (const theme of themes) {
      const demos = publicAdapterExamples(stage, theme);
      if (demos.length !== 18) throw new Error("Generic demo baseline mismatch.");
      for (const demo of demos) {
        try {
          const rendered = demo.document ? renderEducationalSVG(demo.document) : null;
          if (rendered && !rendered.ok) throw new Error("generic-render-rejected");
          const collisions = demo.document ? gradualAnnotationCollisions(demo.document, 1) : [];
          if (collisions.length)
            throw new Error(
              `generic-ink-collision:${collisions[0]?.label}:${collisions[0]?.obstacle}`,
            );
          checks.push({
            family: demo.family,
            stage,
            theme,
            status: hostStatus(demo.host),
            hostReasons: hostReasons(demo.host),
            nativePanelVerified: Boolean(rendered?.ok && rendered.svg),
            inkCollisionCount: collisions.length,
            documentHash: sha(JSON.stringify(demo.document)),
            htmlHash: sha(renderGradualHost(demo.host)),
            ...(rendered?.ok && rendered.svg
              ? { svgHash: sha(rendered.svg), ...raster(rendered.svg) }
              : {}),
          });
        } catch (error) {
          checks.push({
            family: demo.family,
            stage,
            theme,
            status: "blocked",
            reason: error instanceof Error ? error.message : "generic-verification-failed",
          });
        }
      }
    }
  return checks;
}

export function checkManifest(manifest: Manifest) {
  if (
    manifest.occurrences.length !== 652 ||
    manifest.exactFigures.length !== 344 ||
    manifest.families.length !== 18 ||
    manifest.questionSolutionPairs.length !== 319 ||
    manifest.hostFoundations.length !== 10
  )
    throw new Error("Corpus baseline mismatch; no coverage written.");
  if (
    new Set(manifest.occurrences.map((x) => x.caseId)).size !== 652 ||
    new Set(manifest.exactFigures.map((x) => x.id)).size !== 344
  )
    throw new Error("Duplicate corpus identity.");
  const exactFigures = manifest.exactFigures.map((exact) => {
    const checks = checkExact(exact);
    return {
      id: exact.id,
      family: exact.family,
      occurrenceIds: exact.occurrenceIds,
      status: combine(checks.map((c) => c.status)),
      checks,
    };
  });
  const occurrences = manifest.occurrences.map((occurrence) => {
    const exact = exactFigures.find((item) => item.id === occurrence.exactFigureId);
    if (!exact) throw new Error("Unresolved occurrence reference.");
    const stage = occurrenceStage(occurrence.stage);
    const checks = exact.checks.filter((item) => item.stage === stage);
    return {
      ...occurrence,
      projectedStage: stage,
      status: combine(checks.map((c) => c.status)),
      checks,
    };
  });
  const questionSolutionPairs = manifest.questionSolutionPairs.map((pair) =>
    checkPair(manifest, pair),
  );
  const hostFoundations = manifest.hostFoundations.map((host) => {
    const a = adaptGradualFigure(null);
    const r = a.ok ? renderGradualFigure(a) : a;
    const verified =
      host.diagram === "none" &&
      host.rendered === "null" &&
      r.ok &&
      r.document === null &&
      r.svg === null &&
      r.html === "";
    return {
      ...host,
      status: (verified ? "host-composition-verified" : "blocked") as CoverageStatus,
      ...(verified
        ? { proof: "No fabricated display, SVG, or image; original host context retained." }
        : { reason: "Unexpected foundation composition." }),
    };
  });
  const genericDemos = checkGenericDemos();
  const families = manifest.families.map((family) => ({
    ...family,
    statuses: count(occurrences.filter((item) => item.family === family.family)),
  }));
  return {
    schemaVersion: 1,
    source: manifest.source,
    policy: {
      compatibleStatuses: ["native-verified", "host-composition-verified"],
      blockedIsCompatible: false,
      pendingIsCompatible: false,
      nativeProof:
        "Public SVG validated and rasterized by Resvg with system fonts disabled; not original-renderer visual equivalence.",
      hostProof:
        "Status is computed from actual selected host data, including captions, notes, record tables and public adjuncts. Each check records hostReasons and nativePanelVerified separately. Native panel portions rasterized. No static family compatibility catalog or browser screenshot claim.",
      stages:
        "lesson/point/example/unit-overview => teaching; question/exam => question; solution => correction",
      originalSnapshot: "read-only, local-only-not-bundled",
      missingFigure: "Explicit null document and SVG, no replacement image.",
      questionPolicy:
        "Independent question input, masked fields removed before projection; correction never copied into question.",
    },
    summary: {
      occurrences: count(occurrences),
      exactFigures: count(exactFigures),
      questionSolutionPairs: count(questionSolutionPairs),
      hostFoundations: count(hostFoundations),
      genericDemos: count(genericDemos),
      genericDemoStageThemeChecks: genericDemos.length,
      genericDemoNativeRasterChecks: genericDemos.filter((check) => check.pngHash).length,
      annotationInkChecks:
        exactFigures.reduce(
          (n, item) =>
            n +
            item.checks.filter(
              (check) => check.nativePanelVerified && check.inkCollisionCount === 0,
            ).length,
          0,
        ) +
        genericDemos.filter((check) => check.nativePanelVerified && check.inkCollisionCount === 0)
          .length,
      exactThemeStageChecks: exactFigures.reduce((n, item) => n + item.checks.length, 0),
      nativeRasterChecks: exactFigures.reduce(
        (n, item) => n + item.checks.filter((check) => check.pngHash).length,
        0,
      ),
      differentialPairThemeChecks: questionSolutionPairs.reduce(
        (n, pair) => n + pair.differentialVerified,
        0,
      ),
      fullAuthorIdentityChecks: questionSolutionPairs.reduce(
        (n, pair) => n + pair.authorIdentityVerified,
        0,
      ),
      malformedNonselectedCases: questionSolutionPairs.reduce(
        (n, pair) => n + pair.malformedNonselectedCases,
        0,
      ),
    },
    genericDemos,
    families,
    occurrences,
    exactFigures,
    questionSolutionPairs,
    hostFoundations,
    coreFixRequests: [
      {
        code: "host.record",
        file: "src/v2/schema.ts",
        request:
          "Optional native record panel remains unimplemented. Public host rows and safe table rendering are verified, not skipped; this is not a functional coverage blocker.",
      },
    ],
    resolvedCoreConstraints: [
      "Empty selected stages project through the core; the adapter normalizes empty display to null.",
      "Scale uses native input.from and input.magnitude; no host source-marker workaround or converted scalar in question text.",
      "Authored timeline expressions including ≥ are native readings; bounded operator outlines cover ≥ ≤ ≠ ← ↑ ↓ ↔ Δ.",
      "Core reading columns and row spacing use measured glyph bounds, replacing the fixed-gap limitation.",
      "Selected projection validates only the selected schema; cross-stage identity remains a separate full-author check. Malformed nonselected JSON models and host payloads leave question output unchanged.",
    ],
  };
}

export type Coverage = ReturnType<typeof checkManifest>;
function markdown(report: Coverage) {
  const lines = [
    "# Gradual adapter functional coverage",
    "",
    "Local-only corpus proof. No original-renderer visual-equivalence or browser screenshot claim.",
    "",
    `Source: ${report.source.revision}; ${report.source.sourceHash}.`,
    "",
    "| Surface | Native verified | Host composition verified | Blocked | Pending |",
    "| --- | ---: | ---: | ---: | ---: |",
  ];
  for (const key of [
    "occurrences",
    "exactFigures",
    "questionSolutionPairs",
    "hostFoundations",
    "genericDemos",
  ] as const) {
    const c = report.summary[key];
    lines.push(
      `| ${key} | ${c["native-verified"]} | ${c["host-composition-verified"]} | ${c.blocked} | ${c.pending} |`,
    );
  }
  lines.push(
    "",
    `${report.summary.exactThemeStageChecks} exact-payload stage/theme checks; ${report.summary.nativeRasterChecks} Resvg rasters; ${report.summary.differentialPairThemeChecks} pair/theme noninterference checks; ${report.summary.fullAuthorIdentityChecks} full-author identity checks; ${report.summary.malformedNonselectedCases} malformed/changed nonselected-stage cases.`,
    "",
    "Host-composition status includes actual host captions, not just record/table or geometry fallback. Native panel verification is recorded separately on every check.",
    "",
    `${report.summary.annotationInkChecks} native-image ink checks passed against line/polygon/rectangle strokes and dots using measured glyph-outline bounds with 1 unit clearance. Generic main-app demos: ${report.summary.genericDemoStageThemeChecks} checks and ${report.summary.genericDemoNativeRasterChecks} PNG rasters. This is not a fresh main-app browser screenshot approval.`,
    "",
    "## Families",
    "",
    "| Family | Occurrences | Exact | Native | Host | Blocked | Pending |",
    "| --- | ---: | ---: | ---: | ---: | ---: | ---: |",
  );
  for (const f of report.families)
    lines.push(
      `| ${f.family} | ${f.occurrences} | ${f.exact} | ${f.statuses["native-verified"]} | ${f.statuses["host-composition-verified"]} | ${f.statuses.blocked} | ${f.statuses.pending} |`,
    );
  lines.push(
    "",
    "## Core requests",
    "",
    ...report.coreFixRequests.map((r) => `- ${r.code}: ${r.request}`),
    "",
    "## Resolved core constraints",
    "",
    ...report.resolvedCoreConstraints.map((item) => `- ${item}`),
    "",
    "## Every occurrence",
    "",
    "| Case | Source stage | Public stage | Status |",
    "| --- | --- | --- | --- |",
  );
  for (const o of report.occurrences)
    lines.push(
      `| ${o.caseId} | ${o.stage} | ${o.projectedStage} | ${o.status}${
        o.checks.some((c) => c.reason)
          ? `: ${o.checks
              .filter((c) => c.reason)
              .map((c) => c.reason)
              .join(", ")}`
          : ""
      } |`,
    );
  return `${lines.join("\n")}\n`;
}

function gallery(manifest: Manifest) {
  const lines = [
    "# Gradual safe host composition gallery",
    "",
    "Local-only authored corpus. The exported renderGradualHost helper is also the gallery integration entry point. Captions and records below are escaped host HTML, never raw authored markup.",
    "",
  ];
  for (const exact of manifest.exactFigures.filter((f) => f.family === "record")) {
    lines.push(`## ${exact.id}`, "");
    for (const theme of themes) {
      const a = adaptGradualFigure(exact.figure, { theme, id: exact.id });
      if (!a.ok) throw new Error("Gallery record rejected.");
      lines.push(`### ${theme}`, "", renderGradualHost(a.host), "");
    }
  }
  lines.push(
    "## Current generic question annotation geometry",
    "",
    "Generated directly from the readonly app/education/examples.ts module. Canonical vector geometry below is also the source used by PNG raster checks. No CSS label offsets or opaque label masks are applied.",
    "",
  );
  for (const theme of themes)
    for (const demo of publicAdapterExamples("question", theme)) {
      lines.push(`### ${demo.family} / ${theme}`, "");
      if (demo.document) {
        const rendered = renderEducationalSVG(demo.document, {
          namespace: `demo-${demo.family}-${theme}`,
        });
        if (!rendered.ok) throw new Error("Generic gallery rendering failed.");
        lines.push(rendered.svg, "");
      }
      lines.push(renderGradualHost(demo.host), "");
    }
  return `${lines.join("\n")}\n`;
}

async function writeOwned(path: string, content: string) {
  try {
    const stat = await lstat(path);
    if (!stat.isFile() || stat.isSymbolicLink() || stat.nlink !== 1)
      throw new Error("Unsafe coverage output.");
  } catch (error) {
    if (!(error && typeof error === "object" && "code" in error && error.code === "ENOENT"))
      throw error;
  }
  await writeFile(path, content);
}

export async function main() {
  const root = resolve(import.meta.dir, "../artifacts/gradual-corpus");
  const stat = await lstat(root);
  if (!stat.isDirectory() || stat.isSymbolicLink()) throw new Error("Unsafe artifact directory.");
  const bytes = await readFile(resolve(root, "manifest.json"), "utf8");
  const manifest = JSON.parse(bytes) as Manifest;
  const before = sha(bytes);
  const repo = resolve(import.meta.dir, "..");
  const inputs = [
    ...(await readdir(resolve(repo, "src/v2")))
      .filter((name) => name.endsWith(".ts"))
      .map((name) => `src/v2/${name}`),
    "src/typography.ts",
    "app/education/examples.ts",
    "app/education/catalog.ts",
    "tests/gradual-adapter.test.ts",
    "src/integrations/gradual.ts",
    "scripts/check-gradual-coverage.ts",
    "docs/v2-contract.md",
  ].sort();
  const fingerprint = async () =>
    Promise.all(
      inputs.map(async (path) => ({ path, sha256: sha(await readFile(resolve(repo, path))) })),
    );
  const engineInputs = await fingerprint();
  const report = checkManifest(manifest);
  if (JSON.stringify(engineInputs) !== JSON.stringify(await fingerprint()))
    throw new Error("Core or adapter changed during verification.");
  if (sha(await readFile(resolve(root, "manifest.json"))) !== before)
    throw new Error("Manifest changed during verification.");
  await writeOwned(
    resolve(root, "coverage.json"),
    `${JSON.stringify({ ...report, manifestHash: before, engineInputs }, null, 2)}\n`,
  );
  await writeOwned(resolve(root, "coverage.md"), markdown(report));
  await writeOwned(resolve(root, "coverage-gallery.md"), gallery(manifest));
  console.log(JSON.stringify(report.summary, null, 2));
  if (
    [
      report.summary.occurrences,
      report.summary.exactFigures,
      report.summary.questionSolutionPairs,
      report.summary.hostFoundations,
      report.summary.genericDemos,
    ].some((c) => c.blocked || c.pending)
  )
    process.exitCode = 1;
}

if (import.meta.main) await main();
