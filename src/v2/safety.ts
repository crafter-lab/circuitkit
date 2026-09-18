export type Diagnostic = { code: string; message: string };
export type Failure = { ok: false; diagnostics: Diagnostic[] };
export type Success<T> = { ok: true; diagnostics: [] } & T;
export type Result<T> = Success<T> | Failure;
export const failure = (): Failure => ({
  ok: false,
  diagnostics: [
    { code: "educational.invalid", message: "Invalid or unsupported educational figure." },
  ],
});

export class AuthorError extends Error {
  constructor(public readonly code: string) {
    super("Invalid educational author model.");
  }
}

export function requireModel(condition: unknown, code: string): asserts condition {
  if (!condition) throw new AuthorError(code);
}

export function boundedJSON(input: unknown): unknown {
  let nodes = 0;
  let characters = 0;
  const active = new WeakSet<object>();
  const visit = (value: unknown, depth: number): unknown => {
    requireModel(++nodes <= 80000 && depth <= 24, "json.limit");
    if (value === null || typeof value === "boolean") return value;
    if (typeof value === "number") {
      requireModel(Number.isFinite(value), "json.number");
      return value;
    }
    if (typeof value === "string") {
      characters += value.length;
      requireModel(value.length <= 1000 && characters <= 250000, "json.text");
      return value;
    }
    requireModel(typeof value === "object" && value !== null, "json.type");
    requireModel(!active.has(value), "json.cycle");
    const array = Array.isArray(value);
    const proto = Object.getPrototypeOf(value);
    requireModel(
      array ? proto === Array.prototype : proto === Object.prototype || proto === null,
      "json.prototype",
    );
    const keys = Reflect.ownKeys(value);
    requireModel(keys.length <= (array ? 4097 : 64), "json.keys");
    active.add(value);
    const output: unknown[] | Record<string, unknown> = array ? [] : Object.create(null);
    for (const key of keys) {
      requireModel(typeof key === "string", "json.key");
      if (array && key === "length") continue;
      requireModel(
        key.length <= 192 && !["__proto__", "constructor", "prototype"].includes(key),
        "json.key",
      );
      const descriptor = Object.getOwnPropertyDescriptor(value, key);
      requireModel(descriptor && "value" in descriptor && descriptor.enumerable, "json.accessor");
      if (array)
        requireModel(
          /^(0|[1-9][0-9]*)$/.test(key) && Number(key) === (output as unknown[]).length,
          "json.array",
        );
      Object.defineProperty(output, key, {
        value: visit(descriptor.value, depth + 1),
        enumerable: true,
        writable: true,
        configurable: true,
      });
    }
    if (array)
      requireModel((output as unknown[]).length === (value as unknown[]).length, "json.sparse");
    active.delete(value);
    return output;
  };
  return visit(input, 0);
}

export function unique(ids: string[]): void {
  requireModel(new Set(ids).size === ids.length, "identity.duplicate");
}
