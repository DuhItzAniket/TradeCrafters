"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import { scenarios } from "@tradecrafters/market-catalog/scenarios";
import { formatMinor, currency } from "@tradecrafters/domain";
import type { TrainingChart } from "@tradecrafters/database/workbench";
import { ScenarioChart, timeIn } from "./scenario-chart";
import { TradeTicket } from "./trade-ticket";
import type { VenueSelection } from "./listing-browser";

export function UnavailableVenue({
  venue,
  onReturn,
}: {
  venue: VenueSelection;
  onReturn: () => void;
}) {
  return (
    <section
      className="workbench-market unsupported-market"
      aria-label="Selected real venue"
    >
      <span className="eyebrow">WORLDWIDE REFERENCE / {venue.country}</span>
      <h2>
        {venue.mic} · {venue.name}
      </h2>
      <span className="market-state unavailable">Real data not connected</span>
      <div className="chart-empty">
        <span aria-hidden="true">◫</span>
        <h3>This venue needs verified coverage.</h3>
        <p>
          Its presence in the MIC reference does not establish stock listings,
          market rules, prices or simulation rights. No price chart or order
          ticket is available.
        </p>
        <button className="button secondary" onClick={onReturn}>
          Return to fictional practice
        </button>
      </div>
      <dl className="market-facts">
        <div>
          <dt>Operating MIC</dt>
          <dd>{venue.operatingMic}</dd>
        </div>
        <div>
          <dt>Snapshot status</dt>
          <dd>{venue.sourceStatus}</dd>
        </div>
        <div>
          <dt>Classification</dt>
          <dd>{venue.classification}</dd>
        </div>
        <div>
          <dt>Trading currency</dt>
          <dd>Unverified</dd>
        </div>
      </dl>
      <Link
        className="source-link"
        href={`/directory?q=${encodeURIComponent(venue.mic)}`}
      >
        View reference and coverage gaps ↗
      </Link>
    </section>
  );
}
export function MarketWorkspace({
  accountId,
  listingId,
  side,
  blocked,
  balanceMinor,
  onSelect,
  execute,
}: {
  accountId: string;
  listingId: string;
  side: "BUY" | "SELL";
  blocked: boolean;
  balanceMinor: string;
  onSelect: (id: string, side: "BUY" | "SELL") => void;
  execute: (path: "/api/trading/orders", body: unknown) => Promise<void>;
}) {
  const listing = scenarios.find((s) => s.id === listingId)!;
  const [data, setData] = useState<TrainingChart | null>(null),
    [error, setError] = useState(""),
    [revision, setRevision] = useState(0),
    [now, setNow] = useState(0);
  useEffect(() => {
    const controller = new AbortController();
    async function load() {
      try {
        const response = await fetch(
          `/api/listings/${encodeURIComponent(listingId)}/chart`,
          { signal: controller.signal, cache: "no-store" },
        );
        const value = await response.json();
        if (!response.ok)
          throw Error(
            value.error?.message ?? "This market could not be checked.",
          );
        if (!controller.signal.aborted) {
          setNow(Date.now());
          setData(value);
        }
      } catch (error) {
        if (!controller.signal.aborted)
          setError(
            error instanceof Error
              ? error.message
              : "Training data is unavailable.",
          );
      }
    }
    void load();
    return () => controller.abort();
  }, [listingId, revision]);
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, []);
  const expired = data !== null && now >= Date.parse(data.expiresAt),
    eligible = Boolean(data?.eligible) && !expired && !error;
  const status = error
    ? "Unavailable"
    : !data
      ? "Checking market…"
      : expired
        ? "Rules check expired"
        : data.phase === "continuous"
          ? data.eligible
            ? "Training session open"
            : data.code === "HALTED"
              ? "Trading halted"
              : "Trading unavailable"
          : data.phase.replaceAll("_", " ");
  function refresh() {
    setData(null);
    setError("");
    setRevision((v) => v + 1);
  }
  return (
    <>
      <section
        className="workbench-market"
        aria-label="Selected training market"
        aria-busy={!data && !error}
      >
        <div className="market-identity">
          <div>
            <span className="eyebrow">
              {listing.mic} / {listing.country} / {listing.sector}
            </span>
            <h2>{listing.name}</h2>
            <p>
              {listing.symbol} · {listing.currency} settlement ·{" "}
              {listing.quoteUnit} quote
            </p>
          </div>
          <span
            className={`market-state ${eligible ? "ready" : "unavailable"}`}
            role="status"
          >
            {status}
          </span>
        </div>
        {error ? (
          <div className="chart-empty" role="alert">
            <h3>Chart and rules unavailable.</h3>
            <p>
              {error} Other markets and your saved account records remain
              available.
            </p>
            <button className="button secondary" onClick={refresh}>
              Retry this market
            </button>
          </div>
        ) : !data ? (
          <div className="chart-loading" role="status">
            <div />
            <div />
            <div />
            <p>
              Checking the fictional calendar and loading the authored path…
            </p>
          </div>
        ) : (
          <>
            <ScenarioChart data={data} />
            <div className="market-clock">
              <strong>
                Fictional training · 20 Oct 2026 · 10:15 {listing.timezone}
              </strong>
              <span>
                {timeIn(
                  data.marketAt,
                  Intl.DateTimeFormat().resolvedOptions().timeZone,
                )}{" "}
                in your timezone ·{" "}
                {new Date(data.marketAt).toISOString().slice(11, 16)} UTC
              </span>
            </div>
            {!eligible && (
              <p className="market-warning" role="status">
                {expired
                  ? "Refresh the market check before reviewing another order."
                  : data.message}{" "}
                {data.nextSession
                  ? `Next fictional continuous session: ${new Date(data.nextSession.opensAt).toISOString()} (${timeIn(data.nextSession.opensAt, listing.timezone)} venue time; ${timeIn(data.nextSession.opensAt, Intl.DateTimeFormat().resolvedOptions().timeZone)} your time).`
                  : ""}
              </p>
            )}
            <details className="market-rule-details">
              <summary>Quote units &amp; execution rules</summary>
              <dl className="market-facts">
                <div>
                  <dt>Native quote unit</dt>
                  <dd>
                    {listing.quoteUnit}
                    {listing.unitDenominator === "100"
                      ? ` · 100 ${listing.quoteUnit} = 1 ${listing.currency}`
                      : ""}
                  </dd>
                </div>
                <div>
                  <dt>Board lot</dt>
                  <dd>
                    {data.rules?.boardLot ?? "Unverified"}{" "}
                    {data.rules?.boardLot === "1" ? "share" : "shares"}
                  </dd>
                </div>
                <div>
                  <dt>Training reference</dt>
                  <dd>
                    {data.reference ?? "Unavailable"} {data.quoteUnit}
                  </dd>
                </div>
                <div>
                  <dt>Execution</dt>
                  <dd>Fresh quote · 5 bps half-spread · zero commission</dd>
                </div>
              </dl>
            </details>
            <div className="market-check">
              <span>
                Rules checked {data.observedAt.slice(11, 19)} UTC · expires{" "}
                {data.expiresAt.slice(11, 19)} UTC
              </span>
              <button className="text-button" onClick={refresh}>
                Refresh market check ↻
              </button>
            </div>
          </>
        )}
      </section>
      <section
        className="workbench-order"
        id="order-ticket"
        aria-label="Selected listing order"
      >
        <div className="ticket-balance">
          <span>AVAILABLE TO TRADE · {listing.currency}</span>
          <strong>
            {formatMinor(balanceMinor, currency(listing.currency).exponent)}{" "}
            <small>{listing.currency}</small>
          </strong>
          <p>
            Native wallet cash. Convert explicitly to fund another currency.
          </p>
        </div>
        <TradeTicket
          key={`${listingId}:${side}:${revision}`}
          accountId={accountId}
          listingId={listingId}
          side={side}
          blocked={blocked || !eligible}
          onSelect={onSelect}
          execute={execute}
        />
      </section>
    </>
  );
}
