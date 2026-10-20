// Keep CLI/bootstrap credentials out of the environment loaded by the web process.
const privileged = new Set([
  "OPERATOR_DATABASE_URL",
  "MIGRATION_DATABASE_URL",
  "LOCAL_RUNTIME_DATABASE_URL",
  "LOCAL_DB_PASSWORD",
  "LOCAL_DB_ROOT_PASSWORD",
]);
export function appEnvironment(source, runtimeUrl) {
  const lines = source.split(/\r?\n/).filter((line) => {
    const name = line.match(
      /^\s*(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=/,
    )?.[1];
    return !name || !privileged.has(name);
  });
  const filtered = lines.join("\n");
  if (!runtimeUrl) return filtered;
  const database = /^\s*(?:export\s+)?DATABASE_URL\s*=.*$/gm;
  return database.test(filtered)
    ? filtered.replace(database, `DATABASE_URL=${runtimeUrl}`)
    : `${filtered.trimEnd()}\nDATABASE_URL=${runtimeUrl}\n`;
}
