// Keep CLI/bootstrap credentials out of the environment loaded by the web process.
const privileged = new Set([
  "OPERATOR_DATABASE_URL",
  "MIGRATION_DATABASE_URL",
  "LOCAL_RUNTIME_DATABASE_URL",
  "LOCAL_DB_PASSWORD",
  "LOCAL_DB_ROOT_PASSWORD",
]);
export function appEnvironment(source, runtimeUrl) {
  const lines = [];
  let droppingQuote;
  const closes = (value, quote) => {
    for (let i = 0; i < value.length; i++) {
      if (value[i] === "\\") {
        i++;
        continue;
      }
      if (value[i] === quote) return true;
    }
    return false;
  };
  for (const line of source.split(/\r?\n/)) {
    if (droppingQuote) {
      if (closes(line, droppingQuote)) droppingQuote = undefined;
      continue;
    }
    const match = line.match(
      /^\s*(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/,
    );
    if (
      match &&
      (privileged.has(match[1]) || match[1].startsWith("PROVIDER_"))
    ) {
      const value = match[2];
      if (
        (value[0] === '"' || value[0] === "'") &&
        !closes(value.slice(1), value[0])
      )
        droppingQuote = value[0];
      continue;
    }
    lines.push(line);
  }
  const filtered = lines.join("\n");
  if (!runtimeUrl) return filtered;
  const database = /^\s*(?:export\s+)?DATABASE_URL\s*=.*$/gm;
  return database.test(filtered)
    ? filtered.replace(database, `DATABASE_URL=${runtimeUrl}`)
    : `${filtered.trimEnd()}\nDATABASE_URL=${runtimeUrl}\n`;
}
