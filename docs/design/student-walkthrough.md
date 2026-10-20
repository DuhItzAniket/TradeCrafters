# M3 student walkthrough

**Status: prepared; no real participant sessions have been observed yet.** Automated Chromium walkthroughs test software behavior and do not count as student research. M3/#5 stays open until 3–5 actual student sessions are recorded and the findings addressed.

Use the local build at [TradeCrafters](http://127.0.0.1:3000/trading), on the host computer or through screen sharing. This is not a public deployment. Allow about 15 minutes per student. Use anonymous IDs P1–P5 and made-up local development accounts, each with a fresh unique test password; keep credentials, names and recordings out of GitHub. Do not let participants use the owner's account. Local password access is disabled in production.

Before each session, create a fresh simulation account with **GBP** as reporting currency. Its fictional opening grant is 80,000 GBP. Ask the participant to think aloud. Read the tasks without explaining where the controls are; record any assistance. Explain terminology only after observing the attempt. A server quote expires quickly, so refreshing a quote is allowed and should be recorded, not treated as a silent failure.

| Task to read aloud                                                                                               | Observe without coaching                                                                                                                 |
| ---------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------- |
| Tell me what kind of data and money this app uses. Is the chart live?                                            | Identifies fictional companies/prices, virtual funds and a fixed training clock; distinguishes the authored chart from executable quotes |
| Find ATLS in London, then ATLS in Australia. Which listing uses pounds? Return to London.                        | Distinguishes MIC, company and currency; discovers filters/picker; no accidental cross-venue order                                       |
| Buy three shares of the London listing. Before confirming, explain the price unit and expected cash cost.        | Reviews GBX versus GBP, sees the modeled spread and zero commission, deliberately confirms once; finds the persistent receipt            |
| Find your remaining spendable cash. Would the reporting equity total let you buy a Japanese listing immediately? | Finds native wallets, separates cash from equity; understands that explicit conversion is required                                       |
| Convert 5,000 GBP to JPY and buy one 100-share HIKR lot. Find the conversion receipt and its source.             | Reviews native amount/precision, finds Wallets & FX, returns to the selected market, uses activity/filter/provenance                     |
| Find a real venue, such as XNYS. Explain why you can or cannot trade there. Return to fictional practice.        | Recognizes reference-only coverage and does not mistake a MIC record for a connected feed                                                |

Optional checks: use the chart's time slider with the keyboard; switch to its data table; explain the stale-check message after a minute; pin a venue-qualified listing and reload. Do not ask participants to modify network responses or credentials to simulate an outage. Unknown-response recovery is covered separately by engineering fixtures.

Record raw outcomes for each participant:

| Participant   | Device / viewport | Synthetic data and fixed clock understood? | Venue distinction correct? | Trade completed unaided? | Cash vs equity understood? | FX/source found? | Real coverage understood? | Time / assistance / friction |
| ------------- | ----------------- | ------------------------------------------ | -------------------------- | ------------------------ | -------------------------- | ---------------- | ------------------------- | ---------------------------- |
| P1            | Not run           | —                                          | —                          | —                        | —                          | —                | —                         | —                            |
| P2            | Not run           | —                                          | —                          | —                        | —                          | —                | —                         | —                            |
| P3            | Not run           | —                                          | —                          | —                        | —                          | —                | —                         | —                            |
| P4 (optional) | Not run           | —                                          | —                          | —                        | —                          | —                | —                         | —                            |
| P5 (optional) | Not run           | —                                          | —                          | —                        | —                          | —                | —                         | —                            |

Report task success as **success / assisted / failed**, with short anonymous observations. If five participate, the product brief's understanding target is at least four of five; with three or four, report raw counts rather than silently treating them as a five-person result. Record actual task times; no performance target has been validated yet.

After the sessions, summarize the main misunderstandings, severity and concrete design changes. Retest material fixes with the affected participants when possible. Link the real evidence and fixes from [issue #5](https://github.com/DuhItzAniket/TradeCrafters/issues/5) before closing M3. Missing feedback is an open acceptance item, not a passing result.
