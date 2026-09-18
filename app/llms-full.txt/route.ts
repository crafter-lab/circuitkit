import { agentResponse } from "../agent-content.ts";

export function GET(request: Request) {
  return agentResponse(request);
}
export const HEAD = GET;
