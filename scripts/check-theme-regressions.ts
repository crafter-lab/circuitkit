import { strict as assert } from "node:assert";
import { spawnSync } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";

const base = process.argv[2] ?? "http://127.0.0.1:3218";
const output = "artifacts/theme-regressions";
const identity = spawnSync(
  "agent-browser",
  ["session", "id", "--scope", "worktree", "--prefix", "circuitkit-theme-regressions"],
  { encoding: "utf8" },
);
assert.equal(identity.status, 0, identity.stderr);
const session = identity.stdout.trim();
const checks: { name: string; ok: boolean; evidence?: unknown }[] = [];
const commands: unknown[] = [];
const blockers: { phase: string; error: string }[] = [];
let phaseName = "initialize";
let closed = false;
mkdirSync(output, { recursive: true });
function save() {
  writeFileSync(
    `${output}/browser-check.json`,
    JSON.stringify(
      {
        base,
        session,
        ok: closed && blockers.length === 0 && checks.every(({ ok }) => ok),
        counts: {
          passed: checks.filter(({ ok }) => ok).length,
          failed: checks.filter(({ ok }) => !ok).length,
          blocked: blockers.length,
        },
        closed,
        checks,
        blockers,
        limitations: ["Focused Chromium regressions only, not the full browser or test matrix."],
      },
      null,
      2,
    ),
  );
  writeFileSync(`${output}/commands.json`, JSON.stringify(commands, null, 2));
}
function run(args: string[], input?: string) {
  const result = spawnSync("agent-browser", ["--session", session, "--json", ...args], {
    input,
    encoding: "utf8",
    maxBuffer: 32 * 1024 * 1024,
  });
  commands.push({ phase: phaseName, args, input, exitCode: result.status, ...result });
  assert.equal(result.status, 0, `${args.join(" ")}: ${result.stderr} ${result.stdout}`);
  const envelope = JSON.parse(result.stdout);
  assert(envelope.success, JSON.stringify(envelope));
  return envelope.data;
}
const browser = (...args: string[]) => run(args);
const evaluate = (source: string) => run(["eval", "--stdin"], source).result;
const wait = (source: string) => browser("wait", "--fn", source);
function settle() {
  evaluate(
    "new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(()=>resolve(true))))",
  );
}
function check(name: string, condition: unknown, evidence?: unknown) {
  const ok = Boolean(condition);
  checks.push({ name: `${phaseName}: ${name}`, ok, evidence });
  console.log(`${ok ? "PASS" : "FAIL"} ${phaseName}: ${name}`);
  save();
}
function snapshot(name: string) {
  writeFileSync(`${output}/${name}.json`, JSON.stringify(browser("snapshot", "-i"), null, 2));
}
function phase(name: string, work: () => void) {
  phaseName = name;
  try {
    work();
  } catch (error) {
    blockers.push({ phase: name, error: String(error) });
    console.error(`BLOCKED ${name}: ${error}. No retry; continuing independent phases.`);
  }
  save();
}
function open(path: string) {
  browser("open", new URL(path, base).href);
  browser("wait", ".site-header .theme-toggle:not(:disabled)");
  browser("wait", "main#main");
  snapshot(`${phaseName}-entry`);
}
function select(label: string, value: string) {
  const { refs } = browser("snapshot", "-i") as {
    refs: Record<string, { role: string; name: string }>;
  };
  const matches = Object.entries(refs).filter(
    ([, ref]) => ref.role === "combobox" && ref.name === label,
  );
  assert.equal(matches.length, 1, `Expected one combobox named ${label}`);
  browser("select", `@${matches[0]?.[0]}`, value);
}
function siteTheme(value: "light" | "dark") {
  if (!evaluate(`document.documentElement.classList.contains('${value}')`)) {
    browser("find", "role", "button", "click", "--name", "Dark theme", "--exact");
  }
  wait(`document.documentElement.classList.contains('${value}')`);
  browser("hover", "h1");
  settle();
}
function galleryState() {
  return evaluate(`(() => ({
    search: document.querySelector('.gallery-search input').value,
    selects: [...document.querySelectorAll('.gallery-filters select')].map(e=>e.value),
    tabs: [...document.querySelectorAll('.gallery-tabs button')].map(e=>e.getAttribute('aria-pressed')),
    results: document.querySelector('.gallery-results-bar [role="status"]').textContent,
    cards: [...document.querySelectorAll('.gallery-thumbnail')].map(e=>e.getAttribute('href')),
    images: [...document.querySelectorAll('.gallery-thumbnail img')].map(e=>e.getAttribute('src')),
    selectionLink: document.querySelector('.gallery-collection .gallery-text-link').getAttribute('href')
  }))()`);
}
function same(name: string, before: unknown, after: unknown) {
  check(name, JSON.stringify(before) === JSON.stringify(after), { before, after });
}
function lessonBytes() {
  return evaluate(
    "[...document.querySelectorAll('.circuit-lesson-figure svg')].map(e=>e.outerHTML)",
  );
}
function focusChecks(label: string) {
  const count = evaluate(`(() => {
    let count=0;
    for (const figure of document.querySelectorAll('.circuit-lesson-figure')) {
      const targets=[figure.querySelector('.circuit-lesson-diagram'), ...[...figure.querySelectorAll('button')].filter(e=>['Show all','Download figure SVG'].includes(e.textContent.trim()))];
      for (const target of targets) target.setAttribute('data-regression-focus',String(count++));
    }
    return count;
  })()`);
  check(`${label} both figures expose all three focus targets`, count === 6, count);
  for (let index = 0; index < count; index++) {
    browser("press", "Tab");
    browser("focus", `[data-regression-focus="${index}"]`);
    const result = evaluate(`(() => {
      const e=document.querySelector('[data-regression-focus="${index}"]');
      const s=getComputedStyle(e), figure=getComputedStyle(e.closest('.circuit-lesson-figure'));
      const luminance=color=>{
        const values=color.match(/[\\d.]+/g).slice(0,3).map(Number).map(v=>v/255).map(v=>v<=.04045?v/12.92:((v+.055)/1.055)**2.4);
        return values.reduce((sum,v,i)=>sum+v*[.2126,.7152,.0722][i],0);
      };
      const a=luminance(s.outlineColor), b=luminance(figure.backgroundColor);
      return {label:e.getAttribute('aria-label')||e.textContent.trim(),active:document.activeElement===e,visible:e.matches(':focus-visible'),outline:s.outlineColor,color:s.color,style:s.outlineStyle,width:parseFloat(s.outlineWidth),background:figure.backgroundColor,contrast:(Math.max(a,b)+.05)/(Math.min(a,b)+.05)};
    })()`);
    check(
      `${label} target ${index} has document-aware keyboard focus contrast`,
      result.active &&
        result.visible &&
        result.style === "solid" &&
        result.width >= 2 &&
        result.outline === result.color &&
        result.contrast >= 3,
      result,
    );
  }
  browser("press", "Tab");
  browser("focus", '.circuit-lesson-figure [data-legend-net="output"] button');
  settle();
  const legend = evaluate(`(() => {
    const e=document.activeElement;
    return {visible:e.matches(':focus-visible'),inline:e.style.outline,outline:getComputedStyle(e).outlineColor,figure:getComputedStyle(e.closest('.circuit-lesson-figure')).color};
  })()`);
  check(
    `${label} inline legend focus color remains document-owned`,
    legend.visible && legend.inline !== "" && legend.outline === legend.figure,
    legend,
  );
  snapshot(`${label}-focus`);
}
try {
  let baseline: unknown;
  phase("gallery-baseline", () => {
    open("/gallery");
    baseline = galleryState();
    check(
      "unfiltered baseline has real cards",
      evaluate("document.querySelectorAll('.gallery-card').length>0"),
    );
  });
  for (const entry of ["direct", "local"]) {
    phase(`gallery-${entry}`, () => {
      assert(baseline, "Missing unfiltered baseline");
      open(entry === "direct" ? "/gallery?theme=geist-print&q=divider" : "/gallery");
      if (entry === "local") {
        select("Theme", "geist-print");
        browser("find", "label", "Search the collection", "fill", "", "--exact");
        evaluate(
          "window.__regressionInputs=[];document.querySelector('.gallery-search input').addEventListener('input',e=>window.__regressionInputs.push(e.target.value));true",
        );
        browser("keyboard", "type", "voltage divider");
        settle();
        const rapid = evaluate(
          "({values:window.__regressionInputs,text:document.querySelector('.gallery-search input').value,url:new URLSearchParams(location.search).get('q')})",
        );
        same(
          "rapid keystrokes retain every input prefix",
          Array.from("voltage divider", (_, i) => "voltage divider".slice(0, i + 1)),
          rapid.values,
        );
        check(
          "rapid typing survives router synchronization",
          rapid.text === "voltage divider" && rapid.url === rapid.text,
          rapid,
        );
        browser("find", "label", "Search the collection", "fill", "divider", "--exact");
      }
      wait("document.querySelector('.gallery-search input').value==='divider'");
      settle();
      const filtered = galleryState();
      const filteredURL = evaluate("location.href");
      check(
        "filtered controls and actual results match URL",
        filtered.search === "divider" &&
          filtered.selects[1] === "geist-print" &&
          filtered.cards.length > 0 &&
          filtered.cards.every(
            (href: string) => new URL(href, base).searchParams.get("theme") === "geist-print",
          ),
        filtered,
      );
      for (const theme of ["dark", "light"] as const) {
        siteTheme(theme);
        same(
          `${theme} site theme preserves filters/results/selection links`,
          filtered,
          galleryState(),
        );
        same(`${theme} site theme preserves URL`, filteredURL, evaluate("location.href"));
      }
      evaluate("window.__regressionHeader=document.querySelector('.site-header');true");
      browser("click", '.site-header nav a[href="/gallery"]');
      wait("location.pathname==='/gallery' && location.search===''");
      wait(
        "document.querySelector('.gallery-search input').value==='' && [...document.querySelectorAll('.gallery-filters select')].every(e=>e.value==='')",
      );
      settle();
      check(
        "query clear preserves exact header DOM node",
        evaluate("window.__regressionHeader===document.querySelector('.site-header')"),
      );
      same(
        "query clear restores baseline controls/results/selection links",
        baseline,
        galleryState(),
      );
      snapshot(`${entry}-cleared`);
      browser("back");
      wait(`location.href===${JSON.stringify(filteredURL)}`);
      wait("document.querySelector('.gallery-search input').value==='divider'");
      settle();
      same("browser back restores URL-owned filters and results", filtered, galleryState());
      check(
        "back preserves header node",
        evaluate("window.__regressionHeader===document.querySelector('.site-header')"),
      );
      snapshot(`${entry}-back`);
    });
  }
  phase("lesson-focus", () => {
    open("/lesson");
    for (const [global, authored] of [
      ["dark", "geist-light"],
      ["dark", "geist-print"],
      ["light", "geist-dark"],
    ] as const) {
      select("Figure theme", authored);
      siteTheme(global === "dark" ? "light" : "dark");
      const before = lessonBytes();
      siteTheme(global);
      same(
        `${global}/${authored} global toggle does not recolor authored SVG`,
        before,
        lessonBytes(),
      );
      focusChecks(`${global}-${authored}`);
    }
  });
  phase("editor-document-isolation", () => {
    open("/editor");
    for (const preset of ["geist-light", "geist-print", "geist-dark"]) {
      select("Theme", preset);
      siteTheme("light");
      const state = () =>
        evaluate(
          "({json:document.querySelector('#json-source').value,svg:document.querySelector('[aria-label=\"Current figure\"] svg').outerHTML})",
        );
      const before = state();
      siteTheme("dark");
      same(`${preset} editor JSON/SVG unchanged by global toggle`, before, state());
    }
    const draft = '{\n  "draft": "preserve spacing",\n  BROKEN: [  1,\n';
    browser("find", "role", "textbox", "fill", draft, "--name", "Figure document JSON", "--exact");
    wait("document.querySelector('.workbench button.primary').disabled");
    for (const value of ["light", "dark"] as const) {
      siteTheme(value);
      same(
        `${value} invalid draft retained verbatim`,
        draft,
        evaluate("document.querySelector('#json-source').value"),
      );
      check(
        `${value} invalid draft cannot export`,
        evaluate("document.querySelector('.workbench button.primary').disabled"),
      );
    }
  });
  phase("browser-errors", () => {
    const errors = browser("errors");
    const log = browser("console");
    check("no uncaught browser errors", errors.errors.length === 0, errors);
    check(
      "no hydration warnings",
      !/hydration|hydrating|did not match|server rendered HTML/i.test(JSON.stringify(log)),
      log,
    );
  });
} finally {
  phaseName = "close";
  try {
    browser("close");
    closed = true;
  } catch (error) {
    blockers.push({ phase: "close", error: String(error) });
  }
  save();
}
const failed = checks.filter(({ ok }) => !ok).length;
console.log(
  `${checks.length - failed} passed, ${failed} failed, ${blockers.length} blocked; ${output}/browser-check.json`,
);
process.exitCode = failed || blockers.length || !closed ? 1 : 0;
