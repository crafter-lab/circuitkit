import { strict as assert } from "node:assert";
import { spawnSync } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import { renderFigureSVG } from "../src/figure-svg.ts";
import { renderSchematicSVG } from "../src/renderer.ts";
import { decodeShareDocument, type ShareView } from "../src/share.ts";
import type { RenderResult } from "../src/types.ts";

const base = process.argv[2] ?? "http://127.0.0.1:3227";
const output = process.env.CIRCUITKIT_AUTHORING_ARTIFACTS ?? "artifacts/authoring-browser";
mkdirSync(output, { recursive: true });
const identity = spawnSync(
  "agent-browser",
  ["session", "id", "--scope", "worktree", "--prefix", "circuitkit-authoring-check"],
  { encoding: "utf8" },
);
assert.equal(identity.status, 0, identity.stderr);
const session = identity.stdout.trim();
const checks: { name: string; ok: boolean }[] = [];
const audits: unknown[] = [];
const geometry: unknown[] = [];
const views = ["schematic", "annotated", "figure"] as const;
const viewSelector = ".editor-view-field select";
type Rendered = Extract<RenderResult, { ok: true }>;
let error: string | null = null;
let closed = false;
function browser(...args: string[]) {
  return run(args);
}
function run(args: string[], input?: string) {
  const result = spawnSync("agent-browser", ["--session", session, "--json", ...args], {
    input,
    encoding: "utf8",
    maxBuffer: 16 * 1024 * 1024,
  });
  assert.equal(result.status, 0, `${args.join(" ")}: ${result.stderr} ${result.stdout}`);
  const envelope = JSON.parse(result.stdout);
  assert(envelope.success, JSON.stringify(envelope));
  return envelope.data;
}
function evaluate(source: string) {
  return run(["eval", "--stdin"], source).result;
}
function check(name: string, condition: unknown) {
  checks.push({ name, ok: Boolean(condition) });
  assert(condition, name);
  console.log(`PASS ${name}`);
}
function ready() {
  browser("wait", "--fn", "document.querySelector('.status')?.textContent==='Ready to export'");
}
function click(name: string) {
  browser("find", "role", "button", "click", "--name", name, "--exact");
}
function panel(name: "Circuit" | "Style" | "Explain" | "Source") {
  const selector = `.inspector-switcher label:has(input[value="${name}"])`;
  browser("scrollintoview", selector);
  browser(
    "wait",
    "--fn",
    `(() => {
      const label = document.querySelector(${JSON.stringify(selector)});
      if (!label) return false;
      const rect = label.getBoundingClientRect();
      const x = rect.left + rect.width / 2;
      const y = rect.top + rect.height / 2;
      return rect.width > 0 && rect.height > 0 && x >= 0 && x < innerWidth &&
        y >= 0 && y < innerHeight && label.contains(document.elementFromPoint(x, y));
    })()`,
  );
  browser("click", selector);
  browser(
    "wait",
    "--fn",
    `document.querySelector('input[name="inspector-panel"]:checked')?.value === ${JSON.stringify(name)}`,
  );
}
function exportsOpen() {
  if (!evaluate("document.querySelector('.export-disclosure').open"))
    browser("click", ".export-disclosure > summary");
}
function fill(name: string, value: string) {
  if (!value.includes("\n")) {
    browser("find", "label", name, "fill", value);
    return;
  }
  evaluate(`(() => {
    const element = [...document.querySelectorAll('textarea,input')].find(e => [...(e.labels ?? [])].some(l => l.textContent.trim() === ${JSON.stringify(name)}));
    if (!element) throw new Error('Missing labelled input');
    Object.getOwnPropertyDescriptor(Object.getPrototypeOf(element), 'value').set.call(element, ${JSON.stringify(value)});
    element.dispatchEvent(new Event('input', { bubbles: true }));
    element.dispatchEvent(new Event('change', { bubbles: true }));
  })()`);
}
function source() {
  return evaluate("document.querySelector('#json-source').value") as string;
}
function capture(name: string) {
  browser("screenshot", `${output}/${name}.png`);
  writeFileSync(
    `${output}/${name}-snapshot.json`,
    JSON.stringify(browser("snapshot", "-i"), null, 2),
  );
}
function selectView(view: ShareView) {
  browser("select", viewSelector, view);
  browser(
    "wait",
    "--fn",
    `document.querySelector('.editor-workbench')?.dataset.renderView === ${JSON.stringify(view)}`,
  );
  ready();
}
function currentView() {
  return evaluate(`document.querySelector(${JSON.stringify(viewSelector)}).value`) as ShareView;
}
function rendered(document: unknown, view: ShareView): Rendered {
  const result =
    view === "figure"
      ? renderFigureSVG(document)
      : renderSchematicSVG(document, { annotations: view === "annotated" });
  assert(result.ok, JSON.stringify(result.diagnostics));
  return result;
}
function openShare(link: string) {
  browser("open", `${base}/editor`);
  evaluate(`location.hash = ${JSON.stringify(new URL(link, base).hash)}`);
  browser("reload");
  ready();
}
function svgParity(name: string, selector: string, expected: Rendered, responsive = false) {
  const parity = evaluate(`(() => {
    const wrapper = document.querySelector(${JSON.stringify(selector)});
    const expected = document.createElement('div');
    expected.innerHTML = ${JSON.stringify(expected.svg)};
    const actual = wrapper.cloneNode(true);
    if (${responsive}) actual.querySelector(':scope > svg')?.removeAttribute('style');
    let offset = 0;
    while (offset < actual.innerHTML.length && actual.innerHTML[offset] === expected.innerHTML[offset]) offset++;
    return { equal: actual.innerHTML === expected.innerHTML, offset, actual: actual.innerHTML.slice(offset, offset + 160), expected: expected.innerHTML.slice(offset, offset + 160) };
  })()`);
  if (!parity.equal) console.error(JSON.stringify(parity));
  check(`${name}: canonical SVG DOM parity`, parity.equal);
}
function measure(name: string, selector: string) {
  const data = evaluate(`(() => {
    const element = document.querySelector(${JSON.stringify(selector)});
    if (!element) throw new Error('Missing geometry target');
    const rect = element.getBoundingClientRect();
    const style = getComputedStyle(element);
    const svg = element.querySelector('svg');
    const box = svg?.getBoundingClientRect();
    const paint = [...(svg?.querySelectorAll('path,line,polyline,polygon,circle,ellipse,rect,text,use') ?? [])].filter(node => {
      if (node.closest('defs,clipPath,mask')) return false;
      const css = getComputedStyle(node);
      const r = node.getBoundingClientRect();
      return css.display !== 'none' && css.visibility === 'visible' && Number(css.opacity) > 0 && (r.width > 0 || r.height > 0) && (css.fill !== 'none' || css.stroke !== 'none');
    });
    const number = value => Number.parseFloat(value) || 0;
    return { viewport: innerWidth, width: rect.width, height: rect.height, top: rect.top + scrollY, left: rect.left, right: rect.right, minHeight: style.minHeight, verticalChrome: ['paddingTop','paddingBottom','borderTopWidth','borderBottomWidth'].reduce((sum, key) => sum + number(style[key]), 0), svgWidth: box?.width ?? 0, svgHeight: box?.height ?? 0, paintedElements: paint.length, rootWidth: document.documentElement.scrollWidth };
  })()`);
  geometry.push({ name, selector, ...data });
  return data;
}
function pureView(name: string, selector: string) {
  check(
    `${name}: pure SVG without framing or annotation labels`,
    evaluate(`(() => {
    const wrapper = document.querySelector(${JSON.stringify(selector)});
    return wrapper.children.length === 1 && wrapper.firstElementChild.tagName.toLowerCase() === 'svg' &&
      !wrapper.querySelector('button,a,input,select,summary,figcaption,[data-label="title"],[data-label="subtitle"],[data-label="formula"],[data-label="assumption"],.annotation,[data-net-label]') &&
      [...wrapper.childNodes].every(node => node.nodeType !== Node.TEXT_NODE || !node.textContent.trim());
  })()`),
  );
  const data = measure(name, selector);
  check(
    `${name}: natural SVG height with no fixed minimum`,
    ["auto", "0px"].includes(data.minHeight) &&
      data.svgHeight > 0 &&
      Math.abs(data.height - data.svgHeight - data.verticalChrome) <= 2,
  );
  return data;
}
function compactNotes(name: string) {
  check(
    `${name}: compact lesson and initially closed Notes`,
    evaluate(
      "document.querySelector('.landing-preview .circuit-lesson-figure')?.dataset.layout==='compact' && document.querySelector('.circuit-lesson-notes')?.open===false",
    ),
  );
  const closed = measure(`${name}-closed`, ".circuit-lesson-figure");
  const bar = measure(`${name}-bar`, ".circuit-lesson-compact-chrome");
  const row = evaluate(`(() => {
    const controls = document.querySelector('.circuit-lesson-controls').getBoundingClientRect();
    const notes = document.querySelector('.circuit-lesson-notes > summary').getBoundingClientRect();
    return { height: Math.max(controls.height, notes.height), aligned: Math.abs(controls.top - notes.top) <= 2 };
  })()`);
  check(
    `${name}: closed chrome occupies one control row, not a notes grid`,
    row.aligned && row.height > 0 && Math.abs(bar.height - bar.verticalChrome - row.height) <= 2,
  );
  browser("click", ".circuit-lesson-notes > summary");
  const opened = measure(`${name}-open`, ".circuit-lesson-figure");
  check(
    `${name}: opening Notes adds visible content and real height`,
    evaluate(
      "document.querySelector('.circuit-lesson-notes').open && document.querySelector('.circuit-lesson-notes-content').checkVisibility() && document.querySelector('.circuit-lesson-notes-content').getBoundingClientRect().height>0",
    ) &&
      opened.height > closed.height &&
      evaluate("document.documentElement.scrollWidth<=innerWidth"),
  );
  audit(`${name}-notes-open`);
  browser("click", ".circuit-lesson-notes > summary");
  const restored = measure(`${name}-closed-again`, ".circuit-lesson-figure");
  check(
    `${name}: closing Notes removes its layout space`,
    Math.abs(restored.height - closed.height) <= 2,
  );
}
function instrumentExports() {
  evaluate(`(() => {
    window.__texts=[]; window.__images=[]; window.__downloads=[]; window.__blobs=new Map();
    window.__copyText=async text=>{window.__texts.push(text)};
    const encode = async blob => {
      const bytes = new Uint8Array(await blob.arrayBuffer());
      let binary = ''; for (const byte of bytes) binary += String.fromCharCode(byte);
      return { type: blob.type, base64: btoa(binary) };
    };
    Object.defineProperty(navigator,'clipboard',{configurable:true,value:{writeText:window.__copyText,write:async items=>{
      for(const item of items) window.__images.push(await encode(await item.getType('image/png')));
    }}});
    const create = URL.createObjectURL.bind(URL);
    const revoke = URL.revokeObjectURL.bind(URL);
    URL.createObjectURL = blob => { const url=create(blob); window.__blobs.set(url,blob); return url; };
    URL.revokeObjectURL = url => { window.__blobs.delete(url); revoke(url); };
    const click = HTMLAnchorElement.prototype.click;
    HTMLAnchorElement.prototype.click = function() {
      if (!this.download) return click.call(this);
      const entry={name:this.download,url:this.href}; window.__downloads.push(entry);
      const blob=window.__blobs.get(this.href);
      if (blob) encode(blob).then(bytes=>Object.assign(entry,bytes));
    };
  })()`);
}
function verifyPNG(
  name: string,
  png: { type: string; base64: string },
  expected: Rendered,
  scale: number,
) {
  const bytes = Buffer.from(png.base64, "base64");
  check(
    `${name}: actual PNG bytes and selected-view dimensions`,
    png.type === "image/png" &&
      bytes.length > 24 &&
      bytes.subarray(0, 8).toString("hex") === "89504e470d0a1a0a" &&
      bytes.readUInt32BE(16) === Math.ceil(expected.bounds.width * scale) &&
      bytes.readUInt32BE(20) === Math.ceil(expected.bounds.height * scale),
  );
  const pixels = evaluate(`(async () => {
    const width=${Math.ceil(expected.bounds.width * scale)}, height=${Math.ceil(expected.bounds.height * scale)};
    const raster = async url => {
      const image=new Image(); image.src=url; await image.decode();
      const canvas=document.createElement('canvas'); canvas.width=width; canvas.height=height;
      const context=canvas.getContext('2d'); context.drawImage(image,0,0,width,height);
      return context.getImageData(0,0,width,height).data;
    };
    const url=URL.createObjectURL(new Blob([${JSON.stringify(expected.svg)}],{type:'image/svg+xml;charset=utf-8'}));
    try {
      const expected=await raster(url);
      const actual=await raster(${JSON.stringify(`data:image/png;base64,${png.base64}`)});
      let differingPixels=0, opaquePixels=0;
      for(let i=0;i<actual.length;i+=4) {
        if(actual[i+3]) opaquePixels++;
        if(actual[i]!==expected[i] || actual[i+1]!==expected[i+1] || actual[i+2]!==expected[i+2] || actual[i+3]!==expected[i+3]) differingPixels++;
      }
      return {width,height,differingPixels,opaquePixels};
    } finally { URL.revokeObjectURL(url); }
  })()`);
  geometry.push({ name, png: pixels });
  check(
    `${name}: decoded pixels match the canonical view raster`,
    pixels.differingPixels === 0 && pixels.opaquePixels > 0,
  );
  writeFileSync(`${output}/${name}.png`, bytes);
}
function audit(name: string) {
  const data = browser("a11y");
  audits.push({ name, data });
  const violations = data.violations ?? data.results?.violations;
  check(`${name}: no axe violations`, Array.isArray(violations) && violations.length === 0);
}
try {
  browser("open", base);
  browser("set", "viewport", "1280", "900");
  browser("wait", '.landing-preview[data-theme-ready="true"]');
  browser("snapshot", "-i");
  check(
    "landing is install-first with package and skill anchors",
    evaluate(
      "JSON.stringify([...document.querySelectorAll('.landing-actions a')].map(a=>a.getAttribute('href')))===JSON.stringify(['#install','#install-skill']) && !!document.querySelector('#install') && !!document.querySelector('#install-skill')",
    ),
  );
  check(
    "unpublished npm status is visible beside hero CTAs",
    evaluate(`(() => {
    const status=document.querySelector('.landing-hero #package-status');
    const hero=document.querySelector('.landing-introduction').getBoundingClientRect();
    const rect=status?.getBoundingClientRect();
    return status?.checkVisibility() && /not (on|published to) npm/i.test(status.textContent) && rect.height>0 && rect.top>=hero.top && rect.bottom<=hero.bottom;
  })()`),
  );
  check(
    "landing defaults to schematic",
    evaluate(
      "document.querySelector('.landing-preview').dataset.previewMode==='schematic' && !document.querySelector('.landing-preview .circuit-lesson-figure')",
    ),
  );
  pureView("landing-default", ".landing-schematic");
  const initialLandingLink = evaluate(
    "document.querySelector('.landing-preview-edit').getAttribute('href')",
  ) as string;
  const initialLanding = decodeShareDocument(new URL(initialLandingLink, base).hash);
  check(
    "default landing editor link carries schematic view",
    initialLanding.ok && initialLanding.view === "schematic",
  );
  assert(initialLanding.ok);
  svgParity(
    "landing-default",
    ".landing-schematic",
    rendered(initialLanding.document, "schematic"),
    true,
  );
  instrumentExports();
  const installLocation = evaluate("location.href");
  for (const label of [
    "Build CircuitKit from source",
    "Install the local tarball in your project",
    "Install the CircuitKit skill",
  ]) {
    const command = evaluate(
      `document.querySelector('section[aria-label=${JSON.stringify(label)}] code').textContent`,
    ) as string;
    click(`Copy ${label}`);
    browser("wait", "--fn", `window.__texts.at(-1)===${JSON.stringify(command)}`);
    check(
      `${label}: copies the displayed command without navigation or downloads`,
      evaluate("location.href") === installLocation && evaluate("window.__downloads.length===0"),
    );
    if (label === "Install the CircuitKit skill")
      check(
        "skill install is project-scoped and only copied",
        command === "bunx skills add crafter-lab/circuitkit --skill circuitkit",
      );
  }
  evaluate(
    "navigator.clipboard.writeText=async()=>{throw new DOMException('QA denied','NotAllowedError')}",
  );
  click("Copy Install the CircuitKit skill");
  browser(
    "wait",
    "--fn",
    "document.querySelector('#install-skill .landing-copy-status').textContent.includes('Could not copy')",
  );
  check(
    "install clipboard denial leaves manual command available",
    evaluate(
      "document.querySelector('#install-skill code').checkVisibility() && document.querySelector('#install-skill .landing-copy-status').textContent.includes('manually')",
    ),
  );
  evaluate("navigator.clipboard.writeText=window.__copyText");
  check(
    "landing exposes new product surfaces",
    evaluate(
      "['SVG + PNG exports','Editable share links','Safe Markdown blocks','Annotations, legend, and caption','manual guided teaching steps','agent skill'].every(text=>document.body.textContent.includes(text))",
    ),
  );
  click("Interactive");
  compactNotes("landing-interactive-default");
  click("B: output");
  browser("hover", '.landing-preview button[aria-label="A: input"]');
  const landingLink = evaluate(
    "document.querySelector('.landing-preview-edit').getAttribute('href')",
  ) as string;
  const landingDocument = decodeShareDocument(new URL(landingLink, base).hash);
  check(
    "interactive editor link uses saved selection, not hover",
    landingDocument.ok &&
      landingDocument.view === "annotated" &&
      landingDocument.document.presentation.highlight?.nets.join() === "output",
  );
  for (const mode of ["Interactive", "Schematic"]) {
    if (mode === "Schematic") {
      click("Interactive");
      click("B: output");
      click("Schematic");
    }
    const view = mode === "Schematic" ? "schematic" : "annotated";
    const href = evaluate(
      "document.querySelector('.landing-preview-edit').getAttribute('href')",
    ) as string;
    const shared = decodeShareDocument(new URL(href, base).hash);
    check(
      `${mode}: external editor link retains selection and view`,
      shared.ok &&
        shared.view === view &&
        shared.document.presentation.highlight?.nets.join() === "output" &&
        evaluate(
          "!document.querySelector('.landing-preview-footer') && !document.querySelector('.landing-schematic .landing-preview-edit, .circuit-lesson-figure .landing-preview-edit')",
        ),
    );
    assert(shared.ok);
    if (mode === "Schematic")
      svgParity(
        "landing-selected",
        ".landing-schematic",
        rendered(shared.document, "schematic"),
        true,
      );
    evaluate("window.__landingHeader=document.querySelector('.site-header'); true");
    browser("find", "role", "link", "click", "--name", "Edit this figure", "--exact");
    ready();
    check(
      `${mode}: landing link round-trip preserves shell, view, theme and selected document`,
      evaluate("window.__landingHeader===document.querySelector('.site-header')") &&
        currentView() === view &&
        JSON.stringify(JSON.parse(source())) === JSON.stringify(shared.document),
    );
    browser("click", ".wordmark");
    browser("wait", '.landing-preview[data-theme-ready="true"]');
  }
  click("Interactive");
  click("B: output");
  for (const width of [1280, 390, 320]) {
    browser("set", "viewport", String(width), "900");
    for (const dark of [false, true]) {
      if (evaluate("document.documentElement.classList.contains('dark')") !== dark)
        click("Dark theme");
      for (const mode of ["Schematic", "Interactive"]) {
        click(mode);
        const name = `landing-${width}-${dark ? "dark" : "light"}-${mode.toLowerCase()}`;
        check(
          `${name}: root contained`,
          evaluate("document.documentElement.scrollWidth<=innerWidth"),
        );
        const themedLink = evaluate(
          "document.querySelector('.landing-preview-edit').getAttribute('href')",
        ) as string;
        const themedDocument = decodeShareDocument(new URL(themedLink, base).hash);
        check(
          `${name}: saved focus, view and resolved theme persist`,
          themedDocument.ok &&
            themedDocument.view === (mode === "Schematic" ? "schematic" : "annotated") &&
            themedDocument.document.presentation.highlight?.nets.join() === "output" &&
            themedDocument.document.presentation.theme.preset ===
              `geist-${dark ? "dark" : "light"}`,
        );
        assert(themedDocument.ok);
        measure(name, ".landing-preview");
        if (mode === "Schematic") {
          pureView(name, ".landing-schematic");
          svgParity(
            name,
            ".landing-schematic",
            rendered(themedDocument.document, "schematic"),
            true,
          );
        } else compactNotes(name);
        audit(name);
        if (width === 1280 || width === 320) capture(name);
      }
    }
  }
  browser("set", "viewport", "1280", "900");
  browser("screenshot", "--full", `${output}/landing-full.png`);
  browser("open", `${base}/editor`);
  ready();
  browser("snapshot", "-i");
  check(
    "minimal editor defaults to Circuit only",
    evaluate(
      "document.querySelector('input[name=inspector-panel]:checked').value==='Circuit' && document.querySelector('#inspector-source').hidden",
    ),
  );
  check(
    "editor defaults to schematic with exactly three labelled views",
    currentView() === "schematic" &&
      evaluate(
        "JSON.stringify([...document.querySelector('.editor-view-field select').options].map(o=>o.value))===JSON.stringify(['schematic','annotated','figure']) && document.querySelector('.editor-view-field').textContent.includes('Figure view')",
      ),
  );
  const defaultSchematic = rendered(JSON.parse(source()), "schematic");
  svgParity("editor-default", ".figure-output", defaultSchematic);
  pureView("editor-default", ".figure-output");
  const defaultStage = measure("editor-default-stage", ".figure-stage");
  check(
    "default editor canvas has no fixed minimum height",
    ["auto", "0px"].includes(defaultStage.minHeight) &&
      Math.abs(defaultStage.height - defaultStage.svgHeight - defaultStage.verticalChrome) <= 2,
  );
  instrumentExports();
  click("Download PNG");
  browser("wait", "--fn", "Boolean(window.__downloads[0]?.base64)");
  verifyPNG("default-schematic-download", evaluate("window.__downloads[0]"), defaultSchematic, 1);
  panel("Source");
  const draft = `${source()} `;
  fill("Figure document JSON", draft);
  check(
    "draft pauses output",
    evaluate(
      "!document.querySelector('.figure-output svg') && [...document.querySelectorAll('.export-bar button')].every(b=>b.disabled)",
    ),
  );
  evaluate("document.querySelector('.skip-link').click()");
  browser("wait", "--fn", "location.hash==='#main'");
  browser("back");
  browser("wait", "--fn", "location.hash===''");
  check("skip and Back preserve unapplied draft", source() === draft);
  panel("Style");
  panel("Source");
  check("switching inspector panels preserves pending source", source() === draft);
  for (const view of views) {
    browser("select", viewSelector, view);
    check(
      `pending draft survives ${view} view without enabling output`,
      currentView() === view &&
        source() === draft &&
        evaluate(
          "!document.querySelector('.figure-output svg') && [...document.querySelectorAll('.export-bar button')].every(b=>b.disabled)",
        ),
    );
  }
  browser("focus", "#json-source");
  browser("press", "Control+Enter");
  ready();
  check(
    "Ctrl Enter applies only the current source",
    evaluate("document.querySelector('.status').textContent==='Ready to export'"),
  );
  panel("Circuit");
  fill("R1 · resistance Ω", "e");
  panel("Style");
  panel("Circuit");
  check(
    "invalid numeric draft survives panel changes",
    evaluate(
      "[...document.querySelectorAll('#inspector-circuit input')].some(e=>e.value==='e' && e.getAttribute('aria-invalid')==='true')",
    ),
  );
  fill("R1 · resistance Ω", "10000");
  ready();
  selectView("figure");
  fill("Figure title", "CircuitKit authoring proof");
  panel("Explain");
  click("Annotate output");
  browser("click", '[aria-labelledby="annotations-heading"] summary');
  fill("output label", "OUT");
  fill("output description", "Salida del filtro RC.");
  fill("Figure caption", "Una figura para Gradual.");
  click("Add step");
  fill("Step 1 title", "Observar salida");
  fill("Step 1 description", "El nodo de salida conecta R1 y C1.");
  evaluate(
    "[...document.querySelectorAll('[aria-labelledby=steps-heading] fieldset')].find(f=>f.querySelector('legend')?.textContent.trim()==='Step 1 nets').querySelectorAll('button').forEach(b=>{if(b.textContent.trim()==='output' && b.getAttribute('aria-pressed')!=='true')b.click()})",
  );
  ready();
  const document = JSON.parse(source());
  check(
    "annotation and active step authored",
    document.presentation.annotations.nets[0].label === "OUT" &&
      document.presentation.activeStep === "step-1",
  );
  const full = rendered(document, "figure");
  const immutableSource = source();
  const immutableGraph = JSON.stringify(document.circuit);
  const viewLinks = new Map<ShareView, string>();
  const viewGeometry = new Map<ShareView, ReturnType<typeof measure>>();
  for (const view of views) {
    selectView(view);
    check(
      `${view}: toggling view preserves exact source and electrical graph`,
      source() === immutableSource &&
        JSON.stringify(JSON.parse(source()).circuit) === immutableGraph,
    );
    const expected = rendered(document, view);
    svgParity(`editor-${view}`, ".figure-output", expected);
    viewGeometry.set(view, measure(`editor-${view}`, ".figure-output"));
    if (view === "schematic") pureView("editor-authored-schematic", ".figure-output");
    if (view === "annotated")
      check(
        "annotated view paints net labels without lesson title",
        evaluate(
          "Boolean(document.querySelector('.figure-output [data-net-label=output] path')) && !document.querySelector('.figure-output [data-label=title]')",
        ),
      );
    click("Copy link");
    const sharedLink = evaluate("window.__texts.at(-1)") as string;
    const shared = decodeShareDocument(new URL(sharedLink).hash);
    check(
      `${view}: Copy link encodes current view without mutating the document`,
      shared.ok &&
        shared.view === view &&
        JSON.stringify(shared.document) === JSON.stringify(expected.document),
    );
    viewLinks.set(view, sharedLink);
    const downloadCount = evaluate("window.__downloads.length") as number;
    exportsOpen();
    click("Download SVG");
    browser("wait", "--fn", `Boolean(window.__downloads[${downloadCount}]?.base64)`);
    const svgDownload = evaluate(`window.__downloads[${downloadCount}]`);
    check(
      `${view}: downloaded SVG matches the canonical preview`,
      svgDownload.name.endsWith(".svg") &&
        svgDownload.type.startsWith("image/svg+xml") &&
        Buffer.from(svgDownload.base64, "base64").toString("utf8") === expected.svg,
    );
    const imageCount = evaluate("window.__images.length") as number;
    exportsOpen();
    browser("select", 'select[aria-describedby="png-hint"]', "2");
    click("Copy PNG");
    browser("wait", "--fn", `window.__images.length===${imageCount + 1}`);
    verifyPNG(`browser-${view}`, evaluate(`window.__images[${imageCount}]`), expected, 2);
    writeFileSync(`${output}/${view}.svg`, expected.svg);
  }
  const pureGeometry = viewGeometry.get("schematic");
  const fullGeometry = viewGeometry.get("figure");
  check(
    "pure view is shorter and paints fewer elements than the full lesson",
    pureGeometry.height < fullGeometry.height &&
      pureGeometry.paintedElements > 0 &&
      pureGeometry.paintedElements < fullGeometry.paintedElements,
  );
  selectView("schematic");
  selectView("annotated");
  selectView("figure");
  check(
    "three-view return cycle leaves authored source and graph unchanged",
    source() === immutableSource && JSON.stringify(JSON.parse(source()).circuit) === immutableGraph,
  );
  svgParity("editor-returned-figure", ".figure-output", full);
  click("Copy link");
  const link = evaluate("window.__texts.at(-1)") as string;
  const decoded = decodeShareDocument(new URL(link).hash);
  check(
    "copy link contains selected canonical document",
    decoded.ok &&
      decoded.document.presentation.activeStep === "step-1" &&
      decoded.document.presentation.annotations?.caption === "Una figura para Gradual.",
  );
  exportsOpen();
  click("Copy Markdown");
  check(
    "secondary export closes and returns keyboard focus",
    evaluate(
      "!document.querySelector('.export-disclosure').open && document.activeElement===document.querySelector('.export-disclosure > summary')",
    ),
  );
  const markdown = evaluate("window.__texts.at(-1)") as string;
  check(
    "copy Markdown is a data fence",
    markdown.includes("```circuitkit") && markdown.includes('"activeStep": "step-1"'),
  );
  for (const reason of ["view", "draft", "scale"] as const) {
    const before = evaluate(
      "({images:window.__images.length,downloads:window.__downloads.length})",
    );
    evaluate(`window.__toBlob=HTMLCanvasElement.prototype.toBlob; window.__releasePNG=null;
      HTMLCanvasElement.prototype.toBlob=function(callback,...args){window.__toBlob.call(this,blob=>{window.__releasePNG=()=>callback(blob)},...args)};`);
    if (reason !== "draft") exportsOpen();
    click(reason === "draft" ? "Download PNG" : "Copy PNG");
    browser("wait", "--fn", "typeof window.__releasePNG==='function'");
    check(
      `${reason}: export is genuinely pending before cancellation`,
      evaluate("document.querySelector('.export-bar button[aria-busy=true]')!==null"),
    );
    if (reason === "view") selectView("schematic");
    else if (reason === "draft") {
      panel("Source");
      fill("Figure document JSON", `${source()} `);
    } else {
      exportsOpen();
      browser("select", 'select[aria-describedby="png-hint"]', "3");
    }
    evaluate(
      `(async()=>{HTMLCanvasElement.prototype.toBlob=window.__toBlob; window.__releasePNG(); await new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)));})()`,
    );
    check(
      `${reason}: cancelled export delivers neither stale clipboard bytes nor a download`,
      evaluate(
        `window.__images.length===${before.images} && window.__downloads.length===${before.downloads} && !document.querySelector('.export-bar button[aria-busy=true]') && !document.querySelector('.feedback').textContent.trim()`,
      ),
    );
    if (reason === "draft") {
      click("Apply JSON");
      ready();
    }
    selectView("figure");
    exportsOpen();
    browser("select", 'select[aria-describedby="png-hint"]', "2");
    browser("press", "Escape");
  }
  check(
    "export cancellation leaves the canonical document intact",
    JSON.stringify(JSON.parse(source())) === JSON.stringify(document),
  );
  writeFileSync(`${output}/figure.json`, `${JSON.stringify(document, null, 2)}\n`);
  writeFileSync(`${output}/figure.md`, markdown);
  writeFileSync(`${output}/figure.svg`, full.svg);
  const beforeLateDenial = evaluate("window.__downloads.length") as number;
  evaluate(
    "window.__rejectClipboard=null; navigator.clipboard.write=()=>new Promise((resolve,reject)=>{window.__rejectClipboard=reject})",
  );
  exportsOpen();
  click("Copy PNG");
  browser("wait", "--fn", "typeof window.__rejectClipboard==='function'");
  selectView("schematic");
  evaluate(
    "(async()=>{window.__rejectClipboard(new DOMException('QA denied','NotAllowedError')); await new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)));})()",
  );
  check(
    "late clipboard denial after view change cannot download a stale figure",
    evaluate(
      `window.__downloads.length===${beforeLateDenial} && !document.querySelector('.feedback').textContent.trim() && !document.querySelector('.export-bar button[aria-busy=true]')`,
    ),
  );
  selectView("figure");
  evaluate(
    "navigator.clipboard.write=async()=>{throw new DOMException('QA denied','NotAllowedError')}",
  );
  const fallbackIndex = evaluate("window.__downloads.length") as number;
  exportsOpen();
  click("Copy PNG");
  browser("wait", "--fn", `Boolean(window.__downloads[${fallbackIndex}]?.base64)`);
  check(
    "clipboard denial requests download fallback",
    evaluate(
      `window.__downloads[${fallbackIndex}].name.endsWith('.png') && document.querySelector('.feedback').textContent.includes('download requested')`,
    ),
  );
  verifyPNG("clipboard-fallback-figure", evaluate(`window.__downloads[${fallbackIndex}]`), full, 2);
  evaluate(
    "navigator.clipboard.writeText=async()=>{throw new DOMException('QA denied','NotAllowedError')}",
  );
  click("Copy link");
  browser(
    "wait",
    "--fn",
    "document.querySelector('.feedback').textContent.includes('copied manually from Source')",
  );
  check(
    "text clipboard denial preserves manual source and valid preview",
    JSON.stringify(JSON.parse(source())) === JSON.stringify(document) &&
      evaluate("Boolean(document.querySelector('.figure-output svg'))"),
  );
  evaluate("navigator.clipboard.writeText=window.__copyText");
  exportsOpen();
  browser("focus", ".figure-stage");
  check(
    "export disclosure closes before focus reaches inspector",
    evaluate("!document.querySelector('.export-disclosure').open"),
  );
  exportsOpen();
  browser("press", "Escape");
  check(
    "Escape closes exports and restores summary focus",
    evaluate(
      "!document.querySelector('.export-disclosure').open && document.activeElement===document.querySelector('.export-disclosure > summary')",
    ),
  );
  panel("Circuit");
  capture("editor-desktop");
  audit("editor-desktop");
  for (const name of ["Style", "Explain", "Source"] as const) {
    panel(name);
    audit(`editor-panel-${name.toLowerCase()}`);
  }
  for (const view of views) {
    const sharedLink = viewLinks.get(view);
    assert(sharedLink);
    openShare(sharedLink);
    check(
      `${view}: share reload round-trips view, graph, theme, selection and notes`,
      currentView() === view &&
        JSON.stringify(JSON.parse(source())) === JSON.stringify(full.document),
    );
    svgParity(`shared-${view}`, ".figure-output", rendered(document, view));
  }
  const legacy = new URL(link);
  const legacyParameters = new URLSearchParams(legacy.hash.slice(1));
  legacyParameters.delete("view");
  legacy.hash = legacyParameters.toString();
  const legacyDecoded = decodeShareDocument(legacy.hash);
  check(
    "share view parameter remains optional",
    legacyDecoded.ok && legacyDecoded.view === undefined,
  );
  openShare(legacy.href);
  check(
    "legacy share without view opens pure schematic",
    currentView() === "schematic" &&
      JSON.stringify(JSON.parse(source())) === JSON.stringify(full.document),
  );
  openShare(link);
  check(
    "shared link reload preserves full view, step and authored theme",
    currentView() === "figure" &&
      JSON.parse(source()).presentation.activeStep === "step-1" &&
      JSON.parse(source()).presentation.theme.preset === document.presentation.theme.preset,
  );
  panel("Source");
  const sharedDraft = `${source()} `;
  fill("Figure document JSON", sharedDraft);
  evaluate("document.querySelector('.skip-link').click()");
  browser("wait", "--fn", "location.hash==='#main'");
  browser("back");
  browser("wait", "--fn", "location.hash.startsWith('#v=1&doc=')");
  check("shared skip and Back preserve pending changes", source() === sharedDraft);
  click("Apply JSON");
  ready();
  panel("Circuit");
  for (const width of [390, 320]) {
    browser("set", "viewport", String(width), "844");
    for (const dark of [false, true]) {
      if (evaluate("document.documentElement.classList.contains('dark')") !== dark)
        click("Dark theme");
      for (const view of views) {
        selectView(view);
        const name = `editor-${width}-${dark ? "dark" : "light"}-${view}`;
        check(
          `${name}: root contained`,
          evaluate("document.documentElement.scrollWidth<=innerWidth"),
        );
        check(
          `${name}: site theme and view leave authored document unchanged`,
          JSON.stringify(JSON.parse(source())) === JSON.stringify(full.document),
        );
        svgParity(name, ".figure-output", rendered(document, view));
        if (view === "schematic") pureView(name, ".figure-output");
        const stage = measure(`${name}-stage`, ".figure-stage");
        check(
          `${name}: stage has no fixed minimum height`,
          ["auto", "0px"].includes(stage.minHeight) &&
            Math.abs(stage.height - stage.svgHeight - stage.verticalChrome) <= 2,
        );
        for (const inspector of ["Circuit", "Style", "Explain", "Source"] as const) {
          panel(inspector);
          check(
            `${name}/${inspector}: root contained`,
            evaluate("document.documentElement.scrollWidth<=innerWidth"),
          );
        }
        panel("Explain");
        evaluate(
          "document.querySelectorAll('#inspector-explain details').forEach(d=>{d.open=true})",
        );
        exportsOpen();
        const menu = measure(`${name}-open-exports`, ".export-options");
        check(
          `${name}: open exports and inspector disclosures stay inside viewport`,
          menu.width > 0 && menu.left >= 0 && menu.right <= width && menu.rootWidth <= width,
        );
        audit(`${name}-menus-open`);
        capture(name);
        browser("press", "Escape");
        evaluate(
          "document.querySelectorAll('#inspector-explain details').forEach(d=>{d.open=false})",
        );
        panel("Circuit");
      }
    }
  }
  capture("editor-mobile");
  browser("set", "viewport", "1280", "900");
  browser("open", `${base}/editor#v=9&doc=e30`);
  browser(
    "wait",
    "--fn",
    "document.querySelector('#diagnostics')?.textContent.includes('share.unsupported_version')",
  );
  check(
    "invalid share has no fallback or export",
    evaluate(
      "!document.querySelector('.figure-output svg') && [...document.querySelectorAll('.export-bar button')].every(b=>b.disabled)",
    ),
  );
  browser("open", `${base}/markdown`);
  browser("wait", "#markdown-source");
  fill(
    "CircuitKit Markdown source",
    `<script>window.__unsafeMarkdown=true</script>\n\n${markdown}\n\n${markdown}`,
  );
  click("Validate Markdown");
  browser("wait", "--fn", "document.querySelectorAll('.figure-output svg').length===2");
  check(
    "Markdown renders every valid block without HTML execution",
    evaluate(
      "window.__unsafeMarkdown===undefined && document.querySelectorAll('a[href^=\"/editor#\"]').length===2",
    ),
  );
  audit("markdown");
  capture("markdown");
  evaluate("window.__sharedHeader=document.querySelector('.site-header'); true");
  browser("find", "role", "link", "click", "--name", "Open figure 1 in editor", "--exact");
  ready();
  check(
    "Markdown-to-editor preserves shared shell and selected document",
    evaluate("window.__sharedHeader===document.querySelector('.site-header')") &&
      JSON.parse(source()).presentation.activeStep === "step-1",
  );
  panel("Source");
  browser("select", ".source-section select", "markdown");
  fill("CircuitKit Markdown source", `${markdown}\n\n${markdown}`);
  click("Validate Markdown");
  browser("wait", "--text", "Choose a Markdown figure to import");
  check(
    "multiple Markdown inputs require explicit selection",
    evaluate("!document.querySelector('.figure-output svg')"),
  );
  evaluate(
    "[...document.querySelectorAll('button')].find(b=>b.textContent.trim().startsWith('Block 2, line')).click()",
  );
  ready();
  check(
    "selected Markdown block becomes editable JSON",
    JSON.parse(source()).presentation.activeStep === "step-1",
  );
  browser("open", `${base}/markdown`);
  browser("wait", "#markdown-source");
  fill("CircuitKit Markdown source", `${markdown}\n\n\`\`\`circuitkit\n{invalid}\n\`\`\``);
  click("Validate Markdown");
  browser(
    "wait",
    "--fn",
    "document.querySelector('#markdown-diagnostics')?.textContent.includes('markdown.invalid_json')",
  );
  check(
    "one invalid Markdown block suppresses all output with locations",
    evaluate(
      "!document.querySelector('.figure-output svg') && document.querySelector('#markdown-diagnostics').textContent.includes('line')",
    ),
  );
  check("no client runtime errors", (browser("errors").errors ?? []).length === 0);
} catch (caught) {
  error = String(caught);
  console.error(error);
  try {
    capture("failure");
  } catch {}
  process.exitCode = 1;
} finally {
  try {
    browser("close");
    closed = true;
  } catch (caught) {
    error ??= String(caught);
    process.exitCode = 1;
  }
  writeFileSync(
    `${output}/report.json`,
    `${JSON.stringify({ base, session, closed, error, checks, audits, geometry, limits: ["Headless Chromium only", "Clipboard bytes and denied-permission fallback are instrumented, not OS clipboard certification", "Downloads are intercepted to avoid writing to the user's Downloads folder", "PNG pixel parity uses Chromium rasterization of canonical core SVG, not cross-browser rendering certification", "Install commands are copied only, never executed", "No live deployment or Gradual integration"] }, null, 2)}\n`,
  );
}
