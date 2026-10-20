import { randomUUID } from "node:crypto";
import type { RowDataPacket } from "mysql2/promise";
import {
  currencies,
  openingGrant,
  currency,
  type CurrencyCode,
} from "@tradecrafters/domain";
import { directorySource, micDirectory } from "@tradecrafters/market-catalog";
import { scenarios } from "@tradecrafters/market-catalog/scenarios";
import { getPool } from "./pool";
export { getPool, closePool } from "./pool";

export type Wallet = {
  currency: CurrencyCode;
  balanceMinor: string;
  exponent: number;
};
export type SimulationAccount = {
  id: string;
  reportingCurrency: CurrencyCode;
  dataMode: "synthetic";
  grantVersion: string;
  wallets: Wallet[];
};
type AccountRow = RowDataPacket & {
  id: string;
  reporting_currency: CurrencyCode;
  grant_version: string;
};

export async function readAccount(
  userId: string,
): Promise<SimulationAccount | null> {
  const [accounts] = await getPool().execute<AccountRow[]>(
    "SELECT id, reporting_currency, grant_version FROM simulation_accounts WHERE user_id = ?",
    [userId],
  );
  if (!accounts.length) return null;
  const item = accounts[0];
  const [rows] = await getPool().execute<
    (RowDataPacket & { currency: CurrencyCode; balance_minor: string })[]
  >(
    "SELECT currency, balance_minor FROM wallets WHERE account_id = ? ORDER BY currency",
    [item.id],
  );
  return {
    id: item.id,
    reportingCurrency: item.reporting_currency,
    dataMode: "synthetic",
    grantVersion: item.grant_version,
    wallets: rows.map((row) => ({
      currency: row.currency,
      balanceMinor: row.balance_minor,
      exponent: currency(row.currency).exponent,
    })),
  };
}

