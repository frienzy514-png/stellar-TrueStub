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
  Sentry: { captureException: jest.fn() },
}));
jest.mock("../services/hasura.service", () => ({
  HasuraService: { updateEscrowStatus: jest.fn() },
}));
jest.mock("../services/notification.service", () => ({
  NotificationService: { notifyEscrowStatusChange: jest.fn() },
}));

import { env } from "../config/env";
import { captureRawBody } from "../middleware/rawBody";
import { HasuraService } from "../services/hasura.service";
import { NotificationService } from "../services/notification.service";
import { webhookRouter } from "./webhooks";
import { Sentry } from "../lib/sentry";

const updateEscrowStatus = HasuraService.updateEscrowStatus as jest.Mock;
const notifyEscrowStatusChange = NotificationService.notifyEscrowStatusChange as jest.Mock;

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

describe("POST /webhooks/escrow-status", () => {
  const captureException = Sentry.captureException as jest.Mock;

  beforeEach(() => {
    captureException.mockClear();
  });
  beforeEach(() => {
    (env as { TRUSTLESS_WORK_WEBHOOK_SECRET?: string }).TRUSTLESS_WORK_WEBHOOK_SECRET =
      WEBHOOK_SECRET;
    updateEscrowStatus.mockResolvedValue({ affected_rows: 1 });
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
        extra: { contractId: "contract-123" },
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
    updateEscrowStatus.mockResolvedValue({ affected_rows: 1 });
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
