import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { renderCircuitSource } from "circuitkit/language";

const bin = resolve("node_modules/.bin/circuitkit");
const expectedVersion = JSON.parse(
  readFileSync("node_modules/circuitkit/package.json", "utf8"),
).version;
const source = readFileSync("node_modules/circuitkit/examples/diagrams/audio-story.ck", "utf8");
writeFileSync("audio.ck", source, { flag: "wx" });
let checks = 0;
function run(args) {
  const result = spawnSync(bin, args, {
    encoding: "utf8",
    env: { ...process.env, NODE_PATH: "", NO_COLOR: "1" },
  });
  assert.equal(result.error, undefined);
  assert.equal(result.signal, null);
  assert(!result.stdout.includes("\u001b"));
  checks++;
  return { ...result, body: JSON.parse(result.stdout) };
}
const version = run(["--version"]);
assert.equal(version.status, 0);
assert.equal(version.body.packageVersion, expectedVersion);
const skills = run(["skills", "list"]);
assert.equal(skills.status, 0);
for (const { name } of skills.body.skills) {
  const result = run(["skills", "get", name]);
  assert.equal(result.status, 0);
  assert.equal(result.body.packageVersion, expectedVersion);
  assert(result.body.content.length > 100);
}
const guide = execFileSync(bin, ["skill", "get", "core", "--text"], { encoding: "utf8" });
assert.equal(guide, readFileSync("node_modules/circuitkit/agent-skills/core.md", "utf8"));
checks++;
assert.equal(run(["skills", "get", "../package.json"]).status, 2);
assert.equal(run(["validate", "audio.ck", "--json"]).status, 0);
const hashes = {};
for (const view of ["blocks", "wiring", "schematic"]) {
  const expected = renderCircuitSource(source, { view });
  assert(expected.ok);
  const rendered = run(["render", "audio.ck", "--view", view, "--out", `${view}.svg`, "--json"]);
  assert.equal(rendered.status, 0);
  assert.equal(readFileSync(`${view}.svg`, "utf8"), expected.svg);
  hashes[view] = createHash("sha256").update(expected.svg).digest("hex");
}
assert.equal(run(["render", "audio.ck", "--out", "wiring.svg"]).status, 2);
const png = run(["render", "audio.ck", "--format", "png", "--out", "audio.png"]);
assert.equal(png.status, 0);
assert.deepEqual([...readFileSync("audio.png").subarray(0, 8)], [137, 80, 78, 71, 13, 10, 26, 10]);
const receipt = {
  ok: true,
  runtime: process.version,
  executable: bin,
  checks,
  hashes,
  png: { width: png.body.width, height: png.body.height },
};
writeFileSync("receipt.json", `${JSON.stringify(receipt, null, 2)}\n`);
console.log(JSON.stringify(receipt));
