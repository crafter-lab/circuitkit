import { loadExample } from "../../src/catalog.ts";
import type { FigureDocument, RecipeId, ThemePreset } from "../../src/schema.ts";
import { basicRecipeIds, themePresets } from "../../src/schema.ts";
import { themes } from "../../src/theme.ts";
import { getComplexGalleryCases } from "./complex-corpus.ts";

export type GalleryCase = {
  id: string;
  scenarioId: string;
  title: string;
  description: string;
  recipe: RecipeId;
  preset: ThemePreset;
  group: "examples" | "edge-cases";
  tags: string[];
  document: unknown;
  expectation: { kind: "render" } | { kind: "diagnostic"; code: string };
};

type Scenario = Omit<GalleryCase, "id" | "preset" | "document"> & {
  configure: (document: FigureDocument, preset: ThemePreset) => unknown;
};

function roleId(document: FigureDocument, role: string): string {
  const id = document.layout.roles[role];
  if (id === undefined) throw new Error(`Corpus recipe is missing role ${role}`);
  return id;
}

function rename(document: FigureDocument, names: Record<string, string>) {
  const name = (id: string) => (Object.hasOwn(names, id) ? names[id] : id) ?? id;
  const endpoint = (value: string) => {
    const dot = value.indexOf(".");
    return dot === -1 ? name(value) : `${name(value.slice(0, dot))}${value.slice(dot)}`;
  };
  document.circuit.components = Object.fromEntries(
    Object.entries(document.circuit.components).map(([id, component]) => [name(id), component]),
  );
  document.circuit.ports = Object.fromEntries(
    Object.entries(document.circuit.ports).map(([id, port]) => [name(id), port]),
  );
  document.circuit.nets = Object.fromEntries(
    Object.entries(document.circuit.nets).map(([id, endpoints]) => [
      name(id),
      endpoints.map(endpoint),
    ]),
  );
  document.layout.roles = Object.fromEntries(
    Object.entries(document.layout.roles).map(([role, id]) => [role, name(id)]),
  );
  document.presentation.highlight = { components: [], nets: [] };
}

