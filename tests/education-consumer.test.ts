import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const template = resolve(import.meta.dir, "../artifacts/education-consumer/template");
const source = (path: string) => readFileSync(resolve(template, path), "utf8");

describe("isolated education consumer source boundaries", () => {
  test("learner client components receive public data without a corpus import", () => {
    const view = source("lib/public-view.tsx");
    expect(view.startsWith("'use client';")).toBe(true);
    expect(view).not.toContain("data/manifest");
    expect(view).not.toContain("lib/corpus");
    expect(view).not.toContain("getLearning");
    expect(view).not.toContain("projectGradualPair");
    expect(view).toContain("import type { GradualHost }");
    expect(source("lib/corpus.ts").startsWith("import 'server-only';")).toBe(true);
    expect(source("lib/reveal.ts").startsWith("import 'server-only';")).toBe(true);
  });

  test("stage query strings are not authorization", () => {
    const route = source("app/api/learner/route.ts");
    expect(route).toContain("authorized(request.headers.get('x-test-capability'))");
    expect(route).toContain("status: 403");
    expect(route).toContain("learnerPayload(await isRevealed())");
    expect(route).not.toContain("searchParams");
    expect(route).not.toContain("request.json");
    expect(source("app/learner/page.tsx")).not.toContain("searchParams");
    expect(source("lib/corpus.ts")).toContain(
      "solution: revealed ? learnerPair.solution : undefined",
    );
  });

  test("the gallery explicitly disclaims learner security", () => {
    const gallery = source("app/gallery/page.tsx");
    expect(gallery).toContain("AUTHOR GALLERY: SOLUTIONS INCLUDED");
    expect(gallery).toContain("Not a question-security surface");
    expect(gallery).toContain("original/components/academy/circuit-diagram");
    expect(gallery).not.toContain("getLearning");
    expect(gallery).toContain("<CircuitDiagram figure={original}");
  });

  test("targets are scoped adapter candidates intersected with actual parts", () => {
    const corpus = source("lib/corpus.ts");
    expect(corpus).toContain("gradualTutorTarget(legacy, panel)");
    expect(corpus).toContain("!parts.has(id)");
    expect(corpus).toContain("renderEducationalSVG(selected).ok");
  });

  test("malformed Unicode credentials are compared by byte length", () => {
    const reveal = source("lib/reveal.ts");
    expect(reveal).toContain("const left = Buffer.from(a)");
    expect(reveal).toContain("const right = Buffer.from(b)");
    expect(reveal).toContain("left.length === right.length && timingSafeEqual(left, right)");
  });

  test("mobile controls use a shrinkable grid track without hiding overflow", () => {
    const css = source("app/consumer.css");
    expect(css).toContain("grid-template-columns: minmax(0, 1fr)");
    expect(css).toContain(".consumer select { min-width: 0; width: 100%; }");
    expect(css).not.toContain("overflow-x: hidden");
  });

  test("the proof response declares UTF-8 on both boundaries", () => {
    const server = source("proof-server.tsx");
    expect(server).toContain('<meta charset="utf-8">');
    expect(server).toContain("text/html; charset=utf-8");
  });
});
