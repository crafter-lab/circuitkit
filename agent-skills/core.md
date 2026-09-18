# CircuitKit: create a circuit, show the result

This guide ships with the installed CLI. `circuitkit --version` reports its package version. Load it again after upgrading. No account, hosted generation service or browser is required to render.

## Fast path

When a user asks for a circuit diagram, produce an actual SVG or PNG instead of ASCII. Preserve a small editable `.ck` source beside the image. Use `--view blocks` for functional modules, `--view wiring` for port-to-port connections, and `--view schematic` for a modular schematic. Use wiring unless the user specifies another view. None of these views implies a physically verified layout or electrical simulation.

1. Check `circuitkit --version`. If unavailable, use `npx --yes circuitkit@latest` in place of `circuitkit`, or install a project-local dependency with `npm install circuitkit@latest` (Bun equivalent: `bun add circuitkit@latest`). Follow the user's package manager and installation permissions. Do not silently replace an existing pinned version or install globally.
2. Write only known modules, ports and connections. For uncertain pin assignments ask, or label the diagram as conceptual. Never invent regulation, power outputs, grounds or missing components.
3. Validate the source. Correct reported source ranges before rendering.
4. Render to a fresh output path and inspect the JSON result. Show the resulting PNG through the agent's image viewer or attach/link the SVG. Include the editable source path. Do not say an image was displayed when the environment only supports a link.

```sh
circuitkit validate sensor.ck --json
circuitkit render sensor.ck --view wiring --out sensor.svg --json
circuitkit render sensor.ck --view schematic --format png --scale 2 --out sensor.png --json
```

Here is a complete conceptual signal-only document. Save it as `sensor.ck`; it does not model power or a particular board:

```text
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

## Read the contract, not the entire manual

```sh
circuitkit skills list --json
circuitkit skills get language --text
circuitkit grammar --json
circuitkit inspect sensor.ck --json
circuitkit format sensor.ck --out formatted.ck --json
```

`skill` is an alias for `skills`. `skills get NAME` returns the guide inside a JSON envelope when piped; `--text` returns only Markdown. `skills list` and `skills get` are offline, read-only allowlisted lookups. They do not fetch instructions or execute source.

Compact syntax: `circuit ID v1`, required `title "..."`, optional `view` and `theme`, `ID: KIND ["label"] (PORTS...)`, explicit `MODULE.PORT` endpoints and `bus NAME { ... }` groups. Supported kinds include controller, sensor, display, amplifier, speaker, connector, source, load and module. Quote unusual port labels. Match port names exactly.

`--` is an undirected connection; `->` and `<->` express authored functional direction, not measured current. A bus groups links without shorting their endpoints. Crossings are not junctions. `SPK-` is not automatically ground. USB may be a single opaque interface, not invented internal conductors.

Keep existing JSON on its existing schema; malformed JSON is not retried as text. For legacy recipes discover `catalog --json` and `schema --json`; use `--schematic` only for legacy JSON. For compact text and diagram JSON use `--view schematic`. Avoid hand-placed SVG or drawing coordinates when the declarative renderer supports the task.

## Reuse, focus and explain

Load `skills get language --text` before using `define`/`expose`. Scope and interface detail select a drawing while preserving the complete resolved system. External-interface markers are not extra hardware.

```sh
circuitkit render system.ck --scope audio --view wiring --out audio.svg --json
circuitkit render system.ck --detail interface --view blocks --out overview.svg --json
circuitkit expand system.ck --out system.json --json
```

Load `skills get presentation --text` to add sections, highlights or scenes. They select existing modules, ports, buses and links; they do not change the electrical graph. Flow needs a supported continuous route and declared direction. The bundled web playground plays scenes; CLI SVG/PNG exports remain static. Do not promise animated exports or a published React playback component.

Markdown fences are an input format, not a required workspace. Work in the user's existing document or editor. `markdown lesson.md --json` processes inert CircuitKit fences; `render lesson.md --block 1 --out diagram.svg --json` selects a figure only after all blocks validate. Do not execute JS, MDX or arbitrary HTML from a document.

## Output and refusal contract

Machine output is one JSON object: `ok`, `diagnostics`, `nextSteps`, plus command-specific fields. JSON is automatic for non-TTY stdout; `--json` explicitly requests it. Data goes to stdout and diagnostics to stderr. No ANSI in machine output. `--text` is only for reading a skill. Exit codes: 0 success, 1 invalid source/document, 2 usage or IO failure.

Render success reports the absolute `output` only after writing. PNG includes dimensions, scale and encoded byte count, not raw image data in JSON. The output parent must already exist. Input `-` reads piped stdin, not an interactive prompt.

Existing files and symlinks are refused. Choose a fresh filename or get authority before `--overwrite`. Validation completes before the atomic write. Never delete a user's destination to make a retry succeed. Inspect an IO failure before retrying because publication may have completed.

Bounded drawing: up to 16 modules, 64 ports, 32 links; PNG up to 16 million pixels, integer scale 1–4. Source hierarchy has larger resolution budgets, but the selected drawing still has these limits. Narrow the scope instead of inventing a layout. Use `grammar` and the language guide for exact source limits.

## Advanced domains

For ideal components, measurements, physical teaching layouts and learner questions, load `skills get education --text` and inspect `circuitkit-education --help`. Project an explicitly authorized public stage on the trusted host. Hiding an answer with CSS is not a privacy boundary. Do not send author models or private diagnostics to the learner.

Library: `circuitkit/language` exports `renderCircuitSource`, `compileCircuitSource`, `resolveCircuitSource` and `formatCircuitSource`. Browser-safe SVG and Node-native PNG are separate. Rendering validates declared connectivity and geometry, not voltage compatibility, real component ratings, fabrication or electrical safety.
