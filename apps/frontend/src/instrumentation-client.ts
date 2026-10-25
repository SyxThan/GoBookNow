import * as Sentry from "@sentry/nextjs";
import { monitoringOptions } from "./lib/monitoring";

try {
  Sentry.init({
    ...monitoringOptions(
      process.env.NEXT_PUBLIC_SENTRY_DSN,
      process.env.NEXT_PUBLIC_SENTRY_TRACES_SAMPLE_RATE,
    ),
    environment:
      process.env.NEXT_PUBLIC_SENTRY_ENVIRONMENT ?? process.env.NODE_ENV,
    release: process.env.NEXT_PUBLIC_SENTRY_RELEASE,
  });
} catch {
  /* Optional monitoring must not prevent rendering. */
}
export const onRouterTransitionStart = Sentry.captureRouterTransitionStart;
