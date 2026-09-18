import { describe, expect, test } from "bun:test";
import { renderToStaticMarkup, renderToString } from "react-dom/server";
import { amplifierLesson, dividerLesson, rcLesson } from "../app/lesson/documents.ts";
import { getSchema, loadExample } from "../src/catalog.ts";
import { renderFigureSVG } from "../src/figure-svg.ts";
import { exportLessonFigure, resolveLessonFigure } from "../src/lesson-figure.tsx";
import { resolveLessonSequence } from "../src/lesson-sequence.tsx";
import {
  CircuitLessonFigure,
  CircuitLessonSequence,
  type CircuitLessonSequenceProps,
} from "../src/react.tsx";
import {
  deriveStepPresentation,
  inspect,
  renderSchematicSVG,
  renderSVG,
  validate,
} from "../src/renderer.ts";
import { type FigureDocument, recipeIds, themePresets } from "../src/schema.ts";
import { decodeShareDocument, encodeShareDocument } from "../src/share.ts";
import type { RenderResult } from "../src/types.ts";
import { validateDocument } from "../src/validation.ts";

function success(result: RenderResult) {
  expect(result.ok, JSON.stringify(result.diagnostics)).toBe(true);
  if (!result.ok) throw new Error(JSON.stringify(result.diagnostics));
  return result;
}

function lesson() {
  const document = dividerLesson("geist-light", 10000);
  document.presentation.highlight = { components: ["R2"], nets: ["ground"] };
  document.presentation.activeStep = "output";
  return document;
}

function first(document: FigureDocument) {
  const step = document.presentation.steps?.[0];
  if (!step) throw new Error("Expected authored steps");
  return step;
}

function invalid(document: unknown, path: string, code = "document.invalid_field") {
  const result = validateDocument(document);
  expect(result.ok).toBe(false);
  expect(result.diagnostics).toContainEqual(expect.objectContaining({ path, code }));
  for (const api of [renderSVG, renderFigureSVG, inspect, validate]) {
    const rendered = api(document);
    expect(rendered.ok).toBe(false);
    expect(rendered).not.toHaveProperty("svg");
    expect(rendered).not.toHaveProperty("document");
  }
}

describe("strict teaching-step contract", () => {
  test("schema advertises optional bounded strict steps", () => {
    const schema = getSchema();
    expect(JSON.stringify(schema)).toContain('"maxItems":32');
    expect(JSON.stringify(schema)).toContain('"activeStep"');
    expect(validateDocument(loadExample("rc-lowpass")).ok).toBe(true);
    const document = lesson();
    delete document.presentation.activeStep;
    document.presentation.steps = [];
    expect(validateDocument(document).ok).toBe(true);
    document.presentation.activeStep = "output";
    invalid(document, "/presentation/activeStep", "presentation.unknown_active_step");
    delete document.presentation.steps;
    invalid(document, "/presentation/activeStep", "presentation.unknown_active_step");
  });

  test("32 ordered entries are accepted; 33 are not", () => {
    const document = lesson();
    document.presentation.steps = Array.from({ length: 32 }, (_, index) => ({
      ...first(document),
      id: `step-${index}`,
    }));
    document.presentation.activeStep = "step-31";
    expect(validateDocument(document).ok).toBe(true);
    document.presentation.steps.push({ ...first(document), id: "step-32" });
    invalid(document, "/presentation/steps");
  });

  test.each([
    ["id", "", "/id"],
    ["id", "  ", "/id"],
    ["id", "x".repeat(129), "/id"],
    ["title", " ", "/title"],
    ["title", "x".repeat(161), "/title"],
    ["description", "x".repeat(2001), "/description"],
    ["description", null, "/description"],
    ["title", "bad\u0000text", "/title"],
    ["description", "bad\ud800text", "/description"],
    ["extra", true, "/extra"],
  ])("rejects invalid %s", (field, value, suffix) => {
    const document = lesson();
    Reflect.set(first(document), String(field), value);
    invalid(document, `/presentation/steps/0${suffix}`);
  });

  test.each(["id", "title", "description", "highlight"])("requires %s", (field) => {
    const document = lesson();
    Reflect.deleteProperty(first(document), field);
    invalid(document, `/presentation/steps/0/${field}`);
  });

  test("empty descriptions and bounded strings are valid plain text", () => {
    const document = lesson();
    first(document).id = "x".repeat(128);
    first(document).title = "x".repeat(160);
    first(document).description = "";
    expect(validateDocument(document).ok).toBe(true);
    first(document).description = "a ".repeat(1000);
    expect(validateDocument(document).ok).toBe(true);
  });

  test("every inactive reference is checked with an exact path and own membership", () => {
    const document = lesson();
    first(document).highlight = { components: ["constructor"], nets: ["__proto__"] };
    invalid(
      document,
      "/presentation/steps/0/highlight/components/0",
      "presentation.unknown_highlight",
    );
    invalid(document, "/presentation/steps/0/highlight/nets/0", "presentation.unknown_highlight");
    first(document).highlight = { components: [], nets: [] };
    Reflect.set(first(document).highlight, "ports", []);
    invalid(document, "/presentation/steps/0/highlight/ports");
  });

  test("duplicates and unknown active IDs fail closed", () => {
    const document = lesson();
    document.presentation.steps?.push({ ...first(document) });
    invalid(document, "/presentation/steps/3/id", "presentation.duplicate_step");
    document.presentation.steps?.pop();
    document.presentation.activeStep = "constructor";
    invalid(document, "/presentation/activeStep", "presentation.unknown_active_step");
    Reflect.set(document.presentation, "activeStep", null);
    invalid(document, "/presentation/activeStep");
  });

  test("prototype-like and punctuation step IDs remain author data", () => {
    for (const id of ["__proto__", "constructor", "toString", "part.1/~"]) {
      const document = lesson();
      first(document).id = id;
      document.presentation.activeStep = id;
      expect(success(renderSVG(document)).document.presentation.activeStep).toBe(id);
    }
  });

  test("normalization preserves ordered steps and text without mutating input", () => {
    const document = lesson();
    first(document).highlight = {
      components: ["R2", "R1", "R2"],
      nets: ["output", "input", "input"],
    };
    const before = structuredClone(document);
    const result = success(renderSVG(document));
    expect(result.document.presentation.steps?.map(({ id }) => id)).toEqual([
      "input",
      "output",
      "reference",
    ]);
    expect(first(result.document).highlight).toEqual({
      components: ["R1", "R2"],
      nets: ["input", "output"],
    });
    expect(document).toEqual(before);
    expect(renderSVG(result.document)).toEqual(result);
  });
});

