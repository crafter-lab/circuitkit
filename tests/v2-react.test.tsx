import { describe, expect, test } from "bun:test";
import { renderToStaticMarkup, renderToString } from "react-dom/server";
import { educationFixtures, privacyFixture } from "../src/v2/fixtures.ts";
import { projectFigure } from "../src/v2/index.ts";
import { EducationalFigure, type EducationalFigureProps } from "../src/v2/react.tsx";
import { inspectEducational, renderEducationalSVG, targetDOMId } from "../src/v2/render.ts";
import type { PublicFigure } from "../src/v2/schema.ts";

function publicDocument(): PublicFigure {
  return {
    schema: "circuitkit.educational.public.v2",
    id: "exercise",
    title: "Read the public figure",
    description: "Only the visible question is available.",
    theme: "geist-light",
    display: [
      {
        id: "circuit/terminal/a",
        shapes: [
          {
            kind: "circle",
            at: { x: 20, y: 20 },
            radius: 8,
            tone: "ink",
            fill: "background",
            stroke: 2,
          },
        ],
      },
      {
        id: "meter/probe/positive",
        shapes: [
          {
            kind: "line",
            points: [
              { x: 40, y: 20 },
              { x: 90, y: 20 },
            ],
            tone: "positive",
            width: 2,
            dashed: false,
          },
        ],
      },
      {
        id: "meter/reading",
        shapes: [
          {
            kind: "math",
            at: { x: 110, y: 26 },
            runs: [{ text: "? V", script: "base" }],
            size: 18,
            align: "left",
            family: "sans",
            tone: "ink",
          },
        ],
      },
      {
        id: "visible/not-allowed",
        shapes: [
          {
            kind: "rect",
            at: { x: 10, y: 45 },
            width: 140,
            height: 10,
            radius: 2,
            tone: "muted",
            fill: "background",
            stroke: 1,
          },
        ],
      },
    ],
    targets: [
      { id: "circuit/terminal/a", label: "Terminal A", role: "terminal" },
      { id: "meter/probe/positive", label: "Positive probe", role: "probe" },
      { id: "meter/reading", label: "Meter display", role: "reading" },
    ],
  };
}

function netDocument(): PublicFigure {
  return {
    ...publicDocument(),
    id: "net-exercise",
    title: "Public supply node",
    display: [
      {
        id: "circuit/terminal/a",
        shapes: [
          { kind: "circle", at: { x: 10, y: 10 }, radius: 4, tone: "ink", fill: "ink", stroke: 2 },
        ],
      },
      {
        id: "circuit/terminal/b",
        shapes: [
          {
            kind: "circle",
            at: { x: 150, y: 100 },
            radius: 4,
            tone: "ink",
            fill: "background",
            stroke: 2,
          },
        ],
      },
      {
        id: "circuit/route/top",
        shapes: [
          {
            kind: "line",
            points: [
              { x: 10, y: 10 },
              { x: 150, y: 10 },
              { x: 150, y: 100 },
            ],
            tone: "ink",
            width: 2,
            dashed: false,
          },
        ],
      },
      {
        id: "circuit/component/bridge",
        shapes: [
          {
            kind: "line",
            points: [
              { x: 150, y: 100 },
              { x: 150, y: 130 },
            ],
            tone: "ink",
            width: 2,
            dashed: false,
          },
        ],
      },
      {
        id: "circuit/route/open",
        shapes: [
          {
            kind: "line",
            points: [
              { x: 20, y: 40 },
              { x: 40, y: 40 },
            ],
            tone: "ink",
            width: 2,
            dashed: false,
          },
          {
            kind: "line",
            points: [
              { x: 60, y: 40 },
              { x: 80, y: 40 },
            ],
            tone: "ink",
            width: 2,
            dashed: false,
          },
        ],
      },
      {
        id: "other/component/load",
        shapes: [
          {
            kind: "rect",
            at: { x: 70, y: 50 },
            width: 20,
            height: 20,
            radius: 2,
            tone: "ink",
            fill: "background",
            stroke: 2,
          },
        ],
      },
    ],
    targets: [
      { id: "other/component/load", role: "component", label: "Unrelated component" },
      { id: "circuit/terminal/a", role: "terminal", label: "Supply terminal" },
      {
        id: "circuit/net/supply",
        role: "net",
        kind: "group",
        label: "Supply node",
        members: [
          "circuit/terminal/a",
          "circuit/terminal/b",
          "circuit/route/top",
          "circuit/component/bridge",
        ],
      },
    ],
  };
}

const consumerDividerId = "figure:9b44280001e18ea9255a99e04d479bb52a40c9ef0713c984a8add13a35868b22";

