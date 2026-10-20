import type { z } from "zod";
import type { ApiErrorCode } from "@tradecrafters/contracts";
import { consumeMutationBudget } from "@tradecrafters/database";
import { TradingFault } from "@tradecrafters/domain/trading";
import { authConfiguration, getAuth } from "@tradecrafters/database/auth";
import {
  securityState,
  SimulationPausedError,
} from "@tradecrafters/database/security";

export class ApiError extends Error {
  constructor(
    public code: ApiErrorCode,
    public status: number,
    message: string,
  ) {
    super(message);
  }
}
export const json = (value: unknown, status = 200) =>
  Response.json(value, { status, headers: { "Cache-Control": "no-store" } });
export async function api(run: () => Promise<Response>) {
  try {
    return await run();
  } catch (error) {
    if (error instanceof TradingFault)
      return json(
        { error: { code: error.code, message: error.message } },
        error.status,
      );
    if (error instanceof SimulationPausedError)
      return json(
        { error: { code: "SIMULATION_PAUSED", message: error.message } },
        503,
      );
    if (error instanceof ApiError)
      return json(
        { error: { code: error.code, message: error.message } },
        error.status,
      );
    // Do not log SQL driver messages, connection configuration, bodies or tokens.
    console.error("TradeCrafters request failed", {
      type: error instanceof Error ? error.name : "Unknown",
    });
    return json(
      {
        error: {
          code: "INTERNAL_ERROR",
          message: "We could not complete this request. Please try again.",
        },
      },
      500,
    );
  }
}

export function assertOrigin(request: Request) {
  if (request.headers.get("origin") !== authConfiguration().url.origin)
    throw new ApiError(
      "FORBIDDEN_ORIGIN",
      403,
      "This request must come from TradeCrafters.",
    );
  if (request.headers.get("sec-fetch-site") === "cross-site")
    throw new ApiError(
      "FORBIDDEN_ORIGIN",
      403,
      "Cross-site requests are not accepted.",
    );
}
export async function boundedBody(request: Request) {
  if (
    !request.headers
      .get("content-type")
      ?.toLowerCase()
      .startsWith("application/json")
  )
    throw new ApiError("INVALID_REQUEST", 415, "Send application/json.");
  const max = 16384;
  const size = Number(request.headers.get("content-length") || 0);
  if (size > max)
    throw new ApiError("PAYLOAD_TOO_LARGE", 413, "This request is too large.");
  const reader = request.body?.getReader();
  if (!reader)
    throw new ApiError("INVALID_REQUEST", 400, "A JSON body is required.");
  const chunks: Uint8Array[] = [];
  let received = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    received += value.byteLength;
    if (received > max) {
      await reader.cancel();
      throw new ApiError(
        "PAYLOAD_TOO_LARGE",
        413,
        "This request is too large.",
      );
    }
    chunks.push(value);
  }
  const body = new Uint8Array(received);
  let offset = 0;
  for (const chunk of chunks) {
    body.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return new TextDecoder().decode(body);
}
export async function parseBody<T>(
  request: Request,
  schema: z.ZodType<T>,
): Promise<T> {
  const raw = await boundedBody(request);
  let value: unknown;
  try {
    value = JSON.parse(raw);
  } catch {
    throw new ApiError("INVALID_REQUEST", 400, "Invalid JSON.");
  }
  const result = schema.safeParse(value);
  if (!result.success)
    throw new ApiError(
      "INVALID_REQUEST",
      400,
      "Check the supplied fields and currency.",
    );
  return result.data;
}
export async function requireSession(request: Request, mutation = false) {
  if (mutation) assertOrigin(request);
  const session = await getAuth().api.getSession({ headers: request.headers });
  if (!session)
    throw new ApiError(
      "UNAUTHENTICATED",
      401,
      "Sign in to access your account.",
    );
  if (
    !session.user.emailVerified &&
    process.env.AUTH_DEV_CREDENTIALS !== "true"
  )
    throw new ApiError(
      "UNVERIFIED_IDENTITY",
      403,
      "A verified sign-in identity is required.",
    );
  if (mutation && !(await consumeMutationBudget(session.user.id)))
    throw new ApiError(
      "RATE_LIMITED",
      429,
      "Too many changes. Please wait a minute.",
    );
  return session;
}
export async function requireIdentity(request: Request, mutation = false) {
  return (await requireSession(request, mutation)).user;
}
export async function requireAdmin(request: Request, mutation = false) {
  const session = await requireSession(request, mutation);
  const state = await securityState(session.user.id, session.session.id);
  if (!session.user.emailVerified || !state.isAdmin)
    throw new ApiError("FORBIDDEN", 403, "Administrator access is required.");
  if (!state.mfaEnabled || !state.stepUpExpiresAt)
    throw new ApiError(
      "MFA_REQUIRED",
      403,
      "Verify your authenticator to unlock administrator controls for five minutes.",
    );
  return session;
}
