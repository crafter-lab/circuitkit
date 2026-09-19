import { createHash } from "node:crypto";
import { lstat, mkdir, readFile, realpath, writeFile } from "node:fs/promises";
import { dirname, isAbsolute, join, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import {
  compositions,
  type PreviewData,
  type PreviewInput,
  type PreviewLesson,
  type Recipe,
  recipes,
  type Theme,
  themes,
} from "../examples/compact-composition/model.ts";
import { renderFigureSVG } from "../src/figure-svg.ts";
import { renderSchematicSVG, renderSVG } from "../src/renderer.ts";
import type { FigureDocument } from "../src/schema.ts";

export const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
export const artifactRoot = join(root, "artifacts/compact-composition-2026-09-19");
const harness = join(root, "examples/compact-composition");
const baselinePath = join(harness, "classic-baseline.json");
export const sha256 = (value: string | Uint8Array) =>
  createHash("sha256").update(value).digest("hex");
const json = (value: unknown) => `${JSON.stringify(value, null, 2)}\n`;
const fresh = (path: string, value: string | Uint8Array) => writeFile(path, value, { flag: "wx" });
const local = (path: string) => relative(root, path);

export function parseArgs(args: string[]) {
  let out: string | undefined;
  let serve = false;
  let port = 4319;
  let help = false;
  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === "--serve") serve = true;
    else if (arg === "--help") help = true;
    else if (arg === "--out" || arg === "--port") {
      const value = args[++i];
      if (!value || value.startsWith("--")) throw new Error(`Missing value for ${arg}`);
      if (arg === "--out") out = resolve(root, value);
      else {
        if (!/^\d+$/.test(value)) throw new Error("Port must be an integer");
        port = Number(value);
        if (port < 1024 || port > 65535) throw new Error("Port must be between 1024 and 65535");
      }
    } else throw new Error(`Unknown argument: ${arg}`);
  }
  if (serve && !out) throw new Error("--serve requires --out pointing to a completed export");
  return { out, serve, port, help };
}

async function command(argv: string[]) {
  const child = Bun.spawn(argv, { cwd: root, stdout: "pipe", stderr: "pipe", stdin: "ignore" });
  const [stdout, stderr, exitCode] = await Promise.all([
    new Response(child.stdout).text(),
    new Response(child.stderr).text(),
    child.exited,
  ]);
  return { argv, cwd: root, exitCode, stdout, stderr };
}

async function git(args: string[]) {
  const result = await command(["git", ...args]);
  if (result.exitCode !== 0) throw new Error(result.stderr);
  return result.stdout.trim();
}

export async function sourceSnapshot() {
  const paths = new Set(["package.json", "bun.lock", "scripts/preview-compact.ts"]);
  for (const pattern of [
    "src/**/*",
    "fonts/**/*",
    "examples/**/*.json",
    "examples/compact-composition/*",
  ]) {
    for await (const path of new Bun.Glob(pattern).scan({ cwd: root, onlyFiles: true }))
      paths.add(path);
  }
  const files: Record<string, string> = {};
  for (const path of [...paths].sort()) files[path] = sha256(await readFile(join(root, path)));
  return { sha256: sha256(JSON.stringify(files)), files };
}

export async function verifyBaseline() {
  const bytes = await readFile(baselinePath);
  const baseline: Record<string, string> = JSON.parse(bytes.toString());
  if (Object.keys(baseline).length !== 81) throw new Error("Expected exactly 81 baseline hashes");
  const renderers = { legacy: renderSVG, schematic: renderSchematicSVG, figure: renderFigureSVG };
  const checks = [];
  for (const [key, expected] of Object.entries(baseline)) {
    const [recipe, theme, mode, extra] = key.split("/");
    if (
      !recipe ||
      !/^[a-z-]+$/.test(recipe) ||
      !theme ||
      !themes.includes(theme as (typeof themes)[number]) ||
      !mode ||
      !Object.hasOwn(renderers, mode) ||
      extra !== undefined
    ) {
      throw new Error(`Invalid baseline key: ${key}`);
    }
    const examplePath = join(root, "examples", `${recipe}.json`);
    const source = await readFile(examplePath);
    const input: FigureDocument = JSON.parse(source.toString());
    input.presentation.theme = { preset: theme as (typeof themes)[number] };
    const result =
      mode === "schematic"
        ? renderSchematicSVG(input, { composition: "classic" })
        : renderers[mode as "legacy" | "figure"](input);
    const actual = result.ok ? sha256(result.svg) : null;
    checks.push({
      key,
      source: local(examplePath),
      sourceSha256: sha256(source),
      expected,
      actual,
      matched: actual === expected,
      diagnostics: result.diagnostics,
    });
  }
  return {
    purpose: "historical-compatibility" as const,
    renderers: {
      legacy: "renderSVG(input)",
      schematic: 'renderSchematicSVG(input, { composition: "classic" })',
      figure: "renderFigureSVG(input)",
    },
    baseline: local(baselinePath),
    baselineSha256: sha256(bytes),
    checkedAt: new Date().toISOString(),
    total: checks.length,
    matched: checks.filter((check) => check.matched).length,
    ok: checks.every((check) => check.matched),
    checks,
  };
}