function scenarios(): Scenario[] {
  const result: Scenario[] = [];
  const add = (
    recipe: RecipeId,
    slug: string,
    title: string,
    description: string,
    tags: string[],
    configure: Scenario["configure"],
    code?: string,
    group: GalleryCase["group"] = code ? "edge-cases" : "examples",
  ) => {
    result.push({
      scenarioId: `${recipe}/${slug}`,
      recipe,
      title,
      description,
      tags,
      group,
      expectation: code ? { kind: "diagnostic", code } : { kind: "render" },
      configure,
    });
  };

  for (const [slug, title, r, c, description] of [
    [
      "slow-sensor",
      "Slow sensor filter",
      100_000,
      10e-6,
      "0.159 Hz ideal cutoff for slowly varying signals.",
    ],
    [
      "mains-smoothing",
      "Low-frequency smoothing",
      33_000,
      1e-6,
      "4.82 Hz ideal pole; no claim of mains isolation.",
    ],
    [
      "audio-low",
      "Audio bass pole",
      10_000,
      100e-9,
      "159 Hz ideal cutoff, the reference RC values.",
    ],
    ["audio-mid", "Audio midband pole", 10_000, 10e-9, "1.59 kHz ideal cutoff."],
    ["audio-high", "Audio upper-band pole", 10_000, 1e-9, "15.9 kHz ideal cutoff."],
    [
      "high-cutoff",
      "High-frequency pole",
      1_000,
      100e-12,
      "1.59 MHz ideal cutoff, ignoring parasitics.",
    ],
    [
      "scaled-low-r",
      "Same pole, lower R",
      1_000,
      1e-6,
      "159 Hz like audio-low, with one tenth R and ten times C.",
    ],
    [
      "scaled-high-r",
      "Same pole, higher R",
      100_000,
      10e-9,
      "159 Hz like audio-low, with ten times R and one tenth C.",
    ],
    [
      "e12-pair",
      "E12 sensor values",
      4_700,
      220e-9,
      "154 Hz from common 4.7 kΩ and 220 nF nominal parts.",
    ],
  ] as const) {
    add("rc-lowpass", slug, title, description, ["ideal", "cutoff", "SI"], (document) => {
      document.circuit.components[roleId(document, "series")] = { type: "resistor", resistance: r };
      document.circuit.components[roleId(document, "shunt")] = {
        type: "capacitor",
        capacitance: c,
      };
      return document;
    });
  }

  for (const [slug, title, top, bottom, description] of [
    ["half", "Equal-resistor divider", 10_000, 10_000, "Ideal unloaded ratio 0.5."],
    ["tenth", "One-tenth divider", 90_000, 10_000, "Ideal unloaded ratio 0.1."],
    ["quarter", "One-quarter divider", 30_000, 10_000, "Ideal unloaded ratio 0.25."],
    ["third", "One-third divider", 20_000, 10_000, "Repeating ratio 1/3, rounded for display."],
    [
      "two-thirds",
      "Two-thirds divider",
      10_000,
      20_000,
      "Repeating ratio 2/3, rounded for display.",
    ],
    ["three-quarters", "Three-quarter divider", 10_000, 30_000, "Ideal unloaded ratio 0.75."],
    ["nine-tenths", "Nine-tenths divider", 10_000, 90_000, "Ideal unloaded ratio 0.9."],
    [
      "e12-ratio",
      "E12 divider",
      4_700,
      10_000,
      "Real nominal values, ideal unloaded ratio about 0.6803.",
    ],
    [
      "microscale",
      "Micro-ohm ratio",
      1e-6,
      3e-6,
      "Scale invariance at micro-ohms; not a practical design claim.",
    ],
    [
      "gigascale",
      "Giga-ohm ratio",
      1e9,
      3e9,
      "Same 0.75 ideal ratio at giga-ohms; loading is not modeled.",
    ],
  ] as const) {
    add("voltage-divider", slug, title, description, ["ideal", "ratio", "SI"], (document) => {
      document.circuit.components[roleId(document, "top")] = { type: "resistor", resistance: top };
      document.circuit.components[roleId(document, "bottom")] = {
        type: "resistor",
        resistance: bottom,
      };
      return document;
    });
  }

  for (const voltage of [3.3, 5, 9, 12]) {
    for (const resistance of [330, 1_000]) {
      add(
        "led-series",
        `source-${voltage.toString().replace(".", "p")}-r-${resistance}`,
        `LED: ${voltage} V, ${resistance} Ω`,
        "Drawing values only. No forward voltage, LED current, power rating or electrical safety is inferred.",
        ["drawing-only", "source", "resistance", "SI"],
        (document) => {
          document.circuit.components[roleId(document, "supply")] = { type: "dc-source", voltage };
          document.circuit.components[roleId(document, "resistor")] = {
            type: "resistor",
            resistance,
          };
          return document;
        },
      );
    }
  }

  for (const recipe of basicRecipeIds) {
    const base = loadExample(recipe);
    const component = Object.keys(base.circuit.components)[0];
    const net = Object.keys(base.circuit.nets)[0];
    if (!component || !net) throw new Error(`Empty example for ${recipe}`);
    add(
      recipe,
      "custom-ids",
      "Author-selected IDs",
      "Short component, terminal and net IDs are preserved through rendering and inspection.",
      ["IDs", "connectivity"],
      (document) => {
        rename(document, {
          R1: "Ra",
          R2: "Rb",
          C1: "Cf",
          V1: "Vs",
          D1: "Da",
          VIN: "IN",
          VOUT: "OUT",
          GND: "REF",
          input: "entrada",
          output: "salida",
          ground: "retorno",
          supply: "fuente",
          series: "rama",
        });
        return document;
      },
    );
    add(
      recipe,
      "spanish-glyphs",
      "Señal, tensión y Ω",
      "Pinned glyph coverage: áéíóúüñ, Greek Ω µ μ π and Spanish punctuation.",
      ["Spanish", "glyphs"],
      (document) => {
        document.presentation.title = "Señal: áéíóúüñ Ω µ μ π";
        return document;
      },
    );
    add(
      recipe,
      "accent",
      "Accessible violet focus",
      "Theme-specific violet accent with component and net focus; connectivity is unchanged.",
      ["accent", "focus", "contrast"],
      (document, preset) => {
        document.presentation.theme.overrides = {
          highlight: preset === "geist-dark" ? "#c4b5fd" : "#6d28d9",
        };
        document.presentation.highlight = { components: [component], nets: [net] };
        return document;
      },
    );
    for (const id of Object.keys(base.circuit.components)) {
      add(
        recipe,
        `focus-component-${id}`,
        `Focus ${id}`,
        `Highlight only component ${id}; paths and bounds must not move.`,
        ["focus", "component"],
        (document) => {
          document.presentation.highlight = { components: [id], nets: [] };
          return document;
        },
      );
    }
    for (const id of Object.keys(base.circuit.nets)) {
      add(
        recipe,
        `focus-net-${id}`,
        `Focus ${id} net`,
        `Highlight only net ${id}; endpoint membership must remain identical.`,
        ["focus", "net"],
        (document) => {
          document.presentation.highlight = { components: [], nets: [id] };
          return document;
        },
      );
    }
    add(
      recipe,
      "escaped-title",
      "Escaped XML title",
      "Valid title containing markup characters must stay inert in SVG metadata.",
      ["escaping", "valid-edge"],
      (document) => {
        document.presentation.title = '<script>& "RC"';
        return document;
      },
      undefined,
      "edge-cases",
    );
    add(
      recipe,
      "prototype-ids",
      "Prototype-like IDs",
      "constructor component and __proto__ net remain ordinary own entries, not inherited properties.",
      ["IDs", "prototype", "valid-edge"],
      (document) => {
        rename(document, { R1: "constructor", [net]: "__proto__" });
        return document;
      },
      undefined,
      "edge-cases",
    );
    add(
      recipe,
      "endpoint-order",
      "Reordered endpoint sets",
      "Reverse author insertion order and endpoint order; normalization preserves the same graph.",
      ["normalization", "valid-edge"],
      (document) => {
        document.circuit.nets = Object.fromEntries(
          Object.entries(document.circuit.nets)
            .reverse()
            .map(([id, endpoints]) => [id, endpoints.reverse()]),
        );
        document.presentation.highlight = { components: [component, component], nets: [net, net] };
        return document;
      },
      undefined,
      "edge-cases",
    );
    add(
      recipe,
      "extreme-finite",
      "Finite boundary values",
      "Representable ideal quantities at extreme finite magnitudes; LED remains drawing-only.",
      ["IEEE754", "valid-edge"],
      (document) => {
        if (recipe === "rc-lowpass") {
          document.circuit.components[roleId(document, "series")] = {
            type: "resistor",
            resistance: 1e-310,
          };
          document.circuit.components[roleId(document, "shunt")] = {
            type: "capacitor",
            capacitance: 1e308,
          };
        } else if (recipe === "voltage-divider") {
          document.circuit.components[roleId(document, "top")] = {
            type: "resistor",
            resistance: Number.MAX_VALUE,
          };
          document.circuit.components[roleId(document, "bottom")] = {
            type: "resistor",
            resistance: Number.MAX_VALUE,
          };
        } else {
          document.circuit.components[roleId(document, "resistor")] = {
            type: "resistor",
            resistance: Number.MIN_VALUE,
          };
        }
        return document;
      },
      undefined,
      "edge-cases",
    );

    const invalid = (
      slug: string,
      title: string,
      description: string,
      code: string,
      configure: Scenario["configure"],
    ) => add(recipe, slug, title, description, ["expected-rejection", code], configure, code);
    invalid(
      "unknown-pin",
      "Unknown pin",
      "Expected rejection: components accept only their catalog pin names.",
      "circuit.unknown_pin",
      (document) => {
        const endpoints = document.circuit.nets[net];
        if (endpoints) endpoints[0] = `${component}.missing`;
        return document;
      },
    );
    invalid(
      "disconnected",
      "Disconnected endpoint",
      "Expected rejection: removing a member of the three-endpoint net leaves a declared endpoint unconnected.",
      "circuit.unconnected_endpoint",
      (document) => {
        Object.values(document.circuit.nets)
          .find((endpoints) => endpoints.length === 3)
          ?.pop();
        return document;
      },
    );
    invalid(
      "duplicate-endpoint",
      "Duplicate endpoint",
      "Expected rejection: one endpoint cannot occur twice, even within the same net.",
      "circuit.endpoint_conflict",
      (document) => {
        const endpoints = document.circuit.nets[net];
        if (endpoints?.[0]) endpoints.push(endpoints[0]);
        return document;
      },
    );
    invalid(
      "extra-role",
      "Unsupported role",
      "Expected rejection: arbitrary roles cannot extend a fixed recipe.",
      "layout.topology_mismatch",
      (document) => {
        document.layout.roles.extra = component;
        return document;
      },
    );
    invalid(
      "extra-topology",
      "Extra resistor branch",
      "Expected rejection: an additional connected resistor is outside the exact recipe topology.",
      "layout.topology_mismatch",
      (document) => {
        document.circuit.components.Rextra = { type: "resistor", resistance: 1_000 };
        document.circuit.nets.extra = ["Rextra.a", "Rextra.b"];
        return document;
      },
    );
    for (const kind of ["components", "nets"] as const) {
      invalid(
        `unknown-highlight-${kind}`,
        `Unknown ${kind} focus`,
        "Expected rejection: focus must refer to a declared component or net.",
        "presentation.unknown_highlight",
        (document) => {
          document.presentation.highlight = { components: [], nets: [], [kind]: ["absent"] };
          return document;
        },
      );
    }
    invalid(
      "long-title",
      "Title outside layout",
      "Expected rejection: long text must not silently clip or escape its reserved region.",
      "layout.label_collision",
      (document) => {
        document.presentation.title = "A".repeat(200);
        return document;
      },
    );
    invalid(
      "missing-glyph",
      "Unsupported emoji glyph",
      "Expected rejection: the pinned fonts do not supply the test-tube emoji.",
      "font.missing_glyph",
      (document) => {
        document.presentation.title = "Circuit 🧪";
        return document;
      },
    );
    invalid(
      "low-contrast",
      "Label matches background",
      "Expected rejection: label color deliberately equals this theme's actual background.",
      "theme.insufficient_contrast",
      (document, preset) => {
        document.presentation.theme.overrides = { label: themes[preset].background };
        return document;
      },
    );
    invalid(
      "invalid-hex",
      "Invalid color token",
      "Expected rejection: opaque hex syntax is mandatory; #12 is incomplete.",
      "theme.invalid_token",
      (document) => {
        document.presentation.theme.overrides = { highlight: "#12" };
        return document;
      },
    );
    invalid(
      "thick-stroke",
      "Stroke closes symbol gaps",
      "Expected rejection: a 20-unit stroke collides with reserved geometry.",
      "layout.label_collision",
      (document) => {
        document.presentation.theme.overrides = { strokeWidth: 20 };
        return document;
      },
    );
    invalid(
      "collapsed-font",
      "Collapsed finite font",
      "Expected rejection: Number.MIN_VALUE is positive but collapses visible glyph bounds.",
      "layout.label_collision",
      (document) => {
        document.presentation.theme.overrides = { fontScale: Number.MIN_VALUE };
        return document;
      },
    );
    invalid(
      "oversized-font",
      "Oversized font collisions",
      "Expected rejection: a tenfold font scale cannot fit the fixed layout.",
      "layout.label_collision",
      (document) => {
        document.presentation.theme.overrides = { fontScale: 10 };
        return document;
      },
    );
    invalid(
      "invalid-si",
      "Zero resistance",
      "Expected rejection: resistance must be positive finite SI, not zero.",
      "document.invalid_field",
      (document) => {
        const role =
          recipe === "rc-lowpass" ? "series" : recipe === "voltage-divider" ? "top" : "resistor";
        document.circuit.components[roleId(document, role)] = { type: "resistor", resistance: 0 };
        return document;
      },
    );
    invalid(
      "schema-extra-field",
      "Unknown document field",
      "Expected rejection: the versioned public schema is strict.",
      "document.invalid_field",
      (document) => ({ ...document, simulation: true }),
    );
    invalid(
      "schema-si-string",
      "SI string is not a number",
      "Expected rejection: human-readable 10k is not a numeric SI resistance.",
      "document.invalid_field",
      (document) => {
        const role =
          recipe === "rc-lowpass" ? "series" : recipe === "voltage-divider" ? "top" : "resistor";
        const id = roleId(document, role);
        return {
          ...document,
          circuit: {
            ...document.circuit,
            components: {
              ...document.circuit.components,
              [id]: { type: "resistor", resistance: "10k" },
            },
          },
        };
      },
    );
    invalid(
      "unsupported-version",
      "Unsupported document version",
      "Expected rejection: version 2 is not understood by this renderer.",
      "document.unsupported_version",
      (document) => ({ ...document, version: 2 }),
    );
  }
  add(
    "led-series",
    "reversed-polarity",
    "Swapped LED polarity",
    "Expected rejection: swapping anode and cathode violates the supported oriented topology.",
    ["expected-rejection", "polarity"],
    (document) => {
      const led = roleId(document, "led");
      for (const endpoints of Object.values(document.circuit.nets)) {
        for (const [index, endpoint] of endpoints.entries()) {
          if (endpoint === `${led}.anode`) endpoints[index] = `${led}.cathode`;
          else if (endpoint === `${led}.cathode`) endpoints[index] = `${led}.anode`;
        }
      }
      return document;
    },
    "layout.topology_mismatch",
  );
  return result;
}

export function getGalleryCases(): GalleryCase[] {
  const basic = scenarios().flatMap(({ configure, ...scenario }) =>
    themePresets.map((preset) => {
      const document = loadExample(scenario.recipe);
      document.presentation.title = scenario.title;
      document.presentation.theme.preset = preset;
      return {
        ...scenario,
        tags: [...scenario.tags],
        expectation: { ...scenario.expectation },
        id: `${scenario.scenarioId}/${preset}`,
        preset,
        document: configure(document, preset),
      };
    }),
  );
  return [...basic, ...getComplexGalleryCases()];
}

export function getGalleryCase(id: string): GalleryCase | undefined {
  return getGalleryCases().find((entry) => entry.id === id);
}
