import {
  scenarios,
  type Scenario,
} from "@tradecrafters/market-catalog/scenarios";
import { parseMinor, formatMinor } from "@tradecrafters/domain";
import type {
  CalendarDefinition,
  RuleDefinition,
} from "@tradecrafters/domain/market-policy";
import { publishListingPolicy } from "./policies";

export function fictionalPolicy(row: Scenario) {
  const hours: Record<string, [string, string][]> = {
    XNAS: [["09:30", "16:00"]],
    XLON: [["08:00", "16:30"]],
    XNSE: [["09:15", "15:30"]],
    XTKS: [
      ["09:00", "11:30"],
      ["12:30", "15:30"],
    ],
    XHKG: [
      ["09:30", "12:00"],
      ["13:00", "16:00"],
    ],
    XASX: [["10:00", "16:00"]],
    XJSE: [["09:00", "17:00"]],
    BVMF: [["10:00", "17:00"]],
    XSAU: [["10:00", "15:00"]],
    XKUW: [["09:00", "12:30"]],
  };
  const sessions = hours[row.mic].map(([start, end]) => ({
    kind: "continuous" as const,
    start,
    end,
    endDayOffset: 0 as const,
  }));
  const first = sessions[0];
  const startMinutes =
    Number(first.start.slice(0, 2)) * 60 + Number(first.start.slice(3)) - 10;
  const auctionStart = `${String(Math.floor(startMinutes / 60)).padStart(2, "0")}:${String(startMinutes % 60).padStart(2, "0")}`;
  const evidenceRef =
    "docs/implementation/market-policies.md#fictional-fixtures";
  const calendar: CalendarDefinition = {
    id: `fictional-${row.mic.toLowerCase()}-2026-v1`,
    dataMode: "synthetic",
    evidenceKind: "fictional",
    evidenceRef,
    timezone: row.timezone,
    coverageFrom: "2026-01-01",
    coverageTo: "2027-01-01",
    weekdays: ["SA", "KW"].includes(row.country)
      ? [0, 1, 2, 3, 4]
      : [1, 2, 3, 4, 5],
    sessions: [
      {
        kind: "auction",
        start: auctionStart,
        end: first.start,
        endDayOffset: 0,
      },
      ...sessions,
    ],
    exceptions: [
      {
        date: "2026-10-21",
        reason: "Fictional training holiday; not an exchange holiday claim",
        sessions: [],
      },
      {
        date: "2026-10-22",
        reason: "Fictional early-close training session",
        sessions: [{ ...first, end: "11:00" }],
      },
    ],
  };
  const decimals = row.price.split(".")[1]?.length ?? 0;
  const price = parseMinor(row.price, decimals);
  const quote = (value: bigint) =>
    formatMinor(value, decimals).replaceAll(",", "");
  const rules: RuleDefinition = {
    id: `fictional-${row.id}-v1`,
    dataMode: "synthetic",
    evidenceKind: "fictional",
    evidenceRef,
    quoteDecimals: decimals,
    boardLot: String(row.lot),
    maxQuantity: "1000000",
    orderTypes: ["market"],
    ticks:
      row.currency === "JPY"
        ? [
            { from: "0", to: "10000", step: "1" },
            { from: "10000", to: null, step: "5" },
          ]
        : [
            {
              from: "0",
              to: null,
              step:
                row.unitDenominator === "100"
                  ? "1"
                  : decimals === 3
                    ? "0.001"
                    : "0.01",
            },
          ],
    priceBand: { lower: quote(price / 2n), upper: quote(price * 2n) },
  };
  return {
    listingId: row.id,
    calendar,
    rules,
    effectiveFrom: "2026-01-01T00:00:00.000Z",
    effectiveTo: "2027-01-01T00:00:00.000Z",
    permissions: {
      status: "verified" as const,
      displayAllowed: true,
      simulationAllowed: true,
      replayAllowed: true,
      verifiedAt: "2026-01-01T00:00:00.000Z",
      expiresAt: "2027-01-01T00:00:00.000Z",
      evidenceRef,
      reason:
        "Project-owned fictional training fixtures; no real-market entitlement",
    },
    reason: "Publish versioned fictional training calendar and rule fixtures",
  };
}
export async function seedMarketPolicies() {
  for (const row of scenarios) await publishListingPolicy(fictionalPolicy(row));
  return { policies: scenarios.length };
}
