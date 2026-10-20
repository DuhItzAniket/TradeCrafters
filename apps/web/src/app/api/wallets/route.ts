import { createWalletSchema } from "@tradecrafters/contracts";
import { createWallet, readAccount } from "@tradecrafters/database";
import { api, ApiError, json, parseBody, requireIdentity } from "@/lib/api";
export const runtime = "nodejs";
export async function POST(request: Request) {
  return api(async () => {
    const user = await requireIdentity(request, true);
    const body = await parseBody(request, createWalletSchema);
    if (!(await readAccount(user.id)))
      throw new ApiError(
        "ACCOUNT_REQUIRED",
        409,
        "Create a simulation account first.",
      );
    return json({ account: await createWallet(user.id, body.currency) }, 201);
  });
}
