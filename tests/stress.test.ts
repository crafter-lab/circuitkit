import { describe, expect, test } from "bun:test";
import { getComplexStressCases } from "../app/gallery/complex-corpus.ts";
import { getGalleryCase, getGalleryCases } from "../app/gallery/corpus.ts";
import {
  getStressCases,
  routingInvariants,
  runStress,
  type StressReport,
} from "../app/gallery/stress.ts";
import { getCatalog, getSchema, inspect, loadExample, renderSVG, validate } from "../src/index.ts";
import {
  basicRecipeIds,
  complexRecipeIds,
  componentPins,
  type FigureDocument,
  figureSchema,
  recipeIds,
  themePresets,
} from "../src/schema.ts";

const gallery = getGalleryCases();

describe("gallery corpus", () => {
  test("purposeful scenarios cover the full recipe/theme matrix with unique IDs", () => {
    expect(gallery.length).toBe(
      new Set(gallery.map(({ scenarioId }) => scenarioId)).size * themePresets.length,
    );
    expect(new Set(gallery.map(({ recipe }) => recipe)).size).toBe(recipeIds.length);
    expect(
      gallery.filter(({ recipe }) => basicRecipeIds.some((basic) => basic === recipe)),
    ).toHaveLength(357);
    expect(new Set(gallery.map(({ id }) => id)).size).toBe(gallery.length);
    const scenarios = new Map<string, typeof gallery>();
    for (const entry of gallery) {
      scenarios.set(entry.scenarioId, [...(scenarios.get(entry.scenarioId) ?? []), entry]);
      expect(entry.id).toBe(`${entry.scenarioId}/${entry.preset}`);
      expect(entry.tags.length).toBeGreaterThan(0);
      expect(entry.description.length).toBeGreaterThan(20);
      if (entry.expectation.kind === "diagnostic") expect(entry.group).toBe("edge-cases");
    }
    for (const entries of scenarios.values()) {
      expect(entries.map(({ preset }) => preset).sort()).toEqual([...themePresets].sort());
      expect(new Set(entries.map(({ recipe }) => recipe)).size).toBe(1);
      expect(new Set(entries.map(({ expectation }) => JSON.stringify(expectation))).size).toBe(1);
    }
    for (const recipe of recipeIds) {
      for (const preset of themePresets) {
        const entries = gallery.filter(
          (entry) => entry.recipe === recipe && entry.preset === preset,
        );
        expect(
          entries.some(
            ({ group, expectation }) => group === "examples" && expectation.kind === "render",
          ),
        ).toBe(true);
        expect(
          entries.some(
            ({ group, expectation }) => group === "edge-cases" && expectation.kind === "render",
          ),
        ).toBe(true);
        expect(entries.some(({ expectation }) => expectation.kind === "diagnostic")).toBe(true);
      }
    }
  });

  test("fresh documents and metadata are JSON-serializable and isolated", () => {
    const first = getGalleryCases();
    const second = getGalleryCases();
    expect(JSON.parse(JSON.stringify(first))).toEqual(first);
    const entry = first[0];
    if (!entry) throw new Error("Empty gallery");
    const original = structuredClone(entry);
    expect(getGalleryCase(entry.id)).toEqual(original);
    (entry.document as FigureDocument).presentation.title = "Changed by consumer";
    entry.tags.push("changed");
    entry.expectation.kind = "render";
    expect(second[0]).toEqual(original);
    expect(getGalleryCase(entry.id)).toEqual(original);
    expect(getGalleryCase("missing")).toBeUndefined();
    const otherTheme = first[1];
    if (!otherTheme) throw new Error("Missing second theme");
    expect((otherTheme.document as FigureDocument).presentation.title).not.toBe(
      "Changed by consumer",
    );
  });

  for (const entry of gallery) {
    test(`${entry.id}: expected ${entry.expectation.kind}`, () => {
      const before = structuredClone(entry.document);
      const result = renderSVG(entry.document);
      expect(entry.document).toEqual(before);
      if (entry.expectation.kind === "render") {
        expect(result.ok, JSON.stringify(result.diagnostics)).toBe(true);
      } else {
        expect(result.ok).toBe(false);
        expect(result).not.toHaveProperty("svg");
        expect(result.diagnostics.map(({ code }) => code)).toContain(entry.expectation.code);
      }
    });
  }

  test("public schema and catalog advertise the corpus contract", () => {
    const catalog = getCatalog();
    expect(catalog.recipes.map(({ id }) => id)).toEqual([...recipeIds]);
    expect(catalog.themes.presets).toEqual([...themePresets]);
    expect(getSchema()).toHaveProperty("properties.version");
    for (const entry of gallery.filter(({ expectation }) => expectation.kind === "render")) {
      expect(figureSchema.safeParse(entry.document).success).toBe(true);
    }
  });
});

