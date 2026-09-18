import { renderFigureSVG } from "./figure-svg.ts";
import type { FigureDocument } from "./schema.ts";
import type { Failure } from "./types.ts";

export type ShareView = "schematic" | "annotated" | "figure";

function isShareView(value: unknown): value is ShareView {
  return value === "schematic" || value === "annotated" || value === "figure";
}

const maxFragmentBytes = 16 * 1024;
const maxDepth = 64;
const prefix = "#v=1&doc=";
const encoder = new TextEncoder();

function failure(code: string, message: string, path = "/hash"): Failure {
  return { ok: false, diagnostics: [{ code: `share.${code}`, path, message }] };
}

function serialize(input: unknown): string {
  const chunks: string[] = [];
  const ancestors = new WeakSet<object>();
  let bytes = 0;
  let nodes = 0;
  const append = (text: string) => {
    bytes += encoder.encode(text).length;
    if (bytes > maxFragmentBytes) throw new RangeError("size");
    chunks.push(text);
  };
  const quote = (text: string) => {
    if (text.length > maxFragmentBytes) throw new RangeError("size");
    append(JSON.stringify(text));
  };
  const visit = (value: unknown, depth: number) => {
    if (depth > maxDepth) throw new RangeError("depth");
    if (++nodes > maxFragmentBytes) throw new RangeError("size");
    if (value === null || typeof value === "boolean") {
      append(String(value));
    } else if (typeof value === "string") {
      quote(value);
    } else if (typeof value === "number" && Number.isFinite(value)) {
      append(JSON.stringify(value));
    } else if (typeof value === "object" && value !== null) {
      if (ancestors.has(value)) throw new TypeError("JSON cannot contain cycles.");
      const array = Array.isArray(value);
      const prototype = Object.getPrototypeOf(value);
      if (prototype !== null && prototype !== (array ? Array.prototype : Object.prototype))
        throw new TypeError("Only plain JSON objects and arrays are accepted.");
      const keys = Reflect.ownKeys(value);
      if (keys.length > maxFragmentBytes) throw new RangeError("size");
      if (array && value.length > maxFragmentBytes) throw new RangeError("size");
      ancestors.add(value);
      append(array ? "[" : "{");
      let count = 0;
      for (const key of keys) {
        if (array && key === "length") continue;
        const descriptor = Object.getOwnPropertyDescriptor(value, key);
        if (typeof key !== "string" || !descriptor || !("value" in descriptor))
          throw new TypeError("JSON properties must be string-keyed data, not accessors.");
        if (!descriptor.enumerable) throw new TypeError("JSON properties must be enumerable.");
        if (array && key !== String(count))
          throw new TypeError("JSON arrays must be dense and have no extra properties.");
        if (count++) append(",");
        if (!array) {
          quote(key);
          append(":");
        }
        visit(descriptor.value, depth + 1);
      }
      if (array && count !== value.length) throw new TypeError("JSON arrays must be dense.");
      append(array ? "]" : "}");
      ancestors.delete(value);
    } else {
      throw new TypeError("Only finite JSON values are accepted.");
    }
  };
  visit(input, 0);
  return chunks.join("");
}

