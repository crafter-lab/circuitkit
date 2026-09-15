import { getGalleryCase } from "../corpus.ts";

export function GET(request: Request): Response {
  const entry = getGalleryCase(new URL(request.url).searchParams.get("case") ?? "");
  if (!entry) {
    return Response.json(
      {
        ok: false,
        diagnostics: [
          {
            code: "gallery.unknown_case",
            path: "/case",
            message: "Choose an exact case ID from the local gallery.",
          },
        ],
      },
      { status: 404 },
    );
  }
  return new Response(`${JSON.stringify(entry.document, null, 2)}\n`, {
    headers: {
      "Content-Type": "application/json;charset=utf-8",
      "Content-Disposition": `attachment; filename="${entry.id.replaceAll("/", "-")}.json"`,
      "X-Content-Type-Options": "nosniff",
      "Cache-Control": "no-cache",
    },
  });
}
