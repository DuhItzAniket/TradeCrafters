import { betterAuth } from "better-auth";
import { twoFactor } from "better-auth/plugins/two-factor";
import { getPool } from "./pool";
import { authIpHeaders } from "./ingress";

export function authConfiguration() {
  const url = new URL(process.env.BETTER_AUTH_URL || "http://127.0.0.1:3000");
  if (
    url.username ||
    url.password ||
    url.search ||
    url.hash ||
    url.pathname !== "/" ||
    !["http:", "https:"].includes(url.protocol)
  )
    throw Error(
      "BETTER_AUTH_URL must be an exact HTTP(S) origin without credentials, path, query or fragment.",
    );
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
  const hasGithubId = Boolean(process.env.GITHUB_CLIENT_ID);
  const hasGithubSecret = Boolean(process.env.GITHUB_CLIENT_SECRET);
  if (hasGithubId !== hasGithubSecret)
    throw Error("Configure both GitHub OAuth values together.");
  const github = hasGithubId && hasGithubSecret;
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
    advanced: {
      ipAddress: {
        ipAddressHeaders: authIpHeaders(),
        ipv6Subnet: 64,
      },
    },
    logger: {
      level: "warn",
      // Provider response bodies and SDK errors may include credentials or personal data.
      log(level) {
        console.error("TradeCrafters authentication event", { level });
      },
    },
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
    plugins: [twoFactor({ issuer: "TradeCrafters", allowPasswordless: true })],
    account: { accountLinking: { enabled: false } },
    rateLimit: {
      enabled: true,
      storage: "database",
      window: 60,
      max: 60,
      customRules: {
        "/sign-in/email": { window: 60, max: 8 },
        "/sign-up/email": { window: 60, max: 5 },
        "/two-factor/*": { window: 60, max: 5 },
      },
    },
  });
}
let instance: ReturnType<typeof createAuth> | undefined;
export function getAuth() {
  return (instance ??= createAuth());
}
