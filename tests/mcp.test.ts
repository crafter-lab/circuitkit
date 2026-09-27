import { afterAll, describe, expect, test } from "bun:test";
import { Client } from "@modelcontextprotocol/client";
import { StdioClientTransport } from "@modelcontextprotocol/client/stdio";
import { RESOURCE_MIME_TYPE } from "@modelcontextprotocol/ext-apps/server";
import { loadExample } from "../src/catalog.ts";
import { prepareCircuit, selectionContext } from "../src/mcp/circuit.ts";
import { CIRCUIT_UI_URI } from "../src/mcp/server.ts";
import { recipeIds } from "../src/schema.ts";

const clients: Client[] = [];
const modes: ["show_circuit" | "explore_circuit", boolean][] = [
  ["show_circuit", true],
  ["show_circuit", false],
  ["explore_circuit", true],
  ["explore_circuit", false],
];
async function connect(ui: boolean | readonly string[]) {
  const client = new Client(
    { name: "circuitkit-test", version: "1.0.0" },
    {
      capabilities: ui
        ? {
            extensions: {
              "io.modelcontextprotocol/ui": {
                mimeTypes: typeof ui === "boolean" ? [RESOURCE_MIME_TYPE] : [...ui],
              },
            },
          }
        : {},
    },
  );
  clients.push(client);
  await client.connect(
    new StdioClientTransport({
      command: "node",
      args: [new URL("../dist/mcp/cli.js", import.meta.url).pathname],
      stderr: "inherit",
    }),
  );
  return client;
}
afterAll(async () => {
  await Promise.all(clients.map((client) => client.close()));
});

