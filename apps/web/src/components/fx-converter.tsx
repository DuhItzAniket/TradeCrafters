"use client";
import { useEffect, useState } from "react";
import {
  currencies,
  currency,
  formatMinor,
  parseMinor,
  type CurrencyCode,
} from "@tradecrafters/domain";
import type { FxQuote } from "@tradecrafters/domain/fx";
import { tradingRequest } from "@/lib/trading-client";
import {
  createFxReview,
  previewFxReview,
  type FxReview,
} from "@/lib/fx-review";
type PreparedFxReview = FxReview & {
  preview: ReturnType<typeof previewFxReview>;
};
export function FxConverter({
  accountId,
  initialCurrency,
  blocked,
  execute,
}: {
  accountId: string;
  initialCurrency: CurrencyCode;
  blocked: boolean;
  execute: (path: "/api/trading/fx", body: unknown) => Promise<void>;
}) {
  const [from, setFrom] = useState(initialCurrency),
    [to, setTo] = useState<CurrencyCode>(
      initialCurrency === "GBP" ? "JPY" : "GBP",
    ),
    [amount, setAmount] = useState("100"),
    [reviewedQuote, setReviewedQuote] = useState<PreparedFxReview | null>(null),
    [loading, setLoading] = useState(false),
    [message, setMessage] = useState("");
  const quote = reviewedQuote?.quote;
  const preview = reviewedQuote?.preview;
  useEffect(() => {
    if (!reviewedQuote) return;
    const timer = setTimeout(
      () => {
        setReviewedQuote(null);
        setMessage("This exercise quote expired. Review a fresh conversion.");
      },
      Math.max(0, reviewedQuote.deadline - performance.now()),
    );
    return () => clearTimeout(timer);
  }, [reviewedQuote]);
  let sourceMinor: string | null = null;
  try {
    sourceMinor = parseMinor(amount, currency(from).exponent).toString();
  } catch {
    /* Invalid amounts cannot be reviewed. */
  }
  async function review() {
    setLoading(true);
    setMessage("");
    setReviewedQuote(null);
    try {
      if (!sourceMinor || BigInt(sourceMinor) <= 0n || from === to)
        throw Error(
          "Choose different currencies and a positive amount in the source currency’s precision.",
        );
      const requestStarted = performance.now();
      const result = await tradingRequest<{ quote: FxQuote }>(
        "/api/trading/fx-quotes",
        { accountId, fromCurrency: from, toCurrency: to },
      );
      const received = performance.now();
      const quoted = createFxReview(result.quote, requestStarted, received);
      setReviewedQuote({
        ...quoted,
        preview: previewFxReview(quoted, sourceMinor, accountId, received),
      });
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Could not load FX.");
    } finally {
      setLoading(false);
    }
  }
  return (
    <section
      className="panel fx-panel"
      aria-label="Virtual currency conversion"
    >
      <div className="panel-heading">
        <div>
          <span className="eyebrow">NATIVE CASH</span>
          <h2>Move between currencies.</h2>
        </div>
      </div>
      <div className="ticket-body">
        <div className="fx-pair">
          <label className="field">
            <span>From currency</span>
            <select
              value={from}
              disabled={blocked || loading}
              onChange={(event) => {
                setFrom(event.target.value as CurrencyCode);
                setReviewedQuote(null);
              }}
            >
              {currencies.map((item) => (
                <option key={item.code}>{item.code}</option>
              ))}
            </select>
          </label>
          <span aria-hidden="true">→</span>
          <label className="field">
            <span>To currency</span>
            <select
              value={to}
              disabled={blocked || loading}
              onChange={(event) => {
                setTo(event.target.value as CurrencyCode);
                setReviewedQuote(null);
              }}
            >
              {currencies.map((item) => (
                <option key={item.code}>{item.code}</option>
              ))}
            </select>
          </label>
        </div>
        <label className="field">
          <span>Amount to convert ({from})</span>
          <input
            value={amount}
            inputMode="decimal"
            disabled={blocked || loading}
            onChange={(event) => {
              setAmount(event.target.value);
              setReviewedQuote(null);
            }}
          />
        </label>
        {quote && preview && (
          <div className="order-review">
            <span className="eyebrow">YOU RECEIVE</span>
            <strong className="fx-credit">
              {formatMinor(preview.creditMinor, currency(to).exponent)} {to}
            </strong>
            <p className="small-copy">
              Fictional {quote.provider} · exact rate {quote.rateNumerator}/
              {quote.rateDenominator} {to} per {from}. Floor rounding;
              fractional target minor units are disclosed in the receipt. Quote
              expires at {quote.expiresAt.slice(11, 19)} UTC.
            </p>
            <button
              className="button primary full-width"
              disabled={blocked || loading}
              onClick={() => {
                setReviewedQuote(null);
                return execute("/api/trading/fx", {
                  accountId,
                  quoteId: quote.id,
                  sourceMinor,
                });
              }}
            >
              Confirm virtual conversion →
            </button>
          </div>
        )}
        <button
          className="button secondary full-width"
          onClick={review}
          disabled={blocked || loading}
        >
          {loading
            ? "Getting FX quote…"
            : quote
              ? "Refresh conversion quote"
              : "Review conversion"}
        </button>
        {message && (
          <p className="form-message error" role="alert">
            {message}
          </p>
        )}
        <p className="small-copy">
          A conversion moves existing virtual cash. Opening a wallet never
          creates funds. These fixed exercise rates are separate from the
          opening-grant policy.
        </p>
      </div>
    </section>
  );
}
