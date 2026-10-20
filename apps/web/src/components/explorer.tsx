"use client";
import { useState } from "react";
import Link from "next/link";
import { ListingRules } from "./listing-rules";
import { scenarios } from "@tradecrafters/market-catalog/scenarios";
import { formatMinor, quoteToMinor, currency } from "@tradecrafters/domain";

const regions = [
  "All regions",
  "Americas",
  "Europe",
  "Asia",
  "Oceania",
  "Africa",
  "Middle East",
];
const countryNames = new Intl.DisplayNames(["en"], { type: "region" });
const contours = [
  "0,64 16,61 32,69 48,51 64,55 80,38 96,45 112,32 128,35 144,20 160,25 176,17 192,24 208,10 224,16 240,4",
  "0,14 16,24 32,15 48,32 64,28 80,36 96,19 112,26 128,42 144,35 160,53 176,48 192,44 208,61 224,50 240,60",
];
function Sparkline({
  down = false,
  large = false,
}: {
  down?: boolean;
  large?: boolean;
}) {
  return (
    <svg
      className={large ? "scenario-chart" : "sparkline"}
      viewBox="0 0 240 80"
      role="img"
      aria-label={`Illustrative fictional ${down ? "falling" : "rising"} price path, not historical market data`}
      preserveAspectRatio="none"
    >
      <path
        d={large ? "M0 20H240M0 40H240M0 60H240" : ""}
        stroke="currentColor"
        className="chart-grid"
        fill="none"
      />
      <polyline
        points={contours[down ? 1 : 0]}
        fill="none"
        stroke="currentColor"
        strokeWidth={large ? "1.5" : "3"}
        vectorEffect="non-scaling-stroke"
      />
    </svg>
  );
}
export function Explorer() {
  const [region, setRegion] = useState("All regions");
  const [search, setSearch] = useState("");
  const [selectedId, setSelectedId] = useState<string>(scenarios[0].id);
  const filtered = scenarios.filter(
    (item) =>
      (region === "All regions" || item.region === region) &&
      `${item.name} ${item.symbol} ${item.mic} ${item.currency} ${countryNames.of(item.country)}`
        .toLowerCase()
        .includes(search.toLowerCase()),
  );
  const selected =
    filtered.find((item) => item.id === selectedId) ||
    filtered[0] ||
    scenarios.find((item) => item.id === selectedId)!;
  const down = selected.change.startsWith("−");
  const settlement = currency(selected.currency);
  const nativeMinor = quoteToMinor(
    selected.price,
    Math.max(selected.price.split(".")[1]?.length || 0, 0),
    BigInt(selected.unitNumerator),
    BigInt(selected.unitDenominator),
    settlement.exponent,
  );
  return (
    <>
      <section className="page-heading">
        <div>
          <span className="eyebrow">DISCOVER / COMPARE / LEARN</span>
          <h1>A world of markets.</h1>
          <p>Different exchanges. Different currencies. One place to learn.</p>
        </div>
        <Link href="/account" className="button primary">
          Set up virtual funds <span aria-hidden="true">↗</span>
        </Link>
      </section>
      <div className="context-strip">
        <span className="context-icon" aria-hidden="true">
          ◈
        </span>
        <p>
          <strong>You’re in the synthetic lab.</strong> Companies, listings,
          prices and FX rates here are fictional. Real exchange data is not
          connected.
        </p>
        <span className="version-tag">FOUNDATION 0.1</span>
      </div>
      <section className="overview-grid" aria-label="Current coverage">
        <div className="overview-cell">
          <span>Regional scenarios</span>
          <strong>
            10 <small>fictional listings</small>
          </strong>
          <div className="mini-bars" aria-hidden="true">
            <i />
            <i />
            <i />
            <i />
            <i />
            <i />
          </div>
        </div>
        <div className="overview-cell">
          <span>Explore across</span>
          <strong>
            06 <small>world regions</small>
          </strong>
          <p>Americas to Oceania</p>
        </div>
        <div className="overview-cell">
          <span>Real-data integrations</span>
          <strong>
            00 <small>verified venues</small>
          </strong>
          <Link href="/directory">
            See the worldwide directory <span aria-hidden="true">↗</span>
          </Link>
        </div>
      </section>
      <div className="explorer-grid">
        <section
          className="panel market-panel"
          aria-labelledby="markets-heading"
        >
          <div className="panel-heading">
            <div>
              <span className="eyebrow">THE EXPLORER</span>
              <h2 id="markets-heading">Find your next perspective</h2>
            </div>
            <span className="count-label">{filtered.length} / 10</span>
          </div>
          <div
            className="filter-row"
            role="group"
            aria-label="Filter scenarios by region"
          >
            {regions.map((name) => (
              <button
                key={name}
                onClick={() => setRegion(name)}
                aria-pressed={region === name}
                className="filter-chip"
              >
                {name}
              </button>
            ))}
          </div>
          <div className="search-field">
            <span aria-hidden="true">⌕</span>
            <input
              aria-label="Search fictional listings"
              placeholder="Search company, symbol, exchange or currency"
              value={search}
              maxLength={80}
              onChange={(event) => setSearch(event.target.value)}
            />
          </div>
          <div className="market-table-head" aria-hidden="true">
            <span>COMPANY / VENUE</span>
            <span>SCENARIO PRICE</span>
            <span>ILLUSTRATION</span>
          </div>
          <div className="market-list">
            {filtered.map((item, index) => (
              <button
                key={item.id}
                className={`market-row ${selected.id === item.id ? "selected" : ""}`}
                aria-pressed={selected.id === item.id}
                onClick={() => setSelectedId(item.id)}
              >
                <span
                  className={`company-monogram monogram-${index % 4}`}
                  aria-hidden="true"
                >
                  {item.symbol.slice(0, 2)}
                </span>
                <span className="company-text">
                  <strong>{item.name}</strong>
                  <small>
                    {item.symbol} <span>·</span> {item.mic} <span>·</span>{" "}
                    {item.country}
                  </small>
                </span>
                <span className="market-price">
                  <strong>
                    {item.price} <small>{item.quoteUnit}</small>
                  </strong>
                  <span
                    className={
                      item.change.startsWith("−") ? "negative" : "positive"
                    }
                  >
                    {item.change}%
                  </span>
                </span>
                <span
                  className={
                    item.change.startsWith("−")
                      ? "negative chart-cell"
                      : "positive chart-cell"
                  }
                >
                  <Sparkline down={item.change.startsWith("−")} />
                </span>
                <span className="row-arrow" aria-hidden="true">
                  ↗
                </span>
              </button>
            ))}
            {filtered.length === 0 && (
              <div className="empty-state">
                <strong>No matching scenario</strong>
                <p>
                  Try another company, venue or region. The full MIC reference
                  is in Venue directory.
                </p>
                <button
                  className="text-button"
                  onClick={() => {
                    setRegion("All regions");
                    setSearch("");
                  }}
                >
                  Clear filters
                </button>
              </div>
            )}
          </div>
          <div className="panel-footnote">
            All scenario values are static illustrations. These are not real
            exchange listings or historical returns.
          </div>
        </section>
        <aside className="detail-column" aria-label="Selected scenario">
          <section className="panel detail-panel">
            <div className="detail-topline">
              <span className="eyebrow">SCENARIO SPOTLIGHT</span>
              <span className="synthetic-pill">Fictional</span>
            </div>
            <div className="detail-company">
              <span
                className="company-monogram large-monogram"
                aria-hidden="true"
              >
                {selected.symbol.slice(0, 2)}
              </span>
              <div>
                <h2>{selected.name}</h2>
                <p>
                  {selected.symbol} · {selected.mic}
                </p>
              </div>
            </div>
            <div className="spotlight-price">
              {selected.price}
              <span>{selected.quoteUnit}</span>
            </div>
            <div
              className={`spotlight-change ${down ? "negative" : "positive"}`}
            >
              {selected.change}% <span>illustrative change</span>
            </div>
            <div className={down ? "negative" : "positive"}>
              <Sparkline down={down} large />
            </div>
            <div className="chart-caption">
              <span>Illustrative path</span>
              <span>No time-series feed</span>
            </div>
            <dl className="listing-facts">
              <div>
                <dt>Market</dt>
                <dd>{countryNames.of(selected.country)}</dd>
              </div>
              <div>
                <dt>Venue timezone</dt>
                <dd>{selected.timezone}</dd>
              </div>
              <div>
                <dt>Settlement</dt>
                <dd>
                  {formatMinor(nativeMinor, settlement.exponent)}{" "}
                  {selected.currency}
                </dd>
              </div>
              <div>
                <dt>Scenario lot</dt>
                <dd>
                  {selected.lot} {selected.lot === 1 ? "share" : "shares"}
                </dd>
              </div>
              <div>
                <dt>Quote unit</dt>
                <dd>
                  {selected.quoteUnit}
                  {selected.unitDenominator === "100" ? " (minor unit)" : ""}
                </dd>
              </div>
            </dl>
            <div className="execution-note">
              <span aria-hidden="true">◷</span>
              <p>
                <strong>A fictional session, ready to practice.</strong> Trade
                at 10:15 venue-local time on 20 October 2026. Reference prices
                and the clock are project-owned training fixtures.
              </p>
            </div>
            <Link
              href={`/trading?listing=${selected.id}`}
              className="button secondary full-width"
            >
              Practice this listing <span aria-hidden="true">→</span>
            </Link>
          </section>
          <ListingRules
            key={selected.id}
            listingId={selected.id}
            quoteUnit={selected.quoteUnit}
          />
          <section className="global-note">
            <span className="eyebrow">GLOBAL BY DESIGN</span>
            <h3>A ticker isn’t an identity.</h3>
            <p>
              ATLS in London and ATLS in Australia are separate fictional
              securities. Every listing keeps its own venue, currency and quote
              unit.
            </p>
            <Link href="/directory">
              Explore venue identities <span aria-hidden="true">↗</span>
            </Link>
          </section>
        </aside>
      </div>
    </>
  );
}
