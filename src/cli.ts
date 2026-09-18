#!/usr/bin/env node
import { randomUUID } from "node:crypto";
import {
  closeSync,
  fstatSync,
  fsyncSync,
  linkSync,
  openSync,
  readSync,
  renameSync,
  unlinkSync,
  writeFileSync,
} from "node:fs";
import { basename, dirname, join, resolve } from "node:path";
import { parseArgs } from "node:util";
import { agentGuides, packageVersion, readAgentGuide } from "./agent-guides.ts";
import {
  compileDiagram,
  type DiagramView,
  diagramJSONSchema,
  renderDiagramSVG,
} from "./diagram/index.ts";
import {
  getCatalog,
  getSchema,
  inspect,
  renderFigureSVG,
  renderSchematicSVG,
  renderSVG,
  validate,
} from "./index.ts";
import {
  compileCircuitSource,
  formatCircuitSource,
  isCircuitSource,
  languageGrammar,
  renderCircuitSource,
  resolveCircuitSource,
  type SourceOptions,
} from "./language/index.ts";
import type { MarkdownLocation } from "./markdown.ts";
import type { Diagnostic } from "./types.ts";

const help = `circuitkit: portable circuit SVG and PNG from versioned JSON documents

Commands:
  schema                         Discover the document JSON schema
  catalog                        Discover recipes, pins, roles, nets, and SI values
  grammar                        Discover the versioned circuit text language
  format <file|->                Format valid raw circuit source; optional --out
  expand <file|->                Resolve raw source definitions/interfaces; optional --out
  validate <file|->              Validate document, graph, geometry, and theme
  inspect <file|->               Inspect normalized circuit, roles, and bounds
  render <file|-> [--out <path>]  Render SVG or PNG (PNG requires --out)
  markdown <file|->              Validate/render all CircuitKit fences in memory
  skills list                    Discover guides shipped with this CLI version
  skills get <name>              Read a packaged guide (skill is an alias)

Flags:
  --json       One JSON object on stdout (automatic when stdout is not a TTY)
  --out PATH   Atomic output for render/format/expand; parent must exist
  --overwrite  Explicitly replace --out only after successful validation
  --figure     Include annotations, caption, and active step; render only
  --schematic  Circuit only, tightly cropped; render only; excludes --figure
  --format F   svg (default) or png; render only
  --scale N    Integer 1 through 4; PNG only; default 1; 16,000,000 pixel cap
  --block N    Select a 1-based Markdown figure for validate/inspect/render
  --diagram    Discover circuitkit.diagram.v1 instead of legacy v1; schema only
  --view V     blocks, wiring or schematic; diagram input only; keeps authored JSON
               validate/inspect/render/markdown; defaults to authored view or wiring
  --scope P    Select an assembly path in circuit source; default root
  --detail D   expanded (default) or interface; circuit source only
  --text       Plain Markdown instead of a JSON envelope; skills get only
  --version    Installed package version
  -h, --help   Show help; no prompts
  --           End flags before positional filenames beginning with a dash

Input '-' reads stdin, never prompts. Omit --out to return SVG without writing.
JSON and circuit ID v1 source are recognized by content; --block explicitly selects Markdown after all blocks validate.
Use schema --diagram --json for coordinate-free modules and module.port connections.
Raw circuitkit.diagram.v1 documents and legacy v1 are accepted, never author envelopes.
Diagram views declare connectivity, not electrical verification; --figure/--schematic are legacy only.
Limits: JSON 64 KiB and 64 nesting levels; Markdown 1 MiB, 32 blocks.
Exits: 0 success; 1 invalid input/document; 2 usage or IO failure.
Existing output is never replaced without --overwrite.

Workflow:
  circuitkit schema --json
  circuitkit catalog --json
  circuitkit validate examples/rc-lowpass.json --json
  circuitkit inspect examples/rc-lowpass.json --json
  circuitkit render examples/rc-lowpass.json --out rc.svg --json

Validation is not simulation or electrical-safety approval.`;

