import { createHmac } from "node:crypto";
import { isIP } from "node:net";
import { normalizeIP } from "@better-auth/core/utils/ip";

export const ingressPolicies = {
  read: { perNetwork: 180, global: 600 },
  auth: { perNetwork: 60, global: 120 },
  write: { perNetwork: 60, global: 240 },
} as const;
export type IngressScope = keyof typeof ingressPolicies;

export class IngressUnavailable extends Error {
  constructor() {
    super("The request could not be admitted. Please try again shortly.");
  }
}
export class RequestLimited extends Error {
  constructor(public retryAfter: number) {
    super("Too many requests. Please wait before trying again.");
  }
}

export function ingressMode(env: NodeJS.ProcessEnv = process.env) {
  if (env.VERCEL === "1") return "vercel";
  if (
    env.NODE_ENV !== "production" &&
    env.AUTH_DEV_CREDENTIALS === "true" &&
    ["localhost", "127.0.0.1"].includes(
      new URL(env.BETTER_AUTH_URL || "http://127.0.0.1:3000").hostname,
    )
  )
    return "local-fixture";
  throw new IngressUnavailable();
}
export function trustedNetwork(
  headers: Headers,
  env: NodeJS.ProcessEnv = process.env,
) {
  const mode = ingressMode(env);
  // Vercel overwrites this header. Never fall back to caller-controlled XFF,
  // X-Real-IP or Forwarded in production, including on a missing/invalid value.
  const raw = (
    headers.get(
      mode === "vercel" ? "x-vercel-forwarded-for" : "x-forwarded-for",
    ) || (mode === "local-fixture" ? "127.0.0.1" : "")
  ).trim();
  if (!raw || raw.includes("%") || !isIP(raw)) throw new IngressUnavailable();
  return normalizeIP(raw, { ipv6Subnet: 64 });
}

export function authIpHeaders(env: NodeJS.ProcessEnv = process.env) {
  return [
    ingressMode(env) === "vercel"
      ? "x-vercel-forwarded-for"
      : "x-forwarded-for",
  ];
}
export function ingressDigest(
  secret: string,
  scope: IngressScope,
  window: number,
  network: string,
) {
  if (secret.length < 40 || !Number.isSafeInteger(window) || window < 0)
    throw new IngressUnavailable();
  return createHmac("sha256", secret)
    .update(`ingress-v1|${scope}|${window}|${network}`)
    .digest("hex");
}
export function requestScope(request: Request): IngressScope {
  if (new URL(request.url).pathname.startsWith("/api/auth/")) return "auth";
  return ["GET", "HEAD"].includes(request.method) ? "read" : "write";
}
