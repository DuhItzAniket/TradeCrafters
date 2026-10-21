import { test } from "node:test";
import assert from "node:assert/strict";
import { NextRequest } from "next/server";
import { proxy } from "../apps/web/src/proxy";

test("production page policy replaces caller authority and binds fresh nonces", () => {
  const original = process.env.NODE_ENV;
  try {
    process.env.NODE_ENV = "production";
    const request = new NextRequest("https://example.test/trading", {
      headers: {
        "x-nonce": "caller",
        "content-security-policy": "script-src * 'unsafe-inline'",
      },
    });
    const first = proxy(request),
      second = proxy(request);
    const policy = first.headers.get("content-security-policy")!;
    const nonce = policy.match(/'nonce-([^']+)'/)![1];
    assert.equal(Buffer.from(nonce, "base64").length, 24);
    assert.notEqual(second.headers.get("content-security-policy"), policy);
    assert.equal(first.headers.get("x-middleware-request-x-nonce"), nonce);
    assert.equal(
      first.headers.get("x-middleware-request-content-security-policy"),
      policy,
    );
    assert.ok(policy.includes("'strict-dynamic'"));
    assert.ok(policy.includes("frame-ancestors 'none'"));
    assert.ok(policy.includes("connect-src 'self'"));
    assert.equal(
      policy
        .split("; ")
        .find((item) => item.startsWith("script-src"))!
        .includes("unsafe-"),
      false,
    );
    assert.equal(policy.includes("caller"), false);
    assert.equal(first.headers.get("cache-control"), "private, no-store");
  } finally {
    process.env.NODE_ENV = original;
  }
});
