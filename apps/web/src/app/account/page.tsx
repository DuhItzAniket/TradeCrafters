import { redirect } from "next/navigation";
import { readAccount } from "@tradecrafters/database";
import { sessionForPage } from "@/lib/session";
import { Account } from "@/components/account";
export const metadata = { title: "Account & wallets" };
export default async function AccountPage() {
  const session = await sessionForPage();
  if (!session) redirect("/sign-in");
  return (
    <>
      <section className="page-heading">
        <div>
          <span className="eyebrow">VIRTUAL CAPITAL / REAL CURIOSITY</span>
          <h1>Your practice capital.</h1>
          <p>
            Native balances, one opening grant, and a record you can follow.
          </p>
        </div>
        <span className="synthetic-pill">Synthetic account</span>
      </section>
      <Account
        initial={await readAccount(session.user.id)}
        name={session.user.name}
        verified={session.user.emailVerified}
      />
    </>
  );
}