describe("derived step presentation", () => {
  test("active highlights replace rather than accumulate and captions are idempotent", () => {
    const document = lesson();
    const before = structuredClone(document);
    const derived = deriveStepPresentation(document.presentation);
    expect(derived.highlight).toEqual({ components: ["R1", "R2"], nets: ["output"] });
    expect(derived.activeStep).toBeUndefined();
    expect(deriveStepPresentation(derived)).toEqual(derived);
    const result = success(renderFigureSVG(document));
    expect(result.document.presentation.activeStep).toBe("output");
    expect(result.document.presentation.highlight).toEqual(document.presentation.highlight);
    expect(result.document.presentation.annotations?.caption).toBe(
      document.presentation.annotations?.caption,
    );
    expect(result.annotations?.caption).toBe(
      `${document.presentation.annotations?.caption} Find the divider output: ${document.presentation.steps?.[1]?.description}`,
    );
    expect(result.svg).toContain('data-caption="true"');
    expect(result.svg).toContain("Focus nets: output.");
    expect(renderFigureSVG(result.document)).toEqual(result);
    const reference = success(resolveLessonSequence(result.document, "reference"));
    expect(reference.annotations?.caption).toContain("Identify the reference:");
    expect(reference.annotations?.caption).not.toContain("Find the divider output:");
    expect(document).toEqual(before);
  });

  for (const recipe of recipeIds) {
    for (const theme of themePresets) {
      test(`${recipe}/${theme}: step-only captions leave circuit geometry untouched`, () => {
        const document = loadExample(recipe);
        document.presentation.theme.preset = theme;
        const baseline = success(renderSVG(document));
        const component = Object.keys(document.circuit.components)[0] ?? "";
        const net = Object.keys(document.circuit.nets)[0] ?? "";
        document.presentation.steps = [
          {
            id: "one",
            title: "Follow this connection",
            description: "This is authored explanation, not a simulation.",
            highlight: { components: [component], nets: [net] },
          },
        ];
        expect(success(renderSVG(document)).svg).toBe(baseline.svg);
        document.presentation.activeStep = "one";
        const result = success(renderSVG(document));
        expect(result.bounds).toEqual(baseline.bounds);
        expect(result.circuit).toEqual(baseline.circuit);
        const paths = (svg: string) =>
          [...svg.matchAll(/\b(?:d|transform|cx|cy|r|viewBox)="[^"]*"/g)].map(([value]) => value);
        expect(paths(result.svg)).toEqual(paths(baseline.svg));
        expect(result.svg).toContain(`Focus components: ${component}. Focus nets: ${net}.`);
        expect(result.svg).toContain("Follow this connection:");
        const full = success(renderFigureSVG(document));
        expect(full.bounds.height).toBeGreaterThan(result.bounds.height);
        expect(full.svg).toContain('data-caption="true"');
        expect(full.document.presentation.annotations).toBeUndefined();
      });
    }
  }

  test("step text is escaped rather than executed in SVG and React", () => {
    const document = lesson();
    first(document).title = "<b>Input</b>";
    first(document).description = '<script>alert("text")</script> & prose';
    document.presentation.activeStep = "input";
    for (const markup of [
      success(renderFigureSVG(document)).svg,
      renderToStaticMarkup(<CircuitLessonSequence document={document} />),
    ]) {
      expect(markup).not.toContain("<script>");
      expect(markup).not.toContain("<b>Input");
      expect(markup).toContain("&lt;script&gt;");
    }
  });

  test("manual and transient net previews override steps but export the original saved step", () => {
    const document = lesson();
    const before = structuredClone(document);
    for (const net of ["input", "ground", null] as const) {
      const preview = success(resolveLessonFigure(document, net));
      expect(preview.svg).toContain(`Focus nets: ${net ?? "none"}.`);
      expect(preview.document.presentation.activeStep).toBe("output");
      expect(exportLessonFigure(preview)).toEqual(renderFigureSVG(document));
      const markup = renderToStaticMarkup(
        <CircuitLessonFigure
          layout="expanded"
          document={document}
          activeNet={net}
          onActiveNetChange={() => {}}
        />,
      );
      const selected = [
        ...markup.matchAll(/<button[^>]*aria-pressed="true"[^>]*>(.*?)<\/button>/g),
      ].map((match) => match[1]);
      expect(selected).toEqual(net === "input" ? ["A"] : net === "ground" ? ["C"] : []);
    }
    const markup = renderToStaticMarkup(
      <CircuitLessonFigure layout="expanded" document={document} />,
    );
    expect(markup).toMatch(/aria-pressed="true"[^>]*>B<\/button>/);
    expect(document).toEqual(before);
  });
});

describe("React teaching sequence", () => {
  test("authored initial selection, manual navigation boundaries and live description are accessible", () => {
    const document = lesson();
    const markup = renderToStaticMarkup(<CircuitLessonSequence document={document} download />);
    expect(markup).toContain("Teaching sequence controls");
    expect(markup).toContain('aria-current="step"');
    expect(markup).toContain('role="status" aria-live="polite" aria-atomic="true"');
    expect(markup).toContain(document.presentation.steps?.[1]?.description ?? "missing");
    expect(markup).toContain("Previous</button>");
    expect(markup).toContain("Next</button>");
    expect(markup).toContain("Show all</button>");
    const firstMarkup = renderToStaticMarkup(
      <CircuitLessonSequence
        document={document}
        activeStep="input"
        onActiveStepChange={() => {}}
      />,
    );
    expect(firstMarkup).toMatch(/<button[^>]*disabled=""[^>]*>Previous<\/button>/);
    const lastMarkup = renderToStaticMarkup(
      <CircuitLessonSequence
        document={document}
        activeStep="reference"
        onActiveStepChange={() => {}}
      />,
    );
    expect(lastMarkup).toMatch(/<button[^>]*disabled=""[^>]*>Next<\/button>/);
    expect(markup).not.toMatch(/<animate|autoplay|setInterval/);
  });

  test("controlled API supplies a selected canonical document without changing the source", () => {
    const document = lesson();
    const before = structuredClone(document);
    for (const id of ["input", "reference", null] as const) {
      const result = success(resolveLessonSequence(document, id));
      expect(result.document.presentation.activeStep).toBe(id ?? undefined);
      expect(result.document.presentation.annotations?.caption).toBe(
        document.presentation.annotations?.caption,
      );
      expect(result.document.circuit).toEqual(success(renderSVG(document)).circuit);
      if (id === null) expect(result.svg).toContain("Focus components: R2. Focus nets: ground.");
    }
    expect(document).toEqual(before);
    const events: unknown[] = [];
    const callback: CircuitLessonSequenceProps["onActiveStepChange"] = (id, selected) =>
      events.push([id, selected]);
    renderToString(
      <CircuitLessonSequence
        document={document}
        activeStep="input"
        onActiveStepChange={callback}
        onDiagnostics={(value) => events.push(value)}
      />,
    );
    expect(events).toEqual([]);
  });

  test("controlled selection without callback is explicitly read-only", () => {
    const markup = renderToStaticMarkup(
      <CircuitLessonSequence document={lesson()} activeStep="input" />,
    );
    expect(markup).toContain('data-sequence-mode="read-only"');
    const nav = markup.match(/<nav[\s\S]*?<\/nav>/)?.[0] ?? "";
    expect(nav.match(/disabled=""/g)).toHaveLength(6);
  });

  test("Show all restores authored highlights; no-step documents omit sequence controls", () => {
    const markup = renderToStaticMarkup(
      <CircuitLessonSequence document={lesson()} activeStep={null} onActiveStepChange={() => {}} />,
    );
    expect(markup).not.toContain('aria-current="step"');
    expect(markup).toContain("Focus nets: ground.");
    expect(markup).toContain("Authored figure highlights are restored");
    const plain = renderToStaticMarkup(
      <CircuitLessonSequence document={loadExample("rc-lowpass")} />,
    );
    expect(plain).not.toContain("<nav");
    expect(plain).not.toContain("<button");
  });

  test("invalid input and unknown controlled selections never display stale SVG", () => {
    for (const document of [undefined, null, {}, { version: 99 }]) {
      const markup = renderToStaticMarkup(<CircuitLessonSequence document={document} />);
      expect(markup).toContain('role="alert"');
      expect(markup).not.toContain("<svg");
    }
    expect(resolveLessonSequence(lesson(), "missing")).toMatchObject({
      ok: false,
      diagnostics: [{ code: "lesson.unknown_active_step", path: "/activeStep" }],
    });
    const markup = renderToStaticMarkup(
      <CircuitLessonSequence document={lesson()} activeStep="missing" />,
    );
    expect(markup).not.toContain("<svg");
  });

  test("a saved render-invalid step offers Show all recovery without a stale figure", () => {
    const document = lesson();
    first(document).description = "Unsupported 🧪";
    document.presentation.activeStep = "input";
    const markup = renderToStaticMarkup(<CircuitLessonSequence document={document} />);
    expect(markup).toContain("font.missing_glyph");
    expect(markup).not.toContain("<svg");
    expect(markup).toContain('<button type="button">Show all</button>');
    const recovered = success(resolveLessonSequence(document, null));
    expect(recovered.document.presentation.activeStep).toBeUndefined();
    expect(recovered.document.presentation.annotations?.caption).toBe(
      document.presentation.annotations?.caption,
    );
    expect(document.presentation.activeStep).toBe("input");
  });

  test("controlled render-failure recovery remains disabled without a callback", () => {
    const document = lesson();
    first(document).description = "Unsupported 🧪";
    const markup = renderToStaticMarkup(
      <CircuitLessonSequence document={document} activeStep="input" />,
    );
    expect(markup).toContain('<button type="button" disabled="">Show all</button>');
    expect(markup).not.toContain("<svg");
  });

  test("multiple SSR instances have deterministic unique associations", () => {
    const document = lesson();
    const render = () =>
      renderToString(
        <>
          <CircuitLessonSequence document={document} />
          <CircuitLessonSequence document={document} />
        </>,
        { identifierPrefix: "steps-" },
      );
    const markup = render();
    expect(render()).toBe(markup);
    const ids = [...markup.matchAll(/\sid="([^"]+)"/g)].map((match) => match[1]);
    expect(new Set(ids).size).toBe(ids.length);
    for (const match of markup.matchAll(/aria-(?:controls|describedby)="([^"]+)"/g)) {
      for (const id of (match[1] ?? "").split(" ")) expect(ids).toContain(id);
    }
  });
});

