export function pngDimensions(width: number, height: number, scale: number) {
  if (!Number.isInteger(scale) || scale < 1 || scale > 4)
    throw new RangeError("PNG scale must be an integer from 1 through 4.");
  if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0)
    throw new RangeError("PNG bounds must be finite and positive.");
  const pixels = { width: Math.ceil(width * scale), height: Math.ceil(height * scale) };
  if (pixels.width * pixels.height > 16_000_000)
    throw new RangeError("PNG output must not exceed 16 megapixels. Choose a smaller scale.");
  return pixels;
}

export function canCopyPNG(): boolean {
  try {
    return (
      typeof ClipboardItem !== "undefined" &&
      typeof navigator !== "undefined" &&
      typeof navigator.clipboard?.write === "function" &&
      (typeof ClipboardItem.supports !== "function" || ClipboardItem.supports("image/png"))
    );
  } catch {
    return false;
  }
}

export async function rasterizeFigurePNG(
  figure: { svg: string; bounds: { width: number; height: number } },
  scale: number,
  signal: AbortSignal,
): Promise<Blob> {
  signal.throwIfAborted();
  const pixels = pngDimensions(figure.bounds.width, figure.bounds.height, scale);
  const image = new Image();
  const url = URL.createObjectURL(new Blob([figure.svg], { type: "image/svg+xml;charset=utf-8" }));
  let canvas: HTMLCanvasElement | undefined;
  try {
    await new Promise<void>((resolve, reject) => {
      const finish = (error?: unknown) => {
        image.onload = null;
        image.onerror = null;
        signal.removeEventListener("abort", abort);
        if (error) reject(error);
        else resolve();
      };
      const abort = () => finish(new DOMException("Export cancelled.", "AbortError"));
      image.onload = () => finish();
      image.onerror = () => finish(new Error("The local SVG could not be rasterized."));
      signal.addEventListener("abort", abort, { once: true });
      image.src = url;
      if (signal.aborted) abort();
    });
    signal.throwIfAborted();
    canvas = document.createElement("canvas");
    canvas.width = pixels.width;
    canvas.height = pixels.height;
    const context = canvas.getContext("2d");
    if (!context) throw new Error("Canvas is unavailable. Download SVG instead.");
    context.drawImage(image, 0, 0, pixels.width, pixels.height);
    const blob = await new Promise<Blob>((resolve, reject) => {
      const abort = () => reject(new DOMException("Export cancelled.", "AbortError"));
      signal.addEventListener("abort", abort, { once: true });
      try {
        canvas?.toBlob((value) => {
          signal.removeEventListener("abort", abort);
          if (signal.aborted) abort();
          else if (value?.type === "image/png") resolve(value);
          else reject(new Error("PNG encoding failed. Download SVG instead."));
        }, "image/png");
      } catch (error) {
        signal.removeEventListener("abort", abort);
        reject(error);
      }
      if (signal.aborted) abort();
    });
    signal.throwIfAborted();
    return blob;
  } finally {
    image.onload = null;
    image.onerror = null;
    image.removeAttribute("src");
    if (canvas) {
      canvas.width = 0;
      canvas.height = 0;
    }
    URL.revokeObjectURL(url);
  }
}

export async function deliverPNG(
  blob: Blob,
  copy: boolean,
  signal: AbortSignal,
  download: (blob: Blob) => void,
): Promise<"copied" | "downloaded" | "fallback"> {
  signal.throwIfAborted();
  if (copy && canCopyPNG()) {
    try {
      await navigator.clipboard.write([new ClipboardItem({ "image/png": blob })]);
      signal.throwIfAborted();
      return "copied";
    } catch {
      signal.throwIfAborted();
    }
  }
  signal.throwIfAborted();
  download(blob);
  return copy ? "fallback" : "downloaded";
}

export function downloadBlob(
  blob: Blob,
  filename: string,
  onRelease?: (release: () => void) => void,
): () => void {
  const link = document.createElement("a");
  const url = URL.createObjectURL(blob);
  let timer: ReturnType<typeof setTimeout> | undefined;
  let released = false;
  const release = () => {
    if (released) return;
    released = true;
    clearTimeout(timer);
    URL.revokeObjectURL(url);
    onRelease?.(release);
  };
  try {
    link.href = url;
    link.download = filename;
    document.body.append(link);
    link.click();
    timer = setTimeout(release, 1000);
    return release;
  } catch (error) {
    release();
    throw error;
  } finally {
    link.remove();
  }
}
