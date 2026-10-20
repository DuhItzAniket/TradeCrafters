import { listingPolicy } from "@tradecrafters/database/policies";
import { api, ApiError, json } from "@/lib/api";
export const runtime = "nodejs";
export async function GET(
  request: Request,
  { params }: { params: Promise<{ listingId: string }> },
) {
  return api(async () => {
    const { listingId } = await params;
    if (
      !/^[a-zA-Z0-9_-]{1,64}$/.test(listingId) ||
      new URL(request.url).searchParams.size
    )
      throw new ApiError(
        "INVALID_REQUEST",
        400,
        "Choose a listing without clock or policy overrides.",
      );
    const view = await listingPolicy(listingId);
    if (!view)
      throw new ApiError("NOT_FOUND", 404, "This listing was not found.");
    return json(view);
  });
}
