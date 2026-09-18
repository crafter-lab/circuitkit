import DocsPage from "./docs-page.tsx";

export const metadata = {
  title: "Documentation | CircuitKit",
  description:
    "Start with your coding agent or write your first circuit. Step-by-step guides, real previews and the CLI reference.",
  alternates: { canonical: "/docs", types: { "text/markdown": "/docs/introduction.md" } },
};
export default function Page() {
  return DocsPage({ slug: "introduction" });
}
