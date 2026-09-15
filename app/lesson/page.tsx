import LessonClient from "./lesson-client.tsx";
import "./lesson.css";

export const metadata = {
  title: "Lesson | CircuitKit",
  description:
    "Learn to read electrical nodes with linked circuit annotations and two independent figures.",
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
