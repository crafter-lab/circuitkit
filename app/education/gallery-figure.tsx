"use client";

import { useEffect, useState } from "react";
import { EducationalFigure } from "../../src/v2/react.tsx";
import type { PublicFigure } from "../../src/v2/schema.ts";
import { FigureViewport } from "./FigureViewport.tsx";
import { NetManifest } from "./net-manifest.tsx";

export function GalleryFigure({ document }: { document: PublicFigure }) {
  const [selection, setSelection] = useState<{ id: string; targets: string[] }>({
    id: document.id,
    targets: [],
  });
  useEffect(() => {
    setSelection((previous) => ({
      id: document.id,
      targets:
        previous.id === document.id
          ? document.targets
              .filter((target) => previous.targets.includes(target.id))
              .map((target) => target.id)
          : [],
    }));
  }, [document]);
  const selected =
    selection.id === document.id
      ? document.targets
          .filter((target) => selection.targets.includes(target.id))
          .map((target) => target.id)
      : [];
  return (
    <div className="education-gallery-figure">
      <div className="education-canvas">
        <FigureViewport document={document}>
          <EducationalFigure
            document={document}
            selectedTargets={selected}
            onSelectionChange={(targets) => setSelection({ id: document.id, targets })}
          />
        </FigureViewport>
      </div>
      <NetManifest document={document} />
      <p className="education-note" aria-live="polite">
        Selected: {selected.length ? selected.join(", ") : "none"}
        {document.targets.length ? " · Tab, Enter / Space, Escape" : " · No targets exposed"}
      </p>
    </div>
  );
}