class CliError extends Error {
  constructor(
    readonly code: Diagnostic["code"],
    readonly path: string,
    message: string,
    readonly exitCode: 1 | 2 = 2,
  ) {
    super(message);
  }
}

function usage(message: string): never {
  throw new CliError("document.invalid_field", "", `Usage: ${message} Run circuitkit --help.`);
}

function errorCode(error: unknown): string | undefined {
  return error !== null &&
    typeof error === "object" &&
    "code" in error &&
    typeof error.code === "string"
    ? error.code
    : undefined;
}

function atomicWrite(destination: string, data: string | Uint8Array, overwrite: boolean): void {
  const temporary = join(dirname(destination), `.${basename(destination)}.${randomUUID()}.tmp`);
  let owned = false;
  let failure: CliError | undefined;
  try {
    const fd = openSync(temporary, "wx", 0o644);
    owned = true;
    try {
      writeFileSync(fd, data);
      fsyncSync(fd);
    } finally {
      closeSync(fd);
    }
    if (overwrite) {
      renameSync(temporary, destination);
      owned = false;
    } else {
      linkSync(temporary, destination);
    }
  } catch (error) {
    failure =
      errorCode(error) === "EEXIST"
        ? new CliError(
            "io.destination_exists",
            "/out",
            `Destination already exists: ${JSON.stringify(destination)}. Choose a new path or explicitly pass --overwrite.`,
          )
        : new CliError(
            "io.write_failed",
            "/out",
            `Could not publish ${JSON.stringify(destination)} (${errorCode(error) ?? "IO error"}). The CLI does not delete existing destinations as a fallback.`,
          );
  }
  if (owned) {
    try {
      unlinkSync(temporary);
    } catch (error) {
      if (errorCode(error) !== "ENOENT") {
        failure = new CliError(
          failure?.code ?? "io.write_failed",
          "/out",
          `${failure ? `${failure.message} ` : "The destination may already have been published. "}Could not remove temporary ${JSON.stringify(temporary)}.`,
        );
      }
    }
  }
  if (failure) throw failure;
}

async function readInput(input: string, markdown: boolean): Promise<string> {
  const limit = markdown ? 1024 * 1024 : 64 * 1024;
  const tooLarge = () =>
    new CliError(
      markdown ? "markdown.too_large" : "document.too_large",
      "/input",
      `Input exceeds the ${markdown ? "1 MiB Markdown" : "64 KiB JSON"} UTF-8 limit.`,
      1,
    );
  let fd: number | undefined;
  try {
    if (input === "-" && process.stdin.isTTY)
      throw new CliError(
        "io.read_failed",
        "/input",
        "Input '-' requires piped stdin; no interactive prompt is available.",
      );
    if (input === "-") {
      const buffer = Buffer.alloc(limit);
      let size = 0;
      for await (const chunk of process.stdin) {
        const bytes = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
        if (bytes.byteLength > limit - size) throw tooLarge();
        buffer.set(bytes, size);
        size += bytes.byteLength;
      }
      return buffer.toString("utf8", 0, size);
    }
    fd = openSync(input, "r");
    const stat = fstatSync(fd);
    if (stat.isDirectory())
      throw new CliError(
        "io.read_failed",
        "/input",
        "Input must be a file or piped stdin, not a directory.",
      );
    if (stat.isFile() && stat.size > limit) throw tooLarge();
    const buffer = Buffer.alloc(limit + 1);
    let size = 0;
    while (size <= limit) {
      const count = readSync(fd, buffer, size, Math.min(16 * 1024, buffer.length - size), null);
      if (!count) break;
      size += count;
    }
    if (size > limit) throw tooLarge();
    return buffer.toString("utf8", 0, size);
  } catch (error) {
    if (error instanceof CliError) throw error;
    throw new CliError(
      "io.read_failed",
      "/input",
      `Could not read ${JSON.stringify(input)} (${errorCode(error) ?? "IO error"}).`,
    );
  } finally {
    if (fd !== undefined && input !== "-") closeSync(fd);
  }
}

