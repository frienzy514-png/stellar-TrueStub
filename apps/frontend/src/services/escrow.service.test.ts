/**
 * Tests for issue #138: `escrow.service.ts` signs real Stellar transactions
 * (via `signTransaction` from `@stellar/freighter-api`), submits to the
 * Trustless Work API (via the axios client from `core/config/axios/http`),
 * and reads the connected wallet address from `@creit.tech/stellar-wallets-kit`'s
 * `kit`. A bug here can misfund or fail to fund a real escrow, so every
 * exported function gets a success-path test and failure-path tests for:
 * signing rejected by the user, an API error, and a network timeout.
 */
import { initializedReservationEscrow, fundReservationEscrow } from "./escrow.service";
import http from "@/core/config/axios/http";
import { signTransaction } from "@stellar/freighter-api";

jest.mock("@/components/auth/wallet/constants/wallet-kit.constant", () => ({
  kit: { getAddress: jest.fn() },
}));
jest.mock("@/core/config/axios/http", () => ({
  __esModule: true,
  default: { post: jest.fn() },
}));
jest.mock("@stellar/freighter-api", () => ({
  signTransaction: jest.fn(),
}));
// @creit.tech/stellar-wallets-kit ships ESM-only and isn't otherwise under
// test here (wallet-kit.constant is mocked above) — stub just the
// WalletNetwork enum escrow.service.ts imports directly, so Jest never has
// to transform the real package.
jest.mock("@creit.tech/stellar-wallets-kit", () => ({
  WalletNetwork: { TESTNET: "Test SDF Network ; September 2015" },
}));

import { kit } from "@/components/auth/wallet/constants/wallet-kit.constant";

const mockGetAddress = kit.getAddress as jest.Mock;
const mockPost = http.post as jest.Mock;
const mockSignTransaction = signTransaction as jest.Mock;

const ADDRESS = "GABC123TESTADDRESS";

beforeEach(() => {
  jest.clearAllMocks();
  mockGetAddress.mockResolvedValue({ address: ADDRESS });
});

describe("initializedReservationEscrow", () => {
  const validArgs = {
    eventName: "Test Event",
    description: "A test event",
    price: 100,
    tax: 5,
  };

  it("success path: deploys the escrow, signs the returned XDR, and submits it", async () => {
    mockPost
      .mockResolvedValueOnce({ data: { unsignedTransaction: "UNSIGNED_XDR" } }) // /deployer/multi-release
      .mockResolvedValueOnce({ data: { id: "tx-1", status: "submitted" } }); // /helper/send-transaction
    mockSignTransaction.mockResolvedValue({ signedTxXdr: "SIGNED_XDR" });

    const result = await initializedReservationEscrow(validArgs);

    expect(mockGetAddress).toHaveBeenCalledTimes(1);
    expect(mockPost).toHaveBeenNthCalledWith(
      1,
      "/deployer/multi-release",
      expect.objectContaining({ signer: ADDRESS, amount: 100, platformFee: 5 }),
    );
    expect(mockSignTransaction).toHaveBeenCalledWith("UNSIGNED_XDR", {
      address: ADDRESS,
      networkPassphrase: "Test SDF Network ; September 2015",
    });
    expect(mockPost).toHaveBeenNthCalledWith(2, "/helper/send-transaction", {
      signedXdr: "SIGNED_XDR",
    });
    expect(result).toEqual({ data: { id: "tx-1", status: "submitted" } });
  });

  it("rejects a non-positive price before ever touching the network or the wallet", async () => {
    await expect(
      initializedReservationEscrow({ ...validArgs, price: 0 }),
    ).rejects.toThrow("Invalid price: must be a positive number");

    expect(mockPost).not.toHaveBeenCalled();
    expect(mockSignTransaction).not.toHaveBeenCalled();
  });

  it("rejects a negative tax before ever touching the network or the wallet", async () => {
    await expect(
      initializedReservationEscrow({ ...validArgs, tax: -1 }),
    ).rejects.toThrow("Invalid tax: must be a non-negative number");

    expect(mockPost).not.toHaveBeenCalled();
    expect(mockSignTransaction).not.toHaveBeenCalled();
  });

  it("failure: signing rejected by the user does not submit a transaction", async () => {
    mockPost.mockResolvedValueOnce({ data: { unsignedTransaction: "UNSIGNED_XDR" } });
    mockSignTransaction.mockRejectedValue(new Error("User declined access"));

    await expect(initializedReservationEscrow(validArgs)).rejects.toThrow(
      "User declined access",
    );

    // Regression guard: a rejected signature must never be followed by a
    // submit call — that would be silently funding with garbage/no signature.
    expect(mockPost).toHaveBeenCalledTimes(1);
  });

  it("failure: an API error deploying the escrow propagates and never reaches signing", async () => {
    mockPost.mockRejectedValueOnce(new Error("Request failed with status code 500"));

    await expect(initializedReservationEscrow(validArgs)).rejects.toThrow(
      "Request failed with status code 500",
    );

    expect(mockSignTransaction).not.toHaveBeenCalled();
  });

  it("failure: a network timeout submitting the signed transaction propagates", async () => {
    mockPost
      .mockResolvedValueOnce({ data: { unsignedTransaction: "UNSIGNED_XDR" } })
      .mockRejectedValueOnce(Object.assign(new Error("timeout of 60000ms exceeded"), { code: "ECONNABORTED" }));
    mockSignTransaction.mockResolvedValue({ signedTxXdr: "SIGNED_XDR" });

    await expect(initializedReservationEscrow(validArgs)).rejects.toThrow(
      "timeout of 60000ms exceeded",
    );
  });
});

