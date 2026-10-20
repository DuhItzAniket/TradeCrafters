import { toNextJsHandler } from "better-auth/next-js";
import { getAuth } from "@tradecrafters/database/auth";
import { api, assertOrigin, boundedBody } from "@/lib/api";
export const runtime = "nodejs";
export async function GET(request: Request) {
  return toNextJsHandler(getAuth()).GET(request);
}
export async function POST(request: Request) {
  return api(async () => {
    assertOrigin(request);
    const body = await boundedBody(request);
    return toNextJsHandler(getAuth()).POST(
      new Request(request.url, {
        method: request.method,
        headers: request.headers,
        body,
        signal: request.signal,
      }),
    );
  });
}
