# Feedback is a connection, not a ground wire

In the ideal negative-feedback model, B can be near the reference voltage without being connected to ground. This drawing shows connectivity, not a simulation.

Use Previous, Next and Show all in CircuitLessonSequence to read at your own pace. These are authored highlights, not animation or a simulation.

## 1. Locate the summing node

RIN separates input A from summing node B. B joins RIN.b, RF.a and the inverting input of U1.

## 2. Trace the feedback resistor

RF connects output C back to summing node B. This is a feedback connection, not a ground wire.

## 3. Keep the reference separate

The noninverting input is wired to D. B may be near D in the ideal negative-feedback model, but B and D remain distinct nets.

## 4. Distinguish supply pins

E and F connect the positive and negative supply pins. Supply wiring is separate from the signal input and feedback path.

## Portable figure

A host without a CircuitKit adapter displays the fenced JSON as inert code. The explanation above remains readable. For a static-image fallback, render the matching JSON file with circuitkit render --figure and embed the generated SVG using your hosts normal image syntax. This example makes no assumptions about any other checkout or host integration.

```circuitkit
{
  "version": 1,
  "circuit": {
    "components": {
      "RIN": {
        "type": "resistor",
        "resistance": 10000
      },
      "RF": {
        "type": "resistor",
        "resistance": 100000
      },
      "U1": {
        "type": "op-amp"
      }
    },
    "ports": {
      "VIN": {
        "kind": "terminal"
      },
      "VOUT": {
        "kind": "terminal"
      },
      "VPLUS": {
        "kind": "terminal"
      },
      "VMINUS": {
        "kind": "terminal"
      },
      "GND": {
        "kind": "ground"
      }
    },
    "nets": {
      "input": [
        "VIN",
        "RIN.a"
      ],
      "summing": [
        "RIN.b",
        "RF.a",
        "U1.inverting"
      ],
      "output": [
        "U1.output",
        "RF.b",
        "VOUT"
      ],
      "ground": [
        "U1.noninverting",
        "GND"
      ],
      "positive_supply": [
        "U1.vplus",
        "VPLUS"
      ],
      "negative_supply": [
        "U1.vminus",
        "VMINUS"
      ]
    }
  },
  "layout": {
    "preset": "inverting-amplifier",
    "roles": {
      "inputResistor": "RIN",
      "feedback": "RF",
      "amplifier": "U1",
      "input": "VIN",
      "output": "VOUT",
      "positiveSupply": "VPLUS",
      "negativeSupply": "VMINUS",
      "ground": "GND"
    }
  },
  "presentation": {
    "title": "Feedback is a connection, not a ground wire",
    "theme": {
      "preset": "geist-light"
    },
    "steps": [
      {
        "id": "input",
        "title": "Locate the summing node",
        "description": "RIN separates input A from summing node B. B joins RIN.b, RF.a and the inverting input of U1.",
        "highlight": {
          "components": [
            "RIN"
          ],
          "nets": [
            "input",
            "summing"
          ]
        }
      },
      {
        "id": "feedback",
        "title": "Trace the feedback resistor",
        "description": "RF connects output C back to summing node B. This is a feedback connection, not a ground wire.",
        "highlight": {
          "components": [
            "RF"
          ],
          "nets": [
            "output",
            "summing"
          ]
        }
      },
      {
        "id": "reference",
        "title": "Keep the reference separate",
        "description": "The noninverting input is wired to D. B may be near D in the ideal negative-feedback model, but B and D remain distinct nets.",
        "highlight": {
          "components": [
            "U1"
          ],
          "nets": [
            "ground",
            "summing"
          ]
        }
      },
      {
        "id": "supplies",
        "title": "Distinguish supply pins",
        "description": "E and F connect the positive and negative supply pins. Supply wiring is separate from the signal input and feedback path.",
        "highlight": {
          "components": [
            "U1"
          ],
          "nets": [
            "positive_supply",
            "negative_supply"
          ]
        }
      }
    ],
    "highlight": {
      "components": [],
      "nets": []
    },
    "annotations": {
      "nets": [
        {
          "net": "input",
          "label": "A",
          "description": "VIN connects to RIN.a. RIN separates the input node from the summing node.",
          "tone": "blue"
        },
        {
          "net": "summing",
          "label": "B",
          "description": "RIN.b, RF.a and U1.inverting share the summing node. It is not wired to GND.",
          "tone": "amber"
        },
        {
          "net": "output",
          "label": "C",
          "description": "U1.output, RF.b and VOUT share the output node. RF returns feedback to B.",
          "tone": "violet"
        },
        {
          "net": "ground",
          "label": "D",
          "description": "U1.noninverting connects to GND. This reference node is distinct from B.",
          "tone": "green"
        },
        {
          "net": "positive_supply",
          "label": "E",
          "description": "VPLUS connects to U1.vplus, the positive supply pin, not the signal input.",
          "tone": "rose"
        },
        {
          "net": "negative_supply",
          "label": "F",
          "description": "VMINUS connects to U1.vminus, the negative supply pin, not the inverting input.",
          "tone": "cyan"
        }
      ],
      "legend": true,
      "caption": "In the ideal negative-feedback model, B can be near the reference voltage without being connected to ground. This drawing shows connectivity, not a simulation."
    },
    "activeStep": "input"
  }
}
```
