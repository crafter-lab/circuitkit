import { createHash } from "node:crypto";
import {
  getUiCapability,
  RESOURCE_MIME_TYPE,
  registerAppResource,
  registerAppTool,
} from "@modelcontextprotocol/ext-apps/server";
import { type CallToolResult, McpServer } from "@modelcontextprotocol/server";
import { renderPNG } from "../png.ts";
import { renderEducationalPNG } from "../v2/png.ts";
import {
  type CircuitInput,
  circuitInputSchema,
  circuitSummary,
  prepareCircuit,
} from "./circuit.ts";

export const CIRCUIT_UI_URI = "ui://circuitkit/view-v1.html";
export type Audit = (event: string, detail: unknown) => void;

export function createCircuitServer(html: string, audit: Audit = () => {}) {
  const server = new McpServer({ name: "circuitkit", version: "0.1.0" });
  server.server.oninitialized = () => {
    audit("initialize", {
      client: server.server.getClientVersion(),
      capabilities: server.server.getClientCapabilities(),
    });
  };
  const ui = {
    prefersBorder: false,
    csp: { connectDomains: [], resourceDomains: [] },
  };
  registerAppResource(
    server,
    "CircuitKit viewer",
    CIRCUIT_UI_URI,
    { description: "Interactive circuit selection and teaching scenes.", _meta: { ui } },
    async () => {
      audit("resource-read", { uri: CIRCUIT_UI_URI });
      return {
        contents: [
          { uri: CIRCUIT_UI_URI, mimeType: RESOURCE_MIME_TYPE, text: html, _meta: { ui } },
        ],
      };
    },
  );
  const render =
    (presentation: "image" | "interactive") =>
    async (input: CircuitInput): Promise<CallToolResult> => {
      try {
        const circuit = prepareCircuit(input);
        const id = createHash("sha256").update(JSON.stringify(circuit.input)).digest("hex");
        const uiAdvertised =
          getUiCapability(server.server.getClientCapabilities())?.mimeTypes?.includes(
            RESOURCE_MIME_TYPE,
          ) ?? false;
        const summary = { id, ...circuitSummary(circuit), presentation, uiAdvertised };
        const content: CallToolResult["content"] = [];
        if (presentation === "image" || !uiAdvertised) {
          const image =
            circuit.kind === "recipe"
              ? await renderPNG(circuit.result.document, { schematic: true })
              : await renderEducationalPNG(circuit.result.figure);
          if (!image.ok) throw new Error(`PNG unavailable: ${JSON.stringify(image.diagnostics)}`);
          content.push({
            type: "image",
            mimeType: "image/png",
            data: Buffer.from(image.png).toString("base64"),
          });
        } else {
          content.push({ type: "text", text: JSON.stringify(summary) });
        }
        audit("tool-call", { id, kind: circuit.kind, presentation, uiAdvertised });
        return {
          content,
          structuredContent: summary,
          ...(presentation === "interactive"
            ? { _meta: { circuitkit: { id, input: circuit.input } } }
            : {}),
        };
      } catch (error) {
        return {
          isError: true,
          content: [
            { type: "text", text: error instanceof Error ? error.message : "Invalid circuit." },
          ],
        };
      }
    };
  const config = {
    inputSchema: circuitInputSchema,
    annotations: {
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: false,
    },
  };
  server.registerTool(
    "show_circuit",
    {
      ...config,
      title: "Show a circuit image",
      description:
        "Render a CircuitKit recipe, inert recipe JSON, or .ck source as a PNG in the conversation. Use this by default to show, explain or revise a circuit. Omit arguments for an RC filter. Returns an image and structured connectivity, without a widget. No simulation, file access or source execution.",
    },
    render("image"),
  );
  registerAppTool(
    server,
    "explore_circuit",
    {
      ...config,
      title: "Explore a circuit interactively",
      description:
        "Open a CircuitKit viewer only when the user asks to explore interactively. Accepts the same recipe, inert document or .ck source as show_circuit. Supports on-diagram selection, zoom and authored scenes in MCP Apps hosts, with PNG fallback elsewhere. Prefer show_circuit for normal conversation images.",
      _meta: {
        ui: { resourceUri: CIRCUIT_UI_URI },
        "openai/outputTemplate": CIRCUIT_UI_URI,
      },
    },
    render("interactive"),
  );
  return server;
}
