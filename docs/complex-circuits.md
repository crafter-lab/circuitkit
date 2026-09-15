# Curated complex circuits

Six additional graph families extend the original three recipes. These are different electrical graphs, not component-value or theme variants. Document version remains 1; no public package version is changed.

The shared renderer calls `createComplexScene`, respects its measured frame and emits accessible SVG for registered topologies. These contracts describe the integrated implementation, not a pending integration checkpoint. See [testing](testing.md) for reproducible checks and the distinction between deterministic tests and browser verification.

| Recipe | Components | Nets | Endpoints, including ports | Frame |
| --- | ---: | ---: | ---: | --- |
| `loaded-divider` | 3 | 3 | 9 | 1400 × 1000 |
| `rc-ladder` | 4 | 4 | 11 | 1400 × 1000 |
| `wheatstone-bridge` | 4 | 4 | 12 | 1400 × 1100 |
| `bridge-rectifier` | 6 | 4 | 16 | 1700 × 1120 |
| `transistor-switch` | 5 | 6 | 13 | 1500 × 1200 |
| `inverting-amplifier` | 3 | 6 | 14 | 1600 × 1200 |

Every family has one example at `examples/<recipe>.json`. `basicRecipeIds` contains the original three, `complexRecipeIds` contains the six above, and `recipeIds` contains all nine. `loadExample` returns independent validated-schema copies for all nine. Exact electrical topology is checked by the existing generic `validateDocument`, not by a second family-specific validator.

## Electrical mechanisms

### Loaded divider

`top` feeds an output branch containing `bottom` and `load` in parallel. The output terminal connects to that actual branch, and both lower pins share the ground rail. This is a three-resistor loaded divider, not the original unloaded divider with a new label.

`VOUT/VIN = (Rbottom || Rload)/(Rtop + (Rbottom || Rload))`.

The example uses three 10 kΩ resistors, so its ideal loaded ratio is 1/3 rather than 1/2. The figure shows the general formula; it does not simulate a source or downstream circuitry.

### Unbuffered RC ladder

`first` and `second` are series resistors. `firstShunt` connects the intermediate node to ground, and `secondShunt` connects the output to the same ground. Each stage has an explicit branch dot.

For an ideal voltage source and unloaded output:

`H(s) = 1/[1 + s(R1 C1 + R1 C2 + R2 C2) + s² R1 R2 C1 C2]`.

Here R1/C1 are `first`/`firstShunt`, and R2/C2 are `second`/`secondShunt`. The second stage loads the first. There is no claim that multiplying two independent first-order cutoff responses describes this network.

### Wheatstone bridge

Four resistor arms form two dividers sharing excitation and ground. The midpoint ports are distinct nets, drawn outward on opposite sides with no connecting wire, meter or implicit bridge load.

`VLEFT - VRIGHT = VIN [R2/(R1+R2) - R4/(R3+R4)]`.

R1/R2 denote `upperLeft`/`lowerLeft`; R3/R4 denote `upperRight`/`lowerRight`. The formula assumes unloaded differential outputs. The example's right lower arm is 1.2 kΩ, so it is deliberately unbalanced.

### Full-wave bridge rectifier

The four diode roles are `positiveA`, `positiveB`, `negativeA`, `negativeB`. Two vertical columns show the complete bridge without cross-net wire crossings. The cathode bars face upward toward the positive rail:

- A joins `positiveA.anode` and `negativeA.cathode`.
- B joins `positiveB.anode` and `negativeB.cathode`.
- VDC joins both positive diode cathodes, the load's upper pin and the filter's upper pin.
- GND joins both negative diode anodes and both lower load/filter pins.

With A positive relative to B, the conduction path is A → positiveA → load/filter → negativeB → B. For B positive, it is B → positiveB → load/filter → negativeA → A. These describe topology, not simulated conduction. No source amplitude, diode forward drop, ripple or capacitor rating is assumed. The generic capacitor is nonpolarized in the data model. A/B are external AC terminals, not a falsely modeled DC source.

### NPN low-side LED switch

A DC source feeds `series`, then the LED anode. The LED cathode connects to the NPN collector. The emitter returns to the source negative terminal and the shared ground. The independent control terminal feeds the base through `baseResistor`.

The NPN symbol has a base bar, separate collector/emitter branches and an outward emitter arrow. The LED has a cathode bar and outward light arrows. `npn` is type-only: there is no assumed beta, base-emitter voltage, saturation voltage, LED current or switching behavior. This is not a physically verified design.

### Inverting op-amp

`inputResistor` connects the input terminal to the inverting summing node. `feedback` returns from output to that same node along a separate upper loop. The noninverting pin alone connects to ground. The plus/minus input signs are part of the symbol; both supply pins have explicit external supply terminals.

