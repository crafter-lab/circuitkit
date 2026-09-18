import { readFile } from "node:fs/promises";
import { join } from "node:path";
import Link from "next/link";
import { renderCircuitSource } from "../../src/language/index.ts";
import { StructuredData } from "../structured-data.tsx";
import { InstallCommand } from "./install-actions.tsx";
import StoryDemo from "./story-demo.tsx";
import "./developer-landing.css";

import { highlightCode, installationCommand, integrationExample } from "./highlight-code.ts";
import SkillCTA from "./skill-cta.tsx";

export default async function DeveloperLanding() {
  const source = await readFile(
    join(process.cwd(), "examples", "diagrams", "audio-story.ck"),
    "utf8",
  );
  const [integrationHTML, skillHTML] = await Promise.all([
    highlightCode(integrationExample, "typescript"),
    highlightCode(installationCommand, "bash"),
  ]);
  const result = renderCircuitSource(source);
  if (!result.ok || !result.presentation) throw new Error("The landing circuit must compile.");
  return (
    <main id="main" className="developer-landing">
      <StructuredData
        value={{
          "@type": "SoftwareApplication",
          name: "CircuitKit",
          url: "https://circuitkit.crafter.ing",
          applicationCategory: "DeveloperApplication",
          operatingSystem: "Node.js 20+",
          description:
            "Create circuit diagrams from explicit connections and export local SVG or PNG previews.",
          license: "https://www.apache.org/licenses/LICENSE-2.0",
          codeRepository: "https://github.com/crafter-lab/circuitkit",
        }}
      />
      <section className="narrative-hero" aria-labelledby="hero-heading">
        <p className="narrative-kicker">
          <span />
          CircuitKit · Open-source circuit diagrams
        </p>
        <h1 id="hero-heading">
          Circuit diagrams
          <br />
          <span className="narrative-title-secondary">for coding agents.</span>
        </h1>
        <p className="narrative-lead">
          Describe the modules and connections.
          <br className="desktop-break" /> Get a block diagram, wiring diagram or schematic as SVG
          or PNG.
        </p>
        <SkillCTA command={installationCommand} />
        <p className="narrative-proof">Local rendering · SVG and PNG exports · Apache-2.0</p>
      </section>
      <section
        id="presentations"
        className="narrative-demo"
        aria-label="Write, explain and export a circuit"
      >
        <StoryDemo
          source={source}
          figure={result.figure}
          presentation={result.presentation}
          integrationHTML={integrationHTML}
        />
        <p className="narrative-demo-note">
          A signal-path example, not a complete power circuit. Flow is illustrative; SVG exports
          stay static.
        </p>
      </section>
      <section className="narrative-principles" aria-labelledby="workflow-heading">
        <div className="narrative-section-heading">
          <p className="narrative-kicker">Editable source</p>
          <h2 id="workflow-heading">
            Keep diagrams
            <br />
            next to your code.
          </h2>
          <p>Store the source in Git and update it when your wiring changes.</p>
        </div>
        <div className="narrative-columns">
          <article>
            <span className="narrative-file">01 / circuit.ck</span>
            <h3>Track wiring changes</h3>
            <p>
              Store the .ck file in Git and review changes to its ports and connections in a diff.
            </p>
          </article>
          <article>
            <span className="narrative-file">02 / presentation</span>
            <h3>Explain a signal path</h3>
            <p>
              Use named scenes to highlight modules, pins or buses while keeping the same layout.
            </p>
          </article>
          <article>
            <span className="narrative-file">03 / diagram.svg</span>
            <h3>Export for docs and slides</h3>
            <p>Generate SVG or PNG from the source and render it again after a change.</p>
          </article>
        </div>
      </section>
      <section
        id="developer-guide"
        className="narrative-developer"
        aria-labelledby="developer-heading"
      >
        <div className="narrative-section-heading">
          <p className="narrative-kicker">Your first diagram</p>
          <h2 id="developer-heading">
            Tell your agent
            <br />
            what connects.
          </h2>
          <p>
            Install the skill, describe your circuit, and ask for the view you need. Your agent
            writes the source and renders an image you can actually see.
          </p>
          <Link href="/docs" prefetch={false} className="narrative-text-link">
            Start with the guide →
          </Link>
        </div>
        <div className="narrative-reference narrative-start" id="install-skill">
          <div className="narrative-start-step">
            <span className="narrative-file">01</span>
            <h3>Install the skill in your project.</h3>
            <p>Choose Codex, Claude Code or the agent you already use.</p>
            <InstallCommand
              label="Run once in your terminal"
              command={installationCommand}
              highlightedHTML={skillHTML}
            />
          </div>
          <div className="narrative-start-step">
            <span className="narrative-file">02</span>
            <h3>Ask for the diagram.</h3>
            <blockquote>
              “Draw a wiring diagram of a controller and an I2C sensor. Show SDA and SCL, leave
              power out, and give me a PNG preview.”
            </blockquote>
          </div>
          <div className="narrative-start-step">
            <span className="narrative-file">03</span>
            <h3>Get a picture. Keep the source.</h3>
            <p>
              Your agent renders an SVG or PNG and saves the editable .ck file beside it. Change a
              connection and render again.
            </p>
            <Link href="/docs/quickstart" prefetch={false} className="narrative-text-link">
              Prefer the CLI? Write your first circuit →
            </Link>
          </div>
        </div>
      </section>
      <section className="narrative-faq" aria-label="Scope and other tools">
        <details>
          <summary>Does it simulate my circuit?</summary>
          <p>
            No. CircuitKit draws declared connections. It does not verify voltage compatibility,
            solve current, or produce PCB fabrication files. Animated flow explains a declared
            direction, not a physical measurement.
          </p>
        </details>
        <details>
          <summary>What happens to my source?</summary>
          <p>
            The playground runs locally in your browser. Download the .ck file to keep your work.
            With the CLI, your source and rendered files stay in your own project. Markdown fences
            are supported directly by the CLI, without a separate authoring workspace.
          </p>
        </details>
        <details>
          <summary>Where are the other editors?</summary>
          <p>
            The focused playground handles module diagrams. Existing recipe and education tools
            remain available.
          </p>
          <div className="narrative-tool-links">
            <Link href="/editor" prefetch={false}>
              Legacy recipes
            </Link>
            <Link href="/editor/education" prefetch={false}>
              Education editor
            </Link>
            <Link href="/lesson" prefetch={false}>
              Guided lessons
            </Link>
            <Link href="/gallery" prefetch={false}>
              Example gallery
            </Link>
          </div>
        </details>
      </section>
      <section className="narrative-close" aria-labelledby="closing-heading">
        <p className="narrative-kicker">Get started</p>
        <h2 id="closing-heading">Add CircuitKit to your agent.</h2>
        <SkillCTA command={installationCommand} placement="Get started" />
        <p>Apache-2.0 · Node.js 20+</p>
      </section>
    </main>
  );
}
