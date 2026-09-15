import { type FigureDocument, loadExample, type ThemePreset } from "../../src/index.ts";

export function dividerLesson(theme: ThemePreset, resistance: number): FigureDocument {
  const document = loadExample("voltage-divider");
  document.circuit.components.R1 = { type: "resistor", resistance };
  document.presentation = {
    title: "Three nodes, two resistors",
    theme: { preset: theme },
    highlight: { components: [], nets: [] },
    annotations: {
      nets: [
        {
          net: "input",
          label: "A",
          description:
            "VIN and R1.a share the input node. VIN is a terminal, not a drawn voltage source.",
          tone: "blue",
        },
        {
          net: "output",
          label: "B",
          description: "R1.b, R2.a and VOUT share one output node, including the branch to VOUT.",
          tone: "amber",
        },
        {
          net: "ground",
          label: "C",
          description:
            "R2.b connects to GND, the reference node. R2 separates this conductor from B.",
          tone: "violet",
        },
      ],
      legend: true,
      caption:
        "A, B and C identify whole electrical nodes. The resistors separate them; a junction dot only marks a connection within a node.",
    },
  };
  return document;
}

export function amplifierLesson(theme: ThemePreset): FigureDocument {
  const document = loadExample("inverting-amplifier");
  document.presentation = {
    title: "Feedback is a connection, not a ground wire",
    theme: { preset: theme },
    highlight: { components: [], nets: [] },
    annotations: {
      nets: [
        {
          net: "input",
          label: "A",
          description: "VIN connects to RIN.a. RIN separates the input node from the summing node.",
          tone: "blue",
        },
        {
          net: "summing",
          label: "B",
          description:
            "RIN.b, RF.a and U1.inverting share the summing node. It is not wired to GND.",
          tone: "amber",
        },
        {
          net: "output",
          label: "C",
          description: "U1.output, RF.b and VOUT share the output node. RF returns feedback to B.",
          tone: "violet",
        },
        {
          net: "ground",
          label: "D",
          description: "U1.noninverting connects to GND. This reference node is distinct from B.",
          tone: "green",
        },
        {
          net: "positive_supply",
          label: "E",
          description: "VPLUS connects to U1.vplus, the positive supply pin, not the signal input.",
          tone: "rose",
        },
        {
          net: "negative_supply",
          label: "F",
          description:
            "VMINUS connects to U1.vminus, the negative supply pin, not the inverting input.",
          tone: "cyan",
        },
      ],
      legend: true,
      caption:
        "In the ideal negative-feedback model, B can be near the reference voltage without being connected to ground. This drawing shows connectivity, not a simulation.",
    },
  };
  return document;
}
