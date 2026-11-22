import { createHmac } from "crypto";
import express from "express";
import request from "supertest";

const WEBHOOK_SECRET = "test-webhook-secret";

jest.mock("../config/env", () => ({
  env: {
    TRUSTLESS_WORK_WEBHOOK_SECRET: "test-webhook-secret",
    NODE_ENV: "test",
    LOG_LEVEL: "silent",
  },
}));
jest.mock("../lib/logger", () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn() },
}));
jest.mock("../lib/sentry", () => ({
  Sentry: {
    captureException: jest.fn(),
    captureMessage: jest.fn(),
    setTag: jest.fn(),
    setContext: jest.fn(),
  },
}));
jest.mock("../services/hasura.service", () => ({
  HasuraService: {
    updateEscrowStatus: jest.fn(),
    claimProcessedWebhookEvent: jest.fn(),
    deleteProcessedWebhookEventsBefore: jest.fn(),
  },
}));
jest.mock("../services/notification.service", () => ({
  NotificationService: { notifyEscrowStatusChange: jest.fn() },
}));

import { env } from "../config/env";
import { captureRawBody } from "../middleware/rawBody";
import { HasuraService } from "../services/hasura.service";
import { webhookRouter, STATUS_MAP } from "./webhooks";
import { Sentry } from "../lib/sentry";

const updateEscrowStatus = HasuraService.updateEscrowStatus as jest.Mock;
const claimProcessedWebhookEvent = HasuraService.claimProcessedWebhookEvent as jest.Mock;
const notifyEscrowStatusChange = (
  jest.requireMock("../services/notification.service") as {
    NotificationService: { notifyEscrowStatusChange: jest.Mock };
  }
).NotificationService.notifyEscrowStatusChange;

function buildApp() {
  const app = express();
  app.use(express.json({ verify: captureRawBody }));
  app.use("/webhooks", webhookRouter);
  return app;
}

function sign(rawBody: string, secret = WEBHOOK_SECRET) {
  return createHmac("sha256", secret).update(rawBody).digest("hex");
}

function post(rawBody: string, headers: Record<string, string> = {}) {
  return request(buildApp())
    .post("/webhooks/escrow-status")
    .set("Content-Type", "application/json")
    .set(headers)
    .send(rawBody);
}

const payload = JSON.stringify({
  contractId: "contract-123",
  engagementId: "ENG-001",
  status: "completed",
});

// Canonical list of every escrow status Trustless Work documents as deliverable
// via the escrow-status webhook. Sourced from Trustless Work's API docs
// (escrow lifecycle statuses plus the aliases they emit in webhook payloads).
// If Trustless Work adds a status, add it here and to STATUS_MAP in webhooks.ts;
// this test fails otherwise so a legitimate delivery can never be silently
// rejected with a 400 (and retried forever).
const DOCUMENTED_TRUSTLESS_WORK_STATUSES = [
  // Canonical escrow lifecycle statuses.
  "created",
  "funded",
  "completed",
  "disputed",
  "released",
  "cancelled",
  "refunded",
  // Aliases Trustless Work emits in webhook payloads.
  "ACTIVE",
  "PENDING",
  "COMPLETE",
  "CANCELLED",
  "DISPUTED",
  "RELEASED",
  "REFUNDED",
] as const;

describe("STATUS_MAP coverage", () => {
  it("maps every documented Trustless Work escrow status", () => {
    // The route lowercases the incoming status before lookup, so coverage is
    // case-insensitive.
    const missing = DOCUMENTED_TRUSTLESS_WORK_STATUSES.filter(
      (status) => !(status.toLowerCase() in STATUS_MAP)
    );

    expect(missing).toEqual([]);
  });

  it("maps every documented status to a non-empty string", () => {
    for (const status of DOCUMENTED_TRUSTLESS_WORK_STATUSES) {
      const mapped = STATUS_MAP[status.toLowerCase()];
      expect(typeof mapped).toBe("string");
      expect(mapped.length).toBeGreaterThan(0);
    }
  });
});

