export const complexRecipes = {
  "loaded-divider": {
    title: "Loaded voltage divider",
    roles: {
      top: "resistor",
      bottom: "resistor",
      load: "resistor",
      input: "terminal",
      output: "terminal",
      ground: "ground",
    },
    nets: [
      ["input", "top.a"],
      ["top.b", "bottom.a", "load.a", "output"],
      ["bottom.b", "load.b", "ground"],
    ],
    derived: {
      formula: "VOUT/VIN = (Rbottom || Rload)/(Rtop + (Rbottom || Rload))",
      assumption: "Ideal resistors with an explicit parallel load; not an unloaded divider.",
    },
  },
  "rc-ladder": {
    title: "Two-stage RC ladder",
    roles: {
      first: "resistor",
      firstShunt: "capacitor",
      second: "resistor",
      secondShunt: "capacitor",
      input: "terminal",
      output: "terminal",
      ground: "ground",
    },
    nets: [
      ["input", "first.a"],
      ["first.b", "firstShunt.a", "second.a"],
      ["second.b", "secondShunt.a", "output"],
      ["firstShunt.b", "secondShunt.b", "ground"],
    ],
    derived: {
      formula: "H(s) = 1/[1 + s(R1 C1 + R1 C2 + R2 C2) + s² R1 R2 C1 C2]",
      assumption:
        "Unbuffered stages interact. Ideal source and unloaded output; no independent cutoff product.",
    },
  },
  "wheatstone-bridge": {
    title: "Wheatstone bridge",
    roles: {
      upperLeft: "resistor",
      lowerLeft: "resistor",
      upperRight: "resistor",
      lowerRight: "resistor",
      input: "terminal",
      outputLeft: "terminal",
      outputRight: "terminal",
      ground: "ground",
    },
    nets: [
      ["input", "upperLeft.a", "upperRight.a"],
      ["upperLeft.b", "lowerLeft.a", "outputLeft"],
      ["upperRight.b", "lowerRight.a", "outputRight"],
      ["lowerLeft.b", "lowerRight.b", "ground"],
    ],
    derived: {
      formula: "VLEFT - VRIGHT = VIN [R2/(R1+R2) - R4/(R3+R4)]",
      assumption:
        "Open-circuit differential outputs; no wire or measuring load connects the two midpoints.",
    },
  },
  "bridge-rectifier": {
    title: "Full-wave bridge rectifier",
    roles: {
      positiveA: "diode",
      positiveB: "diode",
      negativeA: "diode",
      negativeB: "diode",
      load: "resistor",
      filter: "capacitor",
      inputA: "terminal",
      inputB: "terminal",
      output: "terminal",
      ground: "ground",
    },
    nets: [
      ["inputA", "positiveA.anode", "negativeA.cathode"],
      ["inputB", "positiveB.anode", "negativeB.cathode"],
      ["positiveA.cathode", "positiveB.cathode", "load.a", "filter.a", "output"],
      ["negativeA.anode", "negativeB.anode", "load.b", "filter.b", "ground"],
    ],
    derived: {
      formula: null,
      assumption:
        "AC terminals A/B, full-wave diode bridge, parallel load and filter. No ripple or diode-drop simulation.",
    },
  },
  "transistor-switch": {
    title: "NPN low-side LED switch",
    roles: {
      supply: "dc-source",
      baseResistor: "resistor",
      series: "resistor",
      led: "led",
      switch: "npn",
      control: "terminal",
      ground: "ground",
    },
    nets: [
      ["supply.positive", "series.a"],
      ["series.b", "led.anode"],
      ["led.cathode", "switch.collector"],
      ["control", "baseResistor.a"],
      ["baseResistor.b", "switch.base"],
      ["switch.emitter", "supply.negative", "ground"],
    ],
    derived: {
      formula: null,
      assumption:
        "Shared-ground low-side NPN topology. No gain, saturation, LED current or switching-time model.",
    },
  },
  "inverting-amplifier": {
    title: "Inverting operational amplifier",
    roles: {
      inputResistor: "resistor",
      feedback: "resistor",
      amplifier: "op-amp",
      input: "terminal",
      output: "terminal",
      positiveSupply: "terminal",
      negativeSupply: "terminal",
      ground: "ground",
    },
    nets: [
      ["input", "inputResistor.a"],
      ["inputResistor.b", "feedback.a", "amplifier.inverting"],
      ["amplifier.output", "feedback.b", "output"],
      ["amplifier.noninverting", "ground"],
      ["amplifier.vplus", "positiveSupply"],
      ["amplifier.vminus", "negativeSupply"],
    ],
    derived: {
      formula: "VOUT/VIN = -Rfeedback/Rin",
      assumption:
        "Ideal linear negative feedback only. Virtual ground is not wired to GND; rails, bandwidth and saturation are not simulated.",
    },
  },
} as const;
