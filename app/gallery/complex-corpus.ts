import { loadExample } from "../../src/catalog.ts";
import { complexRecipes } from "../../src/complex-recipes.ts";
import {
  complexRecipeIds,
  componentPins,
  type FigureDocument,
  themePresets,
} from "../../src/schema.ts";
import type { GalleryCase } from "./corpus.ts";
import type { StressCase } from "./stress.ts";

type ComplexRecipe = (typeof complexRecipeIds)[number];
type Variant = { slug: string; title: string; description: string; values: Record<string, number> };
type Mutation = {
  slug: string;
  title: string;
  description: string;
  paths: string[];
  code: string;
  apply: (document: FigureDocument) => void;
};

const families: Record<ComplexRecipe, { summary: string; tags: string[]; variants: Variant[] }> = {
  "loaded-divider": {
    summary:
      "Three resistors: a top series leg feeds the bottom resistor and a separate parallel load, sharing output and ground nodes.",
    tags: ["parallelbranch", "sharedground", "loading", "three-resistors"],
    variants: [
      {
        slug: "light-load",
        title: "Lightly loaded divider",
        description:
          "A 100 kΩ load parallels a 10 kΩ bottom leg; the explicit branch is retained, not treated as open circuit.",
        values: { top: 10000, bottom: 10000, load: 100000 },
      },
      {
        slug: "heavy-load",
        title: "Heavily loaded divider",
        description:
          "A 1 kΩ load pulls down the shared output of a 10 kΩ/10 kΩ divider; topology is unchanged.",
        values: { top: 10000, bottom: 10000, load: 1000 },
      },
      {
        slug: "low-impedance",
        title: "Low-impedance loaded node",
        description:
          "A 1 kΩ top, 2.2 kΩ bottom and 4.7 kΩ load show separate return branches at practical nominal values.",
        values: { top: 1000, bottom: 2200, load: 4700 },
      },
      {
        slug: "scaled-network",
        title: "Scaled three-leg network",
        description:
          "Scaling all three equal resistors to 100 kΩ preserves the ideal loaded ratio, not the source impedance.",
        values: { top: 100000, bottom: 100000, load: 100000 },
      },
    ],
  },
  "rc-ladder": {
    summary:
      "Two series resistors and two shunt capacitors form distinct interstage/output nodes with a shared return.",
    tags: ["2stage", "sharedground", "interstage", "unbuffered"],
    variants: [
      {
        slug: "sensor-ladder",
        title: "Slow sensor ladder",
        description:
          "Two 10 kΩ/1 µF stages share ground. This is the coupled ladder transfer, not a product of independent cutoffs.",
        values: { first: 10000, firstShunt: 1e-6, second: 10000, secondShunt: 1e-6 },
      },
      {
        slug: "audio-ladder",
        title: "Audio-range ladder",
        description:
          "4.7 kΩ and 10 kΩ series legs with 22 nF and 10 nF shunts expose the loaded interstage node.",
        values: { first: 4700, firstShunt: 22e-9, second: 10000, secondShunt: 10e-9 },
      },
      {
        slug: "staggered-caps",
        title: "Unequal shunt capacitors",
        description:
          "A 100 nF first shunt and 1 µF output shunt retain two distinct signal nodes and a common ground bus.",
        values: { first: 2200, firstShunt: 100e-9, second: 4700, secondShunt: 1e-6 },
      },
      {
        slug: "inverse-rc-scale",
        title: "Inverse R/C scaling",
        description:
          "1 kΩ and 1 µF replace both 10 kΩ and 100 nF pairs, preserving all coefficients of the ideal ladder transfer.",
        values: { first: 1000, firstShunt: 1e-6, second: 1000, secondShunt: 1e-6 },
      },
    ],
  },
  "wheatstone-bridge": {
    summary:
      "Four resistors form two parallel excitation legs. The left and right midpoint terminals are separate differential outputs, never bonded together.",
    tags: ["bridge", "differential", "parallelbranch", "sharedground"],
    variants: [
      {
        slug: "balanced",
        title: "Balanced four-arm bridge",
        description:
          "Four 1 kΩ arms give equal open-circuit midpoint potentials, without connecting those midpoints by a wire.",
        values: { upperLeft: 1000, lowerLeft: 1000, upperRight: 1000, lowerRight: 1000 },
      },
      {
        slug: "right-arm-high",
        title: "Right lower arm increased",
        description:
          "A 1.5 kΩ lower-right arm unbalances otherwise equal 1 kΩ legs. Outputs remain differential terminals.",
        values: { upperLeft: 1000, lowerLeft: 1000, upperRight: 1000, lowerRight: 1500 },
      },
      {
        slug: "left-arm-high",
        title: "Left lower arm increased",
        description:
          "Moving the 1.5 kΩ arm to the left reverses the imbalance sign while preserving the same four-node graph.",
        values: { upperLeft: 1000, lowerLeft: 1500, upperRight: 1000, lowerRight: 1000 },
      },
      {
        slug: "ratio-balanced",
        title: "Unequal but balanced legs",
        description:
          "1 kΩ/2.2 kΩ and 10 kΩ/22 kΩ legs have equal midpoint ratios despite different absolute impedances.",
        values: { upperLeft: 1000, lowerLeft: 2200, upperRight: 10000, lowerRight: 22000 },
      },
    ],
  },
  "bridge-rectifier": {
    summary:
      "Four oriented diodes connect two separate AC terminals to DC output/return rails. A resistor and filter capacitor are parallel output branches.",
    tags: ["bridge", "polarity", "parallelbranch", "sharedground", "drawing-only"],
    variants: [
      {
        slug: "small-filter",
        title: "Bridge with 100 µF filter",
        description:
          "A 1 kΩ load and 100 µF filter share the DC rails. No diode drop, ripple or output voltage is calculated.",
        values: { load: 1000, filter: 100e-6 },
      },
      {
        slug: "larger-filter",
        title: "Bridge with 2200 µF filter",
        description:
          "A larger explicit filter branch is drawn alongside a 2.2 kΩ load, without predicting ripple or inrush.",
        values: { load: 2200, filter: 2200e-6 },
      },
      {
        slug: "lower-load",
        title: "Bridge with 470 Ω load",
        description:
          "470 Ω and 470 µF illustrate a different load/filter pair, not a certified power supply design.",
        values: { load: 470, filter: 470e-6 },
      },
      {
        slug: "light-load",
        title: "Bridge with light load",
        description:
          "A 10 kΩ resistor and 220 µF capacitor retain both parallel branches and the distinct AC nodes.",
        values: { load: 10000, filter: 220e-6 },
      },
    ],
  },
  "transistor-switch": {
    summary:
      "A three-pin NPN switches the LED collector path. A separate base resistor/control node and supply-negative/emitter ground return remain explicit.",
    tags: ["multi-pin", "sharedground", "control", "collector", "drawing-only"],
    variants: [
      {
        slug: "logic-3p3",
        title: "3.3 V low-side drawing",
        description:
          "3.3 V supply, 2.2 kΩ base resistor and 330 Ω LED resistor. No base gain, saturation or LED current is inferred.",
        values: { supply: 3.3, baseResistor: 2200, series: 330 },
      },
      {
        slug: "logic-5",
        title: "5 V low-side drawing",
        description:
          "A 5 V collector supply with 4.7 kΩ base and 470 Ω series resistors retains a distinct external control terminal.",
        values: { supply: 5, baseResistor: 4700, series: 470 },
      },
      {
        slug: "battery-9",
        title: "9 V switched branch",
        description:
          "A 9 V supply with 10 kΩ base and 1 kΩ series resistors is a topology illustration, not a transistor operating-point model.",
        values: { supply: 9, baseResistor: 10000, series: 1000 },
      },
      {
        slug: "supply-12",
        title: "12 V switched branch",
        description:
          "12 V, 22 kΩ base and 2.2 kΩ LED resistors show separate base, collector and emitter nodes without device assumptions.",
        values: { supply: 12, baseResistor: 22000, series: 2200 },
      },
    ],
  },
  "inverting-amplifier": {
    summary:
      "A five-pin op-amp has input and feedback resistors at the inverting summing node, a grounded noninverting input, output feedback, and two separate supply rails.",
    tags: ["feedback", "multi-pin", "differential", "virtual-ground", "separate-rails"],
    variants: [
      {
        slug: "unity-inversion",
        title: "Unity inverting ratio",
        description:
          "Equal 10 kΩ input/feedback resistors imply ideal gain -1 only in linear negative feedback; virtual ground is not a wire.",
        values: { inputResistor: 10000, feedback: 10000 },
      },
      {
        slug: "gain-two",
        title: "Ideal gain minus two",
        description:
          "10 kΩ input and 20 kΩ feedback resistors imply ideal gain -2, without rail saturation or bandwidth simulation.",
        values: { inputResistor: 10000, feedback: 20000 },
      },
      {
        slug: "attenuation",
        title: "Inverting attenuation",
        description:
          "22 kΩ input and 10 kΩ feedback resistors draw an inverting attenuator with independent positive and negative supply terminals.",
        values: { inputResistor: 22000, feedback: 10000 },
      },
      {
        slug: "scaled-gain-ten",
        title: "Scaled feedback pair",
        description:
          "1 kΩ input and 10 kΩ feedback retain the reference ideal gain -10 while changing impedance, not the node graph.",
        values: { inputResistor: 1000, feedback: 10000 },
      },
    ],
  },
};

