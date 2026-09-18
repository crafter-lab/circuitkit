import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { dividerAuthor, dividerCircuit } from "../examples/education/divider.ts";
import { ledAuthor, ledCircuit } from "../examples/education/led.ts";
import { loadedDividerAuthor, loadedDividerCircuit } from "../examples/education/loaded-divider.ts";
import { loadExample, renderSVG, validate } from "../src/index.ts";
import { componentPins, recipeIds, recipeSchema, themePresetSchema } from "../src/schema.ts";
import {
  type AuthorFigure,
  type ElectricalPanel,
  inspectEducational,
  inspectElectricalNets,
  known,
  type MeasurementPanel,
  type PublicFigure,
  projectFigure,
  renderEducationalSVG,
  resolveReading,
  type Stage,
  type Theme,
  targetDOMId,
  validateAuthorFigure,
  validateEducational,
} from "../src/v2/index.ts";
import hashes from "./fixtures/unannotated-svg-hashes.json";

const stages: Stage[] = ["teaching", "question", "correction"];
const themes: Theme[] = ["geist-light", "geist-dark", "geist-print"];
const examples = [ledAuthor, dividerAuthor, loadedDividerAuthor];

function project(author: unknown, stage: Stage): PublicFigure {
  const result = projectFigure(author, stage);
  expect(result.ok, JSON.stringify(result.diagnostics)).toBe(true);
  if (!result.ok) throw new Error("Expected a public projection");
  return result.document;
}

function circuit(author: AuthorFigure, stage: Stage): ElectricalPanel {
  const panel = author.stages[stage].panels.find((panel) => panel.kind === "electrical");
  if (panel?.kind !== "electrical") throw new Error("Expected electrical panel");
  return panel;
}

function meter(author: AuthorFigure, stage: Stage): MeasurementPanel {
  const panel = author.stages[stage].panels.find((panel) => panel.kind === "measurement");
  if (panel?.kind !== "measurement") throw new Error("Expected measurement panel");
  return panel;
}

function reading(document: PublicFigure): string {
  return (
    document.display
      .find((part) => part.id === "meter/reading")
      ?.shapes.flatMap((shape) => (shape.kind === "math" ? shape.runs.map((run) => run.text) : []))
      .join("") ?? ""
  );
}

function netMembers(panel: ElectricalPanel) {
  const result = inspectElectricalNets(panel);
  expect(result.ok).toBe(true);
  if (!result.ok) throw new Error("Expected named nets");
  return result.nets;
}

