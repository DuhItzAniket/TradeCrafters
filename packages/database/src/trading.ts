import { randomUUID } from "node:crypto";
import { Temporal } from "@js-temporal/polyfill";
import type { PoolConnection, RowDataPacket } from "mysql2/promise";
import {
  currency,
  openingGrant,
  parseMinor,
  type CurrencyCode,
} from "@tradecrafters/domain";
import {
  calculateFxConversion,
  fxQuoteSchema,
  type FxQuote,
} from "@tradecrafters/domain/fx";
import {
  trainingScenario,
  trainingModel,
  trainingFxVersion,
  trainingRate,
  quoteSchema,
  fillCalculation,
  assertQuoteFresh,
  saleBasis,
  convertMark,
  roundHalfEven,
  TradingFault,
  type TrainingQuote,
  type OrderIntent,
  type FilledOrder,
  type FxResult,
  type OperationReceipt,
  type OperationPayload,
  type OperationResult,
} from "@tradecrafters/domain/trading";
import { scenarios } from "@tradecrafters/market-catalog/scenarios";
import { getPool } from "./pool";
import { listingPolicy, policyHash } from "./policies";
export type Actor = { userId: string; sessionId: string };
type AccountRow = RowDataPacket & {
  id: string;
  user_id: string;
  state: "active" | "archived";
  reporting_currency: CurrencyCode;
  scenario_id: string;
  model_version: string;
  version: string;
  grant_snapshot: { minor: string };
};