function consumerDividerDocument(): PublicFigure {
  return JSON.parse(`{
    "schema":"circuitkit.educational.public.v2","id":"gallery","title":"Gradual divider","description":"","theme":"geist-light",
    "display":[
      {"id":"gallery/route/middle-top","shapes":[{"kind":"line","points":[{"x":360,"y":180},{"x":360,"y":220}],"tone":"ink","width":2,"dashed":false}]},
      {"id":"gallery/route/middle-bottom","shapes":[{"kind":"line","points":[{"x":360,"y":220},{"x":360,"y":260}],"tone":"ink","width":2,"dashed":false}]},
      {"id":"gallery/route/bottom","shapes":[{"kind":"line","points":[{"x":360,"y":360},{"x":360,"y":420}],"tone":"ink","width":2,"dashed":false}]},
      {"id":"gallery/route/supply","shapes":[{"kind":"line","points":[{"x":0,"y":90},{"x":0,"y":0},{"x":360,"y":0}],"tone":"ink","width":2,"dashed":false}]},
      {"id":"gallery/route/top","shapes":[{"kind":"line","points":[{"x":360,"y":0},{"x":360,"y":60}],"tone":"ink","width":2,"dashed":false}]},
      {"id":"gallery/route/return","shapes":[{"kind":"line","points":[{"x":360,"y":420},{"x":0,"y":420},{"x":0,"y":270}],"tone":"ink","width":2,"dashed":false}]},
      {"id":"gallery/component/lower","shapes":[{"kind":"line","points":[{"x":360,"y":260},{"x":360,"y":294}],"tone":"ink","width":2,"dashed":false},{"kind":"line","points":[{"x":360,"y":326},{"x":360,"y":360}],"tone":"ink","width":2,"dashed":false},{"kind":"polygon","points":[{"x":369,"y":294},{"x":369,"y":326},{"x":351,"y":326},{"x":351,"y":294}],"tone":"ink","fill":"background","width":2}]},
      {"id":"gallery/label/lower","shapes":[{"kind":"math","at":{"x":328,"y":313.332},"runs":[{"text":"R","script":"base"},{"text":"2","script":"sub"},{"text":" · Measured R2","script":"base"}],"size":14,"align":"right","family":"sans","tone":"ink"}]},
      {"id":"gallery/component/source","shapes":[{"kind":"line","points":[{"x":0,"y":90},{"x":0,"y":164}],"tone":"ink","width":2,"dashed":false},{"kind":"line","points":[{"x":0,"y":196},{"x":0,"y":270}],"tone":"ink","width":2,"dashed":false},{"kind":"circle","at":{"x":0,"y":180},"radius":16,"tone":"ink","fill":"background","stroke":2},{"kind":"line","points":[{"x":0,"y":170},{"x":0,"y":176}],"tone":"ink","width":2,"dashed":false},{"kind":"line","points":[{"x":3,"y":173},{"x":-3,"y":173}],"tone":"ink","width":2,"dashed":false},{"kind":"line","points":[{"x":0,"y":184},{"x":0,"y":190}],"tone":"ink","width":2,"dashed":false}]},
      {"id":"gallery/label/source","shapes":[{"kind":"math","at":{"x":32,"y":184.886},"runs":[{"text":"Measured Vs","script":"base"}],"size":14,"align":"left","family":"sans","tone":"ink"}]},
      {"id":"gallery/component/upper","shapes":[{"kind":"line","points":[{"x":360,"y":60},{"x":360,"y":104}],"tone":"ink","width":2,"dashed":false},{"kind":"line","points":[{"x":360,"y":136},{"x":360,"y":180}],"tone":"ink","width":2,"dashed":false},{"kind":"polygon","points":[{"x":369,"y":104},{"x":369,"y":136},{"x":351,"y":136},{"x":351,"y":104}],"tone":"ink","fill":"background","width":2}]},
      {"id":"gallery/label/upper","shapes":[{"kind":"math","at":{"x":328,"y":123.22},"runs":[{"text":"R","script":"base"},{"text":"1","script":"sub"},{"text":" · Measured R1","script":"base"}],"size":14,"align":"right","family":"sans","tone":"ink"}]},
      {"id":"gallery/terminal/source-positive","shapes":[{"kind":"circle","at":{"x":0,"y":90},"radius":3,"tone":"ink","fill":"ink","stroke":2}]},
      {"id":"gallery/terminal/source-negative","shapes":[{"kind":"circle","at":{"x":0,"y":270},"radius":3,"tone":"ink","fill":"ink","stroke":2}]},
      {"id":"gallery/terminal/A","shapes":[{"kind":"circle","at":{"x":360,"y":0},"radius":3,"tone":"ink","fill":"ink","stroke":2}]},
      {"id":"gallery/terminal-label/A","shapes":[{"kind":"math","at":{"x":376,"y":4.97},"runs":[{"text":"A","script":"base"}],"size":14,"align":"left","family":"sans","tone":"ink"}]},
      {"id":"gallery/terminal/upper-positive","shapes":[{"kind":"circle","at":{"x":360,"y":60},"radius":3,"tone":"ink","fill":"ink","stroke":2}]},
      {"id":"gallery/terminal/upper-negative","shapes":[{"kind":"circle","at":{"x":360,"y":180},"radius":3,"tone":"ink","fill":"ink","stroke":2}]},
      {"id":"gallery/terminal/C","shapes":[{"kind":"circle","at":{"x":360,"y":420},"radius":3,"tone":"ink","fill":"ink","stroke":2}]},
      {"id":"gallery/terminal-label/C","shapes":[{"kind":"math","at":{"x":344,"y":406.96999999999997},"runs":[{"text":"C","script":"base"}],"size":14,"align":"right","family":"sans","tone":"ink"}]},
      {"id":"gallery/terminal/B","shapes":[{"kind":"circle","at":{"x":360,"y":220},"radius":3,"tone":"ink","fill":"ink","stroke":2}]},
      {"id":"gallery/terminal-label/B","shapes":[{"kind":"math","at":{"x":344,"y":224.97},"runs":[{"text":"B","script":"base"}],"size":14,"align":"right","family":"sans","tone":"ink"}]},
      {"id":"gallery/terminal/lower-positive","shapes":[{"kind":"circle","at":{"x":360,"y":260},"radius":3,"tone":"ink","fill":"ink","stroke":2}]},
      {"id":"gallery/terminal/lower-negative","shapes":[{"kind":"circle","at":{"x":360,"y":360},"radius":3,"tone":"ink","fill":"ink","stroke":2}]},
      {"id":"gallery-meter/body","shapes":[{"kind":"rect","at":{"x":540,"y":240},"width":140,"height":80,"radius":3,"tone":"ink","fill":"background","stroke":2},{"kind":"math","at":{"x":610,"y":262},"runs":[{"text":"DC V","script":"base"}],"size":14,"align":"center","family":"sans","tone":"ink"},{"kind":"math","at":{"x":560,"y":310},"runs":[{"text":"V","script":"base"}],"size":12,"align":"center","family":"sans","tone":"ink"},{"kind":"math","at":{"x":660,"y":310},"runs":[{"text":"COM","script":"base"}],"size":12,"align":"center","family":"sans","tone":"ink"}]},
      {"id":"gallery-meter/reading","shapes":[{"kind":"math","at":{"x":610,"y":286},"runs":[{"text":"?","script":"base"},{"text":" V","script":"base"}],"size":18,"align":"center","family":"sans","tone":"ink"}]},
      {"id":"gallery-meter/probe/positive","shapes":[{"kind":"line","points":[{"x":360,"y":220},{"x":510,"y":120},{"x":510,"y":340},{"x":560,"y":320}],"tone":"positive","width":2,"dashed":false},{"kind":"circle","at":{"x":360,"y":220},"radius":5,"tone":"positive","fill":"background","stroke":2}]},
      {"id":"gallery-meter/probe/negative","shapes":[{"kind":"line","points":[{"x":360,"y":420},{"x":530,"y":280},{"x":530,"y":360},{"x":660,"y":320}],"tone":"negative","width":2,"dashed":false},{"kind":"circle","at":{"x":360,"y":420},"radius":5,"tone":"negative","fill":"background","stroke":2}]},
      {"id":"gallery/host/hint-middle-top","shapes":[{"kind":"line","points":[{"x":360,"y":180},{"x":360,"y":220}],"tone":"positive","width":2,"dashed":false}]},
      {"id":"gallery/host/hint-middle-bottom","shapes":[{"kind":"line","points":[{"x":360,"y":220},{"x":360,"y":260}],"tone":"positive","width":2,"dashed":false}]},
      {"id":"gallery/host/hint-bottom","shapes":[{"kind":"line","points":[{"x":360,"y":360},{"x":360,"y":420}],"tone":"negative","width":2,"dashed":false}]},
      {"id":"gallery/host/hint-supply","shapes":[{"kind":"line","points":[{"x":0,"y":90},{"x":0,"y":0},{"x":360,"y":0}],"tone":"accent","width":2,"dashed":false}]},
      {"id":"gallery/host/hint-top","shapes":[{"kind":"line","points":[{"x":360,"y":0},{"x":360,"y":60}],"tone":"accent","width":2,"dashed":false}]},
      {"id":"gallery/host/hint-return","shapes":[{"kind":"line","points":[{"x":360,"y":420},{"x":0,"y":420},{"x":0,"y":270}],"tone":"negative","width":2,"dashed":false}]}
    ],
    "targets":[
      {"id":"gallery/terminal/A","label":"gallery/terminal/A","role":"terminal"},
      {"id":"gallery/terminal/B","label":"gallery/terminal/B","role":"terminal"},
      {"id":"gallery/terminal/C","label":"gallery/terminal/C","role":"terminal"},
      {"id":"gallery-meter/probe/positive","label":"gallery-meter/probe/positive","role":"probe"},
      {"id":"gallery-meter/probe/negative","label":"gallery-meter/probe/negative","role":"probe"}
    ]
  }`);
}

function embeddedSVG(markup: string) {
  const href = markup.match(/<image href="data:image\/svg\+xml,([^"]+)"/)?.[1];
  expect(href).toBeDefined();
  return decodeURIComponent(href ?? "");
}

function ids(markup: string) {
  return Array.from(markup.matchAll(/\sid="([^"]+)"/g), (match) => match[1]);
}

function freeze<T>(value: T): T {
  if (value && typeof value === "object") {
    for (const child of Object.values(value)) freeze(child);
    Object.freeze(value);
  }
  return value;
}

const noop = () => {};

