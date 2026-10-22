import { schemaModels } from './helpers/schema-models.js';
import { integrationSuite } from './helpers/test-app.js';
import { assertIntegrationDatabase } from './helpers/test-environment.js';

describe('Integration database safety and migration completeness', () => {
  const context = integrationSuite();
  it('migrates every current model and scalar column, including voucher and commission fields', async () => {
    const { prisma } = context();
    const columns = await prisma.$queryRaw<
      Array<{ table_name: string; column_name: string }>
    >`
      SELECT table_name, column_name FROM information_schema.columns WHERE table_schema = 'public'
    `;
    const actual = new Set(
      columns.map((row) => `${row.table_name}.${row.column_name}`),
    );
    for (const model of schemaModels) {
      for (const column of model.columns) {
        expect(
          actual.has(`${model.table}.${column}`),
          `${model.name}.${column}`,
        ).toBe(true);
      }
    }
  });
  it.each([
    {},
    { NODE_ENV: 'production' },
    { DATABASE_URL: undefined },
    { DATABASE_URL: 'postgresql://test:test@127.0.0.1/gobook' },
    { DATABASE_URL: 'postgresql://test:test@127.0.0.1/gobook_dev_clean' },
    { DATABASE_URL: 'postgresql://test:test@production.example/gobook_test' },
    {
      DATABASE_URL:
        'postgresql://test:test@127.0.0.1/gobook_test?schema=private',
    },
    {
      DATABASE_URL:
        'postgresql://test:test@127.0.0.1/gobook_test?options=anything',
    },
    { DATABASE_URL: 'invalid-do-not-log-secret' },
    { INTEGRATION_TEST_ALLOW_CLEANUP: '0' },
  ])('rejects unsafe targets before a database operation (%#)', (overrides) => {
    const valid = {
      NODE_ENV: 'test',
      DATABASE_URL: 'postgresql://test:test@127.0.0.1:5433/gobook_test',
      INTEGRATION_TEST_ALLOW_CLEANUP: '1',
    };
    const input = Object.keys(overrides).length
      ? { ...valid, ...overrides }
      : {};
    expect(() => assertIntegrationDatabase(input)).toThrow(
      'Unsafe integration database',
    );
  });
  it('creates customer, vendor and admin identities without seed data', async () => {
    const { prisma, fixtures } = context();
    const customer = await fixtures.createCustomer();
    const vendor = await fixtures.createApprovedVendor();
    const admin = await fixtures.createAdmin();
    expect(new Set([customer.id, vendor.ownerUserId, admin.id]).size).toBe(3);
    expect(await prisma.userRole.count()).toBe(3);
    expect(vendor.status).toBe('APPROVED');
  });
});
