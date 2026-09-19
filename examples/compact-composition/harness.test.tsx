import { describe, expect, test } from "bun:test";
import { mkdir, mkdtemp, readdir, readFile, stat, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { renderToStaticMarkup } from "react-dom/server";
import {
  artifactRoot,
  canonicalInput,
  generate,
  parseArgs,
  prepareInputs,
  root,
  serveResponse,
  sha256,
  verifyBaseline,
  verifyDefault,
} from "../../scripts/preview-compact.ts";
import { CircuitLessonFigure, resolveLessonFigure } from "../../src/lesson-figure.tsx";
import { CircuitLessonSequence, resolveLessonSequence } from "../../src/lesson-sequence.tsx";
import { renderSchematicSVG } from "../../src/renderer.ts";
import type { FigureDocument } from "../../src/schema.ts";
import { App } from "./app.tsx";
import { type PreviewData, recipes, themes } from "./model.ts";

async function fixture(): Promise<PreviewData> {
  const inputs: PreviewData["inputs"] = [];
  for (const recipe of recipes) {
    for (const theme of themes) {
      const source = `artifacts/compact-composition-2026-09-19/${recipe}-${theme}.json`;
      const bytes = await canonicalInput(recipe, theme);
      inputs.push({
        recipe,
        theme,
        source,
        copy: `inputs/${recipe}-${theme}.json`,
        sha256: sha256(bytes),
        document: JSON.parse(bytes.toString()),
      });
    }
  }
  const lessons: PreviewData["lessons"] = [];
  for (const name of ["rc-lowpass", "feedback-amplifier"]) {
    const source = `examples/lessons/${name}.json`;
    const bytes = await readFile(join(root, source));
    lessons.push({
      source,
      copy: `inputs/lesson-${name}.json`,
      sha256: sha256(bytes),
      document: JSON.parse(bytes.toString()),
    });
  }
  return {
    gitCommit: "test",
    sourceSha256: "test",
    baselineMatches: 81,
    cliRenders: 36,
    inputs,
    lessons,
  };
}

function success<T extends { ok: boolean; diagnostics: unknown }>(
  value: T,
): Extract<T, { ok: true }> {
  if (!value.ok) throw new Error(JSON.stringify(value.diagnostics));
  return value as Extract<T, { ok: true }>;
}

async function inputTestDirectory() {
  await mkdir(artifactRoot, { recursive: true });
  return mkdtemp(join(artifactRoot, "input-tests-"));
}

describe("compact preview harness", () => {
  test("source-controlled baseline retains the original 81-hash bytes", async () => {
    const bytes = await readFile(join(root, "examples/compact-composition/classic-baseline.json"));
    expect(sha256(bytes)).toBe("e111fbd6b37480f259f4e165baf8f2ab4da2e5a4f71c278a12159bec66b0f1d3");
    expect(Object.keys(JSON.parse(bytes.toString()))).toHaveLength(81);
    const original = Bun.file(join(artifactRoot, "classic-baseline.json"));
    if (await original.exists()) expect(Buffer.from(await original.arrayBuffer())).toEqual(bytes);
  });

  test("missing input directory initializes nine canonical byte-exact files without a local baseline", async () => {
    const directory = join(await inputTestDirectory(), "missing", "artifacts");
    expect(await Bun.file(join(directory, "rc-lowpass-geist-light.json")).exists()).toBe(false);
    const inputs = await prepareInputs(directory);
    expect(inputs).toHaveLength(9);
    expect(inputs.every((input) => input.created)).toBe(true);
    expect(await readdir(directory)).toHaveLength(9);
    expect(await Bun.file(join(directory, "classic-baseline.json")).exists()).toBe(false);
    for (const recipe of recipes) {
      for (const theme of themes) {
        const bytes = await readFile(join(directory, `${recipe}-${theme}.json`));
        expect(bytes).toEqual(await canonicalInput(recipe, theme));
        const document = JSON.parse(bytes.toString());
        expect(document.layout.preset).toBe(recipe);
        expect(document.presentation.theme.preset).toBe(theme);
      }
    }
    const before = await Promise.all(
      inputs.map(async ({ path }) => ({
        path,
        bytes: await readFile(path),
        stat: await stat(path),
      })),
    );
    const reused = await prepareInputs(directory);
    expect(reused.every((input) => !input.created)).toBe(true);
    for (const input of before) {
      expect(await readFile(input.path)).toEqual(input.bytes);
      expect((await stat(input.path)).mtimeMs).toBe(input.stat.mtimeMs);
      expect((await stat(input.path)).ino).toBe(input.stat.ino);
    }
  });

  test("stale identity, values and serialization fail before any missing input is created", async () => {
    const expected = await canonicalInput("inverting-amplifier", "geist-dark");
    const wrongTheme = JSON.parse(expected.toString());
    wrongTheme.presentation.theme.preset = "geist-light";
    const wrongValue = JSON.parse(expected.toString());
    wrongValue.circuit.components.RIN.resistance *= 2;
    for (const stale of [
      Buffer.from(`${JSON.stringify(wrongTheme, null, 2)}\n`),
      Buffer.from(`${JSON.stringify(wrongValue, null, 2)}\n`),
      Buffer.from(expected.toString().trimEnd()),
    ]) {
      const directory = await inputTestDirectory();
      const path = join(directory, "inverting-amplifier-geist-dark.json");
      await writeFile(path, stale, { flag: "wx" });
      await expect(prepareInputs(directory)).rejects.toThrow("Stale input");
      expect(await readFile(path)).toEqual(stale);
      expect(await readdir(directory)).toEqual(["inverting-amplifier-geist-dark.json"]);
    }
  });

  test("all 81 historical hashes match legacy, explicit classic schematic and figure outputs", async () => {
    const result = await verifyBaseline();
    expect(result.ok).toBe(true);
    expect(result.total).toBe(81);
    expect(result.matched).toBe(81);
    expect(result.purpose).toBe("historical-compatibility");
    expect(result.renderers).toEqual({
      legacy: "renderSVG(input)",
      schematic: 'renderSchematicSVG(input, { composition: "classic" })',
      figure: "renderFigureSVG(input)",
    });
  });

  test("no-option schematic default equals compact for three recipes in every theme", async () => {
    const result = await verifyDefault();
    expect(result.ok).toBe(true);
    expect(result.composition).toBe("compact");
    expect(result.invocation).toBe("renderSchematicSVG(document)");
    expect(result.recipes).toEqual(recipes);
    expect(result.total).toBe(9);
    expect(result.matched).toBe(9);
    expect(new Set(result.checks.map((check) => check.key)).size).toBe(9);
  });

  test("arguments are explicit and serving never defaults to a fresh export", () => {
    expect(parseArgs([])).toMatchObject({ serve: false, out: undefined, port: 4319 });
    expect(
      parseArgs([
        "--serve",
        "--out",
        "artifacts/compact-composition-2026-09-19/run",
        "--port",
        "4320",
      ]),
    ).toMatchObject({ serve: true, port: 4320 });
    for (const args of [["--serve"], ["--out"], ["--port", "x"], ["--port", "80"], ["--overwrite"]])
      expect(() => parseArgs(args)).toThrow();
  });

  test("export refuses the baseline directory, existing directories and paths outside ownership", async () => {
    await expect(generate(artifactRoot)).rejects.toThrow("--out must be a child");
    await expect(generate(root)).rejects.toThrow("--out must be a child");
    const directory = await inputTestDirectory();
    const file = join(directory, "existing.json");
    await writeFile(file, "{}\n", { flag: "wx" });
    await expect(generate(file)).rejects.toThrow("not a regular directory");
    await expect(generate(directory)).rejects.toThrow("EEXIST");
  });

  test("same source object renders both modes unchanged for all nine recipe/theme inputs", async () => {
    const data = await fixture();
    for (const input of data.inputs) {
      const original = JSON.stringify(input.document);
      const classic = success(renderSchematicSVG(input.document, { composition: "classic" }));
      const compact = success(renderSchematicSVG(input.document, { composition: "compact" }));
      expect(compact.svg).not.toBe(classic.svg);
      expect(compact.circuit).toEqual(classic.circuit);
      expect(compact.document).toEqual(classic.document);
      expect(compact.endpoints).toBeDefined();
      expect(classic.endpoints).toBeDefined();
      expect(JSON.stringify(input.document)).toBe(original);
    }
  });

  test("React preview contains one default SVG per recipe, compact-only downloads and lesson controls", async () => {
    const data = await fixture();
    const before = JSON.stringify(data);
    const html = renderToStaticMarkup(<App data={data} />);
    for (const input of data.inputs.filter((input) => input.theme === "geist-light")) {
      const current = success(renderSchematicSVG(input.document));
      const compact = success(renderSchematicSVG(input.document, { composition: "compact" }));
      expect(current.svg).toBe(compact.svg);
      expect(html.split(current.svg)).toHaveLength(2);
      expect(html).not.toContain(
        success(renderSchematicSVG(input.document, { composition: "classic" })).svg,
      );
      expect(html).toContain(input.sha256);
      for (const format of ["svg", "png"])
        expect(html).toContain(
          `href="${input.recipe}-${input.theme}-compact.${format}" download=""`,
        );
    }
    expect(html.match(/class="schematic-panel"/g)).toHaveLength(3);
    expect(html.match(/download=""/g)).toHaveLength(6);
    expect(html.match(/data-mode="interactive"/g)).toHaveLength(2);
    expect(html.match(/data-sequence-mode="interactive"/g)).toHaveLength(2);
    expect(html.match(/type="radio"/g)).toHaveLength(3);
    expect(html).not.toContain('role="alert"');
    expect(html).not.toMatch(/classic|comparison|paired|default outputs unchanged/i);
    expect(html).not.toMatch(/<h[1-6][^>]*>[^<]*compact/i);
    expect(JSON.stringify(data)).toBe(before);
  });

  test("preview source and HTML entrypoint expose no composition switch or comparison pages", async () => {
    const source = await readFile(join(root, "examples/compact-composition/app.tsx"), "utf8");
    expect(source).not.toMatch(/composition[=:]/);
    expect(source).toContain("renderSchematicSVG(input.document)");
    const html = await readFile(join(root, "examples/compact-composition/index.html"), "utf8");
    expect(html).toContain("<title>CircuitKit schematic preview</title>");
    expect(html).not.toMatch(/classic|compact|comparison|paired/i);
  });

  test("no-prop lessons match compact with authored annotations, net selections and all steps in every theme", async () => {
    for (const lesson of (await fixture()).lessons) {
      const original = JSON.stringify(lesson.document);
      for (const theme of themes) {
        const document: FigureDocument = {
          ...lesson.document,
          presentation: { ...lesson.document.presentation, theme: { preset: theme } },
        };
        expect(renderToStaticMarkup(<CircuitLessonFigure document={document} />)).toBe(
          renderToStaticMarkup(<CircuitLessonFigure document={document} composition="compact" />),
        );
        expect(renderToStaticMarkup(<CircuitLessonSequence document={document} />)).toBe(
          renderToStaticMarkup(<CircuitLessonSequence document={document} composition="compact" />),
        );
        for (const annotation of document.presentation.annotations?.nets ?? []) {
          const selected = success(
            resolveLessonFigure(document, annotation.net, { layout: "compact" }),
          );
          expect(selected.svg).toBe(
            success(
              resolveLessonFigure(document, annotation.net, {
                layout: "compact",
                composition: "compact",
              }),
            ).svg,
          );
          expect(selected.annotations?.nets.some((net) => net.net === annotation.net)).toBe(true);
          const props = { document, activeNet: annotation.net, onActiveNetChange: () => {} };
          const html = renderToStaticMarkup(<CircuitLessonFigure {...props} />);
          expect(html).toBe(
            renderToStaticMarkup(<CircuitLessonFigure {...props} composition="compact" />),
          );
          expect(html).not.toContain('role="alert"');
          expect(html).toContain(`data-hit-net="${annotation.net}"`);
        }
        for (const step of document.presentation.steps ?? []) {
          const selected = success(resolveLessonSequence(document, step.id));
          expect(success(renderSchematicSVG(selected.document, { annotations: true })).svg).toBe(
            success(
              renderSchematicSVG(selected.document, { composition: "compact", annotations: true }),
            ).svg,
          );
          const html = renderToStaticMarkup(
            <CircuitLessonSequence document={document} activeStep={step.id} />,
          );
          expect(html).toBe(
            renderToStaticMarkup(
              <CircuitLessonSequence
                document={document}
                activeStep={step.id}
                composition="compact"
              />,
            ),
          );
          expect(html).not.toContain('role="alert"');
          expect(html).toContain('aria-current="step"');
        }
      }
      expect(JSON.stringify(lesson.document)).toBe(original);
    }
  });

  test("HTTP file handler works without starting a server and rejects unsafe requests", async () => {
    const out = join(root, "examples/compact-composition");
    const response = await serveResponse(out, new Request("http://127.0.0.1/"));
    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toContain("text/html");
    expect(await response.text()).toContain('src="./preview.js"');
    expect(
      (await serveResponse(out, new Request("http://127.0.0.1/", { method: "POST" }))).status,
    ).toBe(405);
    expect(
      (await serveResponse(out, new Request("http://127.0.0.1/%2e%2e%2f%2e%2e%2fpackage.json")))
        .status,
    ).toBe(404);
    expect((await serveResponse(out, new Request("http://127.0.0.1/%E0%A4%A"))).status).toBe(400);
    expect((await serveResponse(out, new Request("http://127.0.0.1/missing"))).status).toBe(404);
    expect(
      await (await serveResponse(out, new Request("http://127.0.0.1/", { method: "HEAD" }))).text(),
    ).toBe("");
  });

  test.skipIf(!process.env.COMPACT_PREVIEW_OUT)(
    "completed export has 36 real CLI receipts and byte-exact inputs",
    async () => {
      const out = resolve(root, process.env.COMPACT_PREVIEW_OUT ?? "");
      const manifest: Awaited<ReturnType<typeof generate>> = await Bun.file(
        join(out, "manifest.json"),
      ).json();
      expect(manifest.ok).toBe(true);
      expect(manifest.exports).toHaveLength(36);
      expect(new Set(manifest.exports.map((entry: { file: string }) => entry.file)).size).toBe(36);
      expect(manifest.version).toBe(2);
      expect(manifest.baseline.matched).toBe(81);
      expect(manifest.baseline.purpose).toBe("historical-compatibility");
      expect(manifest.baseline.renderers.schematic).toContain('composition: "classic"');
      expect(manifest.default).toMatchObject({
        composition: "compact",
        recipes: [...recipes],
        matched: 9,
        total: 9,
        invocation: "renderSchematicSVG(document)",
      });
      const defaults = await Bun.file(join(out, manifest.default.file)).json();
      expect(defaults.ok).toBe(true);
      expect(defaults.checks).toHaveLength(9);
      expect(manifest.downloads).toHaveLength(18);
      expect(manifest.downloads.every((file) => /-compact\.(svg|png)$/.test(file))).toBe(true);
      expect(Object.keys(manifest.files).some((file) => file.includes("comparison"))).toBe(false);
      const data: PreviewData = await Bun.file(join(out, "data.json")).json();
      const html = renderToStaticMarkup(<App data={data} />);
      expect(html).not.toMatch(/classic|comparison|default outputs unchanged/i);
      for (const match of html.matchAll(/href="([^"]+)" download=""/g)) {
        if (!match[1]) throw new Error("Missing download href");
        expect(manifest.downloads).toContain(match[1]);
      }
      for (const [path, expected] of Object.entries(manifest.files))
        expect(sha256(await readFile(join(out, path)))).toBe(expected);
      for (const [path, expected] of Object.entries(manifest.preservedInputs))
        expect(sha256(await readFile(join(root, path)))).toBe(expected);
      for (const entry of manifest.exports) {
        expect(entry.purpose).toBe(
          entry.composition === "compact" ? "default-download" : "compatibility-evidence",
        );
        expect(manifest.downloads.includes(entry.file)).toBe(entry.composition === "compact");
        expect(entry.exitCode).toBe(0);
        expect(sha256(await readFile(join(out, entry.file)))).toBe(entry.sha256);
        const receipt = await Bun.file(join(out, entry.receipt)).json();
        expect(receipt.exitCode).toBe(0);
        expect(JSON.parse(receipt.stdout).ok).toBe(true);
        expect(receipt.argv).toContain("src/cli.ts");
        expect(receipt.argv).not.toContain("--overwrite");
        expect(receipt.sourceSha256).toBe(manifest.source.sha256);
        expect(receipt.inputSha256).toBe(entry.inputSha256);
        expect(
          sha256(await readFile(join(out, "inputs", `${entry.recipe}-${entry.theme}.json`))),
        ).toBe(entry.inputSha256);
      }
      await expect(generate(out)).rejects.toThrow("EEXIST");
    },
  );
});
