"use client";
import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { authClient } from "@/lib/auth-client";
export function FactorChallenge() {
  const [recovery, setRecovery] = useState(false);
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState("");
  const router = useRouter();
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPending(true);
    setMessage("");
    try {
      const code = String(new FormData(event.currentTarget).get("code"));
      const result = recovery
        ? await authClient.twoFactor.verifyBackupCode({
            code,
            disableSession: false,
            trustDevice: false,
          })
        : await authClient.twoFactor.verifyTotp({ code, trustDevice: false });
      if (result.error)
        throw new Error(
          result.error.message || "Verification failed. Try another code.",
        );
      router.replace("/account");
      router.refresh();
    } catch (error) {
      setMessage(
        error instanceof Error
          ? error.message
          : "Could not complete verification.",
      );
    } finally {
      setPending(false);
    }
  }
  return (
    <section className="panel auth-panel factor-panel">
      <h2>{recovery ? "Use a recovery code" : "Check your authenticator"}</h2>
      <form onSubmit={submit} key={String(recovery)}>
        <label className="field">
          <span>
            {recovery ? "Recovery code" : "Six-digit authenticator code"}
          </span>
          <input
            name="code"
            autoComplete="one-time-code"
            required
            maxLength={recovery ? 80 : 6}
            inputMode={recovery ? "text" : "numeric"}
            pattern={recovery ? undefined : "[0-9]{6}"}
          />
        </label>
        <button className="button primary" disabled={pending}>
          {pending ? "Verifying…" : "Complete sign-in →"}
        </button>
      </form>
      <button
        className="text-button"
        disabled={pending}
        onClick={() => {
          setRecovery(!recovery);
          setMessage("");
        }}
      >
        {recovery
          ? "Use my authenticator instead"
          : "Use a saved recovery code"}
      </button>
      <p className="small-copy">
        If the sign-in challenge expired,{" "}
        <Link href="/sign-in">start sign-in again</Link>.
      </p>
      <p role="status" className={message ? "form-message error" : ""}>
        {message}
      </p>
    </section>
  );
}
