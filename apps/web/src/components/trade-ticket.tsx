"use client";
import { useState } from "react";
import { scenarios } from "@tradecrafters/market-catalog/scenarios";
import { currency, formatMinor } from "@tradecrafters/domain";
import { fillCalculation } from "@tradecrafters/domain/trading";
import type { issueTrainingQuote } from "@tradecrafters/database/trading";
import { tradingRequest } from "@/lib/trading-client";
type QuoteView = Awaited<ReturnType<typeof issueTrainingQuote>>;
export function TradeTicket({
  accountId,
  listingId,
  side,
  blocked,
  onSelect,
  execute,
}: {
  accountId: string;
  listingId: string;
  side: "BUY" | "SELL";
  blocked: boolean;
  onSelect: (listingId: string, side: "BUY" | "SELL") => void;
  execute: (path: "/api/trading/orders", body: unknown) => Promise<void>;
}) {
  const listing = scenarios.find((item) => item.id === listingId)!;
  const [quantity, setQuantity] = useState(String(listing.lot)),
    [view, setView] = useState<QuoteView | null>(null),
    [loading, setLoading] = useState(false),
    [message, setMessage] = useState("");
  const qty = Number(quantity);
  let preview: ReturnType<typeof fillCalculation> | null = null;
  if (view)
    try {
      preview = fillCalculation(view.quote, view.rules, {
        accountId,
        listingId,
        quoteId: view.quote.id,
        side,
        orderType: "MARKET",
        quantity: qty,
      });
    } catch {
      /* The final server rule check supplies a durable rejection if submitted. */
    }
  async function review() {
    setLoading(true);
    setMessage("");
    setView(null);
    try {
      if (
        !Number.isSafeInteger(qty) ||
        qty < 1 ||
        qty > 1000000 ||
        qty % listing.lot !== 0
      )
        throw Error(
          `Use a whole multiple of ${listing.lot} shares, up to 1,000,000.`,
        );
      setView(
        await tradingRequest<QuoteView>("/api/trading/quotes", {
          accountId,
          listingId,
        }),
      );
    } catch (error) {
      setMessage(
        error instanceof Error ? error.message : "Could not load a quote.",
      );
    } finally {
      setLoading(false);
    }
  }
  return (
    <section className="panel trade-ticket" aria-label="Market order ticket">
      <div className="panel-heading">
        <div>
          <span className="eyebrow">ORDER TICKET</span>
          <h2>Make a practice trade.</h2>
        </div>
        <span className="synthetic-pill">Market</span>
      </div>
      <div className="ticket-body">
        <label className="field">
          <span>Fictional listing / venue</span>
          <select
            value={listingId}
            disabled={loading}
            onChange={(event) => onSelect(event.target.value, side)}
          >
            {scenarios.map((item) => (
              <option value={item.id} key={item.id}>
                {item.symbol} · {item.mic} · {item.currency}
              </option>
            ))}
          </select>
        </label>
        <div className="trade-sides" aria-label="Order side">
          <button
            type="button"
            aria-pressed={side === "BUY"}
            disabled={blocked || loading}
            onClick={() => onSelect(listingId, "BUY")}
          >
            Buy
          </button>
          <button
            type="button"
            aria-pressed={side === "SELL"}
            disabled={blocked || loading}
            onClick={() => onSelect(listingId, "SELL")}
          >
            Sell
          </button>
        </div>
        <label className="field">
          <span>Shares</span>
          <input
            inputMode="numeric"
            type="number"
            min={listing.lot}
            step={listing.lot}
            max={1000000}
            value={quantity}
            disabled={blocked || loading}
            onChange={(event) => {
              setQuantity(event.target.value);
              setView(null);
              setMessage("");
            }}
          />
        </label>
        <p className="ticket-meta">
          Lot {listing.lot} · settlement {listing.currency} · quote{" "}
          {listing.quoteUnit}
        </p>
        {view && preview && (
          <div className="order-review" aria-label="Order review">
            <span className="eyebrow">REVIEW BEFORE SUBMITTING</span>
            <dl className="receipt-facts">
              <div>
                <dt>{side === "BUY" ? "Buy" : "Sell"} price</dt>
                <dd>
                  {preview.price} {listing.quoteUnit}
                </dd>
              </div>
              <div>
                <dt>{side === "BUY" ? "Cash required" : "Cash returned"}</dt>
                <dd>
                  {formatMinor(
                    preview.notionalMinor,
                    currency(listing.currency).exponent,
                  )}{" "}
                  {listing.currency}
                </dd>
              </div>
              <div>
                <dt>Commission</dt>
                <dd>0 {listing.currency}</dd>
              </div>
              <div>
                <dt>Model</dt>
                <dd>5 bps half-spread · {preview.rounding}</dd>
              </div>
            </dl>
            <p className="small-copy">
              Quote valid until {view.quote.expiresAt.slice(11, 19)} UTC. Server
              checks native cash, inventory, lots and policy again at
              submission.
            </p>
            <button
              className="button primary full-width"
              disabled={blocked || loading}
              onClick={() => {
                setView(null);
                return execute("/api/trading/orders", {
                  accountId,
                  listingId,
                  quoteId: view.quote.id,
                  side,
                  orderType: "MARKET",
                  quantity: qty,
                });
              }}
            >
              Confirm {side === "BUY" ? "buy" : "sell"} {quantity}{" "}
              {listing.symbol} →
            </button>
          </div>
        )}
        {view && !preview && (
          <p className="form-message error">
            This quantity exceeds the training order rules or cap. Change it and
            review again.
          </p>
        )}
        <button
          className={`button ${view ? "secondary" : "primary"} full-width`}
          disabled={blocked || loading}
          onClick={review}
        >
          {loading
            ? "Getting quote…"
            : view
              ? "Refresh quote"
              : "Review market order →"}
        </button>
        {message && (
          <p className="form-message error" role="alert">
            {message}
          </p>
        )}
        <p className="small-copy">
          Fictional reference prices, instant virtual settlement and no order
          book. Training clock: 20 Oct 2026, 10:15 in this venue’s timezone. No
          real orders.
        </p>
      </div>
    </section>
  );
}