const browserHarness = `
import { useEffect, useState } from "react";
import { hydrateRoot } from "react-dom/client";
import { EducationalFigure } from "./src/v2/react.tsx";
import { renderEducationalSVG } from "./src/v2/render.ts";
const doc = window.publicDocument;
const net = window.netDocument;
const divider = window.consumerDivider;
const gap = { ...net, targets: [{ id: "circuit/route/open", role: "route", label: "Open route" }] };
function freeze(value) {
  if (value && typeof value === "object") {
    Object.values(value).forEach(freeze);
    Object.freeze(value);
  }
}
freeze(doc);
freeze(net);
freeze(divider);
freeze(gap);
const empty = { ...doc, display: [], targets: [] };
freeze(empty);
const probe = window.probe = {
  initialIds: Array.from(document.querySelectorAll("[id]"), node => node.id),
  errors: [], reports: [], notificationVersions: [], renders: 0, calls: [], ready: false,
  original: JSON.stringify(doc), doc, empty, net, netOriginal: JSON.stringify(net), netCalls: [],
  exportSVG: () => renderEducationalSVG(doc),
  netExportSVG: () => renderEducationalSVG(net, { namespace: "same" }),
  divider, dividerOriginal: JSON.stringify(divider), dividerCalls: [], gapCalls: [],
  dividerExport: () => renderEducationalSVG(divider, { namespace: "consumer" }),
};
const originalError = console.error;
console.error = (...args) => { probe.errors.push(args.map(String).join(" ")); originalError(...args); };
function ConsumerViewport({ className, selectedTargets, onSelectionChange }) {
  const reveal = (start, end, visibleStart, visibleEnd) => start < visibleStart ? start - visibleStart : end > visibleEnd ? Math.min(start - visibleStart, end - visibleEnd) : 0;
  return <div className={className} style={{ maxWidth: "100%", overflow: "auto", maxHeight: 480 }} onFocusCapture={event => {
    const target = event.target.closest('[data-target]');
    if (!target) return;
    const region = event.currentTarget;
    const box = target.getBoundingClientRect();
    const view = region.getBoundingClientRect();
    region.scrollBy({ left: reveal(box.left, box.right, view.left + 8, view.left + region.clientWidth - 8), top: reveal(box.top, box.bottom, view.top + 8, view.top + region.clientHeight - 8), behavior: 'auto' });
  }}><div style={{ width: 702 }}><EducationalFigure document={divider} namespace="consumer" selectedTargets={selectedTargets} onSelectionChange={onSelectionChange} /></div></div>;
}
function Harness() {
  const [current, setDocument] = useState(doc);
  const [selected, setSelected] = useState([]);
  const [second, setSecond] = useState([]);
  const [diagnostics, setDiagnostics] = useState(null);
  const [callbackVersion, setCallbackVersion] = useState(0);
  const [caption, setCaption] = useState(null);
  const [netSelected, setNetSelected] = useState([]);
  const [otherNetSelected, setOtherNetSelected] = useState([]);
  const [dividerSelected, setDividerSelected] = useState([]);
  const [secondDividerSelected, setSecondDividerSelected] = useState([]);
  const [gapSelected, setGapSelected] = useState([]);
  probe.dividerSelected = [dividerSelected, secondDividerSelected];
  probe.dividerIdentity = divider === probe.divider && JSON.stringify(divider) === probe.dividerOriginal;
  probe.netIdentity = net === probe.net && JSON.stringify(net) === probe.netOriginal;
  probe.setDocument = setDocument;
  probe.select = setSelected;
  probe.changeCallback = setCallbackVersion;
  probe.callbackVersion = callbackVersion;
  probe.diagnostics = diagnostics;
  probe.showCaption = () => setCaption(<span>Only host caption</span>);
  probe.renders++;
  probe.identity = current === doc && JSON.stringify(doc) === probe.original;
  const change = ids => { probe.calls.push(ids); setSelected(ids); };
  useEffect(() => { probe.ready = true; }, []);
  return <>
    <EducationalFigure document={current} namespace="same" className="first" caption={caption} selectedTargets={selected} onSelectionChange={change} onDiagnostics={diagnostics => {
      probe.reports.push(diagnostics);
      probe.notificationVersions.push(callbackVersion);
      if (probe.reports.length > 20) throw new Error("Diagnostics notification loop");
      setDiagnostics(diagnostics);
    }} />
    <EducationalFigure document={doc} namespace="same" className="second" selectedTargets={second} onSelectionChange={setSecond} />
    <EducationalFigure document={doc} namespace="same" className="controlled" onSelectionChange={ids => probe.calls.push(ids)} />
    <EducationalFigure document={empty} className="empty-initial" caption={<span>Empty host caption</span>} />
    <EducationalFigure document={net} namespace="same" className="net-first" selectedTargets={netSelected} onSelectionChange={ids => { probe.netCalls.push(ids); setNetSelected(ids); }} />
    <EducationalFigure document={net} namespace="same" className="net-second" selectedTargets={otherNetSelected} onSelectionChange={setOtherNetSelected} />
    <ConsumerViewport className="consumer-first" selectedTargets={dividerSelected} onSelectionChange={ids => { probe.dividerCalls.push(ids); setDividerSelected(ids); }} />
    <ConsumerViewport className="consumer-second" selectedTargets={secondDividerSelected} onSelectionChange={setSecondDividerSelected} />
    <EducationalFigure document={gap} className="wire-gap" selectedTargets={gapSelected} onSelectionChange={ids => { probe.gapCalls.push(ids); setGapSelected(ids); }} />
  </>;
}
hydrateRoot(document.getElementById("root"), <Harness />, {
  identifierPrefix: "browser-root:",
  onRecoverableError: error => probe.errors.push(String(error)),
});
`;

