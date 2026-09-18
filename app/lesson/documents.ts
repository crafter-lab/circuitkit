import { type FigureDocument, loadExample, type ThemePreset } from "../../src/index.ts";

export function dividerLesson(theme: ThemePreset, resistance: number): FigureDocument {
  const document = loadExample("voltage-divider");
  document.circuit.components.R1 = { type: "resistor", resistance };
  document.presentation = {
    title: "Three nodes, two resistors",
    theme: { preset: theme },
    steps: [
      {
        id: "input",
        title: "Start at the input",
        description:
          "VIN and R1.a share node A. R1 separates the input conductor from the output conductor.",
        highlight: { components: ["R1"], nets: ["input"] },
      },
      {
        id: "output",
        title: "Find the divider output",
        description:
          "R1.b, R2.a and VOUT share node B. With no output load, VOUT/VIN = R2/(R1+R2).",
        highlight: { components: ["R1", "R2"], nets: ["output"] },
      },
      {
        id: "reference",
        title: "Identify the reference",
        description:
          "R2.b connects to node C and GND. R2 separates B from C; the output ratio assumes an unloaded divider.",
        highlight: { components: ["R2"], nets: ["ground"] },
      },
    ],
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

export function rcLesson(theme: ThemePreset): FigureDocument {
  const document = loadExample("rc-lowpass");
  document.presentation = {
    title: "A resistor and a capacitor, three nodes",
    theme: { preset: theme },
    highlight: { components: [], nets: [] },
    steps: [
      {
        id: "input",
        title: "Identify the series resistor",
        description: "VIN joins R1.a at A. R1 separates the input from output node B.",
        highlight: { components: ["R1"], nets: ["input"] },
      },
      {
        id: "output",
        title: "Find the shared output node",
        description:
          "R1.b, C1.a and VOUT share B. The branch to the capacitor belongs to the same conductor as VOUT.",
        highlight: { components: ["C1"], nets: ["output"] },
      },
      {
        id: "reference",
        title: "Keep the capacitor plates separate",
        description:
          "C1.b joins C and GND. The two capacitor plates are not one wire. The ideal first-order cutoff is fc = 1/(2πRC), not a simulated response.",
        highlight: { components: ["R1", "C1"], nets: ["ground"] },
      },
    ],
    annotations: {
      nets: [
        {
          net: "input",
          label: "A",
          description: "VIN and R1.a share the input conductor.",
          tone: "blue",
        },
        {
          net: "output",
          label: "B",
          description: "R1.b, C1.a and VOUT share the output conductor.",
          tone: "amber",
        },
        {
          net: "ground",
          label: "C",
          description: "C1.b and GND share the reference conductor; C1 separates it from B.",
          tone: "violet",
        },
      ],
      legend: true,
      caption:
        "This RC low-pass drawing shows connectivity and an ideal cutoff formula, not a transient simulation or a validated physical design.",
    },
  };
  return document;
}

export function amplifierLesson(theme: ThemePreset): FigureDocument {
  const document = loadExample("inverting-amplifier");
  document.presentation = {
    title: "Feedback is a connection, not a ground wire",
    theme: { preset: theme },
    steps: [
      {
        id: "input",
        title: "Locate the summing node",
        description:
          "RIN separates input A from summing node B. B joins RIN.b, RF.a and the inverting input of U1.",
        highlight: { components: ["RIN"], nets: ["input", "summing"] },
      },
      {
        id: "feedback",
        title: "Trace the feedback resistor",
        description:
          "RF connects output C back to summing node B. This is a feedback connection, not a ground wire.",
        highlight: { components: ["RF"], nets: ["output", "summing"] },
      },
      {
        id: "reference",
        title: "Keep the reference separate",
        description:
          "The noninverting input is wired to D. B may be near D in the ideal negative-feedback model, but B and D remain distinct nets.",
        highlight: { components: ["U1"], nets: ["ground", "summing"] },
      },
      {
        id: "supplies",
        title: "Distinguish supply pins",
        description:
          "E and F connect the positive and negative supply pins. Supply wiring is separate from the signal input and feedback path.",
        highlight: { components: ["U1"], nets: ["positive_supply", "negative_supply"] },
      },
    ],
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
