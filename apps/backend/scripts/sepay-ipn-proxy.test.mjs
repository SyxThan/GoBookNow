import assert from 'node:assert/strict';
import { once } from 'node:events';
import { createServer } from 'node:http';
import test from 'node:test';
import { createIpnProxy } from './sepay-ipn-proxy.mjs';

test('sandbox proxy exposes only authenticated JSON IPN and forwards the original payload', async (t) => {
  const received = [];
  const backend = createServer(async (request, response) => {
    const chunks = [];
    for await (const chunk of request) chunks.push(chunk);
    received.push({
      path: request.url,
      secret: request.headers['x-secret-key'],
      body: Buffer.concat(chunks).toString(),
    });
    response.writeHead(200, { 'Content-Type': 'application/json' });
    response.end('{"success":true}');
  }).listen(0, '127.0.0.1');
  await once(backend, 'listening');
  const secret = 'synthetic-proxy-test-secret';
  const proxy = createIpnProxy({
    secret,
    backendPort: backend.address().port,
  }).listen(0, '127.0.0.1');
  await once(proxy, 'listening');
  t.after(() => {
    proxy.closeAllConnections();
    proxy.close();
    backend.closeAllConnections();
    backend.close();
  });
  const origin = `http://127.0.0.1:${proxy.address().port}`;
  const path = '/api/v1/webhooks/sepay/ipn';
  const headers = {
    'Content-Type': 'application/json',
    'X-Secret-Key': secret,
  };
  assert.equal((await fetch(origin + '/docs')).status, 404);
  assert.equal((await fetch(origin + path)).status, 404);
  assert.equal(
    (
      await fetch(origin + path + '?other=1', {
        method: 'POST',
        headers,
        body: '{}',
      })
    ).status,
    404,
  );
  assert.equal(
    (await fetch(origin + path, { method: 'POST', body: '{}' })).status,
    401,
  );
  assert.equal(
    (
      await fetch(origin + path, {
        method: 'POST',
        headers: { ...headers, 'X-Secret-Key': 'wrong' },
        body: '{}',
      })
    ).status,
    401,
  );
  assert.equal(
    (
      await fetch(origin + path, {
        method: 'POST',
        headers: { ...headers, 'Content-Type': 'text/plain' },
        body: '{}',
      })
    ).status,
    415,
  );
  assert.equal(
    (
      await fetch(origin + path, {
        method: 'POST',
        headers,
        body: 'x'.repeat(32769),
      })
    ).status,
    413,
  );
  assert.equal(received.length, 0);
  const body = JSON.stringify({ notification_type: 'ORDER_PAID', test: true });
  const response = await fetch(origin + path, {
    method: 'POST',
    headers,
    body,
  });
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { success: true });
  assert.deepEqual(received, [{ path, secret, body }]);
});

test('sandbox proxy requires a secret and local backend port', () => {
  assert.throws(() => createIpnProxy({ secret: '', backendPort: 3001 }));
  assert.throws(() => createIpnProxy({ secret: 'synthetic', backendPort: -1 }));
});
