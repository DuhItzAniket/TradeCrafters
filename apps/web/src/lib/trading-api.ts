import { idempotencyKey } from "@tradecrafters/contracts";
import { ApiError, json } from "./api";
import type { OperationResult } from "@tradecrafters/domain/trading";
export function operationResponse(result: OperationResult) {
  const receipt = result.receipt;
  return json(
    {
      receipt,
      ...(receipt.status === "rejected"
        ? { error: { code: receipt.code, message: receipt.message } }
        : {}),
    },
    result.httpStatus,
  );
}
export function operationKey(request: Request) {
  const parsed = idempotencyKey.safeParse(
    request.headers.get("Idempotency-Key"),
  );
  if (!parsed.success)
    throw new ApiError(
      "INVALID_REQUEST",
      400,
      "Supply one 16–96 character Idempotency-Key and retain it until the outcome is confirmed.",
    );
  return parsed.data;
}
export function queryInput(request: Request) {
  const params = new URL(request.url).searchParams;
  if (new Set(params.keys()).size !== params.size)
    throw new ApiError(
      "INVALID_REQUEST",
      400,
      "Repeated parameters are not supported.",
    );
  return Object.fromEntries(params);
}
