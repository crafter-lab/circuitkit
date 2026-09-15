import { describe, expect, test } from "bun:test";
import { createComplexScene } from "../src/complex-scenes.ts";
import { formatSI, inspect, loadExample, renderSVG } from "../src/index.ts";
import { themePresets } from "../src/schema.ts";
import { resolveTheme } from "../src/theme.ts";

function symbol() {
  const scene = createComplexScene(loadExample("transistor-switch"), formatSI);
  const transistor = scene?.symbols.find(({ id }) => id === "Q1");
  if (!scene || !transistor) throw new Error("Missing transistor scene");
  return { scene, transistor };
}

describe("NPN emitter arrow", () => {
  test("solid triangle is centered on the emitter branch and points outward", () => {
    const { transistor } = symbol();
    expect(transistor.paths).toHaveLength(2);
    expect(transistor.filledPaths).toHaveLength(1);
    const outline = transistor.filledPaths?.[0];
    if (!outline) throw new Error("Missing emitter arrow");
    expect(outline.endsWith("Z")).toBe(true);
    const values = [...outline.matchAll(/-?\d+(?:\.\d+)?/g)].map(([value]) => Number(value));
    expect(values).toHaveLength(6);
    const [tx, ty, ax, ay, bx, by] = values as [number, number, number, number, number, number];
    const rear = [(ax + bx) / 2, (ay + by) / 2] as const;
    const length = Math.hypot(70, 38);
    const perpendicular = (x: number, y: number) => ((x - 930) * 38 - (y - 862) * 70) / length;
    expect(Math.abs(perpendicular(tx, ty))).toBeLessThan(0.0001);
    expect(Math.abs(perpendicular(...rear))).toBeLessThan(0.0001);
    expect((tx - rear[0]) * 70 + (ty - rear[1]) * 38).toBeGreaterThan(0);
    expect(Math.hypot(tx - rear[0], ty - rear[1])).toBeCloseTo(20, 3);
    expect(Math.hypot(ax - bx, ay - by)).toBeCloseTo(14, 3);
    for (const [x, y] of [
      [tx, ty],
      [ax, ay],
      [bx, by],
    ] as const) {
      expect(x).toBeGreaterThanOrEqual(transistor.box.x);
      expect(x).toBeLessThanOrEqual(transistor.box.x + transistor.box.width);
      expect(y).toBeGreaterThanOrEqual(transistor.box.y);
      expect(y).toBeLessThanOrEqual(transistor.box.y + transistor.box.height);
    }
  });

  test("arrow does not change terminals, the emitter shaft, or circuit wiring", () => {
    const { scene, transistor } = symbol();
    expect(scene.endpoints["Q1.base"]).toEqual({ x: 870, y: 840, net: "base" });
    expect(scene.endpoints["Q1.collector"]).toEqual({ x: 1000, y: 760, net: "collector" });
    expect(scene.endpoints["Q1.emitter"]).toEqual({ x: 1000, y: 920, net: "ground" });
    expect(transistor.paths[1]).toBe("M930 818L1000 780V760M930 862L1000 900V920");
    expect(transistor.box).toEqual({ x: 870, y: 760, width: 130, height: 160 });
    const document = loadExample("transistor-switch");
    const result = inspect(document);
    expect(result.ok).toBe(true);
    if (result.ok)
      expect(result.circuit.nets).toEqual(
        Object.fromEntries(
          Object.entries(document.circuit.nets).map(([id, endpoints]) => [
            id,
            [...endpoints].sort(),
          ]),
        ),
      );
  });

  for (const preset of themePresets) {
    for (const focused of [false, true]) {
      test(`${preset}, focused=${focused}: arrow uses symbol color with no outline or hollow center`, () => {
        const document = loadExample("transistor-switch");
        document.presentation.theme.preset = preset;
        document.presentation.highlight = { components: focused ? ["Q1"] : [], nets: [] };
        const original = structuredClone(document);
        const result = renderSVG(document);
        expect(result.ok).toBe(true);
        if (!result.ok) throw new Error(JSON.stringify(result.diagnostics));
        const { theme } = resolveTheme(document);
        const group = result.svg.match(/<g data-component="Q1"[^>]*>(.*?)<\/g>/)?.[1];
        const d = symbol().transistor.filledPaths?.[0];
        expect(group).toContain(
          `<path d="${d}" fill="${focused ? theme.highlight : theme.wire}" stroke="none"/>`,
        );
        expect(group?.match(/fill=/g)).toHaveLength(1);
        expect(renderSVG(document)).toEqual(result);
        expect(document).toEqual(original);
        document.presentation.highlight = { components: [], nets: ["ground"] };
        const netFocus = renderSVG(document);
        expect(netFocus.ok).toBe(true);
        if (netFocus.ok) {
          expect(netFocus.svg.match(/<g data-component="Q1"[^>]*>(.*?)<\/g>/)?.[1]).toContain(
            `fill="${theme.wire}" stroke="none"`,
          );
          expect(netFocus.bounds).toEqual(result.bounds);
          expect(netFocus.circuit).toEqual(result.circuit);
        }
      });
    }
  }
});
