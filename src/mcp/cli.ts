#!/usr/bin/env node
import { appendFileSync, readFileSync } from "node:fs";
import { StdioServerTransport } from "@modelcontextprotocol/server/stdio";
import { createCircuitServer } from "./server.ts";

if (process.argv.includes("--help") || process.argv.includes("-h")) {
  console.log(
    "Usage: circuitkit-mcp\n\nRead-only CircuitKit MCP server over stdio.\nTools: show_circuit (PNG), explore_circuit (optional MCP Apps viewer).\nOptional CIRCUITKIT_MCP_AUDIT: path for capability audit JSONL.",
  );
} else if (process.argv.length > 2) {
  console.error("Unexpected argument. Use circuitkit-mcp --help.");
  process.exitCode = 2;
} else {
  const html = readFileSync(new URL("./view.html", import.meta.url), "utf8");
  const auditPath = process.env.CIRCUITKIT_MCP_AUDIT;
  const server = createCircuitServer(html, (event, detail) => {
    if (auditPath) {
      try {
        appendFileSync(
          auditPath,
          `${JSON.stringify({ at: new Date().toISOString(), event, detail })}\n`,
          { mode: 0o600 },
        );
      } catch {
        console.error("CircuitKit could not append the optional capability audit.");
      }
    }
  });
  await server.connect(new StdioServerTransport());
}
