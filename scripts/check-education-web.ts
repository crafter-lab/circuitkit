import { spawnSync } from "node:child_process";
import { appendFileSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { z } from "zod";
import {
  adapterFamilies,
  examples,
  families,
  parseSelection,
  stages,
  themes,
} from "../app/education/catalog.ts";
import { authorExample, publicAdapterExamples, publicExample } from "../app/education/examples.ts";
import { publicExport } from "../app/education/public-state.ts";
import { localComparisonURL } from "../app/gallery/education/local/page.tsx";
import { projectFigure } from "../src/v2/index.ts";
import { validateEducational } from "../src/v2/render.ts";
import type { PublicFigure } from "../src/v2/schema.ts";

const base = process.argv[2] ?? "http://127.0.0.1:3228";
const visualOnly = process.argv.includes("--visual-reopen-only");
if (new URL(base).hostname !== "127.0.0.1") throw new Error("Loopback target required");
const runId = new Date().toISOString().replaceAll(/[:.]/g, "-");
const output = resolve("artifacts/education-web-qa", runId);
mkdirSync(output, { recursive: true });
const session = `education-web-${process.pid}-${runId}`;
const checks: { name: string; ok: boolean; evidence?: unknown }[] = [];
const failures: { name: string; error: string }[] = [];
const audits: unknown[] = [];
const runtime: unknown[] = [];
const commands = `${output}/commands.jsonl`;
function save(name: string, value: unknown) {
  writeFileSync(`${output}/${name}.json`, JSON.stringify(value, null, 2));
}
function browser(args: string[], input?: string): Record<string, unknown> {
  const argv = ["--session", session, "--json", ...args];
  const result = spawnSync("agent-browser", argv, {
    input,
    encoding: "utf8",
    maxBuffer: 64 * 1024 * 1024,
  });
  appendFileSync(
    commands,
    `${JSON.stringify({ command: ["agent-browser", ...argv], stdin: input, status: result.status, signal: result.signal, error: result.error?.message, stdout: result.stdout, stderr: result.stderr })}\n`,
  );
  if (result.status !== 0) throw new Error(`${args.join(" ")}: ${result.stderr} ${result.stdout}`);
  const envelope = z
    .object({ success: z.boolean(), data: z.unknown(), error: z.unknown().optional() })
    .parse(JSON.parse(result.stdout));
  if (!envelope.success) throw new Error(JSON.stringify(envelope));
  return z.record(z.string(), z.unknown()).parse(envelope.data);
}
function evaluate<T>(source: string, schema: z.ZodType<T>): T;
function evaluate(source: string): unknown;
function evaluate(source: string, schema?: z.ZodType): unknown {
  const result = browser(["eval", "--stdin"], source).result;
  return schema ? schema.parse(result) : result;
}
const refsSchema = z.record(
  z.string(),
  z.object({ role: z.string(), name: z.string().optional().default("") }),
);
const pixelSchema = z.object({
  width: z.number(),
  height: z.number(),
  colors: z.number(),
  base64: z.string(),
  scale: z.number(),
  sampleX: z.number(),
  sampleY: z.number(),
});
function check(name: string, ok: unknown, evidence?: unknown) {
  checks.push({ name, ok: Boolean(ok), evidence });
  save("checks", checks);
  console.log(`${ok ? "PASS" : "FAIL"} ${name}`);
}
function capture(name: string) {
  browser(["screenshot", `${output}/${name}.png`]);
  save(`${name}-snapshot`, browser(["snapshot", "-i"]));
}
function chromeBlankReference(
  selector: string,
  name: string,
  canonical: string,
  actualBase64: string,
  viewportWidth: number,
  viewportHeight: number,
  sampleX: number,
  sampleY: number,
) {
  const geometry = evaluate(
    `(() => {const e=document.querySelector(${JSON.stringify(selector)}),r=e.getBoundingClientRect(),s=e.querySelector('svg').getBoundingClientRect();let n=e,bg='rgb(255,255,255)';while(n){const c=getComputedStyle(n).backgroundColor;if(c!=='rgba(0, 0, 0, 0)'&&c!=='transparent'){bg=c;break}n=n.parentElement}return {x:r.left,y:r.top,width:r.width,height:r.height,svgX:s.left-r.left,svgY:s.top-r.top,svgWidth:s.width,svgHeight:s.height,bg};})()`,
    z.object({
      x: z.number(),
      y: z.number(),
      width: z.number(),
      height: z.number(),
      svgX: z.number(),
      svgY: z.number(),
      svgWidth: z.number(),
      svgHeight: z.number(),
      bg: z.string(),
    }),
  );
  const tabs = z
    .array(z.object({ tabId: z.string(), active: z.boolean() }))
    .parse(browser(["tab", "list"]).tabs);
  const original = tabs.find((t) => t.active)?.tabId;
  if (!original) throw Error("Missing original app tab");
  const reference = z.string().parse(browser(["tab", "new", "about:blank"]).tabId);
  try {
    browser(["set", "viewport", String(viewportWidth), String(viewportHeight)]);
    evaluate(
      `(async()=>{const g=${JSON.stringify(geometry)},source=${JSON.stringify(canonical)},uri='data:image/svg+xml,'+encodeURIComponent(source),parsed=new DOMParser().parseFromString(source,'image/svg+xml').documentElement,parts=parsed.getAttribute('viewBox').split(/\\s+/).map(Number);if(parts.length!==4||parts.some(n=>!Number.isFinite(n)))throw Error('Invalid canonical reference viewBox');document.title='QA independent canonical viewport reference';document.documentElement.style.background=g.bg;document.body.style.cssText='margin:0;background:'+g.bg;const region=document.createElement('div');Object.assign(region.style,{position:'absolute',left:g.x+'px',top:g.y+'px',width:g.width+'px',height:g.height+'px',overflow:'auto',scrollbarGutter:'stable',scrollbarWidth:'none',overscrollBehavior:'contain'});const svg=document.createElementNS('http://www.w3.org/2000/svg','svg');svg.setAttribute('viewBox',parsed.getAttribute('viewBox'));svg.setAttribute('width',String(parts[2]));svg.setAttribute('height',String(parts[3]));Object.assign(svg.style,{display:'block',width:g.svgWidth+'px',height:'auto',maxWidth:'none'});const image=document.createElementNS('http://www.w3.org/2000/svg','image');for(const [key,value] of Object.entries({x:parts[0],y:parts[1],width:parts[2],height:parts[3],href:uri}))image.setAttribute(key,String(value));svg.append(image);region.append(svg);document.body.append(region);region.scrollLeft=-g.svgX;region.scrollTop=-g.svgY;const loaded=new Image();loaded.src=uri;await loaded.decode();await new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)));return true;})()`,
    );
    const raw = `${name}-reference-viewport.png`;
    browser(["screenshot", `${output}/${raw}`]);
    const referenceBase64 = readFileSync(`${output}/${raw}`).toString("base64");
    const proof = evaluate(
      `(async()=>{const load=async b=>{const i=new Image();i.src='data:image/png;base64,'+b;await i.decode();return i},ref=await load(${JSON.stringify(referenceBase64)}),actual=await load(${JSON.stringify(actualBase64)}),g=${JSON.stringify(geometry)},scale=ref.naturalWidth/${viewportWidth},c=document.createElement('canvas');c.width=actual.naturalWidth;c.height=actual.naturalHeight;const ctx=c.getContext('2d');ctx.drawImage(ref,${sampleX},${sampleY},c.width,c.height,0,0,c.width,c.height);const a=ctx.getImageData(0,0,c.width,c.height).data;ctx.clearRect(0,0,c.width,c.height);ctx.drawImage(actual,0,0);const b=ctx.getImageData(0,0,c.width,c.height).data,colors=new Set();let different=0;for(let i=0;i<a.length;i+=4){if(colors.size<=3)colors.add(a.slice(i,i+4).join(','));if(a[i]!==b[i]||a[i+1]!==b[i+1]||a[i+2]!==b[i+2]||a[i+3]!==b[i+3])different++}return {expectedColors:colors.size,different};})()`,
      z.object({ expectedColors: z.number(), different: z.number() }),
    );
    save(`${name}-reference-proof`, {
      method: "independent Chrome canonical SVG clipped viewport",
      geometry,
      reference: raw,
      proof,
    });
    return proof;
  } finally {
    browser(["tab", "close", reference]);
    browser(["tab", original]);
  }
}
function captureElement(selector: string, name: string, canonicalPanSVG?: string) {
  const viewport = evaluate(
    `({width:innerWidth,height:innerHeight,elementHeight:document.querySelector(${JSON.stringify(selector)}).getBoundingClientRect().height})`,
    z.object({ width: z.number(), height: z.number(), elementHeight: z.number() }),
  );
  const captureHeight = Math.max(viewport.height, Math.ceil(viewport.elementHeight) + 64);
  if (captureHeight !== viewport.height)
    browser(["set", "viewport", String(viewport.width), String(captureHeight)]);
  browser(["scrollintoview", selector]);
  browser([
    "wait",
    "--fn",
    `(() => {const r=document.querySelector(${JSON.stringify(selector)}).getBoundingClientRect();return r.top>=-1&&r.bottom<=innerHeight+1&&r.width>0&&r.height>0;})()`,
  ]);
  const box = evaluate(
    `(() => {const r=document.querySelector(${JSON.stringify(selector)}).getBoundingClientRect();return {x:Math.max(0,r.left),y:Math.max(0,r.top),width:Math.min(innerWidth,r.right)-Math.max(0,r.left),height:Math.min(innerHeight,r.bottom)-Math.max(0,r.top),viewportWidth:innerWidth,elementHeight:r.height};})()`,
    z.object({
      x: z.number(),
      y: z.number(),
      width: z.number(),
      height: z.number(),
      viewportWidth: z.number(),
      elementHeight: z.number(),
    }),
  );
  browser(["screenshot", `${output}/${name}-viewport.png`]);
  const bytes = readFileSync(`${output}/${name}-viewport.png`).toString("base64");
  const image = evaluate(
    `(async()=>{const image=new Image();image.src=${JSON.stringify(`data:image/png;base64,${bytes}`)};await image.decode();const box=${JSON.stringify(box)},scale=image.naturalWidth/box.viewportWidth,canvas=document.createElement('canvas'),pan=${Boolean(canonicalPanSVG)},sampleX=pan?Math.ceil(box.x*scale):Math.round(box.x*scale),sampleY=pan?Math.ceil(box.y*scale):Math.round(box.y*scale);canvas.width=pan?Math.floor((box.x+box.width)*scale)-sampleX:Math.round(box.width*scale);canvas.height=pan?Math.floor((box.y+box.height)*scale)-sampleY:Math.round(box.height*scale);const context=canvas.getContext('2d');context.drawImage(image,sampleX,sampleY,canvas.width,canvas.height,0,0,canvas.width,canvas.height);const data=context.getImageData(0,0,canvas.width,canvas.height).data,colors=new Set();for(let i=0;i<data.length;i+=4){colors.add(data.slice(i,i+4).join(','));if(colors.size>16)break}return {base64:canvas.toDataURL('image/png').split(',')[1],colors:colors.size,width:canvas.width,height:canvas.height,scale,sampleX,sampleY};})()`,
    pixelSchema,
  );
  writeFileSync(`${output}/${name}.png`, Buffer.from(image.base64, "base64"));
  const { base64: _base64, ...pixels } = image;
  let blankProof: { expectedColors: number; different: number } | null = null;
  if (pixels.colors <= 3 && canonicalPanSVG) {
    blankProof = evaluate(
      `(async()=>{const region=document.querySelector(${JSON.stringify(selector)}),r=region.getBoundingClientRect(),svg=region.querySelector('svg').getBoundingClientRect();const load=async url=>{const i=new Image();i.src=url;await i.decode();return i};const actual=await load(${JSON.stringify(`data:image/png;base64,${image.base64}`)}),expected=await load(${JSON.stringify(`data:image/svg+xml,${encodeURIComponent(canonicalPanSVG)}`)}),scale=${image.scale},c=document.createElement('canvas');c.width=actual.naturalWidth;c.height=actual.naturalHeight;const ctx=c.getContext('2d');let node=region,bg='rgb(255, 255, 255)';while(node){const color=getComputedStyle(node).backgroundColor;if(color!=='rgba(0, 0, 0, 0)'&&color!=='transparent'){bg=color;break}node=node.parentElement}ctx.fillStyle=bg;ctx.fillRect(0,0,c.width,c.height);const originX=${image.sampleX},originY=${image.sampleY};ctx.save();ctx.beginPath();ctx.rect(r.left*scale-originX,r.top*scale-originY,r.width*scale,r.height*scale);ctx.clip();ctx.drawImage(expected,svg.left*scale-originX,svg.top*scale-originY,svg.width*scale,svg.height*scale);ctx.restore();const a=ctx.getImageData(0,0,c.width,c.height).data;ctx.clearRect(0,0,c.width,c.height);ctx.drawImage(actual,0,0);const b=ctx.getImageData(0,0,c.width,c.height).data,colors=new Set();let different=0;for(let i=0;i<a.length;i+=4){if(colors.size<=3)colors.add(a.slice(i,i+4).join(','));if(a[i]!==b[i]||a[i+1]!==b[i+1]||a[i+2]!==b[i+2]||a[i+3]!==b[i+3])different++}return {expectedColors:colors.size,different};})()`,
      z.object({ expectedColors: z.number(), different: z.number() }),
    );
  }
  const canvasProof = blankProof;
  if (blankProof && blankProof.different !== 0 && canonicalPanSVG)
    blankProof = chromeBlankReference(
      selector,
      name,
      canonicalPanSVG,
      image.base64,
      viewport.width,
      captureHeight,
      image.sampleX,
      image.sampleY,
    );
  save(`${name}-capture`, {
    sampling: canonicalPanSVG
      ? "maximal fully-contained device-pixel viewport window; fractional fringes retained in raw image"
      : "rounded complete card bounds",
    blankProof,
    canvasProof,
    selector,
    box,
    viewport,
    captureHeight,
    ...pixels,
    raw: `${name}-viewport.png`,
  });
  check(
    `${name}: captured pixels are nonblank or an exactly verified canonical empty pan region`,
    pixels.colors > 3 ||
      (blankProof !== null && blankProof.expectedColors <= 3 && blankProof.different === 0),
    { ...pixels, blankProof },
  );
  if (canonicalPanSVG)
    check(
      `${name}: exact fully-contained viewport pixel window captured`,
      image.sampleX === Math.ceil(box.x * image.scale) &&
        image.sampleY === Math.ceil(box.y * image.scale) &&
        image.width === Math.floor((box.x + box.width) * image.scale) - image.sampleX &&
        image.height === Math.floor((box.y + box.height) * image.scale) - image.sampleY,
      {
        box,
        scale: image.scale,
        sampleX: image.sampleX,
        sampleY: image.sampleY,
        width: image.width,
        height: image.height,
      },
    );
  else
    check(
      `${name}: complete target height captured`,
      Math.abs(box.height - box.elementHeight) < 1,
      {
        height: box.height,
        elementHeight: box.elementHeight,
      },
    );
  if (captureHeight !== viewport.height)
    browser(["set", "viewport", String(viewport.width), String(viewport.height)]);
}
function open(path: string) {
  browser(["open", `${base}${path}`]);
  browser(["wait", "--load", "networkidle"]);
  browser(["snapshot", "-i"]);
}
function ready() {
  browser([
    "wait",
    "--fn",
    "document.querySelector('.education-status')?.textContent==='Selected public projection ready.'",
  ]);
}
function click(selector: string) {
  browser(["snapshot", "-i"]);
  browser(["scrollintoview", selector]);
  browser([
    "wait",
    "--fn",
    `(() => { const e=document.querySelector(${JSON.stringify(selector)}); if(!e) return false; const r=e.getBoundingClientRect(); const x=r.left+r.width/2,y=r.top+r.height/2; return r.width>0&&r.height>0&&x>=0&&x<innerWidth&&y>=0&&y<innerHeight&&e.contains(document.elementFromPoint(x,y)); })()`,
  ]);
  browser(["click", selector]);
  browser(["snapshot", "-i"]);
}
function button(name: string) {
  const refData = browser(["snapshot", "-i"]);
  const ref = Object.entries(refsSchema.parse(refData.refs)).find(
    ([, item]) => item.role === "button" && item.name === name,
  )?.[0];
  if (!ref) throw new Error(`Missing button ref ${name}: ${JSON.stringify(refData)}`);
  browser(["scrollintoview", `@${ref}`]);
  browser([
    "wait",
    "--fn",
    `(() => {const e=[...document.querySelectorAll('button')].find(e=>(e.getAttribute('aria-label')??e.textContent.trim())===${JSON.stringify(name)});const r=e.getBoundingClientRect(),x=r.left+r.width/2,y=r.top+r.height/2;return x>=0&&x<innerWidth&&y>=0&&y<innerHeight&&e.contains(document.elementFromPoint(x,y));})()`,
  ]);
  browser(["click", `@${ref}`]);
  browser(["snapshot", "-i"]);
}
function select(label: string, value: string) {
  const snapshot = browser(["snapshot", "-i"]);
  const ref = Object.entries(refsSchema.parse(snapshot.refs)).find(
    ([, item]) => item.role === "combobox" && item.name === label,
  )?.[0];
  if (!ref) throw new Error(`Missing select ref ${label}`);
  browser(["select", `@${ref}`, value]);
  ready();
}
function source(): PublicFigure {
  const result = validateEducational(
    JSON.parse(
      z.string().parse(evaluate("document.querySelector('.education-source textarea').value")),
    ),
  );
  if (!result.ok)
    throw new Error("The public source textarea must contain a validated PublicFigure");
  return result.document;
}
function fillSource(value: string) {
  browser(["snapshot", "-i"]);
  if (value.length < 1000 && !value.includes("\n")) {
    browser(["fill", ".education-source textarea", value]);
    return;
  }
  evaluate(
    `(() => {const e=document.querySelector('.education-source textarea');Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype,'value').set.call(e,${JSON.stringify(value)});e.dispatchEvent(new Event('input',{bubbles:true}));e.dispatchEvent(new Event('change',{bubbles:true}));})()`,
  );
}
async function phase(name: string, run: () => unknown) {
  if (visualOnly && name !== "visual-reopen") return;
  console.log(`PHASE ${name}`);
  try {
    await run();
  } catch (error) {
    console.error(
      `Phase ${name} failed: ${String(error)}. Recording evidence, then continuing independent checks.`,
    );
    failures.push({ name, error: String(error) });
    save("failures", failures);
    try {
      save(
        `failure-${name}-context`,
        evaluate(
          "({url:location.href,status:document.querySelector('.education-status')?.textContent,workspace:document.querySelector('[data-workspace]')?.getAttribute('data-workspace'),regions:[...document.querySelectorAll('.education-viewport-scroll')].map(e=>({x:e.scrollLeft,y:e.scrollTop,width:e.clientWidth,height:e.clientHeight,totalWidth:e.scrollWidth,totalHeight:e.scrollHeight}))})",
        ),
      );
      save(`failure-${name}-network`, browser(["network", "requests"]));
      health(`${name}-failed`);
      capture(`failure-${name}`);
      if (evaluate("!!document.querySelector('.education-output')"))
        captureElement(".education-output", `failure-${name}-output`);
    } catch (captureError) {
      console.error(`Evidence capture failed: ${String(captureError)}`);
    }
  }
}
const projections = new Map<string, PublicFigure>();
function projection(key: string): PublicFigure {
  const document = projections.get(key);
  if (!document) throw Error(`Missing verified projection ${key}`);
  return document;
}
async function get(path: string, name: string) {
  const response = await fetch(`${base}${path}`);
  const text = await response.text();
  appendFileSync(
    commands,
    `${JSON.stringify({ command: ["HTTP", "GET", `${base}${path}`], status: response.status, headers: Object.fromEntries(response.headers), artifact: `${name}.txt` })}\n`,
  );
  writeFileSync(`${output}/${name}.txt`, text);
  return { status: response.status, headers: response.headers, text };
}
async function post(
  name: string,
  body: BodyInit,
  headers: Record<string, string> = { "content-type": "application/json" },
) {
  const response = await fetch(`${base}/api/education`, { method: "POST", headers, body });
  const text = await response.text();
  appendFileSync(
    commands,
    `${JSON.stringify({ command: ["HTTP", "POST", `${base}/api/education`], headers, body: typeof body === "string" ? body : `[${body.constructor.name}]`, status: response.status, responseHeaders: Object.fromEntries(response.headers), artifact: `${name}.txt` })}\n`,
  );
  writeFileSync(`${output}/${name}.txt`, text);
  return { status: response.status, headers: response.headers, text };
}
function compiled(
  author: unknown,
  stage: "question" | "teaching" | "correction" = "question",
): PublicFigure {
  const result = projectFigure(author, stage);
  if (!result.ok) throw Error("Generic author fixture failed selected projection");
  return result.document;
}
function previewMatches(doc: PublicFigure) {
  const svg = publicExport(doc, "svg");
  if (!svg) throw Error("Invalid expected public projection");
  const expected = `data:image/svg+xml,${encodeURIComponent(svg.text.replaceAll("CircuitFigure", "showcase"))}`;
  browser(["wait", "--fn", "!!document.querySelector('[data-public-preview] svg image')"]);
  return evaluate(
    `document.querySelector('[data-public-preview] svg image')?.getAttribute('href')===${JSON.stringify(expected)}`,
    z.boolean(),
  );
}
function publicOnly(text: string) {
  const normalized = text.replaceAll('\\"', '"');
  return !/circuitkit\.educational\.author\.v2|"(?:stages|panels|expose|namedNets|terminalPotentials|corpusManifest)"\s*:/.test(
    normalized,
  );
}
function health(name: string) {
  const errors = browser(["errors"]);
  const consoleData = browser(["console"]);
  runtime.push({ name, errors, console: consoleData });
  check(
    `${name}: runtime exceptions zero`,
    Array.isArray(errors.errors) && errors.errors.length === 0,
    errors.errors,
  );
  check(
    `${name}: console errors zero`,
    z
      .array(z.object({ type: z.string().optional(), level: z.string().optional() }).passthrough())
      .parse(consoleData.messages)
      .filter((m) => m.type === "error" || m.level === "error").length === 0,
    consoleData.messages,
  );
  save("runtime", runtime);
}
function audit(name: string) {
  const data = browser(["a11y"]);
  const result = z
    .object({ violations: z.array(z.unknown()), incomplete: z.array(z.unknown()) })
    .parse(data.results ?? data);
  audits.push({ name, violations: result.violations, incomplete: result.incomplete, data });
  save("audits", audits);
  check(
    `${name}: axe violations zero (incomplete separate)`,
    Array.isArray(result.violations) && result.violations.length === 0,
    { violations: result.violations, incomplete: result.incomplete?.length },
  );
}
function layout(name: string) {
  const data = evaluate(
    `(() => {const cards=[...document.querySelectorAll('.education-card')];return {width:innerWidth,rootWidth:document.documentElement.scrollWidth, cards:cards.map(e=>{const r=e.getBoundingClientRect();return {family:e.dataset.adapterFamily??e.dataset.family,left:r.left,right:r.right,width:r.width,scrollWidth:e.scrollWidth,clientWidth:e.clientWidth};}),svgs:[...document.querySelectorAll('.education-canvas svg')].map(e=>({viewBox:e.getAttribute('viewBox'),width:e.getBoundingClientRect().width,height:e.getBoundingClientRect().height,images:[...e.querySelectorAll('image')].map(i=>i.getAttribute('href')?.startsWith('data:image/svg+xml,'))})),alerts:[...document.querySelectorAll('[role="alert"]')].map(e=>e.textContent)};})()`,
    z.object({
      width: z.number(),
      rootWidth: z.number(),
      cards: z.array(
        z.object({
          family: z.string(),
          left: z.number(),
          right: z.number(),
          width: z.number(),
          scrollWidth: z.number(),
          clientWidth: z.number(),
        }),
      ),
      svgs: z.array(
        z.object({
          viewBox: z.string(),
          width: z.number(),
          height: z.number(),
          images: z.array(z.boolean()),
        }),
      ),
      alerts: z.array(z.string()),
    }),
  );
  save(`${name}-geometry`, data);
  check(
    `${name}: no document or card overflow`,
    data.rootWidth <= data.width &&
      data.cards.every(
        (c) => c.left >= -1 && c.right <= data.width + 1 && c.scrollWidth <= c.clientWidth + 1,
      ),
    data,
  );
  check(
    `${name}: all SVG structural hints valid, no unsupported-glyph alert`,
    data.svgs.every(
      (s) =>
        s.width > 0 &&
        s.height > 0 &&
        s.viewBox.split(" ").every((x: string) => Number.isFinite(Number(x))) &&
        s.images.every(Boolean),
    ) && data.alerts.length === 0,
    data.alerts,
  );
  const decoded = evaluate(
    `(async()=>{const urls=[...document.querySelectorAll('.education-canvas svg image')].map(e=>e.getAttribute('href'));return await Promise.all(urls.map(async url=>{const image=new Image();image.src=url;try{await image.decode();return {ok:true,width:image.naturalWidth,height:image.naturalHeight}}catch{return {ok:false}}}));})()`,
    z.array(
      z.discriminatedUnion("ok", [
        z.object({ ok: z.literal(true), width: z.number(), height: z.number() }),
        z.object({ ok: z.literal(false) }),
      ]),
    ),
  );
  check(
    `${name}: embedded canonical SVG images decode`,
    decoded.every((d) => d.ok && d.width > 0 && d.height > 0),
    decoded,
  );
  const viewports = viewportChecks(name);
  check(
    `${name}: initial figure viewports are Readable`,
    viewports.every((v) => v.mode === "readable"),
  );
}
function instrumentExports() {
  evaluate(
    `(() => {window.__qaDownloads=[];window.__qaBlobs=new Map();window.__qaCreated=[];const create=URL.createObjectURL.bind(URL),revoke=URL.revokeObjectURL.bind(URL);URL.createObjectURL=blob=>{const url=create(blob);window.__qaBlobs.set(url,blob);const entry={url,type:blob.type};window.__qaCreated.push(entry);if(blob.type.startsWith('image/svg'))blob.text().then(text=>entry.text=text);return url};URL.revokeObjectURL=url=>{window.__qaBlobs.delete(url);revoke(url)};const click=HTMLAnchorElement.prototype.click;HTMLAnchorElement.prototype.click=function(){if(!this.download)return click.call(this);const blob=window.__qaBlobs.get(this.href);const entry={name:this.download,type:blob?.type};window.__qaDownloads.push(entry);if(blob)blob.arrayBuffer().then(buffer=>{let binary='';for(const byte of new Uint8Array(buffer))binary+=String.fromCharCode(byte);entry.base64=btoa(binary)})};})()`,
  );
}
function exported(format: string) {
  button(`Download ${format.toUpperCase()}`);
  browser([
    "wait",
    "--fn",
    `window.__qaDownloads.at(-1)?.name==='CircuitFigure.${format}'&&!!window.__qaDownloads.at(-1)?.base64`,
  ]);
  const item = evaluate(
    "window.__qaDownloads.at(-1)",
    z.object({ base64: z.string(), name: z.string(), type: z.string() }),
  );
  const bytes = Buffer.from(item.base64, "base64");
  return { ...item, bytes };
}
function verifyExports(name: string, doc: PublicFigure = source()) {
  const svg = publicExport(doc, "svg");
  if (!svg) throw new Error("Canonical renderer rejected public source");
  const json = exported("json");
  check(
    `${name}: JSON is exact selected public document`,
    json.bytes.toString() === JSON.stringify(doc, null, 2) && publicOnly(json.bytes.toString()),
  );
  writeFileSync(`${output}/${name}.json`, json.bytes);
  const actualSVG = exported("svg");
  check(
    `${name}: SVG exact canonical, excludes interaction/caption`,
    actualSVG.bytes.toString() === svg.text,
  );
  writeFileSync(`${output}/${name}.svg`, actualSVG.bytes);
  const png = exported("png");
  const w = Math.ceil(svg.bounds.width * 2),
    h = Math.ceil(svg.bounds.height * 2);
  check(
    `${name}: real browser PNG signature and 2x dimensions`,
    png.type === "image/png" &&
      png.bytes.subarray(0, 8).toString("hex") === "89504e470d0a1a0a" &&
      png.bytes.readUInt32BE(16) === w &&
      png.bytes.readUInt32BE(20) === h,
    {
      bytes: png.bytes.length,
      width: png.bytes.readUInt32BE(16),
      height: png.bytes.readUInt32BE(20),
      expected: [w, h],
    },
  );
  writeFileSync(`${output}/${name}.png`, png.bytes);
  const pixels = evaluate(
    `(async()=>{const raster=async url=>{const image=new Image();image.src=url;await image.decode();const canvas=document.createElement('canvas');canvas.width=${w};canvas.height=${h};const context=canvas.getContext('2d');context.drawImage(image,0,0,canvas.width,canvas.height);return context.getImageData(0,0,canvas.width,canvas.height).data};const a=await raster(${JSON.stringify(`data:image/svg+xml,${encodeURIComponent(svg.text)}`)}),b=await raster(${JSON.stringify(`data:image/png;base64,${png.base64}`)});let different=0,painted=0;for(let i=0;i<a.length;i+=4){if(b[i+3])painted++;if(a[i]!==b[i]||a[i+1]!==b[i+1]||a[i+2]!==b[i+2]||a[i+3]!==b[i+3])different++}return {different,painted}})()`,
    z.object({ different: z.number(), painted: z.number() }),
  );
  check(
    `${name}: PNG pixels equal selected canonical SVG raster`,
    pixels.different === 0 && pixels.painted > 0,
    pixels,
  );
  check(
    `${name}: PNG raster received the selected canonical SVG`,
    evaluate(`window.__qaCreated.some(e=>e.text===${JSON.stringify(svg.text)})`),
  );
}
function selectedIDs() {
  return evaluate(
    "[...document.querySelectorAll('[data-public-preview] [data-selected=\"true\"]')].map(e=>e.dataset.target)",
    z.array(z.string()),
  );
}
const panSchema = z.object({
  left: z.number(),
  top: z.number(),
  width: z.number(),
  height: z.number(),
  totalWidth: z.number(),
  totalHeight: z.number(),
  pageX: z.number(),
  pageY: z.number(),
});
function panState(selector: string) {
  return panSchema.parse(
    evaluate(
      `(() => {const e=document.querySelector(${JSON.stringify(selector)});return {left:e.scrollLeft,top:e.scrollTop,width:e.clientWidth,height:e.clientHeight,totalWidth:e.scrollWidth,totalHeight:e.scrollHeight,pageX:scrollX,pageY:scrollY};})()`,
    ),
  );
}
function localPan(selector: string, left: number, top: number) {
  browser(["scrollintoview", selector]);
  const before = panState(selector);
  const x = Math.max(0, Math.min(left, before.totalWidth - before.width));
  const y = Math.max(0, Math.min(top, before.totalHeight - before.height));
  if (Math.abs(x - before.left) > 0.5)
    browser([
      "scroll",
      x > before.left ? "right" : "left",
      String(Math.round(Math.abs(x - before.left))),
      "--selector",
      selector,
    ]);
  if (Math.abs(y - before.top) > 0.5)
    browser([
      "scroll",
      y > before.top ? "down" : "up",
      String(Math.round(Math.abs(y - before.top))),
      "--selector",
      selector,
    ]);
  browser([
    "wait",
    "--fn",
    `(() => {const e=document.querySelector(${JSON.stringify(selector)});return Math.abs(e.scrollLeft-${x})<=1&&Math.abs(e.scrollTop-${y})<=1;})()`,
  ]);
  const after = panState(selector);
  check(
    `scoped native pan ${selector} to ${x},${y}`,
    Math.abs(after.left - x) <= 1 &&
      Math.abs(after.top - y) <= 1 &&
      after.pageX === before.pageX &&
      Math.abs(after.pageY - before.pageY) < 1,
    { before, after },
  );
  return after;
}
function viewMode(scope: string, mode: "readable" | "fit") {
  const wrapper = `${scope} [data-figure-viewport]`;
  const current = z
    .string()
    .nullable()
    .parse(
      evaluate(
        `document.querySelector(${JSON.stringify(wrapper)})?.getAttribute('data-view-mode')??null`,
      ),
    );
  if (current === null) return;
  const control = `${wrapper} .education-viewport-controls button:nth-of-type(${mode === "fit" ? 2 : 1})`;
  if (!evaluate(`!!document.querySelector(${JSON.stringify(control)})`)) {
    check(
      `${scope}: small figure needs no overview control`,
      evaluate(
        `(() => {const e=document.querySelector(${JSON.stringify(`${wrapper} .education-viewport-scroll`)});return e.scrollWidth<=e.clientWidth+1&&e.scrollHeight<=e.clientHeight+1;})()`,
      ),
    );
    return;
  }
  if (current !== mode) click(control);
  browser([
    "wait",
    "--fn",
    `document.querySelector(${JSON.stringify(wrapper)}).dataset.viewMode===${JSON.stringify(mode)}`,
  ]);
}
const viewportEvidenceSchema = z.object({
  adapter: z.string().nullable(),
  case: z.string().nullable(),
  stage: z.string(),
  theme: z.string(),
  mode: z.enum(["readable", "fit"]),
  svgWidth: z.number(),
  svgHeight: z.number(),
  vbWidth: z.number(),
  vbHeight: z.number(),
  clientWidth: z.number(),
  clientHeight: z.number(),
  scrollWidth: z.number(),
  scrollHeight: z.number(),
  windowHeight: z.number(),
  windowWidth: z.number(),
  rootWidth: z.number(),
  left: z.number(),
  right: z.number(),
  overflowX: z.string(),
  overflowY: z.string(),
  controls: z.boolean(),
  caption: z.boolean(),
});
function viewportChecks(name: string, scope = "body", documentOverride?: PublicFigure) {
  const data = z
    .array(viewportEvidenceSchema)
    .parse(
      evaluate(
        `(() => {const root=document.querySelector(${JSON.stringify(scope)});return [...root.querySelectorAll('[data-figure-viewport]')].map(e=>{const region=e.querySelector('.education-viewport-scroll'),s=e.querySelector('svg'),r=s.getBoundingClientRect(),box=region.getBoundingClientRect(),v=s.viewBox.baseVal,c=e.closest('.education-card'),w=e.closest('[data-education-workbench]'),query=new URLSearchParams(location.search),link=c?.querySelector('a[href^="/editor/education?"]');return {adapter:c?.dataset.adapterFamily??null,case:w?.querySelector('.education-case-control select')?.value??(link?new URL(link.href).searchParams.get('case'):null),stage:w?.querySelector('select[id$="-stage"]')?.value??query.get('stage')??'question',theme:w?.querySelector('select[id$="-theme"]')?.value??query.get('theme')??'geist-light',mode:e.dataset.viewMode,svgWidth:r.width,svgHeight:r.height,vbWidth:v.width,vbHeight:v.height,clientWidth:region.clientWidth,clientHeight:region.clientHeight,scrollWidth:region.scrollWidth,scrollHeight:region.scrollHeight,windowHeight:innerHeight,windowWidth:innerWidth,rootWidth:document.documentElement.scrollWidth,left:box.left,right:box.right,overflowX:getComputedStyle(region).overflowX,overflowY:getComputedStyle(region).overflowY,controls:!!e.querySelector('.education-viewport-controls'),caption:!!e.querySelector('figcaption')};});})()`,
      ),
    );
  const results = data.map((item) => {
    const selection = parseSelection({
      case: item.case ?? "measurement",
      stage: item.stage,
      theme: item.theme,
    });
    if (!selection) throw Error("Unrecognized live viewport selectors");
    const doc =
      documentOverride ??
      (item.adapter
        ? publicAdapterExamples(selection.stage, selection.theme).find(
            (e) => e.family === item.adapter,
          )?.document
        : publicExample(selection));
    if (!doc) throw Error("Viewport must correspond to a public figure");
    const sizes = doc.display.flatMap((p) =>
      p.shapes.flatMap((s) =>
        s.kind === "math" && s.runs.some((r) => r.text.trim()) ? [s.size] : [],
      ),
    );
    const scale = item.svgWidth / item.vbWidth;
    const minBase = sizes.length ? Math.min(...sizes) : null;
    const minPixels = minBase === null ? null : minBase * scale;
    const label = item.adapter ?? item.case ?? doc.id;
    const canonical = publicExport(doc, "svg");
    if (!canonical) throw Error("Viewport document must render canonically");
    const readableWidth = Math.ceil(canonical.bounds.width * Math.max(1, 12 / (minBase ?? 12)));
    const readableHeight = (readableWidth * canonical.bounds.height) / canonical.bounds.width;
    const needs =
      readableWidth > item.clientWidth + 0.5 ||
      readableHeight > Math.min(480, item.windowHeight * 0.6) + 0.5;
    check(`${name}/${label}: overview controls appear only when needed`, item.controls === needs, {
      needs,
      controls: item.controls,
      readableWidth,
      readableHeight,
    });
    check(
      `${name}/${label}: bounded local scrolling, not document overflow`,
      item.rootWidth <= item.windowWidth &&
        item.left >= -1 &&
        item.right <= item.windowWidth + 1 &&
        item.clientHeight <= Math.min(480, item.windowHeight * 0.6) + 1 &&
        item.overflowX === "auto" &&
        item.overflowY === "auto",
      item,
    );
    check(
      `${name}/${label}: ${item.mode} actual base-font pixels`,
      item.mode === "fit"
        ? item.svgWidth <= item.clientWidth + 1 &&
            item.svgHeight <= Math.min(480, item.windowHeight * 0.6) + 1
        : minPixels === null
          ? scale >= 1 - 0.01
          : minPixels >= 12 - 0.03,
      { minBase, scale, minPixels, mode: item.mode },
    );
    return { ...item, minBase, scale, minPixels, canonicalSVG: canonical.text };
  });
  save(`${name}-viewports`, results);
  return results;
}
function figureViews(scope: string, name: string) {
  const region = `${scope} .education-viewport-scroll`;
  if (!evaluate(`!!document.querySelector(${JSON.stringify(region)})`)) {
    captureElement(scope, `${name}-host-only`);
    return;
  }
  check(
    `${name}: Readable is initial state`,
    evaluate(
      `document.querySelector(${JSON.stringify(`${scope} [data-figure-viewport]`)}).dataset.viewMode==='readable'`,
    ),
  );
  viewportChecks(`${name}-default`, scope);
  viewMode(scope, "fit");
  captureElement(scope, `${name}-fit-overview`);
  const fit = panState(region);
  check(
    `${name}: explicit Fit contains the full figure`,
    fit.totalWidth <= fit.width + 1 && fit.totalHeight <= fit.height + 1,
    fit,
  );
  viewMode(scope, "readable");
  const readableEvidence = viewportChecks(`${name}-readable`, scope);
  const canonical = readableEvidence[0]?.canonicalSVG;
  if (!canonical) throw Error("Pan capture requires an independently rendered public SVG");
  localPan(region, 0, 0);
  const dimensions = panState(region);
  const offsets = (total: number, visible: number) => {
    const out = [0];
    for (let at = Math.max(1, visible - 24); at < total - visible; at += Math.max(1, visible - 24))
      out.push(at);
    if (total > visible) out.push(total - visible);
    return [...new Set(out)];
  };
  const tiles = [];
  for (const y of offsets(dimensions.totalHeight, dimensions.height))
    for (const x of offsets(dimensions.totalWidth, dimensions.width)) {
      const pan = localPan(region, x, y);
      const tile = `${name}-readable-x${Math.round(pan.left)}-y${Math.round(pan.top)}`;
      captureElement(region, tile, canonical);
      tiles.push({ file: `${tile}.png`, ...pan });
    }
  save(`${name}-pan-coverage`, {
    scope,
    dimensions,
    tiles,
    meaning:
      "Each tile is a locally panned Readable viewport, not a claim that one image shows the entire figure. Fit overview is separately labelled.",
  });
  check(
    `${name}: pan tiles cover all scrollable regions`,
    tiles.some((t) => t.left <= 1 && t.top <= 1) &&
      tiles.some(
        (t) =>
          t.left + t.width >= dimensions.totalWidth - 1 &&
          t.top + t.height >= dimensions.totalHeight - 1,
      ),
  );
  localPan(region, 0, 0);
}
function caseNameCheck(name: string) {
  const info = z
    .object({
      text: z.string(),
      selected: z.string(),
      linked: z.boolean(),
      visible: z.boolean(),
      fits: z.boolean(),
      selectFont: z.number(),
    })
    .parse(
      evaluate(
        `(() => {const s=document.querySelector('.education-case-control select'),e=document.querySelector('.education-case-name'),r=e.getBoundingClientRect();return {text:e.textContent.trim(),selected:s.selectedOptions[0].textContent,linked:s.getAttribute('aria-describedby').split(' ').includes(e.id),visible:e.checkVisibility(),fits:e.scrollWidth<=e.clientWidth+1&&r.left>=0&&r.right<=innerWidth,selectFont:parseFloat(getComputedStyle(s).fontSize)};})()`,
      ),
    );
  check(
    `${name}: complete selected case name visible and associated`,
    info.text === `Selected case: ${info.selected}` &&
      info.linked &&
      info.visible &&
      info.fits &&
      info.selectFont >= 16,
    info,
  );
  captureElement(".education-case-name", `${name}-complete-case-name`);
}
function theme(mode: string) {
  const desired = String(mode === "dark");
  if (evaluate("document.querySelector('.theme-toggle').getAttribute('aria-pressed')") !== desired)
    button("Dark theme");
  browser([
    "wait",
    "--fn",
    `document.querySelector('.theme-toggle').getAttribute('aria-pressed')===${JSON.stringify(desired)}`,
  ]);
}
try {
  await phase("api-matrix", async () => {
    check(
      "catalog has 12 families, 17 cases, 18 adapter families, 3 stages and themes",
      families.length === 12 &&
        examples.length === 17 &&
        adapterFamilies.length === 18 &&
        stages.length === 3 &&
        themes.length === 3,
    );
    for (const entry of examples)
      for (const stage of stages)
        for (const theme of themes) {
          const key = `${entry.id}-${stage}-${theme}`;
          const result = await get(
            `/api/education?case=${entry.id}&stage=${stage}&theme=${theme}`,
            `api-${key}`,
          );
          const payload = z
            .object({ document: z.unknown() })
            .passthrough()
            .parse(JSON.parse(result.text));
          const validated = validateEducational(payload.document);
          if (!validated.ok) throw Error(`Invalid public GET response ${key}`);
          projections.set(key, validated.document);
          check(
            `${key}: GET exact selected renderable public projection`,
            result.status === 200 &&
              Object.keys(payload).join() === "document" &&
              JSON.stringify(payload.document) ===
                JSON.stringify(publicExample({ case: entry.id, stage, theme })) &&
              validated.document.theme === theme &&
              publicOnly(result.text) &&
              publicExport(payload.document, "svg") !== null,
          );
          check(
            `${key}: no-store and nosniff`,
            result.headers.get("cache-control") === "no-store" &&
              result.headers.get("x-content-type-options") === "nosniff",
          );
          if (entry.id === "named-nets")
            check(
              `${key}: public net disclosure matches selected stage`,
              stage === "question"
                ? !result.text.includes("/net/") && !result.text.includes('"members"')
                : validated.document.targets.filter((t) => t.role === "net").length === 3,
            );
        }
    for (const query of [
      "case=unknown",
      "stage=private",
      "theme=unknown",
      "case=measurement&case=signal",
      "author=true",
      "source=true",
    ]) {
      const result = await get(
        `/api/education?${query}`,
        `invalid-get-${encodeURIComponent(query)}`,
      );
      check(
        `GET rejects ${query} without diagnostic leakage`,
        result.status === 400 &&
          result.text === '{"error":"Invalid or unsupported educational figure."}',
      );
    }
  });
  await phase("landing", () => {
    open("/");
    browser(["set", "viewport", "1280", "900"]);
    ready();
    check(
      "landing install-first retained and schematic remains default",
      evaluate(
        "JSON.stringify([...document.querySelectorAll('.landing-actions a')].map(e=>e.getAttribute('href')))===JSON.stringify(['#install','#install-skill'])&&!!document.querySelector('#install')&&!!document.querySelector('#install-skill')&&document.querySelector('.landing-preview')?.dataset.previewMode==='schematic'",
      ),
    );
    click('.landing-actions a[href="#install"]');
    check("primary Install package reaches installation", evaluate("location.hash==='#install'"));
    click('.landing-actions a[href="#install-skill"]');
    check(
      "primary Install skill reaches retained skill instructions",
      evaluate(
        "location.hash==='#install-skill'&&document.querySelector('#install-skill').textContent.includes('bunx skills add crafter-lab/circuitkit --skill circuitkit')",
      ),
    );
    evaluate(
      "window.__qaCopies=[];Object.defineProperty(navigator,'clipboard',{configurable:true,value:{writeText:async text=>window.__qaCopies.push(text)}})",
    );
    for (const label of [
      "Build CircuitKit from source",
      "Install the local tarball in your project",
      "Install the CircuitKit skill",
    ]) {
      button(`Copy ${label}`);
      check(
        `${label}: displayed command copied only`,
        evaluate(
          `window.__qaCopies.at(-1)===document.querySelector('section[aria-label=${JSON.stringify(label)}] code').textContent`,
        ),
      );
    }
    const initial = evaluate(
      "document.querySelector('[data-public-preview] svg image').getAttribute('href')",
    );
    select("Family", "timeline");
    check(
      "landing live family selector updates geometry and links",
      evaluate(
        `document.querySelector('[data-public-preview] svg image').getAttribute('href')!==${JSON.stringify(initial)}&&document.querySelector('.education-links a[href^="/editor/education?"]').href.includes('case=timeline')`,
      ),
    );
    click('.education-links a[href^="/editor/education?"]');
    ready();
    check(
      "new public editor link navigates with selection",
      evaluate(
        "location.pathname==='/editor/education'&&document.querySelector('[data-workspace]').dataset.workspace==='public'",
      ),
    );
    click('.education-links a[href^="/gallery/education?"]:not([href*="#"])');
    browser(["wait", "--load", "networkidle"]);
    check(
      "new gallery link navigates",
      evaluate(
        "location.pathname==='/gallery/education'&&document.querySelectorAll('[data-family]').length===17",
      ),
    );
    health("landing-navigation");
  });
  await phase("question-boundary", async () => {
    for (const entry of examples) {
      const path = `/editor/education?case=${entry.id}&stage=question&theme=geist-light`;
      const result = await get(path, `ssr-question-${entry.id}`);
      check(
        `${entry.id}: SSR and hydration payload excludes full author and raw model`,
        result.status === 200 && publicOnly(result.text),
      );
      open(path);
      ready();
      const publicSource = source();
      const expected = projection(`${entry.id}-question-geist-light`);
      check(
        `${entry.id}: hydrated source equals question GET only`,
        JSON.stringify(publicSource) === JSON.stringify(expected),
      );
      const allDOM = evaluate("document.documentElement.outerHTML", z.string());
      save(`question-${entry.id}-boundary`, {
        source: publicSource,
        publicOnly: publicOnly(allDOM),
      });
      check(
        `${entry.id}: live DOM/hydration excludes author envelope and stage map`,
        publicOnly(allDOM),
      );
      const correction = projection(`${entry.id}-correction-geist-light`);
      const ids = correction.display
        .map((p) => p.id)
        .filter((id) => !expected.display.some((p) => p.id === id));
      check(
        `${entry.id}: correction-only display identities absent`,
        ids.every((id: string) => !allDOM.includes(id)),
        ids,
      );
      if (entry.id === "named-nets")
        check(
          "question DOM has no published net members or group IDs",
          !allDOM.includes("circuit/net/") &&
            !allDOM.includes("data-member=") &&
            !allDOM.includes('"members":'),
        );
      health(`question-${entry.id}`);
    }
    const author = await get(
      "/editor/education/author?case=named-nets&stage=question",
      "ssr-author-explicit",
    );
    const parsed = evaluate(
      `(() => {const d=new DOMParser().parseFromString(${JSON.stringify(author.text)},'text/html');return {text:d.body.textContent,source:JSON.parse(d.querySelector('textarea').textContent),workspace:d.querySelector('[data-workspace]').dataset.workspace};})()`,
      z.object({
        workspace: z.string(),
        text: z.string(),
        source: z.object({ schema: z.string(), stages: z.record(z.string(), z.unknown()) }),
      }),
    );
    check(
      "author GET is explicitly labelled, disclaims CSS/privacy and contains all author stages",
      author.status === 200 &&
        parsed.workspace === "author" &&
        parsed.text.includes("CSS stage hiding is not protection") &&
        parsed.text.includes("not assessment privacy") &&
        parsed.source.schema === "circuitkit.educational.author.v2" &&
        Object.keys(parsed.source.stages).sort().join() === "correction,question,teaching",
    );
    save("author-get-disclosure", {
      workspace: parsed.workspace,
      schema: parsed.source.schema,
      stages: Object.keys(parsed.source.stages),
      browserHydration:
        "Author browser hydration and POST compilation are now explicitly authorized and exercised in author-workspace phase.",
    });
  });
  await phase("editor-matrix", () => {
    for (const entry of examples) {
      open(`/editor/education?case=${entry.id}`);
      ready();
      for (const stage of stages) {
        select("Stage", stage);
        for (const t of themes) {
          select("Figure theme", t);
          const expected = projection(`${entry.id}-${stage}-${t}`);
          const actual = source();
          const canonical = publicExport(actual, "svg");
          if (!canonical) throw Error("Validated selected document must have canonical SVG output");
          check(
            `${entry.id}/${stage}/${t}: dropdown public state equals GET`,
            JSON.stringify(actual) === JSON.stringify(expected),
          );
          check(
            `${entry.id}/${stage}/${t}: visible stage and themed SVG`,
            evaluate(
              `document.querySelector('[data-public-preview] svg image').getAttribute('href')===${JSON.stringify(`data:image/svg+xml,${encodeURIComponent(canonical.text.replaceAll("CircuitFigure", "showcase"))}`)}`,
            ),
          );
        }
      }
      health(`editor-${entry.id}`);
    }
  });
  await phase("net-keyboard-drafts-exports", () => {
    open("/editor/education?case=named-nets&stage=teaching");
    ready();
    button("Select targets");
    const manifest = source().targets.filter((t) => t.role === "net");
    check(
      "named nets have exact three approved member sets",
      JSON.stringify(manifest.map((t) => [t.id, t.members])) ===
        JSON.stringify([
          [
            "circuit/net/supply",
            ["circuit/route/top", "circuit/terminal/ra", "circuit/terminal/vp"],
          ],
          [
            "circuit/net/midpoint",
            ["circuit/route/middle", "circuit/terminal/rb", "circuit/terminal/rc"],
          ],
          [
            "circuit/net/return",
            ["circuit/route/bottom", "circuit/terminal/rd", "circuit/terminal/vn"],
          ],
        ]),
    );
    for (const target of manifest) {
      const selector = `[data-target="${target.id}"]`;
      browser(["scrollintoview", selector]);
      browser(["focus", selector]);
      browser(["press", "Enter"]);
      check(`${target.id}: Enter selects allowlisted ID`, selectedIDs().includes(target.id));
      const memberData = evaluate(
        `(() => {const e=document.querySelector(${JSON.stringify(selector)});return {members:[...e.querySelectorAll('[data-member]')].map(m=>({id:m.dataset.member,shapes:m.children.length,painted:[...m.children].every(s=>getComputedStyle(s).stroke!=='rgba(0, 0, 0, 0)')})),broadRects:[...e.querySelectorAll(':scope > g > rect')].filter(r=>r.getAttribute('fill')!=='none'||r.getAttribute('pointer-events')==='all').length,pressed:e.getAttribute('aria-pressed'),focus:!!e.querySelector('[data-focus-ring]')};})()`,
        z.object({
          members: z.array(z.object({ id: z.string(), shapes: z.number(), painted: z.boolean() })),
          broadRects: z.number(),
          pressed: z.string(),
          focus: z.boolean(),
        }),
      );
      check(
        `${target.id}: exact member highlights, no bounding-gap rectangle`,
        memberData.broadRects === 0 &&
          memberData.pressed === "true" &&
          memberData.focus &&
          JSON.stringify(memberData.members.map((m) => m.id)) === JSON.stringify(target.members) &&
          memberData.members.every(
            (m) =>
              m.shapes === source().display.find((p) => p.id === m.id)?.shapes.length && m.painted,
          ),
        memberData,
      );
      const gaps = evaluate(
        `(() => {const group=document.querySelector(${JSON.stringify(selector)}),svg=group.ownerSVGElement,box=group.getBBox(),matrix=svg.getScreenCTM();let gaps=0,gapHits=0,painted=0;const shapes=[...group.querySelectorAll('[data-member] path,[data-member] circle,[data-member] rect')];for(let x=1;x<15;x++)for(let y=1;y<9;y++){const p=svg.createSVGPoint();p.x=box.x+box.width*x/15;p.y=box.y+box.height*y/9;const screen=p.matrixTransform(matrix);const region=svg.closest('.education-viewport-scroll').getBoundingClientRect();if(screen.x<Math.max(0,region.left)||screen.x>=Math.min(innerWidth,region.right)||screen.y<Math.max(0,region.top)||screen.y>=Math.min(innerHeight,region.bottom))continue;const ink=shapes.some(shape=>shape.isPointInStroke(p)||(getComputedStyle(shape).fill!=='none'&&shape.isPointInFill(p)));if(ink){painted++;continue}gaps++;const hit=document.elementFromPoint(screen.x,screen.y);if(hit?.closest('[data-target]')===group)gapHits++}return {gaps,gapHits,painted};})()`,
        z.object({ gaps: z.number(), gapHits: z.number(), painted: z.number() }),
      );
      check(
        `${target.id}: real hit testing does not turn bounding-box gaps into net targets`,
        gaps.gaps > 0 && gaps.gapHits === 0,
        gaps,
      );
      browser(["press", "Space"]);
      check(`${target.id}: Space toggles off`, !selectedIDs().includes(target.id));
      browser(["press", "Enter"]);
      browser(["press", "Escape"]);
      check(`${target.id}: Escape clears`, selectedIDs().length === 0);
    }
    const ids = source().targets.map((t) => t.id);
    browser(["focus", `[data-target="${ids[0]}"]`]);
    for (const id of ids.slice(1)) {
      browser(["press", "Tab"]);
      check(`Tab order reaches ${id}`, evaluate("document.activeElement.dataset.target") === id);
    }
    browser(["press", "Shift+Tab"]);
    check(
      "Shift+Tab returns previous semantic target",
      evaluate("document.activeElement.dataset.target") === ids.at(-2),
    );
    browser(["focus", '[data-target="circuit/net/supply"]']);
    browser(["press", "Enter"]);
    select("Stage", "correction");
    check(
      "net selection survives same identity teaching to correction",
      selectedIDs().includes("circuit/net/supply"),
    );
    select("Figure theme", "geist-dark");
    check("theme retains allowed net selection", selectedIDs().includes("circuit/net/supply"));
    button("Host caption");
    check(
      "host caption explicitly enabled",
      evaluate("!!document.querySelector('[data-public-preview] figcaption')"),
    );
    instrumentExports();
    verifyExports("selected-net-dark");
    capture("net-selected-dark");
    select("Stage", "question");
    check(
      "question prunes net selection and membership DOM",
      selectedIDs().length === 0 &&
        evaluate(
          "!document.querySelector('[data-kind=group]')&&!document.querySelector('[data-member]')",
        ),
    );
    select("Stage", "correction");
    check("pruned net IDs are not silently restored", selectedIDs().length === 0);
    browser(["focus", '[data-target="circuit/net/supply"]']);
    browser(["press", "Enter"]);
    const valid = source();
    fillSource("{");
    browser(["wait", "--fn", "!!document.querySelector('[data-public-preview] [role=alert]')"]);
    check(
      "invalid public draft immediately pauses all output and SVG/PNG/JSON",
      evaluate(
        "!document.querySelector('[data-public-preview] svg')&&[...document.querySelectorAll('fieldset button')].every(b=>b.disabled)&&document.querySelector('.education-output [aria-live]').textContent.includes('none')",
      ),
    );
    capture("invalid-public-draft");
    fillSource(JSON.stringify(valid));
    ready();
    check(
      "valid recovery restores only permitted previous IDs",
      selectedIDs().join() === "circuit/net/supply",
    );
    const edited = { ...source(), title: "QA edited public title" };
    fillSource(JSON.stringify(edited));
    ready();
    select("Figure theme", "geist-light");
    check(
      "theme preserves edited public geometry and title",
      source().title === edited.title &&
        JSON.stringify(source().display) === JSON.stringify(edited.display),
    );
    button("Reload preset");
    ready();
    check("reload preset discards edits as labelled", source().title !== edited.title);
    fillSource("{");
    button("Reload preset");
    ready();
    check("reload preset recovers invalid draft", !!source().display.length);
    select("Family", "signal");
    check(
      "family/preset navigation clears foreign selection IDs",
      selectedIDs().length === 0 && source().id !== valid.id,
    );
    instrumentExports();
    verifyExports("signal-light");
    const empty = { ...source(), display: [], targets: [] };
    fillSource(JSON.stringify(empty));
    ready();
    check(
      "empty public display valid, no fake SVG, JSON enabled",
      evaluate(
        "!document.querySelector('[data-public-preview] svg')&&[...document.querySelectorAll('fieldset button')].filter(b=>b.textContent.includes('JSON')).every(b=>!b.disabled)&&[...document.querySelectorAll('fieldset button')].filter(b=>!b.textContent.includes('JSON')).every(b=>b.disabled)&&!document.querySelector('[data-public-preview] [role=alert]')",
      ),
    );
    check(
      "empty/caption-only projection creates no scroll region or Fit controls",
      evaluate(
        "!document.querySelector('[data-public-preview] [data-figure-viewport]')&&!document.querySelector('[data-public-preview] .education-viewport-controls')",
      ),
    );
    const emptyDownload = exported("json");
    check(
      "empty JSON export roundtrips as valid empty public document",
      JSON.stringify(JSON.parse(emptyDownload.bytes.toString())) === JSON.stringify(empty) &&
        publicExport(JSON.parse(emptyDownload.bytes.toString()), "svg")?.text === "",
    );
    capture("empty-public-stage");
    button("Reload preset");
    ready();
    check(
      "return to nonempty restores image exports",
      evaluate(
        "[...document.querySelectorAll('fieldset button')].every(b=>!b.disabled)&&!!document.querySelector('[data-public-preview] svg')",
      ),
    );
    audit("editor-interactive");
    health("editor-interactive");
  });
  await phase("readable-keyboard-exports", () => {
    open("/editor/education?case=composed&stage=teaching");
    ready();
    browser(["set", "viewport", "320", "640"]);
    viewportChecks("composed-320x640");
    const region = "[data-public-preview] .education-viewport-scroll";
    browser(["scrollintoview", region]);
    browser(["focus", region]);
    const initial = panState(region);
    check(
      "composed actually needs two-axis local pan at320",
      initial.totalWidth > initial.width && initial.totalHeight > initial.height,
      initial,
    );
    localPan(region, 64, 64);
    for (const [key, dx, dy] of [
      ["ArrowRight", 64, 0],
      ["ArrowLeft", -64, 0],
      ["ArrowDown", 0, 64],
      ["ArrowUp", 0, -64],
    ] as const) {
      const before = panState(region);
      browser(["press", key]);
      browser([
        "wait",
        "--fn",
        `(() => {const e=document.querySelector(${JSON.stringify(region)});return Math.abs(e.scrollLeft-${before.left + dx})<1&&Math.abs(e.scrollTop-${before.top + dy})<1;})()`,
      ]);
      const after = panState(region);
      check(
        `${key}: local64px pan without document scroll`,
        after.left === before.left + dx &&
          after.top === before.top + dy &&
          after.pageX === before.pageX &&
          after.pageY === before.pageY,
        { before, after },
      );
    }
    const original = source();
    button("Select targets");
    browser(["focus", "[data-public-preview] [data-target]"]);
    browser(["press", "Enter"]);
    const selected = selectedIDs();
    instrumentExports();
    verifyExports("composed-readable-selected");
    viewMode("[data-public-preview]", "fit");
    viewportChecks("composed-explicit-fit");
    check(
      "Fit leaves document and selection untouched",
      JSON.stringify(source()) === JSON.stringify(original) &&
        JSON.stringify(selectedIDs()) === JSON.stringify(selected),
    );
    verifyExports("composed-fit-selected");
    viewMode("[data-public-preview]", "readable");
    localPan(region, 400, 200);
    viewportChecks("composed-readable-restored");
    check(
      "return to Readable and real pan preserve document and IDs",
      JSON.stringify(source()) === JSON.stringify(original) &&
        JSON.stringify(selectedIDs()) === JSON.stringify(selected),
    );
    verifyExports("composed-panned-selected");
    figureViews("[data-public-preview]", "composed-keyboard-320");
    open("/editor/education?case=named-nets&stage=correction");
    ready();
    button("Select targets");
    browser(["scrollintoview", region]);
    const ids = source().targets.map((t) => t.id);
    browser(["focus", `[data-target="${ids[0]}"]`]);
    const page = panState(region);
    let changed = false;
    for (let index = 0; index < ids.length; index++) {
      if (index) browser(["press", "Tab"]);
      const info = z
        .object({
          id: z.string(),
          left: z.number(),
          right: z.number(),
          top: z.number(),
          bottom: z.number(),
          regionLeft: z.number(),
          regionRight: z.number(),
          regionTop: z.number(),
          regionBottom: z.number(),
          localX: z.number(),
          localY: z.number(),
          pageX: z.number(),
          pageY: z.number(),
        })
        .parse(
          evaluate(
            `(() => {const e=document.activeElement,r=e.getBoundingClientRect(),v=e.closest('.education-viewport-scroll'),b=v.getBoundingClientRect();return {id:e.dataset.target,left:r.left,right:r.right,top:r.top,bottom:r.bottom,regionLeft:b.left,regionRight:b.left+v.clientWidth,regionTop:b.top,regionBottom:b.top+v.clientHeight,localX:v.scrollLeft,localY:v.scrollTop,pageX:scrollX,pageY:scrollY};})()`,
          ),
        );
      const oversized = info.right - info.left > info.regionRight - info.regionLeft - 16;
      check(
        `Tab focus reveal ${ids[index]}`,
        info.id === ids[index] &&
          info.right > info.regionLeft &&
          info.left < info.regionRight &&
          info.top >= info.regionTop - 1 &&
          info.bottom <= info.regionBottom + 1 &&
          (oversized || (info.left >= info.regionLeft - 1 && info.right <= info.regionRight + 1)) &&
          info.pageX === page.pageX &&
          info.pageY === page.pageY,
        { ...info, oversized },
      );
      changed ||= info.localX !== page.left || info.localY !== page.top;
    }
    check("distant SVG targets genuinely scroll the local viewport", changed);
    browser(["press", "Shift+Tab"]);
    check(
      "reverse Tab preserves semantic target order with viewport wrapper",
      evaluate("document.activeElement.dataset.target") === ids.at(-2),
    );
    browser(["press", "Enter"]);
    const previousTarget = z.string().parse(ids.at(-2));
    check("Enter works on focus-revealed target", selectedIDs().includes(previousTarget));
    browser(["press", "Space"]);
    check("Space toggles focus-revealed target", !selectedIDs().includes(previousTarget));
    browser(["press", "Enter"]);
    browser(["press", "Escape"]);
    check("Escape clears without changing viewport permissions", selectedIDs().length === 0);
    health("readable-keyboard-exports");
    browser(["set", "viewport", "1280", "900"]);
  });
  await phase("author-api", async () => {
    const author = authorExample("measurement", "geist-light");
    const envelope = { author, stage: "question", theme: "geist-light" };
    const result = await post("post-author-valid", JSON.stringify(envelope));
    check(
      "authorized POST compiles exact selected public question only",
      result.status === 200 &&
        result.text === JSON.stringify({ document: compiled(author) }) &&
        publicOnly(result.text),
    );
    const sameOrigin = await post("post-author-same-origin", JSON.stringify(envelope), {
      "content-type": "application/json",
      origin: base,
    });
    check(
      "valid same-origin browser-origin POST must be accepted",
      sameOrigin.status === 200 && sameOrigin.text === result.text,
      { status: sameOrigin.status, body: sameOrigin.text, origin: base },
    );
    const poisoned = { ...author, stages: { ...author.stages, correction: null } };
    const nonselected = await post(
      "post-author-malformed-nonselected",
      JSON.stringify({ ...envelope, author: poisoned }),
    );
    check(
      "malformed unselected correction cannot alter question POST",
      nonselected.status === 200 && nonselected.text === result.text,
    );
    const cases: [string, BodyInit, Record<string, string>, number][] = [
      [
        "cross-origin",
        JSON.stringify(envelope),
        { "content-type": "application/json", origin: "http://example.invalid" },
        403,
      ],
      ["media-type", JSON.stringify(envelope), { "content-type": "text/plain" }, 415],
      [
        "unknown-key",
        JSON.stringify({ ...envelope, unexpected: "generic-sentinel" }),
        { "content-type": "application/json" },
        400,
      ],
      ["invalid-json", '{"generic-sentinel":', { "content-type": "application/json" }, 422],
      [
        "selected-invalid",
        JSON.stringify({
          ...envelope,
          author: { ...author, stages: { ...author.stages, question: null } },
        }),
        { "content-type": "application/json" },
        422,
      ],
      [
        "oversized",
        JSON.stringify({ ...envelope, padding: "x".repeat(256 * 1024) }),
        { "content-type": "application/json" },
        413,
      ],
      ["invalid-utf8", new Uint8Array([0xff]), { "content-type": "application/json" }, 422],
      [
        "oversized-stream",
        new ReadableStream<Uint8Array>({
          start(controller) {
            for (let i = 0; i < 3; i++) controller.enqueue(new Uint8Array(128 * 1024).fill(32));
            controller.close();
          },
        }),
        { "content-type": "application/json" },
        413,
      ],
    ];
    for (const [name, body, headers, status] of cases) {
      const failure = await post(`post-author-${name}`, body, headers);
      check(
        `POST ${name}: bounded rejection ${status}, fixed error only`,
        failure.status === status &&
          failure.text === '{"error":"Invalid or unsupported educational figure."}',
        { status: failure.status, text: failure.text },
      );
      check(
        `POST ${name}: no-store/nosniff`,
        failure.headers.get("cache-control") === "no-store" &&
          failure.headers.get("x-content-type-options") === "nosniff",
      );
    }
    const final = await get(
      "/api/education?case=measurement&stage=question",
      "get-after-author-posts",
    );
    check(
      "author compiler POST does not persist into generic public GET",
      final.text === result.text,
    );
  });
  await phase("author-workspace", () => {
    open("/editor/education/author?case=measurement&stage=question&theme=geist-light");
    browser([
      "wait",
      "--fn",
      "document.querySelector('.education-status').textContent==='Selected public projection ready.'||document.querySelector('.education-status').textContent.includes('Invalid author draft')",
    ]);
    const initialized = evaluate(
      "document.querySelector('.education-status').textContent==='Selected public projection ready.'",
      z.boolean(),
    );
    check("valid generic author fixture must initialize successfully in real browser", initialized);
    if (!initialized)
      throw Error(
        "Author initialization rejected on the real same-origin page; author edit/compile/recovery/callback tests remain blocked, not passed.",
      );
    ready();
    check(
      "real author workspace visible with explicit privacy disclaimer",
      evaluate(
        "document.querySelector('[data-workspace]').dataset.workspace==='author'&&document.body.innerText.includes('CSS stage hiding is not protection')&&document.querySelector('.education-source textarea').value.includes('circuitkit.educational.author.v2')",
      ),
    );
    const original = authorExample("measurement", "geist-light");
    check(
      "author browser preview starts from selected question",
      previewMatches(compiled(original)),
    );
    const edited = structuredClone(original);
    edited.stages.question.title = "QA author question";
    edited.stages.question.description = "Generic author browser compile proof";
    fillSource(JSON.stringify(edited));
    browser(["wait", "--fn", "!!document.querySelector('[data-public-preview] [role=alert]')"]);
    check(
      "real author input pauses preview and exports while compilation pending",
      evaluate(
        "!document.querySelector('[data-public-preview] svg')&&[...document.querySelectorAll('fieldset[aria-label=\"Export selected public figure\"] button')].every(b=>b.disabled)",
      ),
    );
    ready();
    check(
      "author input compiles current generic model through POST",
      previewMatches(compiled(edited)),
    );
    const poisoned = { ...edited, stages: { ...edited.stages, correction: null } };
    fillSource(JSON.stringify(poisoned));
    ready();
    check(
      "author UI malformed nonselected correction leaves question geometry unchanged",
      previewMatches(compiled(edited)),
    );
    instrumentExports();
    verifyExports("author-question-selected-public", compiled(edited));
    viewportChecks("author-question-readable", "[data-public-preview]", compiled(edited));
    capture("author-compiled-question");
    fillSource("{");
    browser([
      "wait",
      "--fn",
      "document.querySelector('.education-status').textContent.includes('Invalid author draft')",
    ]);
    check(
      "invalid author JSON pauses old output and disables every export",
      evaluate(
        "!document.querySelector('[data-public-preview] svg')&&[...document.querySelectorAll('fieldset[aria-label=\"Export selected public figure\"] button')].every(b=>b.disabled)",
      ),
    );
    capture("author-invalid-draft");
    fillSource(JSON.stringify(edited));
    ready();
    check("author invalid-draft recovery recompiles normally", previewMatches(compiled(edited)));
    evaluate(
      `(() => {window.__qaOriginalFetch=window.fetch.bind(window);window.__qaPendingAuthor=[];window.__qaAuthorRequests=[];window.fetch=async(...args)=>{const response=await window.__qaOriginalFetch(...args);if(String(args[0]).includes('/api/education')&&args[1]?.method==='POST'){const entry={status:response.status,body:JSON.parse(args[1].body),signal:args[1].signal};window.__qaAuthorRequests.push(entry);const json=response.json.bind(response);response.json=async()=>{const data=await json();return new Promise(resolve=>window.__qaPendingAuthor.push({title:data.document?.title,signal:entry.signal,release:()=>resolve(data)}));}}return response;};})()`,
    );
    const a = structuredClone(edited);
    a.stages.question.title = "QA delayed A";
    const b = structuredClone(edited);
    b.stages.question.title = "QA delayed B";
    fillSource(JSON.stringify(a));
    browser(["wait", "--fn", "window.__qaPendingAuthor.length===1"]);
    fillSource(JSON.stringify(b));
    browser(["wait", "--fn", "window.__qaPendingAuthor.length===2"]);
    evaluate("window.__qaPendingAuthor[1].release()");
    ready();
    check("newer author response compiles B", previewMatches(compiled(b)));
    evaluate("window.__qaPendingAuthor[0].release()");
    evaluate("new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)))");
    check(
      "late real author response A is aborted and cannot replace B",
      previewMatches(compiled(b)) &&
        evaluate(
          "window.__qaPendingAuthor[0].signal.aborted&&window.__qaAuthorRequests.every(r=>r.status===200)",
        ),
    );
    const c = structuredClone(edited);
    c.stages.question.title = "QA delayed before invalid";
    fillSource(JSON.stringify(c));
    browser(["wait", "--fn", "window.__qaPendingAuthor.length===3"]);
    fillSource("{");
    evaluate("window.__qaPendingAuthor[2].release()");
    browser([
      "wait",
      "--fn",
      "document.querySelector('.education-status').textContent.includes('Invalid author draft')",
    ]);
    check(
      "late successful author callback cannot revive invalid input",
      evaluate(
        "window.__qaPendingAuthor[2].signal.aborted&&!document.querySelector('[data-public-preview] svg')&&[...document.querySelectorAll('fieldset[aria-label=\"Export selected public figure\"] button')].every(b=>b.disabled)",
      ),
    );
    save(
      "author-callbacks",
      evaluate(
        "window.__qaAuthorRequests.map(r=>({status:r.status,title:r.body.author.stages.question.title,aborted:r.signal.aborted}))",
      ),
    );
    evaluate("window.fetch=window.__qaOriginalFetch");
    fillSource(JSON.stringify(edited));
    ready();
    evaluate(
      "window.__qaOriginalToBlob=HTMLCanvasElement.prototype.toBlob;window.__qaDelayed=[];HTMLCanvasElement.prototype.toBlob=function(callback,...args){return window.__qaOriginalToBlob.call(this,blob=>window.__qaDelayed.push(()=>callback(blob)),...args)}",
    );
    const downloadCount = z.number().parse(evaluate("window.__qaDownloads.length"));
    button("Download PNG");
    browser(["wait", "--fn", "window.__qaDelayed.length===1"]);
    fillSource("{");
    evaluate("window.__qaDelayed.shift()()");
    browser(["wait", "--fn", "window.__qaBlobs.size===0"]);
    check(
      "author input cancels a late actual PNG callback",
      evaluate(
        `window.__qaDownloads.length===${downloadCount}&&!document.querySelector('[data-public-preview] svg')`,
      ),
    );
    evaluate("HTMLCanvasElement.prototype.toBlob=window.__qaOriginalToBlob");
    button("Reload preset");
    browser(["wait", "--load", "networkidle"]);
    ready();
    check(
      "author reload restores original generic fixture without persistence",
      previewMatches(compiled(original)) &&
        evaluate(
          "JSON.parse(document.querySelector('.education-source textarea').value).stages.question.title",
        ) === original.stages.question.title,
    );
    health("author-workspace");
    audit("author-workspace");
  });
  await phase("late-export-cancellation", () => {
    open("/editor/education?case=measurement");
    ready();
    instrumentExports();
    evaluate(
      "window.__qaOriginalToBlob=HTMLCanvasElement.prototype.toBlob;window.__qaDelayed=[];HTMLCanvasElement.prototype.toBlob=function(callback,...args){return window.__qaOriginalToBlob.call(this,blob=>window.__qaDelayed.push(()=>callback(blob)),...args)}",
    );
    button("Download PNG");
    browser(["wait", "--fn", "window.__qaDelayed.length===1"]);
    fillSource("{");
    evaluate("window.__qaDelayed.shift()()");
    browser(["wait", "--fn", "window.__qaBlobs.size===0"]);
    check(
      "late PNG callback after invalid draft cannot download or revive preview",
      evaluate(
        "window.__qaDownloads.length===0&&!document.querySelector('[data-public-preview] svg')&&[...document.querySelectorAll('fieldset button')].every(b=>b.disabled)",
      ),
    );
    button("Reload preset");
    ready();
    button("Download PNG");
    browser(["wait", "--fn", "window.__qaDelayed.length===1"]);
    select("Stage", "correction");
    evaluate("window.__qaDelayed.shift()()");
    browser(["wait", "--fn", "window.__qaBlobs.size===0"]);
    check(
      "late PNG after stage change cancelled, new public stage retained",
      evaluate("window.__qaDownloads.length===0") &&
        JSON.stringify(source()) ===
          JSON.stringify(
            publicExample({ case: "measurement", stage: "correction", theme: "geist-light" }),
          ),
    );
    evaluate("HTMLCanvasElement.prototype.toBlob=window.__qaOriginalToBlob");
    exported("png");
    check("PNG works after cancellation recovery", evaluate("window.__qaDownloads.length===1"));
    health("cancellation");
  });
  await phase("gallery-stage-theme-matrix", () => {
    for (const stage of stages)
      for (const t of themes) {
        open(`/gallery/education?case=named-nets&stage=${stage}&theme=${t}`);
        const name = `gallery-${stage}-${t}`;
        check(
          `${name}: all 17 cases and 18 adapter families loaded`,
          evaluate(
            `document.querySelectorAll('[data-family]').length===17&&new Set([...document.querySelectorAll('[data-family]')].map(e=>e.dataset.family)).size===12&&document.querySelectorAll('[data-adapter-family]').length===18&&document.querySelectorAll('.education-canvas svg').length===34&&!!document.querySelector('[data-adapter-family=record] table')`,
          ),
        );
        check(
          `${name}: every projection labelled chosen stage/theme`,
          evaluate(
            `[...document.querySelectorAll('.education-card-heading')].every(e=>e.textContent.includes(${JSON.stringify(stage)})&&e.textContent.includes(${JSON.stringify(t.replace("geist-", ""))}))`,
          ),
        );
        layout(name);
        health(name);
      }
    browser(["select", "#gallery-stage", "question"]);
    browser(["select", "#gallery-theme", "geist-dark"]);
    button("Apply to all examples");
    browser(["wait", "--load", "networkidle"]);
    check(
      "gallery native form applies stage/theme, retains selected case",
      evaluate(
        "location.search.includes('stage=question')&&location.search.includes('theme=geist-dark')&&location.search.includes('case=named-nets')&&document.querySelector('[data-selected=true] h3').textContent==='Explicit whole-net targets'",
      ),
    );
  });
  await phase("responsive-screenshots", () => {
    for (const width of [1280, 390, 320])
      for (const mode of ["light", "dark"]) {
        browser(["set", "viewport", String(width), "900"]);
        open("/");
        ready();
        theme(mode);
        capture(`landing-${width}-${mode}`);
        layout(`landing-${width}-${mode}`);
        browser(["scrollintoview", "[data-education-workbench]"]);
        capture(`landing-live-${width}-${mode}`);
        select("Family", "electrical");
        select("Case", "named-nets");
        select("Stage", "teaching");
        if (width === 320) {
          caseNameCheck(`landing-${width}-${mode}`);
          figureViews("[data-education-workbench]", `landing-${width}-${mode}`);
        }
        button("Select targets");
        check(
          `mobile-safe live controls ${width}/${mode} update state`,
          evaluate("!!document.querySelector('[data-target=\"circuit/net/supply\"][role=button]')"),
        );
        open(`/editor/education?case=named-nets&stage=teaching&theme=geist-${mode}`);
        ready();
        capture(`editor-${width}-${mode}`);
        layout(`editor-${width}-${mode}`);
        if (width === 320) caseNameCheck(`editor-${width}-${mode}`);
        figureViews("[data-public-preview]", `editor-${width}-${mode}`);
        button("Select targets");
        browser(["scrollintoview", '[data-target="circuit/net/supply"]']);
        browser(["focus", '[data-target="circuit/net/supply"]']);
        browser(["press", "Space"]);
        check(
          `keyboard net selection ${width}/${mode}`,
          selectedIDs().includes("circuit/net/supply"),
        );
        captureElement(".education-output", `editor-output-${width}-${mode}-readable-window`);
        if (width === 320) audit(`editor-320-${mode}`);
        open(`/gallery/education?stage=question&theme=geist-${mode}`);
        capture(`gallery-${width}-${mode}`);
        layout(`gallery-${width}-${mode}`);
        if (width === 1280) {
          for (const entry of examples)
            figureViews(
              `.education-card[data-family]:has(a[href*="case=${entry.id}&"])`,
              `native-${entry.id}-${mode}`,
            );
          for (const family of adapterFamilies)
            figureViews(`[data-adapter-family="${family}"]`, `adapter-${family}-${mode}`);
        }
        if (width === 320) {
          for (const family of [
            "breadboard",
            "readings",
            "board",
            "record",
            "led",
            "pullup",
            "divider",
          ])
            figureViews(`[data-adapter-family="${family}"]`, `adapter-${family}-320-${mode}`);
          audit(`gallery-320-${mode}`);
        }
        health(`responsive-${width}-${mode}`);
      }
  });
  await phase("local-comparison", async () => {
    for (const [enabled, url, accepted] of [
      [undefined, "http://127.0.0.1:3231/results", false],
      ["1", undefined, false],
      ["0", "http://127.0.0.1:3231/results", false],
      ["1", "http://127.0.0.1:3231/results", true],
      ["1", "http://localhost:3231/results", true],
      ["1", "http://[::1]:3231/results", true],
      ["1", "https://127.0.0.1:3231/results", false],
      ["1", "http://example.com/results", false],
      ["1", "http://user:pass@127.0.0.1:3231/results", false],
    ] as const)
      check(
        `local link gate ${enabled}/${url}`,
        Boolean(localComparisonURL(enabled, url)) === accepted,
      );
    open("/gallery/education/local");
    const link = evaluate(
      "document.querySelector('a[href^=\"http://127.0.0.1:\"]')?.getAttribute('href')??null",
      z.string().nullable(),
    );
    const text = evaluate("document.body.innerText", z.string());
    check(
      "local comparison disclaims bundled corpus and inferred acceptance",
      text.includes("private corpus is not bundled") &&
        text.includes("separate isolated local consumer") &&
        text.includes("no green coverage badge"),
    );
    check(
      "local comparison link is loopback only or clearly unconfigured",
      link
        ? new URL(link).hostname === "127.0.0.1" && new URL(link).protocol === "http:"
        : text.includes("Local comparison is not configured"),
      { link, availability: "Not requested. Port 3231 worker may not be ready." },
    );
    capture("local-comparison-link-only");
    health("local-comparison");
  });
  await phase("visual-reopen", () => {
    for (const mode of ["light", "dark"]) {
      for (const width of [1280, 320]) {
        open(`/editor/education?case=named-nets&stage=correction&theme=geist-${mode}`);
        ready();
        browser(["set", "viewport", String(width), "900"]);
        theme(mode);
        figureViews("[data-public-preview]", `correction-editor-${width}-${mode}`);
        check(`correction ${width}/${mode}: current canonical preview`, previewMatches(source()));
      }
      open(`/gallery/education?stage=question&theme=geist-${mode}`);
      browser(["set", "viewport", "390", "900"]);
      theme(mode);
      for (const family of ["board", "breadboard"])
        figureViews(`[data-adapter-family="${family}"]`, `adapter-${family}-390-${mode}`);
      health(`visual-reopen-${mode}`);
    }
    open("/editor/education?case=composed&stage=teaching&theme=geist-dark");
    ready();
    browser(["set", "viewport", "320", "640"]);
    theme("dark");
    figureViews("[data-public-preview]", "composed-keyboard-320-dark");
    health("visual-reopen-composed");
  });
  await phase("orientation", () => {
    for (const [name, path] of [
      ["landing", "/"],
      ["editor", "/editor/education?case=named-nets&stage=teaching"],
      ["gallery", "/gallery/education"],
    ] as const) {
      open(path);
      capture(`orientation-${name}`);
      save(
        `orientation-${name}-dom`,
        evaluate(
          "({text:document.body.innerText,selects:[...document.querySelectorAll('select')].map(e=>({id:e.id,labels:[...e.labels].map(l=>l.textContent),value:e.value})),svg:document.querySelector('[data-educational-namespace]')?.outerHTML.slice(0,4000)})",
        ),
      );
      runtime.push({ name, errors: browser(["errors"]), console: browser(["console"]) });
    }
  });
} finally {
  save("runtime", runtime);
  save("audits", audits);
  const closed = browser(["close"]);
  save("summary", {
    base,
    runId,
    session,
    output,
    scope: visualOnly ? "visual-reopen-only" : "full",
    checks,
    failures,
    closed,
  });
  writeFileSync(
    visualOnly
      ? "artifacts/education-web-qa/latest-visual.json"
      : "artifacts/education-web-qa/latest.json",
    JSON.stringify({ output, runId }, null, 2),
  );
  console.log(JSON.stringify({ output, checks: checks.length, failures: failures.length, closed }));
}
process.exitCode = failures.length || checks.some((check) => !check.ok) ? 1 : 0;