export function trainingMarketAt(timezone: string) {
  return Temporal.PlainDateTime.from("2026-10-20T10:15:00")
    .toZonedDateTime(timezone, { disambiguation: "reject" })
    .toInstant()
    .toString({ smallestUnit: "millisecond" });
}
async function owned(
  userId: string,
  accountId: string,
  connection?: PoolConnection,
  lock = false,
) {
  const [rows] = await (connection ?? getPool()).execute<AccountRow[]>(
    "SELECT * FROM simulation_accounts WHERE id=? AND user_id=?" +
      (lock ? " FOR UPDATE" : ""),
    [accountId, userId],
  );
  if (!rows.length)
    throw new TradingFault("NOT_FOUND", "The account was not found.", 404);
  return rows[0];
}
function active(account: AccountRow) {
  if (account.state !== "active")
    throw new TradingFault(
      "ACCOUNT_ARCHIVED",
      "This practice account is archived. Reload the active account.",
      409,
    );
  if (
    account.scenario_id !== trainingScenario ||
    account.model_version !== trainingModel
  )
    throw new TradingFault(
      "SCENARIO_MISMATCH",
      "This account's scenario or model is unsupported.",
      409,
    );
}
async function market(
  listingId: string,
  now: Date,
  connection?: PoolConnection,
) {
  const source = scenarios.find((row) => row.id === listingId);
  if (!source)
    throw new TradingFault(
      "LISTING_UNSUPPORTED",
      "Only the listed fictional training instruments can be traded.",
      422,
    );
  const [rows] = await (connection ?? getPool()).execute<RowDataPacket[]>(
    "SELECT l.*,s.fictional FROM listings l JOIN securities s ON s.id=l.security_id WHERE l.id=?" +
      (connection ? " FOR SHARE" : ""),
    [listingId],
  );
  const row = rows[0];
  if (
    !row ||
    Number(row.fictional) !== 1 ||
    row.mic !== source.mic ||
    row.settlement_currency !== source.currency ||
    row.quote_unit !== source.quoteUnit ||
    row.unit_numerator !== source.unitNumerator ||
    row.unit_denominator !== source.unitDenominator ||
    row.timezone !== source.timezone ||
    row.security_id !== source.securityId
  )
    throw new TradingFault(
      "LISTING_MISMATCH",
      "The training listing metadata does not match its source.",
      503,
    );
  const marketAt = trainingMarketAt(source.timezone);
  const policy = await listingPolicy(
    listingId,
    new Date(marketAt),
    "synthetic",
    connection,
    now,
  );
  if (!policy?.sessionEligible || !policy.policy)
    throw new TradingFault(
      policy?.code ?? "POLICY_MISSING",
      policy?.message ?? "Training policy is unavailable.",
      503,
    );
  return { source, policy: policy.policy, marketAt };
}
export async function issueTrainingQuote(
  userId: string,
  accountId: string,
  listingId: string,
) {
  const account = await owned(userId, accountId);
  active(account);
  const now = new Date(),
    data = await market(listingId, now);
  const quote: TrainingQuote = {
    id: randomUUID(),
    accountId,
    listingId,
    mic: data.source.mic,
    dataMode: "synthetic",
    scenario: trainingScenario,
    provider: "project-synthetic-v1",
    model: trainingModel,
    reference: data.source.price,
    currency: data.source.currency,
    quoteUnit: data.source.quoteUnit,
    unitNumerator: data.source.unitNumerator,
    unitDenominator: data.source.unitDenominator,
    policyId: data.policy.id,
    marketAt: data.marketAt,
    observedAt: now.toISOString(),
    expiresAt: new Date(now.getTime() + 30000).toISOString(),
  };
  quoteSchema.parse(quote);
  await getPool().execute(
    "INSERT INTO market_snapshots (id,account_id,listing_id,definition,content_hash,observed_at,expires_at) VALUES (?,?,?,?,?,?,?)",
    [
      quote.id,
      accountId,
      listingId,
      JSON.stringify(quote),
      policyHash(quote),
      now,
      new Date(quote.expiresAt),
    ],
  );
  return {
    quote,
    rules: data.policy.rules,
    buy: fillCalculation(quote, data.policy.rules, {
      accountId,
      listingId,
      quoteId: quote.id,
      side: "BUY",
      orderType: "MARKET",
      quantity: data.source.lot,
    }),
    sell: fillCalculation(quote, data.policy.rules, {
      accountId,
      listingId,
      quoteId: quote.id,
      side: "SELL",
      orderType: "MARKET",
      quantity: data.source.lot,
    }),
  };
}
export async function issueFxQuote(
  userId: string,
  accountId: string,
  from: CurrencyCode,
  to: CurrencyCode,
) {
  active(await owned(userId, accountId));
  const now = new Date(),
    rate = trainingRate(from, to);
  const quote = fxQuoteSchema.parse({
    id: randomUUID(),
    accountId,
    dataMode: "synthetic",
    fromCurrency: from,
    toCurrency: to,
    rateNumerator: rate.numerator,
    rateDenominator: rate.denominator,
    provider: trainingFxVersion,
    evidenceRef: "docs/implementation/trading-accounting.md#synthetic-fx",
    observedAt: now.toISOString(),
    effectiveFrom: now.toISOString(),
    expiresAt: new Date(now.getTime() + 60000).toISOString(),
    rounding: "floor",
  });
  await getPool().execute(
    "INSERT INTO fx_quotes (id,account_id,definition,content_hash,observed_at,expires_at) VALUES (?,?,?,?,?,?)",
    [
      quote.id,
      accountId,
      JSON.stringify(quote),
      policyHash(quote),
      now,
      new Date(quote.expiresAt),
    ],
  );
  return quote;
}
async function storedQuote<T extends TrainingQuote | FxQuote>(
  table: "market_snapshots" | "fx_quotes",
  id: string,
  accountId: string,
  parse: (input: unknown) => T,
  connection?: PoolConnection,
) {
  const [rows] = await (connection ?? getPool()).execute<RowDataPacket[]>(
    `SELECT * FROM ${table} WHERE id=? AND account_id=?`,
    [id, accountId],
  );
  if (!rows.length)
    throw new TradingFault(
      "QUOTE_REQUIRED",
      "Get a new account-bound training quote.",
      422,
    );
  try {
    const row = rows[0],
      value = parse(row.definition);
    if (
      value.id !== id ||
      value.accountId !== accountId ||
      ("listingId" in value && row.listing_id !== value.listingId) ||
      row.content_hash !== policyHash(value) ||
      new Date(row.observed_at).toISOString() !== value.observedAt ||
      new Date(row.expires_at).toISOString() !== value.expiresAt
    )
      throw Error();
    return value;
  } catch {
    throw new TradingFault(
      "QUOTE_INVALID",
      "The quote could not be verified. Request a new quote.",
      503,
    );
  }
}
async function journal(
  connection: PoolConnection,
  accountId: string,
  code: CurrencyCode,
  kind: "trade" | "fx" | "opening_grant",
  delta: bigint,
) {
  if (delta === 0n || (delta < 0n ? -delta : delta).toString().length > 30)
    throw new TradingFault(
      "AMOUNT_OUT_OF_RANGE",
      "The journal amount is outside the supported range.",
    );
  const id = randomUUID(),
    other =
      kind === "opening_grant"
        ? "scenario_funding"
        : kind === "trade"
          ? "clearing"
          : "fx_clearing";
  await connection.execute(
    "INSERT INTO cash_journals (id,account_id,currency,kind) VALUES (?,?,?,?)",
    [id, accountId, code, kind],
  );
  await connection.execute(
    "INSERT INTO cash_entries (journal_id,bucket,amount_minor) VALUES (?,'wallet',?),(?,?,?)",
    [id, delta.toString(), id, other, (-delta).toString()],
  );
  const [rows] = await connection.execute<RowDataPacket[]>(
    "SELECT SUM(amount_minor) AS net,COUNT(*) AS count FROM cash_entries WHERE journal_id=?",
    [id],
  );
  if (BigInt(rows[0].net) !== 0n || Number(rows[0].count) !== 2)
    throw Error("JOURNAL_UNBALANCED");
  return id;
}
async function balance(
  connection: PoolConnection,
  accountId: string,
  code: CurrencyCode,
) {
  const [rows] = await connection.execute<RowDataPacket[]>(
    "SELECT balance_minor FROM wallets WHERE account_id=? AND currency=? FOR UPDATE",
    [accountId, code],
  );
  return rows.length ? BigInt(rows[0].balance_minor) : 0n;
}
async function writeBalance(
  connection: PoolConnection,
  accountId: string,
  code: CurrencyCode,
  value: bigint,
) {
  if (value < 0n)
    throw new TradingFault(
      "INSUFFICIENT_FUNDS",
      "There is not enough spendable cash in the native wallet.",
    );
  if (value.toString().length > 30)
    throw new TradingFault(
      "AMOUNT_OUT_OF_RANGE",
      "The resulting wallet balance is outside the supported range.",
    );
  await connection.execute(
    "INSERT INTO wallets (account_id,currency,balance_minor) VALUES (?,?,?) ON DUPLICATE KEY UPDATE balance_minor=VALUES(balance_minor)",
    [accountId, code, value.toString()],
  );
}
async function saved(
  connection: PoolConnection,
  accountId: string,
  key: string,
  hash?: string,
): Promise<OperationResult | null> {
  const [rows] = await connection.execute<RowDataPacket[]>(
    "SELECT request_hash,receipt,http_status FROM operation_records WHERE account_id=? AND idempotency_key=?",
    [accountId, key],
  );
  if (!rows.length) return null;
  if (hash && rows[0].request_hash !== hash)
    throw new TradingFault(
      "IDEMPOTENCY_CONFLICT",
      "This key was already used for a different operation. Recover its saved receipt.",
      409,
    );
  return {
    httpStatus: Number(rows[0].http_status),
    receipt: rows[0].receipt as OperationReceipt,
  };
}
async function transact(
  actor: Actor,
  accountId: string,
  key: string,
  kind: "order" | "fx" | "reset",
  body: unknown,
  run: (
    connection: PoolConnection,
    account: AccountRow,
  ) => Promise<OperationPayload>,
): Promise<OperationResult> {
  const hash = policyHash({ kind, body });
  for (let attempt = 0; ; attempt++) {
    const connection = await getPool().getConnection();
    try {
      await connection.query("SET SESSION innodb_lock_wait_timeout=5");
      await connection.beginTransaction();
      // Control first, then user/account/session: the pause writer takes the
      // same row exclusively and cannot commit ahead of admitted executions.
      const [control] = await connection.query<RowDataPacket[]>(
        "SELECT paused,execution_paused FROM simulation_control WHERE id=1 FOR SHARE",
      );
      await connection.execute(
        "SELECT id FROM user WHERE id=?" +
          (kind === "reset" ? " FOR UPDATE" : " FOR SHARE"),
        [actor.userId],
      );
      const account = await owned(actor.userId, accountId, connection, true);
      const [sessions] = await connection.execute<RowDataPacket[]>(
        "SELECT id FROM session WHERE id=? AND userId=? AND expiresAt>UTC_TIMESTAMP(3) FOR SHARE",
        [actor.sessionId, actor.userId],
      );
      if (!sessions.length)
        throw new TradingFault(
          "UNAUTHENTICATED",
          "Sign in again before changing the account.",
          401,
        );
      const prior = await saved(connection, accountId, key, hash);
      if (prior) {
        await connection.commit();
        return prior;
      }
      await connection.query("SAVEPOINT business_operation");
      let receipt: OperationReceipt,
        httpStatus = 201;
      const base = {
        id: randomUUID(),
        accountId,
        key,
        createdAt: new Date().toISOString(),
      };
      try {
        active(account);
        if (
          kind !== "reset" &&
          (!control.length || Number(control[0].execution_paused) !== 0)
        )
          throw new TradingFault(
            "EXECUTION_PAUSED",
            "Trading and currency conversion are temporarily paused. Recover any previous receipt before reviewing a new operation after trading resumes.",
            409,
          );
        const result = await run(connection, account);
        receipt = { ...base, ...result };
        await connection.execute(
          "UPDATE simulation_accounts SET version=version+1 WHERE id=?",
          [accountId],
        );
      } catch (error) {
        if (!(error instanceof TradingFault)) throw error;
        await connection.query("ROLLBACK TO SAVEPOINT business_operation");
        receipt = {
          ...base,
          kind,
          status: "rejected",
          code: error.code,
          message: error.message,
        };
        httpStatus = error.status;
      }
      await connection.execute(
        "INSERT INTO operation_records (account_id,idempotency_key,id,request_hash,kind,receipt,http_status) VALUES (?,?,?,?,?,?,?)",
        [
          accountId,
          key,
          receipt.id,
          hash,
          kind,
          JSON.stringify(receipt),
          httpStatus,
        ],
      );
      await connection.commit();
      return { httpStatus, receipt };
    } catch (error) {
      await connection.rollback();
      const retry =
        typeof error === "object" &&
        error !== null &&
        "code" in error &&
        ["ER_LOCK_DEADLOCK", "ER_LOCK_WAIT_TIMEOUT"].includes(
          String(error.code),
        );
      if (retry && attempt >= 2)
        throw new TradingFault(
          "ACCOUNT_BUSY",
          "The account is busy. Recover or retry the same operation key.",
          503,
        );
      if (!retry) throw error;
    } finally {
      connection.release();
    }
  }
}
export async function submitOrder(
  actor: Actor,
  key: string,
  intent: OrderIntent,
) {
  return transact(
    actor,
    intent.accountId,
    key,
    "order",
    intent,
    async (connection, account) => {
      const quote = await storedQuote(
        "market_snapshots",
        intent.quoteId,
        account.id,
        quoteSchema.parse,
        connection,
      );
      assertQuoteFresh(quote);
      const data = await market(intent.listingId, new Date(), connection);
      if (
        quote.policyId !== data.policy.id ||
        quote.marketAt !== data.marketAt ||
        quote.reference !== data.source.price ||
        quote.currency !== data.source.currency ||
        quote.quoteUnit !== data.source.quoteUnit ||
        quote.unitNumerator !== data.source.unitNumerator ||
        quote.unitDenominator !== data.source.unitDenominator ||
        quote.mic !== data.source.mic
      )
        throw new TradingFault(
          "QUOTE_MISMATCH",
          "Refresh the quote after the training policy or metadata changes.",
          409,
        );
      const calculation = fillCalculation(quote, data.policy.rules, intent);
      // Freshness is checked after policy/lock work too; waiting must never extend a quote's lifetime.
      assertQuoteFresh(quote);
      const amount = BigInt(calculation.notionalMinor),
        code = quote.currency as CurrencyCode;
      const cash = await balance(connection, account.id, code);
      const [rows] = await connection.execute<RowDataPacket[]>(
        "SELECT quantity,cost_basis_minor,realized_minor FROM positions WHERE account_id=? AND listing_id=? FOR UPDATE",
        [account.id, intent.listingId],
      );
      const position = rows[0],
        ownedQuantity = BigInt(position?.quantity ?? 0),
        basis = BigInt(position?.cost_basis_minor ?? 0),
        oldRealized = BigInt(position?.realized_minor ?? 0),
        quantity = BigInt(intent.quantity);
      if (intent.side === "BUY" && cash < amount)
        throw new TradingFault(
          "INSUFFICIENT_FUNDS",
          "Fund this listing's native wallet explicitly before buying.",
        );
      const allocated =
        intent.side === "SELL" ? saleBasis(basis, ownedQuantity, quantity) : 0n;
      const realized = intent.side === "SELL" ? amount - allocated : 0n;
      const newQuantity =
          ownedQuantity + (intent.side === "BUY" ? quantity : -quantity),
        newBasis = intent.side === "BUY" ? basis + amount : basis - allocated;
      if (
        newQuantity > 1000000000000n ||
        newBasis.toString().length > 30 ||
        (oldRealized + realized).toString().replace("-", "").length > 30
      )
        throw new TradingFault(
          "POSITION_CAP",
          "The position exceeds this model's size limits.",
        );
      const orderId = randomUUID(),
        fillId = randomUUID();
      assertQuoteFresh(quote);
      await writeBalance(
        connection,
        account.id,
        code,
        cash + (intent.side === "BUY" ? -amount : amount),
      );
      await connection.execute(
        "INSERT INTO positions (account_id,listing_id,currency,quantity,cost_basis_minor,realized_minor,version) VALUES (?,?,?,?,?,?,1) ON DUPLICATE KEY UPDATE quantity=VALUES(quantity),cost_basis_minor=VALUES(cost_basis_minor),realized_minor=VALUES(realized_minor),version=version+1",
        [
          account.id,
          intent.listingId,
          code,
          newQuantity.toString(),
          newBasis.toString(),
          (oldRealized + realized).toString(),
        ],
      );
      await connection.execute(
        "INSERT INTO orders (id,account_id,listing_id,side,quantity) VALUES (?,?,?,?,?)",
        [
          orderId,
          account.id,
          intent.listingId,
          intent.side,
          String(intent.quantity),
        ],
      );
      const journalId = await journal(
        connection,
        account.id,
        code,
        "trade",
        intent.side === "BUY" ? -amount : amount,
      );
      const order: FilledOrder = {
        ...calculation,
        orderId,
        fillId,
        journalId,
        listingId: intent.listingId,
        symbol: data.source.symbol,
        mic: quote.mic,
        side: intent.side,
        quantity: String(intent.quantity),
        currency: code,
        quoteUnit: quote.quoteUnit,
        reference: quote.reference,
        allocatedBasisMinor: allocated.toString(),
        realizedMinor: realized.toString(),
        snapshotId: quote.id,
        policyId: quote.policyId,
        marketAt: quote.marketAt,
        observedAt: quote.observedAt,
        provider: quote.provider,
        scenario: quote.scenario,
        reportingFx: {
          version: trainingFxVersion,
          from: code,
          to: account.reporting_currency,
          ...trainingRate(code, account.reporting_currency),
          observedAt: quote.observedAt,
        },
      };
      await connection.execute(
        "INSERT INTO fills (id,order_id,snapshot_id,journal_id,definition) VALUES (?,?,?,?,?)",
        [fillId, orderId, quote.id, journalId, JSON.stringify(order)],
      );
      return { kind: "order", status: "filled", order };
    },
  );
}
export async function convertFx(
  actor: Actor,
  key: string,
  intent: { accountId: string; quoteId: string; sourceMinor: string },
) {
  return transact(
    actor,
    intent.accountId,
    key,
    "fx",
    intent,
    async (connection, account) => {
      const quote = await storedQuote(
        "fx_quotes",
        intent.quoteId,
        account.id,
        fxQuoteSchema.parse,
        connection,
      );
      const expected = trainingRate(quote.fromCurrency, quote.toCurrency);
      if (
        quote.provider !== trainingFxVersion ||
        quote.rateNumerator !== expected.numerator ||
        quote.rateDenominator !== expected.denominator
      )
        throw new TradingFault(
          "FX_QUOTE_INVALID",
          "The quote does not match this account's training FX model.",
        );
      let result: ReturnType<typeof calculateFxConversion>;
      try {
        result = calculateFxConversion(
          quote,
          { quoteId: intent.quoteId, sourceMinor: intent.sourceMinor },
          account.id,
        );
      } catch {
        throw new TradingFault(
          "FX_QUOTE_INVALID",
          "The account-bound FX quote expired or the amount cannot be converted.",
        );
      }
      const from = quote.fromCurrency,
        to = quote.toCurrency;
      const source = await balance(connection, account.id, from),
        target = await balance(connection, account.id, to),
        debit = BigInt(result.debitMinor),
        credit = BigInt(result.creditMinor);
      if (source < debit)
        throw new TradingFault(
          "INSUFFICIENT_FUNDS",
          "There is not enough cash in the source wallet.",
        );
      await writeBalance(connection, account.id, from, source - debit);
      await writeBalance(connection, account.id, to, target + credit);
      const sourceJournalId = await journal(
          connection,
          account.id,
          from,
          "fx",
          -debit,
        ),
        targetJournalId = await journal(
          connection,
          account.id,
          to,
          "fx",
          credit,
        );
      const conversion: FxResult = {
        ...result,
        id: randomUUID(),
        sourceJournalId,
        targetJournalId,
        rateNumerator: quote.rateNumerator,
        rateDenominator: quote.rateDenominator,
      };
      await connection.execute(
        "INSERT INTO fx_conversions (id,account_id,quote_id,source_journal_id,target_journal_id,definition) VALUES (?,?,?,?,?,?)",
        [
          conversion.id,
          account.id,
          quote.id,
          sourceJournalId,
          targetJournalId,
          JSON.stringify(conversion),
        ],
      );
      try {
        calculateFxConversion(
          quote,
          { quoteId: intent.quoteId, sourceMinor: intent.sourceMinor },
          account.id,
        );
      } catch {
        throw new TradingFault(
          "FX_QUOTE_INVALID",
          "The FX quote expired while waiting. Request a fresh quote.",
        );
      }
      return { kind: "fx", status: "converted", conversion };
    },
  );
}
export async function resetAccount(
  actor: Actor,
  key: string,
  intent: { accountId: string; confirmation: "RESET" },
) {
  return transact(
    actor,
    intent.accountId,
    key,
    "reset",
    intent,
    async (connection, account) => {
      const [control] = await connection.query<RowDataPacket[]>(
        "SELECT paused FROM simulation_control WHERE id=1 FOR SHARE",
      );
      if (!control.length || Number(control[0].paused))
        throw new TradingFault(
          "SIMULATION_PAUSED",
          "New account funding is paused.",
          503,
        );
      const [resets] = await connection.execute<RowDataPacket[]>(
        "SELECT r.old_account_id FROM account_resets r JOIN simulation_accounts a ON a.id=r.old_account_id WHERE a.user_id=? AND r.created_at>UTC_TIMESTAMP(3)-INTERVAL 1 HOUR LIMIT 1",
        [actor.userId],
      );
      if (resets.length)
        throw new TradingFault(
          "RESET_RATE_LIMITED",
          "A new practice account can be started once per hour.",
          429,
        );
      const nextAccountId = randomUUID(),
        grant = openingGrant(account.reporting_currency);
      await connection.execute(
        "UPDATE simulation_accounts SET state='archived' WHERE id=?",
        [account.id],
      );
      await connection.execute(
        "INSERT INTO simulation_accounts (id,user_id,reporting_currency,data_mode,grant_version,grant_snapshot) VALUES (?,?,?,'synthetic',?,?)",
        [
          nextAccountId,
          actor.userId,
          account.reporting_currency,
          grant.version,
          JSON.stringify(grant),
        ],
      );
      await writeBalance(
        connection,
        nextAccountId,
        account.reporting_currency,
        BigInt(grant.minor),
      );
      await journal(
        connection,
        nextAccountId,
        account.reporting_currency,
        "opening_grant",
        BigInt(grant.minor),
      );
      await connection.execute(
        "INSERT INTO account_resets (old_account_id,next_account_id) VALUES (?,?)",
        [account.id, nextAccountId],
      );
      return { kind: "reset", status: "reset", nextAccountId };
    },
  );
}
export async function operationByKey(
  userId: string,
  accountId: string,
  key: string,
) {
  const connection = await getPool().getConnection();
  try {
    await owned(userId, accountId, connection);
    return await saved(connection, accountId, key);
  } finally {
    connection.release();
  }
}
export async function activity(
  userId: string,
  accountId: string,
  before?: string,
) {
  await owned(userId, accountId);
  let cursor: { at: Date; id: string } | null = null;
  if (before) {
    const [rows] = await getPool().execute<RowDataPacket[]>(
      "SELECT created_at,id FROM operation_records WHERE account_id=? AND id=?",
      [accountId, before],
    );
    if (!rows.length)
      throw new TradingFault(
        "NOT_FOUND",
        "The activity cursor was not found.",
        404,
      );
    cursor = { at: rows[0].created_at, id: rows[0].id };
  }
  const [rows] = await getPool().query<RowDataPacket[]>(
    "SELECT id,receipt FROM operation_records WHERE account_id=?" +
      (cursor ? " AND (created_at<? OR (created_at=? AND id<?))" : "") +
      " ORDER BY created_at DESC,id DESC LIMIT 21",
    cursor ? [accountId, cursor.at, cursor.at, cursor.id] : [accountId],
  );
  return {
    receipts: rows.slice(0, 20).map((row) => row.receipt as OperationReceipt),
    nextCursor: rows.length > 20 ? (rows[19].id as string) : null,
  };
}
export type PositionView = {
  listingId: string;
  symbol: string;
  mic: string;
  name: string;
  currency: CurrencyCode;
  quantity: string;
  basisMinor: string;
  realizedMinor: string;
  valueMinor: string | null;
  unrealizedMinor: string | null;
  marketAt: string | null;
  reference: string | null;
  unavailableReason: string | null;
};
export async function portfolio(userId: string, accountId: string) {
  const connection = await getPool().getConnection();
  try {
    await connection.beginTransaction();
    const [accounts] = await connection.execute<AccountRow[]>(
      "SELECT * FROM simulation_accounts WHERE id=? AND user_id=? FOR SHARE",
      [accountId, userId],
    );
    if (!accounts.length)
      throw new TradingFault("NOT_FOUND", "The account was not found.", 404);
    const account = accounts[0],
      now = new Date();
    const [walletRows] = await connection.execute<RowDataPacket[]>(
      "SELECT currency,balance_minor FROM wallets WHERE account_id=? ORDER BY currency",
      [accountId],
    );
    const [positionRows] = await connection.execute<RowDataPacket[]>(
      "SELECT p.*,l.symbol,l.mic,s.name FROM positions p JOIN listings l ON l.id=p.listing_id JOIN securities s ON s.id=l.security_id WHERE p.account_id=? ORDER BY l.mic,l.symbol",
      [accountId],
    );
    const positions: PositionView[] = [];
    for (const row of positionRows) {
      let value: bigint | null = null,
        marketAt: string | null = null,
        unavailableReason: string | null = null,
        reference: string | null = null;
      if (BigInt(row.quantity) === 0n) value = 0n;
      else
        try {
          const data = await market(row.listing_id, now, connection);
          const decimals = data.policy.rules.quoteDecimals;
          value = roundHalfEven(
            BigInt(row.quantity) *
              parseMinor(data.source.price, decimals) *
              BigInt(data.source.unitNumerator) *
              10n ** BigInt(currency(row.currency).exponent),
            10n ** BigInt(decimals) * BigInt(data.source.unitDenominator),
          );
          marketAt = data.marketAt;
          reference = data.source.price;
        } catch (error) {
          if (!(error instanceof TradingFault)) throw error;
          unavailableReason = error.code;
        }
      positions.push({
        listingId: row.listing_id as string,
        symbol: row.symbol as string,
        mic: row.mic as string,
        name: row.name as string,
        currency: row.currency as CurrencyCode,
        quantity: String(row.quantity),
        basisMinor: String(row.cost_basis_minor),
        realizedMinor: String(row.realized_minor),
        valueMinor: value?.toString() ?? null,
        unrealizedMinor:
          value === null
            ? null
            : (value - BigInt(row.cost_basis_minor)).toString(),
        marketAt,
        reference,
        unavailableReason,
      });
    }
    const wallets = walletRows.map((row) => {
      const holdings = positions.filter(
        (position) => position.currency === row.currency,
      );
      const complete = holdings.every(
        (position) => position.valueMinor !== null,
      );
      const value = holdings.reduce(
        (sum, position) => sum + BigInt(position.valueMinor ?? 0),
        0n,
      );
      return {
        currency: row.currency as CurrencyCode,
        exponent: currency(row.currency).exponent,
        balanceMinor: String(row.balance_minor),
        positionValueMinor: complete ? value.toString() : null,
        equityMinor: complete
          ? (BigInt(row.balance_minor) + value).toString()
          : null,
      };
    });
    const complete = wallets.every((wallet) => wallet.equityMinor !== null);
    const equity = complete
      ? wallets.reduce(
          (sum, wallet) =>
            sum +
            convertMark(
              BigInt(wallet.equityMinor!),
              wallet.currency,
              account.reporting_currency,
            ),
          0n,
        )
      : null;
    const [resets] = await connection.execute<RowDataPacket[]>(
      "SELECT old_account_id,next_account_id FROM account_resets WHERE old_account_id=? OR next_account_id=? LIMIT 2",
      [accountId, accountId],
    );
    const history = {
      previousAccountId:
        (resets.find((row) => row.next_account_id === accountId)
          ?.old_account_id as string | undefined) ?? null,
      nextAccountId:
        (resets.find((row) => row.old_account_id === accountId)
          ?.next_account_id as string | undefined) ?? null,
    };
    await connection.commit();
    return {
      accountId,
      history,
      state: account.state,
      version: String(account.version),
      reportingCurrency: account.reporting_currency,
      scenario: account.scenario_id,
      model: account.model_version,
      asOf: now.toISOString(),
      wallets,
      positions,
      reporting: {
        complete,
        equityMinor: equity?.toString() ?? null,
        netPnlMinor:
          equity === null
            ? null
            : (equity - BigInt(account.grant_snapshot.minor)).toString(),
        fundingMinor: account.grant_snapshot.minor,
        fx: {
          version: trainingFxVersion,
          provider: "project-authored exercise rates",
          observedAt: now.toISOString(),
          rates: wallets.map((wallet) => ({
            from: wallet.currency,
            to: account.reporting_currency,
            ...trainingRate(wallet.currency, account.reporting_currency),
          })),
          rounding: "half-even" as const,
          assetFxAttribution:
            "Exercise FX rates are fixed; market FX gains are not modeled.",
        },
      },
    };
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
}
export type Portfolio = Awaited<ReturnType<typeof portfolio>>;
