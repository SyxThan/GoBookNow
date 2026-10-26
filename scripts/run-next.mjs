import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';
import { basename, dirname, join, resolve } from 'node:path';
import { cpSync, existsSync } from 'node:fs';

const [mode, variable, fallback, ...extra] = process.argv.slice(2);
if (!['dev', 'start'].includes(mode)) throw new Error('Expected next dev or start');
const port = Number(process.env[variable] ?? fallback);
if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error(`Invalid ${variable}`);
const require = createRequire(resolve('package.json'));
const next = join(dirname(require.resolve('next/package.json')), 'dist/bin/next');
const standalone = resolve('.next', 'standalone', 'apps', basename(process.cwd()));
let args = [next, mode, '--port', String(port), ...extra];
let environment = process.env;
if (mode === 'start' && existsSync(join(standalone, 'server.js'))) {
  // Next standalone does not bundle static/public assets automatically.
  for (const source of ['.next/static', 'public']) {
    if (existsSync(source)) cpSync(source, join(standalone, source), {recursive: true});
  }
  args = [join(standalone, 'server.js')];
  environment = {...process.env, PORT: String(port), HOSTNAME: process.env.HOSTNAME ?? '127.0.0.1'};
}
const child = spawn(process.execPath, args, { stdio: 'inherit', env: environment });
child.on('error', () => { process.exitCode = 1; });
child.on('exit', (code) => { process.exitCode = code ?? 1; });
process.on('SIGINT', () => child.kill('SIGINT'));
process.on('SIGTERM', () => child.kill('SIGTERM'));
