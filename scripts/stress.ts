import { mkdir } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { getGalleryCases } from "../app/gallery/corpus.ts";
import { runStress } from "../app/gallery/stress.ts";

const runner = runStress();
let next = runner.next();
while (!next.done) next = runner.next();
const report = next.value;
const directory = new URL("../artifacts/gallery/", import.meta.url);
await mkdir(directory, { recursive: true });
const file = new URL("stress-report.json", directory);
const json = JSON.stringify(
  report,
  (_key, value: unknown) => {
    if (typeof value === "number" && (!Number.isFinite(value) || Object.is(value, -0))) {
      return { $number: Object.is(value, -0) ? "-0" : String(value) };
    }
    if (value === undefined) return { $undefined: true };
    return value;
  },
  2,
);
await Bun.write(file, `${json}\n`);
const gallery = getGalleryCases();
const topologies = new Set(gallery.map(({ recipe }) => recipe)).size;
const scenarios = new Set(gallery.map(({ scenarioId }) => scenarioId)).size;
console.log(
  `Gallery: ${gallery.length} cases, ${scenarios} scenarios across ${topologies} topologies. Stress: ${report.completed}/${report.total} completed; ${report.passed} passed, ${report.failed} unexpected failures; ${report.rendered} rendered, ${report.rejected} rejected; ${report.elapsedMs.toFixed(1)} ms.`,
);
for (const failure of report.failures.slice(0, 8))
  console.error(`${failure.id}: ${failure.invariants.join("; ")}`);
if (report.failures.length > 8)
  console.error(`${report.failures.length - 8} more failures preserved in the report.`);
console.log(`Report: ${fileURLToPath(file)}`);
if (!report.ok) process.exitCode = 1;
