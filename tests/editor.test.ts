import { describe, expect, test } from "bun:test";
import {
  applySource,
  changeNumber,
  changeSource,
  clearNumber,
  createEditor,
  editableDocument,
  editorDiagnostics,
  evaluateEditor,
  pointerSegment,
  positiveNumber,
  updateDocument,
} from "../src/editor.ts";
import { loadExample } from "../src/index.ts";

const resistancePath = "/circuit/components/R1/resistance";
const initial = () => createEditor(loadExample("rc-lowpass"));
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
        /onChange=\{\(event\) => \{\s*const value = event\.currentTarget\.value(?: as \w+)?;/g,
      ),
    ];
    const eventReads = [...source.matchAll(/event\.(?:currentTarget|target)\.value/g)];
    expect(handlers).toHaveLength(7);
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
