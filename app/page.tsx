import DeveloperLanding from "./landing/developer-landing.tsx";

export default async function Page({
  searchParams,
}: {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
} = {}) {
  const params = (await searchParams) ?? {};
  if (params.case !== undefined) {
    const { default: EditorPage } = await import("./editor/page.tsx");
    return EditorPage({ searchParams: Promise.resolve(params) });
  }
  return DeveloperLanding();
}
