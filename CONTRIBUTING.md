# Contributing to TradeCrafters

TradeCrafters is the modernization of a DBMS project by **Aniket Kumar and Annapurna S**. Start with the [current implementation status](docs/implementation/foundation-status.md), [architecture](docs/architecture/README.md), [roadmap](docs/ROADMAP.md), and [decisions](docs/DECISIONS.md). The modern app lives in `apps/web` and `packages`; legacy coursework is preserved separately.

## Development

Follow the [local setup](docs/implementation/local-development.md) with Node 24.22.0 and Docker/MySQL. Use `npm ci` at the repository root; do not install the legacy client/server as part of modern development. `npm run setup:local` creates fresh ignored local credentials; run `npm run setup:db-identities` after migrations/seed to provision the restricted web identity. Root and app database URLs intentionally differ. Never point development or CI at a production account database.

Use an issue for a concrete task, create a branch from current `main`, and submit a focused PR back to `main`. Include the resulting behavior, verification evidence and any migration/data implications. Do not claim an audit finding is fixed without its acceptance evidence.

```sh
npm run verify:source
npm run typecheck
npm run lint
npm run format:check
npm test
npm run test:integration
npm run build
```

Integration checks require the app and MySQL to be running. Use `npm run format` to apply the repository style. UI changes need desktop/mobile screenshots and loading/error/keyboard verification. Financial changes need exact-arithmetic, retry and concurrency evidence against real MySQL. New data providers need verified permitted use, coverage and quota behavior.

## Review and merge

`main` requires a pull request, the `verify` status check, an up-to-date branch and resolved review conversations. These rules apply to administrators too. The project currently uses zero mandatory approvals so a solo maintainer can work without self-approval; this does not authorize merging failing checks or unreviewed external contributions.

Auto-merge is enabled at repository level and is an explicit per-PR choice. Maintainers can opt in using `gh pr merge <number> --squash --auto` after a change is ready. Keep PRs as drafts while implementation or required evidence is missing. Do not add a bot that blindly enables auto-merge on every outside contribution. Branches with citations are retained so historical research links remain available.

## Data and security

Never commit `.env` values, account exports, database dumps with user data, provider credentials, authenticator secrets, recovery codes or private agreements. Track database connection code and reviewed SQL migrations; secrets belong in ignored environment files or the hosting secret store. Report vulnerabilities through the [security policy](SECURITY.md), not public issues containing exploit details or credentials.

Do not edit migrations already applied to a retained database; add the next numbered migration. MySQL DDL commits implicitly, so partial migration recovery needs explicit inspection. Keep securities, listings, quote units, native wallet currencies and provider aliases distinct. Directory membership never establishes a price or simulation entitlement.

Update docs and decisions with implementation changes. Preserve creator attribution. Be respectful, make review comments specific and evidence based, and keep private information out of screenshots and logs.

## Historical audit probes

The original audit reproduction command is:

```text
node docs/research/evidence/verify-legacy.cjs
```

It confirms known legacy defects in isolation. It does not establish that a legacy endpoint is safe, and it is separate from the modern application checks above.
