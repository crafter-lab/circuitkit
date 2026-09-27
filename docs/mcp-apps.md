# Circuit images in chat, with optional exploration

The `circuitkit-mcp` executable serves two read-only tools over stdio:

- `show_circuit` is the default. It returns a PNG and structured connectivity.
  It has no UI template, even when the client supports MCP Apps. Explanations
  and revision requests stay in the conversation.
- `explore_circuit` opens a separate interactive viewer when explicitly requested.
  It offers selection on the drawing, zoom and authored teaching scenes. Hosts
  without the MCP Apps HTML capability receive a PNG fallback.

Both tools use the existing CircuitKit renderers and validators. CircuitKit does
not simulate electricity. The source revision includes the executable; these
instructions do not imply a new registry release.

## Run locally

```sh
bun install --frozen-lockfile
bun run build
node dist/mcp/cli.js --help
codex mcp add circuitkit -- node "$PWD/dist/mcp/cli.js"
```

Registration stores the absolute checkout path. Keep that checkout and its
installed dependencies available. Reload the client's MCP servers or start a new
session if the tools do not appear. Tool discovery does not establish interactive
UI support; that capability belongs to the chat host.

## Input and output

Both tools accept one optional input. Omit all inputs for the existing RC filter.

```json
{"recipe":"rc-lowpass"}
```

```json
{"source":"circuit sensor v1\ntitle \"Sensor signals\"\nview wiring\nController: controller (SDA SCL)\nSensor: sensor (SDA SCL)\nController.SDA <-> Sensor.SDA\nController.SCL -> Sensor.SCL\n"}
```

`document` accepts a CircuitKit recipe document, including component values,
presentation highlights and teaching steps. To revise an image, call `show_circuit`
again with the updated document or source. All nine recipe IDs are supported.
Inputs are bounded to 64 KiB and treated as inert data. Filesystem paths and
executable author code are not accepted.

Successful `show_circuit` calls contain one PNG image block and no widget payload.
`structuredContent` gives the circuit identity, components/modules, declared nets,
scenes, selected presentation mode and negotiated UI capability. Invalid input or
failed PNG rendering returns `isError` without a stale image or circuit payload.

Only `explore_circuit` advertises the resource `ui://circuitkit/view-v1.html`, with
MIME type `text/html;profile=mcp-app`. It uses the official MCP Apps SDK 2.0 and
standard `_meta.ui.resourceUri` metadata, plus the ChatGPT `openai/outputTemplate`
alias. Its `_meta.circuitkit` result carries the viewer input. The self-contained
HTML declares empty external connection and resource allowlists and requests no
host border. `uiAdvertised` records negotiation, not proof of display.

## Optional viewer

The drawing is the primary surface. Components and source modules are selectable
on their symbols; recipe nets are selectable on the wires or with keyboard focus
and Enter. Escape clears selection. Zoom and authored scene controls sit below
the drawing. The explanation action appears only after a selection and is disabled
if the host does not support messages.

Selections use `ui/update-model-context`. **Explain selection** explicitly sends
`ui/message` with the circuit identity and target. Rejected requests are shown in
the viewer. New inputs, cancellation and invalid results clear its current context.
Source scenes can play illustrative flows; reduced motion removes the moving
sweep and hidden documents pause it. Host theme changes affect the controls while
preserving authored circuit colors.

## Verify locally

```sh
bun run build:mcp
bun test tests/mcp.test.ts
bun scripts/preview-mcp.ts
```

The loopback preview starts with the actual PNG returned by `show_circuit`.
**Explore circuit** calls the other tool and mounts its HTML through the official
`AppBridge` in an iframe with `sandbox="allow-scripts"` and a network-blocking CSP.
Host diagnostics are collapsed by default. This reference host records messages;
it does not generate an assistant reply or establish native chat UI support.

```sh
bun scripts/check-mcp-browser.ts http://127.0.0.1:PORT/
```

The `agent-browser` check covers image output, optional exploration, pointer and
keyboard selection, scenes, zoom, messages, missing host capabilities, rejected
requests, cancellation, recovery, theme, mobile controls and reduced motion.
Screenshots and command receipts go to `artifacts/mcp-apps/browser` by default.

Set `CIRCUITKIT_MCP_AUDIT` to an absolute JSONL path for optional client capability,
resource-read and tool-identity logs. It does not log circuit source or write to
protocol stdout.

References:

- [MCP Apps specification and SDK](https://github.com/modelcontextprotocol/ext-apps)
- [OpenAI MCP and UI quickstart](https://developers.openai.com/plugins/build/app-quickstart/)
