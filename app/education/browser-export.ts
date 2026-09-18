import { downloadBlob, pngDimensions } from "../browser-export.ts";
import { publicExport } from "./public-state.ts";

export async function exportPublicPNG(document: unknown, signal: AbortSignal) {
  const output = publicExport(document, "svg");
  if (!output) throw new Error("Invalid public figure.");
  if (!output.text) return;
  const size = pngDimensions(output.bounds.width, output.bounds.height, 2);
  const url = URL.createObjectURL(new Blob([output.text], { type: "image/svg+xml;charset=utf-8" }));
  const image = new Image();
  const canvas = window.document.createElement("canvas");
  try {
    signal.throwIfAborted();
    await new Promise<void>((resolve, reject) => {
      const abort = () => finish(new DOMException("Export cancelled.", "AbortError"));
      const finish = (error?: Error) => {
        image.onload = null;
        image.onerror = null;
        signal.removeEventListener("abort", abort);
        if (error) reject(error);
        else resolve();
      };
      image.onload = () => finish();
      image.onerror = () => finish(new Error("PNG unavailable. Download SVG instead."));
      signal.addEventListener("abort", abort, { once: true });
      image.src = url;
      if (signal.aborted) abort();
    });
    signal.throwIfAborted();
    canvas.width = size.width;
    canvas.height = size.height;
    const context = canvas.getContext("2d");
    if (!context) throw new Error("Canvas unavailable. Download SVG instead.");
    context.drawImage(image, 0, 0, size.width, size.height);
    const blob = await new Promise<Blob>((resolve, reject) =>
      canvas.toBlob(
        (blob) => (blob ? resolve(blob) : reject(new Error("PNG encoding failed."))),
        "image/png",
      ),
    );
    signal.throwIfAborted();
    downloadBlob(blob, "CircuitFigure.png");
  } finally {
    image.onload = null;
    image.onerror = null;
    image.removeAttribute("src");
    canvas.width = 0;
    canvas.height = 0;
    URL.revokeObjectURL(url);
  }
}
