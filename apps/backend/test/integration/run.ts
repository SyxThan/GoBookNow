import { spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import {
  assertIntegrationDatabase,
  loadTestEnvironment,
} from './helpers/test-environment.js';

loadTestEnvironment();
assertIntegrationDatabase(); // Must run before Prisma's config can load .env.
const require = createRequire(import.meta.url);
const command = process.argv[2];
const extra = process.argv.slice(3);

function run(packageName: string, entry: string, args: string[]): void {
  const root = dirname(require.resolve(`${packageName}/package.json`));
  const result = spawnSync(process.execPath, [join(root, entry), ...args], {
    stdio: 'inherit',
    env: process.env,
  });
  if (result.error) throw new Error(`Could not start ${packageName}`);
  if (result.status !== 0) process.exit(result.status ?? 1);
}

if (command === 'prepare') {
  run('prisma', 'build/index.js', ['validate']);
  run('prisma', 'build/index.js', ['generate']);
  run('prisma', 'build/index.js', ['migrate', 'deploy']);
  run('prisma', 'build/index.js', ['migrate', 'status']);
} else if (command === 'test') {
  run('vitest', 'vitest.mjs', [
    'run',
    '--config',
    'vitest.config.integration.ts',
    ...extra,
  ]);
} else {
  throw new Error('Expected prepare or test');
}
