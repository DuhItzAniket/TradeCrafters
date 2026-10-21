# Hosted identity and session verification

This M4 slice separates callback failures, server-session revocation and actual human identity/factor recovery. The owner previously completed the real GitHub callback/reload and authenticator/admin setup; see the [hosted record](hosted-preview.md). Additional provider-outage, factor recovery and financial lost-response acceptance remain open until their own evidence is collected.

## Non-storable API responses

The 21 October 2026 hosted baseline returned `Cache-Control: no-store` for `/api/auth/get-session`, but the anonymous `/api/auth/list-sessions` rejection returned `public, max-age=0, must-revalidate`. The API wrapper previously returned SDK responses directly while application-authored JSON responses specified no-store. This observation establishes an inconsistent privacy contract; it is not evidence that private data was actually cached or leaked.

The API boundary now copies response headers, enforces `Cache-Control: no-store`, and passes through the original body stream, status and status text. Copying handles immutable redirect responses and preserves separate Set-Cookie values. Existing sanitized error responses already use no-store. The change does not enable a cookie/session cache or alter origin, ownership, factor, ingress or database permissions.

A regression first failed on the previous public-cache directive, then passed after the fix. It checks two distinct cookies, body/status/Vary preservation, immutable redirects and actual HTTP session success/rejection/callback responses. The complete suite is **154 checks (64 unit/configuration + 90 HTTP/MySQL)**; type/lint/format, audit and production build are part of required CI.

## Hosted drill boundaries

The private harness uses the existing restricted runtime identity and pinned Better Auth server configuration. Its own short-lived session cookies are generated through the installed SDK and kept only in process memory. It never reads browser cookies, changes the hosted environment, enables password sign-in or exposes a test sign-in endpoint.

Two synthetic `.invalid` identities may be created for session checks, with an explicit fixture verification flag and server-issued ten-minute sessions. These are **not GitHub-verified people or successful provider logins**. They receive no provider account, password, factor, administrator role, simulation account, funds or journal. A private cleanup manifest holds only fixture identity keys, never session tokens. Cleanup requires exact fixture keys/email markers and refuses identities linked to protected records. Counts of existing users/sessions/providers/factors/roles/audits and financial records are compared before and after.

Actual HTTPS checks cover:

- Anonymous/forged/expired sessions and protected application routes.
- Missing, forged, expired and cookie-mismatched OAuth state, local failure redirects, denial-shaped callbacks, rejected external callback destinations, consumed-state replay and a fresh state restart after a nonfunctional code.
- Secure, HttpOnly, SameSite=Lax, host-only state-cookie attributes on the actual hosted response. Cookies, states, tokens, redirect parameters and private identity metadata are excluded from public output.
- Session-list ownership, cross-identity/cross-origin revocation denial, revoke-one/others/all, invalidation of retained old cookies across application routes, stale-session setup guards, and sign-out recovery after discarding its response.

The [SDK's session-management contract](https://better-auth.com/docs/concepts/session-management) is checked against installed 1.7.11 source. The app keeps cookie caching disabled so each request checks the authoritative database session. The harness honors admission limits; throttling is not bypassed.

An invalid authorization code is not a controlled GitHub outage, a denial-shaped callback is not a human clicking Deny, and a new server-issued fixture session is not a real OAuth recovery. Local isolated provider-transport tests remain the evidence for token/profile outage and retry behavior. No owner factor secret, recovery code or identity trust setting is changed by this drill.

## Current acceptance

Implementation and local regression checks are complete. Hosted acceptance of this change is pending deployment and the scoped drill above. M4 remains open for its other operational and real-user recovery gates.
