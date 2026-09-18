import { expect, test } from "bun:test";
import { readFileSync } from "node:fs";

test("locked artifacts use public credential-free npm URLs", () => {
  const lock = readFileSync(new URL("../bun.lock", import.meta.url), "utf8");
  const urls = lock.match(/https?:\/\/[^"\s\\]+/g) ?? [];
  expect(urls.length).toBeGreaterThan(0);
  const portable = urls.every((value) => {
    const url = new URL(value);
    return (
      url.protocol === "https:" &&
      url.hostname === "registry.npmjs.org" &&
      !url.username &&
      !url.password &&
      !url.search
    );
  });
  expect(portable).toBe(true);
});