describe("POST /webhooks/escrow-status", () => {
  const captureException = Sentry.captureException as jest.Mock;

  beforeEach(() => {
    captureException.mockClear();
  });
  beforeEach(() => {
    (env as { TRUSTLESS_WORK_WEBHOOK_SECRET?: string }).TRUSTLESS_WORK_WEBHOOK_SECRET =
      WEBHOOK_SECRET;
    updateEscrowStatus.mockResolvedValue({ affected_rows: 1 });
    claimProcessedWebhookEvent.mockResolvedValue(true);
    notifyEscrowStatusChange.mockResolvedValue({
      emailSent: true,
      pushSent: false,
      channel: "email",
      timestamp: "t",
    });
  });

  it("updates escrow status by contractId and notifies for a validly signed payload", async () => {
    const res = await post(payload, { "x-trustless-work-signature": sign(payload) });

    expect(res.status).toBe(200);
    expect(updateEscrowStatus).toHaveBeenCalledTimes(1);
    expect(updateEscrowStatus).toHaveBeenCalledWith("contract-123", "completed");
    expect(notifyEscrowStatusChange).toHaveBeenCalledWith(
      expect.objectContaining({
        contractId: "contract-123",
        engagementId: "ENG-001",
        status: "completed",
      })
    );
    expect(res.body).toMatchObject({
      success: true,
      contractId: "contract-123",
      engagementId: "ENG-001",
      status: "completed",
      rowsUpdated: 1,
    });
  });

  it("verifies the signature against the exact raw bytes that were sent", async () => {
    // Whitespace that JSON.stringify(req.body) would not reproduce.
    const spaced = '{ "contractId": "contract-123",  "status": "funded" }';
    const res = await post(spaced, { "x-webhook-signature": `sha256=${sign(spaced)}` });

    expect(res.status).toBe(200);
    expect(updateEscrowStatus).toHaveBeenCalledWith("contract-123", "funded");
  });

  it("maps Trustless Work status aliases through STATUS_MAP", async () => {
    const body = JSON.stringify({ contractId: "contract-123", status: "ACTIVE" });
    const res = await post(body, { "x-signature": sign(body) });

    expect(res.status).toBe(200);
    expect(updateEscrowStatus).toHaveBeenCalledWith("contract-123", "funded");
  });

  it("rejects a request with no signature header and does not write", async () => {
    const res = await post(payload);

    expect(res.status).toBe(401);
    expect(updateEscrowStatus).not.toHaveBeenCalled();
    expect(notifyEscrowStatusChange).not.toHaveBeenCalled();
  });

  it("rejects an invalid signature and does not write", async () => {
    const res = await post(payload, {
      "x-trustless-work-signature": sign(payload, "wrong-secret"),
    });

    expect(res.status).toBe(401);
    expect(updateEscrowStatus).not.toHaveBeenCalled();
  });

  it("rejects a tampered payload that carries a valid signature for different bytes", async () => {
    // Sign payload A...
    const signedBody = JSON.stringify({
      contractId: "contract-123",
      engagementId: "ENG-001",
      status: "completed",
    });
    const signatureForA = sign(signedBody);

    // ...but send payload B (a different status) with A's signature.
    const tamperedBody = JSON.stringify({
      contractId: "contract-123",
      engagementId: "ENG-001",
      status: "released",
    });
    expect(tamperedBody).not.toBe(signedBody);

    const res = await post(tamperedBody, {
      "x-trustless-work-signature": signatureForA,
    });

    expect(res.status).toBe(401);
    expect(updateEscrowStatus).not.toHaveBeenCalled();
    expect(notifyEscrowStatusChange).not.toHaveBeenCalled();
  });

  it("rejects a payload whose bytes were modified after signing", async () => {
    // Sign the exact bytes that will be sent...
    const signedBody = JSON.stringify({
      contractId: "contract-123",
      engagementId: "ENG-001",
      status: "completed",
    });
    const signature = sign(signedBody);

    // ...then mutate the raw bytes (extra whitespace) while keeping the signature.
    // A re-serialized/re-parsed body would normalize this away, so a 401 here
    // proves verification runs against the raw captured bytes.
    const tamperedBody = `${signedBody} `;
    expect(tamperedBody).not.toBe(signedBody);

    const res = await post(tamperedBody, {
      "x-trustless-work-signature": signature,
    });

    expect(res.status).toBe(401);
    expect(updateEscrowStatus).not.toHaveBeenCalled();
    expect(notifyEscrowStatusChange).not.toHaveBeenCalled();
  });

  it("fails closed with 500 when the webhook secret is not configured", async () => {
    (env as { TRUSTLESS_WORK_WEBHOOK_SECRET?: string }).TRUSTLESS_WORK_WEBHOOK_SECRET = undefined;

    const res = await post(payload, { "x-trustless-work-signature": sign(payload) });

    expect(res.status).toBe(500);
    expect(updateEscrowStatus).not.toHaveBeenCalled();
    expect(captureException).toHaveBeenCalledWith(
      expect.objectContaining({ message: "TRUSTLESS_WORK_WEBHOOK_SECRET is not configured" }),
      expect.objectContaining({
        tags: expect.objectContaining({ alert: "webhook.delivery_failure" }),
      })
    );
  });

  it("rejects a signed payload without contractId", async () => {
    const body = JSON.stringify({ engagementId: "ENG-001", status: "completed" });
    const res = await post(body, { "x-trustless-work-signature": sign(body) });

    expect(res.status).toBe(400);
    expect(updateEscrowStatus).not.toHaveBeenCalled();
  });

  it("rejects a signed payload with an unknown status", async () => {
    const body = JSON.stringify({ contractId: "contract-123", status: "teleported" });
    const res = await post(body, { "x-trustless-work-signature": sign(body) });

    expect(res.status).toBe(400);
    expect(updateEscrowStatus).not.toHaveBeenCalled();
  });

  it("returns 500 (so Trustless Work retries) when the Hasura write fails", async () => {
    updateEscrowStatus.mockRejectedValue(new Error("Failed to update escrow status in Hasura"));

    const res = await post(payload, { "x-trustless-work-signature": sign(payload) });

    expect(res.status).toBe(500);
    expect(notifyEscrowStatusChange).not.toHaveBeenCalled();
    expect(captureException).toHaveBeenCalledWith(
      expect.any(Error),
      expect.objectContaining({
        tags: expect.objectContaining({ alert: "webhook.delivery_failure", retryable: "true" }),
        extra: expect.objectContaining({ contractId: "contract-123" }),
      })
    );
  });

  it("still returns 200 when only the notification fails after a successful write", async () => {
    notifyEscrowStatusChange.mockRejectedValue(new Error("smtp down"));

    const res = await post(payload, { "x-trustless-work-signature": sign(payload) });

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ success: true, rowsUpdated: 1, notifications: null });
  });

  it("is idempotent: replaying the identical signed payload does not duplicate side effects", async () => {
    // First delivery claims the dedup key; the replay loses the insert race.
    claimProcessedWebhookEvent.mockResolvedValueOnce(true).mockResolvedValueOnce(false);

    // First delivery: the escrow transitions to the new status and a notification fires.
    const first = await post(payload, { "x-trustless-work-signature": sign(payload) });
    expect(first.status).toBe(200);
    expect(updateEscrowStatus).toHaveBeenCalledTimes(1);
    expect(notifyEscrowStatusChange).toHaveBeenCalledTimes(1);

    // Replay of the exact same signed bytes: the status write is a no-op
    // (affected_rows: 0) because the row already holds the target status, so
    // no duplicate notification is emitted.
    updateEscrowStatus.mockResolvedValue({ affected_rows: 0 });
    const replay = await post(payload, { "x-trustless-work-signature": sign(payload) });

    expect(replay.status).toBe(200);
    expect(replay.body).toMatchObject({
      success: true,
      contractId: "contract-123",
      status: "completed",
      rowsUpdated: 0,
    });
    // The replay must not trigger a second notification for the same event.
    expect(notifyEscrowStatusChange).toHaveBeenCalledTimes(1);
  });
});

