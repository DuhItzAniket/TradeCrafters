import { parseArgs } from "node:util";
import { closePool } from "@tradecrafters/database";
import { inspectRuntime, PreflightFailure } from "./operations/preflight";
try {
  const { values } = parseArgs({
    options: { "local-fixture": { type: "boolean", default: false } },
  });
  console.log(JSON.stringify(await inspectRuntime(values["local-fixture"])));
} catch (error) {
  console.error(
    error instanceof PreflightFailure
      ? error.message
      : "Release preflight could not complete. Check configuration/connectivity with an operator; credentials and driver details hidden.",
  );
  process.exitCode = 1;
} finally {
  await closePool();
}
