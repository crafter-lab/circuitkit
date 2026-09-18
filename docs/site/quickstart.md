# Your first circuit

You will create a two-module sensor diagram and render an image. This example deliberately shows signals only, not a complete powered circuit.

## 1. Install CircuitKit

You need Node.js 20 or newer. From your project:

```sh
npm install circuitkit
```

Using Bun? Run `bun add circuitkit` and replace `npx circuitkit` below with `bunx circuitkit`. You can also run `npx circuitkit@latest` without adding a project dependency. There is no global installation step.

## 2. Save this as sensor.ck

Each module lists its public ports. A connection names both endpoints; you do not place boxes or route wires by hand.

```circuitkit
circuit sensor v1
title "Sensor signal connections"
view wiring

Controller: controller (SDA SCL)
Sensor: sensor (SDA SCL)

bus I2C {
  Controller.SDA <-> Sensor.SDA "Data"
  Controller.SCL -> Sensor.SCL "Clock"
}
```

`<->` describes bidirectional functional intent. `->` describes a declared direction. Neither is measured current. The bus groups two signals; it does not short them together.

## 3. Check the source

```sh
npx circuitkit validate sensor.ck --json
```

Success has `ok: true`. On failure, read `diagnostics`: it points to the source range and explains what to fix. For example, a misspelled port must be corrected, not silently added to the hardware.

## 4. Render and open the image

```sh
npx circuitkit render sensor.ck --out sensor.svg --json
npx circuitkit render sensor.ck --format png --scale 2 --out sensor.png --json
```

The first command creates an SVG; the second creates a PNG at 2× scale. The JSON result reports the absolute `output` path. Open the file in your editor, browser or agent image viewer. Keep `sensor.ck` beside it so the diagram remains editable.

Output files must not already exist. Choose a new name, or deliberately add `--overwrite` when you intend to replace your previous output. Invalid source never replaces an existing image.

## 5. Try another view

```sh
npx circuitkit render sensor.ck --view blocks --out blocks.svg --json
npx circuitkit render sensor.ck --view schematic --out schematic.svg --json
```

These commands change the drawing, not your source connections. [Choose the right view](/docs/views) explains what each one does. For browser editing and live previews, use the [playground](/editor?mode=circuitkit).

## Next steps

- [Use your coding agent](/docs/core) to create and show diagrams from a prompt.
- [Learn the language](/docs/language) for power links, nested systems and reusable modules.
- [Add an explanation](/docs/presentation) with sections and scenes.
- [Use the API](/docs/api) inside your own app or build.
