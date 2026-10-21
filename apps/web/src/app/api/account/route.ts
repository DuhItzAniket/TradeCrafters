import { createAccountSchema } from "@tradecrafters/contracts";
import { createAccount, readAccount } from "@tradecrafters/database";
import { api, json, parseBody, requireIdentity } from "@/lib/api";
export const runtime = "nodejs";
export async function GET(request: Request) {
  return api(async () => {
    const user = await requireIdentity(request);
    return json({ account: await readAccount(user.id) });
  }, request);
}
export async function POST(request: Request) {
  return api(async () => {
    const user = await requireIdentity(request, true);
    const body = await parseBody(request, createAccountSchema);
    return json(
      { account: await createAccount(user.id, body.reportingCurrency) },
      201,
    );
  }, request);
}