describe("fundReservationEscrow", () => {
  const validArgs = { contractId: "CONTRACT123", amount: 50 };

  it("success path: funds the escrow, signs the returned XDR, and submits it", async () => {
    mockPost
      .mockResolvedValueOnce({ data: { unsignedTransaction: "UNSIGNED_XDR" } }) // /escrow/multi-release/fund-escrow
      .mockResolvedValueOnce({ data: { id: "tx-2", status: "submitted" } }); // /helper/send-transaction
    mockSignTransaction.mockResolvedValue({ signedTxXdr: "SIGNED_XDR" });

    const result = await fundReservationEscrow(validArgs);

    expect(mockGetAddress).toHaveBeenCalledTimes(1);
    expect(mockPost).toHaveBeenNthCalledWith(1, "/escrow/multi-release/fund-escrow", {
      contractId: "CONTRACT123",
      signer: ADDRESS,
      amount: 50,
    });
    expect(mockSignTransaction).toHaveBeenCalledWith("UNSIGNED_XDR", {
      address: ADDRESS,
      networkPassphrase: "Test SDF Network ; September 2015",
    });
    expect(mockPost).toHaveBeenNthCalledWith(2, "/helper/send-transaction", {
      signedXdr: "SIGNED_XDR",
    });
    expect(result).toEqual({ id: "tx-2", status: "submitted" });
  });

  it("rejects a missing contractId before ever touching the network or the wallet", async () => {
    await expect(
      fundReservationEscrow({ ...validArgs, contractId: "" }),
    ).rejects.toThrow("Contract ID is required");

    expect(mockPost).not.toHaveBeenCalled();
    expect(mockSignTransaction).not.toHaveBeenCalled();
  });

  it("rejects a non-positive amount before ever touching the network or the wallet", async () => {
    await expect(
      fundReservationEscrow({ ...validArgs, amount: 0 }),
    ).rejects.toThrow("Invalid amount: must be a positive number");

    expect(mockPost).not.toHaveBeenCalled();
    expect(mockSignTransaction).not.toHaveBeenCalled();
  });

  it("failure: signing rejected by the user does not submit a transaction", async () => {
    mockPost.mockResolvedValueOnce({ data: { unsignedTransaction: "UNSIGNED_XDR" } });
    mockSignTransaction.mockRejectedValue(new Error("User declined access"));

    await expect(fundReservationEscrow(validArgs)).rejects.toThrow(
      "User declined access",
    );

    expect(mockPost).toHaveBeenCalledTimes(1);
  });

  it("failure: an API error funding the escrow propagates and never reaches signing", async () => {
    mockPost.mockRejectedValueOnce(new Error("Request failed with status code 500"));

    await expect(fundReservationEscrow(validArgs)).rejects.toThrow(
      "Request failed with status code 500",
    );

    expect(mockSignTransaction).not.toHaveBeenCalled();
  });

  it("failure: a network timeout submitting the signed transaction propagates", async () => {
    mockPost
      .mockResolvedValueOnce({ data: { unsignedTransaction: "UNSIGNED_XDR" } })
      .mockRejectedValueOnce(Object.assign(new Error("timeout of 60000ms exceeded"), { code: "ECONNABORTED" }));
    mockSignTransaction.mockResolvedValue({ signedTxXdr: "SIGNED_XDR" });

    await expect(fundReservationEscrow(validArgs)).rejects.toThrow(
      "timeout of 60000ms exceeded",
    );
  });
});
