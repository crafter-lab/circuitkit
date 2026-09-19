import { renderSchematicSVG } from "../../../src/index.ts";
import { getGalleryCase } from "../corpus.ts";

export function GET(request: Request): Response {
  const params = new URL(request.url).searchParams;
  const entry = getGalleryCase(params.get("case") ?? "");
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
  const result = renderSchematicSVG(entry.document);
  if (!result.ok) return Response.json(result, { status: 422 });
  const filename = `${entry.id.replaceAll("/", "-")}.svg`;
  return new Response(result.svg, {
    headers: {
      "Content-Type": "image/svg+xml;charset=utf-8",
      "Content-Disposition": `${params.get("download") === "1" ? "attachment" : "inline"}; filename="${filename}"`,
      "X-Content-Type-Options": "nosniff",
      "Content-Security-Policy": "default-src 'none'; sandbox",
      "Cache-Control": "no-cache",
    },
  });
}
