"use client";
import { useState, type FormEvent } from "react";
import QRCode from "react-qr-code";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { authClient } from "@/lib/auth-client";
import { authErrorMessage } from "@/lib/auth-error";

type SecurityState = {
  mfaEnabled: boolean;
  isAdmin: boolean;
  hasPassword: boolean;
  stepUpExpiresAt: string | null;
};
type AdminControl = {
  control: { paused: boolean; executionPaused: boolean; updatedAt: string };
  audit: {
    action: string;
    reason: string;
    source: string;
    createdAt: string;
  }[];
};
export function SecuritySettings({
  initial,
  verified,
}: {
  initial: SecurityState;
  verified: boolean;
}) {
  const [state, setState] = useState(initial);
  const [enrollment, setEnrollment] = useState<{
    totpURI: string;
    backupCodes: string[];
  } | null>(null);
  const [admin, setAdmin] = useState<AdminControl | null>(null);
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState("");
  const router = useRouter();
  async function fetchAdmin() {
    const response = await fetch("/api/admin/control");
    const data = await response.json();
    if (!response.ok) {
      setAdmin(null);
      throw new Error(
        data.error?.message || "Administrator access is unavailable.",
      );
    }
    setAdmin(data);
  }
  async function begin(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPending(true);
    setMessage("");
    const password = String(
      new FormData(event.currentTarget).get("password") || "",
    );
    try {
      const result = await authClient.twoFactor.enable({
        method: "totp",
        ...(state.hasPassword ? { password } : {}),
      });
      if (result.error)
        throw new Error(
          authErrorMessage(
            result.error,
            "Could not begin authenticator setup.",
          ),
        );
      if (!result.data || !("totpURI" in result.data))
        throw new Error("Authenticator setup did not return a QR code.");
      setEnrollment({
        totpURI: result.data.totpURI,
        backupCodes: result.data.backupCodes,
      });
    } catch (error) {
      setMessage(
        error instanceof Error ? error.message : "Could not start setup.",
      );
    } finally {
      setPending(false);
    }
  }
  async function enroll(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPending(true);
    setMessage("");
    try {
      const result = await authClient.twoFactor.verifyTotp({
        code: String(new FormData(event.currentTarget).get("code")),
        trustDevice: false,
      });
      if (result.error)
        throw new Error(
          authErrorMessage(result.error, "Could not verify the code."),
        );
      setEnrollment(null);
      const response = await fetch("/api/security");
      if (!response.ok)
        throw new Error("Reload to check your saved authenticator settings.");
      setState(await response.json());
      setMessage(
        "Authenticator verified. Keep your recovery codes somewhere private.",
      );
      router.refresh();
    } catch (error) {
      setMessage(
        error instanceof Error ? error.message : "Could not verify setup.",
      );
    } finally {
      setPending(false);
    }
  }
  async function unlock(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    setPending(true);
    setMessage("");
    try {
      const response = await fetch("/api/security/verify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          code: new FormData(form).get("code"),
        }),
      });
      const data = await response.json();
      if (!response.ok)
        throw new Error(data.error?.message || "Could not verify the code.");
      setState(data);
      form.reset();
      if (data.isAdmin && verified) await fetchAdmin();
      setMessage("Current session verified for five minutes.");
    } catch (error) {
      setMessage(
        error instanceof Error ? error.message : "Could not verify access.",
      );
    } finally {
      setPending(false);
    }
  }
  async function toggle(
    event: FormEvent<HTMLFormElement>,
    scope: "funding" | "execution",
  ) {
    event.preventDefault();
    if (!admin) return;
    setPending(true);
    setMessage("");
    try {
      const response = await fetch("/api/admin/control", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          scope,
          paused: !(scope === "execution"
            ? admin.control.executionPaused
            : admin.control.paused),
          reason: new FormData(event.currentTarget).get("reason"),
        }),
      });
      const data = await response.json();
      if (!response.ok)
        throw new Error(
          data.error?.message ||
            "The change could not be confirmed. Reload the controls before retrying.",
        );
      setAdmin(data);
      setMessage(
        `${scope === "execution" ? "Execution" : "Funding"} control updated and recorded in the audit log.`,
      );
    } catch (error) {
      setAdmin(null);
      setMessage(
        error instanceof Error
          ? error.message
          : "Reload to confirm the control state before retrying.",
      );
    } finally {
      setPending(false);
    }
  }
  return (
    <div className="security-grid">
      <section className="panel security-panel">
        <span className="eyebrow">AUTHENTICATOR APP</span>
        <h2>
          {state.mfaEnabled
            ? "Your authenticator is active"
            : "Add an extra verification step"}
        </h2>
        <p className="muted">
          GitHub sign-in uses your GitHub account’s security. TradeCrafters
          administrators must also verify an authenticator code before accessing
          privileged controls. Local password accounts use this authenticator
          when signing in.
        </p>
        {!state.mfaEnabled && !enrollment && (
          <form onSubmit={begin}>
            {state.hasPassword && (
              <label className="field">
                <span>Confirm your local account password</span>
                <input
                  name="password"
                  type="password"
                  autoComplete="current-password"
                  required
                  maxLength={128}
                />
              </label>
            )}
            <button className="button primary" disabled={pending}>
              {pending ? "Preparing…" : "Set up authenticator →"}
            </button>
            <p className="small-copy">
              Sign in again first if your current session is over ten minutes
              old.
            </p>
          </form>
        )}
        {enrollment && (
          <div className="enrollment">
            <p>
              Scan this QR code with your authenticator app. The QR is rendered
              locally.
            </p>
            <div className="auth-qr">
              <QRCode value={enrollment.totpURI} size={180} />
            </div>
            <h3>Save your recovery codes</h3>
            <p>
              These codes appear only during setup. Keep them private; each code
              can be used once to recover a local password sign-in.
            </p>
            <ul className="recovery-codes">
              {enrollment.backupCodes.map((code) => (
                <li key={code}>{code}</li>
              ))}
            </ul>
            <form onSubmit={enroll}>
              <label className="acknowledgement">
                <input type="checkbox" required /> I saved my recovery codes
                privately.
              </label>
              <label className="field">
                <span>Six-digit authenticator code</span>
                <input
                  name="code"
                  inputMode="numeric"
                  autoComplete="one-time-code"
                  pattern="[0-9]{6}"
                  maxLength={6}
                  required
                />
              </label>
              <button className="button primary" disabled={pending}>
                Verify authenticator
              </button>
            </form>
          </div>
        )}
        {state.mfaEnabled && (
          <form onSubmit={unlock}>
            <label className="field">
              <span>Verify your current session</span>
              <input
                aria-label="Current authenticator code"
                name="code"
                inputMode="numeric"
                autoComplete="one-time-code"
                pattern="[0-9]{6}"
                maxLength={6}
                required
                placeholder="Six-digit code"
              />
            </label>
            <button className="button primary" disabled={pending}>
              {pending ? "Verifying…" : "Verify current session →"}
            </button>
            {state.stepUpExpiresAt && (
              <p className="small-copy">
                Last verification expires at{" "}
                {state.stepUpExpiresAt.slice(11, 19)} UTC. Every privileged
                request checks the saved expiry.
              </p>
            )}
          </form>
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
          <span className="eyebrow">YOUR ACCESS</span>
          <h2 className="security-access-heading">
            {state.isAdmin ? "Administrator" : "Member"}
          </h2>
          <p className="muted">
            {verified
              ? "Verified sign-in identity"
              : "Local test identity · email unverified"}
          </p>
          <p className="small-copy">
            Access follows your signed-in account. Authenticator setup does not
            grant an administrator role.
          </p>
          <Link className="button secondary full-width" href="/account">
            Back to wallets →
          </Link>
        </section>
      </aside>
      {state.isAdmin && verified && (
        <section className="panel admin-panel">
          <div className="panel-heading">
            <div>
              <span className="eyebrow">ADMINISTRATOR CONTROLS</span>
              <h2>Simulation controls</h2>
            </div>
            <span className="synthetic-pill">Privileged access</span>
          </div>
          {!admin ? (
            <div className="admin-content">
              <p>
                Verify your current authenticator code to unlock these controls.
                Recovery codes and a prior sign-in do not unlock administrator
                actions.
              </p>
              {state.stepUpExpiresAt && (
                <button
                  className="button secondary"
                  disabled={pending}
                  onClick={async () => {
                    setPending(true);
                    try {
                      await fetchAdmin();
                    } catch (error) {
                      setMessage(
                        error instanceof Error
                          ? error.message
                          : "Unable to load controls.",
                      );
                    } finally {
                      setPending(false);
                    }
                  }}
                >
                  Load controls
                </button>
              )}
            </div>
          ) : (
            <div className="admin-content">
              {(["execution", "funding"] as const).map((scope) => {
                const paused =
                  scope === "execution"
                    ? admin.control.executionPaused
                    : admin.control.paused;
                const label =
                  scope === "execution"
                    ? "Trading and FX"
                    : "New account funding";
                return (
                  <section key={scope} aria-label={label}>
                    <h3>{label}</h3>
                    <div className="admin-state">
                      <span className="status-dot" /> {label}{" "}
                      {paused ? "paused" : "available"}
                    </div>
                    <p>
                      {scope === "execution"
                        ? "Pauses new buy/sell orders and currency conversions. Admitted transactions finish before the pause is confirmed. Portfolios and saved receipts remain available."
                        : "Pauses new opening grants and account resets. This is separate from trading and currency conversion."}
                    </p>
                    <form onSubmit={(event) => toggle(event, scope)}>
                      <label className="field">
                        <span>Reason for {scope} change</span>
                        <input
                          name="reason"
                          required
                          minLength={10}
                          maxLength={300}
                          placeholder="For example: maintenance window completed"
                        />
                      </label>
                      <button disabled={pending} className="button primary">
                        {paused ? "Resume" : "Pause"}{" "}
                        {scope === "execution"
                          ? "trading and FX"
                          : "new account funding"}
                      </button>
                    </form>
                  </section>
                );
              })}
              <h3>Recent audit events</h3>
              <ul className="audit-list">
                {admin.audit.map((entry, index) => (
                  <li key={`${entry.createdAt}-${index}`}>
                    <strong>{entry.action.replaceAll("_", " ")}</strong>
                    <span>{entry.reason}</span>
                    <small>
                      {new Date(entry.createdAt)
                        .toISOString()
                        .replace("T", " ")
                        .slice(0, 19)}{" "}
                      UTC · {entry.source}
                    </small>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </section>
      )}
    </div>
  );
}
