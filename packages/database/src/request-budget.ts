import type { RowDataPacket } from "mysql2/promise";
import { getPool } from "./pool";
import {
  ingressPolicies,
  ingressDigest,
  IngressUnavailable,
  RequestLimited,
  type IngressScope,
} from "./ingress";

export async function consumeRequestBudget(
  scope: IngressScope,
  network: string,
  secret: string,
) {
  const policy = ingressPolicies[scope];
  if (!policy) throw new IngressUnavailable();
  for (let attempt = 0; ; attempt++) {
    const connection = await getPool().getConnection();
    let previousLockWait: number | undefined;
    try {
      const [settings] = await connection.query<RowDataPacket[]>(
        "SELECT @@session.innodb_lock_wait_timeout AS seconds",
      );
      previousLockWait = Number(settings[0].seconds);
      await connection.query("SET SESSION innodb_lock_wait_timeout=2");
      // Only the next transaction changes isolation; finance retains its own
      // default. The fixed scope row serializes admissions across all processes.
      await connection.query("SET TRANSACTION ISOLATION LEVEL READ COMMITTED");
      await connection.beginTransaction();
      const [controls] = await connection.execute<RowDataPacket[]>(
        "SELECT window_id,hits FROM ingress_budget_control WHERE scope=? FOR UPDATE",
        [scope],
      );
      if (controls.length !== 1) throw new IngressUnavailable();
      const [clock] = await connection.query<RowDataPacket[]>(
        "SELECT FLOOR(UNIX_TIMESTAMP()/60) AS window_id,UNIX_TIMESTAMP() AS seconds,@@event_scheduler AS scheduler",
      );
      if (clock[0].scheduler !== "ON") throw new IngressUnavailable();
      const window = Math.max(
        Number(clock[0].window_id),
        Number(controls[0].window_id),
      );
      const retryAfter = Math.max(
        1,
        Math.min(3600, Math.ceil((window + 1) * 60 - Number(clock[0].seconds))),
      );
      const hits =
        Number(controls[0].window_id) === window ? Number(controls[0].hits) : 0;
      await connection.execute(
        "DELETE FROM ingress_budget_clients WHERE scope=? AND window_id<? LIMIT 128",
        [scope, window - 1],
      );
      await connection.execute(
        "UPDATE ingress_budget_control SET window_id=?,hits=? WHERE scope=?",
        [window, hits, scope],
      );
      if (hits >= policy.global) {
        await connection.commit();
        throw new RequestLimited(retryAfter);
      }
      const digest = ingressDigest(secret, scope, window, network);
      const [clients] = await connection.execute<RowDataPacket[]>(
        "SELECT hits FROM ingress_budget_clients WHERE scope=? AND window_id=? AND subject_digest=?",
        [scope, window, digest],
      );
      if (clients.length && Number(clients[0].hits) >= policy.perNetwork) {
        // A rejected network must not consume the remaining global admissions.
        await connection.commit();
        throw new RequestLimited(retryAfter);
      }
      if (!clients.length) {
        const [size] = await connection.execute<RowDataPacket[]>(
          "SELECT COUNT(*) AS total FROM ingress_budget_clients WHERE scope=?",
          [scope],
        );
        if (Number(size[0].total) >= policy.global * 2 + 1)
          throw new IngressUnavailable();
      }
      await connection.execute(
        "INSERT INTO ingress_budget_clients (scope,window_id,subject_digest,hits) VALUES (?,?,?,1) ON DUPLICATE KEY UPDATE hits=hits+1",
        [scope, window, digest],
      );
      await connection.execute(
        "UPDATE ingress_budget_control SET hits=hits+1 WHERE scope=?",
        [scope],
      );
      await connection.commit();
      return;
    } catch (error) {
      await connection.rollback().catch(() => {});
      const retry =
        error &&
        typeof error === "object" &&
        "code" in error &&
        ["ER_LOCK_DEADLOCK", "ER_LOCK_WAIT_TIMEOUT"].includes(
          String(error.code),
        );
      if (retry && attempt < 2) continue;
      if (error instanceof RequestLimited) throw error;
      throw new IngressUnavailable();
    } finally {
      // Do not leak the admission lock deadline into a later financial request
      // borrowing this connection. An unrestorable connection is discarded.
      if (previousLockWait !== undefined) {
        try {
          await connection.query("SET SESSION innodb_lock_wait_timeout=?", [
            previousLockWait,
          ]);
        } catch {
          connection.destroy();
        }
      }
      connection.release();
    }
  }
}
