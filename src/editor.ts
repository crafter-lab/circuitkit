import { type Diagnostic, type FigureDocument, type RenderResult, renderSVG } from "./index.ts";
import { figureSchema } from "./schema.ts";

export interface EditorState {
  document: unknown;
  controls: FigureDocument | null;
  draftText: string;
  pending: boolean;
  inputs: Record<string, string>;
  parseError: boolean;
}

export function createEditor(document: FigureDocument): EditorState {
  return {
    document,
    controls: document,
    draftText: JSON.stringify(document, null, 2),
    pending: false,
    inputs: {},
    parseError: false,
  };
}

export function changeSource(state: EditorState, draftText: string): EditorState {
  return { ...state, draftText, pending: true, parseError: false };
}

export function applySource(state: EditorState): EditorState {
  try {
    const document: unknown = JSON.parse(state.draftText);
    const parsed = figureSchema.safeParse(document);
    return {
      ...state,
      document,
      controls: parsed.success ? parsed.data : null,
      pending: false,
      inputs: {},
      parseError: false,
    };
  } catch {
    return {
      ...state,
      document: null,
      controls: null,
      pending: false,
      inputs: {},
      parseError: true,
    };
  }
}

export function editableDocument(state: EditorState): FigureDocument | null {
  if (state.pending) return null;
  return state.controls;
}

export function updateDocument(
  state: EditorState,
  update: (document: FigureDocument) => void,
): EditorState {
  const current = editableDocument(state);
  if (!current) return state;
  const document = structuredClone(current);
  update(document);
  return { ...state, document, controls: document, draftText: JSON.stringify(document, null, 2) };
}

export function positiveNumber(text: string): number | null {
  if (!/^[+]?((\d+(\.\d*)?)|(\.\d+))([eE][+-]?\d+)?$/.test(text.trim())) return null;
  const value = Number(text);
  return Number.isFinite(value) && value > 0 ? value : null;
}

export function changeNumber(
  state: EditorState,
  path: string,
  text: string,
  update: (document: FigureDocument, value: number) => void,
): EditorState {
  if (!editableDocument(state)) return state;
  const value = positiveNumber(text);
  const next =
    value === null ? state : updateDocument(state, (document) => update(document, value));
  return { ...next, inputs: { ...next.inputs, [path]: text } };
}

export function clearNumber(
  state: EditorState,
  path: string,
  update: (document: FigureDocument) => void,
): EditorState {
  const next = updateDocument(state, update);
  const inputs = { ...next.inputs };
  delete inputs[path];
  return { ...next, inputs };
}

export function editorDiagnostics(state: EditorState): Diagnostic[] {
  if (state.pending)
    return [
      {
        code: "document.invalid_field",
        path: "",
        message:
          "JSON has unapplied changes. Apply JSON to validate this revision. Preview, download, and copy are paused.",
      },
    ];
  if (state.parseError)
    return [
      {
        code: "document.invalid_json",
        path: "",
        message: "Invalid JSON. Your text has been preserved; correct it and apply again.",
      },
    ];
  const diagnostics: Diagnostic[] = [];
  for (const [path, text] of Object.entries(state.inputs)) {
    if (positiveNumber(text) === null)
      diagnostics.push({
        code: "document.invalid_field",
        path,
        message: "Enter a finite, positive number in SI units, without a unit suffix.",
      });
  }
  const document = editableDocument(state);
  if (document && !document.presentation.title.trim())
    diagnostics.push({
      code: "document.invalid_field",
      path: "/presentation/title",
      message: "Enter a figure title.",
    });
  return diagnostics;
}

export function evaluateEditor(state: EditorState): RenderResult {
  const diagnostics = editorDiagnostics(state);
  return diagnostics.length ? { ok: false, diagnostics } : renderSVG(state.document);
}

export function pointerSegment(id: string): string {
  return id.replaceAll("~", "~0").replaceAll("/", "~1");
}
