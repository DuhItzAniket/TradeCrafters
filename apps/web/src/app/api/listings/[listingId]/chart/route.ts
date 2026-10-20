import { z } from "zod";
import { trainingChart } from "@tradecrafters/database/workbench";
import { api, ApiError, json } from "@/lib/api";
import { queryInput } from "@/lib/trading-api";
const query = z
  .object({ window: z.enum(["15m", "60m"]).default("60m") })
  .strict();
export const runtime = "nodejs";
export async function GET(
  request: Request,
  { params }: { params: Promise<{ listingId: string }> },
) {
  return api(async () => {
    const parsed = query.safeParse(queryInput(request));
    if (!parsed.success)
      throw new ApiError(
        "INVALID_REQUEST",
        400,
        "Choose a 15m or 60m training window. The training clock is server-owned.",
      );
    const { listingId } = await params;
    return json(
      await trainingChart(listingId, parsed.data.window === "15m" ? 15 : 60),
    );
  });
}
