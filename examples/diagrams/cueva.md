# Cueva's ESP32 system

One system, three views. The text language below opens as a modular schematic. The equivalent JSON remains in `cueva.json`.

```circuitkit
circuit cueva v1
title "USB-powered ESP32, OLED and audio"
view schematic

USB: connector (power)
ESP32: controller "ESP32 Dev Board" (USB 3V3 5V/VIN GND GPIO23 GPIO22 GPIO26 GPIO25 GPIO27)
OLED: display (VCC GND SDA SCL)
MAX98357: amplifier (VIN GND BCLK LRC/WS DIN SPK+ "SPK−")
Speaker: speaker (+ "−")

power USB.power -> ESP32.USB "USB module-level power"
power ESP32.3V3 -- OLED.VCC "3V3"
ground ESP32.GND -- OLED.GND
bus I2C {
  ESP32.GPIO23 <-> OLED.SDA "SDA"
  ESP32.GPIO22 <-> OLED.SCL "SCL"
}
power ESP32.5V/VIN -- MAX98357.VIN "5V/VIN"
ground ESP32.GND -- MAX98357.GND
bus I2S {
  ESP32.GPIO26 -> MAX98357.BCLK "BCLK"
  ESP32.GPIO25 -> MAX98357.LRC/WS "LRC/WS"
  ESP32.GPIO27 -> MAX98357.DIN "DIN"
}
audio MAX98357.SPK+ -> Speaker.+
audio MAX98357."SPK−" -> Speaker."−"
```

## Render the same document

From a build containing the text-language entrypoint, choose new output paths:

```sh
node dist/cli.js render examples/diagrams/cueva.md --block 1 --out cueva-schematic.svg
node dist/cli.js render examples/diagrams/cueva.md --block 1 --view wiring --out cueva-wiring.svg
node dist/cli.js render examples/diagrams/cueva.md --block 1 --view blocks --out cueva-blocks.svg
```

The first command uses the authored schematic view. The other commands override presentation without rewriting this file. `view` selects representation; `theme` selects light, dark or print appearance. Wiring emphasizes individual connections, while blocks omit pin labels and aggregate buses. Details remain in the source, not in three separately maintained circuits.

## Scope

The eleven pin links reproduce the supplied Cueva wiring, including GPIO23 for SDA and separate speaker outputs. USB is one additional opaque module-level power connection, not a USB conductor pinout. Module internals, USB/VIN behavior, voltage compatibility and physical placement remain unverified. No pull-ups, capacitors or speaker impedance have been inferred.
