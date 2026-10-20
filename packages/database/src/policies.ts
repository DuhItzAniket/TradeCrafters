import { createHash } from "node:crypto";
import type { RowDataPacket, PoolConnection } from "mysql2/promise";
import {
  calendarSchema,
  ruleSchema,
  permissionSchema,
  validateCalendar,
  sessionState,
  policyInstant,
  type CalendarDefinition,
  type RuleDefinition,
  type PolicyPermission,
} from "@tradecrafters/domain/market-policy";
import { getPool } from "./pool";

function canonical(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  if (value !== null && typeof value === "object")
    return `{${Object.entries(value)
      .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
      .map(([key, item]) => `${JSON.stringify(key)}:${canonical(item)}`)
      .join(",")}}`;
  return JSON.stringify(value);
}
export const policyHash = (value: unknown) =>
  createHash("sha256").update(canonical(value)).digest("hex");
const utc = (value: string | Date) =>
  typeof value === "string" ? policyInstant(value) : value.toISOString();
const sqlInstant = (value: string) => new Date(value);

async function immutableVersion(
  connection: PoolConnection,
  table: "market_calendar_versions" | "trading_rule_versions",
  value: CalendarDefinition | RuleDefinition,
) {
  const hash = policyHash(value);
  await connection.execute(
    `INSERT INTO ${table} (id,definition,content_hash) VALUES (?,?,?) ON DUPLICATE KEY UPDATE id = VALUES(id)`,
    [value.id, JSON.stringify(value), hash],
  );
  const [rows] = await connection.execute<RowDataPacket[]>(
    `SELECT content_hash FROM ${table} WHERE id=?`,
    [value.id],
  );
  if (rows[0].content_hash !== hash) throw Error("IMMUTABLE_POLICY_VERSION");
}
export async function publishListingPolicy(input: {
  listingId: string;
  calendar: CalendarDefinition;
  rules: RuleDefinition;
  effectiveFrom: string;
  effectiveTo: string;
  permissions: PolicyPermission;
  reason: string;
}) {
  const calendar = validateCalendar(input.calendar),
    rules = ruleSchema.parse(input.rules);
  const parsedPermission = permissionSchema.parse(input.permissions);
  const permissions = {
    ...parsedPermission,
    verifiedAt: parsedPermission.verifiedAt
      ? utc(parsedPermission.verifiedAt)
      : null,
    expiresAt: utc(parsedPermission.expiresAt),
  };
  const from = utc(input.effectiveFrom),
    to = utc(input.effectiveTo);
  if (
    to <= from ||
    !/^[a-zA-Z0-9_-]{1,64}$/.test(input.listingId) ||
    input.reason.trim().length < 10 ||
    input.reason.length > 300
  )
    throw Error("INVALID_POLICY_ASSIGNMENT");
  if (
    calendar.dataMode !== rules.dataMode ||
    calendar.evidenceKind !== rules.evidenceKind
  )
    throw Error("POLICY_MODE_MISMATCH");
  if (calendar.dataMode === "real" && calendar.evidenceKind !== "reviewed")
    throw Error("UNREVIEWED_POLICY");
  const id = policyHash({
    listingId: input.listingId,
    calendar: policyHash(calendar),
    rules: policyHash(rules),
    from,
    to,
    permissions,
  });
  const connection = await getPool().getConnection();
  try {
    await connection.beginTransaction();
    // Every assignment writer locks the existing listing, including when no assignment exists yet.
    const [listings] = await connection.execute<RowDataPacket[]>(
      "SELECT l.id,l.timezone,s.fictional FROM listings l JOIN securities s ON s.id=l.security_id WHERE l.id=? FOR UPDATE",
      [input.listingId],
    );
    if (!listings.length) throw Error("LISTING_NOT_FOUND");
    if (
      (calendar.dataMode === "synthetic") !==
        (Number(listings[0].fictional) === 1) ||
      calendar.timezone !== listings[0].timezone
    )
      throw Error("LISTING_POLICY_MISMATCH");
    const [overlaps] = await connection.execute<RowDataPacket[]>(
      "SELECT id FROM listing_policy_versions WHERE listing_id=? AND data_mode=? AND effective_from < ? AND effective_to > ? FOR UPDATE",
      [input.listingId, calendar.dataMode, sqlInstant(to), sqlInstant(from)],
    );
    if (overlaps.length === 1 && overlaps[0].id === id) {
      await connection.commit();
      return id;
    }
    if (overlaps.length) throw Error("OVERLAPPING_POLICY_ASSIGNMENT");
    await immutableVersion(connection, "market_calendar_versions", calendar);
    await immutableVersion(connection, "trading_rule_versions", rules);
    await connection.execute(
      "INSERT INTO listing_policy_versions (id,listing_id,calendar_id,rule_id,data_mode,effective_from,effective_to) VALUES (?,?,?,?,?,?,?)",
      [
        id,
        input.listingId,
        calendar.id,
        rules.id,
        calendar.dataMode,
        sqlInstant(from),
        sqlInstant(to),
      ],
    );
    await connection.execute(
      "INSERT INTO listing_policy_permissions (policy_id,status,display_allowed,simulation_allowed,replay_allowed,verified_at,expires_at,evidence_ref,reason) VALUES (?,?,?,?,?,?,?,?,?)",
      [
        id,
        permissions.status,
        permissions.displayAllowed,
        permissions.simulationAllowed,
        permissions.replayAllowed,
        permissions.verifiedAt ? sqlInstant(permissions.verifiedAt) : null,
        sqlInstant(permissions.expiresAt),
        permissions.evidenceRef,
        permissions.reason,
      ],
    );
    await connection.execute(
      "INSERT INTO catalog_policy_audit (policy_id,reason) VALUES (?,?)",
      [id, input.reason.trim()],
    );
    await connection.commit();
    return id;
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
}

export async function listingPolicy(
  listingId: string,
  at = new Date(),
  requestedMode?: "synthetic" | "real",
) {
  const [listings] = await getPool().execute<RowDataPacket[]>(
    "SELECT l.id,l.mic,l.timezone,s.fictional FROM listings l JOIN securities s ON s.id=l.security_id WHERE l.id=?",
    [listingId],
  );
  const listing = listings[0];
  if (!listing) return null;
  const mode =
    requestedMode ?? (Number(listing.fictional) === 1 ? "synthetic" : "real");
  const base = {
    listingId,
    checkedAt: at.toISOString(),
    dataMode: mode,
    executionAvailable: false as const,
    realDataEnabled: false,
    policy: null as null | {
      id: string;
      effectiveFrom: string;
      effectiveTo: string;
      calendar: CalendarDefinition;
      rules: RuleDefinition;
    },
    session: null as null | ReturnType<typeof sessionState>,
    sessionEligible: false,
  };
  const blocked = (code: string, message: string) => ({
    ...base,
    code,
    message,
  });
  if ((mode === "synthetic") !== (Number(listing.fictional) === 1))
    return blocked(
      "MODE_MISMATCH",
      "Fictional and real-market policies cannot be interchanged.",
    );
  const [rows] = await getPool().execute<RowDataPacket[]>(
    "SELECT p.*,c.definition AS calendar_definition,c.content_hash AS calendar_hash,r.definition AS rule_definition,r.content_hash AS rule_hash,a.status,a.display_allowed,a.simulation_allowed,a.replay_allowed,a.verified_at,a.expires_at FROM listing_policy_versions p JOIN market_calendar_versions c ON c.id=p.calendar_id JOIN trading_rule_versions r ON r.id=p.rule_id LEFT JOIN listing_policy_permissions a ON a.policy_id=p.id WHERE p.listing_id=? AND p.data_mode=? AND p.effective_from<=? AND p.effective_to>? LIMIT 2",
    [listingId, mode, at, at],
  );
  if (rows.length !== 1)
    return blocked(
      rows.length ? "POLICY_CONFLICT" : "POLICY_MISSING",
      "A single effective calendar and rule version is required.",
    );
  const row = rows[0];
  try {
    const calendar = calendarSchema.parse(row.calendar_definition),
      rules = ruleSchema.parse(row.rule_definition);
    if (
      policyHash(calendar) !== row.calendar_hash ||
      policyHash(rules) !== row.rule_hash ||
      calendar.id !== row.calendar_id ||
      rules.id !== row.rule_id
    )
      return blocked(
        "INVALID_POLICY",
        "Policy integrity could not be verified.",
      );
    if (
      calendar.dataMode !== mode ||
      rules.dataMode !== mode ||
      calendar.timezone !== listing.timezone ||
      (mode === "real" &&
        (calendar.evidenceKind !== "reviewed" ||
          rules.evidenceKind !== "reviewed"))
    )
      return blocked(
        "UNREVIEWED_POLICY",
        "The policy is not reviewed for this data mode.",
      );
    if (
      row.status !== "verified" ||
      Number(row.display_allowed) !== 1 ||
      Number(row.simulation_allowed) !== 1 ||
      !row.verified_at ||
      new Date(row.verified_at) > at ||
      new Date(row.expires_at) <= at
    )
      return blocked(
        "PERMISSION_REQUIRED",
        "Current display and simulation permission has not been verified.",
      );
    if (mode === "real") {
      const [rights] = await getPool().execute<RowDataPacket[]>(
        "SELECT status FROM venue_capabilities WHERE mic=? AND capability='real_simulation'",
        [listing.mic],
      );
      if (rights[0]?.status !== "verified")
        return blocked(
          "REAL_DATA_DISABLED",
          "Real-market rights and coverage remain unverified.",
        );
    }
    base.policy = {
      id: row.id,
      effectiveFrom: utc(row.effective_from),
      effectiveTo: utc(row.effective_to),
      calendar,
      rules,
    };
    base.session = sessionState(calendar, at);
    const [halts] = await getPool().execute<RowDataPacket[]>(
      "SELECT id FROM listing_halts WHERE listing_id=? AND starts_at<=? AND (ends_at IS NULL OR ends_at>?) LIMIT 1",
      [listingId, at, at],
    );
    if (halts.length)
      return blocked("HALTED", "The listing is halted for this session.");
    if (base.session.phase !== "continuous")
      return blocked(
        base.session.phase.toUpperCase(),
        base.session.phase === "out_of_coverage"
          ? "The date is outside this calendar's coverage."
          : base.session.phase === "break"
            ? "This training session is on a break."
            : base.session.phase === "auction"
              ? "This training session is in an auction; continuous trading is closed."
              : "This training session is closed.",
      );
    return {
      ...base,
      sessionEligible: true,
      code: "ELIGIBLE",
      message:
        mode === "synthetic"
          ? "This training session is open."
          : "The reviewed continuous session is open.",
    };
  } catch {
    return blocked(
      "INVALID_POLICY",
      "The calendar or rule definition is invalid; simulation remains disabled.",
    );
  }
}
export type ListingPolicyView = NonNullable<
  Awaited<ReturnType<typeof listingPolicy>>
>;
