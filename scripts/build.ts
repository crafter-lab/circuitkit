import { chmodSync, mkdirSync, readdirSync, readFileSync, unlinkSync } from "node:fs";
import { createRequire } from "node:module";
import { basename, dirname, join } from "node:path";

const { parse } = createRequire(import.meta.url)("next/dist/compiled/acorn") as {
  parse(
    source: string,
    options: { ecmaVersion: "latest"; sourceType: "module" },
  ): {
    body: {
      type: string;
      start: number;
      end: number;
      expression?: { type: string; value?: unknown };
    }[];
  };
};

export function normalizeReactDirectives(source: string): string {
  const parsed = parse(source, { ecmaVersion: "latest", sourceType: "module" });
  let normalized = source;
  for (const statement of [...parsed.body].reverse()) {
    if (
      statement.type === "ExpressionStatement" &&
      statement.expression?.type === "Literal" &&
      statement.expression.value === "use client"
    ) {
      normalized = normalized.slice(0, statement.start) + normalized.slice(statement.end);
    }
  }
  return `"use client";\n${normalized.trimStart()}`;
}

if (import.meta.main) {
  if (!process.argv.includes("--skip-fonts")) {
    const prepare = Bun.spawnSync([process.execPath, "scripts/prepare-fonts.ts"], {
      stdout: "inherit",
      stderr: "inherit",
    });
    if (prepare.exitCode !== 0) process.exit(prepare.exitCode);
  }
  mkdirSync("dist", { recursive: true });
  const cliSubpaths: Record<string, string[]> = {
    cli: ["index", "png", "markdown", "diagram/index", "language/index", "v2/png"],
    "education-cli": ["v2/index", "v2/schema", "v2/png"],
  };
  for (const entry of [
    "index",
    "react",
    "png",
    "markdown",
    "share",
    "diagram/index",
    "language/index",
    "cli",
    "v2/index",
    "v2/render",
    "v2/schema",
    "v2/react",
    "v2/png",
    "integrations/gradual",
    "education-cli",
  ]) {
    const subpaths = cliSubpaths[entry];
    const isReact = entry === "react" || entry === "v2/react";
    const isPNG = entry === "png" || entry === "v2/png";
    const result = await Bun.build({
      entrypoints: [`src/${entry}.${isReact ? "tsx" : "ts"}`],
      outdir: join("dist", dirname(entry)),
      naming: `${basename(entry)}.js`,
      target: subpaths || isPNG ? "node" : "browser",
      format: "esm",
      conditions: entry === "markdown" ? ["worker"] : [],
      external: subpaths
        ? ["zod", "react", ...subpaths.map((path) => `./${path}.ts`)]
        : isPNG
          ? ["zod", "@resvg/resvg-js"]
          : ["zod", "react", "react/jsx-runtime"],
      plugins: subpaths
        ? [
            {
              name: "cli-subpaths",
              setup(build) {
                build.onResolve({ filter: /^\.\/.*\.ts$/ }, ({ path }) => {
                  if (subpaths.some((entry) => path === `./${entry}.ts`))
                    return { path, external: true };
                });
              },
            },
          ]
        : [],
      define: { "process.env.NODE_ENV": '"production"' },
      minify: false,
    });
    if (!result.success) {
      console.error(result.logs);
      process.exit(1);
    }
    if (result.outputs.some((output) => output.path.endsWith(".node")))
      throw new Error("Native bindings must remain external, not emitted into dist.");
  }
  for (const [name, subpaths] of Object.entries(cliSubpaths)) {
    const path = `dist/${name}.js`;
    let cli = await Bun.file(path).text();
    for (const entry of subpaths) cli = cli.replaceAll(`"./${entry}.ts"`, `"./${entry}.js"`);
    for (const entry of subpaths)
      if (!cli.includes(`"./${entry}.js"`) || cli.includes(`"./${entry}.ts"`))
        throw new Error(`CLI must retain its external ./${entry}.js entry.`);
    if (cli.includes("@resvg/") || cli.includes("mdast-util-from-markdown"))
      throw new Error("CLI must load optional dependencies through external subpaths.");
    if (!cli.startsWith("#!/usr/bin/env node\n"))
      throw new Error(`CLI must retain its Node shebang: ${path}`);
    const png = subpaths.find((entry) => entry === "png" || entry.endsWith("/png"));
    if (!png || !cli.includes(`import("./${png}.js")`))
      throw new Error(`CLI must retain its dynamic PNG import: ${path}`);
    await Bun.write(path, cli);
    chmodSync(path, 0o755);
  }
  for (const entry of ["react", "v2/react"]) {
    const path = `dist/${entry}.js`;
    const react = await Bun.file(path).text();
    await Bun.write(path, normalizeReactDirectives(react));
  }
  const types = Bun.spawnSync(["bun", "x", "--no-install", "tsc", "-p", "tsconfig.build.json"], {
    stdout: "inherit",
    stderr: "inherit",
  });
  if (types.exitCode !== 0) process.exit(types.exitCode);
  function distEntries(directory: string): { path: string; name: string; regular: boolean }[] {
    return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
      const path = join(directory, entry.name);
      const item = { path, name: entry.name, regular: entry.isFile() };
      return entry.isDirectory() ? [item, ...distEntries(path)] : [item];
    });
  }
  const entries = distEntries("dist");
  const modules = entries
    .filter((entry) => /\.[cm]?js$/.test(entry.name))
    .map((entry) => {
      if (!entry.regular) throw new Error(`Cannot verify native references in ${entry.path}`);
      return readFileSync(entry.path, "utf8");
    });
  const staleNative = entries.filter((entry) => /^resvgjs\..*\.node$/.test(entry.name));
  for (const entry of staleNative) {
    if (!/^resvgjs\.[a-z0-9-]+-[a-z0-9]{8}\.node$/.test(entry.name))
      throw new Error(
        `Unrecognized native output requires inspection before packing: ${entry.path}`,
      );
    if (!entry.regular || modules.some((source) => source.includes(entry.name)))
      throw new Error(`Refusing to remove non-regular or referenced native output: ${entry.path}`);
  }
  for (const entry of staleNative) {
    unlinkSync(entry.path);
    console.log(`Removed stale generated native output: ${entry.path}`);
  }
  console.log(
    "Built legacy core, React, CLI, PNG, Markdown, share; diagram compiler; v2 core, public, React, PNG, education CLI, Gradual and TypeScript declarations.",
  );
}
