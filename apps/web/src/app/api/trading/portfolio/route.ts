import { accountId } from "@tradecrafters/contracts";
import { portfolio } from "@tradecrafters/database/trading";
import { api, json, requireIdentity, ApiError } from "@/lib/api";
import { queryInput } from "@/lib/trading-api";
export const runtime = "nodejs";
export async function GET(request: Request) {
  return api(async () => {
    const user = await requireIdentity(request);
    const input = queryInput(request),
      parsed = accountId.safeParse(input.accountId);
    if (!parsed.success || Object.keys(input).length !== 1)
      throw new ApiError("INVALID_REQUEST", 400, "Supply one account ID.");
    return json({ portfolio: await portfolio(user.id, parsed.data) });
  }, request);
}
