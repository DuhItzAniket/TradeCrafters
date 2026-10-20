import { verifyFactorSchema } from "@tradecrafters/contracts";
import {
  consumeMfaBudget,
  recordStepUp,
  securityState,
} from "@tradecrafters/database/security";
import { authConfiguration, getAuth } from "@tradecrafters/database/auth";
import { api, ApiError, json, parseBody, requireSession } from "@/lib/api";
export async function POST(request: Request) {
  return api(async () => {
    const session = await requireSession(request, true);
    const body = await parseBody(request, verifyFactorSchema);
    const state = await securityState(session.user.id, session.session.id);
    if (!state.mfaEnabled)
      throw new ApiError(
        "MFA_REQUIRED",
        403,
        "Enroll and verify your authenticator first.",
      );
    if (!(await consumeMfaBudget(session.user.id)))
      throw new ApiError(
        "RATE_LIMITED",
        429,
        "Too many verification attempts. Wait a minute and use a new code.",
      );
    let verified: Response;
    try {
      verified = await getAuth().api.verifyTOTP({
        headers: request.headers,
        body: { code: body.code, trustDevice: false },
        asResponse: true,
      });
    } catch {
      throw new ApiError(
        "INVALID_FACTOR",
        401,
        "The authenticator code could not be verified.",
      );
    }
    if (!verified.ok)
      throw new ApiError(
        "INVALID_FACTOR",
        401,
        "The authenticator code could not be verified.",
      );
    if (
      !(await recordStepUp(
        session.user.id,
        session.session.id,
        body.code,
        authConfiguration().secret,
      ))
    )
      throw new ApiError(
        "INVALID_FACTOR",
        409,
        "This code was already used. Wait for a new authenticator code.",
      );
    return json(await securityState(session.user.id, session.session.id));
  });
}
