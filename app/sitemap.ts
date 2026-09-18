import type { MetadataRoute } from "next";
import { siteOrigin } from "./agent-content.ts";
import { type DocSlug, docsCatalog, docURL, documentationModified } from "./docs/catalog.ts";

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const docs = await Promise.all(
    (Object.entries(docsCatalog) as [DocSlug, (typeof docsCatalog)[DocSlug]][]).map(
      async ([slug]) => ({
        url: `${siteOrigin}${docURL(slug)}`,
        lastModified: await documentationModified(slug),
      }),
    ),
  );
  const latest = new Date(Math.max(...docs.map((doc) => doc.lastModified.getTime())));
  return [{ url: siteOrigin, lastModified: latest }, ...docs];
}
