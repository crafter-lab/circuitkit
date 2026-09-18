import { spawnSync } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

const output = resolve("artifacts/presentation-language");
mkdirSync(output, { recursive: true });
const checks: {
  command: string[];
  environment?: Record<string, string>;
  exitCode: number | null;
  signal: string | null;
  log: string;
}[] = [];
const steps: { name: string; command: string[]; environment?: Record<string, string> }[] = [
  {
    name: "biome",
    command: [
      "./node_modules/.bin/biome",
      "check",
      "src/language",
      "src/diagram/index.ts",
      "src/diagram/connected-layout.ts",
      "src/markdown.ts",
      "app/presentation-viewer.tsx",
      "app/presentation-viewer.css",
      "app/editor/circuit-editor.tsx",
      "app/editor/circuit-editor.css",
      "app/editor/circuit-page.tsx",
      "app/editor/page.tsx",
      "app/source-editor.tsx",
      "app/source-editor-engine.ts",
      "app/markdown/markdown-client.tsx",
      "app/markdown/page.tsx",
      "app/landing/presentation-feature.tsx",
      "app/landing/presentation-feature.css",
      "app/page.tsx",
      "tests/language-presentation.test.ts",
      "tests/presentation-ui.test.tsx",
      "tests/language-cli.test.ts",
      "tests/landing.test.tsx",
      "scripts/check-presentation.ts",
      "package.json",
    ],
  },
  { name: "types", command: ["bun", "--no-env-file", "run", "typecheck"] },
  {
    name: "regression",
    command: [
      "bun",
      "--no-env-file",
      "test",
      "tests/language-presentation.test.ts",
      "tests/presentation-ui.test.tsx",
      "tests/landing.test.tsx",
      "tests/editor-ux.test.tsx",
      "tests/language.test.ts",
      "tests/language-markdown.test.ts",
      "tests/diagram-markdown.test.ts",
      "tests/diagram-layout.test.ts",
      "tests/language-cli.test.ts",
      "tests/diagram-core.test.ts",
      "tests/diagram-examples.test.ts",
      "tests/editor.test.ts",
      "tests/editor-layout.test.tsx",
      "tests/site-shell.test.tsx",
      "tests/markdown.test.ts",
      "tests/flow-highlights.test.tsx",
    ],
  },
  { name: "package-build", command: ["bun", "--no-env-file", "run", "build", "--skip-fonts"] },
  {
    name: "node-cli",
    command: ["bun", "--no-env-file", "test", "tests/language-cli.test.ts"],
    environment: { CIRCUITKIT_TEST_CLI: resolve("dist/cli.js"), CIRCUITKIT_TEST_RUNTIME: "node" },
  },
];
for (const step of steps) {
  const result = spawnSync(step.command[0] as string, step.command.slice(1), {
    encoding: "utf8",
    maxBuffer: 32 * 1024 * 1024,
    env: { ...process.env, ...step.environment },
  });
  const log = resolve(output, `${step.name}.log`);
  writeFileSync(log, `${result.stdout ?? ""}${result.stderr ?? ""}`);
  checks.push({
    command: step.command,
    ...(step.environment ? { environment: step.environment } : {}),
    exitCode: result.status,
    signal: result.signal,
    log,
  });
  writeFileSync(
    resolve(output, "checks.json"),
    `${JSON.stringify({ ok: checks.every((check) => check.exitCode === 0), observedAt: new Date().toISOString(), checks }, null, 2)}\n`,
  );
  console.log(`${step.name}: ${result.status === 0 ? "PASS" : "FAIL"} (exit ${result.status})`);
  if (result.status !== 0) {
    console.error((result.stderr || result.stdout || String(result.error)).slice(-3000));
    process.exit(1);
  }
}