describe("CircuitKit MCP Apps wire contract", () => {
  test("advertises the real UI resource with a read-only tool", async () => {
    const client = await connect(true);
    const { tools } = await client.listTools();
    const imageTool = tools.find(({ name }) => name === "show_circuit");
    expect(imageTool?.annotations?.readOnlyHint).toBe(true);
    expect(imageTool?._meta?.ui).toBeUndefined();
    expect(imageTool?._meta?.["openai/outputTemplate"]).toBeUndefined();
    expect(imageTool?._meta?.["ui/resourceUri"]).toBeUndefined();
    const tool = tools.find(({ name }) => name === "explore_circuit");
    expect(tool?.annotations?.readOnlyHint).toBe(true);
    expect(tool?._meta?.ui).toMatchObject({ resourceUri: CIRCUIT_UI_URI });
    const { contents } = await client.readResource({ uri: CIRCUIT_UI_URI });
    expect(contents[0]?.mimeType).toBe("text/html;profile=mcp-app");
    expect(contents[0] && "text" in contents[0] && contents[0].text).toContain("Explain selection");
    expect(contents[0]?._meta).toMatchObject({
      ui: { csp: { connectDomains: [], resourceDomains: [] } },
    });
    let rejected = false;
    try {
      await client.readResource({ uri: "ui://circuitkit/missing.html" });
    } catch {
      rejected = true;
    }
    expect(rejected).toBe(true);
  });

  test.each(modes)("returns declared RC connectivity for %s with UI=%s", async (name, ui) => {
    const client = await connect(ui);
    const result = await client.callTool({ name, arguments: {} });
    expect(result.isError).not.toBe(true);
    expect(result.structuredContent).toMatchObject({
      uiAdvertised: ui,
      components: {
        R1: { type: "resistor", resistance: 10000 },
        C1: { type: "capacitor", capacitance: 1e-7 },
      },
      nets: { input: ["R1.a", "VIN"], output: ["C1.a", "R1.b", "VOUT"], ground: ["C1.b", "GND"] },
    });
    const image = result.content.find((item) => item.type === "image");
    expect(Boolean(image)).toBe(name === "show_circuit" || !ui);
    if (name === "show_circuit") expect(result.content.map((part) => part.type)).toEqual(["image"]);
    if (image?.type === "image")
      expect(Buffer.from(image.data, "base64").subarray(0, 8)).toEqual(
        Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
      );
    if (name === "explore_circuit")
      expect(result._meta?.circuitkit).toMatchObject({ input: { document: { version: 1 } } });
    else expect(result._meta).toBeUndefined();
  });

  test.each(modes)("preserves source bus nets and scenes for %s with UI=%s", async (name, ui) => {
    const client = await connect(ui);
    const source = `circuit sensor v1\ntitle "Sensor"\nview wiring\nController: controller (SDA SCL)\nSensor: sensor (SDA SCL)\nbus I2C {\nController.SDA <-> Sensor.SDA\nController.SCL -> Sensor.SCL\n}\npresentation {\nscene clock "Clock" {\nhighlight module Controller\nflow link Controller.SCL -- Sensor.SCL {\nstyle sweep\n}\n}\n}`;
    const result = await client.callTool({ name, arguments: { source } });
    expect(result.isError).not.toBe(true);
    expect(result.structuredContent).toHaveProperty("scenes", [
      { id: "clock", title: "Clock", unavailable: [] },
    ]);
    if (name === "explore_circuit")
      expect(result._meta?.circuitkit).toMatchObject({ input: { source } });
    else expect(result._meta).toBeUndefined();
    expect((result.structuredContent as { nets: unknown[] }).nets).toHaveLength(2);
    expect(result.content.some((part) => part.type === "image")).toBe(
      name === "show_circuit" || !ui,
    );
  });

  test.each([...recipeIds])("renders the existing %s recipe over stdio", async (recipe) => {
    const client = await connect(true);
    const result = await client.callTool({ name: "show_circuit", arguments: { recipe } });
    expect(result.isError).not.toBe(true);
    expect(result.content.map((part) => part.type)).toEqual(["image"]);
    const input = loadExample(recipe);
    expect(result.structuredContent).toMatchObject({ components: input.circuit.components });
    const nets = (result.structuredContent as { nets: Record<string, string[]> }).nets;
    expect(Object.keys(nets).sort()).toEqual(Object.keys(input.circuit.nets).sort());
    for (const [name, endpoints] of Object.entries(input.circuit.nets))
      expect(nets[name]?.slice().sort()).toEqual([...endpoints].sort());
  });

  test("revision changes the image while preserving declared connectivity", async () => {
    const client = await connect(true);
    const first = await client.callTool({ name: "show_circuit", arguments: {} });
    const document = loadExample("rc-lowpass");
    document.circuit.components.R1 = { type: "resistor", resistance: 22000 };
    document.presentation.highlight = { components: ["R1"], nets: [] };
    const revised = await client.callTool({ name: "show_circuit", arguments: { document } });
    expect(revised.isError).not.toBe(true);
    expect(revised.content.map((part) => part.type)).toEqual(["image"]);
    expect(revised.content[0]).not.toEqual(first.content[0]);
    expect(revised.structuredContent).toMatchObject({
      components: { R1: { resistance: 22000 } },
      nets: { input: ["R1.a", "VIN"], output: ["C1.a", "R1.b", "VOUT"], ground: ["C1.b", "GND"] },
    });
  });

  test.each([{ mimeTypes: [] }, { mimeTypes: ["text/plain"] }])(
    "falls back to PNG when the UI extension lacks the HTML MIME type: %j",
    async ({ mimeTypes }) => {
      const client = await connect(mimeTypes);
      for (const name of ["show_circuit", "explore_circuit"]) {
        const result = await client.callTool({ name, arguments: {} });
        expect(result.isError).not.toBe(true);
        expect(result.content.map((part) => part.type)).toEqual(["image"]);
        expect(result.structuredContent).toHaveProperty("uiAdvertised", false);
      }
    },
  );

  test("parameter changes preserve RC connectivity for deterministic generated values", async () => {
    const client = await connect(true);
    let seed = 27;
    for (let index = 0; index < 24; index++) {
      seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
      const document = loadExample("rc-lowpass");
      const resistance = 1 + (seed % 1_000_000);
      document.circuit.components.R1 = { type: "resistor", resistance };
      const result = await client.callTool({ name: "show_circuit", arguments: { document } });
      expect(result.isError).not.toBe(true);
      expect(result.structuredContent).toMatchObject({
        components: { R1: { resistance } },
        nets: { input: ["R1.a", "VIN"], output: ["C1.a", "R1.b", "VOUT"], ground: ["C1.b", "GND"] },
      });
    }
  });

  test("bounded malformed source campaign never returns a circuit payload", async () => {
    const client = await connect(true);
    for (const character of ["\u0000", "\ud800", "{", "}", "<", "\n", "é", "😀"]) {
      for (const length of [1, 17, 257, 4097]) {
        const result = await client.callTool({
          name: "show_circuit",
          arguments: { source: character.repeat(length) },
        });
        expect(result.isError).toBe(true);
        expect(result._meta?.circuitkit).toBeUndefined();
      }
    }
  });

  test.each(["show_circuit", "explore_circuit"])(
    "%s rejects ambiguous, unknown, oversized and malformed input without a stale payload",
    async (name) => {
      const client = await connect(true);
      for (const input of [
        { source: "invalid" },
        { recipe: "rc-lowpass", document: loadExample("rc-lowpass") },
        { recipe: "missing" },
        { source: "é".repeat(40_000) },
        { document: { version: 1 } },
        { path: "/etc/passwd" },
      ]) {
        const result = await client.callTool({ name, arguments: input });
        expect(result.isError).toBe(true);
        expect(result._meta?.circuitkit).toBeUndefined();
        expect(result.structuredContent).toBeUndefined();
      }
    },
  );

  test("recovers after rejected input and produces stable circuit identities", async () => {
    const client = await connect(true);
    const first = await client.callTool({ name: "show_circuit", arguments: {} });
    await client.callTool({ name: "show_circuit", arguments: { source: "bad" } });
    const next = await client.callTool({
      name: "show_circuit",
      arguments: { recipe: "rc-lowpass" },
    });
    const different = await client.callTool({
      name: "show_circuit",
      arguments: { recipe: "led-series" },
    });
    expect(next.structuredContent).toHaveProperty(
      "id",
      (first.structuredContent as { id: string }).id,
    );
    expect(different.structuredContent).not.toHaveProperty(
      "id",
      (first.structuredContent as { id: string }).id,
    );
  });
});

test("selection context names the selected target and rejects invented targets", () => {
  const circuit = prepareCircuit({});
  expect(selectionContext(circuit, { kind: "component", id: "R1" }).selection).toEqual({
    kind: "component",
    id: "R1",
  });
  expect(selectionContext(circuit, { kind: "net", id: "output" }).selection?.id).toBe("output");
  expect(selectionContext(circuit, null).selection).toBeNull();
  for (const selection of [
    { kind: "component", id: "R2" },
    { kind: "net", id: "missing" },
    { kind: "module", id: "R1" },
  ] as const)
    expect(() => selectionContext(circuit, selection)).toThrow("Selection does not belong");
});
