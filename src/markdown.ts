import type { Code, Nodes } from "mdast";
import { fromMarkdown } from "mdast-util-from-markdown";
import { type CompiledDiagram, type RenderedDiagram, renderDiagramSVG } from "./diagram/index.ts";
import { renderFigureSVG } from "./figure-svg.ts";
import {
  isCircuitSource,
  type PresentationPlan,
  type ResolvedSystem,
  renderCircuitSource,
  type SourceOptions,
  type SourceSelection,
} from "./language/index.ts";
import { parseSourceOptions } from "./language/project.ts";
import {
  renderSchematicSVG,
  resolveSchematicComposition,
  type SchematicComposition,
} from "./renderer.ts";
import type { FigureDocument } from "./schema.ts";
import type { Diagnostic, Failure, FigureBounds } from "./types.ts";
import { validateDocument } from "./validation.ts";

const maxSourceBytes = 1024 * 1024;
const maxPayloadBytes = 64 * 1024;
const maxBlocks = 32;
const maxDepth = 64;
const encoder = new TextEncoder();

export type MarkdownLocation = { index: number; line: number; column: number };
export type LegacyMarkdownFigure = MarkdownLocation & {
  document: FigureDocument;
  figure?: never;
  semantics?: never;
  classification?: never;
  language?: never;
  system?: never;
  selection?: never;
  presentation?: never;
};
export type DiagramMarkdownFigure = MarkdownLocation &
  Pick<CompiledDiagram, "document" | "figure" | "semantics" | "classification"> & {
    language?: "circuitkit.source.v1";
    system?: ResolvedSystem;
    selection?: SourceSelection;
    presentation?: PresentationPlan;
  };
export type MarkdownFigure = LegacyMarkdownFigure | DiagramMarkdownFigure;
export type RenderedMarkdownFigure =
  | (LegacyMarkdownFigure & { svg: string; bounds: FigureBounds })
  | (DiagramMarkdownFigure & Pick<RenderedDiagram, "svg" | "bounds" | "targets">);
export type MarkdownOptions = SourceOptions;
export interface MarkdownSchematicSelection {
  index: number;
  composition?: SchematicComposition;
}
export type ParsedCircuitMarkdown =
  | { ok: true; figures: MarkdownFigure[]; diagnostics: [] }
  | Failure;
export type RenderedCircuitMarkdown =
  | { ok: true; figures: RenderedMarkdownFigure[]; diagnostics: [] }
  | Failure;

function failure(code: string, message: string): Failure {
  return { ok: false, diagnostics: [{ code: `markdown.${code}`, path: "/markdown", message }] };
}

function located(diagnostic: Diagnostic, node: Code, index: number): Diagnostic {
  const line = node.position?.start.line ?? 1;
  const column = node.position?.start.column ?? 1;
  return {
    ...diagnostic,
    path: `/markdown/line/${line}/column/${column}/figures/${index}${diagnostic.path}`,
    message: `CircuitKit block ${index + 1} (line ${line}, column ${column}): ${diagnostic.message}`,
  };
}

function closedFence(source: string, node: Code): boolean {
  const start = node.position?.start;
  const end = node.position?.end;
  if (start?.offset === undefined || end?.offset === undefined) return false;
  const raw = source.slice(start.offset, end.offset);
  const opening = /^[ \t]{0,3}(`{3,}|~{3,})/.exec(raw)?.[1];
  if (!opening) return false;
  const tail = raw.split(/\r\n|\r|\n/).at(-1) ?? "";
  const closing = /(?:^|[ \t>])(`{3,}|~{3,})[ \t]*$/.exec(tail)?.[1];
  if (!closing || closing[0] !== opening[0] || closing.length < opening.length) return false;
  const lines = end.line - start.line;
  return lines === node.value.split(/\r\n|\r|\n/).length + 1 || (node.value === "" && lines === 1);
}

function tooDeep(json: string): boolean {
  let depth = 0;
  let quoted = false;
  let escaped = false;
  for (const character of json) {
    if (quoted) {
      if (escaped) escaped = false;
      else if (character === "\\") escaped = true;
      else if (character === '"') quoted = false;
    } else if (character === '"') quoted = true;
    else if (character === "{" || character === "[") {
      if (++depth > maxDepth) return true;
    } else if (character === "}" || character === "]") depth--;
  }
  return false;
}

