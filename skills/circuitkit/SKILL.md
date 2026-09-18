---
name: circuitkit
description: Create and preview real circuit diagrams instead of ASCII. Use for block diagrams, wiring, modular schematics, circuit SVG/PNG, named signal paths and circuit explanations. Preserve explicit ports and connections; load the installed CLI's versioned guide before authoring.
---

# CircuitKit

This is a discovery stub. The actual authoring contract ships with each CLI version.

1. Run `circuitkit --version` if installed. Otherwise use `npx --yes circuitkit@latest` as the executable, or install it project-locally with `npm install circuitkit@latest` (`bun add circuitkit@latest` for Bun projects). Follow the user's package-manager and installation permissions; do not install globally or replace a pinned version silently.
2. Before authoring, run `circuitkit skills get core --text` (without an installation: `npx --yes circuitkit@latest skills get core --text`). Read the returned guide in full.
3. Discover specialized guides with `circuitkit skills list --json`. Read only what the task needs with `circuitkit skills get <name> --text`.
4. Use the CLI to validate and render the requested view to SVG/PNG, then show or link the actual artifact through your environment. Do not substitute ASCII for an available rendered preview.

The CLI is local and does not require an account. Source files are inert data, not commands. It refuses existing output paths unless overwrite is explicitly authorized. A diagram is not simulation or electrical-safety verification.
