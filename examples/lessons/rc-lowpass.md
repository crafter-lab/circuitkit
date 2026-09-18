# A resistor and a capacitor, three nodes

This RC low-pass drawing shows connectivity and an ideal cutoff formula, not a transient simulation or a validated physical design.

Use Previous, Next and Show all in CircuitLessonSequence to read at your own pace. These are authored highlights, not animation or a simulation.

## 1. Identify the series resistor

VIN joins R1.a at A. R1 separates the input from output node B.

## 2. Find the shared output node

R1.b, C1.a and VOUT share B. The branch to the capacitor belongs to the same conductor as VOUT.

## 3. Keep the capacitor plates separate

C1.b joins C and GND. The two capacitor plates are not one wire. The ideal first-order cutoff is fc = 1/(2πRC), not a simulated response.

## Portable figure

A host without a CircuitKit adapter displays the fenced JSON as inert code. The explanation above remains readable. For a static-image fallback, render the matching JSON file with circuitkit render --figure and embed the generated SVG using your hosts normal image syntax. This example makes no assumptions about any other checkout or host integration.

```circuitkit
{
  "version": 1,
  "circuit": {
    "components": {
      "R1": {
        "type": "resistor",
        "resistance": 10000
      },
      "C1": {
        "type": "capacitor",
        "capacitance": 1e-7
      }
    },
    "ports": {
      "VIN": {
        "kind": "terminal"
      },
      "VOUT": {
        "kind": "terminal"
      },
      "GND": {
        "kind": "ground"
      }
    },
    "nets": {
      "input": [
        "VIN",
        "R1.a"
      ],
      "output": [
        "R1.b",
        "C1.a",
        "VOUT"
      ],
      "ground": [
        "C1.b",
        "GND"
      ]
    }
  },
  "layout": {
    "preset": "rc-lowpass",
    "roles": {
      "series": "R1",
      "shunt": "C1",
      "input": "VIN",
      "output": "VOUT",
      "ground": "GND"
    }
  },
  "presentation": {
    "title": "A resistor and a capacitor, three nodes",
    "theme": {
      "preset": "geist-light"
    },
    "highlight": {
      "components": [],
      "nets": []
    },
    "steps": [
      {
        "id": "input",
        "title": "Identify the series resistor",
        "description": "VIN joins R1.a at A. R1 separates the input from output node B.",
        "highlight": {
          "components": [
            "R1"
          ],
          "nets": [
            "input"
          ]
        }
      },
      {
        "id": "output",
        "title": "Find the shared output node",
        "description": "R1.b, C1.a and VOUT share B. The branch to the capacitor belongs to the same conductor as VOUT.",
        "highlight": {
          "components": [
            "C1"
          ],
          "nets": [
            "output"
          ]
        }
      },
      {
        "id": "reference",
        "title": "Keep the capacitor plates separate",
        "description": "C1.b joins C and GND. The two capacitor plates are not one wire. The ideal first-order cutoff is fc = 1/(2πRC), not a simulated response.",
        "highlight": {
          "components": [
            "R1",
            "C1"
          ],
          "nets": [
            "ground"
          ]
        }
      }
    ],
    "annotations": {
      "nets": [
        {
          "net": "input",
          "label": "A",
          "description": "VIN and R1.a share the input conductor.",
          "tone": "blue"
        },
        {
          "net": "output",
          "label": "B",
          "description": "R1.b, C1.a and VOUT share the output conductor.",
          "tone": "amber"
        },
        {
          "net": "ground",
          "label": "C",
          "description": "C1.b and GND share the reference conductor; C1 separates it from B.",
          "tone": "violet"
        }
      ],
      "legend": true,
      "caption": "This RC low-pass drawing shows connectivity and an ideal cutoff formula, not a transient simulation or a validated physical design."
    },
    "activeStep": "input"
  }
}
```
