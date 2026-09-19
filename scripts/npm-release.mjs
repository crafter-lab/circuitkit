import assert from "node:assert/strict";
import { appendFileSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

export function releaseIdentity(pkg) {
  assert.equal(pkg.name, "circuitkit", "Unexpected package name");
  assert.match(
    pkg.version,
    /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/,
    "Use a stable release version",
  );
  assert.notEqual(pkg.private, true, "Cannot release a private package");
  assert.equal(pkg.publishConfig?.registry, "https://registry.npmjs.org");
  assert.equal(pkg.publishConfig?.access, "public");
  assert.equal(pkg.repository?.url, "https://github.com/crafter-lab/circuitkit.git");
  return { name: pkg.name, version: pkg.version, tag: `v${pkg.version}` };
}

export async function planPublication(pkg, request = (url, options) => fetch(url, options)) {
  const identity = releaseIdentity(pkg);
  const response = await request(
    `https://registry.npmjs.org/${identity.name}/${identity.version}`,
    {
      headers: { accept: "application/json" },
      signal: AbortSignal.timeout(15_000),
    },
  );
  if (response.status === 404) return { ...identity, publish: true };
  assert.equal(response.status, 200, `Registry lookup failed: HTTP ${response.status}`);
  const published = await response.json();
  assert.equal(published.name, identity.name, "Registry package name mismatch");
  assert.equal(published.version, identity.version, "Registry version mismatch");
  return { ...identity, publish: false };
}

export function verifyPack(manifest, version) {
  assert.equal(manifest.length, 1, "Expected exactly one packed package");
  const pack = manifest[0];
  assert.equal(pack.name, "circuitkit");
  assert.equal(pack.version, version);
  assert.equal(pack.filename, `circuitkit-${version}.tgz`);
  assert.match(pack.integrity, /^sha512-[A-Za-z0-9+/]+={0,2}$/);
  const files = pack.files.map((file) => file.path);
  for (const path of files) {
    assert(
      !/(^|\/)(\.env[^/]*|\.git|\.npmrc|artifacts|node_modules|tests|scripts)(\/|$)/.test(path),
      `Private or development path in package: ${path}`,
    );
    assert(!path.endsWith(".node"), `Native binding bundled into package: ${path}`);
    assert(
      !path.startsWith("/") && !path.split("/").includes(".."),
      `Unsafe package path: ${path}`,
    );
  }
  for (const path of [
    "package.json",
    "dist/cli.js",
    "dist/index.js",
    "dist/index.d.ts",
    "dist/language/index.js",
    "dist/v2/index.d.ts",
    "agent-skills/core.md",
    "skills/circuitkit/SKILL.md",
    "docs/site/quickstart.md",
    "docs/compact-language.md",
    "examples/diagrams/audio-story.ck",
    "LICENSE",
  ]) {
    assert(files.includes(path), `Missing package file: ${path}`);
  }
  return { filename: pack.filename, integrity: pack.integrity, version, files: files.length };
}

async function main() {
  const pkg = JSON.parse(readFileSync("package.json", "utf8"));
  if (process.argv[2] === "verify-pack") {
    const pack = JSON.parse(readFileSync(process.argv[3], "utf8"));
    console.log(JSON.stringify(verifyPack(pack, releaseIdentity(pkg).version)));
    return;
  }
  assert.equal(process.argv[2], undefined, "Unknown release command");
  if (process.env.GITHUB_ACTIONS === "true") {
    assert.equal(process.env.GITHUB_REPOSITORY, "crafter-lab/circuitkit");
    assert.equal(process.env.GITHUB_REF, "refs/heads/main", "Releases must run from main");
    assert(["push", "workflow_dispatch"].includes(process.env.GITHUB_EVENT_NAME));
  }
  const plan = await planPublication(pkg);
  if (process.env.GITHUB_OUTPUT) {
    appendFileSync(process.env.GITHUB_OUTPUT, `version=${plan.version}\npublish=${plan.publish}\n`);
  }
  console.log(JSON.stringify(plan));
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  await main();
}
