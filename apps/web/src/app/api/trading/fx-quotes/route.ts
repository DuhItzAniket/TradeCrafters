import { fxQuoteRequest } from "@tradecrafters/contracts";
import { issueFxQuote } from "@tradecrafters/database/trading";
import { api, json, parseBody, requireIdentity } from "@/lib/api";
export const runtime = "nodejs";
export async function POST(request: Request) {
  return api(async () => {
    const user = await requireIdentity(request, true);
    const body = await parseBody(request, fxQuoteRequest);
    return json(
      {
        quote: await issueFxQuote(
          user.id,
          body.accountId,
          body.fromCurrency,
          body.toCurrency,
        ),
      },
      201,
    );
  }, request);
}
