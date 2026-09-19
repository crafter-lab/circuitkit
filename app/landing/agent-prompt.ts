export const agentSetupPrompt = `Set up CircuitKit in this workspace and turn my circuit idea into a real image. Do the work, not just an installation tutorial.

1. Check that Node.js 20+ is available, then install circuitkit@latest locally with this project's package manager: bun add circuitkit@latest for Bun, or npm install circuitkit@latest for npm. Ask before changing an existing pinned version. Respect installation approvals and security policies, including package-age restrictions. Do not install globally or bypass a blocked install.

2. Install the evergreen CircuitKit skill for this agent, at project scope. For Codex use: npx --yes skills add crafter-lab/circuitkit --skill circuitkit --agent codex --yes. For Claude Code replace codex with claude-code; for other agents check the supported agent id first. In Bun projects use bunx skills instead of npx --yes skills. Do not install it for unrelated agents.

3. Load the installed skill, then run the project-local CircuitKit CLI with skills get core --text and read the entire guide. Use skills list --json and load specialized guides only as needed. If the agent cannot activate a newly installed skill until restart, read its SKILL.md and the CLI guide directly for this conversation; do not claim it was activated automatically.

4. Use the circuit idea I already gave you. If I have not provided one, ask only: "What would you like to draw?" Do not make me write source or run commands. Default to a wiring view unless my request calls for blocks or a schematic. Ask for missing details only when they are necessary to avoid inventing connections. Clearly label a conceptual diagram; never invent board pins, regulation, power wiring or electrical-safety claims.

5. Write an editable .ck source, validate it with the CLI, fix diagnostics, and render both SVG and a PNG preview. Use fresh output paths in the workspace and keep the source beside the images. Do not overwrite existing files without permission. Render with CircuitKit, not ASCII or a hand-drawn substitute.

6. Show the actual preview immediately. In a desktop agent or chat UI with inline image support, attach or render the PNG in this conversation, not just an agent-only inspection or a text link. In a terminal environment with a graphical desktop, open the generated PNG in a separate image-viewer window: use open on macOS, xdg-open on Linux, or Invoke-Item -LiteralPath in Windows PowerShell, with the actual output path safely quoted. A desktop UI without inline support can use the external viewer too. In headless or SSH environments without a graphical display, do not attempt GUI launchers: provide usable artifact links or absolute file paths and explain the limitation. Never claim the image was shown or opened unless that action succeeded.

Keep the final response short: preview first, then links to the PNG, SVG and editable source, any important assumptions, and ask what I would like to change. No simulation or animated-export claims.`;
