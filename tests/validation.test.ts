import { describe, expect, test } from "bun:test";
import { z } from "zod";
import { getCatalog, getSchema, loadExample } from "../src/catalog.ts";
import { type FigureDocument, figureSchema, recipeIds, themePresets } from "../src/schema.ts";
import { jsonPointer, validateDocument } from "../src/validation.ts";

function expectCode(input: unknown, code: string) {
  const result = validateDocument(input);
  expect(result.ok).toBe(false);
  expect(result).not.toHaveProperty("document");
  expect(result).not.toHaveProperty("svg");
  expect(result.diagnostics.map((diagnostic) => diagnostic.code)).toContain(code);
  return result.diagnostics;
}

function rename(document: FigureDocument): FigureDocument {
  const ids = new Map([
    ["R1", "__proto__"],
    ["C1", "constructor"],
    ["VIN", "toString"],
    ["VOUT", "out/~"],
    ["GND", "ground/~"],
    ["input", "net/~"],
    ["output", "hasOwnProperty"],
    ["ground", "__proto__"],
  ]);
  const id = (value: string) => ids.get(value) ?? value;
  const endpoint = (value: string) => {
    const dot = value.indexOf(".");
    return dot === -1 ? id(value) : `${id(value.slice(0, dot))}${value.slice(dot)}`;
  };
  return {
    ...document,
    circuit: {
      components: Object.fromEntries(
        Object.entries(document.circuit.components).map(([key, value]) => [id(key), value]),
      ),
      ports: Object.fromEntries(
        Object.entries(document.circuit.ports).map(([key, value]) => [id(key), value]),
      ),
      nets: Object.fromEntries(
        Object.entries(document.circuit.nets).map(([key, values]) => [
          id(key),
          values.map(endpoint),
        ]),
      ),
    },
    layout: {
      ...document.layout,
      roles: Object.fromEntries(
        Object.entries(document.layout.roles).map(([key, value]) => [key, id(value)]),
      ),
    },
    presentation: {
      ...document.presentation,
      highlight: { components: ["__proto__"], nets: ["__proto__"] },
    },
  };
}

describe("single schema and recipe catalog", () => {
  for (const recipe of recipeIds) {
    for (const theme of themePresets) {
      test(`${recipe} / ${theme} validates without geometry dependencies`, () => {
        const document = loadExample(recipe);
        document.presentation.theme.preset = theme;
        expect(figureSchema.safeParse(document).success).toBe(true);
        expect(validateDocument(document).ok).toBe(true);
      });
    }
  }

  test("published JSON schema is generated from the runtime schema", () => {
    expect(getSchema()).toEqual(z.toJSONSchema(figureSchema));
    expect(getSchema()).toMatchObject({ type: "object", additionalProperties: false });
    expect(getCatalog().recipes.map(({ id }) => id)).toEqual([...recipeIds]);
    expect(getCatalog().components.led.pins).toEqual(["anode", "cathode"]);
    expect(getCatalog().recipes[2]?.derived.formula).toBeNull();
  });

  test("examples and catalog are independent copies", () => {
    const document = loadExample("rc-lowpass");
    document.circuit.nets.input?.push("broken");
    document.presentation.title = "changed";
    expect(loadExample("rc-lowpass").presentation.title).toBe("Filtro RC");
    expect(validateDocument(loadExample("rc-lowpass")).ok).toBe(true);
    const catalog = getCatalog();
    catalog.recipes.pop();
    expect(getCatalog().recipes.map(({ id }) => id)).toEqual([...recipeIds]);
    expect(() => Reflect.apply(loadExample, undefined, ["constructor"])).toThrow(RangeError);
  });

  test("normalization orders keys and endpoint/highlight sets without changing input", () => {
    const document = loadExample("rc-lowpass");
    document.presentation.highlight = { components: ["R1", "C1", "R1"], nets: ["output", "input"] };
    const before = JSON.stringify(document);
    const result = validateDocument(document);
    expect(result.ok).toBe(true);
    expect(JSON.stringify(document)).toBe(before);
    if (!result.ok) return;
    expect(Object.keys(result.document.circuit.components)).toEqual(["C1", "R1"]);
    expect(result.document.circuit.nets.input).toEqual(["R1.a", "VIN"]);
    expect(result.document.presentation.highlight?.components).toEqual(["C1", "R1"]);
    const reversed = JSON.parse(before) as FigureDocument;
    reversed.circuit.nets = Object.fromEntries(
      Object.entries(reversed.circuit.nets)
        .reverse()
        .map(([key, values]) => [key, values.reverse()]),
    );
    const other = validateDocument(reversed);
    expect(other.ok && JSON.stringify(other.document)).toBe(JSON.stringify(result.document));
    expect(validateDocument(result.document)).toEqual(result);
  });
});

