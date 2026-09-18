import { notFound } from "next/navigation";
import { parseSelection, type Search } from "../../../education/catalog.ts";
import { authorExample, publicExample } from "../../../education/examples.ts";
import { EducationWorkbench } from "../../../education/workbench.tsx";
import "../../../education/education.css";

export const metadata = {
  title: "Author workspace | CircuitKit",
  description: "An explicit authoring workspace, not an assessment delivery boundary.",
};
export default async function AuthorWorkspacePage({
  searchParams,
}: {
  searchParams?: Promise<Search>;
} = {}) {
  const selection = parseSelection((await searchParams) ?? {});
  if (!selection) notFound();
  return (
    <main id="main" className="education-page">
      <div className="education-intro">
        <p className="education-eyebrow">Explicit author workspace</p>
        <h1>Edit the authored model.</h1>
        <p>
          This route deliberately loads all three authored stages into your browser. It is not
          assessment privacy. CSS stage hiding is not protection. Only the selected compiled public
          document appears in the preview and SVG, PNG or JSON exports.
        </p>
        <p>
          Drafts are intentionally uploaded to a bounded server compiler. They are not automatically
          saved. Use generic examples, not private assessment sources.
        </p>
      </div>
      <EducationWorkbench
        initialDocument={publicExample(selection)}
        initialSelection={selection}
        initialAuthor={JSON.stringify(authorExample(selection.case, selection.theme), null, 2)}
        editor
      />
    </main>
  );
}
