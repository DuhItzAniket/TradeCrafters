import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
const files = execFileSync(
  "git",
  [
    "ls-files",
    "-z",
    "--",
    "apps/web",
    "packages",
    "scripts",
    "tests",
    ".github",
    ".env.example",
    ".nvmrc",
    "package.json",
    "package-lock.json",
    "tsconfig.json",
  ],
  { encoding: "utf8", windowsHide: true },
)
  .split("\0")
  .filter(Boolean);
const required = [
  "apps/web/src/app/layout.tsx",
  "packages/database/src/auth.ts",
  "packages/database/src/aliases.ts",
  "packages/database/src/catalog.ts",
  "packages/domain/src/fx.ts",
  "packages/database/migrations/0001_auth.sql",
  "packages/database/migrations/0007_catalog_versions.sql",
  "packages/database/migrations/0008_trading_accounting.sql",
  "packages/database/src/trading.ts",
  "packages/domain/src/trading.ts",
  "packages/domain/src/workbench.ts",
  "packages/database/src/workbench.ts",
  "apps/web/src/components/market-workspace.tsx",
  "apps/web/src/app/api/listings/[listingId]/chart/route.ts",
];
const missing = required.filter((file) => !files.includes(file));
const patterns = [
  /-----BEGIN (?:[A-Z]+ )?PRIVATE KEY-----/,
  /\bgh[pousr]_[A-Za-z0-9]{30,}\b/,
  /\bgithub_pat_[A-Za-z0-9_]{50,}\b/,
  /\bAKIA[0-9A-Z]{16}\b/,
  /(?:GITHUB_CLIENT_SECRET|BETTER_AUTH_SECRET)\s*[:=]\s*["'](?!fixture[-_]|test[-_]|generate-|replace-)([A-Za-z0-9_+/=-]{32,})["']/,
];
const flagged = [];
for (const file of files) {
  if (
    !/\.(?:[cm]?[jt]sx?|json|ya?ml|sql|md|css)$/.test(file) &&
    file !== ".env.example"
  )
    continue;
  const text = readFileSync(file, "utf8");
  if (patterns.some((pattern) => pattern.test(text))) flagged.push(file);
}
if (missing.length || flagged.length) {
  for (const file of missing)
    console.error(`Required v2 source is not tracked: ${file}`);
  for (const file of flagged)
    console.error(
      `Potential credential literal in tracked v2 source: ${file} (value hidden)`,
    );
  process.exitCode = 1;
} else
  console.log(
    `Verified tracked v2 source and credential-pattern checks (${files.length} files). Legacy history remains a separate audit scope.`,
  );
