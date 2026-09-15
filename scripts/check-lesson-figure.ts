import { strict as assert } from "node:assert";
import { spawnSync } from "node:child_process";
import { mkdirSync } from "node:fs";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { dividerLesson } from "../app/lesson/documents.ts";
import { renderFigureSVG } from "../src/index.ts";

const session = "circuit-lesson-check";
const base = process.argv[2] ?? "http://127.0.0.1:3218";
const divider = '[aria-labelledby="divider-heading"] .circuit-lesson-figure';
const amplifier = '[aria-labelledby="amplifier-heading"] .circuit-lesson-figure';
const label = (net: string, scope = divider) => `${scope} [data-legend-net="${net}"] button`;
const checks: string[] = [];
mkdirSync("artifacts/lesson", { recursive: true });
function run(args: string[], input?: string) {
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
const browser = (...args: string[]) => run(args);
const evaluate = <T>(source: string): T => run(["eval", "--stdin"], source).result;
function check(name: string, condition: unknown) {
  assert(condition, name);
  checks.push(name);
  console.log(`PASS ${name}`);
}
const visible = (scope = divider) =>
  evaluate<string>(
    `document.querySelector(${JSON.stringify(scope)}).querySelector('svg desc').textContent`,
  );
const pressed = (scope = divider) =>
  evaluate<string[]>(
    `[...document.querySelector(${JSON.stringify(scope)}).querySelectorAll('[data-legend-net] button[aria-pressed="true"]')].map(e=>e.textContent)`,
  );
const paths = () =>
  evaluate<string[]>(
    `[...document.querySelector(${JSON.stringify(divider)}).querySelector('svg').querySelectorAll('path')].map(e=>e.getAttribute('d'))`,
  );
try {
  browser("open", `${base}/lesson`);
  browser("wait", ".circuit-lesson-legend");
  browser("set", "viewport", "1440", "1000");
  check(
    "two independent annotated figures rendered",
    evaluate<number>("document.querySelectorAll('.circuit-lesson-figure').length") === 2,
  );
  check(
    "A/B/C legend and six-node amplifier legend",
    evaluate<string[]>(
      "[...document.querySelectorAll('.circuit-lesson-legend')].map(e=>[...e.querySelectorAll('button')].map(b=>b.textContent).join(''))",
    ).join("/") === "ABC/ABCDEF",
  );
  const originalPaths = paths();
  browser("click", label("output"));
  check("click pins B", pressed().join() === "B" && visible().includes("Focus nets: output."));
  browser("hover", label("input"));
  check(
    "hover previews A without changing saved B",
    pressed().join() === "B" && visible().includes("Focus nets: input."),
  );
  check(
    "preview preserves every diagram path",
    JSON.stringify(paths()) === JSON.stringify(originalPaths),
  );
  browser("hover", "h1");
  check("pointer leave restores saved B", visible().includes("Focus nets: output."));
  browser("press", "Tab");
  browser("focus", label("ground"));
  check(
    "keyboard focus previews C without selecting it",
    pressed().join() === "B" && visible().includes("Focus nets: ground."),
  );
  browser("press", "Enter");
  check("Enter selects C", pressed().join() === "C");
  browser("press", "Escape");
  check(
    "Escape clears saved and preview state",
    pressed().length === 0 && visible().includes("Focus nets: none."),
  );
  browser("click", `${divider} [data-hit-net="output"] path:first-of-type`);
  check("diagram conductor selects its nearest net", pressed().join() === "B");
  browser("click", label("summing", amplifier));
  check(
    "amplifier selection does not affect divider",
    pressed().join() === "B" && pressed(amplifier).join() === "B",
  );
  const unique = evaluate<boolean>(
    `(() => {const ids=[...document.querySelectorAll('[id]')].map(e=>e.id);return new Set(ids).size===ids.length && [...document.querySelectorAll('.circuit-lesson-figure [aria-controls],.circuit-lesson-figure [aria-describedby]')].every(e=>['aria-controls','aria-describedby'].every(a=>(e.getAttribute(a)||'').split(' ').filter(Boolean).every(id=>document.getElementById(id))))})()`,
  );
  check("all instance IDs and label associations are unique and resolve", unique);
  for (const theme of ["geist-light", "geist-dark", "geist-print"]) {
    browser("select", ".lesson-settings select", theme);
    browser("wait", ".circuit-lesson-legend");
    check(
      `${theme} keeps both host selections`,
      pressed().join() === "B" && pressed(amplifier).join() === "B",
    );
    const colors = evaluate<string[]>(
      `[...document.querySelector(${JSON.stringify(divider)}).querySelectorAll('[data-legend-net] button')].map(e=>getComputedStyle(e).color)`,
    );
    check(
      `${theme} uses categorical colors or labeled monochrome`,
      new Set(colors).size === (theme === "geist-print" ? 1 : 3),
    );
    browser("scrollintoview", `${divider} .circuit-lesson-legend`);
    browser("screenshot", `artifacts/lesson/${theme}.png`);
  }
  browser("select", ".lesson-settings select", "geist-dark");
  browser("hover", label("input"));
  evaluate(
    `(() => {const create=URL.createObjectURL.bind(URL);window.__lessonDownload=null;URL.createObjectURL=(blob)=>{blob.text().then(text=>window.__lessonDownload=text);return create(blob)};return true})()`,
  );
  evaluate(
    `[...document.querySelector(${JSON.stringify(divider)}).querySelectorAll('button')].find(button=>button.textContent==='Download figure SVG').click()`,
  );
  browser("wait", "--fn", 'typeof window.__lessonDownload === "string"');
  const exported = evaluate<string>("window.__lessonDownload");
  const document = dividerLesson("geist-dark", 10000);
  document.presentation.highlight = { components: [], nets: ["output"] };
  const expected = renderFigureSVG(document);
  assert(expected.ok, JSON.stringify(expected.diagnostics));
  check(
    "download uses persisted B, not hover A, and includes full legend/caption",
    exported === expected.svg,
  );
  await Bun.write("artifacts/lesson/exported-figure.svg", exported);
  browser("check", ".lesson-qa input");
  check(
    "invalid divider clears its diagram and reports diagnostics",
    evaluate<boolean>(
      `document.querySelector('[aria-labelledby="divider-heading"]').querySelectorAll('svg').length===0 && document.querySelector('.lesson-diagnostics').textContent.includes('document.invalid_field')`,
    ),
  );
  check("other figure stays intact during error", pressed(amplifier).join() === "B");
  browser("uncheck", ".lesson-qa input");
  browser("wait", `${divider} .circuit-lesson-legend`);
  browser("find", "label", "Divider R1 resistance (Ω)", "fill", "20000");
  check(
    "value prop edits preserve selection and update circuit",
    pressed().join() === "B" && visible().includes("20 kΩ"),
  );
  browser("set", "viewport", "390", "844");
  browser("click", label("input"));
  check("narrow viewport supports legend selection", pressed().join() === "A");
  check(
    "mobile content stays within viewport",
    evaluate<boolean>("document.documentElement.scrollWidth <= window.innerWidth"),
  );
  browser("screenshot", "artifacts/lesson/mobile.png");
  const accessibility = browser("a11y");
  await Bun.write("artifacts/lesson/accessibility.json", JSON.stringify(accessibility, null, 2));
  check("axe has no automatic violations", accessibility.counts.violations === 0);
  browser("open", pathToFileURL(resolve("artifacts/lesson/exported-figure.svg")).href);
  browser("wait", "svg");
  check(
    "complete export opens standalone without fonts or HTML dependencies",
    evaluate<boolean>(
      "document.querySelectorAll('text,style,script,image,foreignObject').length===0 && document.querySelectorAll('path').length>0 && document.querySelector('svg').viewBox.baseVal.height>600",
    ),
  );
  browser("screenshot", "artifacts/lesson/standalone.png");
  await Bun.write(
    "artifacts/lesson/browser-check.json",
    JSON.stringify(
      {
        ok: true,
        checks,
        accessibility,
        note: "Chromium desktop/mobile viewport; download Blob bytes observed, not OS download destination.",
      },
      null,
      2,
    ),
  );
  console.log(`PASS ${checks.length} lesson browser checks`);
} finally {
  browser("close");
}