for (const author of examples) {
  describe(author.id, () => {
    for (const theme of themes) {
      for (const stage of stages) {
        test(`${stage}/${theme}: core compilation, identity and public roundtrip`, () => {
          const themed = structuredClone(author);
          for (const model of Object.values(themed.stages)) model.theme = theme;
          const original = structuredClone(themed);
          expect(validateAuthorFigure(themed).ok).toBe(true);
          const document = project(themed, stage);
          const baseline = project(author, "question");
          expect(document.theme).toBe(theme);
          expect(Object.keys(document).sort()).toEqual([
            "description",
            "display",
            "id",
            "schema",
            "targets",
            "theme",
            "title",
          ]);
          const ids = document.display.map((part) => part.id);
          expect(new Set(ids).size).toBe(ids.length);
          expect(ids).toEqual(baseline.display.map((part) => part.id));
          expect(document.targets).toEqual(baseline.targets);
          expect(ids).toContain("circuit/component/R1");
          expect(ids).toContain("meter/probe/positive");
          expect(ids).toContain("meter/probe/negative");
          expect(ids).toContain("meter/reading");
          expect(validateEducational(JSON.parse(JSON.stringify(document)))).toEqual({
            ok: true,
            document,
            diagnostics: [],
          });
          const inspected = inspectEducational(document);
          const rendered = renderEducationalSVG(document, { namespace: "example" });
          expect(inspected.ok).toBe(true);
          expect(rendered.ok).toBe(true);
          if (!inspected.ok || !rendered.ok) throw new Error("Expected public rendering");
          expect(rendered.bounds.width).toBeGreaterThan(0);
          expect(rendered.bounds.height).toBeGreaterThan(0);
          expect(rendered.targets).toEqual(inspected.targets);
          expect(renderEducationalSVG(document, { namespace: "example" })).toEqual(rendered);
          for (const target of rendered.targets) {
            expect(rendered.svg).toContain(targetDOMId("example", target.id));
            expect(target.bounds.width).toBeGreaterThan(0);
            expect(target.bounds.height).toBeGreaterThan(0);
            if (target.role === "net") {
              expect(target.kind).toBe("group");
              expect(target.members.length).toBeGreaterThan(0);
              for (const member of target.members) expect(ids).toContain(member);
              expect(target.members.some((id) => id.startsWith("meter/"))).toBe(false);
              expect(target).not.toHaveProperty("terminals");
            }
          }
          expect(themed).toEqual(original);
        });
      }
    }

    test("question is independent of private stages, exports and diagnostics", () => {
      const expected = project(author, "question");
      const altered = {
        ...author,
        stages: {
          question: author.stages.question,
          teaching: { privateAnswer: "PRIVATE_TEACHING_SENTINEL", unsupported: "🧪" },
          correction: { privateAnswer: "PRIVATE_CORRECTION_SENTINEL", panels: null },
        },
      };
      expect(validateAuthorFigure(altered).ok).toBe(false);
      const actual = project(altered, "question");
      expect(actual).toEqual(expected);
      expect(inspectEducational(actual)).toEqual(inspectEducational(expected));
      expect(renderEducationalSVG(actual)).toEqual(renderEducationalSVG(expected));
      expect(JSON.stringify(actual)).not.toContain("PRIVATE_");
      expect(reading(actual)).toBe("? V");
      expect(renderEducationalSVG(author).ok).toBe(false);
      expect(validateEducational({ ...expected, author }).ok).toBe(false);
      expect(renderEducationalSVG({ ...expected, stages: author.stages }).ok).toBe(false);
      const hiddenNets = structuredClone(author);
      hiddenNets.stages.question.expose = hiddenNets.stages.question.expose.filter(
        (target) => target.role !== "net",
      );
      const withoutNets = project(hiddenNets, "question");
      expect(withoutNets.display).toEqual(expected.display);
      expect(withoutNets.targets.some((target) => target.role === "net")).toBe(false);
      expect(JSON.stringify(withoutNets)).not.toContain("/net/");
      expect(JSON.stringify(withoutNets)).not.toContain('"members"');
    });

    test("documented CLI projection and public-only validation/rendering", () => {
      const cli = new URL("../src/education-cli.ts", import.meta.url).pathname;
      const run = (args: string[], input: unknown) => {
        const child = Bun.spawnSync([process.execPath, cli, ...args], {
          stdin: Buffer.from(JSON.stringify(input)),
          stdout: "pipe",
          stderr: "pipe",
        });
        expect(child.exitCode, child.stderr.toString()).toBe(0);
        return JSON.parse(child.stdout.toString());
      };
      const projected = run(["project", "-", "--stage", "question"], author);
      expect(projected.document).toEqual(project(author, "question"));
      expect(projected).not.toHaveProperty("stages");
      expect(run(["validate", "-"], projected.document).document).toEqual(projected.document);
      const rendered = renderEducationalSVG(projected.document);
      if (!rendered.ok) throw new Error("Expected core SVG");
      expect(run(["render", "-"], projected.document).svg).toBe(rendered.svg);
    });
  });
}

const migrations: {
  recipe: "led-series" | "voltage-divider";
  panel: ElectricalPanel;
  endpoints: Record<string, string>;
}[] = [
  {
    recipe: "led-series" as const,
    panel: ledCircuit(),
    endpoints: {
      "V1.positive": "V1_positive",
      "V1.negative": "V1_negative",
      "R1.a": "R1_a",
      "R1.b": "R1_b",
      "D1.anode": "D1_anode",
      "D1.cathode": "D1_cathode",
      GND: "GND",
    },
  },
  {
    recipe: "voltage-divider" as const,
    panel: dividerCircuit(),
    endpoints: {
      VIN: "VIN",
      VOUT: "VOUT",
      GND: "GND",
      "R1.a": "R1_a",
      "R1.b": "R1_b",
      "R2.a": "R2_a",
      "R2.b": "R2_b",
    },
  },
];

