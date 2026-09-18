import { expect, test } from "bun:test";
import { spawnSync } from "node:child_process";
import { copyFileSync, existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

test("private qualification is opt-in and missing fixtures fail before creating output", () => {
  const root = mkdtempSync(join(tmpdir(), "circuitkit-harness-"));
  try {
    mkdirSync(join(root, "scripts"));
    const entry = join(root, "scripts", "qualify-education.ts");
    copyFileSync(new URL("../scripts/qualify-education.ts", import.meta.url), entry);
    const absent = spawnSync(process.execPath, [entry, "--package", "sample"], {
      encoding: "utf8",
    });
    expect(absent.status).toBe(1);
    expect(existsSync(join(root, "artifacts"))).toBe(false);
    const harness = join(root, "artifacts", "education-consumer");
    mkdirSync(harness, { recursive: true });
    writeFileSync(
      join(harness, "qualify-package.ts"),
      "console.log(JSON.stringify({ runId: process.argv[2] }));",
    );
    const present = spawnSync(process.execPath, [entry, "--package", "sample"], {
      encoding: "utf8",
    });
    expect(present.status).toBe(0);
    expect(JSON.parse(present.stdout)).toEqual({ runId: "sample" });
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
