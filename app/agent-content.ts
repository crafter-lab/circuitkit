import { createHash } from "node:crypto";
import { applyMarkdownHeaders, createNotFoundResponse } from "@vercel/agent-readability";

import { siteOrigin } from "./site-config.ts";

export { docsCatalog as documentation } from "./docs/catalog.ts";
export { siteOrigin } from "./site-config.ts";

import {
  docSlug,
  docURL,
  docsCatalog as documentation,
  documentationModified,
  readDocumentation,
} from "./docs/catalog.ts";

export const agentOverview = `# CircuitKit

> Create circuit diagrams with your coding agent or the local CLI. Export SVG and PNG from explicit connections.

Describe modules, ports and connections in a text file. CircuitKit arranges them into blocks, wiring or modular schematics and exports SVG or PNG. Rendering runs locally. The project is licensed under Apache-2.0.

## Install the skill

\`\`\`sh
npx skills add crafter-lab/circuitkit --skill circuitkit
\`\`\`

The repository skill is a small discovery stub. The actual instructions ship with each CLI release.

## Install and discover the CLI

Node.js 20 or newer is required. Use npx without a global install, or add circuitkit to the project:

\`\`\`sh
npm install circuitkit
npx circuitkit skills get core --text
npx circuitkit skills list --json
\`\`\`

For a Bun project use bun add circuitkit and bunx circuitkit. Do not silently upgrade a project's pinned version.

## Write, explain, ship

Save this conceptual signal-only example as sensor.ck. It is not a complete power circuit or a specific hardware design.

\`\`\`text
circuit sensor v1
title "Sensor signal connections"
Controller: controller (SDA SCL)
Sensor: sensor (SDA SCL)
bus I2C {
  Controller.SDA <-> Sensor.SDA "Data"
  Controller.SCL -> Sensor.SCL "Clock"
}
\`\`\`

\`\`\`sh
npx circuitkit validate sensor.ck --json
npx circuitkit render sensor.ck --view wiring --out sensor.svg --json
npx circuitkit render sensor.ck --view schematic --format png --out sensor.png --json
\`\`\`

Render success reports an absolute output path. Show the PNG with the host agent's image viewer or link the SVG and editable source. Existing output files are refused unless overwrite is explicitly authorized. JSON errors include source diagnostics; fix those before retrying.

Named scenes select existing modules and connections without moving parts or changing connectivity. Animated flow is illustrative and available in the web playground; exported SVG/PNG stay static. Speed is visual, not an electrical measurement. Markdown fences are supported by the CLI, not a required separate workspace.

## Scope

CircuitKit draws declared connectivity. It does not simulate voltages or currents, verify electrical safety or produce fabrication files. Do not invent board pins, regulation, hidden passives, missing power wiring or assume that speaker minus is ground. A boundary marker is not hardware. Educational author models require explicit trusted-host projection; hiding answers with CSS does not protect them.

## Reference

- [Agent quickstart](${siteOrigin}/docs/core): The same core guide shipped in the CLI.
- [Circuit language](${siteOrigin}/docs/language): Syntax, definitions, scope and budgets.
- [Presentation](${siteOrigin}/docs/presentation): Sections, scenes and illustrative flow.
- [CLI contract](${siteOrigin}/docs/cli): Structured output, refusal paths and atomic files.
- [Playground](${siteOrigin}/editor?mode=circuitkit): Edit source and preview locally in the browser.
- [GitHub](https://github.com/crafter-lab/circuitkit): Source, examples and issues.
- [npm](https://www.npmjs.com/package/circuitkit): CLI and library package.
`;

