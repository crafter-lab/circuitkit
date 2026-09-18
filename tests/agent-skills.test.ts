import { expect, test } from "bun:test";
import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const cli = process.env.CIRCUITKIT_TEST_CLI ?? resolve("src/cli.ts");
const runtime = process.env.CIRCUITKIT_TEST_RUNTIME ?? process.execPath;
function run(args: string[]) {
  const result = spawnSync(runtime, [cli, ...args], { encoding: "utf8" });
  expect(result.error).toBeUndefined();
  expect(result.signal).toBeNull();
  expect(result.stdout).not.toContain("\u001b");
  return result;
}

test("installed package version and guide discovery share a versioned machine envelope", () => {
  const version = JSON.parse(run(["--version"]).stdout);
  const result = run(["skills", "list"]);
  expect(result.status).toBe(0);
  const body = JSON.parse(result.stdout);
  expect(body.ok).toBe(true);
  expect(body.version).toBe(1);
  expect(body.packageVersion).toBe(version.packageVersion);
  expect(body.skills.map((skill: { name: string }) => skill.name)).toEqual([
    "core",
    "language",
    "presentation",
    "education",
    "legacy",
  ]);
  for (const skill of body.skills) {
    const guide = run(["skills", "get", skill.name, "--json"]);
    expect(guide.status).toBe(0);
    const decoded = JSON.parse(guide.stdout);
    expect(decoded.packageVersion).toBe(body.packageVersion);
    expect(decoded.name).toBe(skill.name);
    expect(decoded.content.length).toBeGreaterThan(100);
    expect(decoded.diagnostics).toEqual([]);
  }
});

test("plain text and singular alias return exact packaged guide bytes", () => {
  const source = readFileSync(new URL("../agent-skills/core.md", import.meta.url), "utf8");
  for (const command of ["skill", "skills"]) {
    const result = run([command, "get", "core", "--text"]);
    expect(result.status).toBe(0);
    expect(result.stdout).toBe(source);
    expect(result.stderr).toBe("");
  }
});

test.each(
  [
    ["skills"],
    ["skills", "get"],
    ["skills", "get", "../../.env.local"],
    ["skills", "get", "/etc/passwd"],
    ["skills", "get", "CORE"],
    ["skills", "list", "extra"],
    ["skills", "get", "core", "extra"],
    ["skills", "get", "core", "--out", "never-written.md"],
    ["skills", "get", "core", "--overwrite"],
    ["skills", "list", "--text"],
    ["skills", "get", "core", "--json", "--text"],
    ["grammar", "--text"],
    ["--version", "--out", "never-written.json"],
  ].map((args) => ({ args })),
)("invalid guide usage refuses before reading or writing: $args", ({ args }) => {
  const result = run(args);
  expect(result.status).toBe(2);
  const body = JSON.parse(result.stdout);
  expect(body.ok).toBe(false);
  expect(body.content).toBeUndefined();
  expect(body.diagnostics.length).toBeGreaterThan(0);
});
