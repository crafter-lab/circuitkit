import { readFileSync } from "node:fs";

import { version } from "../package.json";

export const packageVersion: string = version;

export const agentGuides = [
  {
    name: "core",
    description: "Create, validate and show circuit previews",
    file: "agent-skills/core.md",
  },
  {
    name: "language",
    description: "Compact language, hierarchy and limits",
    file: "docs/compact-language.md",
  },
  {
    name: "presentation",
    description: "Sections, scenes and illustrative flow",
    file: "docs/presentation.md",
  },
  {
    name: "education",
    description: "Educational authoring and public projection",
    file: "docs/education-authoring.md",
  },
  {
    name: "legacy",
    description: "Existing JSON recipes, React and teaching figures",
    file: "docs/guide.md",
  },
] as const;

export function readAgentGuide(name: string): string | undefined {
  const guide = agentGuides.find((entry) => entry.name === name);
  if (!guide) return undefined;
  return readFileSync(new URL(`../${guide.file}`, import.meta.url), "utf8");
}
