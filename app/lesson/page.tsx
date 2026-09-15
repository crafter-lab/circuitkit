import LessonClient from "./lesson-client.tsx";
import "./lesson.css";

export const metadata = {
  title: "Lesson | CircuitKit",
  description:
    "Learn to read electrical nodes with linked circuit annotations and two independent figures.",
};

export default function LessonPage() {
  return (
    <>
      <a className="skip-link" href="#main">
        Skip to lesson
      </a>
      <header className="site-header lesson-header">
        <a className="wordmark" href="/">
          CircuitKit<span className="edition">Lesson</span>
        </a>
        <nav className="lesson-nav" aria-label="Main navigation">
          <a href="/editor">Editor</a>
          <a href="/gallery">Gallery</a>
          <a href="/lesson" aria-current="page">
            Lesson
          </a>
        </nav>
      </header>
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
      <footer className="site-footer">
        <span>CircuitKit · Reading nodes</span>
        <p>A drawing, not simulation, electrical-safety approval, or a fabrication system.</p>
      </footer>
    </>
  );
}