describe("complex topology coverage", () => {
  for (const recipe of complexRecipeIds) {
    test(`${recipe}: genuine role graph, original values, all focuses and author IDs`, () => {
      const base = loadExample(recipe);
      const cases = gallery.filter(
        (entry) => entry.recipe === recipe && entry.preset === themePresets[0],
      );
      expect(
        cases.find(({ scenarioId }) => scenarioId === `${recipe}/base-graph`)?.document,
      ).toMatchObject({ circuit: base.circuit, layout: base.layout });
      for (const id of Object.keys(base.circuit.components))
        expect(
          cases.some(({ scenarioId }) => scenarioId === `${recipe}/focus-component-${id}`),
        ).toBe(true);
      for (const net of Object.keys(base.circuit.nets))
        expect(cases.some(({ scenarioId }) => scenarioId === `${recipe}/focus-net-${net}`)).toBe(
          true,
        );
      expect(
        cases.filter(
          ({ tags, expectation }) => tags.includes("values") && expectation.kind === "render",
        ).length,
      ).toBeGreaterThan(1);
      for (const entry of cases.filter(({ tags }) => tags.includes("graph-mutation"))) {
        expect(entry.expectation.kind).toBe("diagnostic");
        expect(
          entry.tags.some((tag) => tag.startsWith("/circuit/") || tag.startsWith("/layout/")),
        ).toBe(true);
      }
      const author = cases.find(({ scenarioId }) => scenarioId === `${recipe}/author-ids`);
      const detail = inspect(author?.document);
      expect(detail.ok).toBe(true);
      if (detail.ok) {
        expect(Object.keys(detail.nets)).toContain("node/one~");
        expect(Object.keys(detail.components).every((id) => id.startsWith("X"))).toBe(true);
      }
    });

    test(`${recipe}: exhaustive endpoint targets, net pairs and component mutations`, () => {
      const base = loadExample(recipe);
      const nets = Object.values(base.circuit.nets);
      const endpoints = nets.flat().sort();
      const cases = getComplexStressCases().filter(({ id }) =>
        id.startsWith(`complex-graph/${recipe}/`),
      );
      expect(
        cases.every(({ tags }) =>
          tags?.some((tag) => tag.startsWith("/circuit/") || tag.startsWith("/layout/")),
        ),
      ).toBe(true);
      const selected = (prefix: string) =>
        cases.filter(({ id }) => id.startsWith(`complex-graph/${recipe}/${prefix}`));
      const rewired = [...selected("move-"), ...selected("exchange-")];
      expect(rewired.length).toBe(endpoints.length * (nets.length - 1) * themePresets.length);
      expect(selected("disconnect-").length).toBe(endpoints.length * themePresets.length);
      expect(selected("merge-").length).toBe(
        ((nets.length * (nets.length - 1)) / 2) * themePresets.length,
      );
      expect(selected("split-").length).toBe(
        nets.filter((net) => net.length >= 4).length * themePresets.length,
      );
      expect(selected("delete-branch-").length).toBe(
        Object.keys(base.circuit.components).length * themePresets.length,
      );
      expect(selected("wrong-role-").length).toBe(
        Object.keys(base.circuit.components).length * themePresets.length,
      );
      for (const entry of [...rewired, ...selected("merge-"), ...selected("split-")]) {
        const parsed = figureSchema.safeParse(entry.document);
        expect(parsed.success, entry.id).toBe(true);
        if (parsed.success)
          expect(Object.values(parsed.data.circuit.nets).flat().sort()).toEqual(endpoints);
        expect(entry.expectation).toEqual({ kind: "diagnostic", code: "layout.topology_mismatch" });
      }
      const valueCases = getComplexStressCases().filter(({ id }) =>
        id.startsWith(`complex-e12/${recipe}/`),
      );
      const expectedValues =
        Object.values(base.circuit.components).reduce(
          (sum, component) =>
            sum +
            (component.type === "dc-source"
              ? 4
              : component.type === "resistor" || component.type === "capacitor"
                ? 12
                : 0),
          0,
        ) * themePresets.length;
      expect(valueCases.length).toBe(expectedValues);
      expect(valueCases.every(({ expectation }) => expectation.kind === "render")).toBe(true);
      const oriented = Object.values(base.circuit.components).filter(({ type }) =>
        ["diode", "led", "npn", "op-amp", "dc-source"].includes(type),
      );
      expect(selected("reverse-").length).toBe(
        oriented.reduce(
          (sum, component) =>
            sum +
            (componentPins[component.type].length * (componentPins[component.type].length - 1)) / 2,
          0,
        ) * themePresets.length,
      );
    });

    test(`${recipe}: emitted routes are connected and declaration order is immaterial`, () => {
      const document = loadExample(recipe);
      const result = renderSVG(document);
      const detail = inspect(document);
      expect(result.ok).toBe(true);
      expect(detail.ok).toBe(true);
      if (!result.ok || !detail.ok) return;
      expect(routingInvariants(document, result.svg, detail.endpoints)).toEqual([]);
      document.circuit.nets = Object.fromEntries(
        Object.entries(document.circuit.nets)
          .reverse()
          .map(([net, pins]) => [net, [...pins].reverse()]),
      );
      expect(renderSVG(document)).toEqual(result);
      expect(result.svg).toContain(`viewBox="0 0 ${result.bounds.width} ${result.bounds.height}"`);
    });
  }

  test("wire oracle detects omissions, disconnected islands, false shorts and false junctions", () => {
    const document = loadExample("loaded-divider");
    const result = renderSVG(document);
    const detail = inspect(document);
    if (!result.ok || !detail.ok) throw new Error("Loaded divider baseline must render");
    const missing = result.svg.replace(/<path\b[^>]*data-net="input"[^>]*\/>/g, "");
    expect(
      routingInvariants(document, missing, detail.endpoints).some((message) =>
        message.includes("no SVG wires"),
      ),
    ).toBe(true);
    const added = (tag: string) => result.svg.replace("</svg>", `${tag}</svg>`);
    expect(
      routingInvariants(
        document,
        added('<path data-net="input" d="M80 200L100 200"/>'),
        detail.endpoints,
      ).some((message) => message.includes("disconnected wire islands")),
    ).toBe(true);
    expect(
      routingInvariants(
        document,
        added('<path data-net="input" d="M460 300L1100 300"/>'),
        detail.endpoints,
      ).some((message) => message.includes("false short/crossing")),
    ).toBe(true);
    expect(
      routingInvariants(
        document,
        added('<circle data-junction="input" cx="180" cy="300" r="4"/>'),
        detail.endpoints,
      ).some((message) => message.includes("false junction")),
    ).toBe(true);
  });
});

