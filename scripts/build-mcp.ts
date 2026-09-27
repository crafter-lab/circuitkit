import { chmodSync } from "node:fs";

export async function buildMcp() {
  const view = await Bun.build({
    entrypoints: ["src/mcp/view.tsx"],
    target: "browser",
    format: "esm",
    minify: true,
    define: { "process.env.NODE_ENV": '"production"' },
  });
  if (!view.success || !view.outputs[0]) throw new Error(`MCP view build failed: ${view.logs}`);
  const js = (await view.outputs[0].text()).replaceAll("</script", "<\\/script");
  const css = await Bun.file("src/mcp/view.css").text();
  await Bun.write(
    "dist/mcp/view.html",
    `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>CircuitKit</title><style>${css}</style></head><body><div id="root"></div><script type="module">${js}</script></body></html>`,
  );
  const server = await Bun.build({
    entrypoints: ["src/mcp/cli.ts"],
    outdir: "dist/mcp",
    naming: "cli.js",
    target: "node",
    format: "esm",
    packages: "external",
  });
  if (!server.success) throw new Error(`MCP server build failed: ${server.logs}`);
  chmodSync("dist/mcp/cli.js", 0o755);
}

if (import.meta.main) await buildMcp();
