import Link from "next/link";
import { notFound } from "next/navigation";
import { getCatalog, getSchema } from "../../src/index.ts";
import { getGalleryCase } from "../gallery/corpus.ts";
import Playground from "../playground.tsx";
import "./editor.css";

export const metadata = {
  title: "Editor | CircuitKit",
  description:
    "Create, explain and share circuit figures. Edit JSON or Markdown and export SVG or PNG locally.",
};

export default async function EditorPage({
  searchParams,
}: {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
} = {}) {
  const params = (await searchParams) ?? {};
  if (params.mode === "circuitkit" && params.case === undefined) {
    const { default: CircuitPage } = await import("./circuit-page.tsx");
    return CircuitPage({
      example: typeof params.example === "string" ? params.example : undefined,
    });
  }
  const entry = typeof params.case === "string" ? getGalleryCase(params.case) : undefined;
  if (params.case !== undefined && !entry) notFound();
  return (
    <main id="main" className="editor-page">
      <div className="intro">
        <span className="eyebrow">Circuit editor</span>
        <h1>Circuits, made legible.</h1>
        <p>Choose a recipe, make it yours, export a figure. Drawing, not simulation.</p>
        <p className="editor-origin">
          <Link href="/editor?mode=circuitkit" prefetch={false}>
            CircuitKit source, highlights & flow
          </Link>
          {" · "}
          <Link href="/markdown" prefetch={false}>
            Write modules & connections in Markdown →
          </Link>
          {" · "}
          <Link href="/editor/education" prefetch={false}>
            Education editor
          </Link>
          {" · "}
          <Link href="/gallery/education" prefetch={false}>
            Explore 12 typed panel families
          </Link>
          {" · Legacy recipes remain available below for compatibility."}
        </p>
        {entry ? (
          <p className="editor-origin">
            Editing a local copy of{" "}
            <Link href={`/gallery/view?case=${encodeURIComponent(entry.id)}`} prefetch={false}>
              {entry.title} · {entry.preset}
            </Link>
            . The gallery source is unchanged.
          </p>
        ) : null}
      </div>
      <Playground key={entry?.id ?? "default"} initialDocument={entry?.document} />
      <details className="editor-reference">
        <summary>The public contract</summary>
        <p>Schema and catalog are also available through the local CLI. No account required.</p>
        <div className="reference-details">
          <details>
            <summary>Document JSON schema</summary>
            <pre>{JSON.stringify(getSchema(), null, 2)}</pre>
          </details>
          <details>
            <summary>Recipes, pins & SI parameters</summary>
            <pre>{JSON.stringify(getCatalog(), null, 2)}</pre>
          </details>
        </div>
      </details>
    </main>
  );
}
