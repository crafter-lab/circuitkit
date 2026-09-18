# Choose the right view

A view answers a different question about the same declared connections. You do not need three separate source files.

## Blocks: what connects to what?

Use blocks for an architecture overview. Modules stay visible, related bus connections can be grouped, and individual pins are less prominent.

```sh
npx circuitkit render sensor.ck --view blocks --out blocks.svg
```

Choose this when explaining the parts of a system before discussing exact wiring. Aggregated bus routes do not imply a continuous path for every individual conductor, so some flow scenes may be unavailable.

## Wiring: which port goes where?

Use wiring when pin names matter. It shows direct port-to-port connections and automatically routed cables. This is the default view.

```sh
npx circuitkit render sensor.ck --view wiring --out wiring.svg
```

Choose this for module hookups and signal tracing. It is a logical wiring diagram, not a verified physical board layout. Do not infer cable length, connector orientation or real board pin locations from it.

## Schematic: explain it with circuit notation

Use schematic for module references, signal wires and named supply/ground symbols. It remains a modular drawing; it does not invent a transistor-level circuit inside an opaque board.

```sh
npx circuitkit render sensor.ck --view schematic --out schematic.svg
```

Power and ground must be authored explicitly. Speaker minus is not automatically ground. A schematic does not certify that a module's supply is safe or that a board can provide a stated output voltage.

## Scope is separate from view

For a large declared system, select one assembly with `--scope audio` or show public interfaces with `--detail interface`. These choose which part of the system is drawn. `--view` chooses how it is drawn.

The whole resolved system stays available through inspect/expand. An external interface marker represents an omitted boundary, not extra hardware. See [the language guide](/docs/language).

## Try the same example three ways

Open [the audio signal path](/editor?mode=circuitkit&example=audio-story) and switch between Blocks, Wiring and Schematic. The source and connectivity stay the same.