describe("POST /webhooks/escrow-status under concurrent load", () => {
  // Realistic burst target: Trustless Work retrying a batch of deliveries after a
  // network blip, or many escrows changing status around the same event.
  const CONCURRENT_DELIVERIES = 200;
  const TARGET_THROUGHPUT_RPS = 50;

  beforeEach(() => {
    (env as { TRUSTLESS_WORK_WEBHOOK_SECRET?: string }).TRUSTLESS_WORK_WEBHOOK_SECRET =
      WEBHOOK_SECRET;
    updateEscrowStatus.mockReset();
    notifyEscrowStatusChange.mockReset();
    claimProcessedWebhookEvent.mockReset();
    updateEscrowStatus.mockResolvedValue({ affected_rows: 1 });
    claimProcessedWebhookEvent.mockResolvedValue(true);
    notifyEscrowStatusChange.mockResolvedValue({
      emailSent: true,
      pushSent: false,
      channel: "email",
      timestamp: "t",
    });
  });

  it(
    `handles ${CONCURRENT_DELIVERIES} concurrent deliveries with no dropped or corrupted updates`,
    async () => {
      const app = buildApp();

      // Each delivery targets a distinct escrow so we can assert that every
      // status change is persisted exactly once and with the correct value.
      const deliveries = Array.from({ length: CONCURRENT_DELIVERIES }, (_, i) => {
        const contractId = `contract-load-${i}`;
        const status = i % 2 === 0 ? "completed" : "funded";
        const body = JSON.stringify({
          contractId,
          engagementId: `ENG-${i}`,
          status,
        });
        return { contractId, status, body };
      });

      const startedAt = Date.now();
      const responses = await Promise.all(
        deliveries.map(({ body }) =>
          request(app)
            .post("/webhooks/escrow-status")
            .set("Content-Type", "application/json")
            .set("x-trustless-work-signature", sign(body))
            .send(body)
        )
      );
      const elapsedMs = Date.now() - startedAt;

      // No dropped deliveries: every request must succeed.
      for (const res of responses) {
        expect(res.status).toBe(200);
        expect(res.body).toMatchObject({ success: true, rowsUpdated: 1 });
      }

      // No corrupted updates: each escrow is written exactly once with its own status.
      expect(updateEscrowStatus).toHaveBeenCalledTimes(CONCURRENT_DELIVERIES);
      for (const { contractId, status } of deliveries) {
        expect(updateEscrowStatus).toHaveBeenCalledWith(contractId, status);
      }

      // Every successful write triggers exactly one notification.
      expect(notifyEscrowStatusChange).toHaveBeenCalledTimes(CONCURRENT_DELIVERIES);

      // Confirm the handler sustains the realistic target throughput.
      const throughputRps = (CONCURRENT_DELIVERIES / elapsedMs) * 1000;
      expect(throughputRps).toBeGreaterThanOrEqual(TARGET_THROUGHPUT_RPS);
    },
    30_000
  );

  it("does not drop or corrupt updates when a burst of retries hits the same escrow", async () => {
    const app = buildApp();
    const contractId = "contract-retry-burst";
    const body = JSON.stringify({ contractId, engagementId: "ENG-RETRY", status: "completed" });

    const responses = await Promise.all(
      Array.from({ length: 50 }, () =>
        request(app)
          .post("/webhooks/escrow-status")
          .set("Content-Type", "application/json")
          .set("x-trustless-work-signature", sign(body))
          .send(body)
      )
    );

    for (const res of responses) {
      expect(res.status).toBe(200);
      expect(res.body).toMatchObject({ success: true, contractId, status: "completed" });
    }

    // Every retried delivery is applied idempotently to the same escrow.
    expect(updateEscrowStatus).toHaveBeenCalledTimes(50);
    for (const call of updateEscrowStatus.mock.calls) {
      expect(call).toEqual([contractId, "completed"]);
    }
  }, 30_000);
});

