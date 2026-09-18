import { renderFigureSVG } from "./figure-svg.ts";
import type { LegacyMarkdownFigure } from "./markdown.ts";
import { renderSchematicSVG } from "./renderer.ts";
import { type FigureDocument, figureSchema } from "./schema.ts";
import { decodeShareDocument, type ShareView } from "./share.ts";
import type { Diagnostic, RenderResult } from "./types.ts";

export interface EditorState {
  view: ShareView;
  document: unknown;
  controls: FigureDocument | null;
  draftText: string;
  pending: boolean;
  inputs: Record<string, string>;
  parseError: boolean;
  sourceMode: "json" | "markdown";
  sourceDiagnostics: Diagnostic[];
  markdownFigures: { document: FigureDocument; index: number; line: number; column: number }[];
}

export function createEditor(document: FigureDocument, view: ShareView = "schematic"): EditorState {
  return {
    view,
    document,
    controls: document,
    draftText: JSON.stringify(document, null, 2),
    pending: false,
    inputs: {},
    parseError: false,
    sourceMode: "json",
    sourceDiagnostics: [],
    markdownFigures: [],
  };
}

export function changeSource(state: EditorState, draftText: string): EditorState {
  return {
    ...state,
    draftText,
    pending: true,
    parseError: false,
    sourceDiagnostics: [],
    markdownFigures: [],
  };
}

export function applySource(state: EditorState): EditorState {
  if (state.sourceMode !== "json") return state;
  state = { ...state, sourceDiagnostics: [], markdownFigures: [] };
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
  if (state.sourceDiagnostics.length) return state.sourceDiagnostics;
  if (state.pending)
    return [
      {
        code: "document.invalid_field",
        path: "",
        message: state.markdownFigures.length
          ? "Choose a validated Markdown figure to import. Preview, download, and copy are paused."
          : `${state.sourceMode === "json" ? "JSON" : "Markdown"} has unapplied changes. ${state.sourceMode === "json" ? "Apply JSON" : "Validate Markdown"} to validate this revision. Preview, download, and copy are paused.`,
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
  if (diagnostics.length) return { ok: false, diagnostics };
  if (state.view === "figure") return renderFigureSVG(state.document);
  return state.view === "annotated"
    ? renderSchematicSVG(state.document, { annotations: true })
    : renderSchematicSVG(state.document);
}

export function loadShare(state: EditorState, hash: string): EditorState {
  const decoded = decodeShareDocument(hash);
  return decoded.ok
    ? createEditor(decoded.document, decoded.view ?? "schematic")
    : {
        ...changeSource(state, ""),
        document: null,
        controls: null,
        pending: false,
        sourceMode: "json",
        inputs: {},
        sourceDiagnostics: decoded.diagnostics,
      };
}

export function changeSourceMode(
  state: EditorState,
  sourceMode: EditorState["sourceMode"],
): EditorState {
  if (sourceMode === state.sourceMode) return state;
  return { ...changeSource(state, ""), sourceMode };
}

export async function applyMarkdownSource(state: EditorState): Promise<EditorState> {
  if (state.sourceMode !== "markdown") return state;
  try {
    const { parseCircuitMarkdown } = await import("./markdown.ts");
    const result = parseCircuitMarkdown(state.draftText);
    if (!result.ok)
      return {
        ...state,
        document: null,
        controls: null,
        pending: false,
        markdownFigures: [],
        sourceDiagnostics: result.diagnostics,
      };
    const figures = result.figures.filter(
      (figure): figure is LegacyMarkdownFigure => figure.figure === undefined,
    );
    if (figures.length !== result.figures.length)
      return {
        ...state,
        document: null,
        controls: null,
        pending: false,
        markdownFigures: [],
        sourceDiagnostics: result.figures
          .filter((figure) => figure.figure !== undefined)
          .map((figure) => ({
            code: "markdown.unsupported_diagram",
            path: `/markdown/line/${figure.line}/column/${figure.column}/figures/${figure.index}`,
            message:
              "Use /markdown to preview coordinate-free module diagrams and mixed documents. This editor imports legacy version-1 figures only; your source is preserved.",
          })),
      };
    if (figures.length === 1 && figures[0]) return createEditor(figures[0].document, state.view);
    return { ...state, pending: true, markdownFigures: figures, sourceDiagnostics: [] };
  } catch {
    return {
      ...state,
      document: null,
      controls: null,
      pending: false,
      markdownFigures: [],
      sourceDiagnostics: [
        {
          code: "markdown.unavailable",
          path: "/markdown",
          message: "Markdown could not be loaded. Your source is preserved; try again.",
        },
      ],
    };
  }
}

export function selectMarkdownFigure(state: EditorState, index: number): EditorState {
  const figure = state.markdownFigures.find((figure) => figure.index === index);
  return figure ? createEditor(figure.document, state.view) : state;
}

export function documentMarkdown(document: FigureDocument): string {
  const json = JSON.stringify(document, null, 2);
  let length = 3;
  for (const match of json.matchAll(/`+/g)) length = Math.max(length, match[0].length + 1);
  const fence = "`".repeat(length);
  return `${fence}circuitkit\n${json}\n${fence}\n`;
}

export function addStep(document: FigureDocument): void {
  const steps = document.presentation.steps ?? [];
  if (steps.length >= 32) return;
  let number = 1;
  while (steps.some((step) => step.id === `step-${number}`)) number++;
  const id = `step-${number}`;
  document.presentation.steps = [
    ...steps,
    { id, title: `Step ${number}`, description: "", highlight: { components: [], nets: [] } },
  ];
  document.presentation.activeStep = id;
}

export function renameStep(document: FigureDocument, index: number, id: string): void {
  const step = document.presentation.steps?.[index];
  if (!step) return;
  if (document.presentation.activeStep === step.id) document.presentation.activeStep = id;
  step.id = id;
}

export function removeStep(document: FigureDocument, index: number): void {
  const step = document.presentation.steps?.[index];
  if (!step) return;
  if (document.presentation.activeStep === step.id) delete document.presentation.activeStep;
  document.presentation.steps?.splice(index, 1);
}

export function moveStep(document: FigureDocument, index: number, direction: -1 | 1): void {
  const steps = document.presentation.steps;
  const target = index + direction;
  if (!steps || target < 0 || target >= steps.length || index < 0 || index >= steps.length) return;
  const step = steps.splice(index, 1)[0];
  if (step) steps.splice(target, 0, step);
}

export function pointerSegment(id: string): string {
  return id.replaceAll("~", "~0").replaceAll("/", "~1");
}
