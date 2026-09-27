import { Client } from "@modelcontextprotocol/client";
import { StdioClientTransport } from "@modelcontextprotocol/client/stdio";
import { RESOURCE_MIME_TYPE } from "@modelcontextprotocol/ext-apps/server";
import { loadExample } from "../src/catalog.ts";
import { CIRCUIT_UI_URI } from "../src/mcp/server.ts";

const client = new Client(
  { name: "circuitkit-reference-host", version: "1.0.0" },
  {
    capabilities: {
      extensions: { "io.modelcontextprotocol/ui": { mimeTypes: [RESOURCE_MIME_TYPE] } },
    },
  },
);
await client.connect(
  new StdioClientTransport({
    command: "node",
    args: [new URL("../dist/mcp/cli.js", import.meta.url).pathname],
    stderr: "inherit",
  }),
);
const resource = await client.readResource({ uri: CIRCUIT_UI_URI });
const html = resource.contents.find((content) => "text" in content);
if (!html || !("text" in html)) throw new Error("MCP server did not return the UI resource.");
const host = await Bun.build({
  entrypoints: ["scripts/mcp-host.ts"],
  target: "browser",
  format: "esm",
  minify: true,
});
if (!host.success || !host.outputs[0]) throw new Error("Could not build the reference host.");
const js = await host.outputs[0].text();
const lesson = loadExample("rc-lowpass");
lesson.presentation.steps = [
  {
    id: "resistor",
    title: "Series resistor",
    description: "R1 connects the input to the output node.",
    highlight: { components: ["R1"], nets: ["input"] },
  },
  {
    id: "capacitor",
    title: "Shunt capacitor",
    description: "C1 connects the output node to ground.",
    highlight: { components: ["C1"], nets: ["output", "ground"] },
  },
];
const source = await Bun.file("examples/diagrams/cueva-presentation.ck").text();
const page = `<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>CircuitKit preview</title><style>body{font:14px system-ui;margin:40px auto;max-width:920px;padding:0 20px;background:#fff;color:#171717}h1{font-size:16px;font-weight:500;margin:0 0 20px}header{display:flex;gap:8px;align-items:center;flex-wrap:wrap;margin-bottom:32px}button,select{font:inherit;font-size:12px;padding:7px 10px;border:1px solid #ddd;border-radius:6px;background:white;color:inherit}iframe{display:block;width:100%;height:650px;border:0}#presentation>img{display:block;max-width:100%;height:auto;margin:0 auto}pre{white-space:pre-wrap;overflow-wrap:anywhere;font-size:11px;max-height:250px;overflow:auto}details{margin-top:32px;color:#666;font-size:12px}summary{cursor:pointer}details button{margin:12px 8px 0 0}</style><h1>CircuitKit</h1><header><select id="demo" aria-label="Demo"><option value="rc">RC filter</option><option value="source">Cueva scenes</option><option value="invalid">Invalid source</option></select><button id="render">Render image</button><button id="explore">Explore circuit</button></header><section id="presentation" aria-label="Circuit output"></section><details><summary>Host diagnostics</summary><p>Reference host with the real MCP server. This page does not establish native chat UI support.</p><button id="theme">Dark host theme</button><button id="cancel">Cancel request</button><pre id="events"></pre></details><script type="module" src="/host.js"></script></html>`;
const server = Bun.serve({
  hostname: "127.0.0.1",
  port: Number(process.env.CIRCUITKIT_PREVIEW_PORT ?? 0),
  async fetch(request) {
    const url = new URL(request.url);
    if (request.method !== "GET") return new Response("Method not allowed", { status: 405 });
    if (url.pathname === "/")
      return new Response(page, { headers: { "content-type": "text/html" } });
    if (url.pathname === "/host.js")
      return new Response(js, { headers: { "content-type": "text/javascript" } });
    if (url.pathname === "/view.html")
      return new Response(html.text, {
        headers: {
          "content-type": "text/html",
          "content-security-policy":
            "default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; img-src data:; font-src data:; connect-src 'none'",
        },
      });
    if (url.pathname === "/result") {
      const demo = url.searchParams.get("demo");
      const input =
        demo === "source"
          ? { source }
          : demo === "invalid"
            ? { source: "invalid circuit" }
            : { document: lesson };
      const name =
        url.searchParams.get("tool") === "explore_circuit" ? "explore_circuit" : "show_circuit";
      return Response.json({ input, result: await client.callTool({ name, arguments: input }) });
    }
    return new Response("Not found", { status: 404 });
  },
});
console.log(`CircuitKit reference host: ${server.url}`);
const close = async () => {
  server.stop();
  await client.close();
  process.exit(0);
};
process.on("SIGINT", close);
process.on("SIGTERM", close);
