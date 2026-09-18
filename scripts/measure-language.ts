import { strict as assert } from "node:assert";
import { readFileSync } from "node:fs";
import { countTokens } from "gpt-tokenizer/encoding/o200k_base";
import { renderDiagramSVG } from "../src/diagram/index.ts";
import { formatCircuitSource, renderCircuitSource } from "../src/language/index.ts";

const sensorMarkdown = readFileSync(
  new URL("../examples/diagrams/sensor.md", import.meta.url),
  "utf8",
);
const sensorJSON = sensorMarkdown.match(/```circuitkit\n([\s\S]*?)\n```/)?.[1];
assert(sensorJSON);
const fixtures = [
  {
    name: "cueva",
    json: readFileSync(new URL("../examples/diagrams/cueva.json", import.meta.url), "utf8"),
    source: readFileSync(new URL("../examples/diagrams/cueva.ck", import.meta.url), "utf8"),
  },
  {
    name: "sensor",
    json: sensorJSON,
    source: readFileSync(new URL("../examples/diagrams/sensor.ck", import.meta.url), "utf8"),
  },
];
const results = fixtures.map((fixture) => {
  const input = JSON.parse(fixture.json);
  const formatted = formatCircuitSource(fixture.source);
  assert(formatted.ok, JSON.stringify(formatted));
  for (const view of ["blocks", "wiring", "schematic"] as const) {
    const expected = renderDiagramSVG(input, { view });
    const actual = renderCircuitSource(formatted.source, { view });
    assert(expected.ok && actual.ok, JSON.stringify({ expected, actual }));
    assert.deepEqual(actual.document, expected.document);
    assert.equal(actual.svg, expected.svg);
  }
  const compactJSON = JSON.stringify(input);
  const readableJSON = JSON.stringify(input, null, 2);
  const tokens = {
    jsonMinified: countTokens(compactJSON),
    jsonReadable: countTokens(readableJSON),
    languageCanonical: countTokens(formatted.source),
  };
  return {
    name: fixture.name,
    tokens,
    reductionAgainstMinifiedPercent: Number(
      ((1 - tokens.languageCanonical / tokens.jsonMinified) * 100).toFixed(2),
    ),
    sameNormalizedModel: true,
    identicalSVGViews: 3,
  };
});
console.log(
  JSON.stringify(
    {
      tokenizer: "gpt-tokenizer@4.0.0",
      encoding: "o200k_base",
      scope: "source-text-only",
      excluded: ["instructions", "tool-output", "diagnostics", "retries", "rendered SVG"],
      agentErrorRate: "not evaluated",
      endToEndSavings: "not evaluated",
      fixtures: results,
    },
    null,
    2,
  ),
);
