"use client";
import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  currencies,
  formatMinor,
  openingGrant,
  type CurrencyCode,
} from "@tradecrafters/domain";
import type { SimulationAccount } from "@tradecrafters/database";
import { authClient } from "@/lib/auth-client";

export function Account({
  initial,
  name,
  verified,
}: {
  initial: SimulationAccount | null;
  name: string;
  verified: boolean;
}) {
  const [account, setAccount] = useState(initial);
  const [reporting, setReporting] = useState<CurrencyCode>("USD");
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState("");
  const router = useRouter();
  async function mutate(path: string, body: unknown) {
    setPending(true);
    setMessage("");
    try {
      const response = await fetch(path, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const result = await response.json();
      if (!response.ok) {
        setMessage(result.error?.message || "Could not save the change.");
        return;
      }
      setAccount(result.account);
      setMessage(
        path === "/api/account"
          ? "Account ready. Your opening grant is recorded."
          : "Wallet ready. Adding a wallet does not add funds.",
      );
      router.refresh();
    } catch {
      setMessage(
        "The result could not be confirmed. Reload to check your saved account before trying again.",
      );
    } finally {
      setPending(false);
    }
  }
  async function addWallet(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    await mutate("/api/wallets", {
      currency: new FormData(event.currentTarget).get("currency"),
    });
  }
  async function signOut() {
    setPending(true);
    setMessage("");
    try {
      const result = await authClient.signOut();
      if (result.error) setMessage("Could not sign out. Try again.");
      else {
        router.replace("/sign-in");
        router.refresh();
      }
    } catch {
      setMessage("Could not sign out. Try again.");
    } finally {
      setPending(false);
    }
  }
  const missing = currencies.filter(
    (item) => !account?.wallets.some((wallet) => wallet.currency === item.code),
  );
  const grant = openingGrant(reporting);
  return (
    <div className="account-grid">
      <section className="panel account-panel">
        <div className="panel-heading">
          <div>
            <span className="eyebrow">PERSONAL SIMULATION</span>
            <h2>
              {account
                ? "Native currency wallets"
                : "Start with a clean balance"}
            </h2>
          </div>
          <span className="mono muted">
            {account ? "01 ACCOUNT" : "NEW ACCOUNT"}
          </span>
        </div>
        {!account ? (
          <div className="account-onboarding">
            <p>
              Choose your reporting currency. You receive a single virtual
              budget equivalent to 100,000 USD, translated using a fixed
              fictional scenario rate. The reporting currency is fixed for this
              account.
            </p>
            <label className="field">
              <span>Reporting &amp; initial wallet currency</span>
              <select
                value={reporting}
                onChange={(event) =>
                  setReporting(event.target.value as CurrencyCode)
                }
                disabled={pending}
              >
                {currencies.map((item) => (
                  <option key={item.code} value={item.code}>
                    {item.code} — {item.name}
                  </option>
                ))}
              </select>
            </label>
            <div className="grant-preview">
              <span>ONE-TIME VIRTUAL OPENING GRANT</span>
              <strong>
                {formatMinor(
                  grant.minor,
                  currencies.find((item) => item.code === reporting)!.exponent,
                )}{" "}
                <small>{reporting}</small>
              </strong>
              <p>Synthetic grant rate · not current market FX</p>
            </div>
            <button
              className="button primary"
              onClick={() =>
                mutate("/api/account", { reportingCurrency: reporting })
              }
              disabled={pending}
            >
              {pending ? "Creating…" : "Create simulation account →"}
            </button>
          </div>
        ) : (
          <>
            <div className="account-meta">
              <span>
                Reporting currency <strong>{account.reportingCurrency}</strong>
              </span>
              <span>
                Data mode <strong>Synthetic</strong>
              </span>
              <span>
                Grant <strong>Issued once</strong>
              </span>
            </div>
            <div className="wallet-grid">
              {account.wallets.map((wallet) => (
                <article key={wallet.currency} className="wallet-card">
                  <div>
                    <strong>{wallet.currency}</strong>
                    <span className="wallet-type">NATIVE WALLET</span>
                  </div>
                  <span className="muted">
                    {
                      currencies.find((item) => item.code === wallet.currency)!
                        .name
                    }
                  </span>
                  <p>{formatMinor(wallet.balanceMinor, wallet.exponent)}</p>
                  <small>
                    Available virtual funds · {wallet.exponent} decimal places
                  </small>
                </article>
              ))}
            </div>
            {missing.length > 0 && (
              <form onSubmit={addWallet} className="add-wallet">
                <label className="field">
                  <span>Add an empty native wallet</span>
                  <select name="currency" disabled={pending}>
                    {missing.map((item) => (
                      <option value={item.code} key={item.code}>
                        {item.code} — {item.name}
                      </option>
                    ))}
                  </select>
                </label>
                <button
                  className="button secondary"
                  type="submit"
                  disabled={pending}
                >
                  {pending ? "Saving…" : "Add wallet +"}
                </button>
              </form>
            )}
            <p className="panel-footnote">
              Balances are independent. A new wallet starts at zero.{" "}
              <Link href="/trading">Open practice trading</Link> to convert
              virtual cash, review orders and follow positions and receipts.
            </p>
          </>
        )}
        <p
          role="status"
          aria-live="polite"
          className={message ? "form-message" : ""}
        >
          {message}
        </p>
      </section>
      <aside>
        <section className="panel identity-panel">
          <span className="eyebrow">SIGNED IN AS</span>
          <div className="identity-name">
            <span className="avatar large-avatar">
              {name.slice(0, 1).toUpperCase()}
            </span>
            <h2>{name}</h2>
          </div>
          <p className="muted">
            {verified
              ? "Verified provider identity"
              : "Local development identity · email unverified"}
          </p>
          <p className="small-copy">
            Your virtual funds stay with this account across visits. You can
            explore markets before setting up your first wallet.
          </p>
          <button
            className="button secondary full-width"
            onClick={signOut}
            disabled={pending}
          >
            Sign out
          </button>
        </section>
        <section className="global-note">
          <span className="eyebrow">ONE BUDGET, MANY CURRENCIES</span>
          <h3>Funds don’t multiply.</h3>
          <p>
            You receive one opening budget in your chosen currency. Opening
            another wallet never creates another grant or converts your funds.
          </p>
        </section>
      </aside>
    </div>
  );
}
