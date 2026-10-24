import { describe, expect, test } from "bun:test";
import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  type BreadboardDocument,
  breadboardJSONSchema,
  compileBreadboard,
  renderBreadboardSVG,
} from "../src/breadboard/index.ts";
import { renderBreadboardPNG } from "../src/breadboard/png.ts";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const examplePath = join(root, "examples/breadboard/pico-ili9341.json");
const example = (): BreadboardDocument => JSON.parse(readFileSync(examplePath, "utf8"));
const codes = (input: unknown) => {
  const result = compileBreadboard(input);
  return result.ok ? [] : result.diagnostics.map(({ code }) => code);
};

describe("breadboard documents", () => {
  test("derives nets from strips, rails and wires and passes its expectations", () => {
    const result = compileBreadboard(example());
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.nets.map(({ pins }) => pins)).toContainEqual([
      "pico.3V3(OUT)",
      "tft.LED",
      "tft.VCC",
    ]);
    expect(result.nets.map(({ pins }) => pins)).toContainEqual(["pico.GP21", "tft.RESET"]);
    expect(result.nets).toHaveLength(7);
  });

  test("a wire on the 5 V pin is reported as a short", () => {
    const document = example();
    document.wires[1] = { from: "i24", to: "R+28" };
    expect(codes(document)).toContain("breadboard.short");
    expect(codes(document)).toContain("breadboard.expect_open");
  });

  test("a missing wire is reported as an open connection", () => {
    const document = example();
    document.wires = document.wires.filter((wire) => wire.to !== "e58");
    expect(codes(document)).toEqual(["breadboard.expect_open"]);
  });

  test("holes hold one pin or wire end", () => {
    const document = example();
    document.wires[0] = { from: "h26", to: "R-26" };
    expect(codes(document)).toContain("breadboard.occupied");
  });

  test("rejects coordinates outside the board and mismatched dip rows", () => {
    const document = example();
    document.board = { rows: 30 };
    expect(codes(document)).toContain("breadboard.out_of_board");
    const short = example();
    const pico = short.parts[0];
    if (pico?.kind === "dip") pico.to = "h42";
    expect(codes(short)).toContain("breadboard.part_pins");
  });

  test("split rails do not join the two halves", () => {
    const document = example();
    document.board = { rails: "split" };
    expect(codes(document)).toContain("breadboard.expect_open");
  });

  test("rail order moves the right rails without changing nets", () => {
    const mirrored = example();
    mirrored.board = { railOrder: "mirrored" };
    const a = renderBreadboardSVG(example());
    const b = renderBreadboardSVG(mirrored);
    expect(a.ok && b.ok).toBe(true);
    if (!a.ok || !b.ok) return;
    expect(a.svg).not.toBe(b.svg);
    expect(b.nets).toEqual(a.nets);
  });

  test("grouped rails reject the empty row between groups", () => {
    const document = example();
    document.wires[0] = { from: "i26", to: "R-24" };
    expect(codes(document)).toEqual(["breadboard.rail_gap"]);
    document.board = { railHoles: "every-row" };
    expect(codes(document)).toEqual([]);
  });

  test("unknown fields are rejected", () => {
    expect(codes({ ...example(), layout: {} })).toContain("breadboard.schema");
    expect(breadboardJSONSchema).toHaveProperty("properties.parts");
  });

  test("renders deterministic SVG and PNG", async () => {
    const first = renderBreadboardSVG(example());
    const second = renderBreadboardSVG(example());
    expect(first.ok && second.ok).toBe(true);
    if (!first.ok || !second.ok) return;
    expect(first.svg).toBe(second.svg);
    expect(first.svg.startsWith("<svg")).toBe(true);
    const png = await renderBreadboardPNG(example(), 1);
    expect(png.ok).toBe(true);
    if (png.ok) expect(png.width).toBe(first.bounds.width);
  });

  test("CLI validates and renders breadboard documents", () => {
    const directory = mkdtempSync(join(tmpdir(), "circuitkit-breadboard-"));
    try {
      const out = join(directory, "board.svg");
      const run = (...args: string[]) =>
        spawnSync(process.execPath, [join(root, "src/cli.ts"), ...args, "--json"], {
          encoding: "utf8",
        });
      const validated = run("validate", examplePath);
      expect(validated.status).toBe(0);
      expect(JSON.parse(validated.stdout).nets).toHaveLength(7);
      const rendered = run("render", examplePath, "--out", out);
      expect(rendered.status).toBe(0);
      expect(readFileSync(out, "utf8").startsWith("<svg")).toBe(true);
      expect(run("render", examplePath, "--view", "wiring").status).toBe(2);
      expect(JSON.parse(run("schema", "--breadboard").stdout).schema).toHaveProperty("properties");
    } finally {
      rmSync(directory, { recursive: true, force: true });
    }
  });
});
