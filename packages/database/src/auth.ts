import { betterAuth } from "better-auth";
import { getPool } from "./pool";

export function authConfiguration() {
  const url = new URL(process.env.BETTER_AUTH_URL || "http://127.0.0.1:3000");
  const developmentCredentials = process.env.AUTH_DEV_CREDENTIALS === "true";
  if (
    developmentCredentials &&
    (process.env.NODE_ENV === "production" ||
      !["127.0.0.1", "localhost"].includes(url.hostname))
  ) {
    throw new Error(
      "Development password accounts are allowed only on localhost outside production.",
    );
  }
  const secret = process.env.BETTER_AUTH_SECRET;
  if (!secret || secret.length < 40 || secret.includes("generate-at-least"))
    throw new Error(
      "Set a fresh BETTER_AUTH_SECRET of at least 40 characters.",
    );
  if (process.env.NODE_ENV === "production" && url.protocol !== "https:")
    throw new Error("Production auth requires HTTPS.");
  const github =
    process.env.GITHUB_CLIENT_ID && process.env.GITHUB_CLIENT_SECRET;
  if (process.env.NODE_ENV === "production" && !github)
    throw new Error("Configure GitHub OAuth before production sign-in.");
  return { url, secret, developmentCredentials, github };
}

function createAuth() {
  const config = authConfiguration();
  return betterAuth({
    appName: "TradeCrafters",
    database: getPool(),
    baseURL: config.url.origin,
    secret: config.secret,
    trustedOrigins: [config.url.origin],
    emailAndPassword: {
      enabled: config.developmentCredentials,
      minPasswordLength: 12,
      maxPasswordLength: 128,
    },
    socialProviders: config.github
      ? {
          github: {
            clientId: process.env.GITHUB_CLIENT_ID!,
            clientSecret: process.env.GITHUB_CLIENT_SECRET!,
          },
        }
      : {},
    session: {
      expiresIn: 60 * 60 * 24 * 7,
      updateAge: 60 * 60 * 24,
      cookieCache: { enabled: false },
    },
    account: { accountLinking: { enabled: false } },
    rateLimit: {
      enabled: true,
      storage: "database",
      window: 60,
      max: 60,
      customRules: {
        "/sign-in/email": { window: 60, max: 8 },
        "/sign-up/email": { window: 60, max: 5 },
      },
    },
  });
}
let instance: ReturnType<typeof createAuth> | undefined;
export function getAuth() {
  return (instance ??= createAuth());
}
