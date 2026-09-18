import LessonClient from "./lesson-client.tsx";
import "./lesson.css";

export const metadata = {
  title: "Lesson | CircuitKit",
  description:
    "Read electrical nodes with linked annotations and manual teaching sequences for a divider, RC filter and feedback amplifier.",
};

export default function LessonPage() {
  return (
    <main id="main" className="lesson-main">
      <div className="intro lesson-intro">
        <span className="eyebrow">A short lesson / Reading nodes</span>
        <h1>
          Follow the wire.
          <br />
          Understand the node.
        </h1>
        <p>Two real circuits. One idea: connectivity comes before the calculation.</p>
      </div>
      <LessonClient />
    </main>
  );
}
