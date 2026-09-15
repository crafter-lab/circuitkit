#!/usr/bin/env node
import { randomUUID } from "node:crypto";
import {
  closeSync,
  fsyncSync,
  linkSync,
  openSync,
  readFileSync,
  renameSync,
  unlinkSync,
  writeFileSync,
} from "node:fs";
import { basename, dirname, join, resolve } from "node:path";
import { parseArgs } from "node:util";
import { getCatalog, getSchema, inspect, renderFigureSVG, renderSVG, validate } from "./index.ts";
import type { Diagnostic } from "./types.ts";

const help = `circuitkit: portable circuit SVG from one versioned JSON document

Commands:
  schema                         Discover the document JSON schema
  catalog                        Discover recipes, pins, roles, nets, and SI values
  validate <file|->              Validate document, graph, geometry, and theme
  inspect <file|->               Inspect normalized circuit, roles, and bounds
  render <file|-> [--out <path>]  Render SVG; return it in the JSON result

Flags:
  --json       One JSON object on stdout (automatic when stdout is not a TTY)
  --out PATH   Write SVG atomically; render only; parent directory must exist
  --overwrite  Explicitly replace --out after successful rendering; render only
  --figure     Include the annotation legend and caption in SVG; render only
  -h, --help   Show help; no prompts
  --           End flags before positional filenames beginning with a dash

Input '-' reads stdin, never prompts. Omit --out to return SVG without writing.
Exits: 0 success; 1 invalid JSON/document; 2 usage or IO failure.
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

function atomicWrite(destination: string, svg: string, overwrite: boolean): void {
  const temporary = join(dirname(destination), `.${basename(destination)}.${randomUUID()}.tmp`);
  let owned = false;
  let failure: CliError | undefined;
  try {
    const fd = openSync(temporary, "wx", 0o644);
    owned = true;
    try {
      writeFileSync(fd, svg, "utf8");
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

function readDocument(input: string): unknown {
  let text: string;
  try {
    if (input === "-" && process.stdin.isTTY)
      throw new CliError(
        "io.read_failed",
        "/input",
        "Input '-' requires piped stdin; no interactive prompt is available.",
      );
    text = readFileSync(input === "-" ? 0 : input, "utf8");
  } catch (error) {
    if (error instanceof CliError) throw error;
    throw new CliError(
      "io.read_failed",
      "/input",
      `Could not read ${JSON.stringify(input)} (${errorCode(error) ?? "IO error"}).`,
    );
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
        `${diagnostic.code} ${JSON.stringify(diagnostic.path)}: ${JSON.stringify(diagnostic.message)}\n`,
      );
  } else if (command === "validate")
    process.stdout.write("Valid document and figure. Not an electrical-safety approval.\n");
  else if (command === "render") {
    if (typeof result.output === "string")
      process.stdout.write(`Wrote ${JSON.stringify(result.output)}\n`);
    else if (typeof result.svg === "string") process.stdout.write(`${result.svg}\n`);
  } else process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
}

function main(): void {
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
          help: { type: "boolean", short: "h" },
          out: { type: "string" },
          overwrite: { type: "boolean" },
          figure: { type: "boolean" },
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
    if (!["schema", "catalog", "validate", "inspect", "render", "help"].includes(command))
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
    if (command !== "render" && (flags.out !== undefined || flags.overwrite || flags.figure))
      usage("--out, --overwrite and --figure apply only to render.");
    if (flags.overwrite && flags.out === undefined) usage("--overwrite requires --out.");
    if (flags.out === "" || flags.out === "-")
      usage("--out requires a file path, not '-'; omit --out for an in-memory SVG result.");
    if (command === "schema" || command === "catalog") {
      if (parsed.positionals.length !== 1) usage(`${command} takes no document argument.`);
      const data = command === "schema" ? { schema: getSchema() } : { catalog: getCatalog() };
      emit(
        {
          ok: true,
          version: 1,
          ...data,
          diagnostics: [],
          nextSteps: [
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
      usage(`${command} requires exactly one JSON file path or '-'.`);
    const document = readDocument(input);
    const result =
      command === "validate"
        ? validate(document)
        : command === "inspect"
          ? inspect(document)
          : flags.figure
            ? renderFigureSVG(document)
            : renderSVG(document);
    if (!result.ok) {
      emit(
        {
          ...result,
          nextSteps: [
            "Correct the document using diagnostics and validPins, then run validate again.",
            "circuitkit catalog --json",
          ],
        },
        machine,
        command,
      );
      process.exitCode = 1;
      return;
    }
    let output: string | undefined;
    if (
      command === "render" &&
      typeof flags.out === "string" &&
      "svg" in result &&
      typeof result.svg === "string"
    ) {
      output = resolve(flags.out);
      atomicWrite(output, result.svg, flags.overwrite === true);
    }
    emit(
      {
        ...result,
        ...(output ? { output } : {}),
        nextSteps:
          command === "render"
            ? ["Inspect the SVG visually; validation does not certify an electrical design."]
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
