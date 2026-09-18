# Three nodes, two resistors

A, B and C identify whole electrical nodes. The resistors separate them; a junction dot only marks a connection within a node.

Use Previous, Next and Show all in CircuitLessonSequence to read at your own pace. These are authored highlights, not animation or a simulation.

## 1. Start at the input

VIN and R1.a share node A. R1 separates the input conductor from the output conductor.

## 2. Find the divider output

R1.b, R2.a and VOUT share node B. With no output load, VOUT/VIN = R2/(R1+R2).

## 3. Identify the reference

R2.b connects to node C and GND. R2 separates B from C; the output ratio assumes an unloaded divider.

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
      "R2": {
        "type": "resistor",
        "resistance": 10000
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
        "R2.a",
        "VOUT"
      ],
      "ground": [
        "R2.b",
        "GND"
      ]
    }
  },
  "layout": {
    "preset": "voltage-divider",
    "roles": {
      "top": "R1",
      "bottom": "R2",
      "input": "VIN",
      "output": "VOUT",
      "ground": "GND"
    }
  },
  "presentation": {
    "title": "Three nodes, two resistors",
    "theme": {
      "preset": "geist-light"
    },
    "steps": [
      {
        "id": "input",
        "title": "Start at the input",
        "description": "VIN and R1.a share node A. R1 separates the input conductor from the output conductor.",
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
        "title": "Find the divider output",
        "description": "R1.b, R2.a and VOUT share node B. With no output load, VOUT/VIN = R2/(R1+R2).",
        "highlight": {
          "components": [
            "R1",
            "R2"
          ],
          "nets": [
            "output"
          ]
        }
      },
      {
        "id": "reference",
        "title": "Identify the reference",
        "description": "R2.b connects to node C and GND. R2 separates B from C; the output ratio assumes an unloaded divider.",
        "highlight": {
          "components": [
            "R2"
          ],
          "nets": [
            "ground"
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
          "description": "VIN and R1.a share the input node. VIN is a terminal, not a drawn voltage source.",
          "tone": "blue"
        },
        {
          "net": "output",
          "label": "B",
          "description": "R1.b, R2.a and VOUT share one output node, including the branch to VOUT.",
          "tone": "amber"
        },
        {
          "net": "ground",
          "label": "C",
          "description": "R2.b connects to GND, the reference node. R2 separates this conductor from B.",
          "tone": "violet"
        }
      ],
      "legend": true,
      "caption": "A, B and C identify whole electrical nodes. The resistors separate them; a junction dot only marks a connection within a node."
    },
    "activeStep": "input"
  }
}
```
