import { createRoot } from "react-dom/client";
import { App } from "./app.tsx";
import type { PreviewData } from "./model.ts";

const container = document.getElementById("root");
if (!container) throw new Error("Missing preview root");

try {
  const response = await fetch("./data.json");
  if (!response.ok) throw new Error(`Preview data: HTTP ${response.status}`);
  const data: PreviewData = await response.json();
  createRoot(container).render(<App data={data} />);
} catch (error) {
  container.setAttribute("role", "alert");
  container.textContent = `Preview unavailable: ${error instanceof Error ? error.message : String(error)}. Serve this directory with the Bun --serve command.`;
}
