import { directoryQuery } from "@tradecrafters/contracts";
import { directory } from "@tradecrafters/database";
import { api, ApiError, json } from "@/lib/api";
export const runtime = "nodejs";
export async function GET(request: Request) {
  return api(async () => {
    const parsed = directoryQuery.safeParse(
      Object.fromEntries(new URL(request.url).searchParams),
    );
    if (!parsed.success)
      throw new ApiError("INVALID_REQUEST", 400, "Invalid directory filters.");
    return json(await directory(parsed.data));
  }, request);
}