export function renderCircuitMarkdown(
  source: string,
  options?: MarkdownOptions,
): RenderedCircuitMarkdown {
  return renderMarkdown(source, options);
}

function renderMarkdown(
  source: string,
  options?: MarkdownOptions,
  selection?: MarkdownSchematicSelection,
): RenderedCircuitMarkdown {
  if (
    selection !== undefined &&
    (selection === null ||
      typeof selection !== "object" ||
      Array.isArray(selection) ||
      Reflect.ownKeys(selection).some((key) => key !== "index" && key !== "composition") ||
      !Number.isSafeInteger(selection.index) ||
      selection.index < 0 ||
      (selection.composition !== undefined &&
        selection.composition !== "classic" &&
        selection.composition !== "compact"))
  )
    return failure(
      "invalid_selection",
      'Expected a zero-based nonnegative integer index and optional composition ("classic" or "compact") only.',
    );
  if (typeof source !== "string") return failure("invalid_source", "Expected Markdown text.");
  if (source.length > maxSourceBytes || encoder.encode(source).length > maxSourceBytes)
    return failure("too_large", "The Markdown document must fit within 1 MiB of UTF-8.");
  const checkedOptions = parseSourceOptions(options);
  if (!checkedOptions.ok) return checkedOptions;
  const effective = checkedOptions.options;
  const diagramOptions = {
    ...(effective.view === undefined ? {} : { view: effective.view }),
    ...(effective.theme === undefined ? {} : { theme: effective.theme }),
  };
  const blocks: Code[] = [];
  try {
    const pending: Nodes[] = [fromMarkdown(source)];
    while (pending.length) {
      const node = pending.pop();
      if (!node) continue;
      if (node.type === "code" && node.lang === "circuitkit") {
        blocks.push(node);
        if (blocks.length > maxBlocks)
          return {
            ok: false,
            diagnostics: [
              located(
                {
                  code: "markdown.too_many_blocks",
                  path: "",
                  message: "At most 32 CircuitKit blocks are allowed.",
                },
                node,
                blocks.length - 1,
              ),
            ],
          };
      }
      if ("children" in node) {
        for (let index = node.children.length - 1; index >= 0; index--) {
          const child = node.children[index];
          if (child) pending.push(child);
        }
      }
    }
  } catch {
    return failure("invalid_source", "The Markdown document could not be parsed safely.");
  }
  if (!blocks.length)
    return failure("no_figures", "No fenced code block with language 'circuitkit' was found.");
  const figures: RenderedMarkdownFigure[] = [];
  const diagnostics: Diagnostic[] = [];
  let hasLanguage = false;
  let originalLines: string[] | undefined;
  let lineStarts: number[] | undefined;
  const sourceDiagnostic = (diagnostic: Diagnostic, node: Code, index: number) => {
    if (!diagnostic.range) return located(diagnostic, node, index);
    originalLines ??= source.split(/\r\n|\r|\n/);
    lineStarts ??= [
      0,
      ...[...source.matchAll(/\r\n|\r|\n/g)].map((match) => match.index + match[0].length),
    ];
    const payload = node.value.split(/\r\n|\r|\n/);
    const position = (value: NonNullable<Diagnostic["range"]>["start"]) => {
      const line = (node.position?.start.line ?? 1) + value.line;
      const original = originalLines?.[line - 1] ?? "";
      const content = payload[value.line - 1] ?? "";
      const prefix = original.endsWith(content)
        ? original.length - content.length
        : (node.position?.start.column ?? 1) - 1;
      return {
        line,
        column: prefix + value.column,
        offset: (lineStarts?.[line - 1] ?? source.length) + prefix + value.column - 1,
      };
    };
    return located(
      {
        ...diagnostic,
        range: { start: position(diagnostic.range.start), end: position(diagnostic.range.end) },
      },
      node,
      index,
    );
  };
  for (const [index, node] of blocks.entries()) {
    const add = (code: string, message: string) => {
      diagnostics.push(located({ code: `markdown.${code}`, path: "", message }, node, index));
    };
    if (!closedFence(source, node)) {
      add(
        "unclosed_fence",
        "Close the CircuitKit fence with the same marker and sufficient length.",
      );
      continue;
    }
    if (
      node.value.length > maxPayloadBytes ||
      encoder.encode(node.value).length > maxPayloadBytes
    ) {
      add("payload_too_large", "Each CircuitKit JSON payload must fit within 64 KiB of UTF-8.");
      continue;
    }
    if (isCircuitSource(node.value)) {
      if (selection?.index === index) {
        add(
          "unsupported_selection",
          "Schematic composition selection is legacy-only, not circuit source.",
        );
        continue;
      }
      hasLanguage = true;
      const result = renderCircuitSource(node.value, effective);
      if (!result.ok) {
        diagnostics.push(
          ...result.diagnostics.map((diagnostic) => sourceDiagnostic(diagnostic, node, index)),
        );
        continue;
      }
      const { ok: _ok, diagnostics: _diagnostics, ...rendered } = result;
      figures.push({
        ...rendered,
        index,
        line: node.position?.start.line ?? 1,
        column: node.position?.start.column ?? 1,
      });
      continue;
    }
    if (tooDeep(node.value)) {
      add("too_deep", `JSON nesting must not exceed ${maxDepth} levels.`);
      continue;
    }
    let input: unknown;
    try {
      input = JSON.parse(node.value);
    } catch {
      add("invalid_json", "Expected a JSON figure document, not JavaScript, MDX, or a URL.");
      continue;
    }
    try {
      if (
        input !== null &&
        typeof input === "object" &&
        "schema" in input &&
        input.schema === "circuitkit.diagram.v1"
      ) {
        if (selection?.index === index) {
          add(
            "unsupported_selection",
            "Schematic composition selection is legacy-only, not diagram JSON.",
          );
          continue;
        }
        const result = renderDiagramSVG(input, diagramOptions);
        if (!result.ok) {
          diagnostics.push(
            ...result.diagnostics.map((diagnostic) => located(diagnostic, node, index)),
          );
          continue;
        }
        const { ok: _ok, diagnostics: _diagnostics, ...diagram } = result;
        figures.push({
          ...diagram,
          index,
          line: node.position?.start.line ?? 1,
          column: node.position?.start.column ?? 1,
        });
        continue;
      }
      let selected = selection?.index === index;
      if (selected && selection?.composition === undefined) {
        const validation = validateDocument(input);
        if (!validation.ok) {
          diagnostics.push(
            ...validation.diagnostics.map((diagnostic) => located(diagnostic, node, index)),
          );
          continue;
        }
        selected = resolveSchematicComposition(validation.document) === "compact";
      }
      const result = selected
        ? renderSchematicSVG(input, { composition: selection?.composition })
        : renderFigureSVG(input);
      if (!result.ok) {
        diagnostics.push(
          ...result.diagnostics.map((diagnostic) => located(diagnostic, node, index)),
        );
        continue;
      }
      figures.push({
        document: result.document,
        index,
        line: node.position?.start.line ?? 1,
        column: node.position?.start.column ?? 1,
        svg: result.svg,
        bounds: result.bounds,
      });
    } catch {
      add("invalid_figure", "The figure could not be validated or rendered safely.");
    }
  }
  if (!diagnostics.length && selection && selection.index >= blocks.length)
    return failure(
      "selection_out_of_range",
      `Schematic selection index ${selection.index} is out of range; Markdown contains ${blocks.length} validated figures.`,
    );
  if (
    !diagnostics.length &&
    !hasLanguage &&
    (effective.scope !== undefined || effective.detail !== undefined)
  )
    return failure("source_options", "scope and detail require a versioned circuit source block.");
  return diagnostics.length ? { ok: false, diagnostics } : { ok: true, figures, diagnostics: [] };
}

export function parseCircuitMarkdown(
  source: string,
  options?: MarkdownOptions,
  selection?: MarkdownSchematicSelection,
): ParsedCircuitMarkdown {
  const result = renderMarkdown(source, options, selection);
  if (!result.ok) return result;
  return {
    ok: true,
    figures: result.figures.map((entry): MarkdownFigure => {
      const { index, line, column } = entry;
      if (entry.figure !== undefined)
        return {
          document: entry.document,
          index,
          line,
          column,
          figure: entry.figure,
          semantics: entry.semantics,
          classification: entry.classification,
          ...(entry.language
            ? {
                language: entry.language,
                system: entry.system,
                selection: entry.selection,
                ...(entry.presentation ? { presentation: entry.presentation } : {}),
              }
            : {}),
        };
      return { document: entry.document, index, line, column };
    }),
    diagnostics: [],
  };
}
