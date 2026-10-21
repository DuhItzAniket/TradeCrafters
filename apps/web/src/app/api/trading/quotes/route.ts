import { trainingQuoteRequest } from "@tradecrafters/contracts";
import { issueTrainingQuote } from "@tradecrafters/database/trading";
import { api, json, parseBody, requireIdentity } from "@/lib/api";
export const runtime = "nodejs";
export async function POST(request: Request) {
  return api(async () => {
    const user = await requireIdentity(request, true);
    const body = await parseBody(request, trainingQuoteRequest);
    return json(
      await issueTrainingQuote(user.id, body.accountId, body.listingId),
      201,
    );
  }, request);
}
