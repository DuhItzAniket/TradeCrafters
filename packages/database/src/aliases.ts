import { randomUUID } from "node:crypto";
import type { RowDataPacket, ResultSetHeader } from "mysql2/promise";
import {
  aliasAssignmentSchema,
  aliasLookupSchema,
  catalogDate,
  type AliasAssignment,
} from "@tradecrafters/domain/catalog";
import { scenarios } from "@tradecrafters/market-catalog/scenarios";
import { getPool } from "./pool";

export async function assignProviderAlias(input: AliasAssignment) {
  const value = aliasAssignmentSchema.parse(input);
  const connection = await getPool().getConnection();
  try {
    await connection.beginTransaction();
    const [listing] = await connection.execute<RowDataPacket[]>(
      "SELECT id FROM listings WHERE id=? FOR UPDATE",
      [value.listingId],
    );
    if (!listing.length) throw Error("LISTING_NOT_FOUND");
    await connection.execute(
      "INSERT INTO provider_alias_namespaces (provider,alias) VALUES (?,?) ON DUPLICATE KEY UPDATE provider=VALUES(provider)",
      [value.provider, value.alias],
    );
    await connection.execute(
      "SELECT provider FROM provider_alias_namespaces WHERE provider=? AND alias=? FOR UPDATE",
      [value.provider, value.alias],
    );
    const [overlap] = await connection.execute<RowDataPacket[]>(
      "SELECT id,listing_id,alias,DATE_FORMAT(effective_from,'%Y-%m-%d') AS starts,DATE_FORMAT(effective_to,'%Y-%m-%d') AS ends FROM provider_aliases WHERE provider=? AND (alias=? OR listing_id=?) AND (? IS NULL OR effective_from<?) AND (effective_to IS NULL OR effective_to>?) FOR UPDATE",
      [
        value.provider,
        value.alias,
        value.listingId,
        value.effectiveTo,
        value.effectiveTo,
        value.effectiveFrom,
      ],
    );
    if (
      overlap.length === 1 &&
      overlap[0].listing_id === value.listingId &&
      overlap[0].alias === value.alias &&
      overlap[0].starts === value.effectiveFrom &&
      overlap[0].ends === value.effectiveTo
    ) {
      await connection.commit();
      return String(overlap[0].id);
    }
    if (overlap.length) throw Error("OVERLAPPING_PROVIDER_ALIAS");
    const [inserted] = await connection.execute<ResultSetHeader>(
      "INSERT INTO provider_aliases (listing_id,provider,alias,effective_from,effective_to) VALUES (?,?,?,?,?)",
      [
        value.listingId,
        value.provider,
        value.alias,
        value.effectiveFrom,
        value.effectiveTo,
      ],
    );
    const id = String(inserted.insertId);
    await connection.execute(
      "INSERT INTO catalog_audit (id,action,subject,actor,reason,detail) VALUES (?,'alias_assign',?,?,?,?)",
      [
        randomUUID(),
        `alias:${value.provider}:${value.alias}`,
        value.actor,
        value.reason,
        JSON.stringify({
          id,
          listingId: value.listingId,
          effectiveFrom: value.effectiveFrom,
          effectiveTo: value.effectiveTo,
        }),
      ],
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

export async function resolveProviderAlias(
  provider: string,
  alias: string,
  at = new Date(),
) {
  const lookup = aliasLookupSchema.parse({ provider, alias });
  const date = catalogDate.parse(at.toISOString().slice(0, 10));
  const [rows] = await getPool().execute<RowDataPacket[]>(
    "SELECT a.id,a.listing_id AS listingId,l.security_id AS securityId,l.mic,l.symbol,s.fictional FROM provider_aliases a JOIN listings l ON l.id=a.listing_id JOIN securities s ON s.id=l.security_id WHERE a.provider=? AND a.alias=? AND a.effective_from<=? AND (a.effective_to IS NULL OR a.effective_to>?) LIMIT 2",
    [lookup.provider, lookup.alias, date, date],
  );
  if (rows.length !== 1)
    return {
      status: rows.length ? "conflict" : "missing",
      listing: null,
    } as const;
  const [canonical] = await getPool().execute<RowDataPacket[]>(
    "SELECT id FROM provider_aliases WHERE listing_id=? AND provider=? AND effective_from<=? AND (effective_to IS NULL OR effective_to>?) LIMIT 2",
    [rows[0].listingId, provider, date, date],
  );
  if (canonical.length !== 1)
    return { status: "conflict", listing: null } as const;
  const row = rows[0];
  return {
    status: "resolved",
    listing: {
      id: row.listingId as string,
      securityId: row.securityId as string,
      mic: row.mic as string,
      symbol: row.symbol as string,
      fictional: Number(row.fictional) === 1,
    },
  } as const;
}

export async function seedProviderAliases() {
  for (const row of scenarios)
    await assignProviderAlias({
      listingId: row.id,
      provider: "synthetic-v1",
      alias: `${row.symbol}.${row.mic}`,
      effectiveFrom: "2026-01-01",
      effectiveTo: null,
      actor: "fixture-seed",
      reason:
        "Project-owned fictional aliases; no real provider mapping implied",
    });
  return { aliases: scenarios.length };
}