for (const migration of migrations) {
  test(`${migration.recipe}: explicit rewrite preserves every endpoint, conductor and component`, () => {
    const legacy = loadExample(migration.recipe);
    const endpoints: Record<string, string> = migration.endpoints;
    const nets = netMembers(migration.panel);
    expect(Object.keys(endpoints).sort()).toEqual(
      [...new Set(Object.values(legacy.circuit.nets).flat())].sort(),
    );
    expect(migration.panel.terminals.map((terminal) => terminal.id).sort()).toEqual(
      Object.values(endpoints).sort(),
    );
    expect(nets.map((net) => net.id).sort()).toEqual(
      Object.keys(legacy.circuit.nets)
        .map((id) => `circuit/net/${id}`)
        .sort(),
    );
    for (const [id, members] of Object.entries(legacy.circuit.nets)) {
      expect(nets.find((net) => net.id === `circuit/net/${id}`)?.terminals).toEqual(
        members
          .map((member) => {
            const endpoint = endpoints[member];
            if (!endpoint) throw new Error("Missing explicit endpoint mapping");
            return endpoint;
          })
          .sort(),
      );
    }
    expect(migration.panel.components.map((component) => component.id).sort()).toEqual(
      Object.keys(legacy.circuit.components).sort(),
    );
    for (const [id, component] of Object.entries(legacy.circuit.components)) {
      if (
        component.type !== "dc-source" &&
        component.type !== "resistor" &&
        component.type !== "led"
      ) {
        throw new Error("Unexpected component in the two explicit migration fixtures");
      }
      const replacement = migration.panel.components.find((candidate) => candidate.id === id);
      if (!replacement) throw new Error("Missing explicit component mapping");
      expect(replacement.kind).toBe(component.type === "dc-source" ? "source" : component.type);
      expect([...replacement.terminals]).toEqual(
        componentPins[component.type].map((pin) => {
          const terminal = endpoints[`${id}.${pin}`];
          if (!terminal) throw new Error("Missing ordered pin mapping");
          return terminal;
        }),
      );
      if (component.type === "resistor")
        expect(replacement).toHaveProperty("value", known(component.resistance, "Ω"));
      if (component.type === "dc-source")
        expect(replacement).toHaveProperty("value", known(component.voltage, "V"));
    }
  });
}

test("readings are explicit pedagogy, not an inferred circuit simulation", () => {
  expect(reading(project(ledAuthor, "teaching"))).toBe("VR V");
  expect(reading(project(dividerAuthor, "teaching"))).toBe("Vout V");
  expect(reading(project(ledAuthor, "correction"))).toBe("3 V");
  expect(reading(project(dividerAuthor, "correction"))).toBe("3 V");
  expect(reading(project(loadedDividerAuthor, "correction"))).toBe("4.5 V");
  const symbol = project(dividerAuthor, "teaching").display.find(
    (part) => part.id === "meter/reading",
  );
  expect(
    symbol?.shapes.some(
      (shape) =>
        shape.kind === "math" &&
        shape.runs.some((run) => run.script === "sub" && run.text === "out"),
    ),
  ).toBe(true);
  expect(() =>
    resolveReading({
      mode: "derived",
      operation: "divider",
      inputs: [known(6, "V"), known(10000, "Ω"), known(10000, "Ω")],
      assumptions: ["ohmic"],
    }),
  ).toThrow();
  const reversed = structuredClone(ledAuthor);
  const probes = meter(reversed, "correction");
  [probes.positive, probes.negative] = [probes.negative, probes.positive];
  expect(reading(project(reversed, "correction"))).toBe("-3 V");
  expect(netMembers(circuit(reversed, "correction"))).toEqual(
    netMembers(circuit(ledAuthor, "correction")),
  );
  const invalid = structuredClone(ledAuthor);
  const resistor = circuit(invalid, "question").components.find(
    (component) => component.id === "R1",
  );
  if (resistor?.kind !== "resistor") throw new Error("Expected resistor");
  resistor.value = known(330, "V");
  expect(validateAuthorFigure(invalid)).toHaveProperty(
    "diagnostics.0.code",
    "graph.component-unit",
  );
  expect(projectFigure(invalid, "question")).toEqual({
    ok: false,
    diagnostics: [
      { code: "educational.invalid", message: "Invalid or unsupported educational figure." },
    ],
  });
});

