import * as Sentry from "@sentry/nextjs";
import { monitoringOptions } from "./src/lib/monitoring";

try {
  Sentry.init({
    ...monitoringOptions(
      process.env.SENTRY_DSN,
      process.env.SENTRY_TRACES_SAMPLE_RATE,
    ),
    environment: process.env.SENTRY_ENVIRONMENT ?? process.env.NODE_ENV,
    release: process.env.SENTRY_RELEASE,
  });
} catch {
  /* Optional monitoring must not prevent startup. */
}
