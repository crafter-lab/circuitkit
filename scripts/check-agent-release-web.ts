import { strict as assert } from "node:assert";
import { spawnSync } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { agentSetupPrompt } from "../app/landing/agent-prompt.ts";

const origin = process.env.CIRCUITKIT_QA_ORIGIN ?? "http://127.0.0.1:3258";
const out = resolve(process.env.CIRCUITKIT_QA_OUTPUT ?? "artifacts/agent-release/web");
mkdirSync(out, { recursive: true });
const checks: unknown[] = [];
let commands = 0;
const session = spawnSync(
  "agent-browser",
  ["session", "id", "--scope", "worktree", "--prefix", "ckt-copy-prompt"],
  { encoding: "utf8" },
);
assert.equal(session.status, 0, session.stderr);
function browser(...args: string[]) {
  const result = spawnSync(
    "agent-browser",
    ["--session", session.stdout.trim(), "--json", ...args],
    {
      encoding: "utf8",
      maxBuffer: 12 * 1024 * 1024,
    },
  );
  commands++;
  assert.equal(
    result.status,
    0,
    JSON.stringify({ args, stdout: result.stdout, stderr: result.stderr }),
  );
  const envelope = JSON.parse(result.stdout);
  assert(envelope.success, JSON.stringify(envelope));
  return envelope.data;
}
const evaluate = (code: string) => browser("eval", code).result;
const wait = (condition: string) => browser("wait", "--fn", `Boolean(${condition})`);
const audit = (name: string) => {
  const result = browser("a11y", "--selector", "#main");
  writeFileSync(resolve(out, `a11y-${name}.json`), JSON.stringify(result, null, 2));
  assert.equal(result.counts.violations, 0, JSON.stringify(result.violations));
  checks.push({ name, accessibility: result.counts });
};
try {
  browser("open", origin);
  wait(
    "document.querySelector('.narrative-primary') && !document.querySelector('.theme-toggle').disabled",
  );
  for (const width of [1440, 390]) {
    browser("set", "viewport", String(width), "1000");
    for (const theme of ["light", "dark"]) {
      if (evaluate("document.documentElement.classList.contains('dark')") !== (theme === "dark"))
        browser("click", ".theme-toggle");
      wait(`document.documentElement.classList.contains('dark') === ${theme === "dark"}`);
      assert(!evaluate("document.documentElement.scrollWidth > innerWidth"));
      assert(
        evaluate(
          "!!document.querySelector('header a[href=\"https://github.com/crafter-lab/circuitkit\"]')",
        ),
      );
      const measure = () =>
        evaluate(
          `(() => { const b=document.querySelector('.narrative-hero .narrative-primary');const s=getComputedStyle(b);const r=b.getBoundingClientRect();const rgb=x=>x.match(/[\\d.]+/g).slice(0,3).map(Number).map(c=>{c/=255;return c<=.04045?c/12.92:((c+.055)/1.055)**2.4});const lum=x=>{const v=rgb(x);return v[0]*.2126+v[1]*.7152+v[2]*.0722};const a=lum(s.color),z=lum(s.backgroundColor);return {foreground:s.color,background:s.backgroundColor,contrast:(Math.max(a,z)+.05)/(Math.min(a,z)+.05),height:r.height,width:r.width}})()`,
        );
      browser("hover", "h1");
      const normal = measure();
      browser("hover", ".narrative-hero .narrative-primary");
      const hovered = measure();
      assert(
        normal.contrast >= 4.5 && hovered.contrast >= 4.5,
        JSON.stringify({ normal, hovered }),
      );
      assert.equal(normal.background, hovered.background);
      evaluate(
        "window.__copied=[]; Object.defineProperty(navigator,'clipboard',{configurable:true,value:{writeText:async text=>{window.__copied.push(text)}}});true",
      );
      const before = evaluate(
        "document.querySelector('.narrative-demo').getBoundingClientRect().top",
      );
      browser("click", ".narrative-hero .narrative-primary");
      wait(
        "window.__copied.length===1 && !document.querySelector('.narrative-hero .narrative-primary').disabled",
      );
      assert.equal(evaluate("window.__copied[0]"), agentSetupPrompt);
      assert.equal(
        evaluate("document.querySelector('.narrative-hero .narrative-primary').textContent.trim()"),
        "Copy prompt",
      );
      assert(
        evaluate(
          "document.querySelector('.narrative-hero [role=status]').textContent.includes('Paste into your agent')",
        ),
      );
      assert.equal(
        evaluate("document.querySelector('.narrative-demo').getBoundingClientRect().top"),
        before,
      );
      browser("click", ".narrative-hero .agent-prompt-preview summary");
      wait("document.querySelector('.narrative-hero details').open");
      assert.equal(
        evaluate("document.querySelector('.narrative-hero textarea').value"),
        agentSetupPrompt,
      );
      assert(!evaluate("document.documentElement.scrollWidth > innerWidth"));
      browser("click", ".narrative-hero .agent-prompt-preview summary");
      wait("!document.querySelector('.narrative-hero details').open");
      browser("click", ".narrative-close .narrative-primary");
      wait("window.__copied.length === 2");
      assert.equal(evaluate("window.__copied[1]"), agentSetupPrompt);
      browser("click", ".story-navigation button:nth-child(3)");
      wait("document.querySelector('.story-source .shiki')");
      const code = evaluate("document.querySelector('.story-source pre').textContent");
      assert(code.includes('import { renderCircuitSource } from "circuitkit/language";'));
      assert(!code.includes("renderCircuitSource }\n"));
      assert(
        evaluate(
          "new Set([...document.querySelectorAll('.story-source .shiki span[style]')].map(s=>getComputedStyle(s).color)).size >= 3",
        ),
      );
      browser("screenshot", resolve(out, `landing-${width}-${theme}.png`));
      audit(`landing-${width}-${theme}`);
      evaluate(
        "Object.defineProperty(navigator, 'clipboard', {configurable:true,value:{writeText:async()=>{throw new Error('denied')}}});true",
      );
      browser("click", ".narrative-hero .narrative-primary");
      wait(
        "document.querySelector('.narrative-hero details').open && document.querySelector('.narrative-hero [role=status]').textContent.includes('Clipboard unavailable')",
      );
      assert.equal(
        evaluate("document.querySelector('.narrative-hero textarea').value"),
        agentSetupPrompt,
      );
      assert(evaluate("document.querySelector('.narrative-hero textarea').readOnly"));
      browser("focus", ".narrative-hero textarea");
      assert.deepEqual(
        evaluate(
          "(()=>{const t=document.querySelector('.narrative-hero textarea');return[t.selectionStart,t.selectionEnd]})()",
        ),
        [0, agentSetupPrompt.length],
      );
      assert(!evaluate("document.documentElement.scrollWidth > innerWidth"));
      audit(`prompt-fallback-${width}-${theme}`);
      browser("screenshot", resolve(out, `prompt-fallback-${width}-${theme}.png`));
      browser("click", ".narrative-hero .agent-prompt-preview summary");
      wait("!document.querySelector('.narrative-hero details').open");
      checks.push({
        width,
        theme,
        normal,
        hovered,
        clipboard: "exact prompt in both CTAs",
        deniedClipboard: "visible selectable fallback",
        layoutShift: 0,
      });
    }
  }
  browser("set", "viewport", "1440", "1000");
  evaluate("Object.defineProperty(navigator,'clipboard',{configurable:true,value:undefined});true");
  browser("click", ".narrative-hero .narrative-primary");
  wait(
    "document.querySelector('.narrative-hero details').open && document.querySelector('.narrative-hero [role=status]').textContent.includes('Clipboard unavailable')",
  );
  browser("click", ".narrative-hero .agent-prompt-preview summary");
  wait("!document.querySelector('.narrative-hero details').open");
  evaluate(
    "Object.defineProperty(navigator,'clipboard',{configurable:true,value:{writeText:text=>new Promise(resolve=>{window.__finishCopy=()=>{window.__pendingText=text;resolve()}})}});true",
  );
  browser("click", ".narrative-hero .narrative-primary");
  wait(
    "document.querySelector('.narrative-hero .narrative-primary').disabled && document.querySelector('.narrative-hero [role=status]').textContent.includes('Copying prompt')",
  );
  evaluate("window.__finishCopy();true");
  wait(
    "!document.querySelector('.narrative-hero .narrative-primary').disabled && document.querySelector('.narrative-hero [role=status]').textContent.includes('Copied.')",
  );
  assert.equal(evaluate("window.__pendingText"), agentSetupPrompt);
  checks.push({ name: "missing clipboard fallback and pending clipboard state verified" });
  browser("click", ".story-navigation button:nth-child(2)");
  wait("document.querySelectorAll('.presentation-sweep').length > 0");
  const sceneBounds = evaluate(
    "document.querySelector('.story-workspace').getBoundingClientRect().height",
  );
  browser("click", ".story-navigation button:nth-child(1)");
  wait("document.querySelectorAll('.presentation-sweep').length === 0");
  assert.equal(
    evaluate("document.querySelector('.story-workspace').getBoundingClientRect().height"),
    sceneBounds,
  );
  browser("open", `${origin}/markdown`);
  wait(
    "document.querySelector('.studio-workspace') && document.querySelector('.cm-content') && document.querySelector('.presentation-viewer')",
  );
  assert(browser("get", "url").url.includes("/editor?mode=circuitkit"));
  assert(evaluate("!!document.querySelector('.presentation-viewer')"));
  audit("editor-desktop");
  browser("set", "viewport", "390", "1000");
  assert(!evaluate("document.documentElement.scrollWidth > innerWidth"));
  browser("screenshot", resolve(out, "editor-mobile.png"));
  audit("editor-mobile");
  checks.push({ name: "scene geometry stable and Markdown redirects to the real editor" });
  for (const width of [1440, 390]) {
    browser("set", "viewport", String(width), "1000");
    browser("open", `${origin}/docs/quickstart`);
    wait(
      "document.querySelector('.docs-article') && !document.querySelector('.theme-toggle').disabled",
    );
    for (const theme of ["light", "dark"]) {
      if (evaluate("document.documentElement.classList.contains('dark')") !== (theme === "dark"))
        browser("click", ".theme-toggle");
      assert(!evaluate("document.documentElement.scrollWidth > innerWidth"));
      assert(
        evaluate(
          "document.querySelectorAll('h1').length === 1 && document.querySelector('.docs-preview img').complete",
        ),
      );
      assert(
        evaluate(
          "document.querySelector('.docs-sidebar a[aria-current=page]').getAttribute('href') === '/docs/quickstart'",
        ),
      );
      audit(`docs-${width}-${theme}`);
      browser("screenshot", resolve(out, `docs-${width}-${theme}.png`));
    }
    if (width > 1100) browser("click", ".docs-toc a:first-of-type");
    browser("click", ".docs-sidebar a[href='/docs']");
    wait("location.pathname === '/docs' && document.querySelector('.docs-article')");
    assert(!evaluate("document.documentElement.scrollWidth > innerWidth"));
  }
  writeFileSync(
    resolve(out, "receipt.json"),
    JSON.stringify({ ok: true, origin, commands, checks }, null, 2),
  );
  console.log(JSON.stringify({ ok: true, commands, checks: checks.length }));
} finally {
  browser("close");
}
