"use client";

import { useId, useState } from "react";
import { highlightCircuitSource } from "../../src/language/highlight.ts";
import type { PresentationPlan } from "../../src/language/types.ts";
import type { PublicFigure } from "../../src/v2/schema.ts";
import PresentationViewer from "../presentation-viewer.tsx";

const explanation = `presentation {
  scene signals "Digital audio" {
    highlight module ESP32
    highlight module Amp
    dim others
    flow bus I2S {
      period 3s
    }
  }
}`;
const steps = [
  {
    id: "connect",
    label: "Connect",
    file: "audio.ck",
    scene: "",
    description: "Each module lists its ports. Each connection names two endpoints.",
  },
  {
    id: "explain",
    label: "Explain",
    file: "audio.ck · presentation",
    scene: "signals",
    description: "Highlight the digital audio bus between the controller and amplifier.",
  },
  {
    id: "ship",
    label: "Ship",
    file: "render.ts",
    scene: "",
    description: "Read the same source in a Node.js script and write an SVG file.",
  },
];
export default function StoryDemo({
  source,
  figure,
  presentation,
  integrationHTML,
}: {
  source: string;
  figure: PublicFigure;
  presentation: PresentationPlan;
  integrationHTML: string;
}) {
  const [step, setStep] = useState(0);
  const id = useId();
  const current = steps[step] ?? steps[0];
  if (!current) return null;
  const code =
    step === 0
      ? (source.split("\npresentation")[0]?.trimEnd() ?? source)
      : step === 1
        ? explanation
        : "";
  return (
    <div className="story-demo" data-story-step={current.id}>
      <fieldset className="story-navigation" aria-label="From source to diagram">
        {steps.map((item, index) => (
          <button
            key={item.id}
            type="button"
            aria-pressed={step === index}
            aria-controls={`${id}-code ${id}-preview`}
            onClick={() => setStep(index)}
          >
            <span>0{index + 1}</span>
            {item.label}
          </button>
        ))}
      </fieldset>
      <div className="story-workspace">
        <section className="story-source" aria-label="Example source" id={`${id}-code`}>
          <div className="story-file">
            <span>{current.file}</span>
            <span>{step === 2 ? "TypeScript" : "CircuitKit"}</span>
          </div>
          <section
            tabIndex={0}
            className="story-code-scroll"
            aria-label={`${current.file} example`}
          >
            {step === 2 ? (
              <div dangerouslySetInnerHTML={{ __html: integrationHTML }} />
            ) : (
              <pre>
                <code dangerouslySetInnerHTML={{ __html: highlightCircuitSource(code) }} />
              </pre>
            )}
          </section>
        </section>
        <div id={`${id}-preview`} className="story-canvas">
          <PresentationViewer
            figure={figure}
            presentation={presentation}
            selectedScene={current.scene}
            variant="landing"
            compact
          />
        </div>
      </div>
      <div className="story-caption">
        <p role="status">{current.description}</p>
        <span>Rendered from audio.ck</span>
      </div>
    </div>
  );
}
