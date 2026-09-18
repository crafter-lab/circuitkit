import { expect, test } from "bun:test";
import { privacyFixture } from "../src/v2/fixtures.ts";
import {
  inspectEducational,
  type PublicFigure,
  projectFigure,
  renderEducationalSVG,
  validateEducational,
} from "../src/v2/index.ts";

function document(): PublicFigure {
  const projected = projectFigure(privacyFixture(), "question");
  if (!projected.ok) throw new Error("fixture");
  return projected.document;
}

const badInputs: [string, () => unknown][] = [
  ["null", () => null],
  ["boolean", () => true],
  ["string JSON is not a document", () => JSON.stringify(document())],
  ["unknown top-level keys", () => ({ ...document(), hiddenAnswer: 19 })],
  ["stage flag", () => ({ ...document(), stage: "question" })],
  ["hidden author model", () => ({ ...document(), source: privacyFixture() })],
  ["wrong version", () => ({ ...document(), schema: "circuitkit.educational.public.v3" })],
  ["oversized text", () => ({ ...document(), title: "a".repeat(241) })],
  ["control characters", () => ({ ...document(), description: "bad\u0000" })],
  ["XML noncharacter", () => ({ ...document(), title: "bad\ufffe" })],
  ["XML lone surrogate", () => ({ ...document(), description: "bad\ud800" })],
  [
    "NaN",
    () => ({
      ...document(),
      display: [
        {
          id: "p",
          shapes: [
            {
              kind: "circle",
              at: { x: NaN, y: 0 },
              radius: 3,
              tone: "ink",
              fill: "ink",
              stroke: 2,
            },
          ],
        },
      ],
    }),
  ],
  [
    "Infinity",
    () => ({
      ...document(),
      display: [
        {
          id: "p",
          shapes: [
            {
              kind: "circle",
              at: { x: 0, y: Infinity },
              radius: 3,
              tone: "ink",
              fill: "ink",
              stroke: 2,
            },
          ],
        },
      ],
    }),
  ],
  [
    "huge coordinate",
    () => ({
      ...document(),
      display: [
        {
          id: "p",
          shapes: [
            {
              kind: "circle",
              at: { x: 10001, y: 0 },
              radius: 3,
              tone: "ink",
              fill: "ink",
              stroke: 2,
            },
          ],
        },
      ],
    }),
  ],
  [
    "raw SVG path",
    () => ({
      ...document(),
      display: [{ id: "p", shapes: [{ kind: "path", d: "M0 0", onclick: "alert(1)" }] }],
    }),
  ],
  [
    "CSS paint injection",
    () => ({
      ...document(),
      display: [
        {
          id: "p",
          shapes: [
            {
              kind: "circle",
              at: { x: 0, y: 0 },
              radius: 3,
              tone: "ink",
              fill: "url(https://bad)",
              stroke: 2,
            },
          ],
        },
      ],
    }),
  ],
  [
    "duplicate part IDs",
    () => {
      const d = document();
      if (d.display[0]) d.display.push(d.display[0]);
      return d;
    },
  ],
  [
    "duplicate target IDs",
    () => {
      const d = document();
      if (d.targets[0]) d.targets.push(d.targets[0]);
      return d;
    },
  ],
  [
    "missing target part",
    () => ({ ...document(), targets: [{ id: "missing", label: "Missing", role: "reading" }] }),
  ],
  [
    "raw MathText HTML",
    () => ({
      ...document(),
      display: [{ id: "p", shapes: [{ kind: "math", html: "<img src=x onerror=alert(1)>" }] }],
    }),
  ],
  [
    "glyph missing from pinned font",
    () => ({
      ...document(),
      display: [
        {
          id: "p",
          shapes: [
            {
              kind: "math",
              at: { x: 0, y: 0 },
              runs: [{ text: "🧪", script: "base" }],
              size: 14,
              align: "left",
              family: "sans",
              tone: "ink",
            },
          ],
        },
      ],
    }),
  ],
  ["prototype pollution key", () => JSON.parse('{"__proto__":{"polluted":true}}')],
  ["custom prototype", () => Object.create({ title: "hello" })],
  ["date object", () => new Date()],
  ["undefined", () => undefined],
  ["function", () => () => 1],
  ["bigint", () => 1n],
  [
    "cycle",
    () => {
      const d: Record<string, unknown> = {};
      d.self = d;
      return d;
    },
  ],
  [
    "depth",
    () => {
      let d: unknown = {};
      for (let i = 0; i < 30; i++) d = { next: d };
      return d;
    },
  ],
  ["sparse array", () => ({ ...document(), display: new Array(10) })],
  [
    "array properties",
    () => {
      const d = document();
      Object.assign(d.display, { private: "secret" });
      return d;
    },
  ],
  ["symbol key", () => ({ ...document(), [Symbol("secret")]: 42 })],
  ["large array", () => ({ ...document(), display: new Array(5000).fill(null) })],
  [
    "unknown shape key",
    () => {
      const d = document();
      Object.assign(d.display[0]?.shapes[0] ?? {}, { className: "secret" });
      return d;
    },
  ],
];

