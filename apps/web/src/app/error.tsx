"use client";
export default function ErrorPage({ reset }: { reset: () => void }) {
  return (
    <section className="panel empty-state">
      <span className="eyebrow">CONNECTION INTERRUPTED</span>
      <h1>We couldn’t load this workspace.</h1>
      <p>
        Your saved account stays in the database. Try again once the service is
        available.
      </p>
      <button className="button primary" onClick={reset}>
        Try again
      </button>
    </section>
  );
}
