# Use the TypeScript API

Use the CLI when you want a file. Use the API when circuit rendering is part of your app or build process.

## Render source to SVG

Install `circuitkit`, then create `render.ts`. This example reads the `sensor.ck` file from [Your first circuit](/docs/quickstart).

```typescript
import { readFile, writeFile } from "node:fs/promises";
import { renderCircuitSource } from "circuitkit/language";

const source = await readFile("sensor.ck", "utf8");
const result = renderCircuitSource(source);
if (!result.ok) throw new Error(JSON.stringify(result.diagnostics));
await writeFile("sensor.svg", result.svg);
```

The renderer itself is browser-safe. The `node:fs/promises` imports above are just this file-writing example; do not import them in a browser component.

## Handle errors before showing a preview

`renderCircuitSource` returns a success or failure object. Read `ok` before accessing the SVG. On failure, show `diagnostics` and remove stale output so the preview never represents an earlier, now-invalid source.

The result contains the public figure, layout bounds, declared connectivity and the complete resolved system. Presentation plans are optional. Static SVG output does not contain animated playback.

## Compile once when you need more than SVG

```typescript
import { compileCircuitSource } from "circuitkit/language";
import { renderEducationalPNG } from "circuitkit/v2/png";

const compiled = compileCircuitSource(source);
if (!compiled.ok) throw new Error(JSON.stringify(compiled.diagnostics));
const image = await renderEducationalPNG(compiled.figure, { scale: 2 });
if (!image.ok) throw new Error(JSON.stringify(image.diagnostics));
```

`source` is the string you loaded or authored. PNG uses a native Node dependency and must stay out of browser bundles. Its success result contains `png` bytes and dimensions; write those bytes using your host's file API. Unlike the CLI's no-overwrite writer, the plain Node `writeFile` example replaces an existing destination, so choose the output policy your app requires.

## Other entry points

| Import | Use it for |
| --- | --- |
| `circuitkit/language` | Compact text parsing, resolution, formatting and rendering |
| `circuitkit/diagram` | Explicit module/port JSON diagrams |
| `circuitkit/markdown` | Inert CircuitKit fences in existing Markdown |
| `circuitkit/react` | Compatible legacy React circuit components |
| `circuitkit/v2/react` | Public educational figures |
| `circuitkit/v2/png` | Node-native PNG from a compiled public figure |

For command-line behavior and diagnostics, read [CLI reference](/docs/cli). For educational author models and learner privacy, read [Educational figures](/docs/education).
