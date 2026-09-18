import { expect, test } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";
import { agentResponse, markdownForPath } from "../app/agent-content.ts";
import {
  type DocSlug,
  docSlug,
  docsCatalog,
  docURL,
  readDocumentation,
} from "../app/docs/catalog.ts";
import DocsPage from "../app/docs/docs-page.tsx";
import { documentationLink, renderDocumentation } from "../app/docs/markdown.tsx";
import { renderCircuitSource } from "../src/language/index.ts";

test("every documentation page has the same underlying human and agent source", async () => {
  for (const slug of Object.keys(docsCatalog) as DocSlug[]) {
    const source = await readDocumentation(slug);
    expect(await markdownForPath(docURL(slug))).toBe(source);
    expect(await markdownForPath(`/docs/${slug}.md`)).toBe(source);
    const response = await agentResponse(
      new Request(`https://circuitkit.vercel.app${docURL(slug)}`),
    );
    expect(response.status).toBe(200);
    expect(await response.text()).toContain(source);
  }
});

test("quickstart contains executable source and a real render, not an empty placeholder", async () => {
  const source = await readDocumentation("quickstart");
  const parsed = await renderDocumentation(source);
  expect(parsed.circuit?.type).toBe("code");
  if (parsed.circuit?.type !== "code") throw new Error("Missing runnable example");
  const result = renderCircuitSource(parsed.circuit.value);
  expect(result.ok).toBe(true);
  if (result.ok) expect(result.system.nets).toHaveLength(2);
  const html = renderToStaticMarkup(await DocsPage({ slug: "quickstart" }));
  expect(html.match(/<main\b/g)).toHaveLength(1);
  expect(html.match(/<h1\b/g)).toHaveLength(1);
  expect(html).toContain('src="data:image/svg+xml,');
  expect(html).toContain('aria-current="page"');
  const ids = [...html.matchAll(/\sid="([^"]+)"/g)].map((match) => match[1]);
  expect(new Set(ids).size).toBe(ids.length);
  for (const heading of parsed.headings) expect(ids).toContain(heading.id);
});

test("docs renderer keeps tables semantic, code inert, headings unique and links safe", async () => {
  const result = await renderDocumentation(
    "# Title\n\n## Repeat\n\n## Repeat\n\n| A | B |\n| --- | --- |\n| one | two |\n\n<script>alert(1)</script>\n\n[unsafe](javascript:alert)\n\n```text\n<script>literal</script>\n```",
  );
  const html = renderToStaticMarkup(result.content);
  expect(html).toContain("<table>");
  expect(html).toContain('scope="col"');
  expect(html).not.toContain("<script>");
  expect(html).not.toContain('href="javascript:');
  expect(html).toContain("&lt;script&gt;literal&lt;/script&gt;");
  expect(result.headings.map((h) => h.id)).toEqual(["repeat", "repeat-2"]);
  for (const name of ["__proto__", "constructor", "../core", "/etc/passwd"])
    expect(docSlug(name)).toBeUndefined();
  expect(documentationLink("javascript:alert(1)")).toBeUndefined();
  expect(documentationLink("//evil.test")).toBeUndefined();
  expect(documentationLink("compact-language.md")).toBe("/docs/language");
});
