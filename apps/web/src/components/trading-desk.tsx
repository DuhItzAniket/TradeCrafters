"use client";
import Link from "next/link";
import { useState, useSyncExternalStore, useCallback } from "react";
import { useRouter } from "next/navigation";
import { z } from "zod";
import {
  orderIntentSchema,
  fxIntentSchema,
  resetIntentSchema,
  idempotencyKey,
} from "@tradecrafters/contracts";
import { currency, formatMinor } from "@tradecrafters/domain";
import type { Portfolio } from "@tradecrafters/database/trading";
import type { OperationReceipt } from "@tradecrafters/domain/trading";
import { ListingBrowser, type VenueSelection } from "./listing-browser";
import { MarketWorkspace, UnavailableVenue } from "./market-workspace";
import { scenarios } from "@tradecrafters/market-catalog/scenarios";
import { FxConverter } from "./fx-converter";
import { OperationReceiptView } from "./operation-receipt";
import { tradingRequest } from "@/lib/trading-client";
const pendingSchema = z.discriminatedUnion("path", [
  z
    .object({
      path: z.literal("/api/trading/orders"),
      key: idempotencyKey,
      body: orderIntentSchema,
    })
    .strict(),
  z
    .object({
      path: z.literal("/api/trading/fx"),
      key: idempotencyKey,
      body: fxIntentSchema,
    })
    .strict(),
  z
    .object({
      path: z.literal("/api/trading/reset"),
      key: idempotencyKey,
      body: resetIntentSchema,
    })
    .strict(),
]);
type Pending = z.infer<typeof pendingSchema>;
type Activity = { receipts: OperationReceipt[]; nextCursor: string | null };
function subscribe(listener: () => void) {
  window.addEventListener("tc-operation-change", listener);
  window.addEventListener("storage", listener);
  return () => {
    window.removeEventListener("tc-operation-change", listener);
    window.removeEventListener("storage", listener);
  };
}
function money(value: string | null, code: string) {
  return value === null
    ? "Unavailable"
    : `${formatMinor(value, currency(code).exponent)} ${code}`;
}
function label(receipt: OperationReceipt) {
  return receipt.status === "filled"
    ? `${receipt.order.side} ${receipt.order.quantity} ${receipt.order.symbol} · ${receipt.order.mic}`
    : receipt.status === "converted"
      ? `${receipt.conversion.fromCurrency} → ${receipt.conversion.toCurrency}`
      : receipt.status === "reset"
        ? "Practice account archived"
        : receipt.code.replaceAll("_", " ");
}
export function TradingDesk({
  initial,
  initialActivity,
  initialListingId,
  ownerId,
  initialVenue,
}: {
  initial: Portfolio;
  initialActivity: Activity;
  initialListingId: string;
  ownerId: string;
  initialVenue: VenueSelection | null;
}) {
  const [data, setData] = useState(initial),
    [feed, setFeed] = useState(initialActivity),
    [receipt, setReceipt] = useState<OperationReceipt | null>(null),
    [busy, setBusy] = useState(false),
    [message, setMessage] = useState(""),
    [confirmation, setConfirmation] = useState("");
  const [selection, setSelection] = useState<{
    listingId: string;
    side: "BUY" | "SELL";
  }>({ listingId: initialListingId, side: "BUY" });
  const [stale, setStale] = useState(false);
  const [venue, setVenue] = useState<VenueSelection | null>(initialVenue);
  const [recordView, setRecordView] = useState("positions");
  const [activityFilter, setActivityFilter] = useState("all");
  const router = useRouter(),
    storageKey = `tradecrafters.pending.v1.${ownerId}`;
  const getSnapshot = useCallback(() => {
    try {
      return sessionStorage.getItem(storageKey);
    } catch {
      return null;
    }
  }, [storageKey]);
  const raw = useSyncExternalStore(subscribe, getSnapshot, () => null);
  let pending: Pending | null = null;
  if (raw)
    try {
      const parsed = pendingSchema.safeParse(JSON.parse(raw));
      if (parsed.success) pending = parsed.data;
    } catch {
      /* Unreadable local records are never sent to a server. */
    }
  const blocked = busy || stale || raw !== null || data.state !== "active";
  function remember(value: Pending | null) {
    if (value) sessionStorage.setItem(storageKey, JSON.stringify(value));
    else sessionStorage.removeItem(storageKey);
    window.dispatchEvent(new Event("tc-operation-change"));
  }
  async function refresh() {
    const [portfolioResult, activityResult] = await Promise.all([
      tradingRequest<{ portfolio: Portfolio }>(
        `/api/trading/portfolio?accountId=${data.accountId}`,
      ),
      tradingRequest<Activity>(
        `/api/trading/activity?accountId=${data.accountId}`,
      ),
    ]);
    setData(portfolioResult.portfolio);
    setFeed(activityResult);
    setStale(false);
  }
  async function confirmed(value: OperationReceipt) {
    remember(null);
    setReceipt(value);
    setMessage("");
    if (value.status === "reset") {
      router.push("/trading");
      router.refresh();
      return;
    }
    try {
      await refresh();
    } catch {
      setStale(true);
      setMessage(
        "The receipt is confirmed, but balances could not be refreshed. Reload before placing another operation.",
      );
    }
  }
  async function send(value: Pending) {
    const response = await fetch(value.path, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Idempotency-Key": value.key,
      },
      body: JSON.stringify(value.body),
    });
    const result = await response.json();
    if (
      result.receipt?.key === value.key &&
      result.receipt?.accountId === value.body.accountId
    ) {
      await confirmed(result.receipt);
      return;
    }
    throw Error(
      result.error?.message ||
        "The outcome is unconfirmed. Recover the saved receipt or retry the original request with its retained key.",
    );
  }
  async function execute(path: Pending["path"], body: unknown) {
    if (busy || stale || getSnapshot() !== null || data.state !== "active")
      return;
    setBusy(true);
    setMessage("");
    try {
      const value = pendingSchema.parse({
        path,
        body,
        key: crypto.randomUUID(),
      });
      remember(value);
      await send(value);
    } catch (error) {
      setMessage(
        error instanceof TypeError
          ? "Connection lost. This operation may have completed. Recover its saved receipt before placing another."
          : error instanceof Error
            ? error.message
            : "The outcome is unconfirmed. Use recovery below.",
      );
    } finally {
      setBusy(false);
    }
  }
  async function recover(retry = false) {
    if (!pending || busy) return;
    setBusy(true);
    setMessage("");
    try {
      if (retry) await send(pending);
      else {
        const result = await tradingRequest<{ receipt: OperationReceipt }>(
          `/api/trading/operations?accountId=${pending.body.accountId}&key=${pending.key}`,
        );
        if (
          result.receipt.key !== pending.key ||
          result.receipt.accountId !== pending.body.accountId
        )
          throw Error("The saved receipt did not match this operation.");
        await confirmed(result.receipt);
      }
    } catch (error) {
      setMessage(
        error instanceof Error
          ? error.message
          : "Could not confirm the outcome.",
      );
    } finally {
      setBusy(false);
    }
  }
  async function loadOlder() {
    if (!feed.nextCursor || busy) return;
    setBusy(true);
    try {
      const next = await tradingRequest<Activity>(
        `/api/trading/activity?accountId=${data.accountId}&before=${feed.nextCursor}`,
      );
      setFeed({
        receipts: [...feed.receipts, ...next.receipts],
        nextCursor: next.nextCursor,
      });
    } catch (error) {
      setMessage(
        error instanceof Error ? error.message : "Could not load activity.",
      );
    } finally {
      setBusy(false);
    }
  }
  const report = data.reportingCurrency,
    holdings = data.positions.filter(
      (position) => BigInt(position.quantity) > 0n,
    );
  const selectedListing = scenarios.find(
    (row) => row.id === selection.listingId,
  )!;
  const visibleReceipts = feed.receipts.filter(
    (item) =>
      activityFilter === "all" ||
      (activityFilter === "rejected"
        ? item.status === "rejected"
        : item.kind === activityFilter),
  );
  function selectListing(listingId: string, side: "BUY" | "SELL" = "BUY") {
    setVenue(null);
    setSelection({ listingId, side });
  }
  return (
    <>
      {data.state === "archived" && (
        <div className="context-strip">
          <p>
            <strong>Archived practice account.</strong> Balances, fills and
            receipts are retained.{" "}
            <Link href="/trading">Return to your active account →</Link>
          </p>
        </div>
      )}
      {raw && (
        <section
          className="panel recovery-panel"
          aria-label="Unconfirmed operation"
        >
          <span className="eyebrow">CONFIRM THE PREVIOUS OUTCOME</span>
          <h2>Confirm your last operation.</h2>
          <p>
            A previous request is awaiting confirmation. Recover its saved
            receipt before placing another trade or conversion.
          </p>
          {pending ? (
            <>
              <details>
                <summary>Request reference</summary>
                <p className="small-copy">{pending.key}</p>
              </details>
              <div className="recovery-actions">
                <button
                  className="button primary"
                  disabled={busy}
                  onClick={() => recover()}
                >
                  Recover saved receipt
                </button>
                <button
                  className="button secondary"
                  disabled={busy}
                  onClick={() => recover(true)}
                >
                  Retry original request
                </button>
              </div>
            </>
          ) : (
            <>
              <p>
                The local record could not be read. Check recent receipts before
                clearing this unreadable recovery record.
              </p>
              <button
                className="button secondary"
                onClick={() => remember(null)}
              >
                Clear unreadable record
              </button>
            </>
          )}
        </section>
      )}
      {message && (
        <p className="form-message error desk-message" role="alert">
          {message}
        </p>
      )}
      <div className="trading-summary workbench-summary">
        <div>
          <span className="eyebrow">REPORTING EQUITY · {report}</span>
          <strong>{money(data.reporting.equityMinor, report)}</strong>
          <small>
            {data.reporting.complete
              ? "Native cash + fictional position marks"
              : "Incomplete: one or more position marks are unavailable"}
          </small>
        </div>
        <div>
          <span className="eyebrow">NET VS OPENING GRANT</span>
          <strong
            className={
              BigInt(data.reporting.netPnlMinor ?? 0) < 0n
                ? "negative"
                : "positive"
            }
          >
            {money(data.reporting.netPnlMinor, report)}
          </strong>
          <small>Fixed exercise FX · not spendable native cash</small>
        </div>
        <button
          className="text-button"
          disabled={busy}
          onClick={async () => {
            setBusy(true);
            try {
              await refresh();
              setMessage("");
            } catch {
              setMessage(
                "Could not refresh the account. Your saved receipts remain available.",
              );
            } finally {
              setBusy(false);
            }
          }}
        >
          Refresh account ↻
        </button>
      </div>
      <div className="workbench-grid">
        <ListingBrowser
          ownerId={ownerId}
          selectedId={selection.listingId}
          venue={venue}
          onSelect={(id) => selectListing(id)}
          onVenue={setVenue}
        />
        {venue ? (
          <>
            <UnavailableVenue venue={venue} onReturn={() => setVenue(null)} />
            <aside className="workbench-order unavailable-ticket">
              <span className="eyebrow">ORDER ACCESS</span>
              <h2>Real-market trading is unavailable.</h2>
              <p>
                Choose a fictional practice listing to place a virtual order.
                Your existing native wallets, conversions and receipts remain
                available below.
              </p>
              <button
                className="button secondary"
                onClick={() => setVenue(null)}
              >
                Return to fictional practice
              </button>
            </aside>
          </>
        ) : (
          <MarketWorkspace
            key={selection.listingId}
            accountId={data.accountId}
            listingId={selection.listingId}
            side={selection.side}
            blocked={blocked}
            balanceMinor={
              data.wallets.find((w) => w.currency === selectedListing.currency)
                ?.balanceMinor ?? "0"
            }
            onSelect={selectListing}
            execute={execute}
          />
        )}
        <div className="trading-main workbench-records">
          {receipt && <OperationReceiptView receipt={receipt} />}
          <div
            className="record-navigation"
            role="group"
            aria-label="Account records"
          >
            <button
              aria-pressed={recordView === "positions"}
              onClick={() => setRecordView("positions")}
            >
              Positions · {holdings.length}
            </button>
            <button
              aria-pressed={recordView === "wallets"}
              onClick={() => setRecordView("wallets")}
            >
              Wallets &amp; FX
            </button>
            <button
              aria-pressed={recordView === "activity"}
              onClick={() => setRecordView("activity")}
            >
              Activity · {feed.receipts.length}
              {feed.nextCursor ? "+" : ""}
            </button>
          </div>
          <section
            className="panel holdings-panel"
            hidden={recordView !== "positions"}
          >
            <div className="panel-heading">
              <div>
                <span className="eyebrow">NATIVE HOLDINGS</span>
                <h2>Your positions.</h2>
              </div>
              <span className="mono muted">{holdings.length} OPEN</span>
            </div>
            {data.positions.length ? (
              <div
                className="trading-table-wrap"
                role="region"
                aria-label="Positions table, scroll horizontally for all columns"
                tabIndex={0}
              >
                <table className="trading-table">
                  <caption>
                    Fictional native-currency positions and weighted cost basis
                  </caption>
                  <thead>
                    <tr>
                      <th>Listing / venue</th>
                      <th>Shares</th>
                      <th>Cost basis</th>
                      <th>Mark value</th>
                      <th>Unrealized / realized</th>
                      <th>
                        <span className="sr-only">Trade</span>
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.positions.map((position) => (
                      <tr key={position.listingId}>
                        <td>
                          <strong>{position.symbol}</strong>
                          <small>
                            {position.mic} · {position.currency}
                          </small>
                        </td>
                        <td>{position.quantity}</td>
                        <td>{money(position.basisMinor, position.currency)}</td>
                        <td>{money(position.valueMinor, position.currency)}</td>
                        <td>
                          <span>
                            {money(position.unrealizedMinor, position.currency)}
                          </span>
                          <small>
                            Realized{" "}
                            {money(position.realizedMinor, position.currency)}
                          </small>
                        </td>
                        <td>
                          {BigInt(position.quantity) > 0n && (
                            <button
                              className="text-button"
                              disabled={blocked}
                              onClick={() => {
                                setVenue(null);
                                setSelection({
                                  listingId: position.listingId,
                                  side: "SELL",
                                });
                                document
                                  .getElementById("order-ticket")
                                  ?.scrollIntoView({
                                    behavior: "auto",
                                    block: "start",
                                  });
                              }}
                            >
                              Sell →
                            </button>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <div className="trading-empty">
                <span aria-hidden="true">◫</span>
                <h3>Your first position starts with a considered trade.</h3>
                <p>
                  Choose a fictional listing, check the native currency and
                  review the modeled fill before submitting.
                </p>
              </div>
            )}
          </section>
          <section className="panel" hidden={recordView !== "wallets"}>
            <div className="panel-heading">
              <div>
                <span className="eyebrow">SPENDABLE CAPITAL</span>
                <h2>Native wallets.</h2>
              </div>
              <Link href="/account" className="source-link">
                Manage wallets ↗
              </Link>
            </div>
            <div className="wallet-ledger">
              {data.wallets.map((wallet) => (
                <div key={wallet.currency}>
                  <span>
                    <strong>{wallet.currency}</strong>
                    <small>{currency(wallet.currency).name}</small>
                  </span>
                  <span>
                    {formatMinor(wallet.balanceMinor, wallet.exponent)}
                    <small>Available virtual cash</small>
                  </span>
                </div>
              ))}
            </div>
            <p className="panel-footnote">
              Orders spend only the listing’s native currency. Reporting totals
              cannot fund another wallet; use an explicit conversion.
            </p>
            <div className="wallet-conversion">
              <FxConverter
                accountId={data.accountId}
                initialCurrency={report}
                blocked={blocked}
                execute={execute}
              />
            </div>
            <details className="reporting-details">
              <summary>Reporting FX source and completeness</summary>
              <p>
                Valuation {data.asOf}.{" "}
                {data.reporting.complete
                  ? "All required marks are available."
                  : "Incomplete: required marks are missing; equity is unavailable."}{" "}
                Fixed exercise rates are not market FX.
              </p>
              <p>
                Source: {data.reporting.fx.provider} ·{" "}
                {data.reporting.fx.version} · observed{" "}
                {data.reporting.fx.observedAt}. Half-even reporting conversion.
              </p>
              <dl className="receipt-facts">
                {data.reporting.fx.rates.map((rate) => (
                  <div key={rate.from}>
                    <dt>
                      {rate.from} → {rate.to}
                    </dt>
                    <dd>
                      {rate.numerator}/{rate.denominator} target units per
                      source unit
                    </dd>
                  </div>
                ))}
              </dl>
              <p>{data.reporting.fx.assetFxAttribution}</p>
            </details>
          </section>
          <section
            className="panel activity-panel"
            hidden={recordView !== "activity"}
          >
            <div className="panel-heading">
              <div>
                <span className="eyebrow">DURABLE OUTCOMES</span>
                <h2>Activity &amp; receipts.</h2>
              </div>
              <span className="mono muted">{data.state.toUpperCase()}</span>
            </div>
            <label className="field activity-filter">
              <span>Filter loaded receipts</span>
              <select
                value={activityFilter}
                onChange={(e) => setActivityFilter(e.target.value)}
              >
                <option value="all">All outcomes</option>
                <option value="order">Trades</option>
                <option value="fx">Currency conversions</option>
                <option value="reset">Archive / reset</option>
                <option value="rejected">Declined operations</option>
              </select>
            </label>
            {visibleReceipts.length ? (
              <ol className="trading-activity">
                {visibleReceipts.map((item) => (
                  <li key={item.id}>
                    <button onClick={() => setReceipt(item)}>
                      <span>
                        <strong>{label(item)}</strong>
                        <small>
                          {new Date(item.createdAt)
                            .toISOString()
                            .slice(0, 19)
                            .replace("T", " ")}{" "}
                          UTC
                        </small>
                      </span>
                      <span
                        className={item.status === "rejected" ? "negative" : ""}
                      >
                        {item.status} ↗
                      </span>
                    </button>
                  </li>
                ))}
              </ol>
            ) : (
              <div className="trading-empty compact">
                <p>
                  No matching receipts in the loaded page. Filled trades,
                  conversions and saved declines appear here. Load older
                  receipts below when available, or change the filter.
                </p>
              </div>
            )}
            {feed.nextCursor && (
              <button
                className="text-button load-activity"
                disabled={busy}
                onClick={loadOlder}
              >
                Load older receipts ↓
              </button>
            )}
          </section>
          <div className="practice-history">
            {data.history.previousAccountId && (
              <Link href={`/trading?account=${data.history.previousAccountId}`}>
                ← Previous practice account
              </Link>
            )}
            {data.history.nextAccountId && (
              <Link href={`/trading?account=${data.history.nextAccountId}`}>
                Next practice account →
              </Link>
            )}
          </div>
          {data.state === "active" && (
            <details className="panel reset-panel">
              <summary>Start a new practice account</summary>
              <p>
                This archives the current account and preserves its history. A
                new account starts with one opening grant in {report}; positions
                are not carried forward. Limited to once per hour.
              </p>
              <label className="field">
                <span>Type RESET to confirm</span>
                <input
                  value={confirmation}
                  disabled={blocked}
                  autoComplete="off"
                  onChange={(event) => setConfirmation(event.target.value)}
                />
              </label>
              <button
                className="button secondary"
                disabled={blocked || confirmation !== "RESET"}
                onClick={() =>
                  execute("/api/trading/reset", {
                    accountId: data.accountId,
                    confirmation: "RESET",
                  })
                }
              >
                Archive and start again
              </button>
            </details>
          )}
          <p className="small-copy trading-provenance">
            Valuation observed {data.asOf}. {data.reporting.fx.version}: fixed
            project-authored exercise rates, half-even reporting conversion.
            Cash and inventory settle instantly in this model. No historical
            performance curve or real-market integration is implied.
          </p>
        </div>
      </div>
    </>
  );
}
