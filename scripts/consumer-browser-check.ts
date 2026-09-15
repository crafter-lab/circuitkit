import { strict as assert } from "node:assert";
import { spawnSync } from "node:child_process";
import { renderSVG } from "../src/index.ts";

const { consumer } = await Bun.file("artifacts/package-check.json").json();
assert(typeof consumer === "string");
const server = Bun.spawn(["bun", "run", "start", "--port", "0"], {
  cwd: consumer,
  stdout: "pipe",
  stderr: "inherit",
});
const session = "circuitkit-consumer-proof";
const checks: string[] = [];
function browser(args: string[], input?: string) {
  const result = spawnSync("agent-browser", ["--session", session, "--json", ...args], {
    input,
    encoding: "utf8",
  });
  assert.equal(
    result.status,
    0,
    `${args.slice(0, 2).join(" ")}: ${result.signal} ${result.stderr} ${result.stdout}`,
  );
  const envelope = JSON.parse(result.stdout);
  assert(envelope.success, JSON.stringify(envelope));
  return envelope.data;
}
function evaluate<T>(source: string): T {
  return browser(["eval", "--stdin"], source).result;
}
function check(name: string, condition: unknown) {
  assert(condition, name);
  checks.push(name);
  console.log(`PASS ${name}`);
}
function parity() {
  const document = JSON.parse(evaluate<string>("document.querySelector('pre').textContent"));
  const expected = renderSVG(document);
  assert(expected.ok, JSON.stringify(expected.diagnostics));
  assert(
    evaluate<boolean>(
      `(() => {const template=document.createElement('template');template.innerHTML=${JSON.stringify(expected.svg)};return template.content.firstElementChild.outerHTML===document.querySelector('.figure svg').outerHTML;})()`,
    ),
  );
  return expected;
}
try {
  const reader = server.stdout.getReader();
  const decoder = new TextDecoder();
  let output = "";
  while (!output.includes("Ready")) {
    const item = await reader.read();
    assert(!item.done, `Consumer exited before readiness: ${output}`);
    output += decoder.decode(item.value);
  }
  const base = output.match(/http:\/\/127\.0\.0\.1:\d+/)?.[0];
  assert(base, output);
  browser(["open", base]);
  browser(["wait", ".figure svg"]);
  check("installed React export renders exact core SVG after hydration", parity().ok);
  browser(["find", "label", "R1 resistance (Ω)", "fill", "20000"]);
  browser(["wait", ".figure svg"]);
  check("host value prop updates cutoff", parity().svg.includes("80 Hz"));
  for (const theme of ["geist-light", "geist-dark", "geist-print"]) {
    browser(["select", ".controls label:nth-child(2) select", theme]);
    for (const focus of ["component:R1", "net:output", "component:C1", ""]) {
      browser(["select", ".controls label:nth-child(3) select", focus]);
      check(`host ${theme}/${focus || "clear"} props preserve core parity`, parity().ok);
    }
  }
  evaluate("const input=document.querySelector('input');input.focus();input.select();true");
  browser(["press", "Backspace"]);
  check(
    "invalid host prop removes SVG and invokes diagnostics callback",
    evaluate<boolean>(
      "document.querySelectorAll('.figure svg').length===0 && document.querySelector('[role=status]').textContent.includes('document.invalid_field')",
    ),
  );
  browser(["screenshot", "artifacts/react-consumer-error.png"]);
  browser(["find", "label", "R1 resistance (Ω)", "fill", "10000"]);
  browser(["wait", ".figure svg"]);
  check(
    "host prop recovery restores figure and clears callback diagnostics",
    parity().ok &&
      evaluate<boolean>(
        "document.querySelector('[role=status]').textContent.includes('No diagnostics reported')",
      ),
  );
  browser(["screenshot", "artifacts/react-consumer.png"]);
  browser(["wait", ".circuit-lesson-legend"]);
  check(
    "installed lesson export has linked legend and caption",
    evaluate<boolean>(
      "document.querySelectorAll('.circuit-lesson-legend [data-legend-net]').length===3 && Boolean(document.querySelector('.circuit-lesson-figure figcaption'))",
    ),
  );
  browser(["click", '.circuit-lesson-legend [data-legend-net="output"] button']);
  check(
    "installed lesson controlled selection works",
    evaluate<boolean>(
      "document.querySelector('.circuit-lesson-legend [data-legend-net=output] button').getAttribute('aria-pressed')==='true'",
    ),
  );
  browser(["hover", '.circuit-lesson-legend [data-legend-net="input"] button']);
  check(
    "installed lesson previews without replacing saved selection",
    evaluate<boolean>(
      "document.querySelector('.circuit-lesson-figure svg desc').textContent.includes('Focus nets: input.') && document.querySelector('.circuit-lesson-legend [data-legend-net=output] button').getAttribute('aria-pressed')==='true'",
    ),
  );
  browser(["hover", "h1"]);
  check(
    "installed lesson restores persisted net after hover",
    evaluate<boolean>(
      "document.querySelector('.circuit-lesson-figure svg desc').textContent.includes('Focus nets: output.')",
    ),
  );
  browser(["screenshot", "artifacts/lesson/installed-consumer.png"]);
  await Bun.write(
    "artifacts/consumer-browser-check.json",
    JSON.stringify({ ok: true, consumer, checks }, null, 2),
  );
  console.log(`PASS ${checks.length} consumer browser checks`);
} finally {
  try {
    browser(["close"]);
  } finally {
    server.kill();
    await server.exited;
  }
}
