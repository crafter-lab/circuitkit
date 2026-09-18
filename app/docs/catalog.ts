import { readFile, stat } from "node:fs/promises";
import { join } from "node:path";

export const docsCatalog = {
  introduction: {
    title: "Create a circuit diagram",
    description:
      "Describe what connects. CircuitKit turns it into a real diagram you can preview, edit and keep.",
    file: "docs/site/introduction.md",
    group: "Start here",
  },
  quickstart: {
    title: "Your first circuit",
    description:
      "Write a short source file, validate the connections and create your first SVG or PNG.",
    file: "docs/site/quickstart.md",
    group: "Start here",
  },
  views: {
    title: "Choose the right view",
    description:
      "Blocks for the big picture. Wiring for individual ports. Schematics for circuit notation.",
    file: "docs/site/views.md",
    group: "Authoring",
  },
  language: {
    title: "The circuit language",
    description: "Modules, ports, explicit connections, buses and reusable definitions.",
    file: "docs/compact-language.md",
    group: "Authoring",
  },
  presentation: {
    title: "Explain a connection",
    description:
      "Use scenes to highlight modules, pins and buses. Add illustrative flow along declared connections.",
    file: "docs/presentation.md",
    group: "Authoring",
  },
  core: {
    title: "Work with an AI agent",
    description:
      "The guide your agent loads to write circuit source, validate it and show an SVG or PNG preview.",
    file: "agent-skills/core.md",
    group: "Integrate",
  },
  cli: {
    title: "CLI reference",
    description: "Commands, structured errors and safe file output. Rendering runs locally.",
    file: "docs/cli-contract.md",
    group: "Integrate",
  },
  api: {
    title: "Use the TypeScript API",
    description: "Turn circuit source into SVG in your app or build script.",
    file: "docs/site/api.md",
    group: "Integrate",
  },
  education: {
    title: "Educational figures",
    description: "Advanced author models and explicit public stages for teaching.",
    file: "docs/education-authoring.md",
    group: "Advanced",
  },
} as const;

export type DocSlug = keyof typeof docsCatalog;
export function docSlug(value: string): DocSlug | undefined {
  return Object.hasOwn(docsCatalog, value) ? (value as DocSlug) : undefined;
}
export function docURL(slug: DocSlug) {
  return slug === "introduction" ? "/docs" : `/docs/${slug}`;
}
export async function readDocumentation(slug: DocSlug) {
  if (slug === "core") return readFile(join(process.cwd(), "agent-skills", "core.md"), "utf8");
  return readFile(join(process.cwd(), "docs", docsCatalog[slug].file.slice(5)), "utf8");
}
export async function documentationModified(slug: DocSlug) {
  if (slug === "core") return (await stat(join(process.cwd(), "agent-skills", "core.md"))).mtime;
  return (await stat(join(process.cwd(), "docs", docsCatalog[slug].file.slice(5)))).mtime;
}
