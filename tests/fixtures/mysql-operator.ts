import { execFileSync } from "node:child_process";
// Isolated test DDL/inspection only. Runtime privileges and MySQL global safety settings stay unchanged.
export function fixtureSql(sql: string) {
  const databaseUrl = new URL(process.env.DATABASE_URL!);
  const database = decodeURIComponent(databaseUrl.pathname.slice(1));
  if (
    !["127.0.0.1", "localhost"].includes(databaseUrl.hostname) ||
    !/^[a-zA-Z0-9_]{1,64}$/.test(database) ||
    process.env.AUTH_DEV_CREDENTIALS !== "true"
  )
    throw Error("LOCAL_TEST_ONLY");
  const container = execFileSync(
    "docker",
    ["compose", "--env-file", ".env.local", "ps", "-q", "mysql"],
    { encoding: "utf8", windowsHide: true, stdio: ["ignore", "pipe", "pipe"] },
  ).trim();
  if (!/^[a-f0-9]{12,64}$/.test(container))
    throw Error("LOCAL_DATABASE_REQUIRED");
  try {
    return execFileSync(
      "docker",
      [
        "exec",
        "-i",
        container,
        "sh",
        "-c",
        `MYSQL_PWD="$MYSQL_ROOT_PASSWORD" exec mysql --user=root --database=${database} --batch --skip-column-names`,
      ],
      {
        input: `DELIMITER $$\n${sql}$$\n`,
        encoding: "utf8",
        windowsHide: true,
        stdio: ["pipe", "pipe", "pipe"],
      },
    ).trim();
  } catch {
    throw Error(
      "Local fixture SQL failed; credentials and statement values hidden.",
    );
  }
}
