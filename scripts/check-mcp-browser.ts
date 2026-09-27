import { mkdirSync } from "node:fs";
import { resolve } from "node:path";

const url = process.argv[2];
if (!url) throw new Error("Usage: bun scripts/check-mcp-browser.ts http://127.0.0.1:PORT");
const directory = resolve(process.argv[3] ?? "artifacts/mcp-apps/browser");
mkdirSync(directory, { recursive: true });
let session = `circuitkit-mcp-${process.pid}`;
const commands: unknown[] = [];
const checks: string[] = [];
function run(...args: string[]) {
  const result = Bun.spawnSync(["agent-browser", "--session", session, "--json", ...args], {
    stdout: "pipe",
    stderr: "pipe",
  });
  const stdout = result.stdout.toString();
  commands.push({ args, exit: result.exitCode, stdout, stderr: result.stderr.toString() });
  if (result.exitCode !== 0) throw new Error(`${args.join(" ")}: ${stdout}`);
  const response = JSON.parse(stdout);
  if (!response.success) throw new Error(JSON.stringify(response));
  return response.data;
}
function check(name: string, condition: boolean) {
  if (!condition) throw new Error(`Failed: ${name}`);
  checks.push(name);
}
function click(name: string) {
  run("find", "role", "button", "click", "--name", name, "--exact");
}
function widget() {
  run("frame", "main");
  const snapshot = run("snapshot", "-i");
  const frame = Object.entries(snapshot.refs as Record<string, { role: string }>).find(
    ([, value]) => value.role === "Iframe",
  );
  if (!frame) throw new Error("Circuit iframe missing from snapshot.");
  run("frame", `@${frame[0]}`);
}
function events() {
  run("frame", "main");
  const result = JSON.parse(run("get", "text", "#events").text);
  widget();
  return result as { method: string; params: { content?: { text: string }[] } }[];
}
function latestContext() {
  const entry = events()
    .reverse()
    .find((event) => event.method === "ui/update-model-context");
  const text = entry?.params.content?.[0]?.text;
  if (!text) throw new Error("Missing host context.");
  return text.startsWith("{") ? JSON.parse(text) : text;
}
function render(demo: string) {
  run("frame", "main");
  run("select", "select", demo);
  click("Explore circuit");
  run("wait", 'iframe[src="/view.html"]');
  widget();
  run("wait", demo === "invalid" ? "[role=alert]" : "h1");
}
try {
  run("open", url);
  run("wait", "#circuit-image");
  run("set", "viewport", "1280", "900");
  check(
    "default output is a PNG",
    run("get", "attr", "#circuit-image", "src").value.startsWith("data:image/png;base64,"),
  );
  check(
    "default output does not mount a widget",
    !run("snapshot", "-i").snapshot.includes("Iframe"),
  );
  run("screenshot", "--full", `${directory}/image.png`);
  render("rc");
  run("wait", ".component-hit");
  check("RC circuit rendered", run("get", "text", "h1").text === "Filtro RC");
  click("R1");
  check("component selection reaches host context", latestContext().selection?.id === "R1");
  click("Explain selection");
  const message = events()
    .reverse()
    .find((event) => event.method === "ui/message");
  check(
    "explain message carries selected component",
    message?.params.content?.[0]?.text.includes('"id":"R1"') === true,
  );
  run("click", '[aria-label="Net output"] path');
  check("net selection reaches host", latestContext().selection?.kind === "net");
  run("select", 'select[aria-label="Scene"]', "capacitor");
  check("teaching scene reaches host", latestContext().selection?.id === "capacitor");
  click("Clear selection");
  check("clear selection clears context", latestContext().selection === null);
  check(
    "explanation action is contextual",
    !run("snapshot", "-i").snapshot.includes("Explain selection"),
  );
  run("focus", '[aria-label="Net input"]');
  run("press", "Enter");
  check("keyboard selects a connection", latestContext().selection?.id === "input");
  run("press", "Escape");
  check("Escape clears selection", latestContext().selection === null);
  run("frame", "main");
  run("screenshot", "--full", `${directory}/rc.png`);
  render("source");
  check(
    "source replaces recipe and clears selection",
    latestContext().circuit.kind === "source" && latestContext().selection === null,
  );
  click("ESP32");
  check("module selection happens on the drawing", latestContext().selection?.id === "ESP32");
  run("select", 'select[aria-label="Scene"]', "sending");
  check("source scene reaches host", latestContext().selection?.kind === "scene");
  check("flow routes exist", run("get", "attr", ".flow", "pathLength").value === "1000");
  click("Pause flow");
  check(
    "pause controls actual animation",
    run("get", "attr", ".flow", "style").value.includes("paused"),
  );
  click("Play flow");
  check(
    "play controls actual animation",
    run("get", "attr", ".flow", "style").value.includes("running"),
  );
  run("frame", "main");
  run("click", "summary");
  run("focus", "#theme");
  run("press", "Enter");
  widget();
  check("host theme reaches widget", run("get", "attr", "html", "data-theme").value === "dark");
  run("frame", "main");
  run("click", "summary");
  run("screenshot", "--full", `${directory}/source.png`);
  run("set", "viewport", "390", "844");
  widget();
  check(
    "mobile controls remain available",
    run("get", "text", "button.primary").text === "Explain selection",
  );
  run("select", 'select[aria-label="Zoom"]', "2");
  check(
    "zoom applies to circuit viewport",
    run("get", "attr", ".drawing", "style").value.includes("200%"),
  );
  run("frame", "main");
  run("screenshot", "--full", `${directory}/mobile.png`);
  run("frame", "main");
  run("click", "summary");
  run("focus", "#cancel");
  run("press", "Enter");
  widget();
  run("wait", "[role=alert]");
  check(
    "cancellation removes stale drawing and context",
    !run("snapshot", "-i").snapshot.includes("Circuit viewport") &&
      typeof latestContext() === "string",
  );
  render("invalid");
  check(
    "invalid source removes stale circuit",
    !run("snapshot", "-i").snapshot.includes("Circuit viewport"),
  );
  check("invalid source clears stale model context", typeof latestContext() === "string");
  render("rc");
  check("valid result recovers after error", run("get", "text", "h1").text === "Filtro RC");
  run("frame", "main");
  click("Render image");
  run("wait", "#circuit-image");
  check(
    "returning to image removes the explorer",
    !run("snapshot", "-i").snapshot.includes("Iframe"),
  );
  run("open", `${url}?capabilities=none`);
  run("wait", "#circuit-image");
  render("rc");
  click("R1");
  check(
    "explanation is disabled without host message capability",
    run("get", "attr", "button.primary", "disabled").value !== null,
  );
  run("open", `${url}?reject=message`);
  run("wait", "#circuit-image");
  render("rc");
  click("R1");
  click("Explain selection");
  check(
    "rejected message reports failure",
    run("get", "text", ".status").text.includes("could not send"),
  );
  run("open", `${url}?reject=context`);
  run("wait", "#circuit-image");
  render("rc");
  click("R1");
  check(
    "rejected context keeps explicit explanation available",
    run("get", "text", ".status").text.includes("could not be shared"),
  );
  click("Explain selection");
  check(
    "explanation carries selection after rejected context",
    events().some(
      (event) =>
        event.method === "ui/message" && event.params.content?.[0]?.text.includes('"id":"R1"'),
    ),
  );
  run("close");
  session = `${session}-reduced`;
  run("--args", "--force-prefers-reduced-motion", "open", url);
  run("wait", "#circuit-image");
  render("source");
  run("select", 'select[aria-label="Scene"]', "sending");
  const styles = run("get", "styles", ".flow");
  check("reduced motion disables moving sweep", styles.styles.display === "none");
  console.log(JSON.stringify({ ok: true, checks }, null, 2));
} finally {
  await Bun.write(
    `${directory}/receipt.json`,
    JSON.stringify({ url, session, checks, commands }, null, 2),
  );
  run("close");
}