test("extension changes values and connectivity but retains existing identities without a plugin", () => {
  const base = dividerCircuit();
  const extended = loadedDividerCircuit();
  expect(extended.components).toHaveLength(base.components.length + 1);
  expect(extended.routes).toHaveLength(base.routes.length + 2);
  expect(extended.components.find((component) => component.id === "R1")).toHaveProperty(
    "value",
    known(1000, "Ω"),
  );
  expect(extended.components.find((component) => component.id === "R2")).toHaveProperty(
    "value",
    known(2000, "Ω"),
  );
  const output = netMembers(extended).find((net) => net.id === "circuit/net/output");
  const ground = netMembers(extended).find((net) => net.id === "circuit/net/ground");
  expect(output?.terminals).toEqual(["R1_b", "R2_a", "R3_a", "VOUT"]);
  expect(ground?.terminals).toEqual(["GND", "R2_b", "R3_b"]);
  expect(output?.members).toContain("circuit/route/load");
  expect(output?.members).not.toContain("circuit/component/R3");
  const basePublic = project(dividerAuthor, "question");
  const extendedPublic = project(loadedDividerAuthor, "question");
  for (const part of basePublic.display)
    expect(extendedPublic.display.map((part) => part.id)).toContain(part.id);
  expect(extendedPublic.targets.map((target) => target.id)).toEqual(
    basePublic.targets.map((target) => target.id),
  );
});

test("intentional opens need intent, and their exposed anchor follows the separated fragment", () => {
  const author = structuredClone(dividerAuthor);
  const route = circuit(author, "question").routes.find((route) => route.id === "output");
  if (!route) throw new Error("Expected output route");
  route.state = "open";
  expect(validateAuthorFigure(author)).toHaveProperty("diagnostics.0.code", "graph.fault-intent");
  route.intent = "intentional-fault";
  expect(validateAuthorFigure(author).ok).toBe(true);
  const target = project(author, "question").targets.find((target) => target.role === "net");
  expect(target).toHaveProperty("members", ["circuit/terminal/VOUT"]);
});

test("legacy aliases remain valid data; v2 requires an explicit host identity mapping", () => {
  const legacy = loadExample("voltage-divider");
  const alias = "upper R:1";
  const resistor = legacy.circuit.components.R1;
  if (!resistor) throw new Error("Expected legacy resistor");
  legacy.circuit.components[alias] = resistor;
  delete legacy.circuit.components.R1;
  legacy.layout.roles.top = alias;
  for (const [id, members] of Object.entries(legacy.circuit.nets)) {
    legacy.circuit.nets[id] = members.map((member) =>
      member.startsWith("R1.") ? `${alias}${member.slice(2)}` : member,
    );
  }
  expect(validate(legacy).ok).toBe(true);
  expect(renderSVG(legacy).ok).toBe(true);
  const hostAliases = { [alias]: "circuit/component/R1" };
  expect(project(dividerAuthor, "question").display.map((part) => part.id)).toContain(
    hostAliases[alias],
  );
  expect(JSON.stringify(project(dividerAuthor, "question"))).not.toContain(alias);
  for (const invalidId of [alias, "R1.a"]) {
    const author = structuredClone(dividerAuthor);
    const component = circuit(author, "question").components[0];
    if (!component) throw new Error("Expected component");
    component.id = invalidId;
    expect(validateAuthorFigure(author).ok).toBe(false);
    expect(projectFigure(author, "question").ok).toBe(false);
  }
});

test("the documented complete public Data shape validates and renders", () => {
  const source = readFileSync(new URL("../docs/education-authoring.md", import.meta.url), "utf8");
  const documents = [...source.matchAll(/```json\n([\s\S]*?)\n```/g)]
    .map((match) => JSON.parse(match[1] ?? "null"))
    .filter((document) => document?.schema === "circuitkit.educational.public.v2");
  expect(documents).toHaveLength(1);
  expect(validateEducational(documents[0]).ok).toBe(true);
  expect(renderEducationalSVG(documents[0]).ok).toBe(true);
});

describe("all original v1 SVG bytes remain unchanged", () => {
  test("the immutable baseline covers all nine recipes and all three themes", () => {
    expect(hashes).toHaveLength(27);
    expect(new Set(hashes.map(({ recipe, preset }) => `${recipe}/${preset}`)).size).toBe(27);
    expect([...new Set(hashes.map(({ recipe }) => recipe))].sort()).toEqual([...recipeIds].sort());
  });
  for (const fixture of hashes) {
    test(`${fixture.recipe}/${fixture.preset}`, () => {
      const document = loadExample(recipeSchema.parse(fixture.recipe));
      document.presentation.theme.preset = themePresetSchema.parse(fixture.preset);
      const result = renderSVG(document);
      expect(result.ok).toBe(true);
      if (!result.ok) throw new Error("Expected unchanged legacy renderer");
      expect(new Bun.CryptoHasher("sha256").update(result.svg).digest("hex")).toBe(fixture.sha256);
      expect(projectFigure(document, "question").ok).toBe(false);
      expect(renderEducationalSVG(document).ok).toBe(false);
    });
  }
});
