import { parseArgs } from "node:util";
import { closePool } from "@tradecrafters/database";
import { manageAdmin } from "@tradecrafters/database/security";
const { values, positionals } = parseArgs({
  args: process.argv.slice(2),
  allowPositionals: true,
  options: { "user-id": { type: "string" }, reason: { type: "string" } },
});
const action = positionals[0];
if (
  (action !== "grant" && action !== "revoke") ||
  !values["user-id"] ||
  !values.reason
)
  throw new Error(
    "Usage: npm run admin -- grant|revoke --user-id ID --reason 'Reason of at least 10 characters'",
  );
if (process.env.OPERATOR_DATABASE_URL)
  process.env.DATABASE_URL = process.env.OPERATOR_DATABASE_URL;
try {
  await manageAdmin(values["user-id"], action, values.reason);
  console.log(
    `Admin ${action} recorded. No session or authenticator secrets printed.`,
  );
} finally {
  await closePool();
}
