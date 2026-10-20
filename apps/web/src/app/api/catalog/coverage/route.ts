import { catalogCoverage } from "@tradecrafters/database/catalog";
import { api, ApiError, json } from "@/lib/api";
export const runtime = "nodejs";
export async function GET(request: Request) {
  return api(async () => {
    if (new URL(request.url).searchParams.size)
      throw new ApiError(
        "INVALID_REQUEST",
        400,
        "Coverage uses the current server date.",
      );
    return json(await catalogCoverage());
  });
}
