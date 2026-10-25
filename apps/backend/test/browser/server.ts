import { createBrowserApplication } from './application.js';

const app = await createBrowserApplication();
await app.listen(
  Number(new URL(process.env.BACKEND_BASE_URL!).port),
  '127.0.0.1',
);
app.enableShutdownHooks();
console.log(
  'E2E API ready (isolated test database, external uploads disabled)',
);
