import { getAuth } from "@tradecrafters/database/auth";

const unavailable = () =>
  Response.json(
    {
      error: {
        code: "SERVICE_UNAVAILABLE",
        message: "Sign-out could not be confirmed. Please try again.",
      },
    },
    {
      status: 503,
      headers: { "Cache-Control": "no-store", "Retry-After": "1" },
    },
  );

export async function confirmSignOut(
  request: Request,
  run: () => Promise<Response>,
) {
  const lookup = () =>
    getAuth().api.getSession({
      headers: request.headers,
      query: { disableCookieCache: true, disableRefresh: true },
    });
  let response: Response | undefined;
  try {
    // A library sign-out can clear the browser cookie even if its database
    // deletion failed. Confirm the captured credential is no longer live.
    const before = await lookup();
    response = await run();
    if (response.status >= 400) return response;
    if (before && (await lookup())) {
      await response.body?.cancel();
      return unavailable();
    }
    return response;
  } catch {
    await response?.body?.cancel().catch(() => {});
    // Do not send the SDK's clearing cookies on an unconfirmed result. The
    // client keeps its retry path; an already committed deletion is idempotent.
    return unavailable();
  }
}
