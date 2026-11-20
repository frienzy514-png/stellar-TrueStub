jest.mock("./logger", () => ({
  logger: { warn: jest.fn(), error: jest.fn() },
}));
jest.mock("./sentry", () => ({
  Sentry: { captureMessage: jest.fn() },
}));

import { logger } from "./logger";
import { Sentry } from "./sentry";
import { trackFinancialOperation } from "./financial-operation-monitor";

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
