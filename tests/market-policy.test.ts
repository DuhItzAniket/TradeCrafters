import { test } from "node:test";
import assert from "node:assert/strict";
import {
  validateCalendar,
  calendarSchema,
  permissionSchema,
  ruleSchema,
  sessionState,
  checkOrderRules,
  type CalendarDefinition,
} from "@tradecrafters/domain/market-policy";
import { fictionalPolicy } from "../packages/database/src/policy-fixtures";
import { scenarios } from "@tradecrafters/market-catalog/scenarios";
const tokyo = fictionalPolicy(scenarios[3]);
const state = (at: string, calendar: CalendarDefinition = tokyo.calendar) =>
  sessionState(calendar, new Date(at));

test("all ten regional fixture policies validate without claiming real-market approval", () => {
  for (const row of scenarios) {
    const fixture = fictionalPolicy(row);
    assert.equal(validateCalendar(fixture.calendar).dataMode, "synthetic");
    const rule = ruleSchema.parse(fixture.rules);
    assert.equal(
      checkOrderRules(rule, {
        quantity: String(row.lot),
        price: row.price,
        type: "market",
      }),
      "ELIGIBLE",
    );
  }
});
test("auction, continuous, lunch break and close use half-open session boundaries", () => {
  assert.equal(state("2026-10-20T00:00:00Z").phase, "continuous");
  assert.equal(state("2026-10-19T23:50:00Z").phase, "auction");
  assert.equal(state("2026-10-20T02:30:00Z").phase, "break");
  assert.equal(state("2026-10-20T03:30:00Z").phase, "continuous");
  assert.equal(state("2026-10-20T06:30:00Z").phase, "closed");
});
test("dated holiday and early-close overrides replace the regular trading day", () => {
  assert.equal(state("2026-10-21T01:00:00Z").phase, "holiday");
  assert.equal(state("2026-10-22T01:59:59Z").phase, "continuous");
  assert.equal(state("2026-10-22T02:00:00Z").phase, "closed");
  assert.equal(state("2027-02-01T01:00:00Z").phase, "out_of_coverage");
});
test("overnight windows retain the starting trading date across weekends and local holidays", () => {
  const calendar = validateCalendar({
    ...tokyo.calendar,
    timezone: "UTC",
    weekdays: [5],
    sessions: [
      { kind: "continuous", start: "22:00", end: "02:00", endDayOffset: 1 },
    ],
    exceptions: [
      { date: "2026-10-24", reason: "Saturday fixture closure", sessions: [] },
    ],
  });
  const overnight = state("2026-10-24T01:00:00Z", calendar);
  assert.equal(overnight.phase, "continuous");
  assert.equal(overnight.tradingDate, "2026-10-23");
  assert.equal(state("2026-10-24T02:00:00Z", calendar).phase, "holiday");
});
test("DST follows independent London and Sydney transitions and Sunday trading weeks", () => {
  const london = fictionalPolicy(scenarios[1]).calendar;
  assert.equal(state("2026-10-23T07:15:00Z", london).phase, "continuous");
  assert.equal(state("2026-10-26T07:15:00Z", london).phase, "closed");
  const sydney = fictionalPolicy(scenarios[5]).calendar;
  assert.equal(state("2026-10-01T23:15:00Z", sydney).phase, "closed");
  assert.equal(state("2026-10-05T23:15:00Z", sydney).phase, "continuous");
  const riyadh = fictionalPolicy(scenarios[8]).calendar;
  assert.equal(state("2026-10-25T08:00:00Z", riyadh).phase, "continuous");
  assert.equal(state("2026-10-23T08:00:00Z", riyadh).phase, "closed");
});
test("publishing rejects DST gaps, folds and cross-trading-date overlaps", () => {
  for (const date of ["2026-03-08", "2026-11-01"]) {
    const calendar = {
      ...tokyo.calendar,
      timezone: "America/New_York",
      weekdays: [0],
      sessions: [],
      exceptions: [
        {
          date,
          reason: "Ambiguous training session",
          sessions: [
            {
              kind: "continuous" as const,
              start: date.includes("03-08") ? "02:15" : "01:15",
              end: "03:30",
              endDayOffset: 0 as const,
            },
          ],
        },
      ],
    };
    assert.throws(
      () => validateCalendar(calendar),
      /multiple|no such|exist|ambiguous/i,
    );
  }
  assert.throws(() =>
    validateCalendar({
      ...tokyo.calendar,
      timezone: "UTC",
      weekdays: [1, 2, 3, 4, 5],
      exceptions: [],
      sessions: [
        { kind: "continuous", start: "01:00", end: "02:00", endDayOffset: 1 },
      ],
    }),
  );
});
test("malformed dates, duplicate exceptions and unsorted windows cannot become policies", () => {
  for (const coverageFrom of ["2026-02-30", "not-a-date"]) {
    assert.equal(
      calendarSchema.safeParse({ ...tokyo.calendar, coverageFrom }).success,
      false,
    );
  }
  assert.equal(
    permissionSchema.safeParse({
      ...tokyo.permissions,
      expiresAt: "not-a-date",
    }).success,
    false,
  );
  assert.equal(
    calendarSchema.safeParse({ ...tokyo.calendar, timezone: "Mars/Olympus" })
      .success,
    false,
  );
  assert.equal(
    calendarSchema.safeParse({ ...tokyo.calendar, weekdays: [1, 1] }).success,
    false,
  );
  assert.equal(
    calendarSchema.safeParse({
      ...tokyo.calendar,
      exceptions: [...tokyo.calendar.exceptions, ...tokyo.calendar.exceptions],
    }).success,
    false,
  );
  assert.equal(
    calendarSchema.safeParse({
      ...tokyo.calendar,
      sessions: [
        { kind: "continuous", start: "10:00", end: "09:00", endDayOffset: 0 },
      ],
    }).success,
    false,
  );
  assert.throws(() =>
    validateCalendar({ ...tokyo.calendar, coverageFrom: "2026-02-30" }),
  );
});
test("exact lot, tick ladder, price band and order type rules reject unsafe requests", () => {
  const rules = ruleSchema.parse(tokyo.rules);
  const order = { quantity: "100", price: "10000", type: "market" };
  assert.equal(checkOrderRules(rules, order), "ELIGIBLE");
  assert.equal(
    checkOrderRules(rules, { ...order, price: "10001" }),
    "INVALID_TICK",
  );
  assert.equal(
    checkOrderRules(rules, { ...order, price: "16845" }),
    "PRICE_BAND",
  );
  assert.equal(
    checkOrderRules(rules, { ...order, quantity: "99" }),
    "INVALID_LOT",
  );
  assert.equal(
    checkOrderRules(rules, { ...order, quantity: "100.0" }),
    "INVALID_QUANTITY",
  );
  assert.equal(
    checkOrderRules(rules, { ...order, price: "8420.1" }),
    "INVALID_PRICE",
  );
  assert.equal(
    checkOrderRules(rules, { ...order, type: "limit" }),
    "UNSUPPORTED_ORDER_TYPE",
  );
  assert.equal(
    ruleSchema.safeParse({
      ...rules,
      ticks: [
        { from: "0", to: "10000", step: "1" },
        { from: "10001", to: null, step: "5" },
      ],
    }).success,
    false,
  );
});
