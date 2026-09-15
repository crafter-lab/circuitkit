"use client";

import { CircuitFigure, CircuitLessonFigure } from "circuitkit/react";
import { type ComponentProps, useMemo, useState } from "react";

const initial = {
  version: 1,
  circuit: {
    components: {
      R1: { type: "resistor", resistance: 10000 },
      C1: { type: "capacitor", capacitance: 1e-7 },
    },
    ports: { VIN: { kind: "terminal" }, VOUT: { kind: "terminal" }, GND: { kind: "ground" } },
    nets: { input: ["VIN", "R1.a"], output: ["R1.b", "C1.a", "VOUT"], ground: ["C1.b", "GND"] },
  },
  layout: {
    preset: "rc-lowpass",
    roles: { series: "R1", shunt: "C1", input: "VIN", output: "VOUT", ground: "GND" },
  },
  presentation: {
    title: "Filtro RC",
    theme: { preset: "geist-light" },
    highlight: { components: [] as string[], nets: ["output"] },
  },
};

type Diagnostics = Parameters<
  NonNullable<ComponentProps<typeof CircuitFigure>["onDiagnostics"]>
>[0];

export default function Page() {
  const [resistance, setResistance] = useState("10000");
  const [theme, setTheme] = useState("geist-light");
  const [focus, setFocus] = useState("net:output");
  const [diagnostics, setDiagnostics] = useState<Diagnostics>([]);
  const [lessonNet, setLessonNet] = useState<string | null>(null);
  const document = useMemo(
    () => ({
      ...initial,
      circuit: {
        ...initial.circuit,
        components: {
          ...initial.circuit.components,
          R1: { type: "resistor", resistance: resistance.trim() === "" ? "" : Number(resistance) },
        },
      },
      presentation: {
        ...initial.presentation,
        theme: { preset: theme },
        highlight: {
          components: focus.startsWith("component:") ? [focus.slice(10)] : [],
          nets: focus.startsWith("net:") ? [focus.slice(4)] : [],
        },
      },
    }),
    [resistance, theme, focus],
  );
  const lessonDocument = useMemo(
    () => ({
      ...document,
      presentation: {
        ...document.presentation,
        title: "Read the RC filter by node",
        annotations: {
          nets: [
            {
              net: "input",
              label: "A",
              description: "VIN and R1.a share the input node. R1 separates it from B.",
              tone: "blue",
            },
            {
              net: "output",
              label: "B",
              description:
                "R1.b, C1.a and VOUT share one output node, including the branch to VOUT.",
              tone: "amber",
            },
            {
              net: "ground",
              label: "C",
              description:
                "C1.b connects to GND. The capacitor separates C from the output node B.",
              tone: "violet",
            },
          ],
          legend: true,
          caption:
            "Labels identify entire nodes, not individual junction dots. This figure is rendered by the installed package with no host annotation CSS.",
        },
      },
    }),
    [document],
  );

  return (
    <main>
      <p className="eyebrow">Isolated package consumer</p>
      <h1>A figure, driven by props.</h1>
      <p>
        This host owns the document. The package owns rendering and validation. No source aliases or
        renderer copies.
      </p>
      <div className="controls">
        <label>
          R1 resistance (Ω)
          <input
            type="text"
            inputMode="decimal"
            value={resistance}
            aria-describedby="value-hint"
            onChange={(event) => setResistance(event.target.value)}
          />
        </label>
        <label>
          Theme
          <select value={theme} onChange={(event) => setTheme(event.target.value)}>
            <option value="geist-light">Light</option>
            <option value="geist-dark">Dark</option>
            <option value="geist-print">Print</option>
          </select>
        </label>
        <label>
          Focus
          <select value={focus} onChange={(event) => setFocus(event.target.value)}>
            <option value="">None</option>
            <option value="component:R1">R1</option>
            <option value="component:C1">C1</option>
            <option value="net:output">Output net</option>
          </select>
        </label>
      </div>
      <p id="value-hint">
        Use positive SI numbers. Empty, zero, negative, or nonnumeric values remove the figure and
        show package diagnostics.
      </p>
      <CircuitFigure className="figure" document={document} onDiagnostics={setDiagnostics} />
      <p role="status">
        {diagnostics.length
          ? `Host received ${diagnostics.length} diagnostic(s): ${diagnostics.map((item) => item.code).join(", ")}.`
          : "No diagnostics reported."}
      </p>
      <details>
        <summary>Current host-owned JSON</summary>
        <pre>{JSON.stringify(document, null, 2)}</pre>
      </details>
      <section aria-labelledby="lesson-heading" style={{ marginTop: 48, minWidth: 0 }}>
        <p className="eyebrow">A lesson from the installed React export</p>
        <h2 id="lesson-heading">Follow a node, not just a dot.</h2>
        <p>
          A conductor can branch and still be one node. Follow B from the resistor to the capacitor
          and VOUT. Then compare A and C: the components separate these nodes. Use the linked labels
          by pointer, keyboard or touch. Selection here is independent of the technical figure
          above.
        </p>
        <CircuitLessonFigure
          document={lessonDocument}
          activeNet={lessonNet}
          onActiveNetChange={setLessonNet}
          download
        />
      </section>
      <p>Local drawing only. Not simulation or electrical-safety approval.</p>
    </main>
  );
}
