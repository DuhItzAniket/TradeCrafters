import Link from "next/link";
import { redirect, notFound } from "next/navigation";
import { readAccount } from "@tradecrafters/database";
import { portfolio, activity } from "@tradecrafters/database/trading";
import { accountId } from "@tradecrafters/contracts";
import { TradingFault } from "@tradecrafters/domain/trading";
import { scenarios } from "@tradecrafters/market-catalog/scenarios";
import { sessionForPage } from "@/lib/session";
import { TradingDesk } from "@/components/trading-desk";
export const metadata = { title: "Practice trading" };
export default async function TradingPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const session = await sessionForPage();
  if (
    !session ||
    (!session.user.emailVerified && process.env.AUTH_DEV_CREDENTIALS !== "true")
  )
    redirect("/sign-in");
  const params = await searchParams,
    active = await readAccount(session.user.id);
  if (!active)
    return (
      <section className="panel trading-onboarding">
        <span className="eyebrow">YOUR PRACTICE STARTS HERE</span>
        <h1>A considered trade starts with a funded account.</h1>
        <p>
          Choose a reporting currency and create your simulation account. Then
          practice with fictional listings across six regions.
        </p>
        <Link href="/account" className="button primary">
          Create your practice account →
        </Link>
      </section>
    );
  const parsed =
    params.account === undefined ? null : accountId.safeParse(params.account);
  if (parsed && !parsed.success) notFound();
  const id = parsed?.success ? parsed.data : active.id;
  const [view, feed] = await Promise.all([
    portfolio(session.user.id, id),
    activity(session.user.id, id),
  ]).catch((error: unknown) => {
    if (error instanceof TradingFault && error.status === 404) notFound();
    throw error;
  });
  const selected =
    scenarios.find((row) => row.id === params.listing) ??
    scenarios.find((row) => row.currency === view.reportingCurrency) ??
    scenarios[0];
  return (
    <>
      <section className="page-heading">
        <div>
          <span className="eyebrow">PRACTICE TRADING / SYNTHETIC LAB</span>
          <h1>Every trade tells a story.</h1>
          <p>
            Native capital, deliberate decisions, and a receipt for every
            outcome.
          </p>
        </div>
        <span className="synthetic-pill">Fictional prices · virtual funds</span>
      </section>
      <TradingDesk
        key={view.accountId}
        initial={view}
        initialActivity={feed}
        initialListingId={selected.id}
        ownerId={session.user.id}
      />
    </>
  );
}
