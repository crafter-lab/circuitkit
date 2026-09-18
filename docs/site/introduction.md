# Create a circuit diagram

CircuitKit turns a small text file into a circuit diagram. You describe modules, name their ports and say which ports connect. It arranges the drawing and gives you an SVG or PNG.

Use it to preview a circuit with your coding agent, add a wiring diagram to a README or explain a signal path. You can edit the source and keep it in Git.

## Start with your agent

This is the shortest path if you use Codex, Claude Code or another coding agent.

### 1. Install the skill

Run this in the project where you want to work, then choose your agent:

```sh
npx skills add crafter-lab/circuitkit --skill circuitkit
```

The skill is a small starting instruction. It finds the CircuitKit CLI, explains how to obtain it if missing and reads the guide shipped with that exact version. It does not need an account or an API key.

### 2. Ask for the picture you need

Try this prompt:

```text
Draw a wiring diagram of a controller connected to an I2C sensor.
Show SDA and SCL connections, leave power out, and give me a PNG preview.
Save the editable circuit source too.
```

For real hardware, include the exact board and pin names you know. Your agent should ask about missing connections, not invent them. A conceptual signal diagram is not a complete hardware design.

### 3. Keep the result

You should get an editable `.ck` file and a rendered image, not an ASCII sketch. SVG works well in docs and slides; PNG works well in agent image previews. Change the source and render again when the wiring changes.

## Prefer to write it yourself?

Follow [Your first circuit](/docs/quickstart). It shows the complete source, the command to validate it and the command that creates the image. No AI agent is required to use CircuitKit.

## One source, three useful views

| Choose | When you want to see |
| --- | --- |
| Blocks | Which modules talk to each other |
| Wiring | Exactly which named ports connect |
| Schematic | A modular circuit using signal wires and supply/ground notation |

[Compare the views](/docs/views), or [open the playground](/editor?mode=circuitkit&example=audio-story) to try them on the same source.

## What this is not

CircuitKit draws the connections you declare. It does not simulate current, check voltage compatibility, verify electrical safety or generate PCB fabrication files. An animated signal is an explanation, not a measurement. Supply information, device identity and hidden passives are never inferred.

## Reading these docs from an agent

Every documentation page has a Markdown version, linked above the article. Send `Accept: text/markdown` to the normal page URL or append `.md`. Start at [/llms.txt](/llms.txt) for the index. The local CLI also includes the guide:

```sh
npx circuitkit@latest skills get core --text
```