for (const [name, input] of badInputs) {
  test(`hostile JSON: ${name} fails closed in all public APIs`, () => {
    const value = input();
    for (const api of [renderEducationalSVG, inspectEducational, validateEducational]) {
      const result = api(value);
      expect(result).toEqual({
        ok: false,
        diagnostics: [
          { code: "educational.invalid", message: "Invalid or unsupported educational figure." },
        ],
      });
      expect(result).not.toHaveProperty("document");
      expect(result).not.toHaveProperty("svg");
    }
    expect({}).not.toHaveProperty("polluted");
  });
}

test("accessor inputs are rejected without evaluating the getter", () => {
  let calls = 0;
  const d = document();
  Object.defineProperty(d, "title", {
    enumerable: true,
    get: () => {
      calls++;
      throw new Error("PRIVATE_VALUE");
    },
  });
  expect(renderEducationalSVG(d).ok).toBe(false);
  expect(inspectEducational(d).ok).toBe(false);
  expect(validateEducational(d).ok).toBe(false);
  expect(calls).toBe(0);
});

test("namespace and options are bounded and cannot inject attributes", () => {
  for (const namespace of ['x" onload="alert(1)', "a".repeat(65), "", "a:b", "a b", "#id"])
    expect(renderEducationalSVG(document(), { namespace }).ok).toBe(false);
  expect(
    renderEducationalSVG(document(), { namespace: "a", private: "SECRET" } as { namespace: string })
      .ok,
  ).toBe(false);
});

test("authored text is escaped in metadata and rendered only as trusted glyph paths", () => {
  const author = privacyFixture();
  author.stages.question.title = '<script>& "escaped"';
  author.stages.question.description = '<img src=x onerror="alert(1)">';
  const projected = projectFigure(author, "question");
  expect(projected.ok).toBe(true);
  if (!projected.ok) return;
  const rendered = renderEducationalSVG(projected.document);
  expect(rendered.ok).toBe(true);
  if (!rendered.ok) return;
  expect(rendered.svg).toContain("&lt;script&gt;&amp; &quot;escaped&quot;");
  expect(rendered.svg).not.toContain("<script>");
  expect(rendered.svg).not.toContain("<img");
});

test("finite bounded mutation corpus never throws or returns partial success", () => {
  let seed = 173;
  const next = () => {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    return seed;
  };
  const values: unknown[] = [null, false, "<script>", 1e13, -1, [], {}, undefined];
  for (let i = 0; i < 160; i++) {
    const d = document();
    const target = i % 2 ? d : d.display[next() % d.display.length];
    if (target)
      Reflect.set(
        target,
        ["schema", "id", "shapes", "__secret", "targets"][next() % 5] ?? "bad",
        values[next() % values.length],
      );
    const result = renderEducationalSVG(d);
    if (!result.ok) expect(Object.keys(result).sort()).toEqual(["diagnostics", "ok"]);
    else expect(validateEducational(result.document).ok).toBe(true);
  }
});
