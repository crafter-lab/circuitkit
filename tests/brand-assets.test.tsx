import { describe, expect, test } from "bun:test";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { renderToStaticMarkup } from "react-dom/server";
import { SiteFooter } from "../app/site-footer.tsx";
import { SiteLogo } from "../app/site-logo.tsx";

const asset = (path: string) =>
  readFileSync(new URL(`../public/brand-assets/${path}`, import.meta.url));
const app = (path: string) => readFileSync(new URL(`../app/${path}`, import.meta.url), "utf8");
const inventory = JSON.parse(asset("assets.json").toString()) as {
  assets: { file: string; bytes: number; sha256: string; width?: number; height?: number }[];
};

describe("shared brand assets", () => {
  test("every inventoried asset ships with its original bytes and image dimensions", () => {
    expect(inventory.assets.length).toBeGreaterThan(0);
    for (const entry of inventory.assets) {
      expect(entry.file).not.toMatch(/[/\\]|^\./);
      const bytes = asset(entry.file);
      expect(bytes.length).toBe(entry.bytes);
      expect(createHash("sha256").update(bytes).digest("hex")).toBe(entry.sha256);
      if (entry.file.endsWith(".png")) {
        if (entry.width === undefined || entry.height === undefined) {
          throw new Error(`Missing PNG dimensions: ${entry.file}`);
        }
        expect(bytes.subarray(1, 4).toString()).toBe("PNG");
        expect(bytes.readUInt32BE(16)).toBe(entry.width);
        expect(bytes.readUInt32BE(20)).toBe(entry.height);
      }
    }
  });

  test("header and footer share the original theme variants with stable geometry", () => {
    const logo = renderToStaticMarkup(<SiteLogo />);
    for (const theme of ["light", "dark"]) {
      expect(logo).toContain(`src="/brand-assets/logo-horizontal-${theme}.svg"`);
      expect(asset(`logo-horizontal-${theme}.svg`).toString()).toContain('viewBox="0 0 520 104"');
    }
    expect(logo.match(/width="160" height="32" alt=""/g)).toHaveLength(2);
    expect(app("site-header.tsx")).toContain("<SiteLogo />");
    const footer = renderToStaticMarkup(<SiteFooter />);
    expect(footer).toContain('aria-label="CircuitKit home"');
    expect(footer).toContain('href="/brand-assets/index.html"');
    expect(footer).toContain('src="/brand-assets/logo-horizontal-light.svg"');
    expect(app("globals.css")).toContain(":root.dark .site-logo-dark");
    expect(app("globals.css")).not.toContain(".wordmark::before");
  });

  test("social metadata, browser icons and app icons point to shipped assets", () => {
    const layout = app("layout.tsx");
    for (const filename of [
      "og-dark.png",
      "favicon.svg",
      "favicon-32.png",
      "apple-touch-icon.png",
      "site.webmanifest",
    ]) {
      expect(layout).toContain(`/brand-assets/${filename}`);
      expect(asset(filename).length).toBeGreaterThan(0);
    }
    const og = asset("og-dark.png");
    expect([og.readUInt32BE(16), og.readUInt32BE(20)]).toEqual([1200, 630]);
    expect(layout).toContain('card: "summary_large_image"');
    expect(readFileSync(new URL("../public/favicon.ico", import.meta.url))).toEqual(
      asset("favicon.ico"),
    );
    const manifest = JSON.parse(asset("site.webmanifest").toString()) as {
      icons: { src: string }[];
    };
    expect(manifest.icons).toHaveLength(4);
    for (const icon of manifest.icons) {
      expect(icon.src).toStartWith("/brand-assets/");
      expect(asset(icon.src.slice("/brand-assets/".length)).length).toBeGreaterThan(0);
    }
  });
});
