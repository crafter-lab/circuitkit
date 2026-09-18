import type { Diagnostic, Failure } from "../types.ts";

const knownErrors = new WeakMap<object, Diagnostic>();

export class DiagramError extends Error {
  constructor(diagnostic: Diagnostic) {
    super(diagnostic.message);
    knownErrors.set(this, diagnostic);
  }
}

export const diagnosticFrom = (error: unknown): Diagnostic | undefined =>
  typeof error === "object" && error !== null ? knownErrors.get(error) : undefined;

export const pointer = (path: PropertyKey[]) =>
  path.length
    ? `/${path.map((key) => String(key).replaceAll("~", "~0").replaceAll("/", "~1")).join("/")}`
    : "";

export function reject(code: string, path: string, message: string): never {
  throw new DiagramError({ code, path, message });
}

export function diagramFailure(error: unknown): Failure {
  return {
    ok: false,
    diagnostics: [
      diagnosticFrom(error) ?? {
        code: "diagram.invalid",
        path: "",
        message: "Invalid or unsupported diagram input.",
      },
    ],
  };
}

export function plainJSON(input: unknown): unknown {
  let nodes = 0;
  let characters = 0;
  const active = new WeakSet<object>();
  const visit = (value: unknown, path: string, depth: number): unknown => {
    if (++nodes > 4096 || depth > 8)
      reject("diagram.budget", path, "Use at most 4096 JSON values and 8 nesting levels.");
    if (value === null || typeof value === "boolean") return value;
    if (typeof value === "number" && Number.isFinite(value)) return value;
    if (typeof value === "string") {
      characters += value.length;
      if (value.length > 256 || characters > 16000)
        reject(
          "diagram.budget",
          path,
          "Use at most 256 characters per JSON string and 16000 in total.",
        );
      return value;
    }
    if (typeof value !== "object" || value === null)
      reject("diagram.json", path, "Use only finite, plain JSON values.");
    if (active.has(value))
      reject("diagram.json", path, "JSON values cannot contain object cycles.");
    const array = Array.isArray(value);
    const prototype = Object.getPrototypeOf(value);
    if (
      array ? prototype !== Array.prototype : prototype !== Object.prototype && prototype !== null
    )
      reject("diagram.json", path, "Use plain JSON objects and arrays, not custom prototypes.");
    const keys = Reflect.ownKeys(value);
    if (keys.length > (array ? 129 : 16))
      reject("diagram.budget", path, "Too many JSON properties or array entries.");
    active.add(value);
    const result: unknown[] | Record<string, unknown> = array ? [] : Object.create(null);
    for (const key of keys) {
      if (array && key === "length") continue;
      if (typeof key !== "string") reject("diagram.json", path, "Symbol keys are not JSON.");
      const child = `${path}${pointer([key])}`;
      if (key.length > 96 || ["__proto__", "constructor", "prototype"].includes(key))
        reject("diagram.json", child, "Unsupported JSON property name.");
      const descriptor = Object.getOwnPropertyDescriptor(value, key);
      if (!descriptor || !("value" in descriptor) || !descriptor.enumerable)
        reject("diagram.json", child, "Use enumerable data properties, not accessors.");
      if (array && (!/^(0|[1-9][0-9]*)$/.test(key) || Number(key) !== (result as unknown[]).length))
        reject("diagram.json", child, "Use dense arrays without extra properties.");
      Object.defineProperty(result, key, {
        value: visit(descriptor.value, child, depth + 1),
        enumerable: true,
        writable: true,
        configurable: true,
      });
    }
    if (
      array &&
      (result as unknown[]).length !== Object.getOwnPropertyDescriptor(value, "length")?.value
    )
      reject("diagram.json", path, "Sparse arrays are not supported.");
    active.delete(value);
    return result;
  };
  return visit(input, "", 0);
}
