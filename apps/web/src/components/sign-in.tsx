"use client";
import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { authClient } from "@/lib/auth-client";
export function SignIn({
  development,
  github,
}: {
  development: boolean;
  github: boolean;
}) {
  const router = useRouter();
  const [create, setCreate] = useState(false);
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState("");
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPending(true);
    setMessage("");
    const form = new FormData(event.currentTarget);
    const credentials = {
      email: String(form.get("email")),
      password: String(form.get("password")),
    };
    try {
      const result = create
        ? await authClient.signUp.email({
            ...credentials,
            name: String(form.get("name")),
          })
        : await authClient.signIn.email(credentials);
      if (result.error) {
        setMessage(
          result.error.message || "Sign-in failed. Check your details.",
        );
        return;
      }
      if (
        result.data &&
        "twoFactorRedirect" in result.data &&
        result.data.twoFactorRedirect
      ) {
        router.replace("/two-factor");
        return;
      }
      router.replace("/account");
      router.refresh();
    } catch {
      setMessage("Could not reach the sign-in service. Please try again.");
    } finally {
      setPending(false);
    }
  }
  async function githubSignIn() {
    setPending(true);
    setMessage("");
    try {
      const result = await authClient.signIn.social({
        provider: "github",
        callbackURL: "/account",
      });
      if (result.error)
        setMessage(result.error.message || "GitHub sign-in failed.");
    } catch {
      setMessage("Could not start GitHub sign-in. Please try again.");
    } finally {
      setPending(false);
    }
  }
  return (
    <div className="auth-grid">
      <section className="panel auth-panel">
        <span className="eyebrow">TRADECRAFTERS ACCOUNT</span>
        <h2>{create ? "Create your local account" : "Welcome to the lab"}</h2>
        <p className="muted">Your account uses virtual funds only.</p>
        {github && (
          <button
            className="button secondary full-width"
            disabled={pending}
            onClick={githubSignIn}
          >
            Continue with GitHub ↗
          </button>
        )}
        {development && (
          <>
            <div className="dev-notice">
              <strong>Local development access</strong>
              <p>
                Email ownership is not verified in this mode. Use made-up
                details and a unique test password. This sign-in mode is
                disabled in production.
              </p>
            </div>
            <div
              className="auth-toggle"
              role="group"
              aria-label="Choose sign-in mode"
            >
              <button
                aria-pressed={!create}
                disabled={pending}
                onClick={() => {
                  setCreate(false);
                  setMessage("");
                }}
              >
                Sign in
              </button>
              <button
                aria-pressed={create}
                disabled={pending}
                onClick={() => {
                  setCreate(true);
                  setMessage("");
                }}
              >
                Create account
              </button>
            </div>
            <form onSubmit={submit}>
              {create && (
                <label className="field">
                  <span>Name</span>
                  <input
                    name="name"
                    autoComplete="name"
                    required
                    minLength={2}
                    maxLength={80}
                  />
                </label>
              )}
              <label className="field">
                <span>Email</span>
                <input
                  name="email"
                  type="email"
                  autoComplete="email"
                  required
                  maxLength={254}
                />
              </label>
              <label className="field">
                <span>
                  Password <small>12–128 characters</small>
                </span>
                <input
                  name="password"
                  type="password"
                  autoComplete={create ? "new-password" : "current-password"}
                  required
                  minLength={12}
                  maxLength={128}
                />
              </label>
              <button
                type="submit"
                disabled={pending}
                className="button primary full-width"
              >
                {pending
                  ? "Please wait…"
                  : create
                    ? "Create local account →"
                    : "Sign in →"}
              </button>
            </form>
          </>
        )}
        {!development && !github && (
          <p className="form-message">
            Sign-in is awaiting OAuth configuration. You can still explore the
            public lab.
          </p>
        )}
        <p
          role="status"
          aria-live="polite"
          className={message ? "form-message error" : ""}
        >
          {message}
        </p>
      </section>
      <section className="auth-story">
        <span className="eyebrow">A BETTER PRACTICE GROUND</span>
        <h2>
          Learn the structure
          <br />
          behind the symbol.
        </h2>
        <ol>
          <li>
            <span>01</span>
            <div>
              <strong>Own your space</strong>
              <p>
                Return to your own virtual wallets with a secure sign-in. Your
                practice funds stay with your account across visits.
              </p>
            </div>
          </li>
          <li>
            <span>02</span>
            <div>
              <strong>Think in native currencies</strong>
              <p>
                Yen, rupees, pounds and more. Separate wallets keep spendable
                balances explicit.
              </p>
            </div>
          </li>
          <li>
            <span>03</span>
            <div>
              <strong>Know what you’re looking at</strong>
              <p>
                Fictional scenarios and unverified real-data coverage stay
                clearly marked.
              </p>
            </div>
          </li>
        </ol>
      </section>
    </div>
  );
}
