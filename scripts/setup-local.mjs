import { randomBytes } from "node:crypto";
import { existsSync, readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { appEnvironment } from "./local-env.mjs";
import { resolve } from "node:path";

const root = resolve(import.meta.dirname, "..");
const local = resolve(root, ".env.local");
if (existsSync(local)) {
  console.log(".env.local exists; preserved.");
} else {
  const password = randomBytes(24).toString("hex");
  writeFileSync(
    local,
    `DATABASE_URL=mysql://tradecrafters:${password}@127.0.0.1:3307/tradecrafters_v2\nLOCAL_DB_PASSWORD=${password}\nLOCAL_DB_ROOT_PASSWORD=${randomBytes(24).toString("hex")}\nBETTER_AUTH_SECRET=${randomBytes(48).toString("base64url")}\nBETTER_AUTH_URL=http://127.0.0.1:3000\nAUTH_DEV_CREDENTIALS=true\nMYSQL_SSL=false\nMYSQL_POOL_SIZE=5\n`,
    { mode: 0o600, flag: "wx" },
  );
  console.log(
    "Generated fresh local-only MySQL and auth credentials (values hidden).",
  );
}
mkdirSync(resolve(root, "apps/web"), { recursive: true });
const appEnv = resolve(root, "apps/web/.env.local");
if (existsSync(appEnv))
  console.log(
    "apps/web/.env.local exists; preserved. Update shared auth settings individually; setup:db-identities manages the web DB URL.",
  );
else {
  const source = readFileSync(local, "utf8");
  const runtime = source.match(/^LOCAL_RUNTIME_DATABASE_URL=(.+)$/m)?.[1];
  writeFileSync(appEnv, appEnvironment(source, runtime?.trim()), {
    mode: 0o600,
  });
}
console.log(
  "Next: docker compose --env-file .env.local up -d --wait; npm run db:migrate; npm run db:seed; npm run setup:db-identities; npm run dev",
);
