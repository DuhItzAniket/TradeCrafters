import { spawn, execFileSync } from "node:child_process";
import { createServer } from "node:net";
import { mkdir, writeFile } from "node:fs/promises";

// npm supplies its CLI path on both Windows and Linux. Keep CLI installation
// separate from app dependencies; the exact Postman version is reproducible.
if (!process.env.npm_execpath) throw Error("Run npm run test:providers.");
const reservation = createServer();
await new Promise((resolve, reject) => {
  reservation.once("error", reject);
  reservation.listen(0, "127.0.0.1", resolve);
});
const port = reservation.address().port;
await new Promise((resolve) => reservation.close(resolve));
await mkdir(".local/provider-simulation", { recursive: true });
const simulation = spawn(
  process.execPath,
  [
    process.env.npm_execpath,
    "exec",
    "--yes",
    "--package=postman-cli@1.76.0",
    "--",
    "postman",
    "simulation",
    "run",
    "postman/simulations/history-research.sim.yaml",
    "--port",
    String(port),
    "--output",
    "ndjson",
    "--no-history",
  ],
  {
    windowsHide: true,
    detached: process.platform !== "win32",
    stdio: ["ignore", "pipe", "pipe"],
  },
);
let log = "",
  stderr = "",
  tests;
simulation.stdout.on("data", (chunk) => {
  log += chunk.toString();
});
simulation.stderr.on("data", (chunk) => {
  stderr += chunk.toString();
});
let startupError;
simulation.on("error", (error) => {
  startupError = error;
});
const stop = () => {
  if (!simulation.pid) return;
  try {
    if (process.platform === "win32")
      execFileSync("taskkill", ["/PID", String(simulation.pid), "/T", "/F"], {
        windowsHide: true,
        stdio: "ignore",
      });
    else process.kill(-simulation.pid, "SIGINT");
  } catch {
    /* The recorded child may already have exited. */
  }
};
try {
  const deadline = Date.now() + 90_000;
  while (
    !log.split("\n").some((line) => {
      try {
        return JSON.parse(line).event === "listening";
      } catch {
        return false;
      }
    })
  ) {
    if (startupError || simulation.exitCode !== null || Date.now() > deadline)
      throw Error(
        "Postman simulation did not start; inspect the private simulation log.",
      );
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  console.log(
    "Local historical-data simulation listening; running real HTTP clients.",
  );
  tests = spawn(
    process.execPath,
    ["--import", "tsx", "--test", "tests/provider-http.test.ts"],
    {
      windowsHide: true,
      stdio: "inherit",
      env: {
        ...process.env,
        HISTORY_SIMULATION_URL: `http://127.0.0.1:${port}`,
      },
    },
  );
  const code = await new Promise((resolve, reject) => {
    tests.once("error", reject);
    tests.once("exit", resolve);
  });
  if (code !== 0) throw Error("Provider HTTP checks failed.");
  // The proxy may finish logging its deliberately slow response after abort.
  await new Promise((resolve) => setTimeout(resolve, 1300));
  const events = log.split("\n").flatMap((line) => {
    try {
      return [JSON.parse(line)];
    } catch {
      return [];
    }
  });
  const requests = events.filter((event) => event.event === "request");
  const counts = Object.fromEntries(
    ["twelve", "eodhd"].map((member) => [
      member,
      requests.filter((event) => event.routeKey === member).length,
    ]),
  );
  if (counts.twelve !== 25 || counts.eodhd !== 3)
    throw Error(
      "Unexpected simulation request count; check for missing calls or automatic retries.",
    );
  await writeFile(
    ".local/provider-simulation/report.json",
    JSON.stringify(
      {
        postmanVersion: "1.76.0",
        scope: "synthetic HTTP contract checks, not live provider acceptance",
        requests: counts,
        passed: true,
      },
      null,
      2,
    ) + "\n",
  );
  console.log(
    `Verified dependency traffic: Twelve Data ${counts.twelve}, EODHD ${counts.eodhd}; no automatic retries.`,
  );
} catch (error) {
  console.error(
    error instanceof Error ? error.message : "Provider simulation failed.",
  );
  process.exitCode = 1;
} finally {
  if (tests && tests.exitCode === null) tests.kill();
  stop();
  // Only the fixture key is permitted by this simulation. Logs still stay
  // ignored because arbitrary provider logs are unsafe publication artifacts.
  await writeFile(".local/provider-simulation/simulation.ndjson", log);
  await writeFile(".local/provider-simulation/simulation.err", stderr);
}
