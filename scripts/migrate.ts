import { migrate } from "@tradecrafters/database/migrate";
import { closePool } from "@tradecrafters/database";
import { applyLocalCompoundMigration } from "./operations/local-migration";
try {
  const localDocker =
    process.env.AUTH_DEV_CREDENTIALS === "true" &&
    Boolean(process.env.LOCAL_DB_ROOT_PASSWORD) &&
    ["localhost", "127.0.0.1"].includes(
      new URL(process.env.DATABASE_URL!).hostname,
    );
  await migrate(
    localDocker
      ? { applyCompoundStatement: applyLocalCompoundMigration }
      : undefined,
  );
} catch (error) {
  // MySQL errors can contain SQL or configuration. Keep migration failures
  // actionable without exporting driver messages or credentials.
  console.error(
    "Migration failed; inspect schema_migrations for an incomplete marker.",
    {
      code:
        error && typeof error === "object" && "code" in error
          ? String(error.code)
          : "MIGRATION_GUARD",
    },
  );
  process.exitCode = 1;
} finally {
  await closePool();
}
