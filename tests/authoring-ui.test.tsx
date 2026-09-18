import { describe, expect, test } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";
import AuthoringControls from "../app/authoring-controls.tsx";
import {
  canCopyPNG,
  deliverPNG,
  downloadBlob,
  pngDimensions,
  rasterizeFigurePNG,
} from "../app/browser-export.ts";

import Playground from "../app/playground.tsx";
import { addStep } from "../src/editor.ts";
import { loadExample, renderFigureSVG } from "../src/index.ts";

const figure = renderFigureSVG(loadExample("rc-lowpass"));
if (!figure.ok) throw new Error("Expected a valid fixture");
const rendered = figure;

function browser(
  options: { image?: "wait" | "fail"; canvas?: "wait" | "missing" | "fail" | "throw" } = {},
) {
  const restore: (() => void)[] = [];
  const urls: Blob[] = [];
  const revoked: string[] = [];
  const imageSources: string[] = [];
  let images = 0;
  let draws = 0;
  let clicks = 0;
  let removed = 0;
  let complete: BlobCallback | undefined;
  function replace(object: object, key: string, value: unknown) {
    const descriptor = Object.getOwnPropertyDescriptor(object, key);
    Object.defineProperty(object, key, { configurable: true, writable: true, value });
    restore.push(() => {
      if (descriptor) Object.defineProperty(object, key, descriptor);
      else Reflect.deleteProperty(object, key);
    });
  }
  class LocalImage {
    onload: (() => void) | null = null;
    onerror: (() => void) | null = null;
    constructor() {
      images++;
    }
    set src(value: string) {
      imageSources.push(value);
      if (!value || options.image === "wait") return;
      queueMicrotask(() => (options.image === "fail" ? this.onerror?.() : this.onload?.()));
    }
    removeAttribute(name: string) {
      if (name === "src") imageSources.push("");
    }
  }
  const canvas = {
    width: 0,
    height: 0,
    getContext: () =>
      options.canvas === "missing"
        ? null
        : {
            drawImage: () => {
              draws++;
            },
          },
    toBlob: (callback: BlobCallback) => {
      complete = callback;
      if (options.canvas === "throw") throw new Error("Canvas encoding threw");
      if (options.canvas !== "wait")
        callback(options.canvas === "fail" ? null : new Blob(["png"], { type: "image/png" }));
    },
  };
  const link = {
    href: "",
    download: "",
    click: () => {
      clicks++;
    },
    remove: () => {
      removed++;
    },
  };
  replace(globalThis, "Image", LocalImage);
  replace(globalThis, "document", {
    createElement: (tag: string) => (tag === "canvas" ? canvas : link),
    body: { append: () => {} },
  });
  replace(URL, "createObjectURL", (blob: Blob) => {
    urls.push(blob);
    return `blob:local-${urls.length}`;
  });
  replace(URL, "revokeObjectURL", (url: string) => {
    revoked.push(url);
  });
  return {
    urls,
    revoked,
    imageSources,
    canvas,
    link,
    replace,
    images: () => images,
    draws: () => draws,
    clicks: () => clicks,
    removed: () => removed,
    complete: () => complete,
    restore: () => {
      for (const reset of restore.reverse()) reset();
    },
  };
}

