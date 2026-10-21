import { cache } from "react";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import {
  trustedNetwork,
  requestScope,
  RequestLimited,
} from "@tradecrafters/database/ingress";
import { consumeRequestBudget } from "@tradecrafters/database/request-budget";

export async function guardRequest(request: Request) {
  await consumeRequestBudget(
    requestScope(request),
    trustedNetwork(request.headers),
    process.env.BETTER_AUTH_SECRET || "",
  );
}

// One admission per React server render, including parallel layout/page work;
// never cache a decision across requests or sessions. Pages that read directly
// must call this too, since layouts can be reused during client navigation.
export const guardPage = cache(async () => {
  let reason: "limit" | "unavailable" | undefined;
  try {
    await consumeRequestBudget(
      "read",
      trustedNetwork(await headers()),
      process.env.BETTER_AUTH_SECRET || "",
    );
  } catch (error) {
    reason = error instanceof RequestLimited ? "limit" : "unavailable";
  }
  // Next redirect throws; keep it outside the catch. The destination is a
  // database-free route handler with a real 429/503 and Retry-After.
  if (reason) redirect(`/request-status?reason=${reason}`);
});
