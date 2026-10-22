import type { PrismaService } from '../../../src/database/prisma/prisma.service.js';
import { schemaModels } from './schema-models.js';
import { assertIntegrationDatabase } from './test-environment.js';

export async function cleanTestDatabase(prisma: PrismaService): Promise<void> {
  const target = assertIntegrationDatabase();
  const [actual] = await prisma.$queryRaw<
    Array<{ database: string }>
  >`SELECT current_database() AS database`;
  if (actual?.database !== decodeURIComponent(target.pathname.slice(1)))
    throw new Error('Test connection does not match guarded database');
  const tables = schemaModels.map(
    (model) => `"public"."${model.table.replaceAll('"', '""')}"`,
  );
  // Model names are generated from our schema, never request input. Migration history remains.
  await prisma.$executeRawUnsafe(
    `TRUNCATE TABLE ${tables.join(', ')} RESTART IDENTITY CASCADE`,
  );
}

export async function databaseNow(prisma: PrismaService): Promise<Date> {
  const [row] = await prisma.$queryRaw<
    Array<{ now: Date }>
  >`SELECT clock_timestamp() AS now`;
  if (!row) throw new Error('Database clock unavailable');
  return row.now;
}
