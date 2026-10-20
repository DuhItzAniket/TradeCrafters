import { currency, formatMinor } from "@tradecrafters/domain";
import type { OperationReceipt } from "@tradecrafters/domain/trading";
const money = (value: string, code: string) =>
  `${formatMinor(value, currency(code).exponent)} ${code}`;
export function OperationReceiptView({
  receipt,
}: {
  receipt: OperationReceipt;
}) {
  return (
    <section
      className={`panel receipt-panel ${receipt.status === "rejected" ? "receipt-rejected" : ""}`}
      aria-label="Operation receipt"
      aria-live="polite"
    >
      <div className="panel-heading">
        <div>
          <span className="eyebrow">SAVED RECEIPT</span>
          <h2>
            {receipt.status === "filled"
              ? "Order filled."
              : receipt.status === "converted"
                ? "Currencies converted."
                : receipt.status === "reset"
                  ? "New practice account ready."
                  : "Operation declined."}
          </h2>
        </div>
        <span className="synthetic-pill">{receipt.status}</span>
      </div>
      <div className="receipt-body">
        {receipt.status === "rejected" ? (
          <>
            <strong>{receipt.code.replaceAll("_", " ")}</strong>
            <p>{receipt.message}</p>
            <p className="small-copy">
              No money or inventory was changed by this operation. This outcome
              is saved against its original key.
            </p>
          </>
        ) : receipt.status === "filled" ? (
          <>
            <div className="receipt-primary">
              {receipt.order.side} {receipt.order.quantity}{" "}
              {receipt.order.symbol} <small>· {receipt.order.mic}</small>
            </div>
            <dl className="receipt-facts">
              <div>
                <dt>Execution price</dt>
                <dd>
                  {receipt.order.price} {receipt.order.quoteUnit}
                </dd>
              </div>
              <div>
                <dt>Native notional</dt>
                <dd>
                  {money(receipt.order.notionalMinor, receipt.order.currency)}
                </dd>
              </div>
              <div>
                <dt>Commission</dt>
                <dd>
                  {money(receipt.order.feesMinor, receipt.order.currency)}
                </dd>
              </div>
              {receipt.order.side === "SELL" && (
                <div>
                  <dt>Realized P&amp;L</dt>
                  <dd>
                    {money(receipt.order.realizedMinor, receipt.order.currency)}
                  </dd>
                </div>
              )}
              <div>
                <dt>Reference</dt>
                <dd>
                  {receipt.order.reference} {receipt.order.quoteUnit}
                </dd>
              </div>
              <div>
                <dt>Model</dt>
                <dd>{receipt.order.model} · 5 bps half-spread</dd>
              </div>
              <div>
                <dt>Cash rounding</dt>
                <dd>Half-even, on the whole order</dd>
              </div>
              <div>
                <dt>Source</dt>
                <dd>Project-owned synthetic fixture</dd>
              </div>
            </dl>
            <p className="small-copy">
              Market clock: {receipt.order.marketAt}. Quote observed{" "}
              {receipt.order.observedAt}. Instant virtual settlement; no
              exchange routing, market depth or real broker fee schedule.
            </p>
            <details>
              <summary>Provenance and journal references</summary>
              <dl className="receipt-facts">
                <div>
                  <dt>Snapshot</dt>
                  <dd>{receipt.order.snapshotId}</dd>
                </div>
                <div>
                  <dt>Policy</dt>
                  <dd>{receipt.order.policyId}</dd>
                </div>
                <div>
                  <dt>Journal</dt>
                  <dd>{receipt.order.journalId}</dd>
                </div>
                <div>
                  <dt>Scenario</dt>
                  <dd>{receipt.order.scenario}</dd>
                </div>
                <div>
                  <dt>Reporting FX</dt>
                  <dd>
                    {receipt.order.reportingFx.version} ·{" "}
                    {receipt.order.reportingFx.numerator}/
                    {receipt.order.reportingFx.denominator}{" "}
                    {receipt.order.reportingFx.to} per{" "}
                    {receipt.order.reportingFx.from}
                  </dd>
                </div>
                <div>
                  <dt>Rounding residual</dt>
                  <dd>
                    {receipt.order.roundingNumerator}/
                    {receipt.order.roundingDenominator} native minor units
                  </dd>
                </div>
              </dl>
            </details>
          </>
        ) : receipt.status === "converted" ? (
          <>
            <div className="receipt-primary">
              {money(
                receipt.conversion.debitMinor,
                receipt.conversion.fromCurrency,
              )}{" "}
              <small>→</small>{" "}
              {money(
                receipt.conversion.creditMinor,
                receipt.conversion.toCurrency,
              )}
            </div>
            <dl className="receipt-facts">
              <div>
                <dt>Exact rate</dt>
                <dd>
                  {receipt.conversion.rateNumerator}/
                  {receipt.conversion.rateDenominator}{" "}
                  {receipt.conversion.toCurrency} per{" "}
                  {receipt.conversion.fromCurrency}
                </dd>
              </div>
              <div>
                <dt>Source</dt>
                <dd>{receipt.conversion.provider} · fictional</dd>
              </div>
              <div>
                <dt>Target rounding</dt>
                <dd>
                  Floor · remainder {receipt.conversion.remainderNumerator}/
                  {receipt.conversion.remainderDenominator} target minor units
                </dd>
              </div>
              <div>
                <dt>Source journal</dt>
                <dd>{receipt.conversion.sourceJournalId}</dd>
              </div>
              <div>
                <dt>Target journal</dt>
                <dd>{receipt.conversion.targetJournalId}</dd>
              </div>
            </dl>
            <p className="small-copy">
              Each currency journal balances independently. Observed{" "}
              {receipt.conversion.observedAt}; these exercise rates are not
              current market FX.
            </p>
          </>
        ) : (
          <p>
            The old account and all its receipts remain archived. The
            replacement account receives one new fictional opening grant.
          </p>
        )}
        <div className="receipt-stamp">
          <span>
            {new Date(receipt.createdAt)
              .toISOString()
              .replace("T", " ")
              .slice(0, 19)}{" "}
            UTC
          </span>
          <span>Receipt {receipt.id}</span>
        </div>
      </div>
    </section>
  );
}