function readDocument(text: string): unknown {
  let depth = 0;
  let quoted = false;
  let escaped = false;
  for (const character of text) {
    if (quoted) {
      if (escaped) escaped = false;
      else if (character === "\\") escaped = true;
      else if (character === '"') quoted = false;
    } else if (character === '"') quoted = true;
    else if (character === "{" || character === "[") {
      if (++depth > 64)
        throw new CliError("document.too_deep", "", "JSON nesting must not exceed 64 levels.", 1);
    } else if (character === "}" || character === "]") depth--;
  }
  try {
    return JSON.parse(text);
  } catch {
    throw new CliError(
      "document.invalid_json",
      "",
      "Input is not valid JSON. Correct its syntax and run validate again.",
      1,
    );
  }
}

type Envelope = {
  ok: boolean;
  diagnostics: Diagnostic[];
  nextSteps: string[];
  [key: string]: unknown;
};

function emit(result: Envelope, machine: boolean, command: string): void {
  if (machine) {
    process.stdout.write(`${JSON.stringify(result)}\n`);
    return;
  }
  if (typeof result.help === "string") process.stdout.write(`${result.help}\n`);
  else if (!result.ok) {
    for (const diagnostic of result.diagnostics)
      process.stderr.write(
        `${diagnostic.code}${diagnostic.range ? ` (${diagnostic.range.start.line}:${diagnostic.range.start.column})` : ""} ${JSON.stringify(diagnostic.path)}: ${JSON.stringify(diagnostic.message)}\n`,
      );
  } else if (command === "skills" && typeof result.content === "string")
    process.stdout.write(result.content);
  else if (command === "version") process.stdout.write(`${result.packageVersion}\n`);
  else if (command === "validate")
    process.stdout.write("Valid document and figure. Not an electrical-safety approval.\n");
  else if (command === "render" || command === "format") {
    if (typeof result.output === "string")
      process.stdout.write(`Wrote ${JSON.stringify(result.output)}\n`);
    else if (typeof result.svg === "string") process.stdout.write(`${result.svg}\n`);
    else if (typeof result.source === "string") process.stdout.write(result.source);
  } else process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
}

async function diagramResult(
  document: unknown,
  command: string,
  format: string,
  view: DiagramView | undefined,
  scale: number,
) {
  const options = view === undefined ? undefined : { view };
  if (command === "render" && format === "png") {
    const compiled = compileDiagram(document, options);
    if (!compiled.ok) return compiled;
    const { renderEducationalPNG } = await import("./v2/png.ts");
    const rendered = await renderEducationalPNG(compiled.figure, { scale });
    if (!rendered.ok)
      return {
        ok: false as const,
        diagnostics: rendered.diagnostics.map((diagnostic) => ({
          ...diagnostic,
          path: diagnostic.code === "png.pixel_limit" ? "/scale" : "/input",
        })),
      };
    return { ...rendered, ...compiled };
  }
  const rendered = renderDiagramSVG(document, options);
  if (!rendered.ok || command === "render") return rendered;
  const { svg: _svg, ...info } = rendered;
  return info;
}

