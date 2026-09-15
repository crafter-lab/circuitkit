import { strict as assert } from "node:assert";
import { spawnSync } from "node:child_process";
import { mkdirSync } from "node:fs";
import { dividerLesson } from "../app/lesson/documents.ts";
import { renderFigureSVG } from "../src/index.ts";

const base = process.argv[2] ?? "http://127.0.0.1:3218";
const identity = spawnSync(
  "agent-browser",
  ["session", "id", "--scope", "worktree", "--prefix", "circuitkit-landing"],
  { encoding: "utf8" },
);
assert.equal(identity.status, 0, identity.stderr);
const session = identity.stdout.trim();
const checks: string[] = [];
const audits: unknown[] = [];
mkdirSync("artifacts/landing", { recursive: true });
function run(args: string[], input?: string) {
  const result = spawnSync("agent-browser", ["--session", session, "--json", ...args], {
    input,
    encoding: "utf8",
  });
  assert.equal(result.status, 0, `${args.join(" ")}: ${result.stderr} ${result.stdout}`);
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
const legend = (net: string) => `[data-legend-net="${net}"] button`;
const pressed = () =>
  evaluate<string[]>(
    "[...document.querySelectorAll('[data-legend-net] button[aria-pressed=\"true\"]')].map(e=>e.textContent)",
  );
const description = () =>
  evaluate<string>("document.querySelector('.circuit-lesson-figure svg desc').textContent");
try {
  browser("open", base);
  browser("wait", ".circuit-lesson-legend");
  browser("snapshot", "-i");
  browser("set", "viewport", "1440", "1000");
  check(
    "CircuitKit landing renders a real three-node figure",
    evaluate<boolean>(
      "document.title.includes('CircuitKit') && document.querySelectorAll('[data-legend-net]').length===3 && document.querySelectorAll('.circuit-lesson-figure svg path').length>0",
    ),
  );
  check(
    "primary and secondary actions share a 32px row",
    evaluate<boolean>(
      "(() => {const [a,b]=[...document.querySelectorAll('.landing-actions a')].map(e=>e.getBoundingClientRect());return a.height===32 && b.height===32 && a.top===b.top})()",
    ),
  );
  browser("click", legend("output"));
  check(
    "selection persists on B",
    pressed().join() === "B" && description().includes("Focus nets: output."),
  );
  browser("hover", legend("input"));
  check(
    "hover previews A without changing B",
    pressed().join() === "B" && description().includes("Focus nets: input."),
  );
  browser("hover", "h1");
  check("pointer leave restores B", description().includes("Focus nets: output."));
  browser("find", "role", "button", "click", "--name", "Dark theme");
  check(
    "dark theme retains the selected net",
    evaluate<boolean>("document.querySelector('.landing').dataset.theme==='dark'") &&
      pressed().join() === "B" &&
      description().includes("Focus nets: output."),
  );
  browser("press", "Tab");
  browser("focus", legend("ground"));
  check(
    "keyboard focus previews C without selecting it",
    pressed().join() === "B" &&
      description().includes("Focus nets: ground.") &&
      evaluate<boolean>("document.activeElement.matches(':focus-visible')"),
  );
  browser("press", "Enter");
  check("Enter selects C", pressed().join() === "C");
  browser("press", "Escape");
  check(
    "Escape clears the selection",
    pressed().length === 0 && description().includes("Focus nets: none."),
  );
  browser("click", legend("output"));
  browser("hover", legend("input"));
  evaluate(
    "(() => {const create=URL.createObjectURL.bind(URL);window.__landingDownload=null;URL.createObjectURL=blob=>{blob.text().then(text=>window.__landingDownload=text);return create(blob)};return true})()",
  );
  evaluate(
    "[...document.querySelectorAll('button')].find(e=>e.textContent==='Download figure SVG').click()",
  );
  browser("wait", "--fn", "typeof window.__landingDownload==='string'");
  const exported = evaluate<string>("window.__landingDownload");
  const document = dividerLesson("geist-dark", 10000);
  document.presentation.highlight = { components: [], nets: ["output"] };
  const expected = renderFigureSVG(document);
  assert(expected.ok);
  check("export matches core bytes with saved B, not hover A", exported === expected.svg);
  await Bun.write("artifacts/landing/figure.svg", exported);
  browser("hover", "h1");
  for (const theme of ["dark", "light"]) {
    if (evaluate<string>("document.querySelector('.landing').dataset.theme") !== theme) {
      browser("find", "role", "button", "click", "--name", "Dark theme");
    }
    for (const width of [1440, 768, 390, 320]) {
      browser("set", "viewport", String(width), "1000");
      check(
        `${theme} ${width}px contains page overflow`,
        evaluate<boolean>("document.documentElement.scrollWidth<=innerWidth"),
      );
      browser("screenshot", `artifacts/landing/${theme}-${width}.png`, "--full");
    }
    const audit = browser("a11y");
    audits.push({ theme, ...audit });
    check(`${theme} mobile axe has no automatic violations`, audit.counts.violations === 0);
    browser("set", "viewport", "1440", "1000");
    const desktopAudit = browser("a11y");
    audits.push({ theme, viewport: 1440, ...desktopAudit });
    check(`${theme} desktop axe has no automatic violations`, desktopAudit.counts.violations === 0);
  }
  browser("click", "a.landing-primary");
  browser("wait", ".workbench");
  check(
    "primary action reaches the original editor",
    evaluate<boolean>(
      "location.pathname==='/editor' && document.querySelector('h1').textContent.includes('Circuits, made legible')",
    ),
  );
  browser("click", 'nav a[href="/gallery"]');
  browser("wait", 'a[href^="/gallery/view?case="]');
  browser("snapshot", "-i");
  browser("find", "first", 'a[href^="/gallery/view?case="]', "click");
  browser("wait", 'a[href^="/editor?case="]');
  browser("find", "first", 'a[href^="/editor?case="]', "click");
  browser("wait", ".workbench");
  const query = evaluate<string>("location.search");
  check(
    "gallery detail hands the selected case to /editor",
    query.startsWith("?case=") && evaluate<boolean>("location.pathname==='/editor'"),
  );
  browser("open", `${base}/${query}`);
  browser("wait", ".workbench");
  check(
    "legacy root case links retain the editor",
    evaluate<boolean>(
      "location.pathname==='/' && !!document.querySelector('.workbench') && !document.querySelector('.landing')",
    ),
  );
  browser("click", 'nav a[href="/lesson"]');
  browser("wait", ".circuit-lesson-legend");
  check(
    "lesson keeps its two independent figures",
    evaluate<number>("document.querySelectorAll('.circuit-lesson-figure').length") === 2,
  );
  const errors = browser("errors");
  check("browser reports no uncaught page exceptions", errors.errors.length === 0);
  await Bun.write(
    "artifacts/landing/browser-check.json",
    JSON.stringify(
      {
        ok: true,
        checks,
        audits,
        errors,
        note: "Chromium desktop and resized mobile viewports. Export Blob bytes verified; OS download destination and cross-browser behavior are not asserted.",
      },
      null,
      2,
    ),
  );
  console.log(`PASS ${checks.length} landing browser checks`);
} finally {
  browser("close");
}
