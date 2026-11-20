import express from "express";
import request from "supertest";

// Real pino logger that writes JSON lines into an in-memory buffer, so the
// tests assert on exactly what would reach the log sink.
const mockLogLines: string[] = [];
jest.mock("../lib/logger", () => {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const pino = require("pino");
  return {
    logger: pino(
      { level: "info" },
      { write: (line: string) => mockLogLines.push(line) }
    ),
  };
});

jest.mock("../lib/sentry", () => ({
  Sentry: { setTag: jest.fn(), setContext: jest.fn(), captureException: jest.fn() },
}));

import { correlationContext, getCorrelationId, requestLogger } from "./requestLogger";
import { Sentry } from "../lib/sentry";

type LogEntry = {
  msg?: string;
  requestId?: string;
  req?: { id?: string; headers?: Record<string, unknown>; body?: unknown };
  res?: { statusCode?: number };
};

function buildApp() {
  const app = express();
  app.use(requestLogger);
  app.use(express.json());
  app.use(correlationContext);
  app.get("/ok", (_req, res) => {
    res.json({ correlationId: getCorrelationId() });
  });
  app.get("/missing", (_req, res) => {
    res.status(404).json({ error: "nope" });
  });
  app.post("/api/users", (_req, res) => res.sendStatus(204));
  app.post("/api/refunds", (_req, res) => res.sendStatus(204));
  app.post("/api/disputes", (_req, res) => res.sendStatus(204));
  return app;
}

/** pino-http logs on response finish, so wait briefly for the line to land. */
async function waitForLog(): Promise<LogEntry> {
  for (let i = 0; i < 50 && mockLogLines.length === 0; i++) {
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
  expect(mockLogLines.length).toBeGreaterThan(0);
  return JSON.parse(mockLogLines[mockLogLines.length - 1]) as LogEntry;
}

beforeEach(() => {
  mockLogLines.length = 0;
});

describe("requestLogger — sensitive header redaction", () => {
  it("redacts Authorization, Cookie and x-webhook-secret in log output", async () => {
    await request(buildApp())
      .get("/ok")
      .set("Authorization", "Bearer super-secret-token")
      .set("Cookie", "session=super-secret-cookie")
      .set("x-webhook-secret", "super-secret-webhook")
      .set("x-safe-header", "visible-value");

    const entry = await waitForLog();
    const headers = entry.req?.headers ?? {};

    expect(headers.authorization).toBe("[REDACTED]");
    expect(headers.cookie).toBe("[REDACTED]");
    expect(headers["x-webhook-secret"]).toBe("[REDACTED]");
    // Non-sensitive headers are still logged.
    expect(headers["x-safe-header"]).toBe("visible-value");
  });

  it("never writes the raw secret values anywhere in the log line", async () => {
    await request(buildApp())
      .get("/ok")
      .set("Authorization", "Bearer super-secret-token")
      .set("Cookie", "session=super-secret-cookie")
      .set("x-webhook-secret", "super-secret-webhook");

    await waitForLog();
    const raw = mockLogLines.join("\n");

    expect(raw).not.toContain("super-secret-token");
    expect(raw).not.toContain("super-secret-cookie");
    expect(raw).not.toContain("super-secret-webhook");
  });
});

describe("requestLogger — request body privacy", () => {
  it.each([
    {
      path: "/api/users",
      body: {
        email: "person@example.test",
        phone: "+1-555-0100",
        governmentId: "user-private-id-592",
      },
    },
    {
      path: "/api/refunds",
      body: {
        cardNumber: "refund-private-card-592",
        accountNumber: "refund-private-account-592",
        paymentToken: "refund-private-token-592",
      },
    },
    {
      path: "/api/disputes",
      body: {
        privateReasoning: "dispute-private-reasoning-592",
        evidenceDetails: "dispute-private-evidence-592",
      },
    },
  ])("never logs request body fields or values for $path", async ({ path, body }) => {
    await request(buildApp()).post(path).send(body).expect(204);
    const entry = await waitForLog();
    expect(entry.req?.body).toBeUndefined();

    const raw = mockLogLines.join("\n");
    for (const [field, value] of Object.entries(body)) {
      expect(raw).not.toContain(field);
      expect(raw).not.toContain(value);
    }
  });
});

describe("requestLogger — request IDs", () => {
  it("generates an x-request-id when none is sent and logs it", async () => {
    const res = await request(buildApp()).get("/ok");

    const id = res.headers["x-request-id"];
    expect(typeof id).toBe("string");
    expect(id.length).toBeGreaterThan(0);

    const entry = await waitForLog();
    expect(entry.requestId).toBe(id);
  });

  it("forwards an incoming x-request-id unchanged", async () => {
    const res = await request(buildApp()).get("/ok").set("x-request-id", "req-123");

    expect(res.headers["x-request-id"]).toBe("req-123");
    const entry = await waitForLog();
    expect(entry.requestId).toBe("req-123");
  });

  it("binds the request ID as the correlation ID for downstream code", async () => {
    const res = await request(buildApp()).get("/ok").set("x-request-id", "req-456");

    expect(res.body).toEqual({ correlationId: "req-456" });
    expect(Sentry.setTag).toHaveBeenCalledWith("request_id", "req-456");
    expect(getCorrelationId()).toBeUndefined();
  });
});

describe("requestLogger — message format", () => {
  it("logs method, path and status", async () => {
    await request(buildApp()).get("/missing");

    const entry = await waitForLog();
    expect(entry.msg).toBe("GET /missing 404");
    expect(entry.res?.statusCode).toBe(404);
  });
});