async function sourceResult(
  source: string,
  command: string,
  format: string,
  options: SourceOptions,
  scale: number,
) {
  if (command === "render" && format === "png") {
    const compiled = compileCircuitSource(source, options);
    if (!compiled.ok) return compiled;
    const { renderEducationalPNG } = await import("./v2/png.ts");
    const png = await renderEducationalPNG(compiled.figure, { scale });
    if (!png.ok)
      return {
        ok: false as const,
        diagnostics: png.diagnostics.map((d) => ({
          ...d,
          path: d.code === "png.pixel_limit" ? "/scale" : "/input",
        })),
      };
    return { ...png, ...compiled };
  }
  const result = renderCircuitSource(source, options);
  if (!result.ok || command === "render") return result;
  const { svg: _svg, ...info } = result;
  return info;
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  let machine = args.includes("--json") || !process.stdout.isTTY;
  let command = "help";
  try {
    let parsed: ReturnType<typeof parseArgs>;
    try {
      parsed = parseArgs({
        args,
        allowPositionals: true,
        strict: true,
        tokens: true,
        options: {
          json: { type: "boolean" },
          text: { type: "boolean" },
          version: { type: "boolean" },
          help: { type: "boolean", short: "h" },
          out: { type: "string" },
          overwrite: { type: "boolean" },
          figure: { type: "boolean" },
          schematic: { type: "boolean" },
          format: { type: "string" },
          scale: { type: "string" },
          block: { type: "string" },
          diagram: { type: "boolean" },
          view: { type: "string" },
          scope: { type: "string" },
          detail: { type: "string" },
        },
      });
    } catch {
      usage("Unknown option or missing option value.");
    }
    const flags = parsed.values;
    machine = flags.json === true || !process.stdout.isTTY;
    const supplied = new Set<string>();
    for (const token of parsed.tokens ?? []) {
      if (token.kind !== "option") continue;
      if (supplied.has(token.name)) usage(`Duplicate --${token.name}.`);
      supplied.add(token.name);
    }
    command = parsed.positionals[0] ?? "help";
    if (command === "skill") command = "skills";
    if (flags.version) {
      if (
        parsed.positionals.length ||
        [...supplied].some((flag) => !["json", "version"].includes(flag))
      )
        usage("--version takes only --json.");
      emit(
        {
          ok: true,
          version: 1,
          packageVersion,
          diagnostics: [],
          nextSteps: ["circuitkit skills get core --text"],
        },
        machine,
        "version",
      );
      return;
    }
    if (flags.text && command !== "skills") usage("--text applies only to skills get.");
    if (
      ![
        "schema",
        "catalog",
        "grammar",
        "format",
        "expand",
        "validate",
        "inspect",
        "render",
        "markdown",
        "skills",
        "help",
      ].includes(command)
    )
      usage(`Unknown command ${JSON.stringify(command)}.`);
    if (flags.help || command === "help") {
      if (command === "help" && parsed.positionals.length > 1)
        usage("Help takes no positional arguments.");
      emit(
        {
          ok: true,
          version: 1,
          help,
          diagnostics: [],
          nextSteps: ["circuitkit schema --json", "circuitkit catalog --json"],
        },
        machine,
        "help",
      );
      return;
    }
    if (command === "skills") {
      if ([...supplied].some((flag) => !["json", "text"].includes(flag)))
        usage("Skills accepts only --json or --text.");
      if (flags.json && flags.text) usage("Choose --json or --text, not both.");
      const [, action, name] = parsed.positionals;
      const base = {
        ok: true,
        version: 1,
        packageVersion,
        diagnostics: [],
        nextSteps: ["circuitkit skills get core --text", "circuitkit grammar --json"],
      };
      if (action === "list" && parsed.positionals.length === 2 && !flags.text) {
        emit(
          { ...base, skills: agentGuides.map(({ name, description }) => ({ name, description })) },
          machine,
          command,
        );
        return;
      }
      if (action !== "get" || !name || parsed.positionals.length !== 3)
        usage("skills list | skills get NAME [--text].");
      if (!agentGuides.some((guide) => guide.name === name))
        usage(`Unknown guide ${JSON.stringify(name)}. Run circuitkit skills list.`);
      let content: string | undefined;
      try {
        content = readAgentGuide(name);
      } catch {
        throw new CliError(
          "io.read_failed",
          "/skill",
          "Packaged guide is missing. Reinstall the same CircuitKit version.",
        );
      }
      emit({ ...base, name, content }, flags.text ? false : machine, command);
      return;
    }
    if (flags.diagram && command !== "schema") usage("--diagram applies only to schema.");
    let view: DiagramView | undefined;
    if (flags.view !== undefined) {
      if (!["validate", "inspect", "render", "markdown"].includes(command))
        usage("--view applies only to diagram validate, inspect, render and markdown.");
      if (flags.view !== "blocks" && flags.view !== "wiring" && flags.view !== "schematic")
        usage("--view must be blocks, wiring or schematic.");
      view = flags.view;
    }
    if (
      !["render", "format", "expand"].includes(command) &&
      (flags.out !== undefined || flags.overwrite)
    )
      usage("--out and --overwrite apply only to render, format and expand.");
    if (
      command !== "render" &&
      (flags.figure || flags.schematic || flags.format !== undefined || flags.scale !== undefined)
    )
      usage("--figure, --schematic, --format and --scale apply only to render.");
    const sourceOptions: SourceOptions = view === undefined ? {} : { view };
    if (flags.scope !== undefined || flags.detail !== undefined) {
      if (!["validate", "inspect", "render", "markdown"].includes(command))
        usage("--scope and --detail apply only to source validate, inspect, render and markdown.");
      if (typeof flags.scope === "string") sourceOptions.scope = flags.scope;
      if (flags.detail !== undefined) {
        if (flags.detail !== "expanded" && flags.detail !== "interface")
          usage("--detail must be expanded or interface.");
        sourceOptions.detail = flags.detail;
      }
    }
    if (flags.figure && flags.schematic) usage("--figure and --schematic are mutually exclusive.");
    if (flags.overwrite && flags.out === undefined) usage("--overwrite requires --out.");
    if (flags.out === "" || flags.out === "-")
      usage("--out requires a file path, not '-'; omit --out for an in-memory SVG result.");
    const format = flags.format ?? "svg";
    if (format !== "svg" && format !== "png") usage("--format must be svg or png.");
    if (
      flags.scale !== undefined &&
      (format !== "png" || typeof flags.scale !== "string" || !/^[1-4]$/.test(flags.scale))
    )
      usage("--scale requires --format png and an integer from 1 through 4.");
    if (format === "png" && flags.out === undefined)
      usage("--format png requires --out; PNG bytes are never written to stdout.");
    let block: number | undefined;
    if (flags.block !== undefined) {
      if (!["validate", "inspect", "render"].includes(command))
        usage("--block applies only to validate, inspect and render.");
      if (
        typeof flags.block !== "string" ||
        !/^[1-9][0-9]*$/.test(flags.block) ||
        !Number.isSafeInteger(Number(flags.block))
      )
        usage("--block must be a 1-based positive integer.");
      block = Number(flags.block);
    }
    if (command === "grammar") {
      if (parsed.positionals.length !== 1) usage("grammar takes no file argument.");
      emit(
        {
          ok: true,
          version: 1,
          grammar: languageGrammar,
          diagnostics: [],
          nextSteps: [
            "Write circuit ID v1 with explicit modules, ports and links.",
            "Run validate, format, expand or render with the source file.",
          ],
        },
        machine,
        command,
      );
      return;
    }
    if (command === "schema" || command === "catalog") {
      if (parsed.positionals.length !== 1) usage(`${command} takes no document argument.`);
      const data =
        command === "schema"
          ? { schema: flags.diagram ? diagramJSONSchema : getSchema() }
          : { catalog: getCatalog() };
      emit(
        {
          ok: true,
          version: 1,
          ...data,
          diagnostics: [],
          nextSteps: flags.diagram
            ? [
                "Create raw circuitkit.diagram.v1 JSON with modules and connections, without coordinates or an author envelope.",
                "Run validate <file> and render <file> --view wiring; use blocks or schematic for another view without changing authored JSON.",
              ]
            : [
                "Create a document using the schema and catalog, then run validate with its file path.",
              ],
        },
        machine,
        command,
      );
      return;
    }
    const input = parsed.positionals[1];
    if (parsed.positionals.length !== 2 || !input)
      usage(
        `${command} requires exactly one ${command === "markdown" || block !== undefined ? "Markdown" : "JSON"} file path or '-'.`,
      );
    const text = await readInput(input, command === "markdown" || block !== undefined);
    if (command === "format" || command === "expand") {
      const result = command === "format" ? formatCircuitSource(text) : resolveCircuitSource(text);
      if (!result.ok) {
        emit(
          {
            ...result,
            nextSteps: [
              "Correct the source at the reported range, then retry.",
              "circuitkit grammar --json",
            ],
          },
          machine,
          command,
        );
        process.exitCode = 1;
        return;
      }
      let output: string | undefined;
      if (typeof flags.out === "string") {
        output = resolve(flags.out);
        atomicWrite(
          output,
          "source" in result ? result.source : `${JSON.stringify(result.system, null, 2)}\n`,
          flags.overwrite === true,
        );
      }
      emit(
        {
          ...result,
          ...(output ? { output } : {}),
          nextSteps: [
            command === "format"
              ? "Render the formatted source to a new output path."
              : "Use the assembly paths with --scope; --detail interface keeps child assemblies collapsed.",
          ],
        },
        machine,
        command,
      );
      return;
    }
    let document: unknown;
    let sourceText: string | undefined;
    let sourceMetadata: Record<string, unknown> | undefined;
    let location: MarkdownLocation | undefined;
    if (command === "markdown" || block !== undefined) {
      const { parseCircuitMarkdown, renderCircuitMarkdown } = await import("./markdown.ts");
      const options = sourceOptions;
      const markdown =
        command === "markdown"
          ? renderCircuitMarkdown(text, options)
          : parseCircuitMarkdown(text, options);
      if (
        markdown.ok &&
        command === "markdown" &&
        view !== undefined &&
        !markdown.figures.some((entry) => entry.figure !== undefined)
      )
        usage(
          "--view requires circuitkit.diagram.v1 input; legacy figures use --figure or --schematic on render.",
        );
      if (!markdown.ok || command === "markdown") {
        emit(
          {
            ...markdown,
            nextSteps: markdown.ok
              ? ["Select a figure with --block for inspect or render; no files have been written."]
              : [
                  "Correct every CircuitKit block using its source diagnostics, then run markdown again.",
                ],
          },
          machine,
          command,
        );
        if (!markdown.ok) process.exitCode = 1;
        return;
      }
      const selected = markdown.figures[(block ?? 1) - 1];
      if (!selected)
        usage(
          `--block ${block} is out of range; Markdown contains ${markdown.figures.length} validated figures.`,
        );
      document = selected.document;
      if (selected.figure !== undefined && selected.language)
        sourceMetadata = {
          language: selected.language,
          system: selected.system,
          selection: selected.selection,
        };
      location = { index: selected.index, line: selected.line, column: selected.column };
    } else if (isCircuitSource(text)) sourceText = text;
    else document = readDocument(text);
    const diagram =
      sourceText !== undefined ||
      (document !== null &&
        typeof document === "object" &&
        "schema" in document &&
        document.schema === "circuitkit.diagram.v1");
    if (
      sourceText === undefined &&
      !sourceMetadata &&
      (flags.scope !== undefined || flags.detail !== undefined)
    )
      usage("--scope and --detail require versioned circuit source, not JSON.");
    if (diagram && (flags.figure || flags.schematic))
      usage(
        "--figure and --schematic are legacy-only; use --view blocks, wiring or schematic for diagrams.",
      );
    if (!diagram && view !== undefined)
      usage(
        "--view requires circuitkit.diagram.v1 input; legacy figures use --figure or --schematic on render.",
      );
    const result =
      sourceText !== undefined
        ? await sourceResult(sourceText, command, format, sourceOptions, Number(flags.scale ?? 1))
        : diagram
          ? await diagramResult(document, command, format, view, Number(flags.scale ?? 1))
          : command === "validate"
            ? validate(document)
            : command === "inspect"
              ? inspect(document)
              : format === "png"
                ? await (await import("./png.ts")).renderPNG(document, {
                    figure: flags.figure === true,
                    schematic: flags.schematic === true,
                    scale: Number(flags.scale ?? 1),
                  })
                : flags.schematic
                  ? renderSchematicSVG(document)
                  : flags.figure
                    ? renderFigureSVG(document)
                    : renderSVG(document);
    if (!result.ok) {
      emit(
        {
          ...result,
          ...(diagram && location
            ? {
                diagnostics: result.diagnostics.map((diagnostic) => ({
                  ...diagnostic,
                  path: `/markdown/line/${location.line}/column/${location.column}/figures/${location.index}${diagnostic.path}`,
                  message: `CircuitKit block ${location.index + 1} (line ${location.line}, column ${location.column}): ${diagnostic.message}`,
                })),
              }
            : {}),
          nextSteps: [
            "Correct the document using diagnostics and validPins, then run validate again.",
            diagram ? "circuitkit schema --diagram --json" : "circuitkit catalog --json",
          ],
        },
        machine,
        command,
      );
      const operational = result.diagnostics.some(
        (diagnostic) => diagnostic.code === "png.render_failed",
      );
      if (machine && operational)
        for (const diagnostic of result.diagnostics)
          process.stderr.write(`${diagnostic.code}: ${JSON.stringify(diagnostic.message)}\n`);
      process.exitCode = operational ? 2 : 1;
      return;
    }
    let output: string | undefined;
    if (command === "render" && typeof flags.out === "string") {
      output = resolve(flags.out);
      if ("png" in result && result.png instanceof Uint8Array)
        atomicWrite(output, result.png, flags.overwrite === true);
      else if ("svg" in result && typeof result.svg === "string")
        atomicWrite(output, result.svg, flags.overwrite === true);
      else
        throw new CliError(
          "io.write_failed",
          "/out",
          "The renderer did not return an output artifact.",
        );
    }
    const receipt: { ok: true; diagnostics: Diagnostic[]; [key: string]: unknown } = {
      ...result,
      ...sourceMetadata,
    };
    if ("png" in result && result.png instanceof Uint8Array) {
      delete receipt.png;
      receipt.bytes = result.png.byteLength;
    }
    emit(
      {
        ...receipt,
        ...(output ? { output } : {}),
        nextSteps: diagram
          ? [
              "circuitkit schema --diagram --json",
              "Use --view blocks, wiring or schematic to change presentation without changing authored JSON.",
              command === "render"
                ? `Inspect the ${format.toUpperCase()} visually; declared connectivity is not electrical verification.`
                : "Inspect declared nets and bounds, then render to a new --out path.",
            ]
          : command === "render"
            ? [
                `Inspect the ${format.toUpperCase()} visually; validation does not certify an electrical design.`,
              ]
            : ["Inspect verified nets and bounds, then render to a new --out path."],
      },
      machine,
      command,
    );
  } catch (error) {
    const failure =
      error instanceof CliError
        ? error
        : new CliError(
            "io.write_failed",
            "",
            "Unexpected CLI failure; no successful result is available.",
          );
    const result: Envelope = {
      ok: false,
      diagnostics: [{ code: failure.code, path: failure.path, message: failure.message }],
      nextSteps: [
        "circuitkit --help",
        ...(failure.code === "io.destination_exists"
          ? ["Choose a new output path or explicitly authorize replacement with --overwrite."]
          : []),
      ],
    };
    if (machine && failure.exitCode === 2)
      process.stderr.write(`${failure.code}: ${JSON.stringify(failure.message)}\n`);
    emit(result, machine, command);
    process.exitCode = failure.exitCode;
  }
}

main();
