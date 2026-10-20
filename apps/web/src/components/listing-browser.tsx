"use client";
import Link from "next/link";
import { useState, useEffect, useSyncExternalStore, useCallback } from "react";
import { scenarios } from "@tradecrafters/market-catalog/scenarios";
import {
  filterTrainingListings,
  type ListingFilters,
} from "@tradecrafters/domain/workbench";
export type VenueSelection = {
  mic: string;
  name: string;
  country: string;
  sourceStatus: string;
  classification: string;
  operatingMic: string;
};
// Fixed fixture labels keep SSR stable across Node/Chromium ICU versions.
const countryLabels: Record<string, string> = {
  US: "United States",
  GB: "United Kingdom",
  IN: "India",
  JP: "Japan",
  HK: "Hong Kong",
  AU: "Australia",
  ZA: "South Africa",
  BR: "Brazil",
  SA: "Saudi Arabia",
  KW: "Kuwait",
};
const names = { of: (code: string) => countryLabels[code] ?? code };
const defaults: ListingFilters = {
  q: "",
  region: "",
  country: "",
  currency: "",
  mic: "",
  pinnedOnly: false,
};
function subscribe(listener: () => void) {
  window.addEventListener("tc-watchlist", listener);
  window.addEventListener("storage", listener);
  return () => {
    window.removeEventListener("tc-watchlist", listener);
    window.removeEventListener("storage", listener);
  };
}
function RealVenues({
  q,
  country,
  page,
  onPage,
  selected,
  onSelect,
}: {
  q: string;
  country: string;
  page: number;
  onPage: (page: number) => void;
  selected: string | null;
  onSelect: (venue: VenueSelection) => void;
}) {
  const [result, setResult] = useState<{
    records: VenueSelection[];
    total: number;
    source: { publishedOn: string };
  } | null>(null);
  const [error, setError] = useState("");
  useEffect(() => {
    const controller = new AbortController();
    async function load() {
      try {
        const params = new URLSearchParams({
          q,
          page: String(page),
          ...(country ? { country } : {}),
        });
        const response = await fetch(`/api/directory?${params}`, {
          signal: controller.signal,
          cache: "no-store",
        });
        if (!response.ok)
          throw Error(
            "Venue reference is unavailable. Your funded account is unaffected.",
          );
        const value = await response.json();
        if (!controller.signal.aborted) setResult(value);
      } catch (error) {
        if (!controller.signal.aborted)
          setError(
            error instanceof Error ? error.message : "Could not load venues.",
          );
      }
    }
    void load();
    return () => controller.abort();
  }, [q, country, page]);
  if (error)
    return (
      <p className="browser-note" role="alert">
        {error} Change filters or reopen the directory to retry.
      </p>
    );
  if (!result)
    return (
      <p className="browser-note" role="status">
        Loading worldwide reference…
      </p>
    );
  return (
    <>
      <p className="browser-note" role="status">
        {result.total.toLocaleString("en")} reference records · snapshot{" "}
        {result.source.publishedOn}. Listings and trading rights are unverified.
      </p>
      <div className="listing-results">
        {result.records.map((venue) => (
          <button
            key={venue.mic}
            className="venue-result"
            aria-pressed={selected === venue.mic}
            onClick={() => onSelect(venue)}
          >
            <strong>
              {venue.mic} <small>{venue.country}</small>
            </strong>
            <span>{venue.name}</span>
            <small>Not connected · {venue.sourceStatus}</small>
          </button>
        ))}
        {!result.records.length && (
          <p className="browser-note">
            No reference matches. Try a country code or MIC.
          </p>
        )}
      </div>
      <div className="browser-pages">
        <button
          disabled={page === 1}
          onClick={() => onPage(page - 1)}
          aria-label="Previous venue page"
        >
          ←
        </button>
        <span>
          {page} / {Math.max(1, Math.ceil(result.total / 30))}
        </span>
        <button
          disabled={page * 30 >= result.total}
          onClick={() => onPage(page + 1)}
          aria-label="Next venue page"
        >
          →
        </button>
      </div>
    </>
  );
}
export function ListingBrowser({
  ownerId,
  selectedId,
  venue,
  onSelect,
  onVenue,
}: {
  ownerId: string;
  selectedId: string;
  venue: VenueSelection | null;
  onSelect: (id: string) => void;
  onVenue: (venue: VenueSelection) => void;
}) {
  const [open, setOpen] = useState(false),
    [mode, setMode] = useState<"practice" | "reference">(
      venue ? "reference" : "practice",
    ),
    [filters, setFilters] = useState({ ...defaults, q: venue?.mic ?? "" }),
    [realQuery, setRealQuery] = useState({
      q: venue?.mic ?? "",
      country: "",
      page: 1,
      revision: 0,
    }),
    [storageError, setStorageError] = useState("");
  const key = `tradecrafters.watchlist.v1.${ownerId}`;
  const snapshot = useCallback(() => {
    try {
      return localStorage.getItem(key);
    } catch {
      return null;
    }
  }, [key]);
  const raw = useSyncExternalStore(subscribe, snapshot, () => null);
  let pins: string[] = [scenarios[0].id, scenarios[1].id, scenarios[3].id];
  if (raw)
    try {
      const value = JSON.parse(raw);
      if (
        Array.isArray(value) &&
        value.length <= 10 &&
        value.every(
          (id) => typeof id === "string" && scenarios.some((s) => s.id === id),
        )
      )
        pins = [...new Set(value)];
    } catch {
      /* Ignore invalid browser preferences. */
    }
  const filtered = filterTrainingListings(scenarios, filters, pins);
  function pin(id: string) {
    try {
      localStorage.setItem(
        key,
        JSON.stringify(
          pins.includes(id) ? pins.filter((p) => p !== id) : [...pins, id],
        ),
      );
      window.dispatchEvent(new Event("tc-watchlist"));
      setStorageError("");
    } catch {
      setStorageError("This browser could not save your watchlist.");
    }
  }
  function update(field: keyof ListingFilters, value: string | boolean) {
    setFilters({ ...filters, [field]: value });
  }
  const current = venue
    ? venue.mic
    : scenarios.find((s) => s.id === selectedId)?.symbol;
  return (
    <section
      className={`listing-browser ${open ? "browser-open" : ""}`}
      aria-label="Market discovery"
    >
      <button
        className="browser-toggle"
        aria-expanded={open}
        aria-controls="discovery-controls"
        onClick={() => setOpen(!open)}
      >
        Find a listing{" "}
        <span>
          {current} · {open ? "Close −" : "Browse +"}
        </span>
      </button>
      <div className="browser-content" id="discovery-controls">
        <div className="browser-heading">
          <span className="eyebrow">DISCOVER</span>
          <strong>Choose your market.</strong>
        </div>
        <label className="field">
          <span>Data capability</span>
          <select
            value={mode}
            onChange={(e) => {
              setMode(e.target.value as typeof mode);
              setFilters(defaults);
              setRealQuery({ q: "", country: "", page: 1, revision: 0 });
            }}
          >
            <option value="practice">Fictional practice · 10 listings</option>
            <option value="reference">Real venues · not connected</option>
          </select>
        </label>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            if (mode === "reference")
              setRealQuery({
                q: filters.q,
                country: filters.country,
                page: 1,
                revision: realQuery.revision + 1,
              });
          }}
        >
          <label className="field">
            <span>
              {mode === "practice"
                ? "Company / symbol / MIC"
                : "Venue / MIC / city"}
            </span>
            <input
              maxLength={80}
              value={filters.q}
              onChange={(e) => update("q", e.target.value)}
              placeholder={
                mode === "practice"
                  ? "Try ATLS or XLON"
                  : "Search worldwide venues"
              }
            />
          </label>
          {mode === "practice" ? (
            <details className="discovery-filters">
              <summary>Region, country & currency</summary>
              <label className="field">
                <span>Region</span>
                <select
                  value={filters.region}
                  onChange={(e) => update("region", e.target.value)}
                >
                  <option value="">All regions</option>
                  {[...new Set(scenarios.map((s) => s.region))].map(
                    (region) => (
                      <option key={region}>{region}</option>
                    ),
                  )}
                </select>
              </label>
              <label className="field">
                <span>Country / territory</span>
                <select
                  value={filters.country}
                  onChange={(e) => update("country", e.target.value)}
                >
                  <option value="">All scenario countries</option>
                  {[...new Set(scenarios.map((s) => s.country))].map((code) => (
                    <option key={code} value={code}>
                      {names.of(code)} ({code})
                    </option>
                  ))}
                </select>
              </label>
              <label className="field">
                <span>Settlement currency</span>
                <select
                  value={filters.currency}
                  onChange={(e) => update("currency", e.target.value)}
                >
                  <option value="">All native currencies</option>
                  {[...new Set(scenarios.map((s) => s.currency))].map(
                    (code) => (
                      <option key={code}>{code}</option>
                    ),
                  )}
                </select>
              </label>
              <label className="field">
                <span>Exchange MIC</span>
                <select
                  value={filters.mic}
                  onChange={(e) => update("mic", e.target.value)}
                >
                  <option value="">All scenario venues</option>
                  {scenarios.map((s) => (
                    <option key={s.mic}>{s.mic}</option>
                  ))}
                </select>
              </label>
            </details>
          ) : (
            <>
              <label className="field">
                <span>Country code (optional)</span>
                <input
                  maxLength={2}
                  minLength={2}
                  pattern="[A-Z]{2}"
                  value={filters.country}
                  onChange={(e) =>
                    update(
                      "country",
                      e.target.value.toUpperCase().replace(/[^A-Z]/g, ""),
                    )
                  }
                  placeholder="e.g. GB"
                />
              </label>
              <button className="button secondary full-width" type="submit">
                Find real venues
              </button>
              <p className="browser-note">
                Trading currency and regional coverage are not verified for this
                reference. Search by country or MIC; unknown venues stay
                visible.
              </p>
            </>
          )}
        </form>
        {mode === "practice" ? (
          <>
            <div
              className="browser-tabs"
              role="group"
              aria-label="Listing collection"
            >
              <button
                aria-pressed={!filters.pinnedOnly}
                onClick={() => update("pinnedOnly", false)}
              >
                All listings
              </button>
              <button
                aria-pressed={filters.pinnedOnly}
                onClick={() => update("pinnedOnly", true)}
              >
                Watchlist · {pins.length}
              </button>
            </div>
            <p className="browser-note" role="status">
              {filtered.length} / 10 fictional listings. Selected chart stays in
              view when filters change.
            </p>
            <div className="listing-results">
              {filtered.map((row) => (
                <div className="discovery-row" key={row.id}>
                  <button
                    aria-pressed={!venue && selectedId === row.id}
                    onClick={() => {
                      onSelect(row.id);
                      setOpen(false);
                    }}
                  >
                    <span>
                      <strong>{row.symbol}</strong>
                      <small>
                        {row.mic} · {row.currency}
                      </small>
                    </span>
                    <span>
                      {row.name}
                      <small>{names.of(row.country)}</small>
                    </span>
                  </button>
                  <button
                    className="pin-button"
                    aria-label={`${pins.includes(row.id) ? "Unpin" : "Pin"} ${row.symbol} ${row.mic}`}
                    aria-pressed={pins.includes(row.id)}
                    onClick={() => pin(row.id)}
                  >
                    {pins.includes(row.id) ? "★" : "☆"}
                  </button>
                </div>
              ))}
              {!filtered.length && (
                <div className="browser-empty">
                  <strong>No matching listing.</strong>
                  <button
                    className="text-button"
                    onClick={() => setFilters(defaults)}
                  >
                    Clear filters
                  </button>
                </div>
              )}
            </div>
            <p className="browser-note">
              Watchlist saved on this browser for your account. Separate venues
              keep separate identities.
            </p>
          </>
        ) : (
          <RealVenues
            key={`${realQuery.q}:${realQuery.country}:${realQuery.page}:${realQuery.revision}`}
            {...realQuery}
            selected={venue?.mic ?? null}
            onPage={(page) => setRealQuery({ ...realQuery, page })}
            onSelect={(value) => {
              onVenue(value);
              setOpen(false);
            }}
          />
        )}
        {storageError && (
          <p role="status" className="browser-note">
            {storageError}
          </p>
        )}
        <Link href="/directory" className="source-link browser-directory">
          Full worldwide reference ↗
        </Link>
      </div>
    </section>
  );
}
