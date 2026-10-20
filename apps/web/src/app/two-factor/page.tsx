import { FactorChallenge } from "@/components/factor-challenge";
export const metadata = { title: "Complete sign-in" };
export default function FactorPage() {
  return (
    <>
      <section className="page-heading">
        <div>
          <span className="eyebrow">COMPLETE YOUR SIGN-IN</span>
          <h1>One more verification.</h1>
          <p>
            Use your authenticator or a saved recovery code to finish local
            account sign-in.
          </p>
        </div>
      </section>
      <FactorChallenge />
    </>
  );
}
