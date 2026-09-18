import { notFound } from "next/navigation";
import { docSlug, docsCatalog, docURL } from "../catalog.ts";
import DocsPage from "../docs-page.tsx";

type Props = { params: Promise<{ slug: string }> };
export function generateStaticParams() {
  return Object.keys(docsCatalog).map((slug) => ({ slug }));
}
export async function generateMetadata({ params }: Props) {
  const slug = docSlug((await params).slug);
  if (!slug) notFound();
  return {
    title: `${docsCatalog[slug].title} | CircuitKit`,
    description: docsCatalog[slug].description,
    alternates: { canonical: docURL(slug), types: { "text/markdown": `/docs/${slug}.md` } },
  };
}
export default async function Page({ params }: Props) {
  const slug = docSlug((await params).slug);
  if (!slug) notFound();
  return DocsPage({ slug });
}
