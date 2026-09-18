import Link from "next/link";
import { defaultSelection } from "./catalog.ts";
import { publicExample } from "./examples.ts";
import { EducationWorkbench } from "./workbench.tsx";
import "./education.css";

export const metadata = { title: "Education engine v2 | CircuitKit" };
export default function EducationPage() {
  return (
    <main id="main" className="education-page">
      <div className="education-intro">
        <p className="education-eyebrow">CircuitKit / Education engine v2</p>
        <h1>Circuits, signals, measurements and more.</h1>
        <p>
          12 typed panels. Independent teaching, question and correction models. Three Geist themes.
          Portable public JSON, SVG and PNG. Minimal figures by default, host captions and
          allowlisted interaction when needed.
        </p>
        <nav className="education-links" aria-label="Education demos">
          <Link className="education-primary" href="/editor/education" prefetch={false}>
            Open v2 editor
          </Link>
          <Link href="/gallery/education" prefetch={false}>
            All engine and adapter families
          </Link>
          <Link href="/gallery/education/local" prefetch={false}>
            Separate local corpus comparison
          </Link>
        </nav>
      </div>
      <EducationWorkbench
        initialDocument={publicExample(defaultSelection)}
        initialSelection={defaultSelection}
      />
    </main>
  );
}