function pointer(...parts: (string | number)[]): string {
  return `/${parts.map((part) => String(part).replaceAll("~", "~0").replaceAll("/", "~1")).join("/")}`;
}

function idFor(document: FigureDocument, role: string): string {
  const id = document.layout.roles[role];
  if (!id) throw new Error(`Complex corpus missing ${document.layout.preset} role ${role}`);
  return id;
}

function assign(document: FigureDocument, role: string, value: number) {
  const component = document.circuit.components[idFor(document, role)];
  if (component?.type === "resistor") component.resistance = value;
  else if (component?.type === "capacitor") component.capacitance = value;
  else if (component?.type === "dc-source") component.voltage = value;
  else throw new Error(`No numeric SI value for ${role}`);
}

function swap(document: FigureDocument, a: string, b: string) {
  for (const [net, endpoints] of Object.entries(document.circuit.nets)) {
    document.circuit.nets[net] = endpoints.map((endpoint) =>
      endpoint === a ? b : endpoint === b ? a : endpoint,
    );
  }
}

function merge(document: FigureDocument, first: string, second: string) {
  const a = document.circuit.nets[first];
  const b = document.circuit.nets[second];
  if (!a || !b) throw new Error(`Cannot merge missing nets ${first}/${second}`);
  document.circuit.nets[first] = [...a, ...b];
  delete document.circuit.nets[second];
}