describe("deterministic stress suite", () => {
  let referenceReport: StressReport | undefined;

  test("SI sweeps and IEEE754 runtime cases have stable unique IDs", () => {
    const first = getStressCases();
    const second = getStressCases();
    expect(first.length).toBeGreaterThan(1_000);
    expect(first).toEqual(second);
    expect(new Set(first.map(({ id }) => id)).size).toBe(first.length);
    expect(first.some(({ id }) => id.includes("negative-zero"))).toBe(true);
    expect(first.some(({ id }) => id.includes("NaN"))).toBe(true);
    expect(first.filter(({ id }) => id.startsWith("gallery/")).length).toBe(gallery.length);
  });

  test("every progress event is completed work and every unexpected invariant failure is retained", () => {
    const runner = runStress();
    let previousElapsed = 0;
    let completed = 0;
    let report: StressReport;
    for (;;) {
      const next = runner.next();
      if (next.done) {
        report = next.value;
        break;
      }
      const progress = next.value;
      completed++;
      expect(progress.completed).toBe(completed);
      expect(progress.completed).toBe(progress.passed + progress.failed);
      expect(progress.rendered + progress.rejected).toBeLessThanOrEqual(progress.completed);
      expect(progress.elapsedMs).toBeGreaterThanOrEqual(previousElapsed);
      expect(progress.currentCase.length).toBeGreaterThan(0);
      previousElapsed = progress.elapsedMs;
    }
    referenceReport = report;
    expect(report.completed).toBe(report.total);
    expect(completed).toBe(report.total);
    expect(report.cases.length).toBe(report.total);
    expect(report.failed).toBe(report.failures.length);
    expect(report.passed).toBe(report.cases.filter(({ passed }) => passed).length);
    expect(report.rendered).toBe(
      report.cases.filter(({ outcome }) => outcome === "rendered").length,
    );
    expect(report.rejected).toBe(
      report.cases.filter(({ outcome }) => outcome === "rejected").length,
    );
    expect(report.ok).toBe(report.failed === 0);
    expect(
      report.cases.every(
        (row) =>
          row.elapsedMs >= 0 && !Object.hasOwn(row, "svg") && !Object.hasOwn(row, "document"),
      ),
    ).toBe(true);
    for (const failure of report.failures) {
      expect(failure.invariants.length).toBeGreaterThan(0);
      expect(failure).toHaveProperty("document");
      expect(report.cases.find(({ id }) => id === failure.id)?.passed).toBe(false);
    }
    expect(report.failures.map(({ id, invariants }) => ({ id, invariants }))).toEqual([]);
  }, 300_000);

  test("worker terminates, restarts and reports the same completed cases without SVG payloads", async () => {
    const url = new URL("../app/gallery/stress.worker.ts", import.meta.url);
    const cancelled = new Worker(url, { type: "module" });
    try {
      await new Promise<void>((resolve, reject) => {
        cancelled.onerror = (event) => reject(new Error(event.message));
        cancelled.onmessage = (event) => {
          if (event.data.type === "error") reject(new Error(event.data.message));
          if (event.data.type === "progress") resolve();
        };
        cancelled.postMessage({ type: "run" });
      });
    } finally {
      cancelled.terminate();
    }
    const worker = new Worker(url, { type: "module" });
    const progress: number[] = [];
    try {
      const report = await new Promise<StressReport>((resolve, reject) => {
        worker.onerror = (event) => reject(new Error(event.message));
        worker.onmessage = (event) => {
          if (event.data.type === "progress") progress.push(event.data.progress.completed);
          else if (event.data.type === "done") resolve(event.data.report);
          else if (event.data.type === "error") reject(new Error(event.data.message));
        };
        worker.postMessage({ type: "run" });
      });
      expect(progress).toEqual(Array.from({ length: report.total }, (_, index) => index + 1));
      expect(report.completed).toBe(getStressCases().length);
      if (!referenceReport) {
        const runner = runStress();
        let next = runner.next();
        while (!next.done) next = runner.next();
        referenceReport = next.value;
      }
      const rows = (value: StressReport) => value.cases.map(({ elapsedMs: _, ...row }) => row);
      expect(rows(report)).toEqual(rows(referenceReport));
      expect(report.failures).toEqual(referenceReport.failures);
      expect(report.ok).toBe(referenceReport.ok);
      expect(JSON.stringify(report)).not.toContain("<svg");
    } finally {
      worker.terminate();
    }
  }, 300_000);
});

