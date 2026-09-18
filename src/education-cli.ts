#!/usr/bin/env node
import { randomUUID } from "node:crypto";
import {
  closeSync,
  constants,
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
import { z } from "zod";
import {
  inspectEducational,
  projectFigure,
  renderEducationalSVG,
  validateEducational,
} from "./v2/index.ts";
import { authorSchema, publicSchema, type Stage } from "./v2/schema.ts";

const help = `circuitkit-education: isolated v2 education projection and public SVG/PNG export

Commands:
  schema [author|public]          Discover a strict JSON schema; default public
  project <author.json|->        Trusted local projection; requires --stage
  validate <public.json|->       Validate ONLY a public v2 document, never an author model
  inspect <public.json|->        Inspect ONLY public bounds and allowlisted targets
  render <public.json|->         Render ONLY public display data to SVG or PNG

Flags:
  --stage STAGE   teaching, question, or correction; project only; no default
  --out PATH      Atomically publish public JSON (project) or SVG/PNG (render)
  --overwrite     Explicit replacement with --out; never follows a destination symlink
  --format F      svg (default) or png; render only; PNG requires --out
  --scale N       Integer 1 through 4, default 1; PNG only; 16,000,000 pixel cap
  --namespace ID  Safe SVG ID namespace; SVG render only; default figure
  --json         One JSON envelope; automatic when stdout is not a TTY
  -h, --help     Show workflow help; no prompts
  --             End flags before filenames beginning with a dash

Workflow:
  circuitkit-education schema author
  circuitkit-education project author.json --stage question --out public.json
  circuitkit-education validate public.json
  circuitkit-education inspect public.json
  circuitkit-education render public.json --namespace exercise1 --out figure.svg
  circuitkit-education render public.json --format png --scale 2 --out figure.png

Project runs on a trusted host BEFORE distribution. A stage is NOT authorization.
Hosts own stage access control. Never forward author models or private stages to clients.
Only the selected public document appears in projection/export receipts.
Input '-' reads piped stdin. Inputs are UTF-8 JSON, at most 4 MiB and 24 nesting levels.
--out writes the artifact, not an envelope; parent directories must already exist.
Without --out, project returns document and render returns svg in the JSON envelope.
Existing output is preserved unless --overwrite is explicit. No network or prompts.
Exits: 0 success; 1 invalid input/document or PNG pixel limit; 2 usage or IO/native failure.
Validation is not simulation or electrical-safety approval. The v1 circuitkit CLI is unchanged.`;

type Diagnostic = { code: string; message: string };
type Envelope = {
  ok: boolean;
  diagnostics: Diagnostic[];
  nextSteps: string[];
  version: 2;
  [key: string]: unknown;
};

class CliError extends Error {
  constructor(
    readonly code: string,
    message: string,
    readonly exitCode: 1 | 2 = 2,
  ) {
    super(message);
  }
}

function invalid(): never {
  throw new CliError("educational.invalid", "Invalid or unsupported educational figure.", 1);
}

function usage(message: string): never {
  throw new CliError("cli.usage", `${message} Run circuitkit-education --help.`);
}

function errorCode(error: unknown): unknown {
  return error !== null && typeof error === "object" && "code" in error ? error.code : undefined;
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
    } else linkSync(temporary, destination);
  } catch (error) {
    failure =
      errorCode(error) === "EEXIST"
        ? new CliError(
            "io.destination_exists",
            "Destination already exists. Choose a new path or explicitly pass --overwrite.",
          )
        : new CliError(
            "io.write_failed",
            "Could not publish output. No existing destination is deleted as a fallback.",
          );
  }
  if (owned) {
    try {
      unlinkSync(temporary);
    } catch (error) {
      if (errorCode(error) !== "ENOENT")
        failure = new CliError(
          "io.write_failed",
          "Could not remove temporary output. The destination may already have been published.",
        );
    }
  }
  if (failure) throw failure;
}

