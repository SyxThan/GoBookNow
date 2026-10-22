import { config } from 'dotenv';

export function loadTestEnvironment(): void {
  // Deliberately never load .env, which normally points to a developer DB.
  config({ path: '.env.test', quiet: true });
}

export function assertIntegrationDatabase(
  env: NodeJS.ProcessEnv = process.env,
): URL {
  const fail = (): never => {
    throw new Error(
      'Unsafe integration database: require NODE_ENV=test, explicit local PostgreSQL DATABASE_URL with database gobook_test[_suffix], public schema, and INTEGRATION_TEST_ALLOW_CLEANUP=1. Credentials are not logged.',
    );
  };
  if (
    env.NODE_ENV !== 'test' ||
    env.INTEGRATION_TEST_ALLOW_CLEANUP !== '1' ||
    !env.DATABASE_URL
  )
    return fail();
  let url: URL;
  try {
    url = new URL(env.DATABASE_URL);
  } catch {
    return fail();
  }
  let database: string;
  try {
    database = decodeURIComponent(url.pathname.slice(1));
  } catch {
    return fail();
  }
  if (
    !['postgresql:', 'postgres:'].includes(url.protocol) ||
    !['127.0.0.1', 'localhost', '[::1]', 'postgres'].includes(url.hostname) ||
    !/^gobook_test(?:_[a-z0-9]+)*$/.test(database) ||
    (url.searchParams.get('schema') ?? 'public') !== 'public' ||
    [...url.searchParams.keys()].some((key) => key !== 'schema') ||
    url.hash
  )
    return fail();
  return url;
}