describe("local browser PNG export", () => {
  test("scale is integer 1 through 4 and rounded pixels are capped before allocation", () => {
    for (const scale of [1, 2, 3, 4])
      expect(pngDimensions(100.1, 50.1, scale)).toEqual({
        width: Math.ceil(100.1 * scale),
        height: Math.ceil(50.1 * scale),
      });
    for (const scale of [0, -1, 1.5, 5, NaN, Infinity])
      expect(() => pngDimensions(100, 100, scale)).toThrow("integer");
    for (const width of [0, -1, NaN, Infinity])
      expect(() => pngDimensions(width, 100, 1)).toThrow("positive");
    expect(pngDimensions(4000, 4000, 1)).toEqual({ width: 4000, height: 4000 });
    expect(() => pngDimensions(4000.1, 4000, 1)).toThrow("16 megapixels");
    expect(() => pngDimensions(4000, 4000, 2)).toThrow("16 megapixels");
  });

  test("rasterization uses only the full generated SVG Blob, then releases image URL and canvas", async () => {
    const env = browser();
    try {
      const blob = await rasterizeFigurePNG(rendered, 2, new AbortController().signal);
      expect(blob.type).toBe("image/png");
      expect(await env.urls[0]?.text()).toBe(rendered.svg);
      expect(env.imageSources).toEqual(["blob:local-1", ""]);
      expect(env.draws()).toBe(1);
      expect(env.revoked).toEqual(["blob:local-1"]);
      expect(env.canvas.width).toBe(0);
      expect(env.canvas.height).toBe(0);
    } finally {
      env.restore();
    }
  });

  test("invalid dimensions and already aborted revisions allocate nothing", async () => {
    const env = browser();
    try {
      const controller = new AbortController();
      controller.abort();
      await expect(rasterizeFigurePNG(rendered, 1, controller.signal)).rejects.toThrow();
      await expect(rasterizeFigurePNG(rendered, 5, new AbortController().signal)).rejects.toThrow(
        "integer",
      );
      const oversized = { ...rendered, bounds: { ...rendered.bounds, width: 5000, height: 5000 } };
      await expect(rasterizeFigurePNG(oversized, 1, new AbortController().signal)).rejects.toThrow(
        "16 megapixels",
      );
      expect(env.urls).toHaveLength(0);
      expect(env.images()).toBe(0);
    } finally {
      env.restore();
    }
  });

  test("an edit cancels an image still loading and immediately revokes its URL", async () => {
    const env = browser({ image: "wait" });
    try {
      const controller = new AbortController();
      const pending = rasterizeFigurePNG(rendered, 1, controller.signal);
      controller.abort();
      await expect(pending).rejects.toThrow("cancelled");
      expect(env.draws()).toBe(0);
      expect(env.revoked).toEqual(["blob:local-1"]);
    } finally {
      env.restore();
    }
  });

  test("an edit during PNG encoding rejects before a late callback can supply stale bytes", async () => {
    const env = browser({ canvas: "wait" });
    try {
      const controller = new AbortController();
      const pending = rasterizeFigurePNG(rendered, 1, controller.signal);
      await Promise.resolve();
      await Promise.resolve();
      expect(env.complete()).toBeDefined();
      controller.abort();
      await expect(pending).rejects.toThrow("cancelled");
      env.complete()?.(new Blob(["stale"], { type: "image/png" }));
      expect(env.revoked).toEqual(["blob:local-1"]);
      expect(env.canvas.width).toBe(0);
      expect(env.clicks()).toBe(0);
    } finally {
      env.restore();
    }
  });

  test.each([
    { image: "fail" as const },
    { canvas: "missing" as const },
    { canvas: "fail" as const },
    { canvas: "throw" as const },
  ])("failure %j releases resources and never downloads", async (options) => {
    const env = browser(options);
    try {
      await expect(rasterizeFigurePNG(rendered, 1, new AbortController().signal)).rejects.toThrow();
      expect(env.revoked).toEqual(["blob:local-1"]);
      expect(env.canvas.width).toBe(0);
      expect(env.clicks()).toBe(0);
    } finally {
      env.restore();
    }
  });

  test("downloads remove their anchor and have idempotent Blob URL cleanup", () => {
    const env = browser();
    try {
      const release = downloadBlob(new Blob(["png"], { type: "image/png" }), "figure.png");
      expect(env.clicks()).toBe(1);
      expect(env.removed()).toBe(1);
      expect(env.link.download).toBe("figure.png");
      expect(env.link.href).toStartWith("blob:");
      release();
      release();
      expect(env.revoked).toEqual(["blob:local-1"]);
    } finally {
      env.restore();
    }
  });

  test.each(["supported", "missing", "denied"])(
    "PNG delivery with %s clipboard copies or downloads the same current bytes",
    async (capability) => {
      const env = browser();
      const blob = new Blob(["current"], { type: "image/png" });
      const downloads: Blob[] = [];
      const copied: unknown[] = [];
      try {
        env.replace(
          globalThis,
          "ClipboardItem",
          capability === "missing"
            ? undefined
            : class {
                constructor(value: unknown) {
                  copied.push(value);
                }
              },
        );
        env.replace(globalThis, "navigator", {
          clipboard: {
            write: async () => {
              if (capability === "denied") throw new Error("Denied");
            },
          },
        });
        const result = await deliverPNG(blob, true, new AbortController().signal, (value) =>
          downloads.push(value),
        );
        expect(result).toBe(capability === "supported" ? "copied" : "fallback");
        expect(downloads).toEqual(capability === "supported" ? [] : [blob]);
        if (capability !== "missing") expect(copied).toEqual([{ "image/png": blob }]);
      } finally {
        env.restore();
      }
    },
  );

  test("clipboard rejection after a revision is aborted never downloads stale PNG", async () => {
    const env = browser();
    const downloads: Blob[] = [];
    let reject: ((reason: Error) => void) | undefined;
    try {
      env.replace(globalThis, "ClipboardItem", class {});
      env.replace(globalThis, "navigator", {
        clipboard: {
          write: () =>
            new Promise<void>((_, fail) => {
              reject = fail;
            }),
        },
      });
      const controller = new AbortController();
      const pending = deliverPNG(
        new Blob(["stale"], { type: "image/png" }),
        true,
        controller.signal,
        (value) => downloads.push(value),
      );
      controller.abort();
      reject?.(new Error("Denied"));
      await expect(pending).rejects.toThrow();
      expect(downloads).toEqual([]);
    } finally {
      env.restore();
    }
  });

  test("aborted delivery never touches the clipboard or download destination", async () => {
    const env = browser();
    try {
      let writes = 0;
      env.replace(globalThis, "ClipboardItem", class {});
      env.replace(globalThis, "navigator", {
        clipboard: {
          write: () => {
            writes++;
          },
        },
      });
      const controller = new AbortController();
      controller.abort();
      const downloads: Blob[] = [];
      await expect(
        deliverPNG(new Blob(["stale"]), true, controller.signal, (value) => downloads.push(value)),
      ).rejects.toThrow();
      expect(writes).toBe(0);
      expect(downloads).toEqual([]);
    } finally {
      env.restore();
    }
  });

  test("PNG clipboard requires the API and checks image/png support when advertised", () => {
    const env = browser();
    try {
      env.replace(globalThis, "navigator", { clipboard: { write: () => Promise.resolve() } });
      env.replace(globalThis, "ClipboardItem", undefined);
      expect(canCopyPNG()).toBe(false);
      env.replace(globalThis, "ClipboardItem", class {});
      expect(canCopyPNG()).toBe(true);
      env.replace(globalThis, "ClipboardItem", {
        supports: (type: string) => type === "text/plain",
      });
      expect(canCopyPNG()).toBe(false);
      env.replace(globalThis, "ClipboardItem", {
        supports: () => {
          throw new Error("Unsupported");
        },
      });
      expect(canCopyPNG()).toBe(false);
      env.replace(globalThis, "navigator", {});
      expect(canCopyPNG()).toBe(false);
    } finally {
      env.restore();
    }
  });
});

