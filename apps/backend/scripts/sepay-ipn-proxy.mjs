import { createHash, timingSafeEqual } from 'node:crypto';
import { createServer } from 'node:http';
import { pathToFileURL } from 'node:url';

const ipnPath = '/api/v1/webhooks/sepay/ipn';
const maxBytes = 32 * 1024;

// Expose only the sandbox IPN route through a development tunnel.
export function createIpnProxy({ secret, backendPort }) {
  if (!secret?.trim()) throw new Error('SEPAY_IPN_SECRET is required');
  if (!Number.isInteger(backendPort) || backendPort < 1 || backendPort > 65535)
    throw new Error('Invalid backend PORT');
  const expected = createHash('sha256').update(secret.trim()).digest();
  return createServer(async (request, response) => {
    const reply = (status) => {
      response.writeHead(status, { 'Content-Type': 'application/json' });
      response.end(JSON.stringify({ success: status === 200 }));
    };
    if (request.url !== ipnPath || request.method !== 'POST') return reply(404);
    const incoming = request.headers['x-secret-key'];
    if (
      typeof incoming !== 'string' ||
      !timingSafeEqual(createHash('sha256').update(incoming).digest(), expected)
    )
      return reply(401);
    if (
      !request.headers['content-type']
        ?.toLowerCase()
        .startsWith('application/json')
    )
      return reply(415);
    try {
      const chunks = [];
      let bytes = 0;
      for await (const chunk of request) {
        bytes += chunk.length;
        if (bytes > maxBytes) return reply(413);
        chunks.push(chunk);
      }
      const upstream = await fetch(
        `http://127.0.0.1:${backendPort}${ipnPath}`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'X-Secret-Key': incoming,
          },
          body: Buffer.concat(chunks),
          signal: AbortSignal.timeout(10000),
          redirect: 'error',
        },
      );
      response.writeHead(upstream.status, {
        'Content-Type': 'application/json',
      });
      response.end(await upstream.text());
    } catch {
      if (!response.headersSent) reply(502);
      else response.end();
    }
  });
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  if (
    process.env.NODE_ENV === 'production' ||
    (process.env.SEPAY_ENV ?? 'sandbox').trim().toLowerCase() !== 'sandbox'
  )
    throw new Error('The local IPN proxy is only for SePay sandbox');
  const server = createIpnProxy({
    secret: process.env.SEPAY_IPN_SECRET,
    backendPort: Number(process.env.PORT ?? 3001),
  });
  server.listen(3010, '127.0.0.1', () => {
    console.log(`Sandbox IPN proxy: http://127.0.0.1:3010${ipnPath}`);
    console.log(
      'Tunnel command: ngrok http http://127.0.0.1:3010 --inspect=false',
    );
    console.log(
      'SePay IPN URL: append ' + ipnPath + ' to the public HTTPS URL.',
    );
  });
}
