import { spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { dirname, join, resolve } from 'node:path';
import { loadBrowserEnvironment } from './environment.js';

loadBrowserEnvironment();
const require = createRequire(import.meta.url);
function run(
  packageName: string,
  entry: string,
  args: string[],
  cwd = process.cwd(),
) {
  const root = dirname(require.resolve(`${packageName}/package.json`));
  const result = spawnSync(process.execPath, [join(root, entry), ...args], {
    cwd,
    stdio: 'inherit',
    env: process.env,
  });
  if (result.error) throw new Error(`Cannot start ${packageName}`);
  if (result.status !== 0) process.exit(result.status ?? 1);
}
const command = process.argv[2];
if (command === 'prepare') {
  run('prisma', 'build/index.js', ['validate']);
  run('prisma', 'build/index.js', ['generate']);
  run('prisma', 'build/index.js', ['migrate', 'deploy']);
  run('prisma', 'build/index.js', ['migrate', 'status']);
  run('typescript', 'bin/tsc', ['-p', 'tsconfig.browser.json']);
  // Next's production build expects NODE_ENV=production, independent of the DB guard.
  const frontend = resolve('../frontend');
  const frontendRequire = createRequire(join(frontend, 'package.json'));
  const next = dirname(frontendRequire.resolve('next/package.json'));
  const result = spawnSync(
    process.execPath,
    [join(next, 'dist/bin/next'), 'build'],
    {
      cwd: frontend,
      stdio: 'inherit',
      env: { ...process.env, NODE_ENV: 'production' },
    },
  );
  if (result.status !== 0) process.exit(result.status ?? 1);
} else if (command === 'test') {
  const frontendRequire = createRequire(resolve('../frontend/package.json'));
  const playwright = dirname(
    frontendRequire.resolve('@playwright/test/package.json'),
  );
  const result = spawnSync(
    process.execPath,
    [
      join(playwright, 'cli.js'),
      'test',
      '--config',
      resolve('../frontend/playwright.journey.config.mts'),
      ...process.argv.slice(3),
    ],
    {
      stdio: 'inherit',
      env: process.env,
    },
  );
  process.exit(result.status ?? 1);
} else throw new Error('Expected prepare or test');
