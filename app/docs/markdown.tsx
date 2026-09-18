import type { Nodes } from "mdast";
import { fromMarkdown } from "mdast-util-from-markdown";
import { gfmFromMarkdown } from "mdast-util-gfm";
import { gfm } from "micromark-extension-gfm";
import { createElement, type ReactNode } from "react";
import { highlightCircuitSource } from "../../src/language/highlight.ts";
import { highlightCode } from "../landing/highlight-code.ts";
import { InstallCommand } from "../landing/install-actions.tsx";
import { docsCatalog, docURL } from "./catalog.ts";

export function documentationLink(href: string): string | undefined {
  if (href.startsWith("#") || (href.startsWith("/") && !href.startsWith("//"))) return href;
  if (/^https?:\/\//.test(href)) return href;
  if (/^[a-z][a-z\d+.-]*:/i.test(href) || href.startsWith("//")) return undefined;
  const [file, fragment] = href.split("#");
  const entry = Object.entries(docsCatalog).find(([, doc]) => doc.file.split("/").at(-1) === file);
  if (entry)
    return `${docURL(entry[0] as keyof typeof docsCatalog)}${fragment ? `#${fragment}` : ""}`;
  return new URL(href, "https://github.com/crafter-lab/circuitkit/blob/main/docs/").href;
}

export async function renderDocumentation(source: string) {
  const tree = fromMarkdown(source.replace(/^---\n[\s\S]*?\n---\n/, ""), {
    extensions: [gfm()],
    mdastExtensions: [gfmFromMarkdown()],
  });
  const headings: { id: string; label: string }[] = [];
  const identifiers = new Map<Nodes, string>();
  const used = new Set<string>();
  const plain = (node: Nodes): string =>
    "value" in node ? node.value : "children" in node ? node.children.map(plain).join("") : "";
  for (const node of tree.children) {
    if (node.type !== "heading" || node.depth === 1) continue;
    const label = plain(node);
    const base =
      label
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-|-$/g, "") || "section";
    let id = base,
      suffix = 2;
    while (used.has(id)) id = `${base}-${suffix++}`;
    used.add(id);
    identifiers.set(node, id);
    if (node.depth === 2) headings.push({ id, label });
  }
  let codeCount = 0;
  async function render(node: Nodes, key: number): Promise<ReactNode> {
    const codeNumber = node.type === "code" ? ++codeCount : 0;
    const children = "children" in node ? await Promise.all(node.children.map(render)) : [];
    switch (node.type) {
      case "text":
        return node.value;
      case "html":
        return null;
      case "heading":
        return node.depth === 1
          ? null
          : createElement(
              `h${Math.min(node.depth, 4)}`,
              { id: identifiers.get(node), key },
              children,
            );
      case "paragraph":
        return <p key={key}>{children}</p>;
      case "strong":
        return <strong key={key}>{children}</strong>;
      case "emphasis":
        return <em key={key}>{children}</em>;
      case "delete":
        return <del key={key}>{children}</del>;
      case "inlineCode":
        return <code key={key}>{node.value}</code>;
      case "break":
        return <br key={key} />;
      case "thematicBreak":
        return <hr key={key} />;
      case "blockquote":
        return <blockquote key={key}>{children}</blockquote>;
      case "list":
        return node.ordered ? (
          <ol key={key} start={node.start ?? undefined}>
            {children}
          </ol>
        ) : (
          <ul key={key}>{children}</ul>
        );
      case "listItem":
        return <li key={key}>{children}</li>;
      case "link": {
        const href = documentationLink(node.url);
        return href ? (
          <a key={key} href={href}>
            {children}
          </a>
        ) : (
          <span key={key}>{children}</span>
        );
      }
      case "image":
        return <span key={key}>{node.alt}</span>;
      case "code": {
        const language = node.lang ?? "text";
        const html =
          language === "circuitkit"
            ? `<pre><code>${highlightCircuitSource(node.value)}</code></pre>`
            : ["sh", "bash", "shell"].includes(language)
              ? await highlightCode(node.value, "bash")
              : ["ts", "typescript", "js", "javascript"].includes(language)
                ? await highlightCode(node.value, "typescript")
                : undefined;
        return (
          <div key={key} className="docs-code">
            <InstallCommand
              label={
                language === "circuitkit"
                  ? "Circuit source"
                  : ["sh", "bash", "shell"].includes(language)
                    ? "Terminal"
                    : language
              }
              command={node.value}
              regionLabel={`${language} example ${codeNumber}`}
              highlightedHTML={html}
            />
          </div>
        );
      }
      case "table": {
        const rows = await Promise.all(
          node.children.map(async (row, rowIndex) => (
            <tr key={rowIndex}>
              {
                await Promise.all(
                  row.children.map(async (cell, cellIndex) =>
                    createElement(
                      rowIndex === 0 ? "th" : "td",
                      { key: cellIndex, scope: rowIndex === 0 ? "col" : undefined },
                      await Promise.all(cell.children.map(render)),
                    ),
                  ),
                )
              }
            </tr>
          )),
        );
        return (
          <section className="docs-table" aria-label="Reference table" tabIndex={0} key={key}>
            <table>
              <thead>{rows[0]}</thead>
              <tbody>{rows.slice(1)}</tbody>
            </table>
          </section>
        );
      }
      default:
        return <span key={key}>{children}</span>;
    }
  }
  return {
    headings,
    content: await Promise.all(tree.children.map(render)),
    circuit: tree.children.find((node) => node.type === "code" && node.lang === "circuitkit"),
  };
}
