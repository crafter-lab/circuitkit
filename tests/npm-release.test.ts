import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { planPublication, releaseIdentity, verifyPack } from "../scripts/npm-release.mjs";

const pkg = {
  name: "circuitkit",
  version: "0.1.0",
  repository: { url: "https://github.com/crafter-lab/circuitkit.git" },
  publishConfig: { registry: "https://registry.npmjs.org", access: "public" },
};
const paths = [
  "package.json",
  "dist/cli.js",
  "dist/index.js",
  "dist/index.d.ts",
  "dist/language/index.js",
  "dist/v2/index.d.ts",
  "agent-skills/core.md",
  "skills/circuitkit/SKILL.md",
  "docs/site/quickstart.md",
  "docs/compact-language.md",
  "examples/diagrams/audio-story.ck",
  "LICENSE",
];
const packed = () => [
  {
    name: "circuitkit",
    version: "0.1.0",
    filename: "circuitkit-0.1.0.tgz",
    integrity: "sha512-YWJj",
    files: paths.map((path) => ({ path })),
  },
];

describe("npm release contract", () => {
  test("only the public CircuitKit identity and stable versions can release", () => {
    expect(releaseIdentity(pkg)).toEqual({ name: "circuitkit", version: "0.1.0", tag: "v0.1.0" });
    for (const version of ["01.0.0", "0.1.0-rc.0", "0.1.0\npublish=true", "latest"]) {
      expect(() => releaseIdentity({ ...pkg, version })).toThrow();
    }
    expect(() => releaseIdentity({ ...pkg, name: "another-package" })).toThrow();
    expect(() => releaseIdentity({ ...pkg, private: true })).toThrow();
    expect(() =>
      releaseIdentity({
        ...pkg,
        publishConfig: { ...pkg.publishConfig, registry: "https://example.com" },
      }),
    ).toThrow();
  });

  test("only an explicit registry 404 allows a new version", async () => {
    const plan = await planPublication(pkg, async (url: string) => {
      expect(url).toBe("https://registry.npmjs.org/circuitkit/0.1.0");
      return new Response(null, { status: 404 });
    });
    expect(plan.publish).toBe(true);
    for (const status of [401, 403, 429, 500, 503]) {
      await expect(
        planPublication(pkg, async () => new Response(null, { status })),
      ).rejects.toThrow("Registry lookup failed");
    }
    await expect(
      planPublication(pkg, async () => {
        throw new Error("network unavailable");
      }),
    ).rejects.toThrow("network unavailable");
  });

  test("an existing immutable version is skipped and mismatched metadata fails", async () => {
    expect(
      (
        await planPublication(pkg, async () =>
          Response.json({ name: pkg.name, version: pkg.version }),
        )
      ).publish,
    ).toBe(false);
    await expect(
      planPublication(pkg, async () => Response.json({ name: pkg.name, version: "0.0.1" })),
    ).rejects.toThrow();
    await expect(
      planPublication(pkg, async () => Response.json({ name: "different", version: pkg.version })),
    ).rejects.toThrow();
    await expect(planPublication(pkg, async () => new Response("broken"))).rejects.toThrow();
  });

  test("pack verification requires CLI, declarations, guides and editable examples", () => {
    expect(verifyPack(packed(), "0.1.0").files).toBe(paths.length);
    for (const path of paths) {
      const pack = packed();
      const entry = pack[0];
      if (!entry) throw new Error("Missing pack fixture");
      entry.files = entry.files.filter((file) => file.path !== path);
      expect(() => verifyPack(pack, "0.1.0")).toThrow("Missing package file");
    }
    expect(() => verifyPack(packed(), "0.1.1")).toThrow();
    expect(() => verifyPack([], "0.1.0")).toThrow();
  });

  test("private artifacts, credentials and bundled native bindings are refused", () => {
    for (const path of [
      ".env.local",
      ".npmrc",
      ".git/config",
      "artifacts/gradual-corpus/manifest.json",
      "node_modules/dependency/index.js",
      "tests/private.ts",
      "scripts/extract-gradual.ts",
      "dist/binding.node",
      "../escape",
      "/absolute",
    ]) {
      const pack = packed();
      const entry = pack[0];
      if (!entry) throw new Error("Missing pack fixture");
      entry.files.push({ path });
      expect(() => verifyPack(pack, "0.1.0")).toThrow();
    }
  });

  test("the workflow publishes the tested tarball using OIDC without npm secrets", () => {
    const source = readFileSync(
      new URL("../.github/workflows/release.yml", import.meta.url),
      "utf8",
    );
    const workflow = Bun.YAML.parse(source) as {
      on: { push: { branches: string[]; paths: string[] }; workflow_dispatch: unknown };
      jobs: {
        release: {
          permissions: Record<string, string>;
          steps: { uses?: string; name?: string; run?: string }[];
        };
      };
    };
    expect(workflow.on.push).toEqual({ branches: ["main"], paths: ["package.json"] });
    expect(workflow.on).toHaveProperty("workflow_dispatch");
    expect(workflow.jobs.release.permissions["id-token"]).toBe("write");
    const steps = workflow.jobs.release.steps;
    const names = steps.map((step) => step.name);
    expect(names.indexOf("Verify the installed Node package")).toBeLessThan(
      names.indexOf("Publish using OIDC"),
    );
    expect(names.indexOf("Publish using OIDC")).toBeLessThan(
      names.indexOf("Create tag and GitHub release"),
    );
    expect(source).toContain("--provenance");
    expect(source).toContain("NPM_CONFIG_USERCONFIG=/dev/null npm publish");
    expect(source).not.toContain("secrets.");
    for (const step of steps) {
      if (step.uses) expect(step.uses).toMatch(/@[a-f0-9]{40}$/);
    }
  });
});
