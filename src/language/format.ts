import { resolveCircuitSource } from "./resolve.ts";
import type {
  PresentationSelector,
  SourceBody,
  SourceEndpoint,
  SourcePort,
  SourceProgram,
  SourceResult,
} from "./types.ts";

const name = (value: string) =>
  /^[A-Za-z0-9_+/-]+$/.test(value) && !value.includes("--") && value !== "as"
    ? value
    : JSON.stringify(value);
const ports = (values: SourcePort[]) =>
  values
    .map(
      (port) =>
        `${name(port.id)}${port.label === undefined ? "" : ` as ${JSON.stringify(port.label)}`}`,
    )
    .join(" ");
const endpoint = (value: SourceEndpoint) => `${name(value.module)}.${name(value.port)}`;
function bodyLines(body: SourceBody, indent: string): string[] {
  const lines = body.modules.map(
    (module) =>
      `${indent}${name(module.id)}: ${name(module.type)}${module.label === undefined ? "" : ` ${JSON.stringify(module.label)}`}${module.ports === undefined ? "" : ` (${ports(module.ports)})`}`,
  );
  if (body.modules.length && (body.connections.length || body.exposures.length)) lines.push("");
  let active: string | undefined;
  for (const link of body.connections) {
    if (link.bus !== active) {
      if (active !== undefined) lines.push(`${indent}}`);
      if (link.bus !== undefined) lines.push(`${indent}bus ${name(link.bus)} {`);
      active = link.bus;
    }
    const prefix = indent + (active === undefined ? "" : "  ");
    const operator = link.direction === "forward" ? "->" : link.direction === "both" ? "<->" : "--";
    lines.push(
      `${prefix}${link.kind === "signal" ? "" : `${link.kind} `}${endpoint(link.from)} ${operator} ${endpoint(link.to)}${link.label === undefined ? "" : ` ${JSON.stringify(link.label)}`}`,
    );
  }
  if (active !== undefined) lines.push(`${indent}}`);
  if (body.connections.length && body.exposures.length) lines.push("");
  for (const exposure of body.exposures)
    lines.push(`${indent}expose ${name(exposure.port)} = ${endpoint(exposure.target)}`);
  return lines;
}
export function printProgram(program: SourceProgram): string {
  const lines = [
    `circuit ${name(program.id)} v1`,
    `title ${JSON.stringify(program.title)}`,
    `view ${program.view}`,
  ];
  if (program.theme !== "geist-light") lines.push(`theme ${program.theme}`);
  for (const definition of program.definitions)
    lines.push(
      "",
      `define ${name(definition.id)} (${ports(definition.ports)}) {`,
      ...bodyLines(definition, "  "),
      "}",
    );
  lines.push("", ...bodyLines(program, ""));
  if (program.presentation) {
    const selector = (value: PresentationSelector): string =>
      value.kind === "port"
        ? `port ${endpoint(value.endpoint)}`
        : value.kind === "link"
          ? `link ${endpoint(value.from)} -- ${endpoint(value.to)}`
          : `${value.kind} ${name(value.name)}`;
    lines.push("", "presentation {");
    for (const section of program.presentation.sections)
      lines.push(
        `  section ${name(section.id)} {`,
        ...section.selectors.map((value) => `    ${selector(value)}`),
        "  }",
      );
    for (const scene of program.presentation.scenes) {
      lines.push(
        `  scene ${name(scene.id)} ${JSON.stringify(scene.label)} {`,
        ...scene.highlights.map((value) => `    highlight ${selector(value)}`),
      );
      if (scene.dim) lines.push("    dim others");
      for (const flow of scene.flows)
        lines.push(
          `    flow ${selector(flow.selector)} {`,
          "      style sweep",
          `      period ${flow.periodMs}ms`,
          ...(flow.direction === "declared" ? [] : [`      direction ${flow.direction}`]),
          "    }",
        );
      lines.push("  }");
    }
    lines.push("}");
  }
  return `${lines.join("\n").trimEnd()}\n`;
}
export function formatCircuitSource(source: string): SourceResult<{ source: string }> {
  const result = resolveCircuitSource(source);
  if (!result.ok) return result;
  return { ok: true, source: printProgram(result.program), diagnostics: [] };
}
