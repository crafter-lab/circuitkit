import { expect, test } from "bun:test";
import { shouldServeMarkdown } from "@vercel/agent-readability";
import { agentResponse, documentation, markdownForPath } from "../app/agent-content.ts";
import {
  highlightCode,
  integrationExample,
  terminalExample,
} from "../app/landing/highlight-code.ts";
import MarkdownPage from "../app/markdown/page.tsx";

const request = (path: string, init?: RequestInit) =>
  new Request(`https://circuitkit.vercel.app${path}`, init);

test("negotiation respects explicit HTML preference and rejects markdown q=0", () => {
  for (const accept of ["text/html", "text/markdown;q=0, text/html;q=1"])
    expect(
      shouldServeMarkdown(request("/", { headers: { accept, "user-agent": "ClaudeBot" } })).serve,
    ).toBe(false);
  expect(shouldServeMarkdown(request("/", { headers: { accept: "text/markdown" } })).serve).toBe(
    true,
  );
});

test("index and every packaged documentation route return markdown with canonical and cache validators", async () => {
  for (const path of [
    "/",
    "/index.md",
    "/llms.txt",
    "/llms-full.txt",
    ...Object.keys(documentation).flatMap((name) => [`/docs/${name}`, `/docs/${name}.md`]),
  ]) {
    const response = await agentResponse(request(path));
    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toStartWith("text/markdown");
    expect(response.headers.get("vary")).toContain("Accept");
    expect(response.headers.get("link")).toContain('rel="canonical"');
    expect((await response.text()).length).toBeGreaterThan(200);
    const etag = response.headers.get("etag") ?? "";
    expect(etag).not.toBe("");
    const conditional = await agentResponse(request(path, { headers: { "if-none-match": etag } }));
    expect(conditional.status).toBe(304);
    expect(await conditional.text()).toBe("");
    expect(await (await agentResponse(request(path, { method: "HEAD" }))).text()).toBe("");
  }
});

test("unknown docs and path probes get true noncanonical 404s without arbitrary file reads", async () => {
  for (const path of [
    "/missing",
    "/docs/missing",
    "/docs/__proto__",
    "/docs/..%2F.env.local",
    "/docs/constructor",
  ]) {
    expect(await markdownForPath(path)).toBeUndefined();
    const response = await agentResponse(request(path));
    expect(response.status).toBe(404);
    expect(response.headers.get("link")).toBeNull();
    expect(response.headers.get("x-robots-tag")).toContain("noindex");
  }
});

test("highlighter preserves source text, escapes HTML and uses shared theme variables", async () => {
  for (const [code, language] of [
    [integrationExample, "typescript"],
    [terminalExample, "bash"],
    ['const unsafe = "<script>alert(1)</script>";', "typescript"],
  ] as const) {
    const html = await highlightCode(code, language);
    expect(html).not.toContain("<script>");
    const text = html
      .replace(/<[^>]*>/g, "")
      .replaceAll("&#x3C;", "<")
      .replaceAll("&lt;", "<")
      .replaceAll("&gt;", ">")
      .replaceAll("&#x26;", "&")
      .replaceAll("&amp;", "&")
      .replaceAll("&quot;", '"')
      .replaceAll("&#39;", "'");
    expect(text).toBe(code);
    expect(html).toContain("var(--syntax-");
  }
});

test("retired Markdown workspace redirects to the source playground", () => {
  expect(() => MarkdownPage()).toThrow("NEXT_REDIRECT");
});
