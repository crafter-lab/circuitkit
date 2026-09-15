import { chmodSync, mkdirSync } from "node:fs";

const prepare = Bun.spawnSync([process.execPath, "scripts/prepare-fonts.ts"], {
  stdout: "inherit",
  stderr: "inherit",
});
if (prepare.exitCode !== 0) process.exit(prepare.exitCode);
mkdirSync("dist", { recursive: true });
for (const entry of ["index", "react", "cli"]) {
  const result = await Bun.build({
    entrypoints: [`src/${entry}.${entry === "react" ? "tsx" : "ts"}`],
    outdir: "dist",
    naming: `${entry}.js`,
    target: entry === "cli" ? "node" : "browser",
    format: "esm",
    external:
      entry === "cli" ? ["zod", "react", "./index.ts"] : ["zod", "react", "react/jsx-runtime"],
    define: { "process.env.NODE_ENV": '"production"' },
    minify: false,
  });
  if (!result.success) {
    console.error(result.logs);
    process.exit(1);
  }
}
const cli = await Bun.file("dist/cli.js").text();
await Bun.write("dist/cli.js", cli.replaceAll('"./index.ts"', '"./index.js"'));
const react = await Bun.file("dist/react.js").text();
if (!react.startsWith('"use client"')) await Bun.write("dist/react.js", `"use client";\n${react}`);
chmodSync("dist/cli.js", 0o755);
const types = Bun.spawnSync(["bun", "x", "--no-install", "tsc", "-p", "tsconfig.build.json"], {
  stdout: "inherit",
  stderr: "inherit",
});
if (types.exitCode !== 0) process.exit(types.exitCode);
console.log("Built core, React, CLI and TypeScript declarations.");
