"use client";

import { createContext, type ReactNode, useContext, useMemo, useState } from "react";
import { CircuitLessonFigure } from "../../src/lesson-figure.tsx";
import { dividerLesson } from "../lesson/documents.ts";

const LandingTheme = createContext<"light" | "dark">("light");

export function LandingShell({ children }: { children: ReactNode }) {
  const [theme, setTheme] = useState<"light" | "dark">("light");

  return (
    <LandingTheme value={theme}>
      <div className="landing" data-theme={theme}>
        <a className="landing-skip" href="#main">
          Skip to content
        </a>
        <header className="landing-header landing-grid">
          <a className="landing-wordmark" href="/" aria-current="page">
            CircuitKit
          </a>
          <a className="landing-lab" href="https://crafter.run">
            By Crafter Lab
          </a>
          <nav aria-label="Main navigation">
            <a className="landing-nav-link" href="/editor">
              Editor
            </a>
            <a className="landing-nav-link" href="/gallery">
              Gallery
            </a>
            <a className="landing-nav-link" href="/lesson">
              Lesson
            </a>
            <button
              className="landing-button landing-theme"
              type="button"
              aria-label="Dark theme"
              aria-pressed={theme === "dark"}
              onClick={() => setTheme((current) => (current === "light" ? "dark" : "light"))}
            >
              <span aria-hidden="true">{theme === "light" ? "◐" : "◑"}</span>
              Dark theme
            </button>
          </nav>
        </header>
        {children}
      </div>
    </LandingTheme>
  );
}

export function LandingFigure() {
  const theme = useContext(LandingTheme);
  const [activeNet, setActiveNet] = useState<string | null>(null);
  const document = useMemo(() => dividerLesson(`geist-${theme}`, 10000), [theme]);

  return (
    <div className="landing-preview">
      <div className="landing-preview-heading">
        <span>01 / Voltage divider</span>
        <span>Interactive SVG</span>
      </div>
      <CircuitLessonFigure
        document={document}
        activeNet={activeNet}
        onActiveNetChange={setActiveNet}
        download
      />
      <p className="landing-preview-note">
        Hover or focus A, B, or C to preview a node. Select to keep it highlighted. Escape or Show
        all clears selection. The download keeps your selection, not the preview.
      </p>
    </div>
  );
}
