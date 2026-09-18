import { createHighlighter } from "shiki";

const highlighter = createHighlighter({
  themes: [
    {
      name: "circuitkit",
      colors: {
        "editor.background": "var(--syntax-background)",
        "editor.foreground": "var(--syntax-text)",
      },
      settings: [
        { scope: ["keyword", "storage"], settings: { foreground: "var(--syntax-keyword)" } },
        { scope: ["string"], settings: { foreground: "var(--syntax-string)" } },
        {
          scope: ["entity.name.function", "support.function"],
          settings: { foreground: "var(--syntax-function)" },
        },
        {
          scope: ["entity.name.type", "support.type", "variable"],
          settings: { foreground: "var(--syntax-type)" },
        },
        { scope: ["constant"], settings: { foreground: "var(--syntax-number)" } },
        { scope: ["comment"], settings: { foreground: "var(--syntax-comment)" } },
      ],
    },
  ],
  langs: ["typescript", "bash"],
});

export async function highlightCode(source: string, language: "typescript" | "bash") {
  return (await highlighter).codeToHtml(source, {
    lang: language,
    theme: "circuitkit",
    tabindex: false,
  });
}

export const installationCommand = "npx skills add crafter-lab/circuitkit --skill circuitkit";
export const terminalExample = `npx circuitkit@latest validate audio.ck --json
npx circuitkit@latest render audio.ck --out audio.svg
npx circuitkit@latest render audio.ck --view schematic --out schematic.svg`;
export const integrationExample = `import { readFile, writeFile } from "node:fs/promises";
import { renderCircuitSource } from "circuitkit/language";

const source = await readFile("audio.ck", "utf8");
const result = renderCircuitSource(source);
if (!result.ok) throw new Error(JSON.stringify(result.diagnostics));
await writeFile("audio.svg", result.svg);`;
