import { createHash } from "node:crypto";
import {
  chmodSync,
  copyFileSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  realpathSync,
  statSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";

if (process.argv.includes("--package")) {
  await import("../artifacts/education-consumer/qualify-package.ts");
  process.exit(0);
}

const repo = resolve(import.meta.dir, "..");
const artifactRoot = join(repo, "artifacts/education-consumer");
const runId = process.argv[2] ?? `run-${Date.now()}`;
if (!/^[A-Za-z0-9_-]+$/.test(runId)) throw new Error("Invalid run ID");
const artifacts = join(artifactRoot, "runs", runId);
const snapshot = join(repo, "artifacts/gradual-corpus/snapshot");
const metadata = await Bun.file(join(snapshot, "metadata.json")).json();
const manifest = await Bun.file(join(repo, "artifacts/gradual-corpus/manifest.json")).json();
const hash = (path: string) => createHash("sha256").update(readFileSync(path)).digest("hex");
const write = async (path: string, value: string) => {
  mkdirSync(dirname(path), { recursive: true });
  await Bun.write(path, value);
};
const json = (value: unknown) => JSON.stringify(value, null, 2);
mkdirSync(dirname(artifacts), { recursive: true });
mkdirSync(artifacts);
if (
  manifest.exactFigures.length !== 344 ||
  manifest.occurrences.length !== 652 ||
  manifest.questionSolutionPairs.length !== 319 ||
  metadata.files.length !== 37
)
  throw new Error("Unexpected snapshot counts");
for (const file of metadata.files) {
  const path = join(snapshot, file.path);
  if (hash(path) !== file.sha256 || (statSync(path).mode & 0o222) !== 0)
    throw new Error(`Snapshot integrity: ${file.path}`);
}
const consumer = mkdtempSync(join(tmpdir(), "education-consumer-"));
await write(
  join(artifacts, "location.json"),
  json({ consumer, repo, phase: "pre-peer-qualification", created: new Date().toISOString() }),
);
const pkg = await Bun.file(join(repo, "package.json")).json();
const dependencies = {
  ...metadata.dependencies,
  zod: pkg.dependencies.zod,
  "server-only": "0.0.1",
};
await write(
  join(consumer, "package.json"),
  json({
    name: "isolated-education-consumer",
    private: true,
    type: "module",
    scripts: {
      build: "next build --webpack",
      start: "next start --hostname 127.0.0.1 --port 3231",
      typecheck: "tsc --noEmit",
    },
    dependencies,
    devDependencies: {
      typescript: pkg.devDependencies.typescript,
      "@types/node": pkg.devDependencies["@types/node"],
      "@types/react": "19.2.14",
      "@types/react-dom": "19.2.3",
    },
  }),
);
const install = Bun.spawnSync([process.execPath, "--no-env-file", "install"], {
  cwd: consumer,
  stdout: "pipe",
  stderr: "pipe",
});
await write(
  join(artifacts, "install.log"),
  `${new TextDecoder().decode(install.stdout)}\n${new TextDecoder().decode(install.stderr)}\nexit=${install.exitCode}\n`,
);
if (install.exitCode !== 0)
  throw new Error(`Consumer install failed; see ${artifacts}/install.log`);
const copied: { path: string; sha256: string; realpath: string }[] = [];
for await (const entry of new Bun.Glob("**/*").scan({ cwd: join(repo, "dist"), onlyFiles: true })) {
  if (!entry.endsWith(".js") && !entry.endsWith(".d.ts")) continue;
  const source = join(repo, "dist", entry);
  const destination = join(consumer, "compiled", entry);
  mkdirSync(dirname(destination), { recursive: true });
  copyFileSync(source, destination);
  if (hash(source) !== hash(destination)) throw new Error(`Compiled bytes differ: ${entry}`);
  copied.push({ path: entry, sha256: hash(source), realpath: realpathSync(destination) });
}
for (const file of metadata.files) {
  const destination = join(consumer, "original", file.path.slice("source/".length));
  mkdirSync(dirname(destination), { recursive: true });
  copyFileSync(join(snapshot, file.path), destination);
  chmodSync(destination, 0o444);
  if (hash(destination) !== file.sha256) throw new Error(`Copied original differs: ${file.path}`);
}
await write(join(consumer, "test-capability"), crypto.randomUUID() + crypto.randomUUID());
chmodSync(join(consumer, "test-capability"), 0o600);
await write(join(consumer, "data/manifest.json"), json(manifest));
copyFileSync(join(repo, "examples/voltage-divider.json"), join(consumer, "data/legacy.json"));
for await (const entry of new Bun.Glob("**/*").scan({
  cwd: join(artifactRoot, "template"),
  onlyFiles: true,
})) {
  await write(join(consumer, entry), await Bun.file(join(artifactRoot, "template", entry)).text());
}
const resolveProof = Bun.spawnSync([process.execPath, "--no-env-file", "resolution.ts"], {
  cwd: consumer,
  stdout: "pipe",
  stderr: "pipe",
});
await write(join(artifacts, "resolution.json"), new TextDecoder().decode(resolveProof.stdout));
if (resolveProof.exitCode !== 0) throw new Error(new TextDecoder().decode(resolveProof.stderr));
copyFileSync(join(consumer, "bun.lock"), join(artifacts, "consumer.bun.lock"));
await write(
  join(artifacts, "integrity.json"),
  json({
    phase: "pre-peer-qualification-not-package-install",
    packagePeer: pkg.peerDependencies.react,
    noCircuitkitManifestInstalled: true,
    consumer,
    counts: { exact: 344, occurrences: 652, pairs: 319, snapshotFiles: 37 },
    compiled: copied,
    original: metadata.files,
    snapshotMetadataHash: hash(join(snapshot, "metadata.json")),
    manifestHash: hash(join(repo, "artifacts/gradual-corpus/manifest.json")),
  }),
);
await write(join(artifactRoot, "current.json"), json({ runId, artifacts, consumer }));
console.log(
  json({
    consumer,
    copiedCompiledFiles: copied.length,
    next: "Run fixtures.ts, typecheck and build only inside consumer; then own next start shell handle.",
  }),
);
