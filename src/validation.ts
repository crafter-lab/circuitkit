import { recipes } from "./catalog.ts";
import { componentPins, type FigureDocument, figureSchema } from "./schema.ts";
import type { Diagnostic } from "./types.ts";

export type DocumentValidationResult =
  | { ok: true; document: FigureDocument; diagnostics: Diagnostic[] }
  | { ok: false; diagnostics: Diagnostic[] };

export function jsonPointer(parts: readonly PropertyKey[]): string {
  return parts.length === 0
    ? ""
    : `/${parts.map((part) => String(part).replaceAll("~", "~0").replaceAll("/", "~1")).join("/")}`;
}

function canonicalize(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (value !== null && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value)
        .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
        .map(([key, entry]) => [key, canonicalize(entry)]),
    );
  }
  return value;
}

function graphKey(nets: readonly (readonly string[])[]): string {
  return JSON.stringify(nets.map((endpoints) => JSON.stringify([...endpoints].sort())).sort());
}

export function validateDocument(input: unknown): DocumentValidationResult {
  const diagnostics: Diagnostic[] = [];
  const add = (
    code: Diagnostic["code"],
    path: readonly PropertyKey[],
    message: string,
    validPins?: string[],
  ) => {
    diagnostics.push({
      code,
      path: jsonPointer(path),
      message,
      ...(validPins ? { validPins } : {}),
    });
  };
  if (
    input !== null &&
    typeof input === "object" &&
    Object.hasOwn(input, "version") &&
    Reflect.get(input, "version") !== 1
  ) {
    add(
      "document.unsupported_version",
      ["version"],
      "Only document version 1 is supported. Run circuitkit schema --json.",
    );
    return { ok: false, diagnostics };
  }
  const parsed = figureSchema.safeParse(input);
  if (!parsed.success) {
    for (const issue of parsed.error.issues) {
      const code =
        issue.path[0] === "presentation" && issue.path[1] === "theme"
          ? "theme.invalid_token"
          : issue.path[0] === "layout"
            ? "layout.topology_mismatch"
            : "document.invalid_field";
      if (issue.code === "unrecognized_keys") {
        for (const key of issue.keys)
          add(
            code,
            [...issue.path, key],
            `Unknown field ${JSON.stringify(key)}; consult circuitkit schema --json.`,
          );
      } else {
        add(code, issue.path, issue.message);
      }
    }
    return { ok: false, diagnostics };
  }

  const document = parsed.data;
  const { components, ports, nets } = document.circuit;
  const declared = new Set<string>();
  for (const [id, component] of Object.entries(components)) {
    for (const pin of componentPins[component.type]) declared.add(`${id}.${pin}`);
    if (Object.hasOwn(ports, id))
      add(
        "circuit.endpoint_conflict",
        ["circuit", "ports", id],
        `ID ${JSON.stringify(id)} is shared by a component and port; choose distinct IDs.`,
      );
  }
  for (const id of Object.keys(ports)) declared.add(id);
  const seen = new Map<string, string>();
  for (const [netId, endpoints] of Object.entries(nets)) {
    for (const [index, endpoint] of endpoints.entries()) {
      const path = ["circuit", "nets", netId, index];
      const dot = endpoint.indexOf(".");
      if (dot !== -1) {
        const id = endpoint.slice(0, dot);
        const pin = endpoint.slice(dot + 1);
        if (!Object.hasOwn(components, id)) {
          add(
            "circuit.unknown_component",
            path,
            `Component ${JSON.stringify(id)} does not exist. Use a declared component ID or a bare port ID.`,
          );
          continue;
        }
        const component = components[id];
        if (!component) continue;
        const validPins: readonly string[] = componentPins[component.type];
        if (!validPins.includes(pin)) {
          add(
            "circuit.unknown_pin",
            path,
            `Pin ${JSON.stringify(endpoint)} does not exist. Valid endpoints: ${validPins.map((valid) => `${id}.${valid}`).join(", ")}.`,
            [...validPins],
          );
          continue;
        }
      } else if (!Object.hasOwn(ports, endpoint)) {
        const component = Object.hasOwn(components, endpoint) ? components[endpoint] : undefined;
        if (component) {
          add(
            "circuit.unknown_pin",
            path,
            `Component ${JSON.stringify(endpoint)} needs a pin suffix.`,
            [...componentPins[component.type]],
          );
        } else {
          add(
            "circuit.unknown_component",
            path,
            `Endpoint ${JSON.stringify(endpoint)} does not exist. Use a declared port ID or componentId.pin.`,
          );
        }
        continue;
      }
      if (seen.has(endpoint))
        add(
          "circuit.endpoint_conflict",
          path,
          `Endpoint ${JSON.stringify(endpoint)} already belongs to net ${JSON.stringify(seen.get(endpoint))}; every endpoint must occur exactly once.`,
        );
      else seen.set(endpoint, netId);
    }
  }
  for (const endpoint of [...declared].sort()) {
    if (!seen.has(endpoint))
      add(
        "circuit.unconnected_endpoint",
        ["circuit", "nets"],
        `Declared endpoint ${JSON.stringify(endpoint)} is not connected; assign it to exactly one net.`,
      );
  }

  const recipe = recipes[document.layout.preset];
  const roles = document.layout.roles;
  let validRoles = true;
  const mismatch = (path: readonly PropertyKey[], message: string) => {
    validRoles = false;
    add("layout.topology_mismatch", path, message);
  };
  const requiredRoles = Object.entries(recipe.roles);
  const used = new Set<string>();
  for (const role of Object.keys(roles)) {
    if (!Object.hasOwn(recipe.roles, role))
      mismatch(
        ["layout", "roles", role],
        `Unknown role ${JSON.stringify(role)}. Valid roles: ${Object.keys(recipe.roles).join(", ")}.`,
      );
  }
  for (const [role, expectedType] of requiredRoles) {
    const id = Object.hasOwn(roles, role) ? roles[role] : undefined;
    if (id === undefined) {
      mismatch(
        ["layout", "roles", role],
        `Missing role ${JSON.stringify(role)}; assign a ${expectedType} ID.`,
      );
      continue;
    }
    if (used.has(id))
      mismatch(
        ["layout", "roles", role],
        `ID ${JSON.stringify(id)} fills multiple roles; each role requires a distinct entity.`,
      );
    used.add(id);
    const actual =
      expectedType === "terminal" || expectedType === "ground"
        ? Object.hasOwn(ports, id)
          ? ports[id]?.kind
          : undefined
        : Object.hasOwn(components, id)
          ? components[id]?.type
          : undefined;
    if (actual !== expectedType)
      mismatch(
        ["layout", "roles", role],
        `Role ${JSON.stringify(role)} requires ${expectedType}; ${JSON.stringify(id)} resolves to ${actual ?? "no matching entity"}.`,
      );
  }
  for (const [section, entities] of [
    ["components", components],
    ["ports", ports],
  ] as const) {
    for (const id of Object.keys(entities)) {
      if (!used.has(id))
        mismatch(
          ["circuit", section, id],
          `Entity ${JSON.stringify(id)} is not covered by recipe ${document.layout.preset}; extra topology is not supported.`,
        );
    }
  }
  if (validRoles) {
    const expected = recipe.nets.map((endpoints) =>
      endpoints.map((endpoint) => {
        const dot = endpoint.indexOf(".");
        const role = dot === -1 ? endpoint : endpoint.slice(0, dot);
        return `${roles[role]}${dot === -1 ? "" : endpoint.slice(dot)}`;
      }),
    );
    if (graphKey(Object.values(nets)) !== graphKey(expected))
      add(
        "layout.topology_mismatch",
        ["circuit", "nets"],
        `Expected exactly these role-resolved endpoint sets (net names are arbitrary): ${JSON.stringify(expected.map((net) => [...net].sort()))}.`,
      );
  }
  const annotationNets = new Set<string>();
  const annotationLabels = new Set<string>();
  for (const [index, annotation] of (document.presentation.annotations?.nets ?? []).entries()) {
    const path = ["presentation", "annotations", "nets", index];
    if (!Object.hasOwn(nets, annotation.net))
      add(
        "annotation.unknown_net",
        [...path, "net"],
        `Unknown annotation net ${JSON.stringify(annotation.net)}.`,
      );
    if (annotationNets.has(annotation.net))
      add(
        "annotation.duplicate_net",
        [...path, "net"],
        `Net ${JSON.stringify(annotation.net)} is already annotated.`,
      );
    if (annotationLabels.has(annotation.label.trim()))
      add(
        "annotation.duplicate_label",
        [...path, "label"],
        `Label ${JSON.stringify(annotation.label)} is already used.`,
      );
    annotationNets.add(annotation.net);
    annotationLabels.add(annotation.label.trim());
  }
  const highlight = document.presentation.highlight;
  if (highlight) {
    for (const [kind, ids] of Object.entries(highlight)) {
      const entities = kind === "components" ? components : nets;
      for (const [index, id] of ids.entries()) {
        if (!Object.hasOwn(entities, id))
          add(
            "presentation.unknown_highlight",
            ["presentation", "highlight", kind, index],
            `Unknown ${kind} highlight ${JSON.stringify(id)}. Valid IDs: ${Object.keys(entities).sort().join(", ")}.`,
          );
      }
    }
  }
  if (diagnostics.length > 0) return { ok: false, diagnostics };
  for (const endpoints of Object.values(nets)) endpoints.sort();
  if (highlight) {
    highlight.components = [...new Set(highlight.components)].sort();
    highlight.nets = [...new Set(highlight.nets)].sort();
  }
  return { ok: true, document: canonicalize(document) as FigureDocument, diagnostics };
}
