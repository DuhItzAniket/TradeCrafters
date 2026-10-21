import { test } from "node:test";
import assert from "node:assert/strict";
import {
  authIpHeaders,
  ingressDigest,
  ingressMode,
  IngressUnavailable,
  requestScope,
  trustedNetwork,
} from "@tradecrafters/database/ingress";

const hosted = { NODE_ENV: "production", VERCEL: "1" };
const local = {
  NODE_ENV: "test",
  AUTH_DEV_CREDENTIALS: "true",
  BETTER_AUTH_URL: "http://127.0.0.1:3000",
};
test("hosted ingress and auth trust only the platform-owned address header", () => {
  const headers = new Headers({
    "x-vercel-forwarded-for": "198.51.100.17",
    "x-forwarded-for": "203.0.113.8",
    "x-real-ip": "203.0.113.9",
    forwarded: "for=203.0.113.10",
  });
  assert.equal(trustedNetwork(headers, hosted), "198.51.100.17");
  assert.deepEqual(authIpHeaders(hosted), ["x-vercel-forwarded-for"]);
  headers.delete("x-vercel-forwarded-for");
  assert.throws(() => trustedNetwork(headers, hosted), IngressUnavailable);
});
test("unsupported production ingress fails closed; local address injection needs explicit fixtures", () => {
  assert.throws(
    () => ingressMode({ NODE_ENV: "production" }),
    IngressUnavailable,
  );
  assert.throws(
    () => ingressMode({ ...local, NODE_ENV: "production" }),
    IngressUnavailable,
  );
  assert.throws(
    () => ingressMode({ ...local, BETTER_AUTH_URL: "https://example.com" }),
    IngressUnavailable,
  );
  assert.equal(ingressMode(local), "local-fixture");
  assert.equal(trustedNetwork(new Headers(), local), "127.0.0.1");
  assert.deepEqual(authIpHeaders(local), ["x-forwarded-for"]);
});
test("equivalent IPv4 and IPv6 addresses share a canonical network budget", () => {
  const network = (ip: string) =>
    trustedNetwork(new Headers({ "x-vercel-forwarded-for": ip }), hosted);
  assert.equal(network("::ffff:198.51.100.17"), network("198.51.100.17"));
  assert.equal(network("2001:db8:1:2::1"), network("2001:0db8:1:2::ffff"));
  assert.notEqual(network("2001:db8:1:2::1"), network("2001:db8:1:3::1"));
});
test("missing, list, port, malformed and zone-qualified platform addresses are rejected", () => {
  for (const ip of [
    "",
    "198.51.100.17,203.0.113.8",
    "198.51.100.17:80",
    "fe80::1%eth0",
    "unknown",
    "[2001:db8::1]",
  ])
    assert.throws(
      () =>
        trustedNetwork(new Headers({ "x-vercel-forwarded-for": ip }), hosted),
      IngressUnavailable,
    );
});
test("counter digests separate scopes, windows and secrets without exposing the address", () => {
  const secret = "fixture-secret-".repeat(4),
    ip = "198.51.100.17";
  const digest = ingressDigest(secret, "read", 10, ip);
  assert.match(digest, /^[a-f0-9]{64}$/);
  assert.equal(digest.includes(ip), false);
  assert.notEqual(digest, ingressDigest(secret, "auth", 10, ip));
  assert.notEqual(digest, ingressDigest(secret, "read", 11, ip));
  assert.notEqual(digest, ingressDigest(secret + "changed", "read", 10, ip));
  assert.equal(digest, ingressDigest(secret, "read", 10, ip));
});
test("missing secrets and invalid clock windows cannot form counter identities", () => {
  for (const window of [-1, 1.1, NaN, Number.MAX_SAFE_INTEGER + 1])
    assert.throws(
      () => ingressDigest("x".repeat(40), "read", window, "198.51.100.1"),
      IngressUnavailable,
    );
  assert.throws(
    () => ingressDigest("short", "read", 1, "198.51.100.1"),
    IngressUnavailable,
  );
});
test("fixed request scopes do not allocate a budget per caller path or identity", () => {
  const scope = (path: string, method = "GET") =>
    requestScope(new Request("https://example.com" + path, { method }));
  assert.equal(scope("/api/auth/get-session"), "auth");
  assert.equal(scope("/api/auth/arbitrary", "POST"), "auth");
  assert.equal(scope("/api/directory?user=arbitrary"), "read");
  assert.equal(scope("/api/account", "HEAD"), "read");
  assert.equal(scope("/api/account", "POST"), "write");
  assert.equal(scope("/api/admin/control", "DELETE"), "write");
});
