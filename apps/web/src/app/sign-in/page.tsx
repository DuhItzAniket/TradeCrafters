import { authConfiguration } from "@tradecrafters/database/auth";
import { SignIn } from "@/components/sign-in";
export const metadata = { title: "Sign in" };
export default function SignInPage() {
  const config = authConfiguration();
  return (
    <>
      <section className="page-heading">
        <div>
          <span className="eyebrow">YOUR OWN PRACTICE SPACE</span>
          <h1>Make room to learn.</h1>
          <p>Keep your virtual funds and market exploration in one account.</p>
        </div>
      </section>
      <SignIn
        development={config.developmentCredentials}
        github={Boolean(config.github)}
      />
    </>
  );
}
