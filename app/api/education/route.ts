import { isIP } from "node:net";
import { projectFigure } from "../../../src/v2/index.ts";
import { boundedJSON } from "../../../src/v2/safety.ts";
import { authorEnvelopeSchema } from "../../../src/v2/schema.ts";
import { parseSelection } from "../../education/catalog.ts";
import { publicExample } from "../../education/examples.ts";
import { maxUploadBytes } from "../../education/public-state.ts";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const headers = { "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff" };
const unavailable = (status: number) =>
  Response.json({ error: "Invalid or unsupported educational figure." }, { status, headers });
export async function GET(request: Request) {
  const params = new URL(request.url).searchParams;
  if (
    [...params.keys()].some(
      (key) => !["case", "stage", "theme"].includes(key) || params.getAll(key).length !== 1,
    )
  )
    return unavailable(400);
  const selection = parseSelection(Object.fromEntries(params));
  if (!selection) return unavailable(400);
  try {
    return Response.json({ document: publicExample(selection) }, { headers });
  } catch {
    return unavailable(422);
  }
}
async function readBounded(request: Request) {
  if (!request.body) throw new Error("Empty request");
  const reader = request.body.getReader();
  const decoder = new TextDecoder("utf-8", { fatal: true });
  let bytes = 0;
  let text = "";
  try {
    while (true) {
      const chunk = await reader.read();
      if (chunk.done) break;
      bytes += chunk.value.byteLength;
      if (bytes > maxUploadBytes) throw new RangeError("Request too large");
      text += decoder.decode(chunk.value, { stream: true });
    }
    return JSON.parse(text + decoder.decode());
  } finally {
    await reader.cancel();
    reader.releaseLock();
  }
}
function canonicalHTTPOrigin(protocol: string, authority: string): string | null {
  if ((protocol !== "http:" && protocol !== "https:") || authority.length > 320) return null;
  const match = /^(\[[0-9a-f:.]+\]|[a-z0-9.-]+)(?::([0-9]{1,5}))?$/i.exec(authority);
  if (!match || match[0] !== authority || !match[1]) return null;
  const hostname = match[1];
  if (match[2] !== undefined && Number(match[2]) > 65535) return null;
  if (hostname.startsWith("[")) {
    if (isIP(hostname.slice(1, -1)) !== 6) return null;
  } else {
    const domain = hostname.endsWith(".") ? hostname.slice(0, -1) : hostname;
    if (
      domain.length > 253 ||
      domain.split(".").some((label) => !/^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/i.test(label))
    )
      return null;
  }
  return new URL(`${protocol}//${authority}`).origin;
}

function allowsRequestOrigin(request: Request): boolean {
  try {
    const url = new URL(request.url);
    if (url.username || url.password) return false;
    const expected = canonicalHTTPOrigin(url.protocol, request.headers.get("host") ?? url.host);
    if (!expected) return false;
    const origin = request.headers.get("origin");
    if (origin === null) return true;
    const match = /^(https?):\/\/(.+)$/i.exec(origin);
    if (!match || match[0] !== origin || !match[1] || !match[2]) return false;
    return canonicalHTTPOrigin(`${match[1].toLowerCase()}:`, match[2]) === expected;
  } catch {
    return false;
  }
}

export async function POST(request: Request) {
  if (!allowsRequestOrigin(request)) return unavailable(403);
  if (request.headers.get("content-type")?.split(";")[0]?.trim() !== "application/json")
    return unavailable(415);
  if (Number(request.headers.get("content-length")) > maxUploadBytes) return unavailable(413);
  try {
    const input = await readBounded(request);
    if (
      !input ||
      typeof input !== "object" ||
      Object.keys(input).sort().join(",") !== "author,stage,theme"
    )
      return unavailable(400);
    const selection = parseSelection({ stage: input.stage, theme: input.theme });
    if (!selection || typeof input.stage !== "string" || typeof input.theme !== "string")
      return unavailable(400);
    const author = authorEnvelopeSchema.parse(boundedJSON(input.author));
    const projected = projectFigure(author, selection.stage);
    return projected.ok
      ? Response.json({ document: { ...projected.document, theme: selection.theme } }, { headers })
      : unavailable(422);
  } catch (error) {
    return unavailable(error instanceof RangeError ? 413 : 422);
  }
}