describe("EducationalFigure public-only SVG adapter", () => {
  test("responsive minimal SVG embeds exact core bytes, with no HTML injection or lesson UI", () => {
    const document = publicDocument();
    const result = renderEducationalSVG(document);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const markup = renderToStaticMarkup(
      <EducationalFigure document={document} className="minimal" />,
    );
    expect(embeddedSVG(markup)).toBe(result.svg);
    expect(markup).toContain('class="minimal"');
    expect(markup).toContain('style="display:block;max-width:100%;height:auto"');
    expect(markup).toContain('role="img"');
    expect(markup).not.toMatch(
      /<button|<figcaption|<details|<foreignObject|<script|tabindex="0"|padding:|min-height:/,
    );
    expect(markup).toContain("? V");
  });

  for (const author of Object.values(educationFixtures())) {
    test(`${author.id}: every public stage and theme preserves core vectors and bounds`, () => {
      for (const stage of ["teaching", "question", "correction"] as const) {
        const projected = projectFigure(author, stage);
        expect(projected.ok).toBe(true);
        if (!projected.ok) continue;
        for (const theme of ["geist-light", "geist-dark", "geist-print"] as const) {
          const document = { ...projected.document, theme };
          const result = renderEducationalSVG(document, { namespace: "host" });
          expect(result.ok).toBe(true);
          if (!result.ok) continue;
          const markup = renderToStaticMarkup(
            <EducationalFigure document={document} namespace="host" />,
          );
          expect(embeddedSVG(markup)).toBe(result.svg);
          expect(markup.match(/viewBox="([^"]+)"/)?.[1]).toBe(
            result.svg.match(/viewBox="([^"]+)"/)?.[1],
          );
          expect(Array.from(markup.matchAll(/data-target="([^"]+)"/g), (m) => m[1])).toEqual(
            result.targets.map((target) => target.id),
          );
        }
      }
    });
  }

  test("only manifest targets become buttons, including actual probes but never inferred nets", () => {
    const document = publicDocument();
    const markup = renderToStaticMarkup(
      <EducationalFigure document={document} onSelectionChange={noop} />,
    );
    const namespace = markup.match(/data-educational-namespace="([^"]+)"/)?.[1] ?? "";
    expect(markup).toContain('role="group"');
    expect(markup.match(/role="button"/g)).toHaveLength(3);
    expect(markup.match(/tabindex="0"/g)).toHaveLength(3);
    for (const target of document.targets) {
      expect(markup).toContain(`id="${targetDOMId(namespace, target.id)}"`);
      expect(markup).toContain(`aria-label="${target.label}"`);
    }
    expect(markup).not.toContain('data-target="visible/not-allowed"');
    expect(markup).not.toContain('data-target="net');
    expect(markup).toContain("Escape clears selection.");
  });

  test("valid empty documents render nothing or only the host caption, never a zero viewBox", () => {
    const document = freeze({ ...publicDocument(), display: [], targets: [] });
    const result = renderEducationalSVG(document);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.svg).toBe("");
    expect(result.bounds).toEqual({ x: 0, y: 0, width: 0, height: 0 });
    expect(result.diagnostics).toEqual([]);
    const received: unknown[] = [];
    expect(
      renderToStaticMarkup(
        <EducationalFigure
          document={document}
          selectedTargets={["meter/reading"]}
          onSelectionChange={noop}
          onDiagnostics={(diagnostics) => received.push(diagnostics)}
        />,
      ),
    ).toBe("");
    expect(received).toEqual([]);
    const markup = renderToStaticMarkup(
      <EducationalFigure
        document={document}
        className="empty"
        caption={<span>Host caption</span>}
      />,
    );
    expect(markup).toBe(
      '<figure class="empty" style="margin:0;min-width:0;max-width:100%"><figcaption><span>Host caption</span></figcaption></figure>',
    );
    expect(markup).not.toMatch(/<svg|<image|viewBox|data:image|role="alert"|data-target|tabindex/);
    expect(renderToStaticMarkup(<EducationalFigure document={document} caption={0} />)).toContain(
      "<figcaption>0</figcaption>",
    );
    expect(
      renderToStaticMarkup(<EducationalFigure document={{ ...publicDocument(), display: [] }} />),
    ).toContain('role="alert"');
  });

  test("the installed consumer divider keeps five controls but probes use paths and contacts have a priority hit layer", () => {
    const document = freeze(consumerDividerDocument());
    const core = renderEducationalSVG(document, { namespace: "consumer" });
    expect(core.ok).toBe(true);
    if (!core.ok) return;
    expect(consumerDividerId).toContain("9b44280001e18ea9255a99e04d479bb52");
    expect(core.bounds).toEqual({ x: -19, y: -6.97, width: 702, height: 434.97 });
    expect(core.targets.find((target) => target.id === "gallery/terminal/B")?.bounds).toEqual({
      x: 356,
      y: 216,
      width: 8,
      height: 8,
    });
    const markup = renderToStaticMarkup(
      <EducationalFigure
        document={document}
        namespace="consumer"
        selectedTargets={["gallery-meter/probe/positive"]}
        onSelectionChange={noop}
      />,
    );
    expect(embeddedSVG(markup)).toBe(core.svg);
    expect(Array.from(markup.matchAll(/data-target="([^"]+)"/g), (match) => match[1])).toEqual(
      document.targets.map((target) => target.id),
    );
    expect(markup.match(/tabindex="0"/g)).toHaveLength(5);
    expect(markup.match(/role="button"/g)).toHaveLength(5);
    expect(markup.match(/data-hit-target=/g)).toHaveLength(3);
    expect(markup).toContain('data-hit-target="gallery/terminal/B"');
    const overlays = markup.slice(markup.indexOf("</image>") + 8);
    expect(overlays).toContain('d="M360 220L510 120L510 340L560 320"');
    expect(overlays).not.toContain('<rect x="354" y="119" width="207" height="222"');
    expect(markup.indexOf('data-contact-hits="true"')).toBeGreaterThan(
      markup.indexOf('data-target="gallery-meter/probe/negative"'),
    );
  });

  test("all wire-like individual roles retain their paths and disconnected gaps", () => {
    for (const role of ["route", "probe", "trace", "axis", "edge", "component"] as const) {
      const document = netDocument();
      document.targets = [{ id: "circuit/route/open", label: "Disconnected segments", role }];
      const markup = renderToStaticMarkup(
        <EducationalFigure
          document={document}
          selectedTargets={["circuit/route/open"]}
          onSelectionChange={noop}
        />,
      );
      const overlay = markup.slice(markup.indexOf('data-target="circuit/route/open"'));
      expect(overlay).toContain('d="M20 40L40 40"');
      expect(overlay).toContain('d="M60 40L80 40"');
      expect(overlay).not.toMatch(/<rect|L40 40L60 40/);
    }
  });

  test("contact hit layers prioritize the smallest geometry without reordering keyboard targets", () => {
    const document = publicDocument();
    document.display.push({
      id: "large/contact",
      shapes: [
        {
          kind: "circle",
          at: { x: 20, y: 20 },
          radius: 16,
          tone: "ink",
          fill: "background",
          stroke: 2,
        },
      ],
    });
    document.targets.push({ id: "large/contact", label: "Larger contact", role: "contact" });
    const markup = renderToStaticMarkup(
      <EducationalFigure document={document} onSelectionChange={noop} />,
    );
    expect(Array.from(markup.matchAll(/data-target="([^"]+)"/g), (match) => match[1])).toEqual(
      document.targets.map((target) => target.id),
    );
    expect(Array.from(markup.matchAll(/data-hit-target="([^"]+)"/g), (match) => match[1])).toEqual([
      "large/contact",
      "circuit/terminal/a",
    ]);
  });

  test("net groups highlight only explicit member geometry and remain one keyboard target", () => {
    const document = freeze(netDocument());
    const before = JSON.stringify(document);
    const core = renderEducationalSVG(document);
    expect(core.ok).toBe(true);
    if (!core.ok) return;
    const markup = renderToStaticMarkup(
      <EducationalFigure
        document={document}
        selectedTargets={["circuit/net/supply"]}
        onSelectionChange={noop}
      />,
    );
    expect(embeddedSVG(markup)).toBe(core.svg);
    expect(markup.match(/role="button"/g)).toHaveLength(3);
    expect(markup.match(/tabindex="0"/g)).toHaveLength(3);
    expect(markup.match(/aria-pressed="true"/g)).toHaveLength(1);
    const group = markup.slice(markup.indexOf('data-target="circuit/net/supply"'));
    expect(group).toContain('data-kind="group"');
    expect(group).toContain('aria-label="Supply node"');
    expect(group).not.toMatch(
      /<rect|data-member="circuit\/route\/open"|data-member="other\/component\/load"/,
    );
    expect(group).toContain('d="M10 10L150 10L150 100"');
    expect(group).toContain('d="M150 100L150 130"');
    expect(group.match(/data-member=/g)).toHaveLength(4);
    expect(group).toContain('data-member="circuit/terminal/a" pointer-events="none"');
    expect(group).toContain('data-member="circuit/route/top" pointer-events="painted"');
    expect(JSON.stringify(document)).toBe(before);
    const paired = renderToString(
      <>
        <EducationalFigure document={document} namespace="same" />
        <EducationalFigure document={document} namespace="same" />
      </>,
    );
    expect(new Set(ids(paired)).size).toBe(ids(paired).length);
    expect(paired.match(/data-kind="group"/g)).toHaveLength(2);
  });

  test("net member shapes preserve separate paths, dashes, holes, corners and glyph outlines", () => {
    const document = netDocument();
    document.display.push({
      id: "circuit/component/geometry",
      shapes: [
        {
          kind: "line",
          points: [
            { x: 20, y: 90 },
            { x: 40, y: 90 },
          ],
          width: 2,
          tone: "ink",
          dashed: true,
        },
        {
          kind: "line",
          points: [
            { x: 60, y: 90 },
            { x: 80, y: 90 },
          ],
          width: 2,
          tone: "ink",
          dashed: false,
        },
        {
          kind: "polygon",
          points: [
            { x: 20, y: 110 },
            { x: 30, y: 120 },
            { x: 40, y: 110 },
          ],
          fill: "none",
          width: 2,
          tone: "ink",
        },
        {
          kind: "rect",
          at: { x: 50, y: 110 },
          width: 20,
          height: 20,
          radius: 5,
          fill: "none",
          stroke: 2,
          tone: "ink",
        },
        {
          kind: "math",
          at: { x: 80, y: 125 },
          runs: [{ text: "Δ", script: "base" }],
          size: 18,
          family: "sans",
          align: "left",
          tone: "ink",
        },
      ],
    });
    const net = document.targets.find((target) => target.role === "net");
    if (net?.role !== "net") throw new Error("fixture");
    net.members.push("circuit/component/geometry");
    const markup = renderToStaticMarkup(
      <EducationalFigure document={document} selectedTargets={[net.id]} onSelectionChange={noop} />,
    );
    const member = markup.slice(markup.indexOf('data-member="circuit/component/geometry"'));
    expect(member).toContain('d="M20 90L40 90" stroke-width="2" stroke-dasharray="5 4"');
    expect(member).toContain('d="M60 90L80 90"');
    expect(member).not.toContain("L40 90L60 90");
    expect(member).toContain('fill="none" d="M20 110L30 120L40 110Z"');
    expect(member).toContain('rx="5"');
    expect(member).toContain('fill-rule="evenodd"');
    expect(member).not.toContain("<text");
  });

  test("invalid net members use the core fixed failure without partial controls", () => {
    const document = netDocument();
    const net = document.targets.find((target) => target.role === "net");
    if (net?.role !== "net") throw new Error("fixture");
    net.members.push("secret/missing/member");
    const markup = renderToStaticMarkup(
      <EducationalFigure document={document} onSelectionChange={noop} />,
    );
    expect(markup).toContain("Invalid or unsupported educational figure.");
    expect(markup).not.toMatch(/<svg|secret|Supply node/);
  });

  test("empty manifests are static, even with a callback", () => {
    const document = { ...publicDocument(), targets: [] };
    const markup = renderToStaticMarkup(
      <EducationalFigure document={document} onSelectionChange={noop} />,
    );
    expect(markup).toContain('role="img"');
    expect(markup).not.toMatch(/data-target=|role="button"|tabindex="0"|instructions/);
  });

  test("selection is controlled, deduplicated, allowlisted, and never edits document or canonical SVG", () => {
    const document = freeze(publicDocument());
    const identity = document.display;
    const before = JSON.stringify(document);
    const selectedTargets = freeze([
      "meter/reading",
      "meter/reading",
      "secret-net-777",
      "visible/not-allowed",
    ]);
    const baseline = renderToStaticMarkup(<EducationalFigure document={document} />);
    const markup = renderToStaticMarkup(
      <EducationalFigure
        document={document}
        selectedTargets={selectedTargets}
        onSelectionChange={noop}
      />,
    );
    expect(markup.match(/aria-pressed="true"/g)).toHaveLength(1);
    expect(markup.match(/data-selected="true"/g)).toHaveLength(1);
    expect(markup).not.toContain("secret-net-777");
    expect(embeddedSVG(markup)).toBe(embeddedSVG(baseline));
    expect(document.display).toBe(identity);
    expect(JSON.stringify(document)).toBe(before);
    const staticHighlight = renderToStaticMarkup(
      <EducationalFigure document={document} selectedTargets={["meter/reading"]} />,
    );
    expect(staticHighlight).toContain('data-selected="true"');
    expect(staticHighlight).not.toMatch(/tabindex="0"|aria-pressed=/);
  });

  test("same document and explicit namespace still give collision-free SSR IDs and ARIA references", () => {
    const document = publicDocument();
    const tree = (
      <>
        <EducationalFigure document={document} namespace="same" onSelectionChange={noop} />
        <EducationalFigure document={document} namespace="same" onSelectionChange={noop} />
      </>
    );
    const markup = renderToString(tree);
    const all = ids(markup);
    expect(new Set(all).size).toBe(all.length);
    for (const attribute of markup.matchAll(/aria-(?:labelledby|describedby)="([^"]+)"/g)) {
      for (const reference of attribute[1]?.split(" ") ?? []) expect(all).toContain(reference);
    }
    expect(renderToString(tree)).toBe(markup);
    expect(markup.match(/data-target="meter\/reading"/g)).toHaveLength(2);
    const roots =
      renderToString(tree, { identifierPrefix: "root-one:" }) +
      renderToString(tree, { identifierPrefix: "root-two:" });
    expect(new Set(ids(roots)).size).toBe(ids(roots).length);
  });

  test("slash and hyphen semantic identities do not alias", () => {
    const document = publicDocument();
    const a = document.display[0];
    if (!a) throw new Error("fixture");
    document.display.push({ ...a, id: "circuit-terminal-a" });
    document.targets.push({
      id: "circuit-terminal-a",
      label: "Separate terminal",
      role: "terminal",
    });
    const markup = renderToStaticMarkup(<EducationalFigure document={document} />);
    expect(new Set(ids(markup)).size).toBe(ids(markup).length);
  });

  test("safe public ARIA labels and host ReactNode captions stay outside SVG", () => {
    const document = publicDocument();
    document.title = '<script>alert("public")</script>';
    document.description = '<img src=x onerror="public">';
    const target = document.targets[0];
    if (target) target.label = 'Terminal <img src=x onerror="public">';
    const markup = renderToStaticMarkup(
      <EducationalFigure
        document={document}
        onSelectionChange={noop}
        caption={
          <span>
            Host <em>caption</em>
            {"<img src=x>"}
          </span>
        }
      />,
    );
    expect(markup).not.toMatch(/<script|<img|<foreignObject/);
    expect(markup).toContain("&lt;script&gt;");
    expect(markup).toContain('aria-label="Terminal &lt;img src=x onerror=&quot;public&quot;&gt;"');
    expect(markup).toContain(
      "</svg><figcaption><span>Host <em>caption</em>&lt;img src=x&gt;</span></figcaption>",
    );
  });

  test("public privacy projection never gains correction data in SVG, ARIA, or targets", () => {
    const author = privacyFixture();
    const projected = projectFigure(author, "question");
    expect(projected.ok).toBe(true);
    if (!projected.ok) return;
    const markup = renderToStaticMarkup(
      <EducationalFigure document={projected.document} onSelectionChange={noop} />,
    );
    expect(markup).toContain("? V");
    expect(embeddedSVG(markup)).not.toContain("-12 V");
    expect(markup).not.toMatch(/author\.v2|stages|potential|correction/);
  });

  test("all invalid server data uses the same accessible fixed diagnostic without touching getters", () => {
    let getterCalls = 0;
    const accessor = {
      get title() {
        getterCalls++;
        return "secret-777";
      },
    };
    const cycle: Record<string, unknown> = {};
    cycle.self = cycle;
    const absent = publicDocument();
    absent.targets.push({ id: "hidden/net", label: "secret-777", role: "route" });
    const received: unknown[] = [];
    const onDiagnostics: EducationalFigureProps["onDiagnostics"] = (diagnostics) =>
      received.push(diagnostics);
    const failures = [
      null,
      undefined,
      {},
      { ...publicDocument(), secret: "secret-777" },
      absent,
      accessor,
      cycle,
      privacyFixture(),
      { schema: "bad", title: "secret-777" },
    ];
    const baseline = renderToStaticMarkup(<EducationalFigure document={null} />);
    for (const document of failures) {
      const markup = renderToStaticMarkup(
        <EducationalFigure document={document} onDiagnostics={onDiagnostics} />,
      );
      expect(markup).toBe(baseline);
      expect(markup).toContain('role="alert"');
      expect(markup).toContain("Invalid or unsupported educational figure.");
      expect(markup).not.toMatch(/<svg|secret-777|stages|hidden\/net/);
      expect(inspectEducational(document).diagnostics).toEqual([
        { code: "educational.invalid", message: "Invalid or unsupported educational figure." },
      ]);
    }
    expect(getterCalls).toBe(0);
    expect(received).toEqual([]);
  });

  test("invalid namespaces fail closed with the same diagnostics and no raw values", () => {
    const baseline = renderToStaticMarkup(<EducationalFigure document={null} />);
    for (const namespace of ["", "bad<script>", "a".repeat(65), "a:b"]) {
      expect(
        renderToStaticMarkup(
          <EducationalFigure document={publicDocument()} namespace={namespace} />,
        ),
      ).toBe(baseline);
    }
    expect(
      renderToStaticMarkup(
        <EducationalFigure document={publicDocument()} namespace={"a".repeat(64)} />,
      ),
    ).toContain("<svg");
  });

  test("the client imports only public rendering, never the host compiler or HTML APIs", async () => {
    const source = await Bun.file(new URL("../src/v2/react.tsx", import.meta.url)).text();
    expect(source).toStartWith('"use client";');
    expect(source).not.toMatch(
      /projectFigure|AuthorFigure|authorDoc|\.\/index|\.\/compiler|\.\/fixtures|\.\/nets|inspectElectricalNets|resolveNamedNets|dangerouslySetInnerHTML|innerHTML|DOMParser|createObjectURL/,
    );
    expect(source).toContain("targetDOMId(domNamespace, target.id)");
  });
});

