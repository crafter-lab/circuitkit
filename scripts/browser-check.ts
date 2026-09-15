import { strict as assert } from "node:assert";
import { spawnSync } from "node:child_process";
import { mkdirSync } from "node:fs";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { renderSVG } from "../src/index.ts";
import { recipeIds, themePresets } from "../src/schema.ts";
import { contrast } from "../src/theme.ts";

const session = "circuitkit-verification";
const base = process.argv[2] ?? "http://127.0.0.1:3217";
mkdirSync("artifacts", { recursive: true });
const checks: string[] = [];
function runBrowser(args: string[], input?: string): unknown {
  const result = spawnSync("agent-browser", ["--session", session, "--json", ...args], {
    input,
    encoding: "utf8",
    maxBuffer: 8 * 1024 * 1024,
  });
  if (result.status !== 0)
    throw new Error(
      `${args.slice(0, 3).join(" ")}: status=${result.status} signal=${result.signal} error=${result.error} ${result.stdout} ${result.stderr}`,
    );
  const envelope = JSON.parse(result.stdout);
  if (!envelope.success) throw new Error(JSON.stringify(envelope));
  return envelope.data;
}
function browser(...args: string[]): unknown {
  return runBrowser(args);
}
function evaluate<T>(source: string): T {
  const value = runBrowser(["eval", "--stdin"], source) as { result: T };
  return value.result;
}
function check(message: string, condition: unknown) {
  assert(condition, message);
  checks.push(message);
  console.log(`PASS ${message}`);
}
const count = () => evaluate<number>('document.querySelectorAll(".figure-stage svg").length');
const source = () => evaluate<string>('document.querySelector("textarea").value');
function parity() {
  const document = JSON.parse(source());
  const result = renderSVG(document);
  assert(result.ok, JSON.stringify(result.diagnostics));
  const actual = evaluate<{
    description: string;
    paths: string[];
    boxes: Record<string, { x: number; y: number; width: number; height: number }>;
  }>(
    `(() => { const svg=document.querySelector('.figure-stage svg'); return { description:svg.getAttribute('aria-label'), paths:[...svg.querySelectorAll('path')].map(p=>p.getAttribute('d')), boxes:Object.fromEntries([...svg.querySelectorAll('[data-label]')].map(e=>{const b=e.getBBox();return [e.getAttribute('data-label'),{x:b.x,y:b.y,width:b.width,height:b.height}]})) }; })()`,
  );
  const expectedPaths = [...result.svg.matchAll(/<path\b[^>]* d="([^"]*)"/g)].map(
    (match) => match[1],
  );
  assert.deepEqual(actual.paths, expectedPaths);
  for (const [id, box] of Object.entries(result.bounds.labels)) {
    const observed = actual.boxes[id];
    assert(observed, id);
    for (const key of ["x", "y", "width", "height"] as const)
      assert(Math.abs(observed[key] - box[key]) < 0.02, `Browser glyph bounds: ${id}.${key}`);
  }
  return result;
}
try {
  browser("open", new URL("/editor", base).href);
  browser("wait", ".figure-stage svg");
  browser("set", "viewport", "1440", "1000");
  check("RC preview has real SVG", count() === 1);
  for (const recipe of recipeIds) {
    browser("select", ".controls-body > .field select", recipe);
    for (const theme of themePresets) {
      browser("select", 'section[aria-labelledby="theme-heading"] select', theme);
      browser("wait", ".figure-stage svg");
      const result = parity();
      await Bun.write(`artifacts/${recipe}-${theme}.svg`, result.svg);
      await Bun.write(
        `artifacts/${recipe}-${theme}.json`,
        JSON.stringify(result.document, null, 2),
      );
      browser("scrollintoview", ".figure-stage");
      browser("screenshot", `artifacts/${recipe}-${theme}.png`);
      check(`${recipe}/${theme}: preview paths and measured glyph bounds match core`, true);
    }
  }
  browser("select", ".controls-body > .field select", "rc-lowpass");
  browser("find", "label", "R1 · resistance Ω", "fill", "20000");
  browser("wait", ".figure-stage svg");
  check("SI edit updates cutoff to 80 Hz", parity().svg.includes("80 Hz"));
  evaluate(
    `(() => {const input=[...document.querySelectorAll('input')].find(e=>e.closest('label')?.textContent.includes('R1 · resistance'));input.focus();input.select();return true;})()`,
  );
  browser("press", "Backspace");
  check("empty SI edit removes preview", count() === 0);
  check(
    "empty SI edit disables both exports",
    evaluate<boolean>(
      '[...document.querySelectorAll("button")].filter(b=>/Copy JSON|Download SVG/.test(b.textContent)).every(b=>b.disabled)',
    ),
  );
  browser("find", "label", "R1 · resistance Ω", "fill", "10000");
  browser("wait", ".figure-stage svg");
  browser("find", "role", "button", "click", "--name", "Clear focus");
  const clear = parity();
  for (const focus of ["R1", "output", "C1"]) {
    browser("find", "role", "button", "click", "--name", "Clear focus");
    browser("find", "role", "button", "click", "--name", focus, "--exact");
    const result = parity();
    check(
      `focus ${focus} leaves bounds invariant`,
      JSON.stringify(result.bounds) === JSON.stringify(clear.bounds),
    );
  }
  browser("find", "label", "Accent override HEX", "fill", "#6d28d9");
  check("custom accent renders", parity().svg.includes("#6d28d9"));
  browser("find", "label", "Accent override HEX", "fill", "#fff");
  check("low contrast removes preview", count() === 0);
  evaluate(
    `(() => {const input=[...document.querySelectorAll('input')].find(e=>e.closest('label')?.textContent.includes('Accent override'));input.focus();input.select();return true;})()`,
  );
  browser("press", "Backspace");
  browser("wait", ".figure-stage svg");
  const valid = source();
  browser("find", "label", "Figure document JSON", "fill", "{");
  check("unapplied JSON instantly removes preview", count() === 0);
  browser("find", "role", "button", "click", "--name", "Apply JSON");
  check("invalid JSON is preserved and no old SVG remains", source() === "{" && count() === 0);
  evaluate(
    `(() => {const area=document.querySelector('textarea');Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype,'value').set.call(area,${JSON.stringify(valid.replace("R1.a", "R1.c"))});area.dispatchEvent(new Event('input',{bubbles:true}));return true;})()`,
  );
  browser("find", "role", "button", "click", "--name", "Apply JSON");
  check(
    "unknown pin exposes actionable diagnosis",
    evaluate<boolean>(
      'document.body.textContent.includes("circuit.unknown_pin") && document.body.textContent.includes("a, b")',
    ),
  );
  evaluate(
    `(() => {const area=document.querySelector('textarea');Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype,'value').set.call(area,${JSON.stringify(valid)});area.dispatchEvent(new Event('input',{bubbles:true}));return true;})()`,
  );
  browser("find", "role", "button", "click", "--name", "Apply JSON");
  browser("wait", ".figure-stage svg");
  check("corrected JSON restores exact figure", parity().ok);
  evaluate(
    `(() => {window.__copied=null;Object.defineProperty(navigator.clipboard,'writeText',{configurable:true,value:async(text)=>{window.__copied=text}});return true})()`,
  );
  browser("find", "role", "button", "click", "--name", "Copy JSON");
  check(
    "copy receives canonical current document",
    JSON.stringify(JSON.parse(evaluate<string>("window.__copied"))) ===
      JSON.stringify(parity().document),
  );
  evaluate(
    `(() => {Object.defineProperty(navigator.clipboard,'writeText',{configurable:true,value:async()=>{throw new Error('denied')}});return true})()`,
  );
  browser("find", "role", "button", "click", "--name", "Copy JSON");
  check(
    "clipboard denial is visible",
    evaluate<boolean>(
      'document.body.textContent.includes("Clipboard unavailable or permission denied")',
    ),
  );
  evaluate(
    `(() => { const create=URL.createObjectURL.bind(URL);window.__download=null;URL.createObjectURL=(blob)=>{blob.text().then(text=>window.__download=text);return create(blob)};return true; })()`,
  );
  browser("find", "role", "button", "click", "--name", "Download SVG");
  browser("wait", "--fn", 'typeof window.__download === "string"');
  check(
    "download Blob contains exact current SVG",
    evaluate<string>("window.__download") === parity().svg,
  );
  browser("screenshot", "artifacts/playground-final.png");
  const accessibility = browser("a11y") as {
    counts: { violations: number; incomplete: number };
    incomplete: { id: string; nodes: { target: string[] }[] }[];
  };
  check("axe reports no automatic accessibility violations", accessibility.counts.violations === 0);
  const arrow = evaluate<{ color: string; background: string }>(
    `(() => {const icon=document.querySelector('.primary > span[aria-hidden="true"]');return {color:getComputedStyle(icon).color,background:getComputedStyle(icon.closest('button')).backgroundColor};})()`,
  );
  const hex = (css: string) => {
    const channels = css.match(/\d+/g)?.map(Number);
    assert(channels?.length === 3, `Expected opaque RGB: ${css}`);
    return `#${channels.map((channel) => channel.toString(16).padStart(2, "0")).join("")}`;
  };
  const arrowContrast = contrast(hex(arrow.color), hex(arrow.background));
  check("decorative download arrow meets contrast in computed styles", arrowContrast >= 4.5);
  for (const incomplete of accessibility.incomplete) {
    assert(
      incomplete.id === "color-contrast" &&
        incomplete.nodes.every(
          (node) =>
            node.target.length === 1 && node.target[0] === '.primary > span[aria-hidden="true"]',
        ),
      "Unreviewed incomplete accessibility check",
    );
  }
  await Bun.write(
    "artifacts/accessibility.json",
    JSON.stringify(
      {
        ...accessibility,
        reviewedIncomplete: {
          selector: '.primary > span[aria-hidden="true"]',
          ...arrow,
          contrast: arrowContrast,
          status: "pass",
        },
      },
      null,
      2,
    ),
  );
  browser("set", "viewport", "390", "844");
  browser("screenshot", "artifacts/playground-mobile.png");
  check(
    "mobile page has no viewport-wide overflow",
    evaluate<boolean>("document.documentElement.scrollWidth <= window.innerWidth"),
  );
  browser("set", "viewport", "1100", "700");
  for (const recipe of recipeIds) {
    for (const theme of themePresets) {
      const path = `artifacts/${recipe}-${theme}.svg`;
      browser("open", pathToFileURL(resolve(path)).href);
      browser("wait", "svg");
      check(
        `${recipe}/${theme}: standalone SVG renders outside playground`,
        evaluate<boolean>(
          "document.querySelector('svg').getBBox().width === document.querySelector('svg').viewBox.baseVal.width && document.querySelectorAll('[data-label] path').length > 0 && document.querySelectorAll('script,style,text,image').length === 0",
        ),
      );
      browser("screenshot", `artifacts/${recipe}-${theme}-standalone.png`);
    }
  }
  await Bun.write(
    "artifacts/browser-check.json",
    JSON.stringify(
      {
        ok: true,
        checks,
        accessibility,
        note: "Clipboard success/denial deliberately injected; download Blob bytes observed. Screenshots require human aesthetic acceptance.",
      },
      null,
      2,
    ),
  );
  console.log(`PASS ${checks.length} browser checks`);
} finally {
  browser("close");
}
