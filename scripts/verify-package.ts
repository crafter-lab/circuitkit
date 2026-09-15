import { strict as assert } from "node:assert";
import { cpSync, mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { loadExample, renderSVG } from "../src/index.ts";

const root = process.cwd();
const temporary = mkdtempSync(join(tmpdir(), "circuitkit-consumer-"));
cpSync("examples/react-consumer", temporary, {
  recursive: true,
  filter: (path) => !path.includes("node_modules") && !path.includes(".next"),
});
const manifest = await Bun.file(join(temporary, "package.json")).json();
manifest.dependencies.circuitkit = `file:${resolve("artifacts/circuitkit-0.1.0.tgz")}`;
await Bun.write(join(temporary, "package.json"), JSON.stringify(manifest, null, 2));
function command(args: string[]) {
  const result = Bun.spawnSync(args, { cwd: temporary, stdout: "inherit", stderr: "inherit" });
  assert.equal(result.exitCode, 0, args.join(" "));
}
command(["bun", "install"]);
command(["bun", "run", "typecheck"]);
command(["bun", "run", "build"]);
const cli = join(temporary, "node_modules/.bin/circuitkit");
const input = join(temporary, "rc.json");
await Bun.write(input, JSON.stringify(loadExample("rc-lowpass")));
const render = Bun.spawnSync([cli, "render", input, "--out", join(temporary, "rc.svg"), "--json"], {
  cwd: temporary,
  stdout: "pipe",
  stderr: "pipe",
});
assert.equal(render.exitCode, 0, render.stderr.toString());
const body = JSON.parse(render.stdout.toString());
const expected = renderSVG(loadExample("rc-lowpass"));
assert(expected.ok);
assert.equal(body.svg, expected.svg);
assert.equal(await Bun.file(join(temporary, "rc.svg")).text(), expected.svg);
for (const file of [
  "fonts/Geist-Regular.ttf",
  "fonts/GeistMono-Regular.ttf",
  "fonts/OFL.txt",
  "fonts/LICENSE.txt",
  "LICENSE",
  "NOTICE",
  "THIRD_PARTY_LICENSES.md",
  "dist/index.d.ts",
  "dist/react.d.ts",
])
  assert(await Bun.file(join(temporary, "node_modules/circuitkit", file)).exists(), file);
await Bun.write(
  join(temporary, "parity.tsx"),
  `import { strict as assert } from 'node:assert';
import { renderToStaticMarkup } from 'react-dom/server';
import { loadExample, renderSVG, type FigureDocument } from 'circuitkit';
import { CircuitFigure } from 'circuitkit/react';
const document:FigureDocument=loadExample('rc-lowpass');
const result=renderSVG(document); assert(result.ok);
assert.equal(renderToStaticMarkup(<CircuitFigure document={document}/>), '<div>'+result.svg+'</div>');
console.log('PASS packed React/core parity');
`,
);
command(["bun", "parity.tsx"]);
command(["bun", "run", "typecheck"]);
const coreOnly = mkdtempSync(join(tmpdir(), "circuitkit-core-"));
await Bun.write(
  join(coreOnly, "package.json"),
  JSON.stringify({
    type: "module",
    dependencies: { circuitkit: `file:${resolve("artifacts/circuitkit-0.1.0.tgz")}` },
  }),
);
const install = Bun.spawnSync(["bun", "install", "--production"], {
  cwd: coreOnly,
  stdout: "inherit",
  stderr: "inherit",
});
assert.equal(install.exitCode, 0);
assert(
  !(await Bun.file(join(coreOnly, "node_modules/react/package.json")).exists()),
  "core must not install React",
);
const core = Bun.spawnSync(
  [
    "node",
    "--input-type=module",
    "-e",
    "import {renderSVG,loadExample} from 'circuitkit'; if(!renderSVG(loadExample('rc-lowpass')).ok)process.exit(1); console.log('PASS pure core in Node without React');",
  ],
  { cwd: coreOnly, stdout: "inherit", stderr: "inherit" },
);
assert.equal(core.exitCode, 0);
await Bun.write(
  join(root, "artifacts/package-check.json"),
  JSON.stringify(
    {
      ok: true,
      consumer: temporary,
      coreOnly,
      checks: [
        "clean tarball install",
        "consumer strict types",
        "Next production build",
        "installed Node-shebang bin",
        "CLI SVG equality",
        "bundled TTFs and licenses",
        "packed React/core parity",
        "Node core without React",
      ],
    },
    null,
    2,
  ),
);
console.log(`PASS package verification. Consumer: ${temporary}`);
