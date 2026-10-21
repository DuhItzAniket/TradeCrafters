import { operationQuery } from "@tradecrafters/contracts";
import { operationByKey } from "@tradecrafters/database/trading";
import { api, json, requireIdentity, ApiError } from "@/lib/api";
import { queryInput } from "@/lib/trading-api";
export const runtime = "nodejs";
export async function GET(request: Request) {
  return api(async () => {
    const user = await requireIdentity(request);
    const parsed = operationQuery.safeParse(queryInput(request));
    if (!parsed.success)
      throw new ApiError(
        "INVALID_REQUEST",
        400,
        "Supply an account and operation key.",
      );
    const result = await operationByKey(
      user.id,
      parsed.data.accountId,
      parsed.data.key,
    );
    if (!result)
      throw new ApiError(
        "NOT_FOUND",
        404,
        "No committed outcome was found. Retry the same operation with the same key.",
      );
    return json({ receipt: result.receipt });
  }, request);
}
