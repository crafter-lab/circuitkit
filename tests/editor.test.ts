import { describe, expect, test } from "bun:test";
import {
  addStep,
  applyMarkdownSource,
  applySource,
  changeNumber,
  changeSource,
  changeSourceMode,
  clearNumber,
  createEditor,
  documentMarkdown,
  editableDocument,
  editorDiagnostics,
  evaluateEditor,
  loadShare,
  moveStep,
  pointerSegment,
  positiveNumber,
  removeStep,
  renameStep,
  selectMarkdownFigure,
  updateDocument,
} from "../src/editor.ts";
import { loadExample, renderFigureSVG, renderSchematicSVG, renderSVG } from "../src/index.ts";
import { parseCircuitMarkdown } from "../src/markdown.ts";
import { encodeShareDocument, type ShareView } from "../src/share.ts";

const views: ShareView[] = ["schematic", "annotated", "figure"];

const resistancePath = "/circuit/components/R1/resistance";
const initial = () => createEditor(loadExample("rc-lowpass"));
const canonical = (document: ReturnType<typeof loadExample>) => {
  const result = renderFigureSVG(document);
  if (!result.ok) throw new Error(JSON.stringify(result.diagnostics));
  return result.document;
};
const setResistance = (document: ReturnType<typeof loadExample>, value: number) => {
  const component = document.circuit.components.R1;
  if (component?.type === "resistor") component.resistance = value;
};

