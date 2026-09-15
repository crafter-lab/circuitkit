"use client";

import { useMemo, useState } from "react";
import { CircuitLessonFigure } from "../../src/lesson-figure.tsx";
import { dividerLesson } from "../lesson/documents.ts";
import { useSiteTheme } from "../theme-provider.tsx";

export function LandingFigure() {
  const { theme, mounted } = useSiteTheme();
  const [activeNet, setActiveNet] = useState<string | null>(null);
  const document = useMemo(() => dividerLesson(`geist-${theme}`, 10000), [theme]);

  return (
    <div className="landing-preview auto-theme-figure" data-theme-ready={mounted}>
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