export const llmsIndex = `# CircuitKit

> Local circuit diagrams for developers and AI agents. Install the skill, author explicit connections, render real SVG/PNG previews. Not a simulator.

## Start here

- [Documentation](${siteOrigin}/docs): Start with an agent or follow the hands-on tutorial.
- [Your first circuit](${siteOrigin}/docs/quickstart): Complete runnable source and real image output.
- [Overview](${siteOrigin}/): Installation and rendering workflow; supports Accept: text/markdown.
- [Core guide](${siteOrigin}/docs/core): Versioned authoring workflow and output safety.
- [Language](${siteOrigin}/docs/language): Compact source syntax and limits.
- [Presentation](${siteOrigin}/docs/presentation): Highlights and illustrative scenes.
- [CLI](${siteOrigin}/docs/cli): Machine envelopes and atomic output.
- [Complete reference](${siteOrigin}/llms-full.txt): Overview and all guides.

## Optional

- [Education](${siteOrigin}/docs/education): Trusted-host projection and learner privacy.
- [GitHub](https://github.com/crafter-lab/circuitkit): Source, issues and examples.
`;

export async function markdownForPath(pathname: string): Promise<string | undefined> {
  if (pathname === "/" || pathname === "/index.md") return agentOverview;
  if (pathname === "/llms.txt") return llmsIndex;
  if (pathname === "/llms-full.txt") {
    const guides = await Promise.all(
      Object.keys(documentation).map((slug) =>
        readDocumentation(slug as keyof typeof documentation),
      ),
    );
    return [agentOverview, ...guides].join("\n\n---\n\n");
  }
  const name =
    pathname === "/docs" || pathname === "/docs/"
      ? "introduction"
      : pathname.match(/^\/docs\/([a-z-]+)(?:\.md)?\/?$/)?.[1];
  const slug = name ? docSlug(name) : undefined;
  if (slug) return readDocumentation(slug);
  const pages: Record<string, string> = {
    "/editor": "Circuit playground",
    "/gallery": "Circuit examples",
    "/flow": "Illustrative flow demo",
    "/lesson": "Guided lessons",
    "/education": "Educational figures",
    "/editor/education": "Education editor",
    "/gallery/education": "Education examples",
  };
  if (Object.hasOwn(pages, pathname))
    return `# ${pages[pathname]}\n\nUse the browser page with Accept: text/html for the interactive interface. To create a circuit directly from your agent, use the local CLI workflow below.\n\n${agentOverview}`;
  return undefined;
}

export async function agentResponse(
  request: Request,
  pathname = new URL(request.url).pathname,
): Promise<Response> {
  const source = await markdownForPath(pathname);
  const url = new URL(request.url);
  const origin = ["127.0.0.1", "localhost"].includes(url.hostname) ? url.origin : siteOrigin;
  if (source === undefined) return createNotFoundResponse(pathname, { baseUrl: origin });
  const name = pathname.match(/^\/docs\/([a-z-]+)(?:\.md)?\/?$/)?.[1];
  const slug = pathname === "/docs" ? "introduction" : name ? docSlug(name) : undefined;
  const canonicalPath = slug
    ? docURL(slug)
    : pathname === "/index.md"
      ? "/"
      : pathname.replace(/\.md$/, "");
  const title = slug ? documentation[slug].title : "CircuitKit";
  const description = slug
    ? documentation[slug].description
    : "Create circuit diagrams with a local CLI and agent skill. Export SVG and PNG from explicit connections.";
  const updated = (await documentationModified(slug ?? "introduction")).toISOString().slice(0, 10);
  const text = `---\ntitle: ${JSON.stringify(title)}\ndescription: ${JSON.stringify(description)}\ncanonical_url: ${JSON.stringify(`${origin}${canonicalPath}`)}\nlast_updated: ${updated}\n---\n\n${source.replaceAll(siteOrigin, origin)}`;
  const etag = `"${createHash("sha256").update(text).digest("hex")}"`;
  const headers = new Headers({
    "Content-Type": "text/markdown; charset=utf-8",
    "Cache-Control": "public, max-age=0, s-maxage=300, stale-while-revalidate=3600",
    ETag: etag,
    Vary: "Accept, User-Agent, Signature-Agent, Sec-Fetch-Mode",
  });
  applyMarkdownHeaders(headers, { canonicalUrl: `${origin}${canonicalPath}` });
  const unchanged = request.headers
    .get("if-none-match")
    ?.split(",")
    .map((value) => value.trim().replace(/^W\//, ""))
    .some((value) => value === etag || value === "*");
  return new Response(request.method === "HEAD" || unchanged ? null : text, {
    status: unchanged ? 304 : 200,
    headers,
  });
}
