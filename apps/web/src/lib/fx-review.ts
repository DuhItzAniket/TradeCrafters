import {
  calculateFxConversion,
  fxQuoteSchema,
  type FxQuote,
} from "@tradecrafters/domain/fx";

export type FxReview = { quote: FxQuote; deadline: number };

// Preview timing is relative to the request's monotonic clock, never the user's
// wall clock. Charging the full round trip against TTL errs toward early expiry.
export function createFxReview(
  input: FxQuote,
  requestStarted: number,
  received: number,
): FxReview {
  const quote = fxQuoteSchema.parse(input);
  const deadline =
    requestStarted + Date.parse(quote.expiresAt) - Date.parse(quote.observedAt);
  if (
    ![requestStarted, received, deadline].every(Number.isFinite) ||
    requestStarted < 0 ||
    received < requestStarted ||
    received >= deadline
  )
    throw Error("The FX quote arrived too late. Review a fresh conversion.");
  return { quote, deadline };
}

export function previewFxReview(
  review: FxReview,
  sourceMinor: string,
  accountId: string,
  monotonicNow: number,
) {
  if (!Number.isFinite(monotonicNow) || monotonicNow >= review.deadline)
    throw Error("FX_REVIEW_EXPIRED");
  // Calculate an illustration at issuance. Execution still validates the stored
  // quote against the server's actual current time and account ownership.
  return calculateFxConversion(
    review.quote,
    { quoteId: review.quote.id, sourceMinor },
    accountId,
    new Date(review.quote.observedAt),
  );
}
