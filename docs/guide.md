# CircuitKit guide

Local, deterministic circuit SVGs from one versioned JSON document. The same renderer serves the CLI, Next.js editor, and optional React adapter. No account, backend, or generation service.

CircuitKit is Apache-2.0 licensed. The public npm package is `circuitkit`, the CLI bin is `circuitkit`, and the optional React export is `circuitkit/react`. For new module diagrams start with `circuitkit skills get core --text`; this guide primarily documents the compatible legacy JSON recipes.

Nine role-based topologies are supported: RC low-pass, unloaded and loaded dividers, LED series, two-stage RC ladder, Wheatstone bridge, filtered bridge rectifier, NPN low-side switch and inverting op-amp. Authors choose IDs, SI values, presentation, and focus, not coordinates. These are curated graphs, not an arbitrary autorouter or device simulator.

## Install package

Node.js 20 or newer:

```sh
npm install circuitkit
npx circuitkit --version
npx circuitkit skills get core --text
```

Bun projects can use `bun add circuitkit` and `bunx circuitkit`. Run `npx --yes circuitkit@latest` without a project install when appropriate. No global installation is required. The repository uses Bun for development; see Local development below.

## Install skill

From your project:

```sh
bunx skills add crafter-lab/circuitkit --skill circuitkit
```

