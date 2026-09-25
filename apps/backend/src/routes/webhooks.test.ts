import { createHmac } from "crypto";
import express from "express";
import request from "supertest";

const WEBHOOK_SECRET = "test-webhook-secret";

jest.mock("../config/env", () => ({
  env: { TRUSTLESS_WORK_WEBHOOK_SECRET: "test-webhook-secret", NODE_ENV: "test", LOG_LEVEL: "silent" },
}));
jest.mock("../lib/logger", () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn() },
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
  beforeEach(() => {
    (env as { TRUSTLESS_WORK_WEBHOOK_SECRET?: string }).TRUSTLESS_WORK_WEBHOOK_SECRET = WEBHOOK_SECRET;
    updateEscrowStatus.mockResolvedValue({ affected_rows: 1 });
    notifyEscrowStatusChange.mockResolvedValue({ emailSent: true, pushSent: false, channel: "email", timestamp: "t" });
  });

  it("updates escrow status by contractId and notifies for a validly signed payload", async () => {
    const res = await post(payload, { "x-trustless-work-signature": sign(payload) });

    expect(res.status).toBe(200);
    expect(updateEscrowStatus).toHaveBeenCalledTimes(1);
    expect(updateEscrowStatus).toHaveBeenCalledWith("contract-123", "completed");
    expect(notifyEscrowStatusChange).toHaveBeenCalledWith(
      expect.objectContaining({ contractId: "contract-123", engagementId: "ENG-001", status: "completed" })
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
    const res = await post(payload, { "x-trustless-work-signature": sign(payload, "wrong-secret") });

    expect(res.status).toBe(401);
    expect(updateEscrowStatus).not.toHaveBeenCalled();
  });

  it("fails closed with 500 when the webhook secret is not configured", async () => {
    (env as { TRUSTLESS_WORK_WEBHOOK_SECRET?: string }).TRUSTLESS_WORK_WEBHOOK_SECRET = undefined;

    const res = await post(payload, { "x-trustless-work-signature": sign(payload) });

    expect(res.status).toBe(500);
    expect(updateEscrowStatus).not.toHaveBeenCalled();
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
  });

  it("still returns 200 when only the notification fails after a successful write", async () => {
    notifyEscrowStatusChange.mockRejectedValue(new Error("smtp down"));

    const res = await post(payload, { "x-trustless-work-signature": sign(payload) });

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ success: true, rowsUpdated: 1, notifications: null });
  });
});