describe("strict schema and semantic tokens", () => {
  test("unsupported versions and missing required fields are rejected", () => {
    expectCode({ ...loadExample("rc-lowpass"), version: 2 }, "document.unsupported_version");
    for (const value of [null, undefined, [], {}, "{}", 42])
      expectCode(value, "document.invalid_field");
  });

  test("unknown fields are never stripped into a valid document", () => {
    const doc = loadExample("rc-lowpass");
    expectCode({ ...doc, extra: 1 }, "document.invalid_field");
    expectCode({ ...doc, circuit: { ...doc.circuit, coordinates: [] } }, "document.invalid_field");
    expectCode(
      {
        ...doc,
        circuit: {
          ...doc.circuit,
          components: {
            ...doc.circuit.components,
            R1: { type: "resistor", resistance: 1, voltage: 5 },
          },
        },
      },
      "document.invalid_field",
    );
    expectCode(
      {
        ...doc,
        presentation: { ...doc.presentation, theme: { preset: "geist-light", css: "url(x)" } },
      },
      "theme.invalid_token",
    );
    expectCode(
      {
        ...doc,
        presentation: { ...doc.presentation, highlight: { components: [], nets: [], ports: [] } },
      },
      "document.invalid_field",
    );
  });

  for (const value of [
    0,
    -1,
    Number.NaN,
    Number.POSITIVE_INFINITY,
    Number.NEGATIVE_INFINITY,
    "10 kΩ",
    "",
    null,
  ]) {
    test(`reject non-positive/non-numeric/non-finite SI ${String(value)}`, () => {
      const doc = loadExample("rc-lowpass");
      expectCode(
        {
          ...doc,
          circuit: {
            ...doc.circuit,
            components: { ...doc.circuit.components, R1: { type: "resistor", resistance: value } },
          },
        },
        "document.invalid_field",
      );
      expectCode(
        {
          ...doc,
          circuit: {
            ...doc.circuit,
            components: {
              ...doc.circuit.components,
              C1: { type: "capacitor", capacitance: value },
            },
          },
        },
        "document.invalid_field",
      );
      const led = loadExample("led-series");
      expectCode(
        {
          ...led,
          circuit: {
            ...led.circuit,
            components: { ...led.circuit.components, V1: { type: "dc-source", voltage: value } },
          },
        },
        "document.invalid_field",
      );
    });
  }

  test("opaque colors and positive scales only, no contrast or geometry here", () => {
    const doc = loadExample("rc-lowpass");
    for (const overrides of [
      { wire: "url(https://example.org)" },
      { label: "#1234" },
      { label: "#11223344" },
      { strokeWidth: 0 },
      { fontScale: Number.POSITIVE_INFINITY },
      { fontFamily: "Other" },
      { unknown: 1 },
    ]) {
      expectCode(
        {
          ...doc,
          presentation: { ...doc.presentation, theme: { preset: "geist-light", overrides } },
        },
        "theme.invalid_token",
      );
    }
    doc.presentation.theme.overrides = {
      background: "#fff",
      label: "#fff",
      fontScale: 999,
      strokeWidth: 999,
    };
    expect(validateDocument(doc).ok).toBe(true);
  });

  test("unknown highlights use own membership, not prototype lookup", () => {
    const doc = loadExample("rc-lowpass");
    doc.presentation.highlight = { components: ["toString"], nets: ["constructor"] };
    const diagnostics = expectCode(doc, "presentation.unknown_highlight");
    expect(diagnostics.map(({ path }) => path)).toEqual([
      "/presentation/highlight/components/0",
      "/presentation/highlight/nets/0",
    ]);
  });
});

