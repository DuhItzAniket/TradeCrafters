import { securityState } from "@tradecrafters/database/security";
import { api, json, requireSession } from "@/lib/api";
export async function GET(request: Request) {
  return api(async () => {
    const session = await requireSession(request);
    return json(await securityState(session.user.id, session.session.id));
  });
}