describe("numerical regressions", () => {
  test("scaled RC equivalents retain the same ideal cutoff", () => {
    for (const slug of ["audio-low", "scaled-low-r", "scaled-high-r"]) {
      const entry = getGalleryCase(`rc-lowpass/${slug}/geist-light`);
      const result = renderSVG(entry?.document);
      expect(result.ok).toBe(true);
      if (result.ok) expect(result.svg).toContain("159 Hz");
    }
  });

  test("overflow-safe equal divider values preserve one half", () => {
    const document = loadExample("voltage-divider");
    document.circuit.components.R1 = { type: "resistor", resistance: Number.MAX_VALUE };
    document.circuit.components.R2 = { type: "resistor", resistance: Number.MAX_VALUE };
    const result = renderSVG(document);
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.svg).toContain("Rbottom/(Rtop+Rbottom) = 0.5");
  });

  test("positive finite divider underflow must be diagnosed, never displayed as zero", () => {
    const document = loadExample("voltage-divider");
    document.circuit.components.R1 = { type: "resistor", resistance: Number.MAX_VALUE };
    document.circuit.components.R2 = { type: "resistor", resistance: Number.MIN_VALUE };
    for (const api of [renderSVG, validate, inspect]) {
      const result = api(document);
      expect(
        result.ok,
        "Unrepresentable positive divider ratio requires an actionable diagnostic, not a zero-valued drawing",
      ).toBe(false);
      expect(result).not.toHaveProperty("svg");
      expect(result.diagnostics.length).toBeGreaterThan(0);
    }
  });
});