test.skipIf(process.env.CIRCUITKIT_BROWSER_STEPS !== "1")(
  "browser: P2 persistence, reset, rejection recovery, canonical exports and diagnostic forwarding",
  async () => {
    const entry = `
      import { useState } from "react";
      import { createRoot } from "react-dom/client";
      import { CircuitLessonSequence } from "./src/react.tsx";
      import { dividerLesson } from "./app/lesson/documents.ts";
      import LessonClient from "./app/lesson/lesson-client.tsx";
      const initial = dividerLesson("geist-light", 10000);
      initial.presentation.activeStep = "output";
      window.saved = null;
      window.diagnosticEvents = [];
      window.selectionEvents = [];
      window.failDownload = false;
      const originalURL = URL.createObjectURL;
      URL.createObjectURL = (blob) => {
        if (window.failDownload) throw new Error("Test download failure");
        window.exported = blob;
        return originalURL(blob);
      };
      HTMLAnchorElement.prototype.click = function () {};
      function Harness() {
        const [document, setDocument] = useState(initial);
        const [activeStep, setActiveStep] = useState(null);
        const [apply, setApply] = useState(false);
        const [mode, setMode] = useState(false);
        const [reported, setReported] = useState([]);
        const [tick, setTick] = useState(0);
        const [host, setHost] = useState(false);
        const unsupported = (saved) => {
          const next = structuredClone(initial);
          next.presentation.steps[0].description = "Unsupported 🧪";
          if (saved) next.presentation.activeStep = "input";
          setDocument(next);
        };
        return <>
          <button id="replace" onClick={() => setDocument({ ...initial })}>Replace document</button>
          <button id="original-document" onClick={() => setDocument(initial)}>Original document</button>
          <button id="mode" onClick={() => setMode((previous) => !previous)}>Toggle control mode</button>
          <button id="rerender" onClick={() => setTick((previous) => previous + 1)}>Rerender {tick}</button>
          <button id="apply" onClick={() => setApply(true)}>Apply controlled changes</button>
          <button id="unsupported" onClick={() => unsupported(false)}>Unsupported inactive step</button>
          <button id="unsupported-saved" onClick={() => unsupported(true)}>Unsupported saved step</button>
          <button id="host-toggle" onClick={() => setHost((previous) => !previous)}>Toggle lesson host</button>
          <div id="uncontrolled"><CircuitLessonSequence document={document} activeStep={mode ? "reference" : undefined}
            onActiveStepChange={(id, selected) => window.selectionEvents.push({ id, document: selected })}
            onDiagnostics={(diagnostics) => {
              window.diagnosticEvents.push(diagnostics);
              if (window.diagnosticEvents.length > 20) throw new Error("Diagnostics callback loop");
              setReported(diagnostics);
            }} download /></div>
          <div id="controlled"><CircuitLessonSequence document={initial} activeStep={activeStep}
            onActiveStepChange={(id, selected) => { window.saved = { id, document: selected }; if (apply) setActiveStep(id); }} /></div>
          <output id="original">{JSON.stringify(initial)}</output>
          <output id="reported">{JSON.stringify(reported)}</output>
          {host ? <div id="lesson-host"><LessonClient /></div> : null}
        </>;
      }
      createRoot(window.document.getElementById("root")).render(<Harness />);
    `;
    const build = await Bun.build({
      entrypoints: ["teaching-step-harness"],
      target: "browser",
      format: "esm",
      plugins: [
        {
          name: "in-memory-teaching-harness",
          setup(builder) {
            builder.onResolve({ filter: /^teaching-step-harness$/ }, () => ({
              path: "harness",
              namespace: "steps",
            }));
            builder.onLoad({ filter: /.*/, namespace: "steps" }, () => ({
              contents: entry,
              loader: "tsx",
              resolveDir: new URL("..", import.meta.url).pathname,
            }));
          },
        },
      ],
    });
    expect(build.success, JSON.stringify(build.logs)).toBe(true);
    const script = build.outputs[0];
    if (!script) throw new Error("Browser harness did not build");
    const server = Bun.serve({
      hostname: "127.0.0.1",
      port: 0,
      fetch(request) {
        return new URL(request.url).pathname === "/harness.js"
          ? new Response(script, { headers: { "Content-Type": "application/javascript" } })
          : new Response(
              '<!doctype html><html lang="en"><title>Teaching sequence test</title><div id="root"></div><script type="module" src="/harness.js"></script></html>',
              { headers: { "Content-Type": "text/html" } },
            );
      },
    });
    const session = `circuitkit-steps-test-${process.pid}`;
    const browser = async (...args: string[]) => {
      const command = Bun.spawn(["agent-browser", "--session", session, "--json", ...args], {
        stdout: "pipe",
        stderr: "pipe",
      });
      const [stdout, stderr, code] = await Promise.all([
        new Response(command.stdout).text(),
        new Response(command.stderr).text(),
        command.exited,
      ]);
      expect(code, stderr || stdout).toBe(0);
      const envelope = JSON.parse(stdout);
      expect(envelope.success, stdout).toBe(true);
      return envelope.data;
    };
    const evaluate = async (source: string) => (await browser("eval", source)).result;
    const wait = (source: string) => browser("wait", "--fn", source);
    const selected = (scope: string, text: string) =>
      `document.querySelector('${scope} [aria-current="step"]')?.textContent === ${JSON.stringify(text)}`;
    const verifySaved = async (id: string | null) => {
      const document = await evaluate("window.saved.document");
      const full = success(renderFigureSVG(document));
      expect(document).toEqual(full.document);
      expect(document.presentation.activeStep).toBe(id ?? undefined);
      expect(JSON.parse(JSON.stringify(document))).toEqual(full.document);
      const encoded = encodeShareDocument(document);
      expect(encoded.ok).toBe(true);
      if (!encoded.ok) throw new Error(JSON.stringify(encoded.diagnostics));
      const decoded = decodeShareDocument(encoded.hash);
      expect(decoded.ok).toBe(true);
      if (!decoded.ok) throw new Error(JSON.stringify(decoded.diagnostics));
      expect(decoded.document).toEqual(document);
      expect(success(renderFigureSVG(decoded.document)).svg).toBe(full.svg);
      expect(document.presentation.annotations.caption).toBe(
        lesson().presentation.annotations?.caption,
      );
      expect(full.svg).toContain(`Focus nets: ${id === null ? "none" : id}.`);
    };
    try {
      await browser("open", server.url.href);
      await wait(selected("#uncontrolled", "2. Find the divider output"));
      await browser("click", "#uncontrolled nav > button:first-child");
      await wait(selected("#uncontrolled", "1. Start at the input"));
      expect(
        await evaluate("document.querySelector('#uncontrolled nav > button:first-child').disabled"),
      ).toBe(true);
      await browser("focus", "#uncontrolled nav > button:nth-child(2)");
      await browser("press", "Enter");
      await wait(selected("#uncontrolled", "2. Find the divider output"));
      await browser("click", "#uncontrolled nav > button:nth-child(2)");
      await wait(selected("#uncontrolled", "3. Identify the reference"));
      expect(
        await evaluate(
          "document.querySelector('#uncontrolled nav > button:nth-child(2)').disabled",
        ),
      ).toBe(true);
      await browser("hover", '#uncontrolled [data-legend-net="input"] button');
      await wait(
        "document.querySelector('#uncontrolled svg desc').textContent.includes('Focus nets: input.')",
      );
      expect(
        await evaluate(
          "document.querySelector('#uncontrolled [data-legend-net=ground] button').getAttribute('aria-pressed')",
        ),
      ).toBe("true");
      await evaluate("document.querySelector('#uncontrolled .circuit-lesson-download').click()");
      const exported = await evaluate("window.exported.text()");
      expect(exported).toContain("Focus nets: ground.");
      expect(exported).not.toContain('data-caption="true"');
      const savedStep = await evaluate("window.selectionEvents.at(-1).document");
      expect(savedStep.presentation.activeStep).toBe("reference");
      expect(exported).toBe(success(renderSchematicSVG(savedStep, { annotations: true })).svg);
      await browser("click", "#uncontrolled nav > button:nth-child(3)");
      await wait("!document.querySelector('#uncontrolled [aria-current=step]')");
      await browser("click", "#uncontrolled nav > button:nth-child(2)");
      await wait(selected("#uncontrolled", "1. Start at the input"));
      await browser("click", "#replace");
      await wait(selected("#uncontrolled", "2. Find the divider output"));
      await browser("click", "#original-document");
      await wait(selected("#uncontrolled", "2. Find the divider output"));
      await browser("click", "#uncontrolled nav > button:first-child");
      await wait(selected("#uncontrolled", "1. Start at the input"));
      await browser("click", "#mode");
      await wait(selected("#uncontrolled", "3. Identify the reference"));
      await browser("click", "#mode");
      await wait(selected("#uncontrolled", "2. Find the divider output"));
      console.log(
        "PASS browser P2: document round-trip and control-mode reset discard stale selection",
      );
      await evaluate("window.failDownload = true");
      await evaluate("document.querySelector('#uncontrolled .circuit-lesson-download').click()");
      await wait(
        "JSON.parse(document.querySelector('#reported').textContent).some(item => item.code === 'lesson.download_failed')",
      );
      const errorNotifications = await evaluate("window.diagnosticEvents.length");
      await evaluate("document.querySelector('#uncontrolled .circuit-lesson-download').click()");
      await browser("click", "#rerender");
      expect(await evaluate("window.diagnosticEvents.length")).toBe(errorNotifications);
      await evaluate("window.failDownload = false");
      await evaluate("document.querySelector('#uncontrolled .circuit-lesson-download').click()");
      await wait("document.querySelector('#reported').textContent === '[]'");
      expect(await evaluate("window.diagnosticEvents.length")).toBe(errorNotifications + 1);
      console.log(
        "PASS browser P2: child export errors and recovery reach an inline state-updating callback without loops",
      );
      await browser("click", "#unsupported");
      await wait(selected("#uncontrolled", "2. Find the divider output"));
      const acceptedBeforeRejection = await evaluate("window.selectionEvents.length");
      await browser("click", "#uncontrolled nav > button:first-child");
      await wait(
        "document.querySelector('#uncontrolled [role=alert]')?.textContent.includes('font.missing_glyph')",
      );
      expect(await evaluate("document.querySelector('#uncontrolled svg') !== null")).toBe(true);
      expect(await evaluate(selected("#uncontrolled", "2. Find the divider output"))).toBe(true);
      expect(await evaluate("window.selectionEvents.length")).toBe(acceptedBeforeRejection);
      await wait(
        "JSON.parse(document.querySelector('#reported').textContent).some(item => item.code === 'font.missing_glyph')",
      );
      await browser("click", "#uncontrolled nav > button:nth-child(3)");
      await wait(
        "!document.querySelector('#uncontrolled [aria-current=step]') && !document.querySelector('#uncontrolled [role=alert]')",
      );
      await wait("document.querySelector('#reported').textContent === '[]'");
      await browser("click", "#unsupported-saved");
      await wait(
        "document.querySelector('#uncontrolled [role=alert]') !== null && document.querySelector('#uncontrolled svg') === null",
      );
      await browser("click", "#uncontrolled > section > button");
      await wait(
        "document.querySelector('#uncontrolled svg') !== null && !document.querySelector('#uncontrolled [role=alert]')",
      );
      expect(
        await evaluate(
          "window.selectionEvents.at(-1).document.presentation.activeStep === undefined",
        ),
      ).toBe(true);
      console.log(
        "PASS browser P2: rejected steps cannot persist and render-invalid saved steps recover through Show all",
      );
      await browser("click", "#replace");
      await wait(selected("#uncontrolled", "2. Find the divider output"));
      await browser("click", "#controlled nav > button:nth-child(2)");
      await wait("window.saved?.id === 'input'");
      expect(
        await evaluate("document.querySelector('#controlled [aria-current=step]') === null"),
      ).toBe(true);
      expect(await evaluate("window.saved.document.presentation.activeStep")).toBe("input");
      await verifySaved("input");
      expect(await evaluate("window.saved.document.presentation.annotations.caption")).toBe(
        lesson().presentation.annotations?.caption,
      );
      await browser("click", "#apply");
      await browser("click", "#controlled nav > button:nth-child(2)");
      await wait(selected("#controlled", "1. Start at the input"));
      await browser("click", "#controlled nav > button:nth-child(3)");
      await wait(
        "window.saved?.id === null && !document.querySelector('#controlled [aria-current=step]')",
      );
      expect(
        await evaluate("Object.hasOwn(window.saved.document.presentation, 'activeStep')"),
      ).toBe(false);
      expect(
        await evaluate(
          "JSON.parse(document.querySelector('#original').textContent).presentation.activeStep",
        ),
      ).toBe("output");
      await verifySaved(null);
      console.log(
        "PASS browser P2: controlled callbacks supply canonical documents for JSON copy, share and static export",
      );
      await browser("click", "#host-toggle");
      await browser("click", "#lesson-host button[aria-controls=lesson-sequences]");
      await wait("document.querySelectorAll('#lesson-host .circuit-lesson-sequence').length === 3");
      const choices = [
        ["divider", 2, "2. Find the divider output"],
        ["rc", 3, "3. Keep the capacitor plates separate"],
        ["amplifier", 2, "2. Trace the feedback resistor"],
      ] as const;
      for (const [id, index, title] of choices) {
        await browser(
          "click",
          `#lesson-host .lesson-sequence-${id} .circuit-lesson-sequence-steps li:nth-child(${index}) button`,
        );
        await wait(selected(`#lesson-host .lesson-sequence-${id}`, title));
      }
      await browser("select", "#lesson-host .lesson-settings select", "geist-dark");
      for (const [id, , title] of choices)
        await wait(selected(`#lesson-host .lesson-sequence-${id}`, title));
      await browser("fill", "#lesson-host .lesson-settings input[type=text]", "22000");
      await wait(
        "document.querySelector('#lesson-host .lesson-sequence-divider svg desc')?.textContent.includes('22 kΩ')",
      );
      for (const [id, , title] of choices)
        await wait(selected(`#lesson-host .lesson-sequence-${id}`, title));
      await browser("check", "#lesson-host .lesson-qa input");
      await wait(
        "document.querySelector('#lesson-host .lesson-sequence-divider [role=alert]') !== null",
      );
      await browser("uncheck", "#lesson-host .lesson-qa input");
      await wait(selected("#lesson-host .lesson-sequence-divider", "2. Find the divider output"));
      await browser("click", "#lesson-host button[aria-controls=lesson-sequences]");
      await wait("document.querySelectorAll('#lesson-host .circuit-lesson-sequence').length === 0");
      await browser("click", "#lesson-host button[aria-controls=lesson-sequences]");
      for (const [id, index, title] of choices) {
        await wait(selected(`#lesson-host .lesson-sequence-${id}`, title));
        await evaluate(
          `document.querySelector('#lesson-host .lesson-sequence-${id} .circuit-lesson-download').click()`,
        );
        const svg = await evaluate("window.exported.text()");
        const document =
          id === "divider"
            ? dividerLesson("geist-dark", 22000)
            : id === "rc"
              ? rcLesson("geist-dark")
              : amplifierLesson("geist-dark");
        const saved = success(
          resolveLessonSequence(document, document.presentation.steps?.[index - 1]?.id),
        );
        expect(svg).toBe(success(renderSchematicSVG(saved.document, { annotations: true })).svg);
        expect(svg).not.toContain('data-caption="true"');
        if (id === "divider") expect(svg).toContain("22 kΩ");
      }
      await browser("click", "#lesson-host .lesson-sequence-divider nav > button:nth-child(3)");
      await wait(
        "!document.querySelector('#lesson-host .lesson-sequence-divider [aria-current=step]')",
      );
      await browser("select", "#lesson-host .lesson-settings select", "geist-print");
      expect(
        await evaluate(
          "document.querySelector('#lesson-host .lesson-sequence-divider [aria-current=step]') === null",
        ),
      ).toBe(true);
      for (const [id, , title] of choices.slice(1))
        await wait(selected(`#lesson-host .lesson-sequence-${id}`, title));
      console.log(
        "PASS browser P2: all lesson selections survive theme/value edits, invalid-input recovery and hide/show independently",
      );
    } finally {
      await browser("close");
      server.stop(true);
    }
  },
  120000,
);

