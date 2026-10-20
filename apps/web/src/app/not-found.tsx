import Link from "next/link";
export default function NotFound() {
  return (
    <section className="panel empty-state">
      <span className="eyebrow">404 / OUTSIDE THE DIRECTORY</span>
      <h1>This page isn’t in the lab.</h1>
      <p>Return to the explorer to find a market.</p>
      <Link href="/" className="button primary">
        Back to the explorer →
      </Link>
    </section>
  );
}