async function checkedOutput(path: string, createRoot = false) {
  const rel = relative(artifactRoot, path);
  if (!rel || rel.startsWith(`..${sep}`) || rel === ".." || isAbsolute(rel))
    throw new Error("--out must be a child of artifacts/compact-composition-2026-09-19");
  if (createRoot) await mkdir(artifactRoot, { recursive: true });
  const rootInfo = await lstat(artifactRoot);
  if (rootInfo.isSymbolicLink() || !rootInfo.isDirectory())
    throw new Error("Artifact root must be a regular directory");
  const base = await realpath(artifactRoot);
  let current = artifactRoot;
  for (const part of rel.split(sep)) {
    current = join(current, part);
    try {
      const info = await lstat(current);
      if (info.isSymbolicLink() || !info.isDirectory())
        throw new Error(`Output component is not a regular directory: ${current}`);
      if (!(await realpath(current)).startsWith(`${base}${sep}`))
        throw new Error("Output escapes artifact directory");
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
    }
  }
  return path;
}

export async function canonicalInput(recipe: Recipe, theme: Theme) {
  const document: FigureDocument = JSON.parse(
    await readFile(join(root, "examples", `${recipe}.json`), "utf8"),
  );
  if (document.layout.preset !== recipe) throw new Error(`Canonical recipe mismatch: ${recipe}`);
  document.presentation.theme = { preset: theme };
  return Buffer.from(json(document));
}

export async function verifyDefault() {
  const checks = [];
  for (const recipe of recipes) {
    for (const theme of themes) {
      const bytes = await canonicalInput(recipe, theme);
      const document: FigureDocument = JSON.parse(bytes.toString());
      const before = JSON.stringify(document);
      const current = renderSchematicSVG(document);
      const compact = renderSchematicSVG(document, { composition: "compact" });
      const actual = current.ok ? sha256(current.svg) : null;
      const expected = compact.ok ? sha256(compact.svg) : null;
      checks.push({
        key: `${recipe}/${theme}`,
        inputSha256: sha256(bytes),
        actual,
        expected,
        matched:
          current.ok &&
          compact.ok &&
          actual === expected &&
          JSON.stringify(current.bounds) === JSON.stringify(compact.bounds) &&
          JSON.stringify(current.endpoints) === JSON.stringify(compact.endpoints) &&
          JSON.stringify(document) === before,
        diagnostics: { default: current.diagnostics, compact: compact.diagnostics },
      });
    }
  }
  return {
    composition: "compact" as const,
    invocation: "renderSchematicSVG(document)",
    recipes,
    checkedAt: new Date().toISOString(),
    total: checks.length,
    matched: checks.filter((check) => check.matched).length,
    ok: checks.every((check) => check.matched),
    checks,
  };
}

async function existingInput(path: string, expected: Buffer) {
  try {
    const info = await lstat(path);
    if (info.isSymbolicLink() || !info.isFile())
      throw new Error(`Input must be a regular file: ${path}`);
    const actual = await readFile(path);
    if (!actual.equals(expected))
      throw new Error(
        `Stale input: ${path}. Existing bytes differ from the canonical recipe/theme; refusing to overwrite.`,
      );
    return true;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
    return false;
  }
}

