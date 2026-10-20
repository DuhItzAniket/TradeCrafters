# Security policy

TradeCrafters is an educational trading simulator under active development. It uses virtual funds and currently fictional market scenarios. It has not been certified as a production financial system.

## Reporting a vulnerability

Use GitHub's enabled **[private vulnerability reporting](https://github.com/DuhItzAniket/TradeCrafters/security/advisories/new)** for this repository. Include affected commit/version, a minimal reproduction, expected versus observed behavior and impact. Sanitized screenshots or logs are welcome. Never include live credentials, session cookies, authenticator secrets, recovery codes or another person's account data.

If you accidentally exposed a secret, revoke/rotate it through the issuer first, then share only a sanitized description. Maintainers cannot revoke your provider or database credentials through this application. Do not test against systems, users or data you do not own.

## Supported scope

| Code                                                      | Maintenance status                                                                    |
| --------------------------------------------------------- | ------------------------------------------------------------------------------------- |
| Current `main`: `apps/web`, `packages`, migrations and CI | Active development; fixes are reviewed and tested here                                |
| Legacy `client`, `server` and original SQL                | Historical coursework; known unresolved findings, not supported for public deployment |
| Third-party market data, hosting and OAuth providers      | Report provider-specific issues to the relevant provider                              |

Read the [legacy audit](docs/research/01-current-state-audit.md) and [current implementation gates](docs/implementation/foundation-status.md) for known limitations. Root workspace audit results do not describe the separate legacy dependency trees. Alerts remain visible rather than being dismissed because the affected code is historical.

## Development expectations

- Authentication and account ownership are checked on the server. Browser usernames, client prices and role fields are not authorization.
- Secrets stay outside Git; development credentials are restricted to localhost and rejected in production. Remote MySQL requires verified TLS.
- Data coverage, retention and public-display rights must be verified before real data is enabled.
- Financial writes need exact arithmetic, transactions, idempotency/concurrency evidence and reconciliation.
- Privileged interfaces require explicit roles and stronger verification; enabling a plugin alone is not proof of authorization enforcement.

There is no promised incident-response SLA or bug-bounty program. Please allow coordinated investigation before publishing sensitive reproduction details.