async function readDocument(input: string): Promise<unknown> {
  const limit = 4 * 1024 * 1024;
  let fd: number | undefined;
  let bytes: Buffer;
  let size = 0;
  try {
    if (input === "-") {
      if (process.stdin.isTTY)
        throw new CliError(
          "io.read_failed",
          "Input '-' requires piped stdin; no prompt is available.",
        );
      bytes = Buffer.alloc(limit);
      try {
        for await (const chunk of process.stdin) {
          const part = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
          if (part.byteLength > limit - size) invalid();
          bytes.set(part, size);
          size += part.byteLength;
        }
      } finally {
        process.stdin.destroy();
      }
    } else {
      fd = openSync(input, constants.O_RDONLY | constants.O_NONBLOCK);
      const stat = fstatSync(fd);
      if (!stat.isFile())
        throw new CliError("io.read_failed", "Input must be a regular file or piped stdin.");
      if (stat.size > limit) invalid();
      bytes = Buffer.alloc(limit + 1);
      while (size <= limit) {
        const count = readSync(fd, bytes, size, Math.min(16384, bytes.length - size), null);
        if (!count) break;
        size += count;
      }
      if (size > limit) invalid();
    }
  } catch (error) {
    if (error instanceof CliError) throw error;
    throw new CliError("io.read_failed", "Could not read input.");
  } finally {
    if (fd !== undefined) closeSync(fd);
  }
  let text: string;
  try {
    text = new TextDecoder("utf-8", { fatal: true, ignoreBOM: true }).decode(
      bytes.subarray(0, size),
    );
  } catch {
    invalid();
  }
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
      if (++depth > 24) invalid();
    } else if (character === "}" || character === "]") depth--;
  }
  try {
    return JSON.parse(text);
  } catch {
    invalid();
  }
}

