import { createHash } from 'node:crypto';
import { readdir, readFile } from 'node:fs/promises';
import { Client } from 'pg';
import { assertIntegrationDatabase } from './test-environment.js';

export default async function setup() {
  assertIntegrationDatabase();
  const client = new Client({
    connectionString: process.env.DATABASE_URL,
    connectionTimeoutMillis: 5000,
  });
  await client.connect();
  try {
    const lock = await client.query<{ locked: boolean }>(
      'SELECT pg_try_advisory_lock(71403221) AS locked',
    );
    if (!lock.rows[0]?.locked)
      throw new Error(
        'Another integration suite owns this database. Use a separate test database.',
      );
    const applied = await client.query<{
      migration_name: string;
      checksum: string;
    }>(
      'SELECT migration_name, checksum FROM _prisma_migrations WHERE finished_at IS NOT NULL AND rolled_back_at IS NULL',
    );
    const migrations = (
      await readdir('prisma/migrations', { withFileTypes: true })
    ).filter((entry) => entry.isDirectory());
    if (applied.rowCount !== migrations.length)
      throw new Error(
        'Test database migrations are incomplete. Run test:integration:prepare.',
      );
    for (const migration of migrations) {
      const checksum = createHash('sha256')
        .update(
          await readFile(`prisma/migrations/${migration.name}/migration.sql`),
        )
        .digest('hex');
      if (
        !applied.rows.some(
          (row) =>
            row.migration_name === migration.name && row.checksum === checksum,
        )
      ) {
        throw new Error(`Test migration missing or changed: ${migration.name}`);
      }
    }
  } catch (error) {
    await client.end();
    throw error;
  }
  return async () => {
    await client.end();
  };
}
