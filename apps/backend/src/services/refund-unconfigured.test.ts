/**
 * Issue #569 — when TRUSTLESS_WORK_API_KEY / TRUSTLESS_WORK_DISPUTE_RESOLVER_SECRET
 * are unset, refund execution must fail with a clean 503 (REFUND_EXECUTION_UNAVAILABLE),
 * not a 500 or a silent success.
 */
import { RefundService, InMemoryRefundStore, TrustlessWorkRefundExecutor, REFUND_ERROR_CODES } from "./refund.service";
import { TrustlessWorkNotConfiguredError, trustlessWorkClient } from "../lib/trustless-work";
import { AppError } from "../middleware/errorHandler";

const ENV_KEYS = ["TRUSTLESS_WORK_API_KEY", "TRUSTLESS_WORK_DISPUTE_RESOLVER_SECRET"] as const;

describe("Trustless Work unset configuration (#569)", () => {
  const saved: Partial<Record<(typeof ENV_KEYS)[number], string | undefined>> = {};

  beforeEach(() => {
    for (const key of ENV_KEYS) {
      saved[key] = process.env[key];
      delete process.env[key];
    }
  });

  afterEach(() => {
    for (const key of ENV_KEYS) {
      if (saved[key] === undefined) delete process.env[key];
      else process.env[key] = saved[key];
    }
  });

  it("trustless work client refuses to resolve a dispute with TrustlessWorkNotConfiguredError", async () => {
    await expect(
      trustlessWorkClient.resolveDispute({
        contractId: "C".padEnd(56, "A"),
        escrowType: "single-release",
        distributions: [{ address: "G".padEnd(56, "A"), amount: 1 }],
      } as any),
    ).rejects.toBeInstanceOf(TrustlessWorkNotConfiguredError);
  });

  it("refund claim execution maps the unset config to a 503 REFUND_EXECUTION_UNAVAILABLE", async () => {
    const service = new RefundService(new InMemoryRefundStore(), new TrustlessWorkRefundExecutor());

    const error = await service
      .claimRefund({
        refundId: "refund-569",
        escrowId: "C".padEnd(56, "A"),
        refundTo: "G".padEnd(56, "A"),
        amount: "10",
        escrowType: "single-release",
        claimedBy: "user-1",
      } as any)
      .catch((e: unknown) => e);

    expect(error).toBeInstanceOf(AppError);
    expect((error as AppError).statusCode).toBe(503);
    expect((error as AppError).code).toBe(REFUND_ERROR_CODES.EXECUTION_UNAVAILABLE);
  });
});
