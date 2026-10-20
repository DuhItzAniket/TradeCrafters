import Link from "next/link";
import { directoryQuery } from "@tradecrafters/contracts";
import { directory } from "@tradecrafters/database";
import { directorySource, micDirectory } from "@tradecrafters/market-catalog";
export const metadata = { title: "Worldwide venue directory" };
const names = new Intl.DisplayNames(["en"], { type: "region" });
const countries = [...new Set(micDirectory.map((row) => row.country))]
  .filter((code) => /^[A-Z]{2}$/.test(code))
  .sort((a, b) => (names.of(a) || a).localeCompare(names.of(b) || b));
export default async function DirectoryPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const raw = await searchParams;
  const values = Object.fromEntries(
    Object.entries(raw).filter(([, value]) => value !== ""),
  );
  const parsed = directoryQuery.safeParse(values);
  const query = parsed.success ? parsed.data : { q: "", page: 1 };
  const data = await directory(query);
  const href = (page: number) => {
    const params = new URLSearchParams({
      q: query.q,
      page: String(page),
      ...(query.country ? { country: query.country } : {}),
      ...(query.kind ? { kind: query.kind } : {}),
    });
    return `/directory?${params}`;
  };
  return (
    <>
      <section className="page-heading">
        <div>
          <span className="eyebrow">GLOBAL REFERENCE / ISO 10383</span>
          <h1>Every venue has an identity.</h1>
          <p>
            A worldwide reference directory, with coverage gaps kept visible.
          </p>
        </div>
        <span className="large-number">
          2,889<small>MIC records</small>
        </span>
      </section>
      <div className="context-strip">
        <span className="context-icon" aria-hidden="true">
          ◈
        </span>
        <p>
          <strong>Dated reference snapshot.</strong> Published 12 October 2026;
          changes effective 26 October 2026. Includes non-equity facilities and
          expired MICs. Source status below is the snapshot status, not current
          trading eligibility.
        </p>
      </div>
      <section className="panel directory-panel">
        <div className="panel-heading">
          <div>
            <span className="eyebrow">VENUE DIRECTORY</span>
            <h2>Find a market identifier</h2>
          </div>
          <a
            href={directorySource.url}
            target="_blank"
            rel="noreferrer"
            className="source-link"
          >
            Official source ↗
          </a>
        </div>
        {!parsed.success && (
          <p className="form-message error" role="alert">
            Those filters were invalid. Showing the unfiltered directory.
          </p>
        )}
        <form className="directory-filters" action="/directory" method="get">
          <label className="field">
            <span>Search</span>
            <input
              name="q"
              defaultValue={query.q}
              maxLength={80}
              placeholder="Venue name, MIC or city"
            />
          </label>
          <label className="field">
            <span>Country / territory</span>
            <select name="country" defaultValue={query.country || ""}>
              <option value="">All countries / territories</option>
              {countries.map((code) => (
                <option key={code} value={code}>
                  {names.of(code)} ({code})
                </option>
              ))}
            </select>
          </label>
          <label className="field">
            <span>Identifier type</span>
            <select name="kind" defaultValue={query.kind || ""}>
              <option value="">Operating &amp; segment</option>
              <option value="OPRT">Operating MIC</option>
              <option value="SGMT">Segment MIC</option>
            </select>
          </label>
          <button className="button primary" type="submit">
            Find venues
          </button>
        </form>
        <div className="directory-summary">
          <span>
            <strong>{data.total.toLocaleString("en")}</strong> matching records
          </span>
          <span className="muted">Real simulation rights: unverified</span>
        </div>
        <div className="table-scroll">
          <table className="directory-table">
            <caption className="sr-only">
              ISO MIC reference records from the upcoming October 2026 snapshot.
              Real data and trading coverage are unverified.
            </caption>
            <thead>
              <tr>
                <th scope="col">MIC / Parent</th>
                <th scope="col">Venue / facility</th>
                <th scope="col">Country</th>
                <th scope="col">Type</th>
                <th scope="col">Snapshot status</th>
              </tr>
            </thead>
            <tbody>
              {data.records.map((row) => (
                <tr key={row.mic}>
                  <td>
                    <strong className="mono">{row.mic}</strong>
                    <small>{row.operatingMic}</small>
                  </td>
                  <td>
                    <strong>{row.name}</strong>
                    <small>
                      {row.city} · Category {row.category}
                    </small>
                  </td>
                  <td>
                    {names.of(row.country) || row.country}
                    <small>{row.country}</small>
                  </td>
                  <td>{row.kind === "OPRT" ? "Operating" : "Segment"}</td>
                  <td>
                    <span
                      className={`registry-status ${row.sourceStatus === "ACTIVE" ? "" : "expired"}`}
                    >
                      {row.sourceStatus}
                    </span>
                    <small>Data rights unknown</small>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {data.total === 0 && (
          <div className="empty-state">
            <h3>No matching records</h3>
            <p>Try a broader search or another country.</p>
            <Link href="/directory">Reset filters →</Link>
          </div>
        )}
        <div className="pagination">
          <span>
            Page {data.page} of{" "}
            {Math.max(1, Math.ceil(data.total / data.pageSize))}
          </span>
          <div>
            {data.page > 1 && (
              <Link className="button secondary" href={href(data.page - 1)}>
                ← Previous
              </Link>
            )}
            {data.page * data.pageSize < data.total && (
              <Link className="button secondary" href={href(data.page + 1)}>
                Next →
              </Link>
            )}
          </div>
        </div>
      </section>
      <p className="directory-disclosure">
        Source: ISO 10383 Registration Authority (SWIFT), retrieved 20 October
        2026. A MIC identifies a facility; it does not prove that it is a
        cash-equity exchange or that TradeCrafters can display its prices.
        Cash-equity classification, provider coverage and effective-dated review
        remain open in{" "}
        <a href="https://github.com/DuhItzAniket/TradeCrafters/issues/9">
          issue #9 ↗
        </a>
        .
      </p>
    </>
  );
}
