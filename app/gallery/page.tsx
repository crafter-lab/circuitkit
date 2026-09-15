import { getCatalog, type RecipeId, renderSVG } from "../../src/index.ts";
import { complexRecipeIds } from "../../src/schema.ts";
import { getGalleryCases } from "./corpus.ts";
import GalleryClient, { type GalleryCard } from "./gallery-client.tsx";
import StressPanel from "./stress-panel.tsx";
import "./gallery.css";

export const metadata = {
  title: "Gallery | CircuitKit",
  description:
    "Explore local circuit figures, inspect expected diagnostics, and stress test the renderer.",
};

export default async function GalleryPage({
  searchParams,
}: {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = (await searchParams) ?? {};
  const catalog = getCatalog();
  const complex = new Set<RecipeId>(complexRecipeIds);
  const recipes = catalog.recipes
    .map(({ id, title }) => ({ id, title, complex: complex.has(id) }))
    .sort((a, b) => Number(b.complex) - Number(a.complex));
  const entries = getGalleryCases();
  const ordered = (["examples", "edge-cases"] as const).flatMap((group) => {
    const queues = recipes.map(({ id }) =>
      entries.filter((entry) => entry.group === group && entry.recipe === id),
    );
    const length = Math.max(0, ...queues.map((queue) => queue.length));
    return Array.from({ length }, (_, index) =>
      queues.flatMap((queue) => (queue[index] ? [queue[index]] : [])),
    ).flat();
  });
  const cards: GalleryCard[] = ordered.map((entry) => {
    const result = renderSVG(entry.document);
    const expectation = entry.expectation;
    const passed =
      expectation.kind === "render"
        ? result.ok
        : !result.ok && result.diagnostics.some(({ code }) => code === expectation.code);
    return {
      id: entry.id,
      title: entry.title,
      description: entry.description,
      recipe: entry.recipe,
      complex: complex.has(entry.recipe),
      componentCount: result.ok ? Object.keys(result.circuit.components).length : null,
      netCount: result.ok ? Object.keys(result.circuit.nets).length : null,
      preset: entry.preset,
      group: entry.group,
      tags: entry.tags,
      expectation: entry.expectation,
      rendered: result.ok,
      passed,
      diagnosticCode: result.diagnostics[0]?.code ?? null,
      diagnosticCount: result.diagnostics.length,
    };
  });
  const initialFilters = Object.fromEntries(
    ["group", "recipe", "theme", "q"].map((key) => [
      key,
      typeof params[key] === "string" ? params[key] : "",
    ]),
  );
  return (
    <main id="main" className="gallery-main">
      <div className="intro gallery-intro">
        <span className="eyebrow">The local collection / {cards.length} cases</span>
        <h1>Different topologies. Clear connections.</h1>
        <p>
          Explore branching networks, bridges, transistor stages, and feedback loops. Distinct
          circuit graphs first, then their values, themes, and focus variants. Drawing, not
          simulation.
        </p>
        <div className="gallery-intro-meta">
          <span>{new Set(cards.map((card) => card.recipe)).size} distinct topologies</span>
          <span>
            {new Set(cards.filter((card) => card.complex).map((card) => card.recipe)).size} complex
            circuit families
          </span>
          <span>{new Set(cards.map((card) => card.preset)).size} themes</span>
          <span>Real renderer output</span>
        </div>
      </div>
      <StressPanel />
      <GalleryClient
        cards={cards}
        recipes={recipes}
        themes={catalog.themes.presets.map((id) => ({ id, title: id.replace("geist-", "") }))}
        initialFilters={initialFilters}
      />
    </main>
  );
}
