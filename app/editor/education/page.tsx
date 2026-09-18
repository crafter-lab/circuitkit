import Link from "next/link";
import { notFound } from "next/navigation";
import { parseSelection, type Search } from "../../education/catalog.ts";
import { publicExample } from "../../education/examples.ts";
import { EducationWorkbench } from "../../education/workbench.tsx";
import "../../education/education.css";

export const metadata = {
  title: "Public v2 editor | CircuitKit",
  description:
    "Edit selected public educational geometry, inspect allowed targets and export portable figures.",
};
export default async function EducationEditorPage({
  searchParams,
}: {
  searchParams?: Promise<Search>;
} = {}) {
  const selection = parseSelection((await searchParams) ?? {});
  if (!selection) notFound();
  return (
    <main id="main" className="education-page">
      <div className="education-intro">
        <p className="education-eyebrow">Education engine v2 / Public workspace</p>
        <h1>One public figure. Every teaching surface.</h1>
        <p>
          12 typed panel families, three independent stages and three figure themes. Drawing and
          explicit scalar derivations, not circuit simulation.
        </p>
        <nav className="education-links" aria-label="Editor versions">
          <Link href="/editor" prefetch={false}>
            Legacy editor compatibility
          </Link>
          <Link href="/gallery/education" prefetch={false}>
            Explore all capabilities
          </Link>
        </nav>
      </div>
      <EducationWorkbench
        initialDocument={publicExample(selection)}
        initialSelection={selection}
        editor
      />
    </main>
  );
}
