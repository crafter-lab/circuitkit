import { strict as assert } from "node:assert";
import { getGalleryCases } from "../app/gallery/corpus.ts";
import { complexRecipeIds, recipeIds } from "../src/schema.ts";

const directory = "artifacts/gallery/dogfood-complex";
const terminal = await Bun.file("artifacts/gallery/stress-report.json").json();
const normalize = (cases: { elapsedMs: number; [key: string]: unknown }[]) =>
  cases.map(({ elapsedMs: _elapsedMs, ...row }) => row);
for (const file of ["stress-first-download.json", "stress-restart-download.json"]) {
  const { report: browser } = await Bun.file(`${directory}/${file}`).json();
  assert.equal(browser.ok, true);
  assert.equal(browser.failed, 0);
  assert.equal(browser.completed, terminal.completed);
  assert.deepEqual(normalize(browser.cases), normalize(terminal.cases));
}
const cases = getGalleryCases();
assert.equal(new Set(cases.map((entry) => entry.recipe)).size, recipeIds.length);
for (const id of complexRecipeIds)
  assert(cases.some((entry) => entry.recipe === id && entry.group === "examples"));
assert(
  cases.every(
    (entry) =>
      !entry.description.includes("Unbuffered stages interact. Unbuffered stages interact."),
  ),
);
console.log(
  `PASS browser/Bun stress parity: ${terminal.completed} cases; ${recipeIds.length} topologies, ${cases.length} gallery cases; RC copy regression.`,
);