function reorder(document: FigureDocument) {
  document.circuit.components = Object.fromEntries(
    Object.entries(document.circuit.components).reverse(),
  );
  document.circuit.ports = Object.fromEntries(Object.entries(document.circuit.ports).reverse());
  document.layout.roles = Object.fromEntries(Object.entries(document.layout.roles).reverse());
  document.circuit.nets = Object.fromEntries(
    Object.entries(document.circuit.nets)
      .reverse()
      .map(([net, endpoints]) => [net, [...endpoints].reverse()]),
  );
}

function authorIds(document: FigureDocument) {
  const names = new Map(
    [...Object.keys(document.circuit.components), ...Object.keys(document.circuit.ports)].map(
      (id, index) => [id, `X${index + 1}`],
    ),
  );
  const endpoint = (value: string) => {
    const [id, pin] = value.split(".");
    const renamed = names.get(id ?? "");
    if (!renamed) throw new Error(`Unknown author endpoint ${value}`);
    return `${renamed}${pin ? `.${pin}` : ""}`;
  };
  document.circuit.components = Object.fromEntries(
    Object.entries(document.circuit.components).map(([id, value]) => [names.get(id), value]),
  );
  document.circuit.ports = Object.fromEntries(
    Object.entries(document.circuit.ports).map(([id, value]) => [names.get(id), value]),
  );
  document.layout.roles = Object.fromEntries(
    Object.entries(document.layout.roles).map(([role, id]) => [role, names.get(id) ?? id]),
  );
  document.circuit.nets = Object.fromEntries(
    Object.values(document.circuit.nets).map((endpoints, index) => [
      index === 0 ? "node/one~" : `node${index + 1}`,
      endpoints.map(endpoint),
    ]),
  );
  document.presentation.highlight = { components: [], nets: [] };
}

