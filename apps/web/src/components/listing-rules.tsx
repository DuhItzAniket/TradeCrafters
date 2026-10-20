"use client";
import { useEffect, useState } from "react";
import type { ListingPolicyView } from "@tradecrafters/database/policies";

export function ListingRules({
  listingId,
  quoteUnit,
}: {
  listingId: string;
  quoteUnit: string;
}) {
  const [view, setView] = useState<ListingPolicyView | null>(null);
  const [error, setError] = useState("");
  const [revision, setRevision] = useState(0);
  useEffect(() => {
    const controller = new AbortController();
    async function load() {
      try {
        const response = await fetch(
          `/api/listings/${encodeURIComponent(listingId)}/policy`,
          { signal: controller.signal, cache: "no-store" },
        );
        const data = await response.json();
        if (!response.ok)
          throw Error(data.error?.message || "Scenario rules are unavailable.");
        if (!controller.signal.aborted) setView(data);
      } catch (error) {
        if (!controller.signal.aborted)
          setError(
            error instanceof Error
              ? error.message
              : "Scenario rules are unavailable.",
          );
      }
    }
    void load();
    return () => controller.abort();
  }, [listingId, revision]);
  const policy = view?.policy;
  const sessions = view?.session?.sessions ?? [];
  return (
    <section
      className="panel listing-rules"
      aria-label="Fictional scenario rules"
    >
      <div className="rule-heading">
        <span className="eyebrow">SCENARIO RULES</span>
        <span className="synthetic-pill">Fictional calendar</span>
      </div>
      <h3>
        {view?.session
          ? `${view.session.phase.replaceAll("_", " ")} session`
          : "Know the local rules"}
      </h3>
      {error ? (
        <p role="status">{error}</p>
      ) : !view ? (
        <p role="status">Loading the scenario’s calendar and rules…</p>
      ) : (
        <>
          <p className="rule-status" role="status">
            {view.message}
          </p>
          {policy && (
            <>
              <dl className="rule-facts">
                <div>
                  <dt>Local clock</dt>
                  <dd>
                    {view.session?.localTime ?? "—"} ·{" "}
                    {policy.calendar.timezone}
                  </dd>
                </div>
                <div>
                  <dt>Board lot</dt>
                  <dd>
                    {policy.rules.boardLot}{" "}
                    {policy.rules.boardLot === "1" ? "share" : "shares"}
                  </dd>
                </div>
                <div>
                  <dt>Trading week</dt>
                  <dd>
                    {policy.calendar.weekdays
                      .map(
                        (day) =>
                          ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"][
                            day
                          ],
                      )
                      .join(", ")}
                  </dd>
                </div>
                <div>
                  <dt>Quote tick</dt>
                  <dd>
                    {policy.rules.ticks
                      .map(
                        (row) =>
                          `${row.step} ${quoteUnit}${row.to ? ` below ${row.to}` : row.from !== "0" ? ` from ${row.from}` : ""}`,
                      )
                      .join("; ")}
                  </dd>
                </div>
                <div>
                  <dt>Fixture price band</dt>
                  <dd>
                    {policy.rules.priceBand.lower}–
                    {policy.rules.priceBand.upper} {quoteUnit}
                  </dd>
                </div>
              </dl>
              <ul
                className="rule-sessions"
                aria-label="Current fictional trading-day sessions"
              >
                {sessions.map((row, index) => (
                  <li key={index}>
                    <span>{row.kind}</span>
                    <strong>
                      {row.start}–{row.end}
                      {row.endDayOffset ? " (+1 day)" : ""}
                    </strong>
                  </li>
                ))}
              </ul>
              {sessions.length === 0 && (
                <p className="small-copy">No sessions for this training day.</p>
              )}
              {view.session?.exceptionReason && (
                <p className="small-copy">{view.session.exceptionReason}</p>
              )}
              <p className="small-copy">
                Calendar: {policy.calendar.coverageFrom}–
                {new Date(
                  Date.parse(`${policy.calendar.coverageTo}T00:00:00Z`) -
                    86400000,
                )
                  .toISOString()
                  .slice(0, 10)}
                . Holiday and early-close dates are fictional.
              </p>
            </>
          )}
          <p className="small-copy">
            This check uses the current wall clock. Practice trading uses a
            fixed training clock at 10:15 local time on 20 October 2026. Checked{" "}
            {view.checkedAt.slice(11, 19)} UTC. Real exchange calendars and
            prices remain unverified.
          </p>
        </>
      )}
      <button
        className="text-button"
        onClick={() => {
          setError("");
          setView(null);
          setRevision((value) => value + 1);
        }}
      >
        Refresh rule check
      </button>
    </section>
  );
}