export async function prepareInputs(directory = artifactRoot) {
  await checkedOutput(join(directory, "input-preflight"), true);
  const pending = [];
  for (const recipe of recipes) {
    for (const theme of themes) {
      const path = join(directory, `${recipe}-${theme}.json`);
      const bytes = await canonicalInput(recipe, theme);
      pending.push({ path, bytes, exists: await existingInput(path, bytes) });
    }
  }
  await mkdir(directory, { recursive: true });
  for (const input of pending) {
    if (!input.exists) {
      try {
        await fresh(input.path, input.bytes);
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error;
      }
    }
    if (!(await existingInput(input.path, input.bytes)))
      throw new Error(`Input disappeared: ${input.path}`);
  }
  return pending.map(({ path, bytes, exists }) => ({
    path,
    sha256: sha256(bytes),
    created: !exists,
  }));
}

export async function generate(out: string) {
  await checkedOutput(out, true);
  await mkdir(dirname(out), { recursive: true });
  await mkdir(out);
  const source = await sourceSnapshot();
  const gitCommit = await git(["rev-parse", "HEAD"]);
  const gitStatus = await git(["status", "--short"]);
  const baseline = await verifyBaseline();
  await fresh(join(out, "baseline-verification.json"), json(baseline));
  if (!baseline.ok)
    throw new Error(
      `Baseline mismatch: ${baseline.matched}/81. No CLI exports performed. See ${out}/baseline-verification.json`,
    );
  const defaultVerification = await verifyDefault();
  await fresh(join(out, "default-verification.json"), json(defaultVerification));
  if (!defaultVerification.ok)
    throw new Error(
      `Default mismatch: ${defaultVerification.matched}/${defaultVerification.total}. Core default must match compact for all three recipes before export. See ${out}/default-verification.json`,
    );
  const inputPreparation = await prepareInputs();
  console.log(
    "PASS historical compatibility: 81/81 legacy, explicit-classic schematic and figure hashes; default matches compact: 9/9 recipe/theme checks; canonical inputs verified; starting CLI exports",
  );
  await mkdir(join(out, "inputs"));
  await mkdir(join(out, "receipts"));
  const inputs: PreviewInput[] = [];
  const lessons: PreviewLesson[] = [];
  const exports = [];
  const preserved = new Map<string, string>([[baselinePath, baseline.baselineSha256]]);
  const originalBaseline = join(artifactRoot, "classic-baseline.json");
  try {
    preserved.set(originalBaseline, sha256(await readFile(originalBaseline)));
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
  }
  for (const recipe of recipes) {
    for (const theme of themes) {
      const inputPath = join(artifactRoot, `${recipe}-${theme}.json`);
      const bytes = await readFile(inputPath);
      const inputSha256 = sha256(bytes);
      preserved.set(inputPath, inputSha256);
      const document: FigureDocument = JSON.parse(bytes.toString());
      if (document.layout.preset !== recipe || document.presentation.theme.preset !== theme)
        throw new Error(`Input identity mismatch: ${inputPath}`);
      const copy = `inputs/${recipe}-${theme}.json`;
      await fresh(join(out, copy), bytes);
      inputs.push({ recipe, theme, document, copy, source: local(inputPath), sha256: inputSha256 });
      const classic = renderSchematicSVG(document, { composition: "classic" });
      if (!classic.ok) throw new Error(json(classic.diagnostics));
      for (const composition of compositions) {
        const api = renderSchematicSVG(document, { composition });
        if (!api.ok) throw new Error(json(api.diagnostics));
        if (!api.endpoints) throw new Error(`Missing endpoint geometry: ${recipe}/${composition}`);
        if (
          JSON.stringify(api.circuit) !== JSON.stringify(classic.circuit) ||
          JSON.stringify(api.document) !== JSON.stringify(classic.document)
        )
          throw new Error("Composition changed the normalized source/graph");
        for (const format of ["svg", "png"] as const) {
          if (sha256(await readFile(inputPath)) !== inputSha256)
            throw new Error(`Input changed before CLI execution: ${inputPath}`);
          const filename = `${recipe}-${theme}-${composition}.${format}`;
          const output = join(out, filename);
          const argv = [
            process.execPath,
            "src/cli.ts",
            "render",
            local(inputPath),
            "--schematic",
            "--composition",
            composition,
            "--format",
            format,
            ...(format === "png" ? ["--scale", "2"] : []),
            "--out",
            local(output),
            "--json",
          ];
          const execution = await command(argv);
          const receiptPath = `receipts/${filename}.json`;
          await fresh(
            join(out, receiptPath),
            json({ ...execution, inputSha256, sourceSha256: source.sha256, gitCommit }),
          );
          if (execution.exitCode !== 0)
            throw new Error(`CLI exited ${execution.exitCode}: ${receiptPath}`);
          const receipt = JSON.parse(execution.stdout);
          if (!receipt.ok || receipt.output !== output)
            throw new Error(`Invalid CLI receipt: ${receiptPath}`);
          const generated = await readFile(output);
          let dimensions: { width: number; height: number } | undefined;
          if (format === "svg") {
            if (!generated.equals(Buffer.from(api.svg)))
              throw new Error(`CLI/API SVG mismatch: ${filename}`);
          } else {
            if (!generated.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])))
              throw new Error(`Invalid PNG signature: ${filename}`);
            dimensions = { width: generated.readUInt32BE(16), height: generated.readUInt32BE(20) };
            if (
              dimensions.width !== Math.ceil(api.bounds.width * 2) ||
              dimensions.height !== Math.ceil(api.bounds.height * 2)
            )
              throw new Error(`Incorrect 2x PNG dimensions: ${filename}`);
          }
          exports.push({
            recipe,
            theme,
            composition,
            purpose: composition === "compact" ? "default-download" : "compatibility-evidence",
            format,
            file: filename,
            sha256: sha256(generated),
            bytes: generated.length,
            dimensions,
            bounds: api.bounds,
            endpointCount: Object.keys(api.endpoints).length,
            apiSvgSha256: sha256(api.svg),
            input: local(inputPath),
            inputSha256,
            receipt: receiptPath,
            exitCode: execution.exitCode,
            argv,
          });
        }
      }
    }
  }
  for (const name of ["rc-lowpass", "feedback-amplifier"]) {
    const path = join(root, "examples/lessons", `${name}.json`);
    const bytes = await readFile(path);
    const copy = `inputs/lesson-${name}.json`;
    await fresh(join(out, copy), bytes);
    lessons.push({
      source: local(path),
      sha256: sha256(bytes),
      copy,
      document: JSON.parse(bytes.toString()),
    });
  }
  const data: PreviewData = {
    gitCommit,
    sourceSha256: source.sha256,
    baselineMatches: baseline.matched,
    cliRenders: exports.length,
    inputs,
    lessons,
  };
  await fresh(join(out, "data.json"), json(data));
  const build = await Bun.build({
    entrypoints: [join(harness, "client.tsx")],
    target: "browser",
    format: "esm",
    naming: "preview.js",
    minify: true,
    sourcemap: "none",
    define: { "process.env.NODE_ENV": JSON.stringify("production") },
  });
  if (!build.success) throw new Error(build.logs.map(String).join("\n"));
  for (const output of build.outputs)
    await fresh(
      join(out, output.path.split("/").at(-1) ?? "preview.js"),
      new Uint8Array(await output.arrayBuffer()),
    );
  await Promise.all([
    fresh(join(out, "index.html"), await readFile(join(harness, "index.html"))),
    fresh(join(out, "preview.css"), await readFile(join(harness, "preview.css"))),
  ]);
  for (const [path, hash] of preserved)
    if (sha256(await readFile(path)) !== hash) throw new Error(`Preserved input changed: ${path}`);
  const after = await sourceSnapshot();
  if (source.sha256 !== after.sha256 || gitCommit !== (await git(["rev-parse", "HEAD"])))
    throw new Error("Source changed during export. Run again to a fresh output directory.");
  if (exports.length !== 36) throw new Error(`Expected 36 CLI exports, received ${exports.length}`);
  const files: Record<string, string> = {};
  for await (const path of new Bun.Glob("**/*").scan({ cwd: out, onlyFiles: true }))
    files[path] = sha256(await readFile(join(out, path)));
  const manifest = {
    version: 2,
    ok: true,
    generatedAt: new Date().toISOString(),
    command: [process.execPath, "scripts/preview-compact.ts", "--out", local(out)],
    serveCommand: `bun scripts/preview-compact.ts --serve --out ${local(out)} --port 4319`,
    runtime: { bun: Bun.version, platform: process.platform, arch: process.arch },
    gitCommit,
    gitStatus,
    source,
    baseline: {
      purpose: baseline.purpose,
      renderers: baseline.renderers,
      file: "baseline-verification.json",
      matched: baseline.matched,
      total: baseline.total,
      sha256: baseline.baselineSha256,
    },
    default: {
      composition: defaultVerification.composition,
      invocation: defaultVerification.invocation,
      recipes: defaultVerification.recipes,
      file: "default-verification.json",
      matched: defaultVerification.matched,
      total: defaultVerification.total,
    },
    downloads: exports
      .filter((entry) => entry.purpose === "default-download")
      .map((entry) => entry.file),
    preservedInputs: Object.fromEntries([...preserved].map(([path, hash]) => [local(path), hash])),
    inputPreparation: inputPreparation.map((input) => ({ ...input, path: local(input.path) })),
    exports,
    build: {
      tool: "Bun.build",
      target: "browser",
      outputCount: build.outputs.length,
      logs: build.logs.map(String),
    },
    files,
    verification: {
      sourceStable: true,
      inputsByteExact: true,
      svgCliMatchesApi: true,
      pngScale: 2,
      browserRun: false,
      serverStarted: false,
    },
  };
  await fresh(join(out, "manifest.json"), json(manifest));
  console.log(
    `PASS CLI: ${exports.length}/36 renders; 18 SVG byte matches; 18 PNG signature/2x dimension checks`,
  );
  console.log(`PASS isolated Bun browser build: ${build.outputs.length} output(s)`);
  console.log(`Manifest: ${local(join(out, "manifest.json"))}`);
  console.log(`Serve later: ${manifest.serveCommand}`);
  return manifest;
}

