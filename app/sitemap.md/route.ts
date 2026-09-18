import { agentResponse } from "../agent-content.ts";

export function GET(request: Request) {
  return agentResponse(request, "/llms.txt");
}
export const HEAD = GET;