function mutations(recipe: ComplexRecipe): Mutation[] {
  const base = loadExample(recipe);
  const nets = Object.entries(base.circuit.nets);
  const result: Mutation[] = [];
  const topology = "layout.topology_mismatch";
  for (const [source, endpoints] of nets) {
    for (const [index, endpoint] of endpoints.entries()) {
      for (const [target, targetEndpoints] of nets) {
        if (source === target) continue;
        const exchanged = targetEndpoints[0];
        if (!exchanged) throw new Error(`Empty target net ${target}`);
        const moves = endpoints.length > 2;
        result.push({
          slug: `${moves ? "move" : "exchange"}-${source}-${index}-to-${target}`,
          title: `${moves ? "Move" : "Exchange"} ${endpoint}`,
          description: `Expected rejection: ${endpoint} moves from ${source} to ${target}${moves ? "" : ` in exchange for ${exchanged}`}. Every declared endpoint still occurs exactly once and every net retains at least two endpoints.`,
          paths: [pointer("circuit", "nets", source, index), pointer("circuit", "nets", target)],
          code: topology,
          apply: (document) => {
            if (moves) {
              document.circuit.nets[source] = (document.circuit.nets[source] ?? []).filter(
                (pin) => pin !== endpoint,
              );
              document.circuit.nets[target]?.push(endpoint);
            } else swap(document, endpoint, exchanged);
          },
        });
      }
      result.push({
        slug: `disconnect-${source}-${index}`,
        title: `Disconnect ${endpoint}`,
        description: `Expected rejection: ${endpoint} is removed from ${source}; ${endpoints.length === 2 ? "the remaining singleton net violates the schema" : "a declared pin or terminal is now disconnected"}.`,
        paths: [pointer("circuit", "nets", source, index)],
        code: endpoints.length === 2 ? "document.invalid_field" : "circuit.unconnected_endpoint",
        apply: (document) => {
          document.circuit.nets[source] = (document.circuit.nets[source] ?? []).filter(
            (pin) => pin !== endpoint,
          );
        },
      });
    }
    if (endpoints.length >= 4) {
      result.push({
        slug: `split-${source}`,
        title: `Split ${source} node`,
        description:
          "Expected rejection: one electrical node is split into two legal endpoint arrays. Membership stays unique but the role-resolved graph changes.",
        paths: [pointer("circuit", "nets", source), pointer("circuit", "nets", `${source}_split`)],
        code: topology,
        apply: (document) => {
          const pins = document.circuit.nets[source] ?? [];
          document.circuit.nets[source] = pins.slice(0, 2);
          document.circuit.nets[`${source}_split`] = pins.slice(2);
        },
      });
    }
  }
  for (const [index, [first]] of nets.entries()) {
    for (const [second] of nets.slice(index + 1)) {
      result.push({
        slug: `merge-${first}-${second}`,
        title: `Short ${first} / ${second}`,
        description: `Expected rejection: merging ${first} and ${second} creates a short while every pin still occurs exactly once.`,
        paths: [pointer("circuit", "nets", first), pointer("circuit", "nets", second)],
        code: topology,
        apply: (document) => merge(document, first, second),
      });
    }
  }
  for (const [role, id] of Object.entries(base.layout.roles)) {
    const component = base.circuit.components[id];
    if (!component) continue;
    result.push({
      slug: `delete-branch-${role}`,
      title: `Remove ${role} branch`,
      description: `Expected rejection: remove ${id} and all its pin references, retaining the required role assignment so a missing branch cannot become a different accepted topology.`,
      paths: [
        pointer("circuit", "components", id),
        pointer("layout", "roles", role),
        pointer("circuit", "nets"),
      ],
      code: Object.values(base.circuit.nets).some(
        (endpoints) =>
          endpoints.some((endpoint) => endpoint.startsWith(`${id}.`)) &&
          endpoints.filter((endpoint) => !endpoint.startsWith(`${id}.`)).length < 2,
      )
        ? "document.invalid_field"
        : topology,
      apply: (document) => {
        delete document.circuit.components[id];
        for (const [net, endpoints] of Object.entries(document.circuit.nets))
          document.circuit.nets[net] = endpoints.filter(
            (endpoint) => !endpoint.startsWith(`${id}.`),
          );
      },
    });
    result.push({
      slug: `wrong-role-${role}`,
      title: `Wrong type for ${role}`,
      description: `Expected rejection: ${role} no longer has the catalog component type, even though the same author ID and endpoint strings are retained.`,
      paths: [pointer("circuit", "components", id, "type"), pointer("layout", "roles", role)],
      code: topology,
      apply: (document) => {
        document.circuit.components[id] =
          component.type === "resistor"
            ? { type: "capacitor", capacitance: 100e-9 }
            : { type: "resistor", resistance: 1000 };
      },
    });
    if (["diode", "led", "npn", "op-amp", "dc-source"].includes(component.type)) {
      const pins: readonly string[] = componentPins[component.type];
      for (const [index, first] of pins.entries()) {
        for (const second of pins.slice(index + 1)) {
          result.push({
            slug: `reverse-${role}-${first}-${second}`,
            title: `Swap ${role} pins`,
            description: `Expected rejection: exchange ${id}.${first} and ${id}.${second} across their nodes; type-only semiconductor pins still have exact graph semantics.`,
            paths: [
              pointer("layout", "roles", role),
              ...nets
                .filter(
                  ([, endpoints]) =>
                    endpoints.includes(`${id}.${first}`) || endpoints.includes(`${id}.${second}`),
                )
                .map(([net]) => pointer("circuit", "nets", net)),
            ],
            code: topology,
            apply: (document) => swap(document, `${id}.${first}`, `${id}.${second}`),
          });
        }
      }
    }
  }
  return result;
}

