/**
 * #557 — TRUSTLESS_WORK_DISPUTE_RESOLVER_SECRET must never appear in any
 * logged request/response or error-reporting call, including failure paths.
 *
 * These tests force a refund claim to fail inside the real on-chain executor
 * (with the secret configured) and then inspect every logger call, every
 * Sentry capture, the thrown error, and the persisted refund record for the
 * secret's value.
 */

import { Keypair } from "@stellar/stellar-sdk";
import { RefundService, InMemoryRefundStore, TrustlessWorkRefundExecutor } from "./refund.service";
import { logger } from "../lib/logger";
import * as sentry from "../lib/sentry";
import { env } from "../config/env";

jest.mock("../config/env", () => {
  const actual = jest.requireActual("../config/env");
  return {
    ...actual,
    env: {
      ...actual.env,
      TRUSTLESS_WORK_API_KEY: "tw-api-key-for-redaction-test",
      TRUSTLESS_WORK_DISPUTE_RESOLVER_SECRET: require("@stellar/stellar-sdk").Keypair.fromRawEd25519Seed(Buffer.alloc(32, 7)).secret(),
      TRUSTLESS_WORK_API_URL: "https://trustless.example.test",
      STELLAR_NETWORK: "testnet",
    },
  };
});

const payload = {
  refundId: "refund-redaction-1",
  escrowId: "CAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA",
  amount: 10,
  currency: "USDC",
  claimedBy: "buyer-1",
  refundTo: Keypair.random().publicKey(),
  escrowType: "single-release" as const,
};

/** Serialises everything a log/Sentry sink could receive, including Error internals. */
function serialise(value: unknown): string {
  return JSON.stringify(value, (_key, v) => {
    if (v instanceof Error) {
      return { ...v, name: v.name, message: v.message, stack: v.stack };
    }
    return v;
  }) ?? "";
}

function collectAllSinkOutput(): string {
  const logCalls = [
    ...(logger.info as jest.Mock).mock.calls,
    ...(logger.warn as jest.Mock).mock.calls,
    ...(logger.error as jest.Mock).mock.calls,
    ...(logger.debug as jest.Mock).mock.calls,
    ...(logger.fatal as jest.Mock).mock.calls,
  ];
  const sentryCalls = (sentry.captureException as unknown as jest.Mock).mock.calls;
  return serialise({ logCalls, sentryCalls });
}

describe("TRUSTLESS_WORK_DISPUTE_RESOLVER_SECRET redaction (#557)", () => {
  let secret: string;

  beforeEach(() => {
    secret = env.TRUSTLESS_WORK_DISPUTE_RESOLVER_SECRET ?? "";
    jest.spyOn(logger, "info");
    jest.spyOn(logger, "warn");
    jest.spyOn(logger, "error");
    jest.spyOn(logger, "debug");
    jest.spyOn(logger, "fatal");
    jest.spyOn(sentry, "captureException");
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it("the test secret is a real Stellar secret key (guards against a vacuous test)", () => {
    expect(secret).toMatch(/^S[A-Z2-7]{55}$/);
    expect(() => Keypair.fromSecret(secret)).not.toThrow();
  });

  it("never logs or reports the secret when the Trustless Work API returns an error", async () => {
    const fetchSpy = jest.fn().mockResolvedValue({
      ok: false,
      status: 500,
      statusText: "Internal Server Error",
      json: async () => ({ message: "upstream exploded" }),
    });
    (global as unknown as { fetch: unknown }).fetch = fetchSpy;

    const service = new RefundService(new InMemoryRefundStore(), new TrustlessWorkRefundExecutor());

    let thrown: unknown;
    try {
      await service.claimRefund(payload);
    } catch (err) {
      thrown = err;
    }

    // The failure path must actually have run, or the assertions below prove nothing.
    expect(fetchSpy).toHaveBeenCalled();
    expect(thrown).toBeDefined();
    expect(logger.error).toHaveBeenCalledWith(expect.anything(), "refund.execution_failed");
    expect(sentry.captureException).toHaveBeenCalled();

    expect(collectAllSinkOutput()).not.toContain(secret);
    expect(serialise(thrown)).not.toContain(secret);
    expect(JSON.stringify(await service.getClaimStatus(payload.refundId))).not.toContain(secret);
  });

  it("never logs or reports the secret when the network request itself throws", async () => {
    (global as unknown as { fetch: unknown }).fetch = jest
      .fn()
      .mockRejectedValue(new Error("socket hang up"));

    const service = new RefundService(new InMemoryRefundStore(), new TrustlessWorkRefundExecutor());

    await expect(service.claimRefund(payload)).rejects.toThrow();

    expect(logger.error).toHaveBeenCalledWith(expect.anything(), "refund.execution_failed");
    expect(sentry.captureException).toHaveBeenCalled();
    expect(collectAllSinkOutput()).not.toContain(secret);
  });
});
