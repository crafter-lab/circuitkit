import type { PublicFigure } from "../../src/v2/schema.ts";

export function NetManifest({ document }: { document: PublicFigure }) {
  const targets = document.targets.filter((target) => target.role === "net");
  if (!targets.length) return null;
  return (
    <details className="education-net-manifest">
      <summary>Public net targets ({targets.length})</summary>
      <p className="education-note">
        These explicitly approved whole-net targets carry public group membership. Selecting one
        highlights its allowed member regions, not the space inside a bounding box. Publishing this
        metadata can reveal connectivity answers; hiding the highlight with CSS does not make it
        private.
      </p>
      <p className="education-note">
        Selected public schema: {document.schema}. Each net has role net, kind group and explicit
        member part IDs. No client-side connectivity inference.
      </p>
      <pre>{JSON.stringify(targets, null, 2)}</pre>
    </details>
  );
}
