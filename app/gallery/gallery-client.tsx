"use client";

import { useSearchParams } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import type { GalleryCase } from "./corpus.ts";

export type GalleryCard = Pick<
  GalleryCase,
  "id" | "title" | "description" | "recipe" | "preset" | "group" | "tags" | "expectation"
> & {
  rendered: boolean;
  passed: boolean;
  complex: boolean;
  componentCount: number | null;
  netCount: number | null;
  diagnosticCode: string | null;
  diagnosticCount: number;
};

type Option = { id: string; title: string };
type Filters = { group: string; recipe: string; theme: string; q: string };

function parseFilters(
  values: Record<string, string>,
  recipes: Option[],
  themes: Option[],
): Filters {
  return {
    group: values.group === "edge-cases" || values.group === "all" ? values.group : "examples",
    recipe: recipes.some(({ id }) => id === values.recipe) ? (values.recipe ?? "") : "",
    theme: themes.some(({ id }) => id === values.theme) ? (values.theme ?? "") : "",
    q: values.q ?? "",
  };
}

function filterParams(filters: Filters): URLSearchParams {
  const params = new URLSearchParams({ group: filters.group });
  if (filters.recipe) params.set("recipe", filters.recipe);
  if (filters.theme) params.set("theme", filters.theme);
  if (filters.q) params.set("q", filters.q);
  return params;
}
const groups = [
  { id: "examples", label: "Examples" },
  { id: "edge-cases", label: "Edge cases" },
  { id: "all", label: "All cases" },
] as const;

