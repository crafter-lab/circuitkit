import { agentResponse } from "../agent-content.ts";

export function GET(request: Request) {
  return agentResponse(request, "/docs");
}
export const HEAD = GET;
