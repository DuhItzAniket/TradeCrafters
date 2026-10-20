import { closePool } from "@tradecrafters/database";
import { submitOrder, type Actor } from "@tradecrafters/database/trading";
import type { OrderIntent } from "@tradecrafters/domain/trading";
if (
  process.env.AUTH_DEV_CREDENTIALS !== "true" ||
  !["127.0.0.1", "localhost"].includes(
    new URL(process.env.DATABASE_URL!).hostname,
  )
)
  throw Error("LOCAL_TEST_ONLY");
let input = "";
for await (const chunk of process.stdin) input += chunk;
const value = JSON.parse(input) as {
  actor: Actor;
  key: string;
  intent: OrderIntent;
};
try {
  await submitOrder(value.actor, value.key, value.intent);
} catch {
  process.exitCode = 1;
} finally {
  await closePool();
}
