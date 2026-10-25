import { Component, type ReactNode } from "react";
import { render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import * as Sentry from "@sentry/nextjs";
import ApplicationError from "@/app/error";
import {
  monitoringOptions,
  reportUnexpected,
  sanitizeEvent,
} from "./monitoring";

type Transport = ReturnType<NonNullable<Sentry.BrowserOptions["transport"]>>;
type Envelope = Parameters<Transport["send"]>[0];

describe("Frontend monitoring privacy", () => {
  afterEach(async () => {
    vi.restoreAllMocks();
    await Sentry.close(100);
    Sentry.getCurrentScope().setClient(undefined);
  });
  it("excludes request, session, checkout, banking and raw QR data", () => {
    const secret = "private-password-jwt-qr-bank-transfer";
    const event = sanitizeEvent({
      type: undefined,
      user: { email: secret },
      request: {
        url: `https://site.invalid/?token=${secret}`,
        data: { password: secret },
        headers: { Authorization: secret },
      },
      breadcrumbs: [{ message: secret }],
      extra: { formFields: secret, sessionStorage: secret },
      exception: {
        values: [
          {
            type: "Error",
            value: secret,
            stacktrace: {
              frames: [
                {
                  filename: `/app.js?ticket=${secret}`,
                  vars: { password: secret },
                },
              ],
            },
          },
        ],
      },
    });
    expect(JSON.stringify(event)).not.toContain(secret);
    expect(
      event.exception?.values?.[0]?.stacktrace?.frames?.[0]?.filename,
    ).toBe("app.js");
  });
  it("keeps DSN optional, bounds sampling and disables all sensitive data collection", () => {
    expect(monitoringOptions(undefined, undefined).enabled).toBe(false);
    expect(monitoringOptions(undefined, "2").tracesSampleRate).toBe(0);
    expect(monitoringOptions(undefined, "-1").tracesSampleRate).toBe(0);
    expect(monitoringOptions(undefined, "0.1").tracesSampleRate).toBe(0.1);
    expect(monitoringOptions(undefined, "0").dataCollection).toMatchObject({
      userInfo: false,
      cookies: false,
      httpHeaders: false,
      httpBodies: [],
      urlQueryParams: false,
      stackFrameVariables: false,
    });
    const scrubSpan = monitoringOptions(undefined, "0").beforeSendSpan!;
    const sanitized = scrubSpan({
      trace_id: "0".repeat(32),
      span_id: "0".repeat(16),
      name: "private-ticket-token",
      start_timestamp: 1,
      status: "ok",
      is_segment: true,
      attributes: { password: "private-password" },
      links: [],
    });
    expect(JSON.stringify(sanitized)).not.toContain("private-");
  });
  it("captures a controlled rendering failure once through the official SDK test transport", async () => {
    const envelopes: Envelope[] = [];
    Sentry.init({
      ...monitoringOptions("https://public@example.invalid/1", "0"),
      defaultIntegrations: false,
      transport: () => ({
        send: (envelope: Envelope) => {
          envelopes.push(envelope);
          return Promise.resolve({ statusCode: 200 });
        },
        flush: () => Promise.resolve(true),
      }),
    });
    class FixtureBoundary extends Component<
      { children: ReactNode },
      { error?: Error }
    > {
      state: { error?: Error } = {};
      static getDerivedStateFromError(error: Error) {
        return { error };
      }
      render() {
        return this.state.error ? (
          <ApplicationError
            error={this.state.error}
            reset={() => this.setState({})}
          />
        ) : (
          this.props.children
        );
      }
    }
    function BrokenFixture(): ReactNode {
      throw new Error("private-password-render-fixture");
    }
    vi.spyOn(console, "error").mockImplementation(() => {}); // Only the intentionally thrown React fixture.
    render(
      <FixtureBoundary>
        <BrokenFixture />
      </FixtureBoundary>,
    );
    await waitFor(() =>
      expect(screen.getByRole("alert")).toHaveTextContent(
        "Đã xảy ra lỗi hệ thống",
      ),
    );
    expect(
      screen.queryByText("private-password-render-fixture"),
    ).not.toBeInTheDocument();
    await Sentry.flush(1000);
    const events = envelopes.flatMap((envelope) =>
      envelope[1].filter(([header]) => header.type === "event"),
    );
    expect(events).toHaveLength(1);
    expect(JSON.stringify(envelopes)).not.toContain(
      "private-password-render-fixture",
    );
  }, 15000);
  it("does not propagate a monitoring transport failure into UI code", async () => {
    Sentry.init({
      ...monitoringOptions("https://public@example.invalid/1", "0"),
      defaultIntegrations: false,
      transport: () => ({
        send: () => Promise.reject(new Error("offline")),
        flush: () => Promise.resolve(true),
      }),
    });
    expect(() =>
      reportUnexpected(new Error("synthetic unexpected failure")),
    ).not.toThrow();
    await Sentry.flush(100);
  });
});
