import { describe, expect, test } from "bun:test";
import { loadExample } from "../src/catalog.ts";
import { renderFigureSVG } from "../src/figure-svg.ts";
import { recipeIds, themePresets } from "../src/schema.ts";
import { decodeShareDocument, encodeShareDocument, type ShareView } from "../src/share.ts";
import type { Failure } from "../src/types.ts";

const views: ShareView[] = ["schematic", "annotated", "figure"];

function hashFor(json: string) {
  return `#v=1&doc=${Buffer.from(json, "utf8").toString("base64url")}`;
}

function failed(result: { ok: true } | Failure, code?: string) {
  expect(result.ok).toBe(false);
  expect(result).not.toHaveProperty("document");
  expect(result).not.toHaveProperty("hash");
  if (result.ok) throw new Error("Expected failure");
  expect(result.diagnostics.length).toBeGreaterThan(0);
  if (code) expect(result.diagnostics.some((diagnostic) => diagnostic.code === code)).toBe(true);
  return result;
}

describe("share document codec", () => {
  for (const recipe of recipeIds) {
    test(`${recipe} round trips normalized full documents across themes`, () => {
      for (const preset of themePresets) {
        const document = loadExample(recipe);
        document.presentation.theme.preset = preset;
        const before = structuredClone(document);
        const rendered = renderFigureSVG(document);
        const encoded = encodeShareDocument(document);
        expect(encoded.ok).toBe(true);
        if (!encoded.ok || !rendered.ok) throw new Error("Expected a valid example");
        expect(encoded.hash).toMatch(/^#v=1&doc=[A-Za-z0-9_-]+$/);
        expect(encoded.hash).toBe(hashFor(JSON.stringify(rendered.document)));
        expect(encodeShareDocument(document, {})).toEqual(encoded);
        expect(encodeShareDocument(document, { view: undefined })).toEqual(encoded);
        expect(decodeShareDocument(encoded.hash)).not.toHaveProperty("view");
        expect(encoded.hash.length).toBeLessThanOrEqual(16 * 1024);
        expect(encoded.document).toEqual(rendered.document);
        expect(decodeShareDocument(encoded.hash)).toEqual({ ok: true, document: encoded.document });
        expect(encodeShareDocument(encoded.document)).toEqual(encoded);
        expect(document).toEqual(before);
      }
    });
  }

  test.each(views)("explicit %s is fragment metadata, never document JSON", (view) => {
    const document = loadExample("rc-lowpass");
    const before = JSON.stringify(document);
    const options = Object.freeze({ view });
    const legacy = encodeShareDocument(document);
    const encoded = encodeShareDocument(document, options);
    if (!legacy.ok || !encoded.ok) throw new Error("Expected valid share links");
    expect(encoded.hash).toBe(`${legacy.hash}&view=${view}`);
    expect(encoded.document).toEqual(legacy.document);
    expect(encoded.document).not.toHaveProperty("view");
    expect(encoded.document.presentation).not.toHaveProperty("view");
    const decoded = decodeShareDocument(encoded.hash);
    expect(decoded).toEqual({ ok: true, document: legacy.document, view });
    if (!decoded.ok) throw new Error("Expected decoded share");
    expect(encodeShareDocument(decoded.document, { view: decoded.view })).toEqual(encoded);
    const payload = legacy.hash.slice(9);
    expect(JSON.parse(Buffer.from(payload, "base64url").toString("utf8"))).toEqual(
      encoded.document,
    );
    for (const hash of [
      `#view=${view}&doc=${payload}&v=1`,
      `#v=1&view=${view}&doc=${payload}`,
      `#doc=${payload}&v=1&view=${view}`,
    ])
      expect(decodeShareDocument(hash)).toEqual(decoded);
    expect(JSON.stringify(document)).toBe(before);
    expect(options).toEqual({ view });
  });

  test("options reject runtime types, unknown keys, invalid views, and hooks", () => {
    const document = loadExample("rc-lowpass");
    const before = JSON.stringify(document);
    let calls = 0;
    const accessor = Object.defineProperty({}, "view", {
      enumerable: true,
      get() {
        calls++;
        throw new Error("Do not execute");
      },
    });
    const hooked = {
      toJSON() {
        calls++;
        return { view: "figure" };
      },
    };
    for (const options of [
      null,
      true,
      1,
      "figure",
      [],
      new Date(),
      () => ({ view: "figure" }),
      { view: null },
      { view: false },
      { view: 1 },
      { view: {} },
      { view: ["figure"] },
      { view: "" },
      { view: "Figure" },
      { view: "schematic " },
      { view: "unknown" },
      { view: "figure&v=2" },
      { view: "figure", extra: true },
      { [Symbol("view")]: "figure" },
      JSON.parse('{"__proto__":{"view":"figure"}}'),
      Object.create({ view: "figure" }),
      Object.defineProperty({}, "view", { value: "figure" }),
      accessor,
      hooked,
      new Proxy(
        {},
        {
          ownKeys: () => {
            throw new Error("Hostile proxy");
          },
        },
      ),
    ])
      failed(
        Reflect.apply(encodeShareDocument, undefined, [document, options]),
        "share.invalid_options",
      );
    expect(calls).toBe(0);
    expect(JSON.stringify(document)).toBe(before);
    expect(
      encodeShareDocument(document, Object.assign(Object.create(null), { view: "figure" })).ok,
    ).toBe(true);
  });

  test("view parameters reject duplicates, unknown names, missing fields, and hostile values", () => {
    const legacy = hashFor(JSON.stringify(loadExample("rc-lowpass")));
    for (const suffix of [
      "&view=figure&view=figure",
      "&view=figure&view=annotated",
      "&view=figure&v=1",
      "&view=figure&other=1",
      "&view=figure&__proto__=x",
      "&view=figure&constructor=x",
      "&view=figure&",
      "&%76iew=figure",
      "&View=figure",
      "&view=",
      "&view=figure=annotated",
    ])
      failed(decodeShareDocument(legacy + suffix), "share.invalid_parameters");
    for (const value of [
      "unknown",
      "Figure",
      "SCHEMATIC",
      "true",
      "null",
      "undefined",
      "0",
      "__proto__",
      "constructor",
      " figure",
      "figure ",
      "%66igure",
      "figure%26v%3D2",
      "figure#extra",
      "🧠",
    ])
      failed(decodeShareDocument(`${legacy}&view=${value}`), "share.invalid_view");
    for (const hash of ["#view=figure", "#v=1&view=figure", `#doc=${legacy.slice(9)}&view=figure`])
      failed(decodeShareDocument(hash), "share.invalid_parameters");
    failed(
      decodeShareDocument(`${legacy.replace("v=1", "v=2")}&view=figure`),
      "share.unsupported_version",
    );
  });

  test("UTF-8, annotations, caption, highlights, and own prototype-like IDs survive", () => {
    const document = loadExample("rc-lowpass");
    const renamed = JSON.parse(
      JSON.stringify(document).replaceAll("R1", "__proto__").replaceAll("C1", "constructor"),
    );
    renamed.circuit.nets = Object.fromEntries(
      Object.entries(renamed.circuit.nets).map(([key, endpoints]) => [
        key === "ground" ? "__proto__" : key,
        endpoints,
      ]),
    );
    renamed.presentation.title = "Señal Ω µ π";
    renamed.presentation.highlight = { components: ["__proto__"], nets: ["__proto__"] };
    renamed.presentation.annotations = {
      nets: [{ net: "__proto__", label: "A", description: "Retorno áéíóú ñ", tone: "blue" }],
      legend: true,
      caption: "Señal <b>sin HTML</b> & retorno",
    };
    const encoded = encodeShareDocument(renamed);
    expect(encoded.ok).toBe(true);
    if (!encoded.ok) throw new Error(JSON.stringify(encoded.diagnostics));
    const decoded = decodeShareDocument(encoded.hash);
    expect(decoded).toEqual({ ok: true, document: encoded.document });
    if (!decoded.ok) return;
    expect(Object.hasOwn(decoded.document.circuit.components, "__proto__")).toBe(true);
    expect(Object.hasOwn(decoded.document.circuit.nets, "__proto__")).toBe(true);
    expect(decoded.document.presentation).toEqual(encoded.document.presentation);
    expect(Object.getPrototypeOf({})).toBe(Object.prototype);
    expect(Object.hasOwn(Object.prototype, "polluted")).toBe(false);
    expect(JSON.parse(Buffer.from(encoded.hash.slice(9), "base64url").toString("utf8"))).toEqual(
      decoded.document,
    );
  });

  test("parameter order is immaterial but names, values, count, and encoding are strict", () => {
    const payload = hashFor(JSON.stringify(loadExample("rc-lowpass"))).slice(9);
    expect(decodeShareDocument(`#doc=${payload}&v=1`).ok).toBe(true);
    for (const hash of [
      "",
      "v=1&doc=abc",
      "https://example.org/#v=1&doc=abc",
      "#v=1",
      `#doc=${payload}`,
      `#v=1&doc=${payload}&v=1`,
      `#v=1&doc=${payload}&doc=${payload}`,
      `#v=1&doc=${payload}&other=1`,
      `#v=1&doc=${payload}&__proto__=x`,
      `#v=1&doc=${payload}&`,
      `#&v=1&doc=${payload}`,
      `#v=1&%64oc=${payload}`,
      `#v=%31&doc=${payload}`,
      `#v=01&doc=${payload}`,
      `#v=2&doc=${payload}`,
      `#v=1&doc=${payload}#extra`,
      "#v=1&doc=",
      "#v=1&doc=ab=c",
      "#v=1&doc=abc=",
      "#v=1&doc=ab+c",
      "#v=1&doc=ab/c",
      "#v=1&doc=ab c",
      "#v=1&doc=%7B%7D",
      "#v=1&doc=é",
      "#v=1&doc=a",
      "#v=1&doc=Zh",
      "#v=1&doc=Zm9",
    ]) {
      failed(decodeShareDocument(hash));
    }
    failed(Reflect.apply(decodeShareDocument, undefined, [null]), "share.invalid_fragment");
  });

  test("malformed UTF-8, BOM, JSON, executable text, and unknown schema fields fail", () => {
    for (const bytes of [[0xff], [0xc0, 0xaf], [0xed, 0xa0, 0x80], [0xe2, 0x82]])
      failed(
        decodeShareDocument(`#v=1&doc=${Buffer.from(bytes).toString("base64url")}`),
        "share.invalid_encoding",
      );
    for (const json of ["", "{", "{} trailing", "\uFEFF{}", "(()=>globalThis.polluted=true)()"])
      failed(decodeShareDocument(hashFor(json)));
    for (const value of [null, [], {}, 1, "https://example.org/figure.json"])
      failed(decodeShareDocument(hashFor(JSON.stringify(value))), "document.invalid_field");
    const unknown = { ...loadExample("rc-lowpass"), remote: "https://example.org/figure.json" };
    failed(encodeShareDocument(unknown), "document.invalid_field");
    failed(decodeShareDocument(hashFor(JSON.stringify(unknown))), "document.invalid_field");
  });

  test("the fragment cap includes the prefix and accepts exactly 16 KiB", () => {
    const json = JSON.stringify(loadExample("rc-lowpass"));
    const padded = json.padEnd(Math.floor(((16 * 1024 - 9) * 3) / 4), " ");
    expect(hashFor(padded).length).toBe(16 * 1024);
    expect(decodeShareDocument(hashFor(padded)).ok).toBe(true);
    failed(decodeShareDocument(hashFor(`${padded} `)), "share.too_large");
    failed(encodeShareDocument({ title: "a".repeat(16 * 1024 + 1) }), "share.too_large");
    failed(encodeShareDocument({ title: "é".repeat(10 * 1024) }), "share.too_large");
  });

  test("encode and decode count explicit view bytes within the exact 16 KiB cap", () => {
    for (const view of [undefined, ...views]) {
      const suffix = view === undefined ? "" : `&view=${view}`;
      const document = loadExample("rc-lowpass");
      document.presentation.steps = Array.from({ length: 6 }, (_, index) => ({
        id: `step-${index}`,
        title: `Step ${index}`,
        description: "",
        highlight: { components: [], nets: [] },
      }));
      const targetBytes = Math.floor(((16 * 1024 - 9 - suffix.length) * 3) / 4);
      let remaining = targetBytes - Buffer.byteLength(JSON.stringify(document), "utf8");
      for (const step of document.presentation.steps) {
        const length = Math.min(2000, remaining);
        step.description = "a".repeat(length);
        remaining -= length;
      }
      expect(remaining).toBe(0);
      const encoded = encodeShareDocument(document, { view });
      if (!encoded.ok) throw new Error(JSON.stringify(encoded.diagnostics));
      expect(Buffer.byteLength(encoded.hash, "utf8")).toBe(16 * 1024);
      expect(encoded.hash).toBe(hashFor(JSON.stringify(encoded.document)) + suffix);
      expect(decodeShareDocument(encoded.hash).ok).toBe(true);
      if (view === undefined) {
        for (const explicit of views) {
          failed(encodeShareDocument(document, { view: explicit }), "share.too_large");
          failed(decodeShareDocument(`${encoded.hash}&view=${explicit}`), "share.too_large");
        }
      }
      const lastStep = document.presentation.steps.at(-1);
      if (!lastStep) throw new Error("Expected padding step");
      lastStep.description += "a";
      failed(encodeShareDocument(document, { view }), "share.too_large");
      failed(decodeShareDocument(hashFor(JSON.stringify(document)) + suffix), "share.too_large");
    }
  });

  test("depth and cycle limits run before schema recursion without invoking JSON hooks", () => {
    failed(decodeShareDocument(hashFor(`${"[".repeat(65)}0${"]".repeat(65)}`)), "share.too_deep");
    let deep: unknown = 0;
    for (let index = 0; index < 10000; index++) deep = { child: deep };
    failed(encodeShareDocument(deep), "share.too_deep");
    const cycle: Record<string, unknown> = {};
    cycle.self = cycle;
    failed(encodeShareDocument(cycle), "share.invalid_input");
    let calls = 0;
    const accessor = Object.defineProperty({}, "version", {
      enumerable: true,
      get() {
        calls++;
        throw new Error("Do not execute");
      },
    });
    const hooked = {
      toJSON() {
        calls++;
        return loadExample("rc-lowpass");
      },
    };
    for (const input of [accessor, hooked, undefined, 1n, Number.NaN, new Date(), new Array(3)])
      failed(encodeShareDocument(input), "share.invalid_input");
    expect(calls).toBe(0);
    failed(
      encodeShareDocument(
        new Proxy(
          {},
          {
            ownKeys: () => {
              throw new Error("Hostile proxy");
            },
          },
        ),
      ),
      "share.invalid_input",
    );
  });

  test("brackets and escaped quotes inside JSON strings are not nesting", () => {
    const document = loadExample("rc-lowpass");
    document.presentation.annotations = {
      nets: [],
      legend: false,
      caption: '[ \\" ] { } '.repeat(20),
    };
    const encoded = encodeShareDocument(document);
    expect(encoded.ok).toBe(true);
    if (encoded.ok) expect(decodeShareDocument(encoded.hash).ok).toBe(true);
  });

  test("full renderer diagnostics are returned, not just schema validity", () => {
    for (const caption of ["Unsupported 🧠", "bad\u0001text", "W".repeat(400)]) {
      const document = loadExample("rc-lowpass");
      document.presentation.annotations = { nets: [], legend: false, caption };
      const rendered = failed(renderFigureSVG(document));
      expect(encodeShareDocument(document)).toEqual(rendered);
      expect(decodeShareDocument(hashFor(JSON.stringify(document)))).toEqual(rendered);
      for (const view of views) {
        expect(encodeShareDocument(document, { view })).toEqual(rendered);
        expect(decodeShareDocument(`${hashFor(JSON.stringify(document))}&view=${view}`)).toEqual(
          rendered,
        );
      }
    }
    const document = loadExample("rc-lowpass");
    document.presentation.theme.overrides = { label: "#ffffff" };
    failed(encodeShareDocument(document), "theme.insufficient_contrast");
    document.presentation.theme.overrides = undefined;
    document.circuit.nets.input = ["VIN", "R1.missing"];
    failed(decodeShareDocument(hashFor(JSON.stringify(document))), "circuit.unknown_pin");
  });
});
