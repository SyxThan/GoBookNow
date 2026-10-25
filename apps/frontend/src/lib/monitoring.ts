import * as Sentry from "@sentry/nextjs";

const captured = new WeakSet<object>();
export function validRequestId(value: unknown): value is string {
  return (
    typeof value === "string" &&
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
      value,
    )
  );
}
export function sanitizeEvent(event: Sentry.ErrorEvent): Sentry.ErrorEvent {
  const requestId = event.contexts?.application?.requestId;
  return {
    type: undefined,
    event_id: event.event_id,
    timestamp: event.timestamp,
    level: event.level,
    environment: event.environment,
    release: event.release,
    tags: { service: "gobook-frontend" },
    contexts: validRequestId(requestId) ? { application: { requestId } } : {},
    exception: {
      values: (event.exception?.values ?? []).map((error) => ({
        type: ["Error", "TypeError", "RangeError"].includes(error.type ?? "")
          ? error.type
          : "Error",
        value: "Unexpected application error",
        stacktrace: {
          frames: error.stacktrace?.frames?.map((frame) => ({
            filename: frame.filename
              ?.split(/[?#]/)[0]
              ?.replace(/^https?:\/\/[^/]+/, "")
              .replaceAll("\\", "/")
              .split("/")
              .filter(Boolean)
              .slice(-3)
              .join("/"),
            lineno: frame.lineno,
            colno: frame.colno,
            in_app: frame.in_app,
          })),
        },
      })),
    },
  };
}
type MonitoringOptions = Pick<
  Sentry.BrowserOptions,
  | "dsn"
  | "enabled"
  | "dataCollection"
  | "tracesSampleRate"
  | "traceLifecycle"
  | "beforeSend"
  | "beforeBreadcrumb"
  | "beforeSendLog"
  | "beforeSendMetric"
  | "beforeSendSpan"
>;
export function monitoringOptions(
  dsn: string | undefined,
  rate: string | undefined,
): MonitoringOptions {
  const sample = rate ? Number(rate) : 0;
  return {
    dsn,
    enabled: Boolean(dsn),
    dataCollection: {
      userInfo: false,
      cookies: false,
      httpHeaders: false,
      httpBodies: [],
      urlQueryParams: false,
      databaseQueryData: false,
      stackFrameVariables: false,
      frameContextLines: 0,
      queues: false,
      graphQL: { document: false, variables: false },
      genAI: { inputs: false, outputs: false },
      mcp: { inputs: false, outputs: false },
    },
    tracesSampleRate:
      Number.isFinite(sample) && sample >= 0 && sample <= 1 ? sample : 0,
    traceLifecycle: "stream",
    beforeSend: (event: Sentry.ErrorEvent) => sanitizeEvent(event),
    beforeBreadcrumb: () => null,
    beforeSendLog: () => null,
    beforeSendMetric: () => null,
    beforeSendSpan: (span) => ({
      ...span,
      name: "application.operation",
      attributes: {},
      links: [],
    }),
  };
}
export function reportUnexpected(error: unknown, requestId?: string) {
  if (error && typeof error === "object") {
    if (captured.has(error)) return;
    captured.add(error);
  }
  try {
    Sentry.captureException(error, {
      contexts: validRequestId(requestId) ? { application: { requestId } } : {},
    });
  } catch {
    /* Monitoring cannot change Customer flows. */
  }
}
