import { readFile, stat } from "node:fs/promises";
import { z } from "zod";
import {
  authorizedHistoryPlan,
  HistoryFault,
} from "../../packages/domain/src/provider-history";
import { coordinatedDailyHistory } from "./history-service";
import {
  createResearchPool,
  ResearchStore,
} from "../../packages/database/src/provider-store";
import { CoordinationFault } from "../../packages/domain/src/provider-coordination";

async function privateJson(path: string) {
  if ((await stat(path)).size > 16_384) throw new HistoryFault("CONFIGURATION");
  return JSON.parse(await readFile(path, "utf8")) as unknown;
}
let pool: ReturnType<typeof createResearchPool> | undefined;
try {
  const args = process.argv.slice(2);
  if (
    args.length !== 8 ||
    args[0] !== "--plan" ||
    args[2] !== "--access" ||
    args[4] !== "--credentials" ||
    args[6] !== "--account"
  )
    throw new HistoryFault("CONFIGURATION");
  const plan = await privateJson(args[1]);
  const access = await privateJson(args[3]);
  authorizedHistoryPlan(plan, access, new Date().toISOString());
  const credentials = z
    .object({ apiKey: z.string() })
    .strict()
    .parse(await privateJson(args[5]));
  pool = createResearchPool();
  const coordinated = await coordinatedDailyHistory(
    new ResearchStore(pool),
    args[7],
    plan,
    access,
    credentials,
  );
  const result = coordinated.history;
  // Do not persist or print prices until provider retention rights are reviewed.
  console.log(
    JSON.stringify(
      {
        provider: result.provider,
        listingId: result.listingId,
        bars: result.bars.length,
        firstDate: result.bars[0].tradingDate,
        lastDate: result.bars.at(-1)!.tradingDate,
        observedAt: result.observedAt,
        sourceIdentity: result.sourceIdentity,
        sourceScope: result.sourceScope,
        executionEligible: result.executionEligible,
        publicDisplayAuthorized: result.publicDisplayAuthorized,
        cacheHit: coordinated.cacheHit,
      },
      null,
      2,
    ),
  );
} catch (error) {
  console.error(
    error instanceof HistoryFault || error instanceof CoordinationFault
      ? error.message
      : "Market-data research configuration failed. Details hidden.",
  );
  process.exitCode = 1;
} finally {
  await pool?.end();
}
