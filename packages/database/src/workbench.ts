import { scenarios } from "@tradecrafters/market-catalog/scenarios";
import { trainingSeries, chartModel } from "@tradecrafters/domain/workbench";
import { nextContinuousSession } from "@tradecrafters/domain/market-policy";
import {
  TradingFault,
  trainingModel,
  trainingScenario,
} from "@tradecrafters/domain/trading";
import type { RowDataPacket } from "mysql2/promise";
import { trainingMarketAt } from "./trading";
import { listingPolicy } from "./policies";
import { getPool } from "./pool";

export async function trainingChart(listingId: string, minutes: 15 | 60 = 60) {
  const listing = scenarios.find((row) => row.id === listingId);
  if (!listing)
    throw new TradingFault(
      "NOT_FOUND",
      "No training chart is available for this listing.",
      404,
    );
  const [rows] = await getPool().execute<RowDataPacket[]>(
    "SELECT l.*,s.fictional FROM listings l JOIN securities s ON s.id=l.security_id WHERE l.id=?",
    [listingId],
  );
  const row = rows[0];
  if (
    !row ||
    Number(row.fictional) !== 1 ||
    row.mic !== listing.mic ||
    row.timezone !== listing.timezone ||
    row.settlement_currency !== listing.currency ||
    row.quote_unit !== listing.quoteUnit ||
    String(row.unit_numerator) !== listing.unitNumerator ||
    String(row.unit_denominator) !== listing.unitDenominator
  )
    throw new TradingFault(
      "LISTING_UNAVAILABLE",
      "Training listing metadata could not be verified.",
      503,
    );
  const observed = new Date(),
    marketAt = trainingMarketAt(listing.timezone);
  const view = await listingPolicy(
    listingId,
    new Date(marketAt),
    "synthetic",
    undefined,
    observed,
  );
  const policy = view?.policy;
  return {
    listingId,
    mic: listing.mic,
    dataMode: "synthetic" as const,
    provider: "project-authored training path",
    chartModel,
    executionModel: trainingModel,
    scenario: trainingScenario,
    marketAt,
    observedAt: observed.toISOString(),
    expiresAt: new Date(observed.getTime() + 60000).toISOString(),
    eligible: view?.sessionEligible ?? false,
    code: view?.code ?? "POLICY_MISSING",
    message: view?.message ?? "Training policy is unavailable.",
    phase: view?.session?.phase ?? "unavailable",
    closesAt: view?.session?.closesAt ?? null,
    nextSession: policy
      ? nextContinuousSession(policy.calendar, new Date(marketAt))
      : null,
    rules: policy?.rules ?? null,
    policyId: policy?.id ?? null,
    points: policy
      ? trainingSeries({
          listingId,
          reference: listing.price,
          marketAt,
          calendar: policy.calendar,
          rules: policy.rules,
          minutes,
        })
      : [],
    reference: policy ? listing.price : null,
    quoteUnit: listing.quoteUnit,
    currency: listing.currency,
    timezone: listing.timezone,
  };
}
export type TrainingChart = Awaited<ReturnType<typeof trainingChart>>;