Choose your agent when prompted. This is project-scoped without `--global`. Append `--list` to inspect available skills without installing. The [public skill](https://github.com/crafter-lab/circuitkit/blob/main/skills/circuitkit/SKILL.md) is a discovery stub: it explains how to obtain the CLI and read `circuitkit skills get core --text`. Operational instructions ship with the installed CLI version rather than a separately updated prompt.

## Gallery and stress tests

Open `/gallery` on the local playground. The complex circuits appear first, before repeated variants. Search and combine topology/theme/category filters, open a full-size figure, inspect its electrical nets and pin membership, download JSON/SVG or continue in the editor. Expected-error cases explicitly show structured rejection and never offer an invalid SVG.

The current corpus contains 816 cases across 272 scenarios and nine distinct topologies, not 816 different circuits. The browser's **Run stress test** button uses a cancellable worker; reports distinguish expected rejections from unexpected failures and preserve failing inputs. The terminal runs the same corpus:

```sh
bun scripts/stress.ts
```

The deterministic stress suite includes systematic endpoint moves, shorts, splits, disconnected branches and semiconductor pin swaps, E12/IEEE754 sweeps, input immutability, determinism, emitted-wire continuity, false junctions and highlight invariance. It reports actual case totals and observed timing, not a performance guarantee. See [complex circuit contracts](complex-circuits.md), [corpus specification](stress-corpus.md) and [testing and verification](testing.md).

## Local development

Install Bun, then clone the public source repository and build locally:

```sh
git clone https://github.com/crafter-lab/circuitkit.git
cd circuitkit
bun install
bun run build
bun run dev
```

For an existing source checkout, skip cloning and run the three Bun commands from its root. The lockfile uses public npm URLs with pinned versions and integrity hashes. Dependency installation may need network access or a populated package cache; rendering does not.

Open http://127.0.0.1:3000 for the landing page, then `/editor` for the actual editor. `/gallery` and `/lesson` retain their existing workflows. Gallery links use `/editor?case=...`; legacy `/?case=...` links still open the same editor. The development server binds to loopback. The repository includes local Geist font resources and their licenses. Neither the SVG renderer nor the web app downloads Google Fonts.

```sh
bun run typecheck
bun test tests/editor.test.ts tests/react.test.tsx
bun run test
bun run build:web
bun run start
```

`build` builds the library and CLI in `dist`; `build:web` builds the Next.js web app. `start` serves the production app after `build:web`. Do not treat a successful library build as proof that the browser app or a packed consumer has been verified. See [testing](testing.md) for focused core, stress, package, and opt-in browser checks.

## First figure through the CLI

After `bun run build`, invoke the exact local CLI path:

```sh
bun dist/cli.js --help
bun dist/cli.js schema --json
bun dist/cli.js catalog --json
bun dist/cli.js validate examples/rc-lowpass.json --json
bun dist/cli.js inspect examples/rc-lowpass.json --json
bun dist/cli.js render examples/rc-lowpass.json --schematic --out rc.svg --json
```

To create a local package artifact after building:

```sh
mkdir -p artifacts
bun pm pack --destination artifacts
```

For version 0.1.0, this produces `artifacts/circuitkit-0.1.0.tgz`. Copy it into a consumer project and install that file, not a registry package:

```sh
bun add ./circuitkit-0.1.0.tgz
./node_modules/.bin/circuitkit --help
./node_modules/.bin/circuitkit render figure.json --out figure.svg --json
```

Inside a package script, `circuitkit` resolves through the package manager's bin PATH. Do not assume the command is globally installed. No registry publication is required. The [CLI contract](cli-contract.md) covers the machine-readable interface.

### Machine interface and file safety

Commands are `schema`, `catalog`, `validate`, `inspect`, `render`, and `markdown`. Schema and catalog take no document. Validate, inspect and render accept one JSON file path or `-` for piped stdin; `--block` explicitly selects Markdown input, while the `markdown` command processes all fences:

```sh
cat examples/rc-lowpass.json | bun dist/cli.js render - --json
bun dist/cli.js render examples/rc-lowpass.json --out rc.svg --overwrite --json
```

`--json` emits one complete JSON object on stdout, with no progress text. Non-TTY stdout uses JSON automatically. Exit `0` means success, `1` means invalid JSON/document, and `2` means usage or IO failure. Check the exit status and `ok`, not just whether stdout has content. `render` without `--out` returns SVG in its result without writing a file. `inspect` reports normalized graph, roles, and measured bounds.

Output parent directories must already exist. Existing files are not replaced without explicit `--overwrite`. The CLI renders successfully before writing a neighboring temporary file and publishing it atomically. Invalid input does not alter an old destination. There are no prompts. `--` ends flag parsing for input names beginning with a dash. A browser download delegates destination naming and overwrite behavior to the browser, not the CLI's file guarantees.

Diagnostics include `code`, JSON Pointer `path`, `message`, and, where useful, `validPins`:

```json
{
  "ok": false,
  "diagnostics": [
    {
      "code": "circuit.unknown_pin",
      "path": "/circuit/nets/input/1",
      "message": "Unknown pin R1.c.",
      "validPins": ["a", "b"]
    }
  ]
}
```

To practice recovery, copy `examples/rc-lowpass.json`, replace `R1.a` in its input net with `R1.c`, and run `validate`. Read the diagnostic, restore `R1.a`, then validate, inspect, and render again. Diagnostic wording may vary; use structured codes and paths for automation.

## Document and SI units

The TypeScript input and JSON representation are the same `FigureDocument`:

```json
{
  "version": 1,
  "circuit": {
    "components": {
      "R1": { "type": "resistor", "resistance": 10000 },
      "C1": { "type": "capacitor", "capacitance": 1e-7 }
    },
    "ports": {
      "VIN": { "kind": "terminal" },
      "VOUT": { "kind": "terminal" },
      "GND": { "kind": "ground" }
    },
    "nets": {
      "input": ["VIN", "R1.a"],
      "output": ["R1.b", "C1.a", "VOUT"],
      "ground": ["C1.b", "GND"]
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
    "title": "Filtro RC",
    "theme": { "preset": "geist-light" },
    "highlight": { "components": [], "nets": ["output"] }
  }
}
```

Electrical values are finite, strictly positive numbers: `resistance` in ohms, `capacitance` in farads, and DC-source `voltage` in volts. `10000` means 10 kΩ; `1e-7` means 100 nF. Strings such as `"10k"` and `"100 nF"`, zero, negative values, NaN, and infinity are not valid SI parameters. There is no free-form unit/expression parser.

Components and ports have author-owned IDs. A dot is reserved for `componentId.pin`. Resistors and capacitors have `a` / `b`; LEDs have `anode` / `cathode`; DC sources have `positive` / `negative`. A port endpoint is its bare ID. Each endpoint belongs to exactly one net, each net has at least two endpoints, and all declared elements must be covered by the selected recipe. Net names are not hardcoded; graph checks resolve layout roles to IDs. Coordinates and proximity never imply connectivity.

### Recipes and examples

| Recipe | Editable components | Required roles | Derived annotation |
| --- | --- | --- | --- |
| `rc-lowpass` | Resistor, capacitor | `series`, `shunt`, `input`, `output`, `ground` | `fc = 1/(2πRC)`, ideal RC model |
| `voltage-divider` | Two resistors | `top`, `bottom`, `input`, `output`, `ground` | `VOUT/VIN = Rbottom/(Rtop+Rbottom)`, unloaded |
| `led-series` | DC source, resistor, LED | `supply`, `resistor`, `led`, `ground` | No LED drop or current assumed |
| `loaded-divider` | Three resistors | `top`, `bottom`, `load`, `input`, `output`, `ground` | Explicit parallel load formula |
| `rc-ladder` | Two resistors, two capacitors | `first`, `firstShunt`, `second`, `secondShunt`, `input`, `output`, `ground` | Coupled ideal transfer, not independent poles |
| `wheatstone-bridge` | Four resistors | `upperLeft`, `lowerLeft`, `upperRight`, `lowerRight`, `input`, `outputLeft`, `outputRight`, `ground` | Unloaded differential bridge formula |
| `bridge-rectifier` | Four diodes, resistor, capacitor | `positiveA`, `positiveB`, `negativeA`, `negativeB`, `load`, `filter`, `inputA`, `inputB`, `output`, `ground` | Topology only; no ripple/diode-drop estimate |
| `transistor-switch` | Source, two resistors, LED, NPN | `supply`, `baseResistor`, `series`, `led`, `switch`, `control`, `ground` | Low-side topology; no gain/saturation estimate |
| `inverting-amplifier` | Two resistors, op-amp | `inputResistor`, `feedback`, `amplifier`, `input`, `output`, `positiveSupply`, `negativeSupply`, `ground` | Ideal negative-feedback gain formula |

Every recipe has `examples/<recipe>.json`. Diode pins are `anode/cathode`, NPN pins `base/collector/emitter`, and op-amp pins `noninverting/inverting/output/vplus/vminus`. These semiconductor components are type-only; no physical device parameters are invented.

Canonical examples are `examples/rc-lowpass.json`, `examples/voltage-divider.json`, and `examples/led-series.json`. The divider uses two 10 kΩ resistors, giving 0.5. The LED example's 5 V and 330 Ω are drawing values, not an electrically validated design for an unspecified LED.

`schema --json` / `getSchema()` expose the runtime schema. `catalog --json` / `getCatalog()` expose recipes, role requirements, graph endpoint sets, pins, units, themes, and limitations. Use them rather than inventing component types or arbitrary topology.

### Presentation

Presets are `geist-light`, `geist-dark`, and `geist-print`. Optional `presentation.theme.overrides` accepts opaque `#RGB` or `#RRGGBB` values for `background`, `wire`, `label`, `muted`, `border`, and `highlight`, plus finite positive `strokeWidth` and `fontScale` numbers. No CSS, URLs, HTML, or arbitrary fonts are accepted as theme values. The core renderer owns defaults, contrast checks, measurements, and collision diagnostics; overrides are not guaranteed to fit just because their types are valid.

`presentation.highlight` contains arrays of existing component and net IDs. Focus changes styling and the accessible description, not connectivity or layout geometry. Print focus has non-color emphasis. Clear both arrays to remove focus. IEC rectangular resistors are the only convention in the MVP.

## TypeScript and React

```ts
import { defineFigure, loadExample, renderSchematicSVG } from "circuitkit";

const document = defineFigure(loadExample("rc-lowpass"));
const result = renderSchematicSVG(document);

if (result.ok) {
  await Bun.write("figure.svg", result.svg);
} else {
  console.error(result.diagnostics);
}
```

Core accepts unknown runtime input. Successful rendering returns `ok: true`, `svg`, normalized `document` and `circuit`, `bounds`, `rendererVersion`, and `diagnostics`. Failure returns `ok: false` and `diagnostics`, without `svg`. Core does not require React, a DOM, filesystem access, or network access. The direct `Bun.write` example is caller-owned IO and does not inherit the CLI's no-overwrite guarantee.

```tsx
"use client";

import { CircuitSchematic } from "circuitkit/react";
import type { FigureDocument } from "circuitkit";

export function Lesson({ document }: { document: FigureDocument }) {
  return (
    <CircuitSchematic
      document={document}
      className="lesson-figure"
      onDiagnostics={(diagnostics) => console.log(diagnostics)}
    />
  );
}
```

The React 19 adapter accepts `document: FigureDocument | unknown`, optional `className`, and optional typed `onDiagnostics`. The host owns the document and must supply a new immutable object for edits. Rendering is memoized by document identity; the adapter keeps no second editable circuit. It inserts the exact core SVG without reconstructing paths or rewriting accessibility IDs. Invalid props remove the SVG and report diagnostics through the callback; the legacy `CircuitFigure` also renders a readable alert. The callback runs after commit, including empty diagnostics after recovery, not during server rendering. Use a stable callback for hosts that store diagnostics in state.

`renderSchematicSVG` and `CircuitSchematic` render only the circuit, without a visible framing title, footer, caption, legend, or the space reserved for them. Accessible SVG metadata remains. The source document retains its teaching content for later editing. Use `renderSVG` / `CircuitFigure` for the legacy diagram presentation and `renderFigureSVG` for a complete lesson export.

Size the wrapper or its direct SVG with host CSS if needed. Do not override SVG internals to create a second theme system. Figure typography is embedded as paths, independent of the surrounding UI font.

The standalone [React consumer template](../examples/react-consumer/README.md) is designed for a clean temporary directory and a local tarball. It imports only the package React export, controls value/theme/focus, and demonstrates errors. Replace its artifact dependency placeholder with the final tarball path before installing outside this repository.

## Annotated lesson figures

Open `/lesson` for the local two-figure teaching pilot. Labels A/B/C identify complete electrical nets, not individual junction dots. The second figure explains why an op-amp summing node is not wired to ground.

Add optional `presentation.annotations` to the same document:

```json
{
  "nets": [
    { "net": "input", "label": "A", "description": "VIN to R1.a", "tone": "blue" },
    { "net": "output", "label": "B", "description": "R1.b, R2.a and VOUT share one node", "tone": "amber" },
    { "net": "ground", "label": "C", "description": "R2.b to GND", "tone": "violet" }
  ],
  "legend": true,
  "caption": "Components separate the labelled conductors."
}
```

The six explicit tones are blue, amber, violet, green, rose and cyan. Colors resolve per theme; print uses labels and emphasis rather than color alone. Annotation IDs must reference existing nets; duplicate net IDs/labels, missing glyphs, low contrast and unplaceable labels are diagnosed. Array order is preserved for the legend. Plain text is never interpreted as HTML or LaTeX.

```tsx
"use client";

import { useState } from "react";
import { CircuitLessonFigure } from "circuitkit/react";
import type { FigureDocument } from "circuitkit";

export function ExplainedCircuit({ document }: { document: FigureDocument }) {
  const [activeNet, setActiveNet] = useState<string | null>(null);
  return (
    <CircuitLessonFigure
      document={document}
      activeNet={activeNet}
      onActiveNetChange={setActiveNet}
      download
    />
  );
}
```

`CircuitLessonFigure` defaults to compact interaction. Set `layout="expanded"` explicitly for the full lesson chrome. Keep downloads opt-in with `download`; the landing uses neither a download nor the expanded layout. Its default preview is `CircuitSchematic`, with an explicit Interactive switch and one external editor link that preserves saved selection and theme through the share codec, not hover/focus previews.

The host owns selection. Hover/keyboard focus previews a net, leaving saved selection unchanged; click/Enter/tap requests selection through the callback. Escape and Show all request null. Without a callback the figure is explicitly read-only; without `activeNet`, it reads document highlight state. For `legend: false`, the host should provide its own keyboard selection controls. Multiple instances have independent IDs and state.

`renderSVG(document)` still returns the diagram, now with optional colored conductors and inline labels. Its successful result carries resolved annotation metadata shared by the React legend. `renderFigureSVG(document)` returns the complete autonomous SVG with measured legend/caption paths. The wrapper download uses the persisted selection, never temporary hover. HTML legend typography can inherit the host font; exported SVG typography remains pinned Geist paths. Documents without annotations retain their original diagram bytes.

```sh
bun dist/cli.js render examples/lesson-divider.json --figure --out lesson.svg --json
```

`--figure` is render-only and retains the same no-overwrite and invalid-input protections. The lesson uses VIN/VOUT/GND ports; it does not silently add a voltage-source symbol or simulate current.

## Editor workflow

Open `/editor`, choose a registered topology or open a gallery case, edit a nonempty title and positive SI values, choose a theme, optionally override accent/stroke/font scale, and focus component or net IDs. Reset restores numeric preset defaults; Clear focus removes all focus. Document controls can be collapsed and the narrow-screen figure can scroll horizontally instead of shrinking labels illegibly.

The JSON textarea is controlled. Every text change immediately removes the previous preview and disables Copy JSON / Download SVG, even before Apply JSON. Apply parses and validates that exact draft; invalid text remains editable. Invalid or empty form fields also block preview and export until corrected. An invalid numeric form draft is retained separately from its last valid JSON number; applying JSON explicitly discards those form drafts. Choosing an example explicitly replaces the draft.

Download uses the actual current render result, and copy serializes its normalized document. Clipboard denial or unavailability is shown visibly with a manual-copy fallback message. Do not interpret a requested browser download as proof that the browser saved the file.

## Share, Markdown and PNG

The editor now authors net annotations and explanation steps, copies editable links and safe Markdown fences, and exports the complete SVG or PNG. Each exported figure includes its legend, caption and active-step explanation. The site theme never rewrites the authored figure theme. PNG scale is a local export option, 1 through 4, with a 16-megapixel cap. Clipboard denial falls back to a PNG download; browser download destinations remain browser-owned.

Share URLs use `/editor#v=1&doc=...`, contain the complete document, and are limited to 16 KiB. They are not encrypted, stored remotely or usable as circuit-specific social previews by themselves. Invalid links show diagnostics instead of a fallback figure. The editor pauses preview and export during initial fragment inspection and whenever source or controls are invalid.

Open `/markdown` to validate all `circuitkit` JSON fences and preview their full figures. The editor also accepts Markdown imports, requiring an explicit choice when there is more than one valid block. All blocks must validate. Limits are 1 MiB of Markdown, 32 blocks, 64 KiB per JSON block and 64 nesting levels. Prose, HTML and executable code are never rendered or executed by this adapter. A reader without CircuitKit support should use pre-rendered images instead of expecting a custom fence to render itself.

```sh
circuitkit render figure.json --schematic --format png --scale 2 --out figure.png --json
circuitkit markdown lesson.md --json
circuitkit render lesson.md --block 1 --figure --format png --out lesson.png --json
```

PNG requires `--out`; the JSON receipt contains the path, byte count and pixel dimensions, never raw binary. SVG remains the default format. The same atomic no-overwrite rules apply to both. `--block` uses one-based indexes and validates every Markdown block before selecting one.

The package exposes separate entry points so a browser consumer does not import native PNG bindings:

```ts
import { renderPNG } from "circuitkit/png";
import { parseCircuitMarkdown, renderCircuitMarkdown } from "circuitkit/markdown";
import { encodeShareDocument, decodeShareDocument } from "circuitkit/share";

const image = await renderPNG(document, { schematic: true, scale: 2 });
const figures = renderCircuitMarkdown(markdownSource);
const share = encodeShareDocument(document);
```

Use `{ schematic: true }` / `--schematic` for circuit-only PNG or SVG output. Use `{ figure: true }` / `--figure` explicitly for a complete lesson export instead.

`renderPNG` runs on Node/Bun and returns PNG bytes only after checking output dimensions. It uses resvg-js with system font discovery disabled; SVG text is already embedded as paths. It is not the browser Canvas implementation. Cross-platform binary availability must be qualified on the target platform.

## Authored explanation steps

Optional `presentation.steps` contains at most 32 ordered entries with `id`, `title`, `description`, and `highlight: { components, nets }`. References must exist in the same circuit. Optional `presentation.activeStep` selects an existing ID. Omitting it restores the normal authored highlight. Neither steps nor selection change connectivity or component values.

```tsx
import { CircuitLessonSequence } from "circuitkit/react";
import type { FigureDocument } from "circuitkit";

export function StepByStep({ document }: { document: FigureDocument }) {
  return <CircuitLessonSequence document={document} download />;
}
```

The component supports Previous, Next, direct step selection and Show all, without timers or inferred current animation. For a host that persists progress across document changes, supply `activeStep` and `onActiveStepChange`; the callback receives both the ID (or null) and the canonical selected document to save/share. Invalid step rendering retains recovery controls. The `/lesson` page includes three optional sequences covering a divider, an RC filter and op-amp feedback, while retaining the original node-selection demonstrations. These examples are not a claim of deployment inside Gradual.

## Guarantees and boundaries

- With a fixed renderer version, resources, and normalized document, rendering is deterministic, without timestamps or random IDs. CLI, React, and the playground share the renderer.
- SVGs are standalone, with local-font glyph paths, a viewBox, accessible title/description, and a stable aria-label. Text is not selectable/editable as SVG text; keep JSON as the editable source.
- Validation covers schema, endpoint membership, exact recipe topology, presentation references, and the renderer's supported contrast, glyph, and measured-layout checks. Missing glyphs and unsupported layouts are errors, not silently substituted drawings.
- Text and metadata are escaped, and symbols/styles come from a constrained contract. Documents are data, not executable scripts. This is not a general-purpose HTML sanitizer or hostile-code sandbox.
- No arbitrary circuits, autorouting, draggable wiring, simulation, current animation, ANSI resistor option, remote collaboration, account system, backend, or deployment requirement.
- Successful validation is not proof of electrical safety, physical performance, fabrication readiness, or suitability for a real LED. Visual and accessibility review still require inspecting actual output; passing tests alone is not aesthetic acceptance.

## License and distribution

CircuitKit source code is licensed under [Apache-2.0](../LICENSE); see [NOTICE](../NOTICE) and [third-party licenses](../THIRD_PARTY_LICENSES.md). Bundled Geist fonts and their derived outlines retain the upstream SIL Open Font License in [fonts/OFL.txt](../fonts/OFL.txt), with [fonts/LICENSE.txt](../fonts/LICENSE.txt) also included. Third-party dependencies retain their own licenses.

The public npm package and Apache-2.0 source are both named CircuitKit. Source lives at https://github.com/crafter-lab/circuitkit. Releases are qualified as packed Node consumers before publication; local builds and tarballs remain useful for development.
