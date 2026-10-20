import { toNextJsHandler } from "better-auth/next-js";
import { getAuth } from "@tradecrafters/database/auth";
import {
  api,
  assertOrigin,
  boundedBody,
  requireSession,
  ApiError,
} from "@/lib/api";
import { clearStepUps, securityState } from "@tradecrafters/database/security";
export const runtime = "nodejs";
export async function GET(request: Request) {
  return api(() => toNextJsHandler(getAuth()).GET(request));
}
export async function POST(request: Request) {
  return api(async () => {
    assertOrigin(request);
    let path: string;
    try {
      path = decodeURIComponent(new URL(request.url).pathname)
        .replace(/\/{2,}/g, "/")
        .replace(/\/+$/, "");
    } catch {
      throw new ApiError(
        "INVALID_REQUEST",
        400,
        "Invalid authentication path.",
      );
    }
    let settingsUserId: string | undefined;
    if (
      path.startsWith("/api/auth/two-factor/") &&
      ![
        "/api/auth/two-factor/verify-totp",
        "/api/auth/two-factor/verify-backup-code",
      ].includes(path)
    ) {
      const session = await requireSession(request);
      settingsUserId = session.user.id;
      if (
        Date.now() - new Date(session.session.createdAt).getTime() >
        10 * 60 * 1000
      )
        throw new ApiError(
          "REAUTH_REQUIRED",
          403,
          "Sign out and sign in again before changing authenticator settings.",
        );
      if (
        [
          "/api/auth/two-factor/disable",
          "/api/auth/two-factor/generate-backup-codes",
          "/api/auth/two-factor/get-totp-uri",
        ].includes(path)
      ) {
        const state = await securityState(session.user.id, session.session.id);
        if (!state.stepUpExpiresAt)
          throw new ApiError(
            "MFA_REQUIRED",
            403,
            "Verify your current authenticator before changing or revealing security settings.",
          );
      }
    }
    const body = await boundedBody(request);
    const response = await toNextJsHandler(getAuth()).POST(
      new Request(request.url, {
        method: request.method,
        headers: request.headers,
        body,
        signal: request.signal,
      }),
    );
    if (
      response.ok &&
      settingsUserId &&
      ["/api/auth/two-factor/enable", "/api/auth/two-factor/disable"].includes(
        path,
      )
    )
      await clearStepUps(settingsUserId);
    return response;
  });
}