describe("POST /webhooks/escrow-status IP allowlist (#532)", () => {
  type MutableEnv = {
    TRUSTLESS_WORK_WEBHOOK_SECRET?: string;
    TRUSTLESS_WORK_WEBHOOK_ALLOWED_IPS?: string;
  };

  beforeEach(() => {
    (env as MutableEnv).TRUSTLESS_WORK_WEBHOOK_SECRET = WEBHOOK_SECRET;
    updateEscrowStatus.mockReset();
    updateEscrowStatus.mockResolvedValue({ affected_rows: 1 });
    notifyEscrowStatusChange.mockResolvedValue({ emailSent: false, pushSent: false });
  });

  afterEach(() => {
    (env as MutableEnv).TRUSTLESS_WORK_WEBHOOK_ALLOWED_IPS = undefined;
  });

  function uniquePayload(tag: string) {
    return JSON.stringify({ contractId: `contract-allowlist-${tag}`, status: "completed" });
  }

  it("does not check the source IP when no allowlist is configured", async () => {
    const body = uniquePayload("unset");
    const res = await post(body, { "x-trustless-work-signature": sign(body) });

    expect(res.status).toBe(200);
    expect(updateEscrowStatus).toHaveBeenCalledTimes(1);
  });

  it("accepts a signed delivery from an allowlisted IP", async () => {
    // supertest connects over loopback (IPv4 or IPv6 depending on the host).
    (env as MutableEnv).TRUSTLESS_WORK_WEBHOOK_ALLOWED_IPS = "127.0.0.0/8, ::1";
    const body = uniquePayload("allowed");
    const res = await post(body, { "x-trustless-work-signature": sign(body) });

    expect(res.status).toBe(200);
    expect(updateEscrowStatus).toHaveBeenCalledTimes(1);
  });

  it("rejects a validly signed delivery from a non-allowlisted IP without writing", async () => {
    (env as MutableEnv).TRUSTLESS_WORK_WEBHOOK_ALLOWED_IPS = "203.0.113.10";
    const body = uniquePayload("blocked");
    const res = await post(body, { "x-trustless-work-signature": sign(body) });

    expect(res.status).toBe(403);
    expect(updateEscrowStatus).not.toHaveBeenCalled();
  });

  it("still enforces HMAC for allowlisted IPs", async () => {
    (env as MutableEnv).TRUSTLESS_WORK_WEBHOOK_ALLOWED_IPS = "127.0.0.0/8, ::1";
    const body = uniquePayload("bad-sig");
    const res = await post(body, { "x-trustless-work-signature": "0".repeat(64) });

    expect(res.status).toBe(401);
    expect(updateEscrowStatus).not.toHaveBeenCalled();
  });
});
