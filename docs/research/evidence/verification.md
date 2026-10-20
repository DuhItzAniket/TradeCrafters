# Verification record

Checked on **20 October 2026**. This verifies the research package and its design study, not a production application.

**Global-scope correction:** architecture, data research, contracts, roadmap and GitHub issue descriptions were revised for all stock exchanges worldwide. This is a documentation change. The earlier browser evidence covers the unchanged fictional USD listing study, not global exchange discovery, FX wallets or actual market integrations. New global acceptance criteria remain future verification work.

## Repository investigation

- Cloned the public GitHub repository and recorded baseline `8fa026527631bbfa51bcd0ba5e3412eaa8df5b16`.
- Compared tracked-file hashes to the local export. The environment template and larger SQL script differ; the local export has the missing database module. Local configuration/data were not copied into Git.
- Confirmed the baseline Git tree lacks the database module imported by both controllers and that the ignore rule matches that directory.
- Ran npm's lockfile-only, ignore-scripts audit separately for server/client. Counts, lockfile hashes and advisory examples are preserved in [dependency-audit.json](dependency-audit.json). No automated dependency update or application install was performed.
- Inspected environment configuration inside the retained older ZIP in memory, without extracting it or printing values. [Sanitized inventory](history-configuration.json) records two non-placeholder secret categories. Current validity and activity were not checked.

## Isolated controller evidence

`node docs/research/evidence/verify-legacy.cjs` passed its assertions about **known defects** in the pinned original controller. It confirms the absent baseline module and demonstrates three controlled logic paths: unknown side attempting a cash credit without a holding write, string quantity concatenation, and string-balance concatenation. The [captured output](legacy-probe-results.json) matches the harness.

Passing these assertions means the legacy defects were reproduced under the stated fake-database inputs. It does not mean the legacy server is secure or runnable, and it does not prove how a real database would store an invalid binding.

## Browser design checks

Used Playwright CLI against a localhost server serving only `docs/design`. Inspected desktop, light-theme, and mobile screenshots. An initial favicon 404 was corrected with a self-contained favicon declaration. Mobile chart labels were made readable by rendering fewer candles in a narrower viewBox.

**24 checks passed** after those adjustments:

- Default buy and sell estimates; symbol selection; rejection of fractional quantities, insufficient cash, and unowned sells.
- Stale and closed preview states disable review and show their state.
- Review dialog opens with the selected intent, closes on Escape, and restores focus.
- Watchlist search and no-match state; timeframe metadata; accessible chart-data table.
- Keyboard tab navigation and light-theme switching.
- No page-level horizontal overflow at 1280px, 768px and 390px. A 1440px desktop rendering was also inspected.
- No new browser errors during the completed check and no external requests from the self-contained study.

[Desktop](../../design/previews/workbench-desktop.png), [light](../../design/previews/workbench-light.png), and [mobile](../../design/previews/workbench-mobile.png) captures are committed as review artifacts. These checks cover the study's limited interactions; they do not cover account authentication, server execution, persistence, provider integration, production performance, user testing, or full WCAG conformance.

## Package review

Markdown relative links, JSON artifacts, issue-template YAML and diff whitespace are checked before publication. Application sources, dependencies and legacy SQL are unchanged. No provider key, database password, private agreement, local `.env`, or historic archive content is included in the new artifacts.
