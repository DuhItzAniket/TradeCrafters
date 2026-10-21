import { execFileSync } from "node:child_process";

// Docker's default binary-log configuration reserves trigger installation for
// root. Use its local socket, never broaden the app user or server settings.
export async function applyLocalCompoundMigration(sql: string) {
  const url = new URL(process.env.DATABASE_URL!);
  const database = decodeURIComponent(url.pathname.slice(1));
  if (
    !["localhost", "127.0.0.1"].includes(url.hostname) ||
    !/^[a-zA-Z0-9_]{1,64}$/.test(database) ||
    process.env.AUTH_DEV_CREDENTIALS !== "true" ||
    !process.env.LOCAL_DB_ROOT_PASSWORD ||
    !sql.startsWith("-- @single-statement\nCREATE TRIGGER ")
  )
    throw Error(
      "Local compound migrations require the retained Docker fixture.",
    );
  const container = execFileSync(
    "docker",
    ["compose", "--env-file", ".env.local", "ps", "-q", "mysql"],
    { encoding: "utf8", windowsHide: true, stdio: ["ignore", "pipe", "pipe"] },
  ).trim();
  if (!/^[a-f0-9]{12,64}$/.test(container))
    throw Error("Local database unavailable.");
  try {
    execFileSync(
      "docker",
      [
        "exec",
        "-i",
        container,
        "sh",
        "-c",
        `MYSQL_PWD="$MYSQL_ROOT_PASSWORD" exec mysql --user=root --database=${database}`,
      ],
      {
        input: `DELIMITER $$\n${sql}\n$$\n`,
        encoding: "utf8",
        windowsHide: true,
        stdio: ["pipe", "pipe", "pipe"],
      },
    );
  } catch {
    throw Error(
      "Local trigger migration failed; driver details hidden. Inspect the incomplete migration before retrying.",
    );
  }
}
