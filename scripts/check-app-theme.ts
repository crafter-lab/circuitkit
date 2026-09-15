import { strict as assert } from "node:assert";
import { spawnSync } from "node:child_process";
import { appendFileSync, mkdirSync, writeFileSync } from "node:fs";

const base = process.argv[2] ?? "http://127.0.0.1:3218";
const output = process.env.CIRCUITKIT_THEME_ARTIFACTS ?? "artifacts/site-theme";
mkdirSync(output, { recursive: true });
const identity = spawnSync(
  "agent-browser",
  ["session", "id", "--scope", "worktree", "--prefix", "circuitkit-site-theme"],
  { encoding: "utf8" },
);
assert.equal(identity.status, 0, identity.stderr);
const session = identity.stdout.trim();
const checks: { name: string; ok: boolean; evidence?: unknown }[] = [];
const audits: unknown[] = [];
const observations: unknown[] = [];
const blockers: { phase: string; error: string }[] = [];
let phaseName = "initialize";
let commandIndex = 0;
let closed = false;
const limitations = [
  "Headless Chromium viewport QA, not physical-device or cross-browser QA. Native macOS rubber-band overscroll cannot be faithfully simulated.",
  "Axe incomplete checks are recorded, never counted as accessibility passes. Code scrolling and partial text contrast require manual review.",
  "Authored figure SVG palettes are deliberately excluded from global UI token checks and are tested separately for byte stability.",
  "Download Blob bytes are checked; the OS download destination is not asserted.",
  "Unknown-path 404 is a hard navigation: shared shell equivalence is checked, not DOM identity across a new document. Real header NextLink transitions require the exact same node.",
];
function save() {
  writeFileSync(
    `${output}/browser-check.json`,
    JSON.stringify(
      {
        base,
        session,
        ok: checks.every((check) => check.ok) && blockers.length === 0 && closed,
        counts: {
          passed: checks.filter((check) => check.ok).length,
          failed: checks.filter((check) => !check.ok).length,
          blockers: blockers.length,
          audits: audits.length,
          commands: commandIndex,
        },
        closed,
        checks,
        blockers,
        audits,
        observations,
        limitations,
      },
      null,
      2,
    ),
  );
}
function run(args: string[], input?: string) {
  const result = spawnSync("agent-browser", ["--session", session, "--json", ...args], {
    input,
    encoding: "utf8",
    maxBuffer: 32 * 1024 * 1024,
  });
  appendFileSync(
    `${output}/commands.jsonl`,
    `${JSON.stringify({ index: ++commandIndex, phase: phaseName, args, input, exitCode: result.status, stdout: result.stdout, stderr: result.stderr })}\n`,
  );
  assert.equal(result.status, 0, `${args.join(" ")}: ${result.stderr} ${result.stdout}`);
  const envelope = JSON.parse(result.stdout);
  assert(envelope.success, JSON.stringify(envelope));
  return envelope.data;
}
const browser = (...args: string[]) => run(args);
const evaluate = (source: string) => run(["eval", "--stdin"], source).result;
function check(name: string, condition: unknown, evidence?: unknown) {
  let ok = true;
  try {
    assert(condition, name);
  } catch {
    ok = false;
  }
  checks.push({ name: `${phaseName}: ${name}`, ok, evidence });
  console.log(`${ok ? "PASS" : "FAIL"} ${phaseName}: ${name}`);
  save();
}
function phase(name: string, work: () => void) {
  phaseName = name;
  console.log(`PHASE ${name}`);
  try {
    work();
  } catch (error) {
    blockers.push({ phase: name, error: String(error) });
    console.error(`BLOCKED ${name}: ${error}`);
    console.error(
      "This phase stopped. Capturing its current state, then continuing independent phases without retrying the failed action.",
    );
    try {
      capture(`blocked-${name}`);
    } catch (captureError) {
      blockers.push({ phase: `${name} evidence`, error: String(captureError) });
      console.error(`Evidence capture failed: ${captureError}. Continuing independent phases.`);
    }
  }
  save();
}
function mounted() {
  browser("wait", ".site-header .theme-toggle:not(:disabled)");
  browser("wait", "main#main");
  browser("wait", "--fn", "document.fonts.status==='loaded'");
  if (evaluate("!!document.querySelector('.landing-preview')")) {
    browser("wait", '.landing-preview[data-theme-ready="true"]');
    browser("wait", ".landing-preview svg");
  }
}
function open(path: string) {
  browser("open", new URL(path, base).href);
  mounted();
}
function resolved() {
  return evaluate("document.documentElement.classList.contains('dark') ? 'dark' : 'light'");
}
function theme(value: string) {
  mounted();
  if (resolved() !== value) browser("click", ".site-header .theme-toggle");
  browser("wait", "--fn", `document.documentElement.classList.contains(${JSON.stringify(value)})`);
  browser("hover", "h1");
}
function toggle() {
  const next = resolved() === "dark" ? "light" : "dark";
  browser("click", ".site-header .theme-toggle");
  browser("wait", "--fn", `document.documentElement.classList.contains('${next}')`);
  browser("hover", "h1");
  return next;
}
function capture(name: string) {
  browser("screenshot", `${output}/${name}.png`);
  writeFileSync(
    `${output}/${name}-snapshot.json`,
    JSON.stringify(browser("snapshot", "-i"), null, 2),
  );
}
function shellState() {
  return evaluate(`(() => {
    const html = getComputedStyle(document.documentElement), body = getComputedStyle(document.body);
    const header = document.querySelector('.site-header'), h = header.getBoundingClientRect(), s = getComputedStyle(header);
    const main = document.querySelector('main#main').getBoundingClientRect();
    return {
      url: location.href, theme: document.documentElement.className, stored: localStorage.getItem('circuitkit-theme'),
      htmlBackground: html.backgroundColor, bodyBackground: body.backgroundColor,
      htmlScheme: html.colorScheme, bodyScheme: body.colorScheme, bodyColor: body.color,
      headers: document.querySelectorAll('header').length, siteHeaders: document.querySelectorAll('.site-header').length,
      footers: document.querySelectorAll('footer').length, mains: document.querySelectorAll('main').length,
      mainIds: document.querySelectorAll('#main').length,
      scrollY, maxScroll: Math.max(0, document.documentElement.scrollHeight-innerHeight),
      viewport: innerWidth, pageWidth: document.documentElement.scrollWidth,
      bodyWidth: document.body.scrollWidth, mediaDark: matchMedia('(prefers-color-scheme: dark)').matches,
      coarse: matchMedia('(pointer: coarse)').matches, hover: matchMedia('(hover: hover)').matches,
      header: {x:h.x,width:h.width,height:h.height,documentTop:h.top+scrollY,position:s.position,padding:s.padding,border:s.borderBottom,font:s.font,gap:s.gap},
      mainGap: main.top-h.bottom,
      links: [...header.querySelectorAll('a[href^="/"]')].map(e=>({href:e.getAttribute('href'),current:e.getAttribute('aria-current'),height:e.getBoundingClientRect().height})),
      toggle: {pressed: header.querySelector('.theme-toggle').getAttribute('aria-pressed'), label: header.querySelector('.theme-toggle').getAttribute('aria-label'), height:header.querySelector('.theme-toggle').getBoundingClientRect().height,width:header.querySelector('.theme-toggle').getBoundingClientRect().width},
      sameHeader: window.__siteThemeHeader === header,
      overflowing: [...document.querySelectorAll('main *,header *,footer *')].filter(e=>{const r=e.getBoundingClientRect();return r.width && (r.left<-.5||r.right>innerWidth+.5)}).slice(0,30).map(e=>({tag:e.tagName,class:e.getAttribute('class'),text:e.textContent.slice(0,100),rect:e.getBoundingClientRect().toJSON()}))
    };
  })()`);
}
function assertShell(value: string, label: string, sameHeader = false) {
  const s = shellState();
  observations.push({ label, ...s });
  const expected = value === "dark" ? "rgb(20, 20, 20)" : "rgb(255, 255, 255)";
  check(
    `${label} exact opaque HTML/body backgrounds`,
    s.htmlBackground === expected && s.bodyBackground === expected,
    s,
  );
  check(
    `${label} resolved root class and inherited color-scheme`,
    s.theme.split(" ").includes(value) &&
      s.htmlScheme === value &&
      s.bodyScheme === value &&
      s.toggle.pressed === String(value === "dark"),
    s,
  );
  check(
    `${label} one header/footer/main#main`,
    s.headers === 1 && s.siteHeaders === 1 && s.footers === 1 && s.mains === 1 && s.mainIds === 1,
    s,
  );
  check(
    `${label} header begins at document top in normal flow`,
    Math.abs(s.header.documentTop) < 1 && ["static", "relative"].includes(s.header.position),
    s.header,
  );
  check(`${label} no unexplained header/main gap`, Math.abs(s.mainGap) < 1, { mainGap: s.mainGap });
  check(
    `${label} no whole-page horizontal overflow`,
    s.pageWidth <= s.viewport && s.bodyWidth <= s.viewport,
    s.overflowing,
  );
  const pathname = new URL(s.url).pathname;
  const active =
    pathname === "/"
      ? "/"
      : ["/editor", "/gallery", "/lesson"].find(
          (p) => pathname === p || pathname.startsWith(`${p}/`),
        );
  check(
    `${label} canonical active navigation`,
    s.links.every(
      (link: { href: string; current: string | null }) =>
        link.current === (link.href === active ? "page" : null),
    ),
    s.links,
  );
  if (sameHeader)
    check(`${label} exact original header DOM node survives NextLink`, s.sameHeader, s);
  return s;
}
function clickHeader(path: string) {
  browser("click", path === "/" ? ".site-header .wordmark" : `.site-header nav a[href="${path}"]`);
  browser("wait", "--url", new URL(path, base).href);
  mounted();
}
function errors(label: string) {
  const pageErrors = browser("errors");
  const consoleLog = browser("console");
  const hydration =
    JSON.stringify(consoleLog).match(
      /.{0,100}(?:hydration|hydrating|did not match|server rendered HTML).{0,400}/gi,
    ) ?? [];
  writeFileSync(
    `${output}/${label}-errors.json`,
    JSON.stringify({ pageErrors, consoleLog, hydration }, null, 2),
  );
  check(`${label} no uncaught page errors`, pageErrors.errors.length === 0, pageErrors);
  check(`${label} no hydration errors or warnings`, hydration.length === 0, hydration);
}
function audit(label: string) {
  const result = browser("a11y");
  const artifact = `${output}/${label}-a11y.json`;
  writeFileSync(artifact, JSON.stringify(result, null, 2));
  audits.push({
    label,
    artifact,
    counts: result.counts,
    violations: result.violations,
    incomplete: result.incomplete,
  });
  check(`${label} axe automatic violations`, result.counts.violations === 0, {
    counts: result.counts,
    artifact,
  });
}
function tokens(label: string) {
  const result = evaluate(`(() => {
    const root = getComputedStyle(document.documentElement);
    const names = ['background','foreground','card','card-foreground','popover','popover-foreground','secondary','secondary-foreground','muted','muted-foreground','accent','accent-foreground','border','input','primary','primary-foreground','ring','destructive','destructive-background','destructive-border','success','success-background','success-border','warning','syntax-text','syntax-keyword','syntax-string','syntax-function','syntax-number','syntax-comment','syntax-punctuation','syntax-type','syntax-background'];
    const probe = document.createElement('span'); document.body.append(probe);
    const palette = Object.fromEntries(names.map(name=>{probe.style.color=root.getPropertyValue('--'+name);return [name,getComputedStyle(probe).color]})); probe.remove();
    const allowed = new Set([...Object.values(palette),'rgba(0, 0, 0, 0)']);
    const backgrounds = new Set(['background','card','popover','secondary','muted','accent','primary','destructive-background','success-background','syntax-background'].map(name=>palette[name]).concat('rgba(0, 0, 0, 0)'));
    const elements = [...document.querySelectorAll('header a,header button,footer,main,main h1,main h2,main p,main button,main input,main select,main textarea,.sidebar,.gallery-card,.lesson-settings,pre')].filter(e=>e.getBoundingClientRect().width && !e.closest('.circuit-lesson-figure,.gallery-thumbnail,svg'));
    const samples = elements.map(e=>{const s=getComputedStyle(e);return {tag:e.tagName,class:e.getAttribute('class'),text:(e.getAttribute('aria-label')||e.textContent).slice(0,100),color:s.color,background:s.backgroundColor,border:s.borderColor,height:e.getBoundingClientRect().height}});
    return {palette,samples,unmatched:samples.filter(s=>!allowed.has(s.color)||!backgrounds.has(s.background))};
  })()`);
  writeFileSync(`${output}/${label}-tokens.json`, JSON.stringify(result, null, 2));
  check(
    `${label} UI text/control/panel colors use global tokens`,
    result.unmatched.length === 0,
    result.unmatched,
  );
}
function installDownloadProbe() {
  evaluate(
    `(() => {window.__siteThemeDownloads=[];const create=URL.createObjectURL.bind(URL);URL.createObjectURL=blob=>{blob.text().then(text=>window.__siteThemeDownloads.push(text));return create(blob)};return true})()`,
  );
}
function download(selector: string) {
  const count = evaluate("window.__siteThemeDownloads.length");
  browser("click", selector);
  browser("wait", "--fn", `window.__siteThemeDownloads.length===${count + 1}`);
  return evaluate(`window.__siteThemeDownloads[${count}]`);
}
let detail = "";
try {
  phase("system-and-storage", () => {
    open("/");
    evaluate("localStorage.removeItem('circuitkit-theme')");
    browser("set", "media", "light");
    browser("reload");
    mounted();
    for (const value of ["light", "dark", "light", "dark"]) {
      browser("set", "media", value);
      browser("wait", "--fn", `document.documentElement.classList.contains('${value}')`);
      assertShell(value, `system-${value}`);
      check(
        `OS ${value} remains system-owned without stored override`,
        evaluate("localStorage.getItem('circuitkit-theme')") === null,
      );
    }
    for (const value of ["light", "dark"]) {
      theme(value);
      check(
        `${value} UI override stored`,
        evaluate("localStorage.getItem('circuitkit-theme')") === value,
      );
      browser("set", "media", value === "light" ? "dark" : "light");
      assertShell(value, `${value}-ignores-opposite-OS`);
      evaluate("window.__siteThemeReloadSentinel=true");
      browser("reload");
      mounted();
      check(
        `${value} reload creates a new document`,
        evaluate("window.__siteThemeReloadSentinel===undefined"),
      );
      assertShell(value, `${value}-hard-reload`);
      check(
        `${value} storage survives reload`,
        evaluate("localStorage.getItem('circuitkit-theme')") === value,
      );
      evaluate("window.__siteThemeHeader=document.querySelector('.site-header');true");
      for (const path of ["/editor", "/gallery", "/lesson", "/"]) {
        clickHeader(path);
        assertShell(value, `${value}-NextLink-${path}`, true);
        check(
          `${path} keeps stored ${value}`,
          evaluate("localStorage.getItem('circuitkit-theme')") === value,
        );
      }
    }
    errors("system-and-storage");
  });
  phase("gallery-and-legacy", () => {
    open("/gallery");
    theme("dark");
    detail = evaluate(
      "document.querySelector('a[href^=\"/gallery/view?case=\"]').getAttribute('href')",
    );
    assert(detail, "No valid gallery detail link found");
    browser("click", `a[href=${JSON.stringify(detail)}]`);
    browser("wait", 'a[href^="/editor?case="]');
    mounted();
    assertShell("dark", "valid-gallery-detail");
    const editorLink = evaluate(
      "document.querySelector('a[href^=\"/editor?case=\"]').getAttribute('href')",
    );
    browser("click", `a[href=${JSON.stringify(editorLink)}]`);
    browser("wait", ".workbench");
    mounted();
    const query = evaluate("location.search");
    check(
      "detail selected case reaches editor",
      query.includes("case=") && evaluate("location.pathname==='/editor'"),
      { detail, editorLink, query },
    );
    open(`/${query}`);
    browser("wait", ".workbench");
    check(
      "legacy /?case renders editor, not landing",
      evaluate("!!document.querySelector('.workbench')&&!document.querySelector('.landing')"),
    );
    assertShell("dark", "legacy-root-case");
    capture("legacy-root-case-dark");
    browser("reload");
    mounted();
    assertShell("dark", "legacy-hard-reload");
    errors("gallery-and-legacy");
  });
  phase("gallery-detail-isolation", () => {
    assert(detail, "Gallery detail URL was not discovered");
    open(detail);
    theme("light");
    const state = () =>
      evaluate(`(async () => {
      const links = [...document.querySelectorAll('main a')].filter(e=>/^Download (JSON|SVG)/.test(e.textContent.trim()));
      const downloads = await Promise.all(links.map(async e=>{
        if(new URL(e.href).origin!==location.origin) throw new Error('Download left local origin');
        const response = await fetch(e.href);
        return {href:e.getAttribute('href'),status:response.status,text:await response.text()};
      }));
      return {downloads,svgs:[...document.querySelectorAll('main svg')].map(e=>e.outerHTML),images:[...document.querySelectorAll('main img')].map(e=>e.getAttribute('src')),source:[...document.querySelectorAll('main pre')].map(e=>e.textContent)};
    })()`);
    const before = state();
    check(
      "gallery exposes successful JSON and SVG downloads",
      before.downloads.length === 2 &&
        before.downloads.every((item: { status: number }) => item.status === 200) &&
        before.downloads.some((item: { text: string }) => item.text.includes("<svg")),
      before.downloads.map((item: { href: string; status: number; text: string }) => ({
        href: item.href,
        status: item.status,
        bytes: item.text.length,
      })),
    );
    capture("gallery-detail-isolation-light");
    toggle();
    const after = state();
    check(
      "global dark preserves corpus JSON, SVG download bytes and displayed figure",
      JSON.stringify(before) === JSON.stringify(after),
      { before, after },
    );
    capture("gallery-detail-isolation-dark");
    errors("gallery-detail-isolation");
  });
  phase("editor-isolation", () => {
    open("/editor");
    theme("light");
    installDownloadProbe();
    const selector = '.workbench select:has(option[value="geist-print"])';
    for (const preset of ["geist-print", "geist-light"]) {
      browser("select", selector, preset);
      const before = evaluate(
        "({json:document.querySelector('textarea').value,svg:document.querySelector('[aria-label=\"Current figure\"] svg').outerHTML})",
      );
      const beforeDownload = download(".workbench button.primary");
      capture(`editor-${preset}-before`);
      const value = toggle();
      const after = evaluate(
        "({json:document.querySelector('textarea').value,svg:document.querySelector('[aria-label=\"Current figure\"] svg').outerHTML})",
      );
      const afterDownload = download(".workbench button.primary");
      check(
        `${preset} JSON and authored SVG unchanged by global ${value}`,
        JSON.stringify(before) === JSON.stringify(after),
        { before, after },
      );
      check(`${preset} export bytes unchanged`, beforeDownload === afterDownload, {
        bytes: beforeDownload.length,
      });
      check(
        `${preset} explicit figure selector unchanged`,
        evaluate(`document.querySelector(${JSON.stringify(selector)}).value`) === preset,
      );
      capture(`editor-${preset}-after`);
    }
    const invalid = '{\n  "draft": "keep spacing + invalid JSON",\n  BROKEN: [  1,\n';
    browser(
      "find",
      "role",
      "textbox",
      "fill",
      invalid,
      "--name",
      "Figure document JSON",
      "--exact",
    );
    browser("wait", "--fn", "document.querySelector('.workbench button.primary').disabled");
    for (const value of ["dark", "light"]) {
      theme(value);
      check(
        `invalid ${value} draft retained verbatim`,
        evaluate("document.querySelector('textarea').value") === invalid,
      );
      check(
        `invalid ${value} export and copy stay disabled`,
        evaluate(
          "[...document.querySelectorAll('.workbench button')].filter(e=>/Download SVG|Copy JSON/.test(e.textContent)).length===2 && [...document.querySelectorAll('.workbench button')].filter(e=>/Download SVG|Copy JSON/.test(e.textContent)).every(e=>e.disabled)",
        ),
      );
      capture(`editor-invalid-${value}`);
    }
    errors("editor-isolation");
  });
  phase("gallery-filter-isolation", () => {
    open("/gallery");
    theme("light");
    browser("select", '.gallery-filters select:has(option[value="geist-print"])', "geist-print");
    browser("fill", '.gallery-filters input[type="search"]', "divider");
    const state = () =>
      evaluate(
        "({url:location.href,values:[...document.querySelectorAll('.gallery-filters input,.gallery-filters select')].map(e=>e.value),tabs:[...document.querySelectorAll('.gallery-tabs button')].map(e=>e.getAttribute('aria-pressed')),cards:[...document.querySelectorAll('.gallery-card a')].map(e=>e.getAttribute('href')),images:[...document.querySelectorAll('.gallery-card img')].map(e=>e.getAttribute('src'))})",
      );
    const before = state();
    check("print preset filter has real results", before.cards.length > 0, before);
    capture("gallery-filter-light");
    toggle();
    check(
      "global toggle preserves preset/search/category/results and authored images",
      JSON.stringify(before) === JSON.stringify(state()),
      { before, after: state() },
    );
    capture("gallery-filter-dark");
    errors("gallery-filter-isolation");
  });
  phase("lesson-isolation", () => {
    open("/lesson");
    theme("light");
    installDownloadProbe();
    const selector = '.lesson-settings select:has(option[value="geist-print"])';
    evaluate(
      "[...document.querySelectorAll('.circuit-lesson-figure')].forEach((e,i)=>e.setAttribute('data-site-theme-figure',String(i)));true",
    );
    browser("click", '[data-site-theme-figure="0"] [data-legend-net="output"] button');
    const secondNet = evaluate(
      "document.querySelectorAll('.circuit-lesson-figure')[1].querySelector('[data-legend-net]').getAttribute('data-legend-net')",
    );
    browser("click", `[data-site-theme-figure="1"] [data-legend-net="${secondNet}"] button`);
    browser("hover", "h1");
    const state = () =>
      evaluate(
        "({values:[...document.querySelectorAll('.lesson-settings input,.lesson-settings select')].map(e=>({value:e.value,checked:e.checked})),selected:[...document.querySelectorAll('[data-legend-net] button[aria-pressed=\"true\"]')].map(e=>e.parentElement.getAttribute('data-legend-net')),svgs:[...document.querySelectorAll('.circuit-lesson-figure svg')].map(e=>e.outerHTML)})",
      );
    for (const preset of ["geist-print", "geist-light"]) {
      browser("select", selector, preset);
      browser("hover", "h1");
      const before = state();
      check(
        `${preset} both lesson figures have saved selections`,
        before.selected.length === 2,
        before.selected,
      );
      const downloads = evaluate(
        "[...document.querySelectorAll('.circuit-lesson-figure button')].filter(e=>e.textContent==='Download figure SVG').map(e=>{e.setAttribute('data-site-theme-download',String([...document.querySelectorAll('.circuit-lesson-figure')].indexOf(e.closest('.circuit-lesson-figure'))));return e.getAttribute('data-site-theme-download')})",
      );
      const beforeBytes = downloads.map((id: string) =>
        download(`[data-site-theme-download="${id}"]`),
      );
      browser("hover", "h1");
      capture(`lesson-${preset}-before`);
      toggle();
      const after = state();
      check(
        `${preset} host inputs, both selections and SVG bytes unchanged`,
        JSON.stringify(before) === JSON.stringify(after),
        { before, after },
      );
      const afterBytes = downloads.map((id: string) =>
        download(`[data-site-theme-download="${id}"]`),
      );
      check(
        `${preset} both exported SVGs byte-identical`,
        JSON.stringify(beforeBytes) === JSON.stringify(afterBytes),
        beforeBytes.map((svg: string) => svg.length),
      );
      capture(`lesson-${preset}-after`);
    }
    errors("lesson-isolation");
  });
  phase("landing-global-demo", () => {
    open("/");
    theme("light");
    browser("click", '[data-legend-net="output"] button');
    browser("hover", "h1");
    const before = evaluate("document.querySelector('.landing-preview svg').outerHTML");
    const selected = () =>
      evaluate(
        "[...document.querySelectorAll('[data-legend-net] button[aria-pressed=\"true\"]')].map(e=>e.textContent).join(',')",
      );
    check("landing B selected", selected() === "B");
    toggle();
    const dark = evaluate("document.querySelector('.landing-preview svg').outerHTML");
    check(
      "landing demo follows global dark and retains B",
      before !== dark && selected() === "B" && dark.includes("Focus nets: output."),
    );
    capture("landing-selected-dark");
    toggle();
    check(
      "landing demo returns to exact light SVG bytes and retains B",
      evaluate("document.querySelector('.landing-preview svg').outerHTML") === before &&
        selected() === "B",
    );
    capture("landing-selected-light");
    errors("landing-global-demo");
  });
  const headerBaselines = new Map<string, string>();
  for (const width of [1440, 390, 320]) {
    for (const value of ["light", "dark"]) {
      for (const [name, path] of [
        ["root", "/"],
        ["editor", "/editor"],
        ["gallery", "/gallery"],
        ["detail", detail],
        ["lesson", "/lesson"],
        ["404", "/site-theme-qa-not-found"],
      ]) {
        phase(`${name}-${value}-${width}`, () => {
          assert(path, "Valid detail URL must be discovered in gallery phase");
          browser("set", "viewport", String(width), "1000");
          open(path);
          theme(value);
          browser("scroll", "up", "1000000");
          const state = assertShell(value, "top");
          check("top scroll boundary reached", state.scrollY === 0, state.scrollY);
          const signature = JSON.stringify(state.header);
          const geometry = JSON.stringify([
            state.header.x,
            state.header.width,
            state.header.height,
            state.header.padding,
            state.header.font,
            state.header.gap,
          ]);
          const geometryKey = `${width}-both-modes`;
          if (!headerBaselines.has(geometryKey)) headerBaselines.set(geometryKey, geometry);
          check(
            "header geometry remains identical across light/dark",
            geometry === headerBaselines.get(geometryKey),
            { actual: geometry, expected: headerBaselines.get(geometryKey) },
          );
          const key = `${width}-${value}`;
          if (!headerBaselines.has(key)) headerBaselines.set(key, signature);
          check(
            "header dimensions and computed styles match root",
            signature === headerBaselines.get(key),
            { actual: state.header, root: headerBaselines.get(key) },
          );
          check(
            "header controls use desktop 32px minimum targets",
            state.toggle.height >= 32 &&
              state.toggle.width >= 32 &&
              state.links.every((link: { height: number }) => link.height >= 32),
            { toggle: state.toggle, links: state.links },
          );
          tokens(`${name}-${value}-${width}`);
          capture(`${name}-${value}-${width}-top`);
          audit(`${name}-${value}-${width}`);
          if (name === "root" || name === "editor") {
            browser("scroll", "down", "1000000");
            const bottom = assertShell(value, "bottom");
            check(
              "bottom scroll boundary reached",
              Math.abs(bottom.scrollY - bottom.maxScroll) <= 1,
              bottom,
            );
            capture(`${name}-${value}-${width}-bottom`);
            browser("scroll", "up", "1000000");
            assertShell(value, "returned-top");
          }
          if (name === "404") {
            check(
              "custom 404 copy rendered",
              evaluate("document.querySelector('h1').textContent.includes('Page not found')"),
            );
            browser("reload");
            mounted();
            assertShell(value, "404-reload");
            evaluate("window.__siteThemeHeader=document.querySelector('.site-header');true");
            clickHeader("/");
            assertShell(value, "404-wordmark-recovery", true);
          }
          errors(`${name}-${value}-${width}`);
        });
      }
    }
  }
  phase("landing-code-accessibility", () => {
    browser("set", "viewport", "320", "1000");
    open("/");
    for (const value of ["light", "dark"]) {
      theme(value);
      const snapshot = browser("snapshot", "-i");
      const region = Object.entries(
        snapshot.refs as Record<string, { name: string; role: string }>,
      ).find(
        ([, ref]) =>
          ref.role === "region" && ref.name === "Render a circuit with the CircuitKit core",
      );
      assert(region, "Code region must appear in the fresh accessibility snapshot");
      browser("focus", `@${region[0]}`);
      check(
        `${value} code scroll region is keyboard focused`,
        evaluate(
          "document.activeElement.getAttribute('aria-label')==='Render a circuit with the CircuitKit core'",
        ),
      );
      capture(`landing-code-${value}`);
      audit(`landing-code-${value}`);
    }
    errors("landing-code-accessibility");
  });
  phase("coarse-pointer", () => {
    browser("set", "device", "iPhone 12");
    open("/");
    const coarse = evaluate(
      "matchMedia('(pointer: coarse)').matches && !matchMedia('(hover: hover)').matches",
    );
    observations.push({ label: "device-emulation", state: shellState(), coarse });
    if (!coarse) {
      limitations.push(
        "CLI iPhone 12 emulation did not establish coarse-pointer/no-hover media. 44px coarse targets are unverified; narrow runs are viewport-only, not device QA.",
      );
      console.log(
        "LIMITATION coarse-pointer media not established; not claiming device QA or a 44px pass.",
      );
      return;
    }
    for (const value of ["light", "dark"]) {
      theme(value);
      const s = assertShell(value, `coarse-${value}`);
      check(
        `${value} actual coarse media uses 44px header hit targets`,
        s.toggle.width >= 44 &&
          s.toggle.height >= 44 &&
          s.links.every((link: { height: number }) => link.height >= 44),
        s,
      );
      capture(`coarse-${value}`);
    }
  });
} finally {
  phaseName = "close";
  try {
    browser("close");
    closed = true;
  } catch (error) {
    blockers.push({ phase: "close", error: String(error) });
    console.error(`Close failed: ${error}. Session cleanup is unverified.`);
  }
  save();
}
const failed = checks.filter((check) => !check.ok).length;
console.log(
  `${checks.length - failed} passed, ${failed} failed, ${blockers.length} blocked phases; ${audits.length} accessibility audits. ${output}/browser-check.json`,
);
process.exitCode = failed || blockers.length ? 1 : 0;