export default function GalleryClient({
  cards,
  recipes,
  themes,
  initialFilters,
}: {
  cards: GalleryCard[];
  recipes: (Option & { complex: boolean })[];
  themes: Option[];
  initialFilters: Record<string, string>;
}) {
  const searchParams = useSearchParams();
  const [filters, setFilters] = useState(() => parseFilters(initialFilters, recipes, themes));
  const { group, recipe, theme, q: query } = filters;
  const recipeLabels = useMemo(
    () => new Map(recipes.map(({ id, title }) => [id, title])),
    [recipes],
  );
  const themeLabels = useMemo(() => new Map(themes.map(({ id, title }) => [id, title])), [themes]);
  useEffect(() => {
    function restore() {
      const next = parseFilters(
        Object.fromEntries(new URLSearchParams(window.location.search)),
        recipes,
        themes,
      );
      setFilters((current) =>
        current.group === next.group &&
        current.recipe === next.recipe &&
        current.theme === next.theme &&
        current.q === next.q
          ? current
          : next,
      );
    }
    if (searchParams?.toString() === new URLSearchParams(window.location.search).toString()) {
      restore();
    }
    window.addEventListener("popstate", restore);
    window.addEventListener("pageshow", restore);
    return () => {
      window.removeEventListener("popstate", restore);
      window.removeEventListener("pageshow", restore);
    };
  }, [recipes, themes, searchParams]);
  function changeFilters(patch: Partial<Filters>) {
    const next = { ...filters, ...patch };
    setFilters(next);
    const url = new URL(window.location.href);
    url.search = filterParams(next).toString();
    window.history.replaceState(null, "", `${url.pathname}${url.search}${url.hash}`);
  }
  const search = query.trim().toLowerCase();
  const visible = useMemo(
    () =>
      cards.filter(
        (card) =>
          (group === "all" || card.group === group) &&
          (!recipe || card.recipe === recipe) &&
          (!theme || card.preset === theme) &&
          (!search ||
            `${card.id} ${card.title} ${card.description} ${card.tags.join(" ")} ${card.diagnosticCode ?? ""}`
              .toLowerCase()
              .includes(search)),
      ),
    [cards, group, recipe, theme, search],
  );
  const filterQuery = filterParams(filters);
  function reset() {
    changeFilters({ group: "examples", recipe: "", theme: "", q: "" });
  }
  return (
    <section className="gallery-collection" aria-labelledby="collection-heading">
      <div className="gallery-section-heading">
        <div>
          <span className="eyebrow">Browse the corpus</span>
          <h2 id="collection-heading">Find your figure.</h2>
        </div>
        <a className="gallery-text-link" href={`?${filterQuery.toString()}#collection-heading`}>
          Link to this selection
        </a>
      </div>
      <fieldset className="gallery-tabs">
        <legend className="sr-only">Case category</legend>
        {groups.map((item) => (
          <button
            type="button"
            key={item.id}
            aria-pressed={group === item.id}
            onClick={() => changeFilters({ group: item.id })}
          >
            {item.label}
            <span>
              {item.id === "all"
                ? cards.length
                : cards.filter((card) => card.group === item.id).length}
            </span>
          </button>
        ))}
      </fieldset>
      <div className="gallery-filters">
        <label className="field gallery-search">
          <span>Search the collection</span>
          <input
            type="search"
            placeholder="Try “bridge”, “feedback”, or a diagnostic code"
            value={query}
            onChange={(event) => changeFilters({ q: event.currentTarget.value })}
          />
        </label>
        <label className="field">
          <span>Topology</span>
          <select
            value={recipe}
            onChange={(event) => changeFilters({ recipe: event.currentTarget.value })}
          >
            <option value="">All topologies</option>
            {recipes.map(({ id, title }) => (
              <option key={id} value={id}>
                {title} ({cards.filter((card) => card.recipe === id).length})
              </option>
            ))}
          </select>
        </label>
        <label className="field">
          <span>Theme</span>
          <select
            value={theme}
            onChange={(event) => changeFilters({ theme: event.currentTarget.value })}
          >
            <option value="">All themes</option>
            {themes.map(({ id, title }) => (
              <option key={id} value={id}>
                {title}
              </option>
            ))}
          </select>
        </label>
        <button type="button" className="quiet" onClick={reset}>
          Reset filters
        </button>
      </div>
      <div className="gallery-results-bar">
        <p role="status">
          {visible.length} {visible.length === 1 ? "result" : "results"}{" "}
          <span>of {cards.length} local cases</span>
        </p>
        <p>Expected rejections are passing cases, not bugs.</p>
      </div>
      {visible.length ? (
        <div className="gallery-grid">
          {visible.map((card) => {
            const href = `/gallery/view?case=${encodeURIComponent(card.id)}&${filterQuery.toString()}`;
            return (
              <article className="gallery-card" key={card.id}>
                <a
                  className={`gallery-thumbnail ${card.rendered ? "" : "gallery-thumbnail-rejected"}`}
                  href={href}
                  aria-label={`Inspect ${card.title}, ${themeLabels.get(card.preset) ?? card.preset}`}
                >
                  {card.rendered ? (
                    <img
                      src={`/gallery/figure?case=${encodeURIComponent(card.id)}`}
                      alt={`${card.title}, ${recipeLabels.get(card.recipe) ?? card.recipe}, ${themeLabels.get(card.preset) ?? card.preset} theme`}
                      loading="lazy"
                      decoding="async"
                      width={1000}
                      height={600}
                    />
                  ) : (
                    <div className="gallery-rejection-preview">
                      <span className="eyebrow">
                        {card.passed ? "Rejected as expected" : "Unexpected rejection"}
                      </span>
                      <strong>No figure emitted.</strong>
                      <code>{card.diagnosticCode ?? "No diagnostic returned"}</code>
                      <span>
                        {card.diagnosticCount}{" "}
                        {card.diagnosticCount === 1 ? "diagnostic" : "diagnostics"} · Inspect to see
                        the exact source and pointers
                      </span>
                    </div>
                  )}
                </a>
                <div className="gallery-card-body">
                  <div className="gallery-card-meta">
                    <span>
                      {recipeLabels.get(card.recipe) ?? card.recipe} /{" "}
                      {themeLabels.get(card.preset) ?? card.preset}
                    </span>
                    <span className={`gallery-badge ${card.passed ? "is-pass" : "is-fail"}`}>
                      {card.passed
                        ? card.rendered
                          ? "Render matches"
                          : "Expected rejection"
                        : "Unexpected result"}
                    </span>
                  </div>
                  <h3>
                    <a href={href}>
                      {card.title}
                      <span aria-hidden="true">↗</span>
                    </a>
                  </h3>
                  <p>{card.description}</p>
                  <div className="gallery-tags">
                    {card.complex ? <span>Complex topology</span> : null}
                    {card.componentCount !== null ? (
                      <span>{card.componentCount} components</span>
                    ) : null}
                    {card.netCount !== null ? <span>{card.netCount} electrical nets</span> : null}
                    {card.tags.map((tag) => (
                      <span key={tag}>{tag}</span>
                    ))}
                  </div>
                  <div className="gallery-card-expectation">
                    <span>
                      Expected: {card.expectation.kind === "render" ? "SVG" : card.expectation.code}
                    </span>
                    <span>Actual: {card.rendered ? "SVG" : "rejected"}</span>
                  </div>
                </div>
              </article>
            );
          })}
        </div>
      ) : (
        <div className="gallery-empty">
          <span className="eyebrow">No matching cases</span>
          <h3>A different combination, perhaps?</h3>
          <p>
            Search titles, descriptions, IDs, tags, and diagnostic codes. Or start again with every
            example.
          </p>
          <button type="button" onClick={reset}>
            Reset filters
          </button>
        </div>
      )}
    </section>
  );
}