export function getComplexGalleryCases(): GalleryCase[] {
  const cases: GalleryCase[] = [];
  for (const recipe of complexRecipeIds) {
    const family = families[recipe];
    const base = loadExample(recipe);
    const add = (
      slug: string,
      title: string,
      description: string,
      tags: string[],
      configure: (document: FigureDocument) => void,
      expectation: GalleryCase["expectation"] = { kind: "render" },
      group: GalleryCase["group"] = expectation.kind === "render" ? "examples" : "edge-cases",
    ) => {
      for (const preset of themePresets) {
        const document = loadExample(recipe);
        document.presentation.theme.preset = preset;
        document.presentation.title = title;
        configure(document);
        const scenarioId = `${recipe}/${slug}`;
        cases.push({
          id: `${scenarioId}/${preset}`,
          scenarioId,
          title,
          description: `${family.summary} ${description}`,
          recipe,
          preset,
          group,
          tags: [...family.tags, ...tags],
          document,
          expectation: { ...expectation },
        });
      }
    };
    add(
      "base-graph",
      complexRecipes[recipe].title,
      complexRecipes[recipe].derived.assumption,
      ["base-graph"],
      () => {},
    );
    for (const variant of family.variants)
      add(
        variant.slug,
        variant.title,
        variant.description,
        ["values", "ideal-limitations"],
        (document) => {
          for (const [role, value] of Object.entries(variant.values)) assign(document, role, value);
        },
      );
    for (const id of Object.keys(base.circuit.components))
      add(
        `focus-component-${id}`,
        `Focus ${id}`,
        `Only component ${id} is focused; all its catalog pins retain their nets.`,
        ["focus", "component", pointer("circuit", "components", id)],
        (document) => {
          document.presentation.highlight = { components: [id], nets: [] };
        },
      );
    for (const [net, endpoints] of Object.entries(base.circuit.nets))
      add(
        `focus-net-${net}`,
        `Focus ${net}`,
        `The ${net} node connects ${endpoints.join(", ")}; the other nets remain distinct.`,
        ["focus", "net", pointer("circuit", "nets", net)],
        (document) => {
          document.presentation.highlight = { components: [], nets: [net] };
        },
      );
    add(
      "author-ids",
      "Author-named graph",
      "Short author component/port IDs and a slash/tilde net name exercise role resolution and JSON pointer escaping, without changing topology.",
      ["IDs", "json-pointer"],
      authorIds,
    );
    add(
      "route-order",
      "Reordered node declarations",
      "Component, port, role, net and endpoint insertion orders are reversed; normalized rendering and wire geometry must remain unchanged.",
      ["routeorder", "normalization", "valid-edge"],
      reorder,
      { kind: "render" },
      "edge-cases",
    );
    const all = mutations(recipe);
    const selected = new Map<string, Mutation>();
    for (const prefix of [
      "move-",
      "exchange-",
      "disconnect-",
      "split-",
      "delete-branch-",
      "wrong-role-",
    ]) {
      const mutation =
        (prefix === "delete-branch-"
          ? all.find(
              ({ slug, code }) => slug.startsWith(prefix) && code === "layout.topology_mismatch",
            )
          : undefined) ?? all.find(({ slug }) => slug.startsWith(prefix));
      if (mutation) selected.set(mutation.slug, mutation);
    }
    for (const mutation of all.filter(({ slug }) => slug.startsWith("reverse-")))
      selected.set(mutation.slug, mutation);
    const ground = idFor(base, "ground");
    const groundNet = Object.entries(base.circuit.nets).find(([, endpoints]) =>
      endpoints.includes(ground),
    )?.[0];
    const bond = all.find(
      ({ slug }) => slug.startsWith("merge-") && slug.includes(groundNet ?? "ground"),
    );
    if (bond)
      selected.set(bond.slug, {
        ...bond,
        title: "Mistaken ground bond",
        description:
          "Expected rejection: bonding a distinct signal or supply node to the shared return is not the same as a legitimate ground connection.",
      });
    if (recipe === "wheatstone-bridge") {
      const short = all.find(({ slug }) => slug === "merge-left-right");
      if (short) selected.set(short.slug, short);
    }
    if (recipe === "inverting-amplifier") {
      for (const slug of [
        "merge-summing-ground",
        "merge-ground-positive_supply",
        "merge-ground-negative_supply",
      ]) {
        const short = all.find((mutation) => mutation.slug === slug);
        if (short) selected.set(short.slug, short);
      }
    }
    for (const mutation of selected.values())
      add(
        mutation.slug,
        mutation.title,
        mutation.description,
        ["expected-rejection", "graph-mutation", ...mutation.paths],
        mutation.apply,
        { kind: "diagnostic", code: mutation.code },
      );
  }
  return cases;
}

