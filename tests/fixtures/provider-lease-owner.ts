import {
  createResearchPool,
  ResearchStore,
} from "../../packages/database/src/provider-store";
try {
  const url = new URL(process.env.PROVIDER_DATABASE_URL || "");
  if (
    process.env.PROVIDER_FIXTURE !== "true" ||
    url.hostname !== "127.0.0.1" ||
    !/^\/tc_provider_[a-f0-9]{24}$/.test(url.pathname)
  )
    throw Error();
  const input = JSON.parse(process.env.PROVIDER_LEASE_FIXTURE || "");
  const pool = createResearchPool();
  const result = await new ResearchStore(pool).reserve(
    input.accountId,
    input.plan,
    input.access,
  );
  process.send?.(result);
  // Parent kills this actual process after the committed reservation.
  setInterval(() => {}, 1000);
} catch {
  process.exit(1);
}
