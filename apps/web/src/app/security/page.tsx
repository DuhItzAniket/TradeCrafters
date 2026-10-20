import { redirect } from "next/navigation";
import { securityState } from "@tradecrafters/database/security";
import { sessionForPage } from "@/lib/session";
import { SecuritySettings } from "@/components/security-settings";
export const metadata = { title: "Account security" };
export default async function SecurityPage() {
  const session = await sessionForPage();
  if (!session) redirect("/sign-in");
  return (
    <>
      <section className="page-heading">
        <div>
          <span className="eyebrow">IDENTITY / AUTHENTICATOR / ACCESS</span>
          <h1>Account security.</h1>
          <p>
            Control your authenticator and verify access to privileged tools.
          </p>
        </div>
      </section>
      <SecuritySettings
        initial={await securityState(session.user.id, session.session.id)}
        verified={session.user.emailVerified}
      />
    </>
  );
}