export function getComplexStressCases(): StressCase[] {
  const cases: StressCase[] = [];
  const e12 = [1, 1.2, 1.5, 1.8, 2.2, 2.7, 3.3, 3.9, 4.7, 5.6, 6.8, 8.2];
  for (const recipe of complexRecipeIds) {
    for (const mutation of mutations(recipe)) {
      for (const preset of themePresets) {
        const document = loadExample(recipe);
        document.presentation.theme.preset = preset;
        mutation.apply(document);
        cases.push({
          id: `complex-graph/${recipe}/${mutation.slug}/${preset}`,
          tags: [...families[recipe].tags, "graph-mutation", ...mutation.paths],
          document,
          expectation: { kind: "diagnostic", code: mutation.code },
        });
      }
    }
    const base = loadExample(recipe);
    for (const [role, id] of Object.entries(base.layout.roles)) {
      const component = base.circuit.components[id];
      if (!component || !["resistor", "capacitor", "dc-source"].includes(component.type)) continue;
      const values =
        component.type === "resistor"
          ? e12.map((value) => value * 1000)
          : component.type === "capacitor"
            ? e12.map((value) => value * 100e-9)
            : [3.3, 5, 9, 12];
      for (const value of values) {
        for (const preset of themePresets) {
          const document = loadExample(recipe);
          document.presentation.theme.preset = preset;
          assign(document, role, value);
          cases.push({
            id: `complex-e12/${recipe}/${role}/${value}/${preset}`,
            tags: [
              ...families[recipe].tags,
              "values",
              pointer(
                "circuit",
                "components",
                id,
                component.type === "resistor"
                  ? "resistance"
                  : component.type === "capacitor"
                    ? "capacitance"
                    : "voltage",
              ),
            ],
            document,
            expectation: { kind: "render" },
          });
        }
      }
    }
    for (const preset of themePresets) {
      const document = loadExample(recipe);
      document.presentation.theme.preset = preset;
      reorder(document);
      cases.push({
        id: `complex-order/${recipe}/${preset}`,
        document,
        expectation: { kind: "render" },
      });
    }
  }
  return cases;
}
