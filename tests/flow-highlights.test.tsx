import { expect, test } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";
import FlowDemo, {
  CONTACT_SETTLE_MS,
  externalPath,
  FlowCircuit,
  flowMode,
  returnPath,
  supplyPath,
} from "../app/flow/flow-demo.tsx";
import FlowPage from "../app/flow/page.tsx";

test("open and moving contacts never declare an active animated route", () => {
  for (const phase of ["open", "closing"] as const) {
    for (const playing of [false, true]) {
      for (const reduced of [false, true]) {
        expect(flowMode(phase, playing, reduced)).toBe(phase);
        const html = renderToStaticMarkup(
          <FlowCircuit phase={phase} playing={playing} reduced={reduced} />,
        );
        expect(html).not.toContain('class="flow-sweeps"');
        expect(html).not.toContain('class="flow-arrows"');
        expect(html).toContain("No flow is illustrated across the contact gap");
      }
    }
  }
});

test("closed route uses a feathered traveling stroke, not particle positions", () => {
  const html = renderToStaticMarkup(<FlowCircuit phase="closed" playing reduced={false} />);
  expect(html.match(/class="flow-sweep"/g)).toHaveLength(4);
  expect(html.match(/pathLength="1000"/g)).toHaveLength(4);
  expect(html).not.toContain("animateMotion");
  expect(flowMode("closed", true, false)).toBe("playing");
  expect(flowMode("closed", false, false)).toBe("paused");
});

test("reduced motion substitutes declared static direction for the sweep", () => {
  const html = renderToStaticMarkup(<FlowCircuit phase="closed" playing reduced />);
  expect(html).toContain('class="flow-arrows"');
  expect(html).not.toContain('class="flow-sweeps"');
  expect(flowMode("closed", true, true)).toBe("static");
  expect(flowMode("closed", false, true)).toBe("static");
});

test("the authored external path returns to the negative source terminal", () => {
  expect(externalPath).toStartWith("M160 238");
  expect(externalPath).toEndWith("V322");
  expect(externalPath).toContain("H408 L498 142 H800");
  expect(supplyPath).toEndWith("H408");
  expect(returnPath).toStartWith("M498 142");
  expect(CONTACT_SETTLE_MS).toBe(240);
});

test("SSR is motion-safe and clearly marks the limited illustration", () => {
  const demo = renderToStaticMarkup(<FlowDemo />);
  expect(demo).toContain('data-mode="static"');
  expect(demo).not.toContain('class="flow-sweeps"');
  for (const label of [
    "Open switch",
    "Replay sweep",
    "Visual speed",
    "No current values are calculated",
    "reduced-motion preference",
  ])
    expect(demo).toContain(label);
  const page = renderToStaticMarkup(<FlowPage />);
  expect(page).toContain("One hand-composed scene");
  expect(page).toContain("Existing exports are unchanged");
  expect(page.match(/<main\b/g)).toHaveLength(1);
});
