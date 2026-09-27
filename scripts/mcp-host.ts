import { PostMessageTransport } from "@modelcontextprotocol/ext-apps";
import { AppBridge } from "@modelcontextprotocol/ext-apps/app-bridge";

const output = document.querySelector("pre");
const choice = document.querySelector("select");
const presentation = document.querySelector("#presentation");
if (!output || !choice || !presentation) throw new Error("Missing host elements.");
const events: unknown[] = [];
const record = (method: string, params: unknown) => {
  events.push({ method, params });
  if (events.length > 100) events.shift();
  output.textContent = JSON.stringify(events, null, 2);
};
let bridge: AppBridge | undefined;
let request: AbortController | undefined;
let generation = 0;
const options = new URLSearchParams(location.search);
async function render(interactive: boolean) {
  const current = ++generation;
  request?.abort();
  request = new AbortController();
  const signal = request.signal;
  const previous = bridge;
  bridge = undefined;
  presentation?.replaceChildren();
  await previous?.close();
  if (current !== generation) return;
  record("host/render", { interactive, generation: current });
  try {
    const name = interactive ? "explore_circuit" : "show_circuit";
    const response = await fetch(
      `/result?tool=${name}&demo=${encodeURIComponent(choice?.value ?? "rc")}`,
      { signal },
    );
    if (!response.ok) throw new Error(`MCP request failed: ${response.status}`);
    const { input, result } = await response.json();
    if (current !== generation) return;
    record("tools/call", { name, isError: result.isError === true });
    if (!interactive) {
      if (result.isError) throw new Error(result.content?.[0]?.text ?? "Circuit unavailable.");
      const image = result.content.find((part: { type: string }) => part.type === "image");
      if (!image) throw new Error("MCP server did not return an image.");
      const element = document.createElement("img");
      element.id = "circuit-image";
      element.alt = result.structuredContent?.title ?? "Circuit";
      element.src = `data:${image.mimeType};base64,${image.data}`;
      presentation?.append(element);
      return;
    }
    const frame = document.createElement("iframe");
    frame.title = "CircuitKit";
    frame.setAttribute("sandbox", "allow-scripts");
    presentation?.append(frame);
    if (!frame.contentWindow) throw new Error("Circuit iframe is unavailable.");
    const capabilities =
      options.get("capabilities") === "none"
        ? {}
        : { updateModelContext: { text: {} }, message: { text: {} } };
    const currentBridge = new AppBridge(
      null,
      { name: "CircuitKit reference host", version: "1.0.0" },
      capabilities,
      { hostContext: { theme: "light", displayMode: "inline" } },
    );
    bridge = currentBridge;
    currentBridge.onupdatemodelcontext = async (params) => {
      record("ui/update-model-context", params);
      if (options.get("reject") === "context") throw new Error("Reference host rejected context.");
      return {};
    };
    currentBridge.onmessage = async (params) => {
      record("ui/message", params);
      return options.get("reject") === "message" ? { isError: true } : {};
    };
    currentBridge.onsizechange = ({ height }) => {
      frame.style.height = `${Math.max(150, Math.min(height ?? 600, 1600))}px`;
    };
    currentBridge.oninitialized = () => {
      record("ui/notifications/initialized", {});
      void (async () => {
        if (current !== generation) return;
        await currentBridge.sendToolInput({ arguments: input });
        await currentBridge.sendToolResult(result);
      })().catch((error) => record("host-error", String(error)));
    };
    await currentBridge.connect(new PostMessageTransport(frame.contentWindow, frame.contentWindow));
    if (current !== generation) {
      await currentBridge.close();
      return;
    }
    frame.src = "/view.html";
  } catch (error) {
    if (current !== generation || signal.aborted) return;
    const alert = document.createElement("p");
    alert.setAttribute("role", "alert");
    alert.textContent = error instanceof Error ? error.message : "Circuit unavailable.";
    presentation?.replaceChildren(alert);
  }
}
document.querySelector("#render")?.addEventListener("click", () => {
  void render(false);
});
document.querySelector("#explore")?.addEventListener("click", () => {
  void render(true);
});
document.querySelector("#theme")?.addEventListener("click", () => {
  bridge?.setHostContext({ theme: "dark" });
  record("host/theme", { theme: "dark", connected: Boolean(bridge) });
});
document.querySelector("#cancel")?.addEventListener("click", () => {
  void bridge?.sendToolCancelled({ reason: "Reference host cancellation" });
});
void render(false);
