// Development only: generate SQL against a new empty database; review the result.
import { writeFile } from "node:fs/promises";
import { getMigrations } from "better-auth/db/migration";
import { getAuth } from "./auth";
import { closePool } from "./pool";
try {
  const plan = await getMigrations(getAuth().options);
  const sql = await plan.compileMigrations();
  if (plan.toBeCreated.length < 5)
    throw new Error(
      "Use a fresh empty database to generate the initial auth schema.",
    );
  await writeFile(
    new URL("../migrations/0001_auth.sql", import.meta.url),
    `-- Generated from Better Auth 1.7.11 (MySQL, database rate limits).\n${sql}\n`,
    { flag: "wx" },
  );
  console.log("Generated initial auth migration; review before applying.");
} finally {
  await closePool();
}
