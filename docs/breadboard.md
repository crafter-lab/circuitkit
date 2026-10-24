# Breadboard layouts

`circuitkit.breadboard.v1` describes where parts and jumper wires sit on a solderless breadboard. Unlike `circuitkit.diagram.v1`, positions are the content: every pin and wire end names a hole. Connectivity is derived from the board, never declared by drawing. This is a simplified physical layout for building a circuit by hand, not CAD, not to scale and not electrical verification.

## Board model

- Columns `a`–`e` and `f`–`j`, separated by the center gap. Rows `1`–`rows` (default 63, the full-size board).
- A terminal strip is the five holes of one row on one side of the gap: `a24`–`e24` are connected, `f24`–`j24` are another strip.
- Four rails run the length of the board: `L-`, `L+` on the left, `R+`, `R-` on the right. A rail hole is written with its row, such as `R-26`. Every row has a rail hole in this model; real boards skip some.
- `board.rails: "split"` cuts every rail in half after row `ceil(rows / 2)`, for boards whose rails are interrupted in the middle.

## Document

```json
{
  "schema": "circuitkit.breadboard.v1",
  "id": "pico-ili9341",
  "title": "Pico 2 W + ILI9341",
  "board": { "rows": 63, "rails": "full" },
  "parts": [
    { "id": "pico", "kind": "dip", "at": "c24", "to": "h43", "top": "USB",
      "pins": { "left": ["GP0", "..."], "right": ["VBUS", "..."] } },
    { "id": "tft", "kind": "header", "at": "a48", "body": "left", "pins": ["T_IRQ", "...", "VCC"] }
  ],
  "wires": [{ "from": "i26", "to": "R-26" }, { "from": "i37", "to": "e58", "color": "purple" }],
  "expect": [["pico.GND", "tft.GND"], ["pico.GP21", "tft.RESET"]]
}
```

Parts:

| Kind | Placement | Pins |
| --- | --- | --- |
| `dip` | `at` is the top pin of the left row, `to` the bottom pin of the right row. Use it for boards that straddle the gap, such as a Pico or a DIP chip. | `pins.left` and `pins.right`, each top to bottom, one per row. |
| `header` | `at` is the first pin; the pins run down one column. `body` (`left`, `right`, `none`) draws the module hanging off that side. | `pins`, top to bottom. |

Pin names are 1–24 characters; `-` marks an unlabeled pin. Repeated names on one part are the same terminal, so every `GND` of a Pico is one net. Write the pins in the order they land on the board, not the order of the datasheet.

Wires join two endpoints: a terminal hole (`i26`) or a rail hole (`R+28`). `color` is optional (`red`, `black`, `blue`, `green`, `yellow`, `orange`, `purple`, `white`, `gray`, `brown`). Without it, wires to a `+` rail are red, to a `-` rail black, and others take distinct colors.

`expect` lists `part.PIN` pairs that must be connected. When present, the check is closed: every derived net that joins part pins must belong to one expected group. A wire on the wrong pin therefore fails twice, as an open (`breadboard.expect_open`) and as a short (`breadboard.short`). Without `expect`, nothing is checked beyond placement.

## Diagnostics

| Code | Meaning |
| --- | --- |
| `breadboard.schema` | Unknown field, malformed hole or pin name |
| `breadboard.out_of_board` | A pin or wire end lands past the last row |
| `breadboard.occupied` | Two pins or wire ends share one hole |
| `breadboard.part_span` / `breadboard.part_pins` | A dip span is inverted or its pin lists do not match its rows |
| `breadboard.redundant_wire` | Both ends of a wire are in the same strip |
| `breadboard.pin_unknown` | An `expect` pin is not placed |
| `breadboard.expect_open` | An expected pair is not connected |
| `breadboard.short` | A derived net joins pins from different expected groups |

## CLI and library

```sh
circuitkit schema --breadboard --json
circuitkit validate examples/breadboard/pico-ili9341.json --json
circuitkit render examples/breadboard/pico-ili9341.json --out board.svg
circuitkit render examples/breadboard/pico-ili9341.json --format png --scale 2 --out board.png
```

`validate` and `inspect` return the normalized document and derived `nets` (pins and holes). `--view`, `--figure` and `--schematic` do not apply.

```ts
import { compileBreadboard, renderBreadboardSVG } from "circuitkit/breadboard";
import { renderBreadboardPNG } from "circuitkit/breadboard/png";
```

Limits: 63 rows, 16 parts, 64 pins per part, 64 wires, 128 expected pairs.