export async function createAccount(userId: string, code: CurrencyCode) {
  const connection = await getPool().getConnection();
  try {
    await connection.beginTransaction();
    // All account creation for this identity serializes on the existing auth row.
    const [users] = await connection.execute<RowDataPacket[]>(
      "SELECT id FROM user WHERE id = ? FOR UPDATE",
      [userId],
    );
    if (!users.length) throw new Error("USER_NOT_FOUND");
    const [accounts] = await connection.execute<RowDataPacket[]>(
      "SELECT id FROM simulation_accounts WHERE user_id = ?",
      [userId],
    );
    if (!accounts.length) {
      const id = randomUUID();
      const grant = openingGrant(code);
      const journal = randomUUID();
      await connection.execute(
        "INSERT INTO simulation_accounts (id, user_id, reporting_currency, data_mode, grant_version, grant_snapshot) VALUES (?, ?, ?, 'synthetic', ?, ?)",
        [id, userId, code, grant.version, JSON.stringify(grant)],
      );
      await connection.execute(
        "INSERT INTO wallets (account_id, currency, balance_minor) VALUES (?, ?, ?)",
        [id, code, grant.minor],
      );
      await connection.execute(
        "INSERT INTO cash_journals (id, account_id, currency, kind) VALUES (?, ?, ?, 'opening_grant')",
        [journal, id, code],
      );
      await connection.execute(
        "INSERT INTO cash_entries (journal_id, bucket, amount_minor) VALUES (?, 'wallet', ?), (?, 'scenario_funding', ?)",
        [journal, grant.minor, journal, `-${grant.minor}`],
      );
    }
    await connection.commit();
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
  return readAccount(userId);
}

export async function createWallet(userId: string, code: CurrencyCode) {
  const connection = await getPool().getConnection();
  try {
    await connection.beginTransaction();
    const [accounts] = await connection.execute<RowDataPacket[]>(
      "SELECT id FROM simulation_accounts WHERE user_id = ? FOR UPDATE",
      [userId],
    );
    if (!accounts.length) throw new Error("ACCOUNT_NOT_FOUND");
    // An added wallet always starts at zero. Only account creation grants money.
    await connection.execute(
      "INSERT INTO wallets (account_id, currency, balance_minor) VALUES (?, ?, 0) ON DUPLICATE KEY UPDATE currency = VALUES(currency)",
      [accounts[0].id, code],
    );
    await connection.commit();
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
  return readAccount(userId);
}

// Persistent, atomic per-user fixed-window budget for authenticated mutations.
export async function consumeMutationBudget(userId: string, now = Date.now()) {
  const window = Math.floor(now / 60000);
  await getPool().execute(
    "INSERT INTO mutation_budgets (user_id, window_id, hits) VALUES (?, ?, 1) ON DUPLICATE KEY UPDATE hits = IF(window_id = VALUES(window_id), hits + 1, 1), window_id = VALUES(window_id)",
    [userId, window],
  );
  const [rows] = await getPool().execute<RowDataPacket[]>(
    "SELECT hits FROM mutation_budgets WHERE user_id = ?",
    [userId],
  );
  return Number(rows[0].hits) <= 20;
}

export async function directory(query: {
  q: string;
  country?: string;
  kind?: string;
  page: number;
}) {
  const clauses = ["snapshot_id = ?"];
  const params: (string | number)[] = [directorySource.publishedOn];
  if (query.q) {
    // Escape LIKE wildcards; parameterization alone does not escape their meaning.
    const search = `%${query.q.replace(/[!%_]/g, "!$&")}%`;
    clauses.push(
      "(mic LIKE ? ESCAPE '!' OR name LIKE ? ESCAPE '!' OR city LIKE ? ESCAPE '!')",
    );
    params.push(search, search, search);
  }
  if (query.country) {
    clauses.push("country = ?");
    params.push(query.country);
  }
  if (query.kind) {
    clauses.push("kind = ?");
    params.push(query.kind);
  }
  const where = clauses.join(" AND ");
  const [counts] = await getPool().execute<RowDataPacket[]>(
    `SELECT COUNT(*) AS total FROM mic_records WHERE ${where}`,
    params,
  );
  const [rows] = await getPool().query<RowDataPacket[]>(
    `SELECT mic, operating_mic AS operatingMic, kind, name, country, city, category, source_status AS sourceStatus FROM mic_records WHERE ${where} ORDER BY mic LIMIT 30 OFFSET ?`,
    [...params, (query.page - 1) * 30],
  );
  return {
    source: directorySource,
    records: rows,
    total: Number(counts[0].total),
    page: query.page,
    pageSize: 30,
  };
}

export async function seedCatalog() {
  const connection = await getPool().getConnection();
  try {
    await connection.beginTransaction();
    for (const item of currencies)
      await connection.execute(
        "INSERT INTO currencies (code, exponent, name) VALUES (?, ?, ?) ON DUPLICATE KEY UPDATE name = VALUES(name)",
        [item.code, item.exponent, item.name],
      );
    for (let offset = 0; offset < micDirectory.length; offset += 100) {
      const batch = micDirectory.slice(offset, offset + 100);
      const values = batch.map((row) => [
        directorySource.publishedOn,
        row.mic,
        row.operatingMic,
        row.kind,
        row.name,
        row.country,
        row.city,
        row.category,
        row.status,
      ]);
      await connection.query(
        "INSERT INTO mic_records (snapshot_id, mic, operating_mic, kind, name, country, city, category, source_status) VALUES ? ON DUPLICATE KEY UPDATE name = VALUES(name)",
        [values],
      );
    }
    for (const row of scenarios) {
      await connection.execute(
        "INSERT INTO securities (id, name, fictional) VALUES (?, ?, true) ON DUPLICATE KEY UPDATE name = VALUES(name)",
        [row.securityId, row.name],
      );
      await connection.execute(
        "INSERT INTO listings (id, security_id, mic, symbol, settlement_currency, quote_unit, unit_numerator, unit_denominator, timezone, fixture_policy) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?) ON DUPLICATE KEY UPDATE symbol = VALUES(symbol)",
        [
          row.id,
          row.securityId,
          row.mic,
          row.symbol,
          row.currency,
          row.quoteUnit,
          row.unitNumerator,
          row.unitDenominator,
          row.timezone,
          JSON.stringify({
            version: "fictional-v1",
            boardLot: row.lot,
            calendarVerified: false,
            tickRulesVerified: false,
            tradingEnabled: false,
          }),
        ],
      );
      await connection.execute(
        "INSERT INTO venue_capabilities (mic, capability, status, reason, evidence_ref) VALUES (?, 'real_simulation', 'unknown', 'Provider rights, listings and market rules not verified', 'docs/architecture/global-markets.md') ON DUPLICATE KEY UPDATE mic = VALUES(mic)",
        [row.mic],
      );
    }
    await connection.commit();
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
  return { micRecords: micDirectory.length, scenarios: scenarios.length };
}
