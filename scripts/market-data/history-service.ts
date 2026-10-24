import { ResearchStore } from "../../packages/database/src/provider-store";
import { fetchDailyHistory } from "./history-client";

export async function coordinatedDailyHistory(
  store: ResearchStore,
  accountId: string,
  plan: unknown,
  access: unknown,
  options: Parameters<typeof fetchDailyHistory>[2],
) {
  const reservation = await store.reserve(accountId, plan, access);
  if (reservation.kind === "cached") return { ...reservation, cacheHit: true };
  const lease = reservation.lease;
  try {
    const history = await fetchDailyHistory(lease.plan, lease.access, options);
    const saved = await store.complete(lease, history);
    return { ...saved, kind: "fetched" as const, cacheHit: false };
  } catch (error) {
    await store.fail(lease, error);
    throw error;
  }
}