function base64url(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replaceAll("+", "-").replaceAll("/", "_").replace(/=+$/, "");
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

export function encodeShareDocument(
  input: unknown,
  options?: { view?: ShareView },
): { ok: true; hash: string; document: FigureDocument } | Failure {
  let view: ShareView | undefined;
  try {
    if (options !== undefined) {
      if (options === null || typeof options !== "object" || Array.isArray(options))
        return failure("invalid_options", "Expected only an optional share view.", "/options");
      const prototype = Object.getPrototypeOf(options);
      if (
        (prototype !== null && prototype !== Object.prototype) ||
        Reflect.ownKeys(options).some((key) => key !== "view")
      )
        return failure("invalid_options", "Expected only an optional share view.", "/options");
      const descriptor = Object.getOwnPropertyDescriptor(options, "view");
      if (descriptor) {
        if (
          !("value" in descriptor) ||
          !descriptor.enumerable ||
          (descriptor.value !== undefined && !isShareView(descriptor.value))
        )
          return failure(
            "invalid_options",
            "Share view must be schematic, annotated, or figure.",
            "/options/view",
          );
        view = descriptor.value;
      }
    }
  } catch {
    return failure("invalid_options", "Expected plain share options.", "/options");
  }
  let json: string;
  try {
    json = serialize(input);
  } catch (error) {
    if (error instanceof RangeError && error.message === "depth")
      return failure("too_deep", `JSON nesting must not exceed ${maxDepth} levels.`, "");
    if (error instanceof RangeError && error.message === "size")
      return failure("too_large", "The share fragment must fit within 16 KiB.", "");
    return failure("invalid_input", "Expected bounded, acyclic plain JSON data.", "");
  }
  try {
    const result = renderFigureSVG(JSON.parse(json));
    if (!result.ok) return result;
    const hash =
      prefix +
      base64url(encoder.encode(serialize(result.document))) +
      (view === undefined ? "" : `&view=${view}`);
    if (hash.length > maxFragmentBytes)
      return failure("too_large", "The share fragment must fit within 16 KiB.");
    return { ok: true, hash, document: result.document };
  } catch {
    return failure("invalid_input", "The figure could not be validated or encoded.", "");
  }
}

export function decodeShareDocument(
  hash: string,
): { ok: true; document: FigureDocument; view?: ShareView } | Failure {
  if (typeof hash !== "string") return failure("invalid_fragment", "Expected a share fragment.");
  if (hash.length > maxFragmentBytes || encoder.encode(hash).length > maxFragmentBytes)
    return failure("too_large", "The share fragment must fit within 16 KiB.");
  if (!hash.startsWith("#"))
    return failure("invalid_fragment", "Expected a fragment beginning with '#'.");
  const parameters = new Map<string, string>();
  const parameterMessage = "Use exactly one 'v' and one 'doc', and at most one 'view' parameter.";
  for (const part of hash.slice(1).split("&")) {
    const match = /^(v|doc|view)=([^=]+)$/.exec(part);
    const key = match?.[1];
    const value = match?.[2];
    if (!key || !value || parameters.has(key))
      return failure("invalid_parameters", parameterMessage);
    parameters.set(key, value);
  }
  if (!parameters.has("v") || !parameters.has("doc"))
    return failure("invalid_parameters", parameterMessage);
  if (parameters.get("v") !== "1")
    return failure("unsupported_version", "Only share version 1 is supported.");
  const view = parameters.get("view");
  if (view !== undefined && !isShareView(view))
    return failure("invalid_view", "Share view must be schematic, annotated, or figure.", "/view");
  const encoded = parameters.get("doc");
  if (!encoded || !/^[A-Za-z0-9_-]+$/.test(encoded) || encoded.length % 4 === 1)
    return failure("invalid_encoding", "Expected unpadded base64url UTF-8 JSON.");
  let json: string;
  try {
    const binary = atob(encoded.replaceAll("-", "+").replaceAll("_", "/"));
    const bytes = Uint8Array.from(binary, (character) => character.charCodeAt(0));
    if (base64url(bytes) !== encoded)
      return failure("invalid_encoding", "Expected canonical unpadded base64url.");
    json = new TextDecoder("utf-8", { fatal: true, ignoreBOM: true }).decode(bytes);
  } catch {
    return failure("invalid_encoding", "Expected unpadded base64url UTF-8 JSON.");
  }
  if (tooDeep(json))
    return failure("too_deep", `JSON nesting must not exceed ${maxDepth} levels.`, "/doc");
  let input: unknown;
  try {
    input = JSON.parse(json);
  } catch {
    return failure("invalid_json", "The share document must contain valid JSON.", "/doc");
  }
  try {
    const result = renderFigureSVG(input);
    return result.ok
      ? { ok: true, document: result.document, ...(view === undefined ? {} : { view }) }
      : result;
  } catch {
    return failure("invalid_input", "The shared figure could not be validated.", "/doc");
  }
}
