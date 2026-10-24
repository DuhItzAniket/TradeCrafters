import { readFile, stat } from "node:fs/promises";
import { z } from "zod";
import {
  authorizedHistoryPlan,
  HistoryFault,
} from "../../packages/domain/src/provider-history";
import { fetchDailyHistory } from "./history-client";

async function privateJson(path: string) {
  if ((await stat(path)).size > 16_384) throw new HistoryFault("CONFIGURATION");
  return JSON.parse(await readFile(path, "utf8")) as unknown;
}
try {
  const args = process.argv.slice(2);
  if (
    args.length !== 6 ||
    args[0] !== "--plan" ||
    args[2] !== "--access" ||
    args[4] !== "--credentials"
  )
    throw new HistoryFault("CONFIGURATION");
  const plan = await privateJson(args[1]);
  const access = await privateJson(args[3]);
  authorizedHistoryPlan(plan, access, new Date().toISOString());
  const credentials = z
    .object({ apiKey: z.string() })
    .strict()
    .parse(await privateJson(args[5]));
  const result = await fetchDailyHistory(plan, access, credentials);
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
      },
      null,
      2,
    ),
  );
} catch (error) {
  console.error(
    error instanceof HistoryFault
      ? error.message
      : "Market-data research configuration failed. Details hidden.",
  );
  process.exitCode = 1;
}