describe("portable authored lessons", () => {
  for (const [name, create] of [
    ["voltage-divider", () => dividerLesson("geist-light", 10000)],
    ["rc-lowpass", () => rcLesson("geist-light")],
    ["feedback-amplifier", () => amplifierLesson("geist-light")],
  ] as const) {
    test(`${name}: every step and Markdown fallback contains a valid authored document`, async () => {
      const document = create();
      for (const theme of themePresets) {
        document.presentation.theme.preset = theme;
        for (const step of document.presentation.steps ?? []) {
          const result = success(resolveLessonSequence(document, step.id));
          success(renderFigureSVG(result.document));
          expect(result.annotations?.caption).toContain(step.description);
        }
      }
      const json = await Bun.file(
        new URL(`../examples/lessons/${name}.json`, import.meta.url),
      ).json();
      const markdown = await Bun.file(
        new URL(`../examples/lessons/${name}.md`, import.meta.url),
      ).text();
      const fenced = markdown.match(/```circuitkit\n([\s\S]*?)\n```/);
      expect(fenced).not.toBeNull();
      expect(JSON.parse(fenced?.[1] ?? "null")).toEqual(json);
      success(renderFigureSVG(json));
      expect(markdown).toContain("without a CircuitKit adapter");
      expect(markdown).not.toContain("/Gradual");
    });
  }
});
