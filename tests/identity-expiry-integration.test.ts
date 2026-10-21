import { test, after } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { setTimeout as delay } from "node:timers/promises";
import type { RowDataPacket } from "mysql2/promise";
import { getPool, closePool } from "@tradecrafters/database";

after(closePool);
test(
  "idle identity maintenance removes only stale authority and counters",
  { timeout: 85000 },
  async () => {
    const pool = getPool();
    assert.ok(
      ["localhost", "127.0.0.1"].includes(
        new URL(process.env.DATABASE_URL!).hostname,
      ),
    );
    const stale = randomUUID(),
      active = randomUUID();
    const expiredSession = randomUUID(),
      liveSession = randomUUID();
    const expiredVerification = randomUUID(),
      liveVerification = randomUUID();
    try {
      for (const id of [stale, active])
        await pool.execute(
          "INSERT INTO user (id,name,email,emailVerified,twoFactorEnabled) VALUES (?,'Expiry fixture',?,true,false)",
          [id, `expiry-${id}@example.invalid`],
        );
      for (const [id, user, expired] of [
        [expiredSession, stale, true],
        [liveSession, active, false],
      ] as const) {
        await pool.execute(
          "INSERT INTO session (id,userId,token,expiresAt,updatedAt) VALUES (?,?,?,IF(?,UTC_TIMESTAMP(3)-INTERVAL 2 HOUR,UTC_TIMESTAMP(3)+INTERVAL 1 DAY),UTC_TIMESTAMP(3))",
          [id, user, randomUUID(), expired],
        );
        await pool.execute(
          "INSERT INTO mfa_stepups VALUES (?,IF(?,UTC_TIMESTAMP(3)-INTERVAL 2 HOUR,UTC_TIMESTAMP(3)+INTERVAL 5 MINUTE))",
          [id, expired],
        );
        await pool.execute(
          "INSERT INTO mfa_used_codes VALUES (?, ?, IF(?,UTC_TIMESTAMP(3)-INTERVAL 2 HOUR,UTC_TIMESTAMP(3)+INTERVAL 90 SECOND))",
          [user, "f".repeat(64), expired],
        );
        for (const table of ["mfa_attempt_budgets", "mutation_budgets"])
          await pool.execute(
            `INSERT INTO ${table} VALUES (?,IF(?,0,FLOOR(UNIX_TIMESTAMP()/60)),1)`,
            [user, expired],
          );
      }
      for (const [id, expired] of [
        [expiredVerification, true],
        [liveVerification, false],
      ] as const)
        await pool.execute(
          "INSERT INTO verification (id,identifier,value,expiresAt) VALUES (?,?,'opaque fixture',IF(?,UTC_TIMESTAMP(3)-INTERVAL 2 HOUR,UTC_TIMESTAMP(3)+INTERVAL 1 DAY))",
          [id, `expiry-${id}`, expired],
        );
      const count = async (
        user: string,
        session: string,
        verification: string,
      ) => {
        const [rows] = await pool.execute<RowDataPacket[]>(
          "SELECT (SELECT COUNT(*) FROM session WHERE id=?) + (SELECT COUNT(*) FROM mfa_stepups WHERE session_id=?) + (SELECT COUNT(*) FROM verification WHERE id=?) + (SELECT COUNT(*) FROM mfa_used_codes WHERE user_id=?) + (SELECT COUNT(*) FROM mfa_attempt_budgets WHERE user_id=?) + (SELECT COUNT(*) FROM mutation_budgets WHERE user_id=?) AS n",
          [session, session, verification, user, user, user],
        );
        return Number(rows[0].n);
      };
      for (
        let i = 0;
        i < 39 && (await count(stale, expiredSession, expiredVerification)) > 0;
        i++
      )
        await delay(2000);
      assert.equal(await count(stale, expiredSession, expiredVerification), 0);
      assert.equal(await count(active, liveSession, liveVerification), 6);
      const [users] = await pool.execute<RowDataPacket[]>(
        "SELECT COUNT(*) AS n FROM user WHERE id IN (?,?)",
        [stale, active],
      );
      assert.equal(Number(users[0].n), 2, "expiry does not delete accounts");
      const [events] = await pool.query<RowDataPacket[]>(
        "SELECT STATUS,LAST_EXECUTED FROM information_schema.events WHERE event_schema=DATABASE() AND EVENT_NAME='identity_record_expiry'",
      );
      assert.equal(events[0].STATUS, "ENABLED");
      assert.ok(events[0].LAST_EXECUTED);
    } finally {
      await pool.execute("DELETE FROM verification WHERE id IN (?,?)", [
        expiredVerification,
        liveVerification,
      ]);
      for (const id of [stale, active]) {
        await pool.execute("DELETE FROM mutation_budgets WHERE user_id=?", [
          id,
        ]);
        await pool.execute("DELETE FROM user WHERE id=? AND email=?", [
          id,
          `expiry-${id}@example.invalid`,
        ]);
      }
    }
  },
);