export async function serveResponse(out: string, request: Request) {
  if (request.method !== "GET" && request.method !== "HEAD")
    return new Response("Method not allowed", { status: 405 });
  let pathname: string;
  try {
    pathname = decodeURIComponent(new URL(request.url).pathname);
  } catch {
    return new Response("Bad request", { status: 400 });
  }
  const path = resolve(out, `.${pathname === "/" ? "/index.html" : pathname}`);
  if (!path.startsWith(`${out}${sep}`)) return new Response("Not found", { status: 404 });
  try {
    const canonical = await realpath(path);
    if (!canonical.startsWith(`${await realpath(out)}${sep}`) || !(await lstat(path)).isFile())
      return new Response("Not found", { status: 404 });
    const file = Bun.file(path);
    return new Response(request.method === "HEAD" ? null : file, {
      headers: {
        "Content-Type": file.type,
        "Cache-Control": "no-store",
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch {
    return new Response("Not found", { status: 404 });
  }
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  if (options.help) {
    console.log(
      "bun scripts/preview-compact.ts [--out artifacts/compact-composition-2026-09-19/FRESH-DIRECTORY]\nbun scripts/preview-compact.ts --serve --out EXISTING-COMPLETED-DIRECTORY [--port 4319]\nExport verifies 81 historical compatibility hashes and 9 default=compact checks, runs 36 evidence CLI renders and builds an isolated schematic preview with compact-only downloads.\nExisting export directories are refused. Serve is read-only and binds only 127.0.0.1.",
    );
    return;
  }
  if (options.serve && options.out) {
    const out = await checkedOutput(options.out);
    const manifest = await Bun.file(join(out, "manifest.json")).json();
    if (manifest.ok !== true || manifest.exports?.length !== 36)
      throw new Error("Not a completed compact preview export");
    const server = Bun.serve({
      hostname: "127.0.0.1",
      port: options.port,
      fetch: (request) => serveResponse(out, request),
    });
    console.log(`Local preview: http://127.0.0.1:${server.port}/`);
    return;
  }
  await generate(
    options.out ??
      join(
        artifactRoot,
        `preview-${new Date().toISOString().replaceAll(/[:.]/g, "-")}-${process.pid}`,
      ),
  );
}

if (import.meta.main) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  });
}
