import { simulationControlSchema } from "@tradecrafters/contracts";
import {
  auditSummary,
  simulationControl,
  updateSimulationControl,
} from "@tradecrafters/database/security";
import { api, ApiError, json, parseBody, requireAdmin } from "@/lib/api";
export async function GET(request: Request) {
  return api(async () => {
    await requireAdmin(request);
    return json({
      control: await simulationControl(),
      audit: await auditSummary(),
    });
  });
}
export async function POST(request: Request) {
  return api(async () => {
    const session = await requireAdmin(request, true);
    const body = await parseBody(request, simulationControlSchema);
    if (
      !(await updateSimulationControl(
        session.user.id,
        session.session.id,
        body.paused,
        body.reason,
      ))
    )
      throw new ApiError(
        "MFA_REQUIRED",
        403,
        "Administrator access expired. Verify your authenticator again.",
      );
    return json({
      control: await simulationControl(),
      audit: await auditSummary(),
    });
  });
}
