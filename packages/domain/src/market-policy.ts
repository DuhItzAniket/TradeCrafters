import { Temporal } from "@js-temporal/polyfill";
import { z } from "zod";
import { parseMinor } from "./index";

const id = z.string().regex(/^[a-zA-Z0-9_-]{1,96}$/);
const date = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/)
  .refine((value) => {
    try {
      return Temporal.PlainDate.from(value).toString() === value;
    } catch {
      return false;
    }
  });
const time = z.string().regex(/^(?:[01]\d|2[0-3]):[0-5]\d$/);
const amount = z.string().regex(/^\d{1,18}(\.\d{1,6})?$/);
const mode = z.enum(["synthetic", "real"]);
const minutes = (value: string) =>
  Number(value.slice(0, 2)) * 60 + Number(value.slice(3));
const interval = z
  .object({
    kind: z.enum(["continuous", "auction"]),
    start: time,
    end: time,
    endDayOffset: z.union([z.literal(0), z.literal(1)]),
  })
  .strict();
const intervals = z
  .array(interval)
  .max(8)
  .superRefine((rows, context) => {
    let previousEnd = -1;
    for (const row of rows) {
      const start = minutes(row.start),
        end = minutes(row.end) + row.endDayOffset * 1440;
      if (start < previousEnd || end <= start || end - start > 1440)
        context.addIssue({
          code: "custom",
          message:
            "Sessions must be sorted, non-overlapping and at most 24 hours",
        });
      previousEnd = end;
    }
  });
const provenance = {
  dataMode: mode,
  evidenceKind: z.enum(["fictional", "reviewed"]),
  evidenceRef: z.string().min(8).max(255),
};
export const calendarSchema = z
  .object({
    id,
    ...provenance,
    timezone: z
      .string()
      .min(1)
      .max(64)
      .refine((value) => {
        try {
          new Intl.DateTimeFormat("en", { timeZone: value });
          return !/^[+-]/.test(value);
        } catch {
          return false;
        }
      }),
    coverageFrom: date,
    coverageTo: date,
    weekdays: z.array(z.number().int().min(0).max(6)).min(1).max(7),
    sessions: intervals,
    exceptions: z
      .array(
        z
          .object({
            date,
            reason: z.string().min(3).max(200),
            sessions: intervals,
          })
          .strict(),
      )
      .max(400),
  })
  .strict()
  .superRefine((value, context) => {
    let days: number;
    try {
      days = Temporal.PlainDate.from(value.coverageFrom).until(
        value.coverageTo,
      ).days;
    } catch {
      context.addIssue({ code: "custom", message: "Invalid coverage dates" });
      return;
    }
    if (
      days < 1 ||
      days > 1096 ||
      new Set(value.weekdays).size !== value.weekdays.length ||
      new Set(value.exceptions.map((row) => row.date)).size !==
        value.exceptions.length ||
      value.exceptions.some(
        (row) => row.date < value.coverageFrom || row.date >= value.coverageTo,
      )
    )
      context.addIssue({
        code: "custom",
        message: "Invalid coverage, weekdays or exception dates",
      });
  });
export type CalendarDefinition = z.infer<typeof calendarSchema>;
export const ruleSchema = z
  .object({
    id,
    ...provenance,
    quoteDecimals: z.number().int().min(0).max(6),
    boardLot: z.string().regex(/^[1-9]\d{0,17}$/),
    maxQuantity: z.string().regex(/^[1-9]\d{0,17}$/),
    orderTypes: z.array(z.literal("market")).length(1),
    ticks: z
      .array(
        z
          .object({ from: amount, to: amount.nullable(), step: amount })
          .strict(),
      )
      .min(1)
      .max(20),
    priceBand: z.object({ lower: amount, upper: amount }).strict(),
  })
  .strict()
  .superRefine((value, context) => {
    try {
      let boundary = 0n;
      for (const [index, tick] of value.ticks.entries()) {
        const from = parseMinor(tick.from, value.quoteDecimals),
          step = parseMinor(tick.step, value.quoteDecimals);
        const to =
          tick.to === null ? null : parseMinor(tick.to, value.quoteDecimals);
        if (
          from !== boundary ||
          step <= 0n ||
          from % step !== 0n ||
          (to !== null && to <= from) ||
          (to === null) !== (index === value.ticks.length - 1)
        )
          throw Error();
        if (to !== null) boundary = to;
      }
      if (
        BigInt(value.maxQuantity) < BigInt(value.boardLot) ||
        parseMinor(value.priceBand.lower, value.quoteDecimals) <= 0n ||
        parseMinor(value.priceBand.upper, value.quoteDecimals) <
          parseMinor(value.priceBand.lower, value.quoteDecimals)
      )
        throw Error();
    } catch {
      context.addIssue({
        code: "custom",
        message: "Invalid exact tick ladder, price band or quantity bounds",
      });
    }
  });
export type RuleDefinition = z.infer<typeof ruleSchema>;
export function policyInstant(value: string) {
  const instant = Temporal.Instant.from(value);
  if (instant.epochNanoseconds % 1000000n !== 0n)
    throw Error("SUBMILLISECOND_POLICY_TIME");
  return new Date(instant.epochMilliseconds).toISOString();
}
export const permissionSchema = z
  .object({
    status: z.enum(["unknown", "blocked", "verified"]),
    displayAllowed: z.boolean(),
    simulationAllowed: z.boolean(),
    replayAllowed: z.boolean(),
    verifiedAt: z.string().datetime().nullable(),
    expiresAt: z.string().datetime(),
    evidenceRef: z.string().min(8).max(255),
    reason: z.string().min(10).max(255),
  })
  .strict()
  .refine((value) => {
    if (value.status !== "verified") return true;
    if (value.verifiedAt === null) return false;
    try {
      return (
        Temporal.Instant.compare(
          Temporal.Instant.from(value.expiresAt),
          Temporal.Instant.from(value.verifiedAt),
        ) > 0
      );
    } catch {
      return false;
    }
  }, "Verified permission needs a bounded verification period");
