# A sensor and its controller

The document describes identities and connectivity, not positions. Change `view` to `blocks`, `wiring` or `schematic`, or override it when rendering the same Markdown.

```circuitkit
{
  "schema": "circuitkit.diagram.v1",
  "id": "sensor-demo",
  "title": "Temperature sensor",
  "modules": [
    { "id": "controller", "ports": ["3V3", "GND", "SDA", "SCL"] },
    { "id": "sensor", "ports": ["VCC", "GND", "SDA", "SCL"] }
  ],
  "connections": [
    { "from": "controller.3V3", "to": "sensor.VCC", "kind": "power", "label": "3V3" },
    { "from": "controller.GND", "to": "sensor.GND", "kind": "ground" },
    { "from": "controller.SDA", "to": "sensor.SDA", "bus": "I2C", "label": "SDA" },
    { "from": "controller.SCL", "to": "sensor.SCL", "bus": "I2C", "label": "SCL" }
  ]
}
```

This is declared connectivity, not a claim about a particular sensor board, pull-ups, voltage compatibility or working firmware. No resistance or capacitance values have been inferred.
