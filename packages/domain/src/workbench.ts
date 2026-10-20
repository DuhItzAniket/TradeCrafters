import { parseMinor } from "./index";
import { decimalPrice, roundHalfEven } from "./trading";
import {
  checkOrderRules,
  sessionState,
  type CalendarDefinition,
  type RuleDefinition,
} from "./market-policy";

export type ChartPoint = { at: string; price: string };
export const chartModel = "authored-path-v1";
// Authored shape, not market observations. Every request derives the same prefix.
const anchors = [-90, -110, -45, -65, -15, 25, 0];
export function trainingSeries(input: {
  listingId: string;
  reference: string;
  marketAt: string;
  calendar: CalendarDefinition;
  rules: RuleDefinition;
  minutes: 15 | 60;
}): ChartPoint[] {
  const { reference, marketAt, rules, calendar } = input;
  if (
    ![15, 60].includes(input.minutes) ||
    !Number.isFinite(Date.parse(marketAt))
  )
    throw Error("INVALID_CHART_WINDOW");
  if (
    checkOrderRules(rules, {
      quantity: rules.boardLot,
      price: reference,
      type: "market",
    }) !== "ELIGIBLE"
  )
    throw Error("INVALID_CHART_REFERENCE");
  const ref = parseMinor(reference, rules.quoteDecimals);
  const seed = [...input.listingId].reduce(
    (n, char) => n + char.charCodeAt(0),
    0,
  );
  const points: ChartPoint[] = [];
  for (let i = 60 - input.minutes; i <= 60; i++) {
    const at = new Date(Date.parse(marketAt) - (60 - i) * 60000);
    if (sessionState(calendar, at).phase !== "continuous") continue;
    const segment = Math.min(5, Math.floor(i / 10));
    const offset =
      i === 60
        ? 0
        : Math.round(
            anchors[segment] +
              ((anchors[segment + 1] - anchors[segment]) * (i % 10)) / 10,
          ) +
          (((seed + i * 17) % 13) - 6) * 2;
    const raw = ref + roundHalfEven(ref * BigInt(offset), 10000n);
    const candidates = rules.ticks.flatMap((tick) => {
      const step = parseMinor(tick.step, rules.quoteDecimals),
        from = parseMinor(tick.from, rules.quoteDecimals),
        to = tick.to === null ? null : parseMinor(tick.to, rules.quoteDecimals);
      let value = roundHalfEven(raw, step) * step;
      if (value < from) value = ((from + step - 1n) / step) * step;
      if (to !== null && value >= to) value = ((to - 1n) / step) * step;
      const price = decimalPrice(value, rules.quoteDecimals);
      return value >= from &&
        (to === null || value < to) &&
        checkOrderRules(rules, {
          quantity: rules.boardLot,
          price,
          type: "market",
        }) === "ELIGIBLE"
        ? [{ value, price }]
        : [];
    });
    if (!candidates.length) throw Error("CHART_PRICE_UNAVAILABLE");
    const abs = (n: bigint) => (n < 0n ? -n : n);
    const closest = candidates.reduce((a, b) =>
      abs(a.value - raw) <= abs(b.value - raw) ? a : b,
    );
    points.push({
      at: at.toISOString(),
      price: i === 60 ? reference : closest.price,
    });
  }
  return points;
}

export type ListingFilters = {
  q: string;
  region: string;
  country: string;
  currency: string;
  mic: string;
  pinnedOnly: boolean;
};
export function filterTrainingListings<
  T extends {
    id: string;
    name: string;
    symbol: string;
    mic: string;
    region: string;
    country: string;
    currency: string;
  },
>(
  listings: readonly T[],
  filters: ListingFilters,
  pins: readonly string[] = [],
) {
  const q = filters.q.trim().toLowerCase();
  return listings.filter(
    (row) =>
      (!filters.region || row.region === filters.region) &&
      (!filters.country || row.country === filters.country) &&
      (!filters.currency || row.currency === filters.currency) &&
      (!filters.mic || row.mic === filters.mic) &&
      (!filters.pinnedOnly || pins.includes(row.id)) &&
      `${row.name} ${row.symbol} ${row.mic} ${row.country} ${row.currency}`
        .toLowerCase()
        .includes(q),
  );
}
