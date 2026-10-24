import { execFileSync, spawn } from "node:child_process";
import { randomBytes } from "node:crypto";

const nonce = randomBytes(12).toString("hex"),
  schema = `tc_provider_${nonce}`,
  user = `tcprov_${nonce}`,
  password = randomBytes(32).toString("hex");
let container,
  created = false,
  userCreated = false;
function sql(statement) {
  execFileSync(
    "docker",
    [
      "exec",
      "-i",
      container,
      "sh",
      "-c",
      'MYSQL_PWD="$MYSQL_ROOT_PASSWORD" exec mysql --user=root',
    ],
    {
      input: statement,
      encoding: "utf8",
      windowsHide: true,
      stdio: ["pipe", "pipe", "pipe"],
    },
  );
}
try {
  const info = JSON.parse(
    execFileSync(
      "docker",
      [
        "compose",
        "--env-file",
        ".env.local",
        "ps",
        "--format",
        "json",
        "mysql",
      ],
      {
        encoding: "utf8",
        windowsHide: true,
        stdio: ["ignore", "pipe", "pipe"],
      },
    ).trim(),
  );
  container = info.ID;
  if (
    !/^[a-f0-9]{12,64}$/.test(container) ||
    info.Health !== "healthy" ||
    !info.Publishers.some(
      (p) =>
        p.URL === "127.0.0.1" &&
        p.PublishedPort === 3307 &&
        p.TargetPort === 3306,
    )
  )
    throw Error();
  // A unique run-owned schema/user is the only target. No root secret leaves Docker.
  sql(`CREATE DATABASE \`${schema}\` CHARACTER SET utf8mb4;`);
  created = true;
  sql(
    `CREATE USER '${user}'@'%' IDENTIFIED BY '${password}' WITH MAX_USER_CONNECTIONS 12;`,
  );
  userCreated = true;
  sql(`GRANT ALL PRIVILEGES ON \`${schema}\`.* TO '${user}'@'%';`);
  const url = `mysql://${user}:${password}@127.0.0.1:3307/${schema}`;
  const child = spawn(
    process.execPath,
    ["scripts/check-provider-simulation.mjs", "--with-store"],
    {
      windowsHide: true,
      stdio: "inherit",
      env: {
        ...process.env,
        PROVIDER_DATABASE_URL: url,
        PROVIDER_FIXTURE: "true",
      },
    },
  );
  const code = await new Promise((resolve, reject) => {
    child.once("error", reject);
    child.once("exit", resolve);
  });
  if (code !== 0) throw Error();
  console.log(
    "Dedicated provider-store MySQL/HTTP checks passed; application schema and web grants were not modified.",
  );
} catch {
  console.error(
    "Provider-store verification failed. Check local Docker/MySQL and the test results; credentials hidden.",
  );
  process.exitCode = 1;
} finally {
  if (created) {
    try {
      sql(
        `DROP DATABASE \`${schema}\`;${userCreated ? ` DROP USER '${user}'@'%';` : ""}`,
      );
      console.log("Removed this run's isolated provider schema and identity.");
    } catch {
      console.error(
        `Cleanup needs attention for isolated schema ${schema} and identity ${user}; credentials hidden.`,
      );
      process.exitCode = 1;
    }
  }
}
