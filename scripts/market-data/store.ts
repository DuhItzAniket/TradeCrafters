import { readFile, stat } from "node:fs/promises";
import {
  createResearchPool,
  initializeResearchStore,
  ResearchStore,
} from "../../packages/database/src/provider-store";
import { CoordinationFault } from "../../packages/domain/src/provider-coordination";

let pool: ReturnType<typeof createResearchPool> | undefined;
try {
  const [command, accountId, path, ...extra] = process.argv.slice(2);
  if (
    extra.length ||
    !["init", "account", "feed", "sweep"].includes(command) ||
    (command === "init" && (accountId || path)) ||
    (command === "sweep" && (!accountId || path)) ||
    (["account", "feed"].includes(command) && (!accountId || !path))
  )
    throw new CoordinationFault("CONFIGURATION");
  pool = createResearchPool();
  if (command === "init") await initializeResearchStore(pool);
  else {
    const store = new ResearchStore(pool);
    if (command === "sweep") await store.sweep(accountId);
    else {
      if ((await stat(path)).size > 16_384)
        throw new CoordinationFault("CONFIGURATION");
      const input = JSON.parse(await readFile(path, "utf8"));
      if (command === "account") await store.configureAccount(accountId, input);
      else await store.configureFeed(accountId, input);
    }
  }
  console.log(
    "Research-store operation completed. No credentials or market prices printed.",
  );
} catch (error) {
  console.error(
    error instanceof CoordinationFault
      ? error.message
      : "Research-store operation failed. Details hidden.",
  );
  process.exitCode = 1;
} finally {
  await pool?.end();
}
