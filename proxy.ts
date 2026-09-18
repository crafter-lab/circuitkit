import { shouldServeMarkdown } from "@vercel/agent-readability";
import { type NextRequest, NextResponse } from "next/server";
import { agentResponse } from "./app/agent-content.ts";

export async function proxy(request: NextRequest) {
  if (
    (request.method !== "GET" && request.method !== "HEAD") ||
    request.headers.has("rsc") ||
    request.headers.has("next-router-state-tree") ||
    request.nextUrl.pathname === "/markdown"
  )
    return NextResponse.next();
  const rawDocumentation =
    request.nextUrl.pathname.startsWith("/docs/") && request.nextUrl.pathname.endsWith(".md");
  if (rawDocumentation || shouldServeMarkdown(request).serve) return agentResponse(request);
  const response = NextResponse.next();
  response.headers.set("Vary", "Accept, User-Agent, Signature-Agent, Sec-Fetch-Mode");
  return response;
}

export const config = { matcher: ["/((?!api|_next|.*\\..*).*)", "/docs/:path*"] };