describe("canonical editor revisions", () => {
  test("playground snapshots change events before deferred callbacks", async () => {
    const source = await Bun.file(new URL("../app/playground.tsx", import.meta.url)).text();
    const handlers = [...source.matchAll(/onChange=\{\(event\) =>/g)];
    const snapshots = [
      ...source.matchAll(
        /onChange=\{\(event\) => \{\s*const value = event\.currentTarget\.value(?: as [^;]+)?;/g,
      ),
    ];
    const eventReads = [...source.matchAll(/event\.(?:currentTarget|target)\.value/g)];
    expect(handlers.length).toBeGreaterThanOrEqual(7);
    expect(snapshots).toHaveLength(handlers.length);
    expect(eventReads).toHaveLength(snapshots.length);
  });

  test("clearing an edited SI value invalidates the exact current revision", () => {
    const edited = changeNumber(initial(), resistancePath, "20000", setResistance);
    expect(evaluateEditor(edited).ok).toBe(true);
    const cleared = changeNumber(edited, resistancePath, "", setResistance);
    const result = evaluateEditor(cleared);
    expect(cleared.inputs[resistancePath]).toBe("");
    expect(result.ok).toBe(false);
    expect("svg" in result).toBe(false);
    expect(result.diagnostics).toContainEqual({
      code: "document.invalid_field",
      path: resistancePath,
      message: "Enter a finite, positive number in SI units, without a unit suffix.",
    });
    expect(JSON.parse(cleared.draftText).circuit.components.R1.resistance).toBe(20000);
    const recovered = changeNumber(cleared, resistancePath, "33000", setResistance);
    expect(evaluateEditor(recovered).ok).toBe(true);
  });

  test("any JSON keystroke immediately invalidates preview, copy, and download eligibility", () => {
    const state = initial();
    expect(evaluateEditor(state).ok).toBe(true);
    const draft = changeSource(state, `${state.draftText}\n`);
    const result = evaluateEditor(draft);
    expect(result.ok).toBe(false);
    expect("svg" in result).toBe(false);
    expect(editableDocument(draft)).toBeNull();
    expect(evaluateEditor(applySource(draft)).ok).toBe(true);
  });

  test("invalid syntax is preserved after apply without keeping a good figure", () => {
    const state = applySource(changeSource(initial(), '{"version":'));
    expect(state.draftText).toBe('{"version":');
    expect(state.document).toBeNull();
    expect(evaluateEditor(state)).toEqual({
      ok: false,
      diagnostics: [
        {
          code: "document.invalid_json",
          path: "",
          message: "Invalid JSON. Your text has been preserved; correct it and apply again.",
        },
      ],
    });
  });

  test("schema and topology errors preserve source and expose renderer diagnostics", () => {
    const document = loadExample("rc-lowpass");
    document.circuit.nets.input = ["VIN", "R1.c"];
    const text = JSON.stringify(document, null, 4);
    const state = applySource(changeSource(initial(), text));
    const result = evaluateEditor(state);
    expect(state.draftText).toBe(text);
    expect(result.ok).toBe(false);
    expect(result.diagnostics.some((diagnostic) => diagnostic.code === "circuit.unknown_pin")).toBe(
      true,
    );
  });

  test.each(["", " ", "0", "-10", "10 kΩ", "NaN", "Infinity", "1e999", "0x10", "1e"])(
    "invalid SI draft %j cannot revive a stale result",
    (text) => {
      const state = changeNumber(initial(), resistancePath, text, setResistance);
      expect(state.inputs[resistancePath]).toBe(text);
      expect(evaluateEditor(state).ok).toBe(false);
      const changedTheme = updateDocument(state, (document) => {
        document.presentation.theme.preset = "geist-dark";
      });
      expect(evaluateEditor(changedTheme).ok).toBe(false);
      const corrected = changeNumber(changedTheme, resistancePath, "22000", setResistance);
      expect(evaluateEditor(corrected).ok).toBe(true);
      expect(editableDocument(corrected)?.circuit.components.R1).toEqual({
        type: "resistor",
        resistance: 22000,
      });
    },
  );

  test.each(["1e-7", "10000", ".5", "+5", " 330 "])(
    "accepts positive decimal SI input %j",
    (text) => {
      expect(positiveNumber(text)).toBe(Number(text));
    },
  );

  test("blank titles remove the current figure and remain editable", () => {
    const state = updateDocument(initial(), (document) => {
      document.presentation.title = "";
    });
    expect(editableDocument(state)?.presentation.title).toBe("");
    expect(evaluateEditor(state).ok).toBe(false);
    const recovered = updateDocument(state, (document) => {
      document.presentation.title = "Filtro RC";
    });
    expect(evaluateEditor(recovered).ok).toBe(true);
  });

  test("partial color input remains editable while core rejects it", () => {
    const state = updateDocument(initial(), (document) => {
      document.presentation.theme.overrides = { highlight: "#" };
    });
    expect(evaluateEditor(state).ok).toBe(false);
    expect(editableDocument(state)?.presentation.theme.overrides?.highlight).toBe("#");
    const recovered = updateDocument(state, (document) => {
      delete document.presentation.theme.overrides?.highlight;
    });
    expect(evaluateEditor(recovered).ok).toBe(true);
  });

  test("empty numeric override blocks output until explicit reset", () => {
    const path = "/presentation/theme/overrides/fontScale";
    const state = changeNumber(initial(), path, "", (document, value) => {
      document.presentation.theme.overrides = { fontScale: value };
    });
    expect(editorDiagnostics(state).map((diagnostic) => diagnostic.path)).toContain(path);
    const reset = clearNumber(state, path, (document) => {
      delete document.presentation.theme.overrides?.fontScale;
    });
    expect(evaluateEditor(reset).ok).toBe(true);
  });

  test("valid edits do not mutate host documents or connectivity", () => {
    const state = initial();
    const snapshot = JSON.stringify(state.document);
    const updated = changeNumber(state, resistancePath, "22000", setResistance);
    expect(JSON.stringify(state.document)).toBe(snapshot);
    expect(editableDocument(updated)?.circuit.nets).toEqual(editableDocument(state)?.circuit.nets);
    expect(JSON.parse(updated.draftText)).toEqual(updated.document);
  });

  test("applying JSON explicitly replaces invalid form drafts", () => {
    const state = changeNumber(initial(), resistancePath, "", setResistance);
    const applied = applySource(state);
    expect(applied.inputs).toEqual({});
    expect(evaluateEditor(applied).ok).toBe(true);
  });

  test("schema-invalid JSON does not unlock form edits and can recover through source", () => {
    const state = applySource(changeSource(initial(), "null"));
    expect(editableDocument(state)).toBeNull();
    expect(evaluateEditor(state).ok).toBe(false);
    expect(
      updateDocument(state, (document) => {
        document.presentation.title = "ignored";
      }),
    ).toBe(state);
    const recovered = applySource(changeSource(state, initial().draftText));
    expect(evaluateEditor(recovered).ok).toBe(true);
  });

  test("pointer paths preserve author IDs", () => {
    expect(pointerSegment("R/1~A")).toBe("R~11~0A");
  });
});

describe("editor presentation views", () => {
  test("the default is circuit-only even when explanatory content is authored", () => {
    const document = loadExample("rc-lowpass");
    document.presentation.annotations = {
      nets: [{ net: "input", label: "Signal", description: "Before the resistor", tone: "cyan" }],
      legend: true,
      caption: "Authored caption",
    };
    const state = createEditor(document);
    expect(state.view).toBe("schematic");
    const result = evaluateEditor(state);
    expect(result).toEqual(renderSchematicSVG(document));
    if (!result.ok) throw new Error(JSON.stringify(result.diagnostics));
    expect(result.svg).not.toMatch(/data-net-label=|data-net-halo=|data-caption=|data-legend-net=/);
    expect(result.svg).not.toContain("Authored caption");
  });

  test.each(views)("%s matches its renderer without mutating source or JSON", (view) => {
    const document = loadExample("rc-lowpass");
    document.presentation.annotations = {
      nets: [{ net: "input", label: "Signal", description: "Before the resistor", tone: "cyan" }],
      legend: true,
      caption: "Authored caption",
    };
    addStep(document);
    const json = JSON.stringify(document);
    const state = createEditor(document, view);
    const snapshot = structuredClone(state);
    const result = evaluateEditor(state);
    expect(result.ok).toBe(true);
    expect(result).toEqual(
      view === "figure"
        ? renderFigureSVG(document)
        : renderSchematicSVG(document, { annotations: view === "annotated" }),
    );
    if (!result.ok) throw new Error(JSON.stringify(result.diagnostics));
    expect(result.document).not.toHaveProperty("view");
    expect(result.document.presentation).not.toHaveProperty("view");
    expect(JSON.parse(state.draftText)).toEqual(document);
    expect(state).toEqual(snapshot);
    expect(JSON.stringify(document)).toBe(json);
    for (const nextView of views) {
      const switched = { ...state, view: nextView };
      expect(evaluateEditor(switched).ok).toBe(true);
      expect(switched.document).toBe(state.document);
      expect(switched.controls).toBe(state.controls);
      expect(switched.draftText).toBe(state.draftText);
    }
    expect(JSON.stringify(document)).toBe(json);
  });

  test.each(views)("switching to %s cannot revive an invalid revision", async (view) => {
    const markdown = changeSourceMode(initial(), "markdown");
    const invalid = [
      changeSource(initial(), initial().draftText),
      applySource(changeSource(initial(), "{")),
      applySource(changeSource(initial(), "null")),
      changeNumber(initial(), resistancePath, "", setResistance),
      updateDocument(initial(), (document) => {
        document.presentation.title = " ";
      }),
      updateDocument(initial(), (document) => {
        document.circuit.nets.input = ["VIN", "R1.missing"];
      }),
      loadShare(initial(), "#v=1&doc=bad&view=figure"),
      markdown,
      await applyMarkdownSource(changeSource(markdown, "```circuitkit\ninvalid\n```")),
      await applyMarkdownSource(
        changeSource(markdown, documentMarkdown(loadExample("rc-lowpass")).repeat(2)),
      ),
    ];
    for (const state of invalid) {
      const snapshot = structuredClone(state);
      const previous = evaluateEditor(state);
      expect(previous.ok).toBe(false);
      const switched = { ...state, view };
      expect(evaluateEditor(switched)).toEqual(previous);
      expect(evaluateEditor(switched)).not.toHaveProperty("svg");
      expect(switched.draftText).toBe(state.draftText);
      expect(state).toEqual(snapshot);
    }
  });

  test.each(views)("source and Markdown replacements preserve %s", async (view) => {
    const state = createEditor(loadExample("rc-lowpass"), view);
    const replacement = loadExample("led-series");
    const draft = changeSource(state, JSON.stringify(replacement));
    expect(draft.view).toBe(view);
    const applied = applySource(draft);
    expect(applied.view).toBe(view);
    expect(applied.document).toEqual(replacement);
    expect(updateDocument(applied, addStep).view).toBe(view);
    const markdown = changeSourceMode(applied, "markdown");
    expect(markdown.view).toBe(view);
    const single = await applyMarkdownSource(changeSource(markdown, documentMarkdown(replacement)));
    expect(single.view).toBe(view);
    expect(single.document).toEqual(canonical(replacement));
    const multiple = await applyMarkdownSource(
      changeSource(markdown, documentMarkdown(replacement).repeat(2)),
    );
    expect(multiple.view).toBe(view);
    const selected = selectMarkdownFigure(multiple, 1);
    expect(selected.view).toBe(view);
    expect(selected.document).toEqual(canonical(replacement));
    expect(JSON.parse(selected.draftText)).not.toHaveProperty("view");
  });

  test.each(views)(
    "share loads replace %s with the explicit mode or schematic for old links",
    (view) => {
      const state = changeSource(createEditor(loadExample("rc-lowpass"), view), "invalid draft");
      const document = loadExample("led-series");
      for (const sharedView of [undefined, ...views]) {
        const shared = encodeShareDocument(document, { view: sharedView });
        if (!shared.ok) throw new Error(JSON.stringify(shared.diagnostics));
        const loaded = loadShare(state, shared.hash);
        expect(loaded.view).toBe(sharedView ?? "schematic");
        expect(loaded).toEqual(createEditor(shared.document, sharedView ?? "schematic"));
        expect(evaluateEditor(loaded).ok).toBe(true);
        expect(JSON.parse(loaded.draftText)).toEqual(shared.document);
      }
      expect(state.view).toBe(view);
      expect(state.draftText).toBe("invalid draft");
    },
  );
});

describe("portable authoring revisions", () => {
  test("preview is the full exported figure with net legend and caption", () => {
    const document = loadExample("rc-lowpass");
    document.presentation.annotations = {
      nets: [{ net: "input", label: "Signal", description: "Before the resistor", tone: "cyan" }],
      legend: true,
      caption: "Authored caption",
    };
    const result = evaluateEditor(createEditor(document, "figure"));
    const basic = renderSVG(document);
    expect(result).toEqual(renderFigureSVG(document));
    if (!result.ok || !basic.ok) throw new Error("Expected valid figure");
    expect(result.bounds.height).toBeGreaterThan(basic.bounds.height);
    expect(result.svg).toContain("Authored caption");
  });

  test("share loading replaces the current draft and keeps full authored presentation", () => {
    const document = loadExample("voltage-divider");
    document.presentation.theme.preset = "geist-dark";
    document.presentation.annotations = {
      nets: [],
      legend: false,
      caption: "Private-looking, not encrypted",
    };
    addStep(document);
    const shared = encodeShareDocument(document);
    if (!shared.ok) throw new Error(JSON.stringify(shared.diagnostics));
    const state = loadShare(changeSource(initial(), "invalid draft"), shared.hash);
    expect(state.document).toEqual(shared.document);
    expect(state.controls?.presentation).toEqual(document.presentation);
    expect(state.pending).toBe(false);
    expect(evaluateEditor(state).ok).toBe(true);
    expect(JSON.parse(state.draftText)).toEqual(shared.document);
  });

  test.each(["#v=2&doc=e30", "#v=1&doc=bad", "#v=1&v=1&doc=e30", "#main", ""])(
    "fragment %j fails closed and can recover explicitly",
    (hash) => {
      const state = loadShare(initial(), hash);
      expect(state.controls).toBeNull();
      expect(state.document).toBeNull();
      const result = evaluateEditor(state);
      expect(result.ok).toBe(false);
      expect("svg" in result).toBe(false);
      expect(result.diagnostics[0]?.code).toStartWith("share.");
      expect(evaluateEditor(applySource(changeSource(state, initial().draftText))).ok).toBe(true);
    },
  );

  test("safe Markdown fences exceed every run of backticks and round-trip current JSON", () => {
    const document = loadExample("rc-lowpass");
    document.presentation.title = "Title with ```````` and <script>not executable</script>";
    document.presentation.annotations = {
      nets: [],
      legend: true,
      caption: "``` circuitkit ``` <script>plain text</script>",
    };
    const markdown = documentMarkdown(document);
    expect(markdown).toStartWith("`````````circuitkit\n");
    const result = parseCircuitMarkdown(markdown);
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.figures[0]?.document).toEqual(canonical(document));
  });

  test("a single Markdown figure imports into editable canonical JSON", async () => {
    const document = loadExample("led-series");
    const draft = changeSource(changeSourceMode(initial(), "markdown"), documentMarkdown(document));
    expect(evaluateEditor(draft).ok).toBe(false);
    expect(editableDocument(draft)).toBeNull();
    const applied = await applyMarkdownSource(draft);
    expect(applied.sourceMode).toBe("json");
    expect(applied.document).toEqual(canonical(document));
    expect(JSON.parse(applied.draftText)).toEqual(canonical(document));
    expect(evaluateEditor(applied).ok).toBe(true);
  });

  test("multiple Markdown figures require explicit choice and editing invalidates candidates", async () => {
    const second = loadExample("led-series");
    const markdown = `${documentMarkdown(loadExample("rc-lowpass"))}\nProse\n\n${documentMarkdown(second)}`;
    const draft = changeSource(changeSourceMode(initial(), "markdown"), markdown);
    const validated = await applyMarkdownSource(draft);
    expect(validated.markdownFigures).toHaveLength(2);
    expect(evaluateEditor(validated).ok).toBe(false);
    expect(editableDocument(validated)).toBeNull();
    expect(selectMarkdownFigure(validated, 9)).toBe(validated);
    expect(selectMarkdownFigure(validated, 1).document).toEqual(canonical(second));
    const changed = changeSource(validated, `${markdown}\n`);
    expect(changed.markdownFigures).toEqual([]);
    expect(selectMarkdownFigure(changed, 1)).toBe(changed);
  });

  test("one invalid Markdown block rejects every figure with a source location", async () => {
    const markdown = `${documentMarkdown(loadExample("rc-lowpass"))}\n\n\`\`\`circuitkit\nnot JSON\n\`\`\`\n`;
    const applied = await applyMarkdownSource(
      changeSource(changeSourceMode(initial(), "markdown"), markdown),
    );
    expect(applied.draftText).toBe(markdown);
    expect(applied.markdownFigures).toEqual([]);
    expect(applied.document).toBeNull();
    expect(editableDocument(applied)).toBeNull();
    const result = evaluateEditor(applied);
    expect(result.ok).toBe(false);
    expect(result.diagnostics[0]?.path).toContain("/markdown/line/");
    expect(result.diagnostics[0]?.message).toContain("block 2");
  });

  test("switching formats pauses output and never silently reapplies the last good JSON", () => {
    const state = changeSourceMode(initial(), "markdown");
    expect(state.draftText).toBe("");
    expect(evaluateEditor(state).ok).toBe(false);
    expect(applySource(state)).toBe(state);
    const json = changeSourceMode(state, "json");
    expect(evaluateEditor(json).ok).toBe(false);
    expect(evaluateEditor(applySource(json)).ok).toBe(false);
  });

  test("step authoring, reorder, rename, selection and removal preserve references and circuit", () => {
    const document = loadExample("rc-lowpass");
    const circuit = structuredClone(document.circuit);
    addStep(document);
    addStep(document);
    const steps = document.presentation.steps;
    if (!steps?.[0] || !steps[1]) throw new Error("Expected steps");
    steps[0].highlight = { components: ["R1"], nets: ["input"] };
    expect(document.presentation.activeStep).toBe("step-2");
    moveStep(document, 1, -1);
    expect(document.presentation.steps?.map((step) => step.id)).toEqual(["step-2", "step-1"]);
    expect(document.presentation.activeStep).toBe("step-2");
    renameStep(document, 0, "reading");
    expect(document.presentation.activeStep).toBe("reading");
    expect(evaluateEditor(createEditor(document)).ok).toBe(true);
    removeStep(document, 0);
    expect(document.presentation.activeStep).toBeUndefined();
    expect(document.presentation.steps?.[0]?.highlight).toEqual({
      components: ["R1"],
      nets: ["input"],
    });
    expect(document.circuit).toEqual(circuit);
    expect(evaluateEditor(createEditor(document)).ok).toBe(true);
  });

  test("step IDs are unique, additions are capped, and boundary reorder is a no-op", () => {
    const document = loadExample("rc-lowpass");
    for (let index = 0; index < 34; index++) addStep(document);
    expect(document.presentation.steps).toHaveLength(32);
    expect(new Set(document.presentation.steps?.map((step) => step.id)).size).toBe(32);
    const before = JSON.stringify(document);
    moveStep(document, 0, -1);
    moveStep(document, 31, 1);
    moveStep(document, -1, 1);
    expect(JSON.stringify(document)).toBe(before);
    removeStep(document, 0);
    addStep(document);
    expect(document.presentation.steps?.at(-1)?.id).toBe("step-1");
  });

  test("invalid step references are diagnosed without hidden circuit changes", () => {
    const state = updateDocument(initial(), (document) => {
      addStep(document);
      const step = document.presentation.steps?.[0];
      if (step) step.highlight.nets = ["missing"];
    });
    const result = evaluateEditor(state);
    expect(result.ok).toBe(false);
    expect(
      result.diagnostics.some((diagnostic) => diagnostic.path.includes("/steps/0/highlight/nets")),
    ).toBe(true);
    expect(editableDocument(state)?.presentation.steps?.[0]?.highlight.nets).toEqual(["missing"]);
    expect(editableDocument(state)?.circuit).toEqual(initial().controls?.circuit);
  });
});
