import type { ConnectionKind, DiagramView, Theme } from "../diagram/schema.ts";
import type { Diagnostic, Failure } from "../types.ts";
import {
  languageLimits,
  type PresentationSelector,
  type SourceBody,
  type SourceConnection,
  type SourceDefinition,
  type SourceEndpoint,
  type SourceModule,
  type SourcePort,
  type SourcePresentation,
  type SourceProgram,
  type SourceRange,
  type SourceResult,
} from "./types.ts";

const errors = new WeakMap<object, Diagnostic>();
export class LanguageError extends Error {
  constructor(diagnostic: Diagnostic) {
    super(diagnostic.message);
    errors.set(this, diagnostic);
  }
}
export function sourceError(
  code: string,
  message: string,
  range?: SourceRange,
  path = "/source",
  validPins?: string[],
): never {
  throw new LanguageError({
    code: `language.${code}`,
    path,
    message,
    ...(range ? { range } : {}),
    ...(validPins ? { validPins } : {}),
  });
}
export function sourceFailure(error: unknown): Failure {
  const diagnostic = typeof error === "object" && error !== null ? errors.get(error) : undefined;
  return {
    ok: false,
    diagnostics: [
      diagnostic ?? {
        code: "language.invalid",
        path: "/source",
        message: "Source could not be compiled safely.",
      },
    ],
  };
}
type Token = {
  kind: "atom" | "string" | "punctuation" | "newline" | "eof";
  value: string;
  range: SourceRange;
};
function lex(source: string): Token[] {
  if (typeof source !== "string") sourceError("text", "Expected source text.");
  if (
    source.length > languageLimits.bytes ||
    new TextEncoder().encode(source).length > languageLimits.bytes
  )
    sourceError("budget", "Source must fit within 64 KiB of UTF-8.");
  const result: Token[] = [];
  let offset = 0,
    line = 1,
    column = 1;
  const position = () => ({ offset, line, column });
  const advance = () => {
    const c = source[offset++];
    if (c === "\r") {
      if (source[offset] === "\n") offset++;
      line++;
      column = 1;
    } else if (c === "\n") {
      line++;
      column = 1;
    } else column++;
  };
  while (offset < source.length) {
    const c = source[offset] as string;
    if (c === " " || c === "\t") {
      advance();
      continue;
    }
    if (c === "#") {
      while (offset < source.length && !/[\r\n]/.test(source[offset] as string)) advance();
      continue;
    }
    const start = position();
    let kind: Token["kind"] = "atom",
      value = "";
    if (c === "\r" || c === "\n") {
      advance();
      kind = "newline";
      value = "\n";
    } else if (c === '"') {
      const begin = offset;
      advance();
      let closed = false;
      while (offset < source.length) {
        if (/[\r\n]/.test(source[offset] as string)) break;
        if (source[offset] === '"') {
          advance();
          closed = true;
          break;
        }
        if (source[offset] === "\\") {
          advance();
          if (offset < source.length && !/[\r\n]/.test(source[offset] as string)) advance();
        } else advance();
      }
      if (!closed)
        sourceError(
          "string",
          "Close the quoted string on the same line; use JSON escapes inside strings.",
          { start, end: position() },
        );
      try {
        value = JSON.parse(source.slice(begin, offset));
      } catch {
        sourceError("string", "Invalid quoted string escape.", { start, end: position() });
      }
      kind = "string";
    } else {
      const arrow = ["<->", "->", "--"].find((operator) => source.startsWith(operator, offset));
      if (arrow) {
        for (const _ of arrow) advance();
        value = arrow;
        kind = "punctuation";
      } else if (".():{}=".includes(c)) {
        advance();
        value = c;
        kind = "punctuation";
      } else {
        while (offset < source.length) {
          const character = source[offset] as string;
          if (
            /\s/.test(character) ||
            '.():{}="#<>'.includes(character) ||
            ["->", "--"].some((operator) => source.startsWith(operator, offset))
          )
            break;
          value += character;
          advance();
        }
        if (!value) {
          advance();
          sourceError("character", "Unexpected character in source.", { start, end: position() });
        }
      }
    }
    result.push({ kind, value, range: { start, end: position() } });
    if (result.length > languageLimits.tokens)
      sourceError("budget", "Source contains too many tokens.", { start, end: position() });
  }
  result.push({ kind: "eof", value: "", range: { start: position(), end: position() } });
  return result;
}
export function isCircuitSource(source: unknown): source is string {
  if (typeof source !== "string") return false;
  let offset = 0;
  while (offset < source.length) {
    if (/\s/.test(source[offset] as string)) {
      offset++;
      continue;
    }
    if (source[offset] === "#") {
      while (offset < source.length && !/[\r\n]/.test(source[offset] as string)) offset++;
      continue;
    }
    return /^circuit(?:\s|$)/.test(source.slice(offset, offset + 9));
  }
  return false;
}
class Parser {
  private cursor = 0;
  private declarations = 0;
  constructor(private readonly tokens: Token[]) {}
  private peek(ahead = 0) {
    return this.tokens[Math.min(this.cursor + ahead, this.tokens.length - 1)] as Token;
  }
  private take() {
    const token = this.peek();
    if (token.kind !== "eof") this.cursor++;
    return token;
  }
  private expect(value: string) {
    const token = this.take();
    if (token.value !== value || token.kind === "string")
      sourceError("syntax", `Expected '${value}'.`, token.range);
    return token;
  }
  private name() {
    const token = this.take();
    if (token.kind !== "atom" && token.kind !== "string")
      sourceError("syntax", "Expected an identifier or quoted name.", token.range);
    return token;
  }
  private lines() {
    while (this.peek().kind === "newline") this.take();
  }
  private end() {
    const next = this.peek();
    if (next.kind !== "newline" && next.kind !== "eof" && next.value !== "}")
      sourceError("syntax", "Expected a newline or the end of this block.", next.range);
    this.lines();
  }
  private ports(): SourcePort[] {
    this.expect("(");
    this.lines();
    const ports: SourcePort[] = [];
    while (this.peek().value !== ")") {
      if (this.peek().kind === "eof")
        sourceError("syntax", "Close the port list with ')'.", this.peek().range);
      const id = this.name();
      let label: string | undefined;
      if (this.peek().kind === "atom" && this.peek().value === "as") {
        this.take();
        const token = this.take();
        if (token.kind !== "string")
          sourceError("syntax", "Port labels must be quoted.", token.range);
        label = token.value;
      }
      ports.push({ id: id.value, ...(label === undefined ? {} : { label }), range: id.range });
      if (ports.length > 16)
        sourceError("budget", "Use at most 16 ports per module or interface.", id.range);
      this.lines();
    }
    this.expect(")");
    return ports;
  }
  private endpoint(): SourceEndpoint {
    const module = this.name();
    this.expect(".");
    const port = this.name();
    return {
      module: module.value,
      port: port.value,
      range: { start: module.range.start, end: port.range.end },
    };
  }
  private connection(bus?: Token): SourceConnection {
    const start = this.peek().range.start;
    let kind: ConnectionKind = "signal";
    if (
      ["power", "ground", "audio", "signal"].includes(this.peek().value) &&
      this.peek(1).value !== "."
    )
      kind = this.take().value as ConnectionKind;
    const from = this.endpoint();
    const operator = this.take();
    if (!["--", "->", "<->"].includes(operator.value) || operator.kind === "string")
      sourceError("syntax", "Expected --, -> or <-> between declared endpoints.", operator.range);
    const to = this.endpoint();
    const label = this.peek().kind === "string" ? this.take() : undefined;
    this.end();
    return {
      from,
      to,
      kind,
      ...(bus ? { bus: bus.value, busRange: bus.range } : {}),
      ...(label ? { label: label.value } : {}),
      ...(operator.value === "--"
        ? {}
        : { direction: operator.value === "->" ? "forward" : "both" }),
      range: { start, end: label?.range.end ?? to.range.end },
    };
  }
  private presentationSelectors = 0;
  private selector(): PresentationSelector {
    if (++this.presentationSelectors > languageLimits.presentationSelectors)
      sourceError("budget", "Use at most 256 presentation selectors.", this.peek().range);
    const begin = this.take();
    if (["module", "bus", "section"].includes(begin.value) && begin.kind === "atom") {
      const name = this.name();
      return {
        kind: begin.value as "module" | "bus" | "section",
        name: name.value,
        range: { start: begin.range.start, end: name.range.end },
      };
    }
    if (begin.value === "port" && begin.kind === "atom") {
      const endpoint = this.endpoint();
      return {
        kind: "port",
        endpoint,
        range: { start: begin.range.start, end: endpoint.range.end },
      };
    }
    if (begin.value === "link" && begin.kind === "atom") {
      const from = this.endpoint();
      this.expect("--");
      const to = this.endpoint();
      return { kind: "link", from, to, range: { start: begin.range.start, end: to.range.end } };
    }
    sourceError("presentation", "Choose module, port, bus, link or section.", begin.range);
  }
  private presentation(): SourcePresentation {
    const begin = this.expect("presentation");
    this.expect("{");
    this.lines();
    const result: SourcePresentation = { sections: [], scenes: [], range: begin.range };
    while (this.peek().value !== "}") {
      const kind = this.take();
      if (kind.kind !== "atom" || !["section", "scene"].includes(kind.value))
        sourceError("presentation", "Expected section or scene inside presentation.", kind.range);
      const id = this.name();
      if (!/^[A-Za-z][A-Za-z0-9_-]{0,47}$/.test(id.value))
        sourceError(
          "presentation",
          "Use a letter-led section or scene ID, at most 48 characters.",
          id.range,
        );
      const label =
        kind.value === "scene" && this.peek().kind === "string" ? this.take().value : id.value;
      if (label.length > 160)
        sourceError("budget", "Scene labels are limited to 160 characters.", id.range);
      this.expect("{");
      this.lines();
      if (kind.value === "section") {
        const selectors: PresentationSelector[] = [];
        while (this.peek().value !== "}") {
          const selector = this.selector();
          if (selector.kind === "section")
            sourceError("presentation", "Sections cannot contain other sections.", selector.range);
          selectors.push(selector);
          this.end();
        }
        const end = this.expect("}");
        if (!selectors.length)
          sourceError("presentation", "A section must select at least one element.", id.range);
        result.sections.push({
          id: id.value,
          selectors,
          range: { start: kind.range.start, end: end.range.end },
        });
        if (result.sections.length > languageLimits.presentationSections)
          sourceError("budget", "Use at most 32 sections.", id.range);
      } else {
        const scene: SourcePresentation["scenes"][number] = {
          id: id.value,
          label,
          highlights: [],
          dim: false,
          flows: [],
          range: kind.range,
        };
        while (this.peek().value !== "}") {
          const command = this.take();
          if (command.kind !== "atom")
            sourceError("presentation", "Expected highlight, dim or flow.", command.range);
          if (command.value === "highlight") scene.highlights.push(this.selector());
          else if (command.value === "dim") {
            if (scene.dim) sourceError("duplicate", "dim is already declared.", command.range);
            this.expect("others");
            scene.dim = true;
          } else if (command.value === "flow") {
            const selector = this.selector();
            if (selector.kind !== "bus" && selector.kind !== "link")
              sourceError(
                "presentation",
                "Flow selects an explicit bus or link, not an inferred path.",
                selector.range,
              );
            this.expect("{");
            this.lines();
            let periodMs = 3600;
            let direction: "declared" | "forward" | "reverse" = "declared";
            const fields = new Set<string>();
            while (this.peek().value !== "}") {
              const field = this.take();
              if (field.kind !== "atom" || !["style", "period", "direction"].includes(field.value))
                sourceError(
                  "presentation",
                  "Flow accepts style, period and direction only.",
                  field.range,
                );
              if (fields.has(field.value))
                sourceError("duplicate", `Duplicate flow ${field.value}.`, field.range);
              fields.add(field.value);
              const value = this.name();
              if (field.value === "style" && value.value !== "sweep")
                sourceError("presentation", "The supported flow style is sweep.", value.range);
              if (field.value === "period") {
                const match = /^(\d+)(ms|s)$/.exec(value.value);
                periodMs = match ? Number(match[1]) * (match[2] === "s" ? 1000 : 1) : NaN;
                if (!Number.isFinite(periodMs) || periodMs < 500 || periodMs > 30000)
                  sourceError(
                    "presentation",
                    "Use a visual period between 500ms and 30s, in whole ms or seconds.",
                    value.range,
                  );
              }
              if (field.value === "direction") {
                if (!["declared", "forward", "reverse"].includes(value.value))
                  sourceError(
                    "presentation",
                    "Direction is declared, forward or reverse.",
                    value.range,
                  );
                direction = value.value as typeof direction;
              }
              this.end();
            }
            const end = this.expect("}");
            scene.flows.push({
              selector,
              periodMs,
              direction,
              range: { start: command.range.start, end: end.range.end },
            });
            if (scene.flows.length > languageLimits.presentationFlows)
              sourceError("budget", "Use at most 32 flow declarations per scene.", command.range);
          } else sourceError("presentation", "Expected highlight, dim or flow.", command.range);
          this.end();
        }
        const end = this.expect("}");
        scene.range = { start: kind.range.start, end: end.range.end };
        if (!scene.highlights.length && !scene.flows.length)
          sourceError("presentation", "A scene needs a highlight or flow.", id.range);
        result.scenes.push(scene);
        if (result.scenes.length > languageLimits.presentationScenes)
          sourceError("budget", "Use at most 16 scenes.", id.range);
      }
      this.end();
    }
    const end = this.expect("}");
    result.range = { start: begin.range.start, end: end.range.end };
    if (!result.scenes.length)
      sourceError("presentation", "Presentation needs at least one scene.", result.range);
    this.end();
    return result;
  }
  private body(definition: boolean): SourceBody {
    const body: SourceBody = { modules: [], connections: [], exposures: [] };
    this.lines();
    while (this.peek().kind !== "eof" && this.peek().value !== "}") {
      if (++this.declarations > languageLimits.declarations)
        sourceError("budget", "Too many source declarations.", this.peek().range);
      if (this.peek(1).value === ":") {
        const id = this.name();
        this.expect(":");
        const type = this.name();
        const label = this.peek().kind === "string" ? this.take().value : undefined;
        const ports = this.peek().value === "(" ? this.ports() : undefined;
        const module: SourceModule = {
          id: id.value,
          type: type.value,
          ...(label === undefined ? {} : { label }),
          ...(ports === undefined ? {} : { ports }),
          range: { start: id.range.start, end: this.peek().range.start },
        };
        body.modules.push(module);
        this.end();
      } else if (this.peek().value === "bus" && this.peek(1).value !== ".") {
        this.take();
        const bus = this.name();
        this.expect("{");
        this.lines();
        while (this.peek().value !== "}") {
          if (this.peek().kind === "eof")
            sourceError("syntax", "Close the bus block with '}'.", this.peek().range);
          if (++this.declarations > languageLimits.declarations)
            sourceError("budget", "Too many source declarations.", this.peek().range);
          body.connections.push(this.connection(bus));
        }
        this.expect("}");
        this.end();
      } else if (this.peek().value === "expose" && this.peek(1).value !== ".") {
        const begin = this.take();
        if (!definition) sourceError("scope", "expose belongs inside a define block.", begin.range);
        const port = this.name();
        this.expect("=");
        const target = this.endpoint();
        body.exposures.push({
          port: port.value,
          target,
          range: { start: begin.range.start, end: target.range.end },
        });
        this.end();
      } else if (
        ["define", "title", "view", "theme", "presentation"].includes(this.peek().value) &&
        this.peek(1).value !== "."
      )
        break;
      else body.connections.push(this.connection());
    }
    return body;
  }
  parse(): SourceProgram {
    this.lines();
    const first = this.expect("circuit"),
      id = this.name(),
      version = this.name();
    if (version.value !== "v1")
      sourceError("version", "Supported source version: v1.", version.range);
    this.end();
    const program: SourceProgram = {
      schema: "circuitkit.source.v1",
      id: id.value,
      title: "",
      view: "wiring",
      theme: "geist-light",
      definitions: [],
      modules: [],
      connections: [],
      exposures: [],
      range: { start: first.range.start, end: this.tokens.at(-1)?.range.end ?? first.range.end },
      titleRange: id.range,
    };
    const metadata = new Set<string>();
    while (this.peek().kind !== "eof") {
      const token = this.peek();
      if (
        ["title", "view", "theme"].includes(token.value) &&
        ![":", "."].includes(this.peek(1).value)
      ) {
        this.take();
        if (metadata.has(token.value))
          sourceError("duplicate", `Metadata '${token.value}' is already declared.`, token.range);
        metadata.add(token.value);
        const value = this.name();
        if (token.value === "title") {
          if (value.kind !== "string")
            sourceError("syntax", "Quote the circuit title.", value.range);
          program.title = value.value;
          program.titleRange = value.range;
        } else if (token.value === "view") {
          if (!["blocks", "wiring", "schematic"].includes(value.value))
            sourceError("view", "Choose blocks, wiring or schematic.", value.range);
          program.view = value.value as DiagramView;
        } else {
          if (!["geist-light", "geist-dark", "geist-print"].includes(value.value))
            sourceError("theme", "Choose geist-light, geist-dark or geist-print.", value.range);
          program.theme = value.value as Theme;
        }
        this.end();
      } else if (token.value === "presentation" && ![":", "."].includes(this.peek(1).value)) {
        if (program.presentation)
          sourceError("duplicate", "Use one presentation block.", token.range);
        program.presentation = this.presentation();
      } else if (token.value === "define" && ![":", "."].includes(this.peek(1).value)) {
        this.take();
        const name = this.name();
        const ports = this.ports();
        this.expect("{");
        const body = this.body(true);
        const end = this.expect("}");
        const definition: SourceDefinition = {
          ...body,
          id: name.value,
          ports,
          range: { start: token.range.start, end: end.range.end },
        };
        program.definitions.push(definition);
        if (program.definitions.length > languageLimits.definitions)
          sourceError("budget", "Use at most 32 definitions.", token.range);
        this.end();
      } else {
        const before = this.cursor,
          body = this.body(false);
        program.modules.push(...body.modules);
        program.connections.push(...body.connections);
        if (this.cursor === before)
          sourceError("syntax", "Unexpected statement at circuit scope.", this.peek().range);
      }
    }
    if (!metadata.has("title"))
      sourceError("title", 'Add title "..." to the circuit.', first.range);
    return program;
  }
}
export function parseCircuitSource(source: string): SourceResult<{ program: SourceProgram }> {
  try {
    return { ok: true, program: new Parser(lex(source)).parse(), diagnostics: [] };
  } catch (error) {
    return sourceFailure(error);
  }
}