describe("authoring UI contracts", () => {
  test("server output never exposes an unrelated fallback SVG before checking fragments", () => {
    const html = renderToStaticMarkup(<Playground />);
    expect(html).not.toContain("<svg");
    expect(html).toContain("Checking for a shared document");
    for (const label of [
      "Copy JSON",
      "Copy link",
      "Copy Markdown",
      "Download SVG",
      "Copy PNG",
      "Download PNG",
    ]) {
      expect(html).toMatch(new RegExp(`<button[^>]*disabled=""[^>]*>${label}`));
    }
    expect(html).toContain("Figure document JSON");
    expect(html).toContain("Apply JSON");
    expect(html).toContain('href="/markdown"');
  });

  test("annotation and ordered step controls preserve the shared style and accessible labels", () => {
    const document = loadExample("rc-lowpass");
    document.presentation.annotations = {
      nets: [{ net: "input", label: "Signal", description: "Before resistor", tone: "cyan" }],
      legend: true,
      caption: "Caption",
    };
    addStep(document);
    const before = JSON.stringify(document);
    const html = renderToStaticMarkup(<AuthoringControls document={document} edit={() => {}} />);
    for (const label of [
      "Show net legend",
      "Figure caption",
      "input label",
      "input description",
      "input tone",
      "Remove input annotation",
      "Current step",
      "Step 1 title",
      "Step 1 description",
      "Move step 1 up",
      "Move step 1 down",
      "Remove step 1",
      "Add step",
    ])
      expect(html).toContain(label);
    expect(html).toContain(
      '<details class="inspector-disclosure"><summary>Net annotation: input</summary>',
    );
    expect(html).toContain(
      '<details class="inspector-disclosure" open=""><summary>Step 1: Step 1</summary>',
    );
    expect(html).toContain('class="chips"');
    expect(html).toContain('class="field"');
    expect(html).not.toMatch(/#[0-9a-f]{6}|border-radius/);
    expect(JSON.stringify(document)).toBe(before);
  });

  test("new input handlers snapshot events before updating document state", async () => {
    const source = await Bun.file(new URL("../app/authoring-controls.tsx", import.meta.url)).text();
    const handlers = [...source.matchAll(/onChange=\{\(event\) =>/g)];
    const snapshots = [
      ...source.matchAll(
        /onChange=\{\(event\) => \{\s*const (?:value|checked) = event\.currentTarget\.(?:value|checked)(?: as [^;]+)?;/g,
      ),
    ];
    expect(snapshots).toHaveLength(handlers.length);
    expect(handlers.length).toBeGreaterThan(7);
  });

  test("browser entrypoints isolate Markdown and native PNG and keep persistent full SVG parity", async () => {
    const editor = await Bun.file(new URL("../src/editor.ts", import.meta.url)).text();
    const playground = await Bun.file(new URL("../app/playground.tsx", import.meta.url)).text();
    const browser = await Bun.file(new URL("../app/browser-export.ts", import.meta.url)).text();
    const markdown = await Bun.file(
      new URL("../app/markdown/markdown-client.tsx", import.meta.url),
    ).text();
    expect(editor).toContain('await import("./markdown.ts")');
    expect(markdown).toContain('await import("../../src/markdown.ts")');
    expect(editor).toContain("renderFigureSVG(state.document)");
    expect(playground).toContain("__html: result.svg");
    expect(playground).toContain("new Blob([result.svg]");
    expect(playground).toContain("rasterizeFigurePNG(result, scale, task.signal)");
    expect(playground).toContain("currentRevision === revision.current");
    expect(playground).toContain('window.addEventListener("hashchange", readFragment)');
    expect(playground).toContain('window.removeEventListener("hashchange", readFragment)');
    expect(playground).not.toMatch(/useSiteTheme|location\.hash\s*=/);
    for (const source of [editor, playground, browser, markdown])
      expect(source).not.toMatch(/from ["'][^"']*(?:resvg|\/png\.ts)|fetch\(|node:/);
  });
});