`VOUT/VIN = -Rfeedback/Rin` applies only to ideal linear negative feedback with sufficient supply headroom. The summing node is not electrically joined to ground: “virtual ground” is an ideal-model condition, not a wire. Supply voltages, finite gain, bandwidth, clipping, current limits and stability are not simulated. `op-amp` is type-only, so the schema does not invent gain or supply-value parameters.

## Schema and role resolution

New components are strict objects containing only `type`:

| Type | Pins |
| --- | --- |
| `diode` | `anode`, `cathode` |
| `npn` | `base`, `collector`, `emitter` |
| `op-amp` | `noninverting`, `inverting`, `output`, `vplus`, `vminus` |

Existing resistor, capacitor, LED and DC-source definitions are unchanged. `getCatalog()` exposes each pin list and empty parameter maps for type-only devices. The runtime figure schema carries `x-component-pins` metadata, so `getSchema()` remains exactly `z.toJSONSchema(figureSchema)` while including those pin names.

`complex-recipes.ts` contains the role types and exact role-relative endpoint sets imported by the catalog. IDs and net names are author-selected, including prototype-like strings. Scene construction resolves roles to document IDs and resolves every endpoint's net from document membership. No routing depends on example IDs such as R1, Q1 or U1. Every declared component pin and every port has exactly one coordinate and the document's actual net name in `scene.endpoints`.

Reversing any bridge diode, the LED, collector/emitter, op-amp inputs or op-amp supplies changes the exact graph and is rejected. Extra parameters, unknown pins, duplicate membership and arbitrary added topology retain the existing generic validation behavior.

## Scene integration boundary

`src/complex-scenes.ts` exports:

```ts
createComplexScene(
  document: FigureDocument,
  formatSI: (value: number, unit: string) => string,
): Scene | null
```

The caller validates the document first and invokes this function before legacy layout. It returns `null` for the original recipes. Import the shared `Scene` type from `src/scene.ts`; the module never imports the renderer and never emits SVG markup or CSS. Passing the formatter avoids a renderer import cycle.

Each complex scene supplies `frame`, all symbol bounds, all labels, all routes, terminals, dots and endpoints. Header baselines remain 82 and 115 with the existing font sizes; `headerBottom` is 144. The header text region is x64 through width−64 and y36 through 130. `footerTop` is height−110; footer baselines are footerTop+45 and footerTop+76, inside the common footer region. The explicit scene region ends 24 pixels above the footer divider.

The common renderer remains responsible for full text/glyph measurement, symbol/route bounds, theme resolution, maximum-highlight stroke width, diagnostics, escaping, dynamic glyph metadata and original-format SVG output. Bounds are not omitted to hide collisions. Symbol paths contain only static operations and internally computed numeric coordinates, never document IDs, markup or style input. Long titles/IDs and extreme theme overrides must continue to fail common measured-fit checks rather than silently shrink or clip.

Routes are curated orthogonal polylines. Every same-net branch has an explicit junction dot; the rectifier's four-way ground junction includes an explicit route vertex. The current six layouts avoid cross-net wire crossings entirely. Symbols remain electrical boundaries: a resistor's two pins must not be joined by an extra wire segment. Inspection or conceptual relationship edges must be derived from document data, never added as invisible or decorative electrical connections. No arbitrary autorouter is introduced.

## Verification

The dedicated tests include all nine recipes across all three themes through generic validation and integrated rendering. Independent scene tests cover six graph counts, every pin/symbol/terminal ID, role and net renaming, per-net segment connectivity, short checks, branch dots, all label regions, real pinned Geist metrics, and reserved maximum-highlight stroke bounds. Mutation tests reject nets, invalid pins and semiconductor polarity changes.

Run the focused geometry, validation and integrated-rendering contracts from the source checkout after installing dependencies:

```sh
bun test tests/complex.test.ts tests/validation.test.ts tests/renderer.test.ts tests/npn-symbol.test.ts
bun run typecheck --incremental false
```

For a smaller direct-scene and graph check, without replacing the integrated tests:

```sh
bun test tests/complex.test.ts --test-name-pattern 'direct scene|polarity|catalog and schema|distinct graph'
```

The ground-symbol bounds and explicit rectifier ground-junction vertex are part of the measured geometry contract. Keep integrated rendering and emitted-wire checks enabled when changing scenes or renderer code. [Testing](testing.md) covers the full deterministic suite, stress runner and opt-in browser review. Commands here are reproducible checks, not a claim that a historical run verifies the current checkout; actual totals and outcomes come from the run being evaluated.
