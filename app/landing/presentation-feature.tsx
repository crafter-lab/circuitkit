import { readFile } from "node:fs/promises";
import { join } from "node:path";
import Link from "next/link";
import { highlightCircuitSource, renderCircuitSource } from "../../src/language/index.ts";
import PresentationViewer from "../presentation-viewer.tsx";
import "./presentation-feature.css";

const excerpt = `presentation {
  section audio {
    module ESP32
    module MAX98357
    bus I2S
  }
  scene sending "Sending audio" {
    highlight section audio
    dim others
    flow bus I2S {
      style sweep
      period 2s
    }
  }
}`;

export default async function PresentationFeature() {
  const source = await readFile(
    join(process.cwd(), "examples", "diagrams", "cueva-presentation.ck"),
    "utf8",
  );
  const result = renderCircuitSource(source);
  if (!result.ok || !result.presentation)
    throw new Error("The bundled presentation example must compile.");
  return (
    <section
      id="presentations"
      className="landing-section landing-presentation"
      aria-labelledby="presentation-heading"
    >
      <div className="landing-presentation-intro">
        <div>
          <p className="landing-eyebrow">CircuitKit language / Explain in layers</p>
          <h2 id="presentation-heading">One circuit. More than one way to explain it.</h2>
          <p>
            Name a section, highlight a pin, or follow a declared signal with a soft traveling
            sweep. Scenes keep the same connections and layout while you change the focus.
          </p>
          <p>
            Write it beside your modules and buses, in a .ck file or a CircuitKit Markdown fence. No
            coordinates, scripts or separate animation files.
          </p>
          <nav className="landing-demo-links" aria-label="Presentation authoring">
            <Link href="/editor?mode=circuitkit" prefetch={false} className="landing-text-link">
              Edit this circuit & its scenes →
            </Link>
            <Link href="/markdown" prefetch={false} className="landing-text-link">
              Use it in Markdown →
            </Link>
          </nav>
          <p className="landing-helper">
            Available in this local checkout. Illustrative flow, not electrical simulation. Playback
            speed does not measure current, signal frequency or propagation. Base SVG/PNG exports
            stay static; reduced motion uses direction cues.
          </p>
        </div>
        <div>
          <p className="landing-helper">
            Presentation excerpt. The modules and I2S bus are declared in the full example below.
          </p>
          <section
            tabIndex={0}
            aria-label="CircuitKit presentation syntax"
            className="presentation-source-example"
          >
            <pre>
              <code dangerouslySetInnerHTML={{ __html: highlightCircuitSource(excerpt) }} />
            </pre>
          </section>
          <p className="landing-helper">
            Select a scene below. Power and speaker output use static highlights; sending audio
            animates the three I2S connections independently. Blocks aggregate wires, so per-wire
            flow requires wiring or a continuous schematic route.
          </p>
        </div>
      </div>
      <PresentationViewer figure={result.figure} presentation={result.presentation} compact />
    </section>
  );
}