function emit(result: Envelope, machine: boolean): void {
  if (machine) process.stdout.write(`${JSON.stringify(result)}\n`);
  else if (!result.ok) {
    for (const diagnostic of result.diagnostics)
      process.stderr.write(`${diagnostic.code}: ${diagnostic.message}\n`);
  } else if (typeof result.help === "string") process.stdout.write(`${result.help}\n`);
  else if (typeof result.output === "string")
    process.stdout.write(`Wrote ${JSON.stringify(result.output)}\n`);
  else if (typeof result.svg === "string") process.stdout.write(`${result.svg}\n`);
  else process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  let machine = args.includes("--json") || !process.stdout.isTTY;
  const nextSteps = ["circuitkit-education --help"];
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
          stage: { type: "string" },
          out: { type: "string" },
          overwrite: { type: "boolean" },
          format: { type: "string" },
          scale: { type: "string" },
          namespace: { type: "string" },
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
      if (supplied.has(token.name)) usage("Duplicate options are not accepted.");
      supplied.add(token.name);
    }
    const command = parsed.positionals[0] ?? "help";
    if (!["help", "schema", "project", "validate", "inspect", "render"].includes(command))
      usage("Unknown command.");
    if (flags.help || command === "help") {
      if (command === "help" && parsed.positionals.length > 1) usage("Help takes no arguments.");
      emit(
        {
          ok: true,
          version: 2,
          help,
          diagnostics: [],
          nextSteps: ["circuitkit-education schema author", "circuitkit-education schema public"],
        },
        machine,
      );
      return;
    }
    if (command !== "project" && flags.stage !== undefined)
      usage("--stage applies only to trusted project, never public commands.");
    if (
      command !== "project" &&
      command !== "render" &&
      (flags.out !== undefined || flags.overwrite)
    )
      usage("--out and --overwrite apply only to project or render.");
    if (
      command !== "render" &&
      (flags.format !== undefined || flags.scale !== undefined || flags.namespace !== undefined)
    )
      usage("--format, --scale and --namespace apply only to render.");
    if (flags.overwrite && flags.out === undefined) usage("--overwrite requires --out.");
    if (flags.out === "" || flags.out === "-") usage("--out requires a file path, not '-'.");
    const format = flags.format ?? "svg";
    if (format !== "svg" && format !== "png") usage("--format must be svg or png.");
    if (
      flags.scale !== undefined &&
      (format !== "png" || typeof flags.scale !== "string" || !/^[1-4]$/.test(flags.scale))
    )
      usage("--scale requires PNG and an integer from 1 through 4.");
    if (format === "png" && flags.out === undefined)
      usage("PNG requires --out; bytes are never written to stdout.");
    if (
      flags.namespace !== undefined &&
      (format !== "svg" ||
        typeof flags.namespace !== "string" ||
        !/^[A-Za-z][A-Za-z0-9_-]{0,63}$/.test(flags.namespace))
    )
      usage(
        "--namespace requires SVG and a letter followed by at most 63 letters, digits, underscores or hyphens.",
      );
    if (command === "schema") {
      const model = parsed.positionals[1] ?? "public";
      if (parsed.positionals.length > 2 || (model !== "author" && model !== "public"))
        usage("schema accepts author or public.");
      const schema = z.toJSONSchema(model === "author" ? authorSchema : publicSchema, {
        io: "input",
      });
      emit(
        {
          ok: true,
          version: 2,
          model,
          schema,
          diagnostics: [],
          nextSteps: [
            "Use project on trusted author JSON; use validate on public JSON. Runtime validation also checks semantic and resource limits.",
          ],
        },
        machine,
      );
      return;
    }
    const input = parsed.positionals[1];
    if (parsed.positionals.length !== 2 || !input)
      usage("Expected exactly one JSON file path or '-'.");
    if (
      command === "project" &&
      !["teaching", "question", "correction"].includes(String(flags.stage))
    )
      usage("project requires --stage teaching, question, or correction.");
    const document = await readDocument(input);
    const result =
      command === "project"
        ? projectFigure(document, flags.stage as Stage)
        : command === "validate"
          ? validateEducational(document)
          : command === "inspect"
            ? inspectEducational(document)
            : format === "png"
              ? await (await import("./v2/png.ts")).renderEducationalPNG(document, {
                  scale: Number(flags.scale ?? 1),
                })
              : renderEducationalSVG(
                  document,
                  typeof flags.namespace === "string" ? { namespace: flags.namespace } : undefined,
                );
    if (!result.ok) {
      const operational = result.diagnostics.some(
        (diagnostic) => diagnostic.code === "png.render_failed",
      );
      emit({ ...result, version: 2, nextSteps }, machine);
      if (machine && operational)
        for (const diagnostic of result.diagnostics)
          process.stderr.write(`${diagnostic.code}: ${diagnostic.message}\n`);
      process.exitCode = operational ? 2 : 1;
      return;
    }
    let output: string | undefined;
    if (typeof flags.out === "string") {
      output = resolve(flags.out);
      const artifact =
        command === "project"
          ? `${JSON.stringify(result.document, null, 2)}\n`
          : "png" in result && result.png instanceof Uint8Array
            ? result.png
            : "svg" in result && typeof result.svg === "string"
              ? result.svg
              : undefined;
      if (artifact === undefined)
        throw new CliError("io.write_failed", "No output artifact is available.");
      atomicWrite(output, artifact, flags.overwrite === true);
    }
    const receipt: Record<string, unknown> = { ...result };
    if ("png" in result && result.png instanceof Uint8Array) {
      delete receipt.png;
      receipt.bytes = result.png.byteLength;
    }
    emit(
      {
        ...receipt,
        ok: true,
        version: 2,
        diagnostics: [],
        ...(output ? { output } : {}),
        nextSteps:
          command === "project"
            ? [
                "Distribute only document or the public JSON artifact, then validate, inspect or render it. Hosts must authorize the selected stage.",
              ]
            : [
                "Render or inspect only public documents. Visually review exports; validation is not electrical-safety approval.",
              ],
      },
      machine,
    );
  } catch (error) {
    const failure =
      error instanceof CliError
        ? error
        : new CliError("cli.failed", "Unexpected CLI failure; no successful result is available.");
    emit(
      {
        ok: false,
        version: 2,
        diagnostics: [{ code: failure.code, message: failure.message }],
        nextSteps,
      },
      machine,
    );
    if (machine && failure.exitCode === 2)
      process.stderr.write(`${failure.code}: ${failure.message}\n`);
    process.exitCode = failure.exitCode;
  }
}

main();