describe("endpoint and exact role-resolved graph validation", () => {
  test("invalid pins include actionable pins and escaped JSON Pointer", () => {
    const doc = loadExample("rc-lowpass");
    delete doc.circuit.nets.input;
    doc.circuit.nets["in/~"] = ["VIN", "R1.c"];
    const diagnostics = expectCode(doc, "circuit.unknown_pin");
    expect(diagnostics).toContainEqual(
      expect.objectContaining({
        code: "circuit.unknown_pin",
        path: "/circuit/nets/in~1~0/1",
        validPins: ["a", "b"],
      }),
    );
    expect(jsonPointer([])).toBe("");
    expect(jsonPointer(["a~/b", 1])).toBe("/a~0~1b/1");
  });

  test("unknown or bare components are actionable and inherited IDs are not declarations", () => {
    for (const endpoint of ["missing.a", "toString.a", "constructor", "__proto__"]) {
      const doc = loadExample("rc-lowpass");
      doc.circuit.nets.input = ["VIN", endpoint];
      expectCode(doc, "circuit.unknown_component");
    }
    const doc = loadExample("rc-lowpass");
    doc.circuit.nets.input = ["VIN", "R1"];
    expect(expectCode(doc, "circuit.unknown_pin")).toContainEqual(
      expect.objectContaining({ validPins: ["a", "b"] }),
    );
  });

  test("author IDs include prototype names, slash, and tilde without loss", () => {
    const doc = rename(loadExample("rc-lowpass"));
    const result = validateDocument(JSON.parse(JSON.stringify(doc)));
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(Object.hasOwn(result.document.circuit.components, "__proto__")).toBe(true);
    expect(Object.hasOwn(result.document.circuit.nets, "__proto__")).toBe(true);
    expect(result.document.layout.roles.series).toBe("__proto__");
    expect(validateDocument(result.document).ok).toBe(true);
  });

  test("prototype-key values cannot bypass the single runtime schema", () => {
    const doc = rename(loadExample("rc-lowpass"));
    const parsed = figureSchema.safeParse(doc);
    expect(parsed.success).toBe(true);
    if (parsed.success)
      expect(Object.hasOwn(parsed.data.circuit.components, "__proto__")).toBe(true);
    doc.circuit.components = Object.fromEntries([
      ["__proto__", { type: "resistor", resistance: -1 }],
      ["constructor", { type: "capacitor", capacitance: 1e-7 }],
    ]);
    expect(figureSchema.safeParse(doc).success).toBe(false);
    const diagnostics = expectCode(doc, "document.invalid_field");
    expect(diagnostics).toContainEqual(
      expect.objectContaining({ path: "/circuit/components/__proto__/resistance" }),
    );
    const extraRole = loadExample("rc-lowpass");
    extraRole.layout.roles = Object.fromEntries([
      ...Object.entries(extraRole.layout.roles),
      ["__proto__", "R1"],
    ]);
    expectCode(extraRole, "layout.topology_mismatch");
  });

  test("reserved dot and empty IDs cannot ambiguously encode endpoints", () => {
    const doc = loadExample("rc-lowpass");
    expectCode(
      {
        ...doc,
        circuit: {
          ...doc.circuit,
          ports: { ...doc.circuit.ports, "ambiguous.pin": { kind: "terminal" } },
        },
      },
      "document.invalid_field",
    );
    expectCode(
      { ...doc, circuit: { ...doc.circuit, ports: { "": { kind: "ground" } } } },
      "document.invalid_field",
    );
  });

  test("duplicate endpoints fail both within one net and across nets", () => {
    const same = loadExample("rc-lowpass");
    same.circuit.nets.input?.push("R1.a");
    expectCode(same, "circuit.endpoint_conflict");
    const across = loadExample("rc-lowpass");
    across.circuit.nets.ground?.push("R1.a");
    expectCode(across, "circuit.endpoint_conflict");
  });

  test("every declared endpoint is required and nets need two members", () => {
    const doc = loadExample("rc-lowpass");
    doc.circuit.nets.output = ["R1.b", "VOUT"];
    expectCode(doc, "circuit.unconnected_endpoint");
    doc.circuit.nets.input = ["VIN"];
    expectCode(doc, "document.invalid_field");
  });

  test("all endpoints can be connected once yet the graph can be wrong", () => {
    const doc = loadExample("rc-lowpass");
    doc.circuit.nets.input = ["VIN", "C1.a"];
    doc.circuit.nets.output = ["R1.b", "R1.a", "VOUT"];
    expectCode(doc, "layout.topology_mismatch");
    const led = loadExample("led-series");
    led.circuit.nets.series = ["R1.b", "D1.cathode"];
    led.circuit.nets.ground = ["D1.anode", "V1.negative", "GND"];
    expectCode(led, "layout.topology_mismatch");
  });

  test("roles reject duplicates, extras, absent and incompatible entities", () => {
    for (const roles of [
      { series: "R1", shunt: "R1", input: "VIN", output: "VOUT", ground: "GND" },
      { series: "C1", shunt: "R1", input: "VIN", output: "VOUT", ground: "GND" },
      { series: "R1", shunt: "C1", input: "VIN", ground: "GND" },
      { series: "R1", shunt: "C1", input: "VIN", output: "VOUT", ground: "GND", constructor: "R1" },
      { series: "toString", shunt: "C1", input: "VIN", output: "VOUT", ground: "GND" },
    ]) {
      const doc = loadExample("rc-lowpass");
      doc.layout.roles = roles as Record<string, string>;
      expectCode(doc, "layout.topology_mismatch");
    }
  });

  test("extra topology and shared component/port IDs are rejected", () => {
    const doc = loadExample("rc-lowpass");
    doc.circuit.components.R9 = { type: "resistor", resistance: 1 };
    doc.circuit.nets.extra = ["R9.a", "R9.b"];
    expectCode(doc, "layout.topology_mismatch");
    const shared = loadExample("rc-lowpass");
    shared.circuit.ports.R1 = { kind: "terminal" };
    expectCode(shared, "circuit.endpoint_conflict");
  });
});
