import { setImmediate as yieldEventLoop } from 'node:timers/promises';
import { Client } from 'pg';
import { assertIntegrationDatabase } from './test-environment.js';

/** Hold a row until all requests are visibly waiting in PostgreSQL, then release together. */
export async function contendOnRow<T>(
  table: 'slots' | 'bookings',
  id: string,
  operations: Array<() => Promise<T>>,
): Promise<T[]> {
  assertIntegrationDatabase();
  const gate = new Client({
    connectionString: process.env.DATABASE_URL,
    connectionTimeoutMillis: 5000,
  });
  await gate.connect();
  let pending: Promise<T[]> | undefined;
  try {
    await gate.query('BEGIN');
    await gate.query(
      `SELECT id FROM "${table}" WHERE id = $1::uuid FOR UPDATE`,
      [id],
    );
    pending = Promise.all(operations.map((operation) => operation()));
    // Attach immediately so a failed contender cannot become an unhandled rejection.
    void pending.catch(() => undefined);
    const deadline = performance.now() + 1500; // Below Prisma's 2s acquisition limit.
    let waiting = 0;
    while (performance.now() < deadline) {
      // Activity snapshots are cached within this gate transaction.
      await gate.query('SELECT pg_stat_clear_snapshot()');
      const result = await gate.query<{ waiting: number }>(
        // Later row waiters can be blocked by an earlier waiter (tuple lock),
        // rather than directly by the gate. Count the complete blocking tree.
        `WITH RECURSIVE blocked(pid) AS (
          SELECT pid FROM pg_stat_activity
          WHERE pg_backend_pid() = ANY(pg_blocking_pids(pid))
          UNION
          SELECT activity.pid FROM pg_stat_activity activity
          JOIN blocked ON blocked.pid = ANY(pg_blocking_pids(activity.pid))
        ) SELECT count(*)::int AS waiting FROM blocked`,
      );
      waiting = result.rows[0]!.waiting;
      if (waiting >= operations.length) break;
      await yieldEventLoop();
    }
    if (waiting < operations.length)
      throw new Error(
        `Expected ${operations.length} concurrent row-lock waiters, observed ${waiting}`,
      );
    await gate.query('COMMIT');
    return await pending;
  } finally {
    await gate.query('ROLLBACK');
    if (pending) await pending.catch(() => undefined);
    await gate.end();
  }
}