test.skipIf(process.env.CIRCUITKIT_BROWSER_TEST !== "1")(
  "standalone browser: SSR hydration, keyboard, controlled selection, isolation, fallback and recovery",
  async () => {
    const root = new URL("..", import.meta.url).pathname;
    const built = await Bun.build({
      entrypoints: ["educational-react-harness"],
      target: "browser",
      plugins: [
        {
          name: "in-memory-harness",
          setup(build) {
            build.onResolve({ filter: /^educational-react-harness$/ }, () => ({
              path: "educational-react-harness",
              namespace: "harness",
            }));
            build.onLoad({ filter: /.*/, namespace: "harness" }, () => ({
              contents: browserHarness,
              loader: "tsx",
              resolveDir: root,
            }));
          },
        },
      ],
    });
    expect(built.success).toBe(true);
    const script = await built.outputs[0]?.text();
    expect(script).toBeDefined();
    expect(script).not.toMatch(
      /function projectFigure|function compileStage|function educationFixtures/,
    );
    const doc = publicDocument();
    const net = netDocument();
    const divider = consumerDividerDocument();
    const gap = {
      ...net,
      targets: [{ id: "circuit/route/open", role: "route" as const, label: "Open route" }],
    };
    const markup = renderToString(
      <>
        <EducationalFigure
          document={doc}
          namespace="same"
          className="first"
          onSelectionChange={noop}
          onDiagnostics={noop}
        />
        <EducationalFigure
          document={doc}
          namespace="same"
          className="second"
          onSelectionChange={noop}
        />
        <EducationalFigure
          document={doc}
          namespace="same"
          className="controlled"
          onSelectionChange={noop}
        />
        <EducationalFigure
          document={{ ...doc, display: [], targets: [] }}
          className="empty-initial"
          caption={<span>Empty host caption</span>}
        />
        <EducationalFigure
          document={net}
          namespace="same"
          className="net-first"
          onSelectionChange={noop}
        />
        <EducationalFigure
          document={net}
          namespace="same"
          className="net-second"
          onSelectionChange={noop}
        />
        <div
          className="consumer-first"
          style={{ maxWidth: "100%", overflow: "auto", maxHeight: 480 }}
        >
          <div style={{ width: 702 }}>
            <EducationalFigure document={divider} namespace="consumer" onSelectionChange={noop} />
          </div>
        </div>
        <div
          className="consumer-second"
          style={{ maxWidth: "100%", overflow: "auto", maxHeight: 480 }}
        >
          <div style={{ width: 702 }}>
            <EducationalFigure document={divider} namespace="consumer" onSelectionChange={noop} />
          </div>
        </div>
        <EducationalFigure document={gap} className="wire-gap" onSelectionChange={noop} />
      </>,
      { identifierPrefix: "browser-root:" },
    );
    const server = Bun.serve({
      hostname: "127.0.0.1",
      port: 0,
      fetch(request) {
        if (new URL(request.url).pathname === "/client.js")
          return new Response(script, { headers: { "Content-Type": "text/javascript" } });
        return new Response(
          `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Educational renderer harness</title></head><body><main id="root">${markup}</main><script>window.publicDocument=${JSON.stringify(doc).replaceAll("<", "\\u003c")};window.netDocument=${JSON.stringify(net).replaceAll("<", "\\u003c")};window.consumerDivider=${JSON.stringify(divider).replaceAll("<", "\\u003c")}</script><script type="module" src="/client.js"></script></body></html>`,
          { headers: { "Content-Type": "text/html; charset=utf-8" } },
        );
      },
    });
    const session = `educational-react-${process.pid}`;
    const browser = async (...args: string[]) => {
      const process = Bun.spawn(["agent-browser", "--session", session, ...args], {
        stdout: "pipe",
        stderr: "pipe",
      });
      const [output, error, exit] = await Promise.all([
        new Response(process.stdout).text(),
        new Response(process.stderr).text(),
        process.exited,
      ]);
      if (exit !== 0)
        throw new Error(`agent-browser ${args[0]} exited ${exit}: ${error} ${output}`);
      return output;
    };
    const evaluate = async (expression: string) => {
      const output = JSON.parse(await browser("eval", "--json", expression));
      expect(output.success).toBe(true);
      return output.data.result;
    };
    const wait = (expression: string) => browser("wait", "--fn", expression);
    const pointOnScreen = async (selector: string, x: number, y: number, pan = false) => {
      await browser("scrollintoview", selector);
      return evaluate(`(() => {
        const region = document.querySelector(${JSON.stringify(selector)});
        const svg = region.querySelector('svg');
        if (${pan}) {
          region.scrollLeft = ${x} - svg.viewBox.baseVal.x - region.clientWidth / 2;
          region.scrollTop = ${y} - svg.viewBox.baseVal.y - region.clientHeight / 2;
        }
        const point = new DOMPoint(${x}, ${y}).matrixTransform(svg.getScreenCTM());
        return [Math.round(point.x), Math.round(point.y)];
      })()`);
    };
    const nativeClick = async (selector: string, x: number, y: number, pan = false) => {
      const [screenX, screenY] = await pointOnScreen(selector, x, y, pan);
      expect(Number.isFinite(screenX) && Number.isFinite(screenY)).toBe(true);
      expect(screenX).toBeGreaterThanOrEqual(0);
      expect(screenY).toBeGreaterThanOrEqual(0);
      await browser("mouse", "move", String(screenX), String(screenY));
      await browser("mouse", "down");
      await browser("mouse", "up");
    };
    const nativeHit = async (selector: string, x: number, y: number, pan = false) => {
      const [screenX, screenY] = await pointOnScreen(selector, x, y, pan);
      return evaluate(`(() => {
        const element = document.elementFromPoint(${screenX}, ${screenY})?.closest('[data-hit-target],[data-target]');
        return element?.getAttribute('data-hit-target') ?? element?.getAttribute('data-target') ?? null;
      })()`);
    };
    try {
      await browser("open", `http://127.0.0.1:${server.port}`);
      await wait("window.probe?.ready === true");
      const snapshot = await browser("snapshot", "-i");
      expect(snapshot).toContain("Terminal A");
      expect(snapshot).toContain("Positive probe");
      expect(snapshot).toContain("Meter display");
      expect(
        await evaluate(`(() => {
        const server = decodeURIComponent(document.querySelector('.consumer-first image').getAttribute('href').split(',')[1]);
        const client = probe.dividerExport().svg;
        if (server === client) return null;
        let index = 0;
        while (server[index] === client[index]) index++;
        return { index, server: server.slice(index - 80, index + 100), client: client.slice(index - 80, index + 100) };
      })()`),
      ).toBeNull();
      expect(await evaluate("probe.errors")).toEqual([]);
      expect(
        await evaluate(
          "probe.initialIds.every((id, i) => document.querySelectorAll('[id]')[i]?.id === id)",
        ),
      ).toBe(true);
      expect(await evaluate("new Set(probe.initialIds).size === probe.initialIds.length")).toBe(
        true,
      );
      expect(await evaluate("probe.reports")).toEqual([[]]);
      expect(await evaluate("probe.diagnostics")).toEqual([]);
      expect(await evaluate("probe.renders")).toBe(2);
      expect(await evaluate("document.querySelector('.empty-initial').innerHTML")).toBe(
        "<figcaption><span>Empty host caption</span></figcaption>",
      );
      await evaluate("probe.changeCallback(1); true");
      await wait("probe.callbackVersion === 1");
      expect(await evaluate("probe.renders")).toBe(3);
      expect(await evaluate("probe.notificationVersions")).toEqual([0]);
      const canonical = await evaluate("probe.exportSVG().svg");
      expect(
        await evaluate(
          "new Promise(resolve => { const image = new Image(); image.onload = () => resolve(image.naturalWidth > 0 && image.naturalHeight > 0); image.onerror = () => resolve(false); image.src = document.querySelector('svg image').getAttribute('href'); })",
        ),
      ).toBe(true);
      await browser("press", "Tab");
      expect(await evaluate("document.activeElement.getAttribute('data-target')")).toBe(
        "circuit/terminal/a",
      );
      await wait("document.querySelectorAll('.first [data-focus-ring]').length === 1");
      await browser("press", "Enter");
      await wait("document.activeElement.getAttribute('aria-pressed') === 'true'");
      expect(await evaluate("probe.calls")).toEqual([["circuit/terminal/a"]]);
      await browser("press", "Space");
      await wait("document.activeElement.getAttribute('aria-pressed') === 'false'");
      expect(await evaluate("probe.calls")).toEqual([["circuit/terminal/a"], []]);
      await browser("press", "Tab");
      expect(await evaluate("document.activeElement.getAttribute('data-target')")).toBe(
        "meter/probe/positive",
      );
      await browser("press", "Enter");
      await wait("document.activeElement.getAttribute('aria-pressed') === 'true'");
      await browser("press", "Tab");
      expect(await evaluate("document.activeElement.getAttribute('data-target')")).toBe(
        "meter/reading",
      );
      await browser("press", "Space");
      await wait("document.querySelectorAll('.first [aria-pressed=true]').length === 2");
      expect(await evaluate("probe.calls.at(-1)")).toEqual([
        "meter/probe/positive",
        "meter/reading",
      ]);
      expect(
        await evaluate("document.querySelectorAll('.second [aria-pressed=true]').length"),
      ).toBe(0);
      await evaluate(
        "document.activeElement.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', repeat: true, bubbles: true })); true",
      );
      expect(await evaluate("probe.calls.length")).toBe(4);
      await browser("press", "Escape");
      await wait("document.querySelectorAll('.first [aria-pressed=true]').length === 0");
      expect(await evaluate("document.activeElement.getAttribute('data-target')")).toBe(
        "meter/reading",
      );
      expect(await evaluate("document.querySelectorAll('.first [data-focus-ring]').length")).toBe(
        1,
      );
      await browser("press", "Tab");
      expect(await evaluate("document.activeElement.closest('figure').className")).toBe("second");
      await wait("document.querySelectorAll('.first [data-focus-ring]').length === 0");
      await nativeClick(".controlled", 20, 20);
      expect(
        await evaluate("document.querySelectorAll('.controlled [aria-pressed=true]').length"),
      ).toBe(0);
      expect(await evaluate("probe.calls.at(-1)")).toEqual(["circuit/terminal/a"]);
      await evaluate("probe.select(['secret-net-777', 'meter/reading', 'meter/reading']); true");
      await wait("document.querySelectorAll('.first [aria-pressed=true]').length === 1");
      await nativeClick(".first", 20, 20);
      await wait("document.querySelectorAll('.first [aria-pressed=true]').length === 2");
      expect(await evaluate("probe.calls.at(-1)")).toEqual(["circuit/terminal/a", "meter/reading"]);
      expect(await evaluate("probe.identity")).toBe(true);
      expect(await evaluate("probe.exportSVG().svg")).toBe(canonical);
      expect(await evaluate("probe.reports")).toEqual([[]]);
      await browser("set", "viewport", "320", "640");
      expect(
        await evaluate(
          "document.documentElement.scrollWidth <= innerWidth && document.querySelector('svg').getBoundingClientRect().width <= 304",
        ),
      ).toBe(true);
      await evaluate("probe.setDocument({ schema: 'invalid', title: 'secret-777' }); true");
      await wait("document.querySelector('.first [role=alert]') !== null");
      expect(await evaluate("document.querySelector('.first').textContent")).toBe(
        "Figure unavailable. Invalid or unsupported educational figure.",
      );
      expect(await evaluate("document.querySelectorAll('.first svg').length")).toBe(0);
      expect(await evaluate("probe.reports.at(-1)")).toEqual([
        { code: "educational.invalid", message: "Invalid or unsupported educational figure." },
      ]);
      expect(await evaluate("probe.diagnostics")).toEqual([
        { code: "educational.invalid", message: "Invalid or unsupported educational figure." },
      ]);
      expect(await evaluate("probe.notificationVersions")).toEqual([0, 1]);
      await evaluate(
        "probe.diagnostics[0].message = 'host-mutated-diagnostic'; probe.changeCallback(2); true",
      );
      await wait("probe.callbackVersion === 2");
      expect(await evaluate("probe.reports.length")).toBe(2);
      expect(
        await evaluate("document.querySelector('.first [role=alert]').textContent"),
      ).not.toContain("host-mutated-diagnostic");
      await evaluate("probe.setDocument(probe.doc); true");
      await wait("document.querySelector('.first svg') !== null");
      expect(await evaluate("document.querySelectorAll('.first [data-focus-ring]').length")).toBe(
        0,
      );
      expect(await evaluate("probe.reports.at(-1)")).toEqual([]);
      expect(await evaluate("probe.identity")).toBe(true);
      await evaluate("probe.setDocument(probe.empty); true");
      await wait("document.querySelector('.first') === null && probe.reports.length === 4");
      expect(await evaluate("probe.diagnostics")).toEqual([]);
      await evaluate("probe.showCaption(); true");
      await wait("document.querySelector('.first figcaption') !== null");
      expect(await evaluate("document.querySelector('.first').innerHTML")).toBe(
        "<figcaption><span>Only host caption</span></figcaption>",
      );
      expect(await evaluate("probe.reports.length")).toBe(4);
      await evaluate("probe.setDocument(probe.doc); true");
      await wait("document.querySelector('.first svg') !== null && probe.reports.length === 5");
      expect(await evaluate("probe.notificationVersions")).toEqual([0, 1, 2, 2, 2]);
      expect(await evaluate("probe.exportSVG().svg")).toBe(canonical);
      expect(await evaluate("probe.identity")).toBe(true);
      const netCanonical = await evaluate("probe.netExportSVG().svg");
      await browser("scrollintoview", ".net-first");
      const netSnapshot = await browser("snapshot", "-i");
      expect(netSnapshot.match(/Supply node/g)).toHaveLength(2);
      expect(await evaluate("document.querySelectorAll('.net-first [role=button]').length")).toBe(
        3,
      );
      await nativeClick(".net-first", 10, 10);
      await browser("press", "Escape");
      await browser("press", "Tab");
      expect(await evaluate("document.activeElement.getAttribute('data-target')")).toBe(
        "circuit/net/supply",
      );
      await browser("press", "Enter");
      await wait("document.activeElement.getAttribute('aria-pressed') === 'true'");
      expect(await evaluate("probe.netCalls")).toEqual([
        ["circuit/terminal/a"],
        [],
        ["circuit/net/supply"],
      ]);
      expect(
        await evaluate("document.querySelectorAll('.net-first [data-kind=group] > rect').length"),
      ).toBe(0);
      expect(
        await evaluate(
          "document.querySelectorAll('.net-first [data-kind=group] [data-focus-ring] rect').length",
        ),
      ).toBe(2);
      const hit = async (x: number, y: number) =>
        evaluate(`(() => {
        const svg = document.querySelector('.net-first svg');
        const point = new DOMPoint(${x}, ${y}).matrixTransform(svg.getScreenCTM());
        const hit = document.elementFromPoint(point.x, point.y)?.closest('[data-hit-target],[data-target]');
        return hit?.getAttribute('data-hit-target') ?? hit?.getAttribute('data-target') ?? null;
      })()`);
      expect(await hit(80, 10)).toBe("circuit/net/supply");
      expect(await hit(150, 70)).toBe("circuit/net/supply");
      expect(await hit(150, 120)).toBe("circuit/net/supply");
      expect(await hit(100, 55)).toBeNull();
      expect(await hit(50, 40)).toBeNull();
      expect(await hit(30, 40)).toBeNull();
      expect(await hit(80, 60)).toBe("other/component/load");
      expect(await hit(10, 10)).toBe("circuit/terminal/a");
      expect(
        await evaluate("document.querySelectorAll('.net-second [aria-pressed=true]').length"),
      ).toBe(0);
      await browser("press", "Space");
      await wait("document.activeElement.getAttribute('aria-pressed') === 'false'");
      expect(await hit(80, 10)).toBe("circuit/net/supply");
      await browser("press", "Enter");
      await browser("press", "Escape");
      await wait("document.activeElement.getAttribute('aria-pressed') === 'false'");
      expect(await evaluate("probe.netCalls")).toEqual([
        ["circuit/terminal/a"],
        [],
        ["circuit/net/supply"],
        [],
        ["circuit/net/supply"],
        [],
      ]);
      const clickPoint = async (x: number, y: number) => {
        await browser("scrollintoview", ".net-first");
        const [screenX, screenY] = await evaluate(
          `(() => { const point = new DOMPoint(${x}, ${y}).matrixTransform(document.querySelector('.net-first svg').getScreenCTM()); return [Math.round(point.x), Math.round(point.y)]; })()`,
        );
        expect(Number.isFinite(screenX) && Number.isFinite(screenY)).toBe(true);
        expect(screenX).toBeGreaterThanOrEqual(0);
        expect(screenY).toBeGreaterThanOrEqual(0);
        await browser("mouse", "move", String(screenX), String(screenY));
        await browser("mouse", "down");
        await browser("mouse", "up");
      };
      await clickPoint(80, 10);
      await wait(
        "document.querySelector('.net-first [data-kind=group]').getAttribute('aria-pressed') === 'true'",
      );
      expect(await evaluate("probe.netCalls.at(-1)")).toEqual(["circuit/net/supply"]);
      await clickPoint(10, 10);
      await wait(
        "document.querySelector('.net-first [data-target=\"circuit/terminal/a\"]').getAttribute('aria-pressed') === 'true'",
      );
      expect(await evaluate("probe.netCalls.at(-1)")).toEqual([
        "circuit/terminal/a",
        "circuit/net/supply",
      ]);
      expect(await evaluate("document.activeElement.getAttribute('data-target')")).toBe(
        "circuit/terminal/a",
      );
      expect(await evaluate("probe.netIdentity")).toBe(true);
      expect(await evaluate("probe.netExportSVG().svg")).toBe(netCanonical);
      expect(
        await evaluate(
          "decodeURIComponent(document.querySelector('.net-first image').getAttribute('href').split(',')[1])",
        ),
      ).toBe(netCanonical);
      expect(
        await evaluate(
          "new Set(Array.from(document.querySelectorAll('[id]'), node => node.id)).size === document.querySelectorAll('[id]').length",
        ),
      ).toBe(true);
      await browser("set", "viewport", "320", "1000");
      const dividerCanonical = await evaluate("probe.dividerExport().svg");
      const expectedDividerOrder = [
        "gallery/terminal/A",
        "gallery/terminal/B",
        "gallery/terminal/C",
        "gallery-meter/probe/positive",
        "gallery-meter/probe/negative",
      ];
      expect(
        await evaluate(
          "Array.from(document.querySelectorAll('.consumer-first [data-target]'), target => target.dataset.target)",
        ),
      ).toEqual(expectedDividerOrder);
      expect(
        await evaluate("document.querySelectorAll('.consumer-first [tabindex=\"0\"]').length"),
      ).toBe(5);
      expect(await nativeHit(".consumer-first", 360, 220, true)).toBe("gallery/terminal/B");
      await nativeClick(".consumer-first", 360, 220, true);
      await wait("probe.dividerSelected[0].includes('gallery/terminal/B')");
      expect(await evaluate("probe.dividerSelected")).toEqual([["gallery/terminal/B"], []]);
      expect(await evaluate("document.activeElement.dataset.target")).toBe("gallery/terminal/B");
      await browser("press", "Escape");
      expect(await nativeHit(".consumer-first", 510, 230, true)).toBe(
        "gallery-meter/probe/positive",
      );
      await nativeClick(".consumer-first", 510, 230, true);
      await wait("probe.dividerSelected[0].includes('gallery-meter/probe/positive')");
      expect(await evaluate("document.activeElement.dataset.target")).toBe(
        "gallery-meter/probe/positive",
      );
      expect(await nativeHit(".consumer-first", 365, 220, true)).toBe(
        "gallery-meter/probe/positive",
      );
      await nativeClick(".consumer-first", 365, 220, true);
      await wait("probe.dividerSelected[0].length === 0");
      const beforeGap = await evaluate("probe.dividerCalls.length");
      expect(await nativeHit(".consumer-first", 430, 240, true)).toBeNull();
      await nativeClick(".consumer-first", 430, 240, true);
      expect(await evaluate("probe.dividerCalls.length")).toBe(beforeGap);
      await nativeClick(".consumer-second", 360, 220, true);
      await wait("probe.dividerSelected[1].includes('gallery/terminal/B')");
      expect(await evaluate("probe.dividerSelected")).toEqual([[], ["gallery/terminal/B"]]);
      await nativeClick(".consumer-first", 360, 220, true);
      await wait("probe.dividerSelected[0].includes('gallery/terminal/B')");
      expect(await evaluate("probe.dividerSelected")).toEqual([
        ["gallery/terminal/B"],
        ["gallery/terminal/B"],
      ]);
      await nativeClick(".consumer-first", 360, 0, true);
      await browser("press", "Escape");
      expect(await evaluate("document.activeElement.dataset.target")).toBe(expectedDividerOrder[0]);
      for (const target of expectedDividerOrder.slice(1)) {
        await browser("press", "Tab");
        expect(await evaluate("document.activeElement.dataset.target")).toBe(target);
        expect(await evaluate("document.activeElement.closest('.consumer-first') !== null")).toBe(
          true,
        );
      }
      await browser("press", "Tab");
      expect(await evaluate("document.activeElement.dataset.target")).toBe(expectedDividerOrder[0]);
      expect(await evaluate("document.activeElement.closest('.consumer-second') !== null")).toBe(
        true,
      );
      await browser("press", "Space");
      await wait("probe.dividerSelected[1].includes('gallery/terminal/A')");
      expect(await nativeHit(".wire-gap", 50, 40)).toBeNull();
      await nativeClick(".wire-gap", 30, 40);
      await wait("probe.gapCalls.length === 1");
      expect(await evaluate("probe.gapCalls")).toEqual([["circuit/route/open"]]);
      await nativeClick(".wire-gap", 50, 40);
      expect(await evaluate("probe.gapCalls.length")).toBe(1);
      await nativeClick(".wire-gap", 70, 40);
      await wait("probe.gapCalls.length === 2");
      expect(await evaluate("probe.gapCalls.at(-1)")).toEqual([]);
      expect(await evaluate("probe.dividerIdentity")).toBe(true);
      expect(await evaluate("probe.dividerExport().svg")).toBe(dividerCanonical);
      expect(
        await evaluate(
          "decodeURIComponent(document.querySelector('.consumer-first image').getAttribute('href').split(',')[1])",
        ),
      ).toBe(dividerCanonical);
      expect(
        await evaluate(
          "new Set(Array.from(document.querySelectorAll('[id]'), node => node.id)).size === document.querySelectorAll('[id]').length",
        ),
      ).toBe(true);
      expect(await evaluate("probe.errors")).toEqual([]);
    } finally {
      try {
        await browser("close");
      } finally {
        await server.stop(true);
      }
    }
  },
  120000,
);
