jest.mock("./logger", () => ({
  logger: { warn: jest.fn(), error: jest.fn() },
}));
jest.mock("./sentry", () => ({
  Sentry: { captureMessage: jest.fn() },
}));

import { logger } from "./logger";
import { Sentry } from "./sentry";
import { trackFinancialOperation } from "./financial-operation-monitor";
import { env } from "../config/env";

describe("trackFinancialOperation", () => {
  beforeEach(() => jest.clearAllMocks());

  it("emits a distinct warning and Sentry alert when a financial operation is slow", async () => {
    const result = await trackFinancialOperation(
      "refund.claim",
      async () => "submitted",
      { refundId: "refund-1" },
      0,
    );

    expect(result).toBe("submitted");
    expect(logger.warn).toHaveBeenCalledWith(
      expect.objectContaining({
        alert: "financial_operation_slow",
        operation: "refund.claim",
        refundId: "refund-1",
      }),
      expect.stringContaining("[FINANCIAL_OPERATION_SLOW]"),
    );
    expect(Sentry.captureMessage).toHaveBeenCalledWith(
      expect.stringContaining("refund.claim"),
      expect.objectContaining({
        level: "warning",
        tags: expect.objectContaining({
          alert: "financial_operation_slow",
          operation: "refund.claim",
        }),
      }),
    );
  });

  it("returns the operation result and emits no alert when it is below threshold", async () => {
    const result = await trackFinancialOperation(
      "transfer.accept",
      async () => 17,
      {},
      Number.MAX_SAFE_INTEGER,
    );

    expect(result).toBe(17);
    expect(logger.warn).not.toHaveBeenCalled();
    expect(Sentry.captureMessage).not.toHaveBeenCalled();
  });

  it("preserves a rejected operation while still recording its duration", async () => {
    await expect(
      trackFinancialOperation("dispute.transition", async () => {
        throw new Error("transition failed");
      }, {}, 0),
    ).rejects.toThrow("transition failed");

    expect(logger.warn).toHaveBeenCalled();
    expect(Sentry.captureMessage).toHaveBeenCalled();
  });
});

describe("trackFinancialOperation with CRITICAL_ALERT_WEBHOOK_URL unset (#571)", () => {
  const originalWebhookUrl = env.CRITICAL_ALERT_WEBHOOK_URL;
  let fetchSpy: jest.SpyInstance;

  beforeEach(() => {
    jest.clearAllMocks();
    env.CRITICAL_ALERT_WEBHOOK_URL = undefined;
    fetchSpy = jest.spyOn(global, "fetch").mockResolvedValue(new Response(null, { status: 200 }));
  });

  afterEach(() => {
    env.CRITICAL_ALERT_WEBHOOK_URL = originalWebhookUrl;
    fetchSpy.mockRestore();
  });

  it("still logs and reports to Sentry for a slow refund claim, without calling a webhook", async () => {
    await trackFinancialOperation(
      "refund.claim",
      async () => "submitted",
      { refundId: "refund-571" },
      0,
    );

    expect(logger.warn).toHaveBeenCalledWith(
      expect.objectContaining({
        alert: "financial_operation_slow",
        operation: "refund.claim",
        refundId: "refund-571",
      }),
      expect.stringContaining("[FINANCIAL_OPERATION_SLOW]"),
    );
    expect(Sentry.captureMessage).toHaveBeenCalledWith(
      expect.stringContaining("refund.claim"),
      expect.objectContaining({ level: "warning" }),
    );
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("still alerts through the log and Sentry when a slow transfer fails", async () => {
    await expect(
      trackFinancialOperation(
        "transfer.initiate",
        async () => {
          throw new Error("transfer rejected");
        },
        { escrowId: "escrow-571" },
        0,
      ),
    ).rejects.toThrow("transfer rejected");

    expect(logger.warn).toHaveBeenCalledWith(
      expect.objectContaining({ operation: "transfer.initiate", escrowId: "escrow-571" }),
      expect.stringContaining("transfer.initiate"),
    );
    expect(Sentry.captureMessage).toHaveBeenCalledWith(
      expect.stringContaining("transfer.initiate"),
      expect.objectContaining({ level: "warning" }),
    );
    expect(fetchSpy).not.toHaveBeenCalled();
  });
});
