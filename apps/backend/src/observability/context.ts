import { AsyncLocalStorage } from 'node:async_hooks';
import { randomUUID } from 'node:crypto';

export type Context = {
  requestId?: string;
  clientCorrelationId?: string;
  userId?: string;
  bookingId?: string;
  paymentId?: string;
  jobId?: string;
  jobType?: string;
};
export const requestContext = new AsyncLocalStorage<Context>();
export const uuid = (value: unknown): value is string =>
  typeof value === 'string' &&
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
    value,
  );
export function bindContext(context: Context) {
  const current = requestContext.getStore();
  if (current)
    Object.assign(
      current,
      Object.fromEntries(
        Object.entries(context).filter(
          ([key, value]) => key.endsWith('Id') && uuid(value),
        ),
      ),
    );
}
export function jobContext<T>(jobType: string, work: () => T): T {
  return requestContext.run(
    { ...requestContext.getStore(), jobType, jobId: randomUUID() },
    work,
  );
}
