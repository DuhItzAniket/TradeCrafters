import { activityQuery } from "@tradecrafters/contracts";
import { activity } from "@tradecrafters/database/trading";
import { api, json, requireIdentity, ApiError } from "@/lib/api";
import { queryInput } from "@/lib/trading-api";
export const runtime = "nodejs";
export async function GET(request: Request) {
  return api(async () => {
    const user = await requireIdentity(request);
    const parsed = activityQuery.safeParse(queryInput(request));
    if (!parsed.success)
      throw new ApiError(
        "INVALID_REQUEST",
        400,
        "Supply a valid account and optional activity cursor.",
      );
    return json(
      await activity(user.id, parsed.data.accountId, parsed.data.before),
    );
  }, request);
}
