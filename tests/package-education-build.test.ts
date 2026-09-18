import { describe, expect, test } from "bun:test";
import { readFileSync, statSync } from "node:fs";
import pkg from "../package.json";
import { normalizeReactDirectives } from "../scripts/build.ts";

function clientDirectives(source: string) {
  return Array.from(source.matchAll(/^[\t ]*(["'])use client\1;?[\t ]*\r?$/gm));
}

function output(path: string) {
  return readFileSync(new URL(`../dist/${path}`, import.meta.url), "utf8");
}

describe("React bundle directive normalization", () => {
  test("adds one leading directive and removes both quote styles after imports", () => {
    const source = `"use client";\nimport { useId } from "react";\n'use client';\nexport { useId };\n"use client";\n`;
    const normalized = normalizeReactDirectives(source);
    expect(normalized.startsWith('"use client";\n')).toBe(true);
    expect(clientDirectives(normalized)).toHaveLength(1);
    expect(normalized).toContain('import { useId } from "react";');
    expect(normalized).toContain("export { useId };");
    expect(normalizeReactDirectives(normalized)).toBe(normalized);
  });

  test("preserves string data, template lines, comments and nested expressions byte-for-byte", () => {
    const data = [
      'export const literal = "use client";',
      'export const object = { "use client": ["use client"] };',
      'export const template = `first line\n"use client";\nlast line`;',
      '/*\n"use client";\n*/',
      'export function nested() { "use client"; return "use client"; }',
      '"use client" + " is data";',
    ].join("\n");
    expect(normalizeReactDirectives(`'use client';\n${data}\n"use client";`)).toBe(
      `"use client";\n${data}\n`,
    );
    expect(normalizeReactDirectives(data)).toBe(`"use client";\n${data}`);
  });

  test("handles CRLF and semicolon-free standalone expressions", () => {
    const normalized = normalizeReactDirectives(
      `'use client'\r\nimport { useId } from "react";\r\n"use client"\r\nexport { useId };\r\n`,
    );
    expect(normalized.startsWith('"use client";\n')).toBe(true);
    expect(clientDirectives(normalized)).toHaveLength(1);
    expect(normalized).toContain('import { useId } from "react";\r\n');
  });
});

describe("current package build artifacts (run bun run build first)", () => {
  for (const entry of ["react", "v2/react"]) {
    test(`${entry}: exactly one standalone directive, at byte zero`, () => {
      const source = output(`${entry}.js`);
      expect(source.startsWith('"use client";\n')).toBe(true);
      const directives = clientDirectives(source);
      expect(directives).toHaveLength(1);
      expect(directives[0]?.index).toBe(0);
      expect(source).not.toContain("@resvg/");
    });
  }

  test("retains exact legacy/education export and generated declaration targets", () => {
    const entries = {
      ".": "index",
      "./react": "react",
      "./png": "png",
      "./markdown": "markdown",
      "./share": "share",
      "./v2": "v2/index",
      "./v2/public": "v2/render",
      "./v2/react": "v2/react",
      "./v2/png": "v2/png",
      "./v2/server": "v2/index",
      "./gradual": "integrations/gradual",
    } as const;
    for (const [subpath, entry] of Object.entries(entries)) {
      expect(pkg.exports[subpath as keyof typeof entries]).toEqual({
        types: `./dist/${entry}.d.ts`,
        import: `./dist/${entry}.js`,
      });
      expect(output(`${entry}.js`).length).toBeGreaterThan(0);
      expect(output(`${entry}.d.ts`).length).toBeGreaterThan(0);
    }
    expect(output("v2/schema.js").length).toBeGreaterThan(0);
    expect(output("v2/math-text.d.ts").length).toBeGreaterThan(0);
  });

  test("retains executable bins, external CLI subpaths and lazy native PNG", () => {
    expect(pkg.bin).toEqual({
      circuitkit: "./dist/cli.js",
      "circuitkit-education": "./dist/education-cli.js",
    });
    for (const [entry, subpaths] of Object.entries({
      cli: ["index", "png", "markdown"],
      "education-cli": ["v2/index", "v2/schema", "v2/png"],
    })) {
      const source = output(`${entry}.js`);
      expect(source.startsWith("#!/usr/bin/env node\n")).toBe(true);
      expect(statSync(new URL(`../dist/${entry}.js`, import.meta.url)).mode & 0o777).toBe(0o755);
      for (const subpath of subpaths) {
        expect(source).toContain(`"./${subpath}.js"`);
        expect(source).not.toContain(`"./${subpath}.ts"`);
      }
      expect(source).not.toContain("@resvg/");
    }
    expect(output("education-cli.js")).toContain('from "zod"');
    expect(output("education-cli.js")).toContain('import("./v2/png.js")');
    for (const entry of ["png", "v2/png"]) {
      expect(output(`${entry}.js`)).toContain('import("@resvg/resvg-js")');
    }
  });
});
