import { fxIntentSchema } from "@tradecrafters/contracts";
import { convertFx } from "@tradecrafters/database/trading";
import { api, parseBody, requireSession } from "@/lib/api";
import { operationKey, operationResponse } from "@/lib/trading-api";
export const runtime = "nodejs";
export async function POST(request: Request) {
  return api(async () => {
    const session = await requireSession(request, true);
    const key = operationKey(request);
    const body = await parseBody(request, fxIntentSchema);
    const result = await convertFx(
      { userId: session.user.id, sessionId: session.session.id },
      key,
      body,
    );
    return operationResponse(result);
  }, request);
}
