/** Database-backed payment tests may delete only their own synthetic fixtures. */
export function assertIsolatedPaymentTestDatabase(): void {
  const value = process.env.DATABASE_URL;
  if (!value) {
    throw new Error('Payment E2E tests require an explicit test DATABASE_URL');
  }

  const database = decodeURIComponent(new URL(value).pathname.slice(1));
  if (!/(^test_|_test$|_test_)/i.test(database)) {
    throw new Error(
      `Payment E2E tests require a test database; got ${database}`,
    );
  }
}