export type PolicyPermission = z.infer<typeof permissionSchema>;

function intervalsOn(calendar: CalendarDefinition, day: Temporal.PlainDate) {
  const key = day.toString();
  if (key < calendar.coverageFrom || key >= calendar.coverageTo) return [];
  const exception = calendar.exceptions.find((row) => row.date === key);
  const rows =
    exception?.sessions ??
    (calendar.weekdays.includes(day.dayOfWeek % 7) ? calendar.sessions : []);
  return rows.map((row) => {
    const zoned = (date: Temporal.PlainDate, time: string) =>
      date
        .toPlainDateTime(time)
        .toZonedDateTime(calendar.timezone, { disambiguation: "reject" })
        .toInstant();
    const open = zoned(day, row.start),
      close = zoned(day.add({ days: row.endDayOffset }), row.end);
    if (Temporal.Instant.compare(close, open) <= 0)
      throw Error("INVALID_SESSION");
    return {
      ...row,
      tradingDate: key,
      opensAt: open.toString(),
      closesAt: close.toString(),
      open,
      close,
    };
  });
}
export function validateCalendar(input: unknown): CalendarDefinition {
  const calendar = calendarSchema.parse(input);
  let previousClose: Temporal.Instant | undefined;
  for (
    let day = Temporal.PlainDate.from(calendar.coverageFrom);
    day.toString() < calendar.coverageTo;
    day = day.add({ days: 1 })
  ) {
    for (const row of intervalsOn(calendar, day)) {
      if (
        previousClose &&
        Temporal.Instant.compare(row.open, previousClose) < 0
      )
        throw Error("OVERLAPPING_CALENDAR_SESSIONS");
      previousClose = row.close;
    }
  }
  return calendar;
}
export function sessionState(calendar: CalendarDefinition, at: Date) {
  const instant = Temporal.Instant.from(at.toISOString()),
    local = instant.toZonedDateTimeISO(calendar.timezone),
    day = local.toPlainDate();
  const rows = [
    ...intervalsOn(calendar, day.subtract({ days: 1 })),
    ...intervalsOn(calendar, day),
  ];
  const active = rows.filter(
    (row) =>
      Temporal.Instant.compare(instant, row.open) >= 0 &&
      Temporal.Instant.compare(instant, row.close) < 0,
  );
  if (active.length > 1) throw Error("OVERLAPPING_CALENDAR_SESSIONS");
  const current = active.at(0);
  const today = rows.filter((row) => row.tradingDate === day.toString());
  const onBreak =
    today.some((row) => Temporal.Instant.compare(instant, row.close) >= 0) &&
    today.some((row) => Temporal.Instant.compare(instant, row.open) < 0);
  const phase =
    current?.kind ??
    (day.toString() < calendar.coverageFrom ||
    day.toString() >= calendar.coverageTo
      ? "out_of_coverage"
      : calendar.exceptions.some(
            (row) => row.date === day.toString() && row.sessions.length === 0,
          )
        ? "holiday"
        : onBreak
          ? "break"
          : "closed");
  return {
    phase,
    localDate: day.toString(),
    localTime: local.toPlainTime().toString().slice(0, 5),
    tradingDate: current?.tradingDate ?? day.toString(),
    opensAt: current?.opensAt ?? null,
    closesAt: current?.closesAt ?? null,
    exceptionReason:
      calendar.exceptions.find(
        (row) => row.date === (current?.tradingDate ?? day.toString()),
      )?.reason ?? null,
    sessions: intervalsOn(
      calendar,
      current ? Temporal.PlainDate.from(current.tradingDate) : day,
    ).map(({ kind, start, end, endDayOffset }) => ({
      kind,
      start,
      end,
      endDayOffset,
    })),
  };
}

// The price passed here must come from the server's quote/scenario, never an order's client-supplied fill price.
export function checkOrderRules(
  rules: RuleDefinition,
  order: { quantity: string; price: string; type: string },
) {
  if (!rules.orderTypes.includes(order.type as "market"))
    return "UNSUPPORTED_ORDER_TYPE";
  if (
    typeof order.quantity !== "string" ||
    !/^[1-9]\d{0,17}$/.test(order.quantity)
  )
    return "INVALID_QUANTITY";
  const quantity = BigInt(order.quantity);
  if (
    quantity % BigInt(rules.boardLot) !== 0n ||
    quantity > BigInt(rules.maxQuantity)
  )
    return "INVALID_LOT";
  let price: bigint;
  try {
    price = parseMinor(order.price, rules.quoteDecimals);
  } catch {
    return "INVALID_PRICE";
  }
  if (price <= 0n) return "INVALID_PRICE";
  if (
    price < parseMinor(rules.priceBand.lower, rules.quoteDecimals) ||
    price > parseMinor(rules.priceBand.upper, rules.quoteDecimals)
  )
    return "PRICE_BAND";
  const tick = rules.ticks.find(
    (row) =>
      price >= parseMinor(row.from, rules.quoteDecimals) &&
      (row.to === null || price < parseMinor(row.to, rules.quoteDecimals)),
  );
  if (!tick || price % parseMinor(tick.step, rules.quoteDecimals) !== 0n)
    return "INVALID_TICK";
  return "ELIGIBLE";
}
