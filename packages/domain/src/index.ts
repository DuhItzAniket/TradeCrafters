export const currencies = [
  { code: "USD", exponent: 2, name: "US dollar", seedRate: [1n, 1n] },
  { code: "EUR", exponent: 2, name: "Euro", seedRate: [9n, 10n] },
  { code: "GBP", exponent: 2, name: "Pound sterling", seedRate: [8n, 10n] },
  { code: "INR", exponent: 2, name: "Indian rupee", seedRate: [83n, 1n] },
  { code: "JPY", exponent: 0, name: "Japanese yen", seedRate: [150n, 1n] },
  { code: "HKD", exponent: 2, name: "Hong Kong dollar", seedRate: [78n, 10n] },
  { code: "AUD", exponent: 2, name: "Australian dollar", seedRate: [15n, 10n] },
  { code: "CAD", exponent: 2, name: "Canadian dollar", seedRate: [14n, 10n] },
  { code: "ZAR", exponent: 2, name: "South African rand", seedRate: [18n, 1n] },
  { code: "BRL", exponent: 2, name: "Brazilian real", seedRate: [5n, 1n] },
  { code: "SAR", exponent: 2, name: "Saudi riyal", seedRate: [375n, 100n] },
  { code: "KWD", exponent: 3, name: "Kuwaiti dinar", seedRate: [3n, 10n] },
] as const;
export type CurrencyCode = (typeof currencies)[number]["code"];
export function currency(code: string) {
  const value = currencies.find((item) => item.code === code);
  if (!value) throw new Error("UNSUPPORTED_CURRENCY");
  return value;
}

export function parseMinor(value: string, exponent: number): bigint {
  if (!Number.isInteger(exponent) || exponent < 0 || exponent > 6)
    throw new Error("INVALID_EXPONENT");
  if (!/^\d{1,18}(\.\d{1,6})?$/.test(value)) throw new Error("INVALID_AMOUNT");
  const [whole, fraction = ""] = value.split(".");
  if (fraction.length > exponent) throw new Error("AMOUNT_PRECISION");
  return (
    BigInt(whole) * 10n ** BigInt(exponent) +
    BigInt(fraction.padEnd(exponent, "0") || "0")
  );
}

export function formatMinor(value: string | bigint, exponent: number): string {
  const amount = BigInt(value);
  const sign = amount < 0n ? "−" : "";
  const digits = (amount < 0n ? -amount : amount)
    .toString()
    .padStart(exponent + 1, "0");
  const whole = exponent ? digits.slice(0, -exponent) : digits;
  return `${sign}${whole.replace(/\B(?=(\d{3})+(?!\d))/g, ",")}${exponent ? `.${digits.slice(-exponent)}` : ""}`;
}

// One fixed USD-equivalent grant, translated using an explicitly fictional rate.
// These are scenario constants, never market FX or portfolio valuation marks.
export function openingGrant(code: CurrencyCode) {
  const item = currency(code);
  const [numerator, denominator] = item.seedRate;
  return {
    version: "synthetic-grant-v1",
    baseCurrency: "USD",
    baseMinor: "10000000",
    currency: code,
    minor: (
      (100000n * numerator * 10n ** BigInt(item.exponent)) /
      denominator
    ).toString(),
    rateNumerator: numerator.toString(),
    rateDenominator: denominator.toString(),
  };
}

// Quote units are ratios within one currency, not cross-currency FX.
export function quoteToMinor(
  value: string,
  quoteDecimals: number,
  unitNumerator: bigint,
  unitDenominator: bigint,
  settlementExponent: number,
) {
  if (unitNumerator <= 0n || unitDenominator <= 0n)
    throw new Error("INVALID_QUOTE_UNIT");
  const numerator =
    parseMinor(value, quoteDecimals) *
    unitNumerator *
    10n ** BigInt(settlementExponent);
  const denominator = unitDenominator * 10n ** BigInt(quoteDecimals);
  if (numerator % denominator !== 0n)
    throw new Error("NON_REPRESENTABLE_MINOR_AMOUNT");
  return numerator / denominator;
}

export type SessionPolicy = {
  timezone: string;
  weekdays: number[];
  intervals: [string, string][];
  closedDates: string[];
};
export function isContinuousSession(at: Date, policy: SessionPolicy): boolean {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: policy.timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
    weekday: "short",
  }).formatToParts(at);
  const part = (type: string) =>
    parts.find((item) => item.type === type)!.value;
  const date = `${part("year")}-${part("month")}-${part("day")}`;
  const weekday = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].indexOf(
    part("weekday"),
  );
  const time = `${part("hour")}:${part("minute")}`;
  return (
    !policy.closedDates.includes(date) &&
    policy.weekdays.includes(weekday) &&
    policy.intervals.some(([start, end]) => time >= start && time < end)
  );
}
