// The auth SDK's own errors are flat. Our same-origin guard responses use the
// application envelope, which the SDK retains under error.error.
export function authErrorMessage(error: unknown, fallback: string): string {
  if (!error || typeof error !== "object") return fallback;
  if (
    "error" in error &&
    error.error &&
    typeof error.error === "object" &&
    "message" in error.error &&
    typeof error.error.message === "string" &&
    error.error.message.trim()
  )
    return error.error.message;
  if (
    "message" in error &&
    typeof error.message === "string" &&
    error.message.trim()
  )
    return error.message;
  return fallback;
}
