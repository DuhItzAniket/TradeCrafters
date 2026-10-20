import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { randomBytes } from "node:crypto";
import { setTimeout as delay } from "node:timers/promises";
const image = process.argv[2];
assert.ok(
  image && /^[a-zA-Z0-9][a-zA-Z0-9/_.:@-]{0,240}$/.test(image),
  "Supply the local image tag to inspect.",
);
const container = `tc-runtime-${randomBytes(8).toString("hex")}`;
let created = false;
const docker = (args) =>
  execFileSync("docker", args, {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
    windowsHide: true,
  });
try {
  const check = `const fs=require('node:fs'); if(process.getuid()===0)process.exit(1); for(const path of ['/app/.git','/app/server','/app/client','/app/sql'])if(fs.existsSync(path))process.exit(2); function scan(path){for(const item of fs.readdirSync(path,{withFileTypes:true})){if(item.name==='.env'||item.name.startsWith('.env.'))process.exit(3);if(item.isDirectory())scan(path+'/'+item.name)}}scan('/app')`;
  docker(["run", "--rm", "--entrypoint", "node", image, "--eval", check]);
  docker([
    "run",
    "--detach",
    "--name",
    container,
    "--publish",
    "127.0.0.1::3000",
    image,
  ]);
  created = true;
  const binding = docker(["port", container, "3000/tcp"]).trim();
  assert.match(binding, /^127\.0\.0\.1:\d+$/);
  let ready = false;
  for (let i = 0; i < 40; i++) {
    try {
      const response = await fetch(`http://${binding}/api/health`, {
        signal: AbortSignal.timeout(2000),
      });
      if (response.ok) {
        assert.deepEqual(await response.json(), { status: "ok" });
        assert.equal(response.headers.get("Cache-Control"), "no-store");
        ready = true;
        break;
      }
    } catch {
      /* startup may not be listening yet */
    }
    await delay(500);
  }
  assert.ok(ready, "standalone liveness failed");
  console.log(
    "Container verified: non-root, no env files or legacy app, standalone database-free liveness. Hosted auth/trading still require release verification.",
  );
} catch {
  console.error(
    "Container check failed. Runtime output and configuration hidden.",
  );
  process.exitCode = 1;
} finally {
  if (created) {
    try {
      docker(["rm", "--force", container]);
    } catch {
      console.error(`Remove disposable container ${container} manually.`);
      process.exitCode = 1;
    }
  }
}
