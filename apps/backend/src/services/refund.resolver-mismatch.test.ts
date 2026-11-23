/**
 * #556 — a refund claim must be rejected when the escrow's `disputeResolver`
 * is not the configured resolver key.
 *
 * The backend never reads an escrow's `disputeResolver` itself. It always
 * sends the configured resolver's public key in the resolve-dispute request,
 * and the escrow contract only accepts a resolution signed by the role it was
 * initialised with. These tests cover the backend side of that guarantee:
 *   - the request names only the configured resolver key, and
 *   - when Trustless Work refuses a mismatched resolver, the claim is rejected
 *     and nothing is submitted to Stellar.
 */

import { Keypair } from "@stellar/stellar-sdk";
import { RefundService, InMemoryRefundStore, TrustlessWorkRefundExecutor } from "./refund.service";
import { AppError } from "../middleware/errorHandler";
import { env } from "../config/env";

jest.mock("../config/env", () => {
  const actual = jest.requireActual("../config/env");
  return {
    ...actual,
    env: {
      ...actual.env,
      TRUSTLESS_WORK_API_KEY: "tw-api-key-for-resolver-test",
      TRUSTLESS_WORK_DISPUTE_RESOLVER_SECRET: require("@stellar/stellar-sdk").Keypair.fromRawEd25519Seed(
        Buffer.alloc(32, 9),
      ).secret(),
      TRUSTLESS_WORK_API_URL: "https://trustless.example.test",
      STELLAR_NETWORK: "testnet",
    },
  };
});

const configuredResolver = Keypair.fromSecret(env.TRUSTLESS_WORK_DISPUTE_RESOLVER_SECRET!).publicKey();
const otherResolver = Keypair.random().publicKey();

const payload = {
  refundId: "refund-resolver-1",
  escrowId: "CAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA",
  amount: 25,
  currency: "USDC",
  claimedBy: "buyer-1",
  refundTo: Keypair.random().publicKey(),
  escrowType: "single-release" as const,
};

function jsonResponse(status: number, body: unknown) {
  return {
    ok: status >= 200 && status < 300,
    status,
    statusText: status >= 400 ? "Bad Request" : "OK",
    json: async () => body,
  };
}

describe("refund claim with a mismatched dispute resolver (#556)", () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  it("sends only the configured resolver key in the resolve-dispute request", async () => {
    const fetchMock = jest
      .fn()
      .mockResolvedValue(jsonResponse(400, { message: "disputeResolver does not match escrow" }));
    (global as unknown as { fetch: unknown }).fetch = fetchMock;

    const service = new RefundService(new InMemoryRefundStore(), new TrustlessWorkRefundExecutor());
    await service.claimRefund(payload).catch(() => undefined);

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0];
    expect(String(url)).toContain("/escrow/single-release/resolve-dispute");
    const sent = JSON.parse((init as { body: string }).body);
    expect(sent.disputeResolver).toBe(configuredResolver);
    expect(sent.disputeResolver).not.toBe(otherResolver);
  });

  it("rejects the claim when the escrow's resolver does not match, and submits nothing", async () => {
    const fetchMock = jest
      .fn()
      .mockResolvedValue(jsonResponse(400, { message: "disputeResolver does not match escrow" }));
    (global as unknown as { fetch: unknown }).fetch = fetchMock;

    const store = new InMemoryRefundStore();
    const service = new RefundService(store, new TrustlessWorkRefundExecutor());

    const error = await service.claimRefund(payload).then(
      () => {
        throw new Error("expected claimRefund to reject");
      },
      (err: unknown) => err,
    );

    expect(error).toBeInstanceOf(AppError);
    expect((error as AppError).statusCode).toBe(502);
    expect((error as AppError).message).toContain("disputeResolver does not match escrow");

    // Only the resolve step ran. The signed transaction is never sent to Stellar.
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls.some(([url]) => String(url).includes("send-transaction"))).toBe(false);

    const record = await service.getClaimStatus(payload.refundId);
    expect(record?.status).toBe("failed");
    expect(record?.txHash).toBeUndefined();
  });
});
