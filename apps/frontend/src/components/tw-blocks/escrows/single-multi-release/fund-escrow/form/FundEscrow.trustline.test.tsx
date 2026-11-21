/**
 * Integration coverage for the pre-funding trustline guard (#574).
 *
 * `trustlines.test.ts` proves the registry and the unit-level check logic.
 * These tests render the real `FundEscrowForm` and drive its submit handler,
 * so they assert the trustline prompt is actually wired into the funding
 * button's submit path: a wallet without the USDC trustline must see the
 * prompt and must never reach the fund mutation, and once the trustline is
 * added, funding proceeds.
 *
 * Only the network boundaries are mocked (trustline check/establish, the fund
 * mutation, and the wallet/escrow contexts). The form, its validation, the
 * `useFundingTrustline` hook and `TrustlinePrompt` all run for real.
 */
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import type { FundingAsset } from "@/components/tw-blocks/wallet-kit/trustline-check";

const WALLET = "GBTESTWALLET574";

const usdcAsset: FundingAsset = {
  code: "USDC",
  issuer: "GBUSDCISSUER574",
  name: "USDC",
  network: "testnet",
};

const mockCheckFundingTrustline = jest.fn();
const mockEstablishTrustline = jest.fn();
const mockFundMutateAsync = jest.fn();
const mockUpdateEscrow = jest.fn();

jest.mock("@/components/tw-blocks/wallet-kit/trustline-check", () => ({
  checkFundingTrustline: (...args: unknown[]) => mockCheckFundingTrustline(...args),
  establishTrustline: (...args: unknown[]) => mockEstablishTrustline(...args),
}));

jest.mock("@/components/tw-blocks/tanstack/useEscrowsMutations", () => ({
  useEscrowsMutations: () => ({
    fundEscrow: { mutateAsync: (...args: unknown[]) => mockFundMutateAsync(...args) },
  }),
}));

jest.mock("@/components/tw-blocks/wallet-kit/WalletProvider", () => ({
  useWalletContext: () => ({ walletAddress: WALLET }),
}));

jest.mock("@/components/tw-blocks/providers/EscrowProvider", () => ({
  useEscrowContext: () => ({
    selectedEscrow: {
      contractId: "CONTRACT574",
      type: "multi-release",
      balance: 0,
      trustline: { address: "USDC-ADDRESS-574", name: "USDC" },
    },
    updateEscrow: mockUpdateEscrow,
  }),
}));

jest.mock("sonner", () => ({
  toast: { success: jest.fn(), error: jest.fn() },
}));

import { FundEscrowForm } from "./FundEscrow";

function enterAmountAndSubmit(amount: string) {
  const input = screen.getByPlaceholderText("Enter amount");
  fireEvent.change(input, { target: { value: amount } });
  fireEvent.click(screen.getByRole("button", { name: "Fund" }));
}

describe("FundEscrowForm trustline guard (#574)", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockFundMutateAsync.mockResolvedValue({});
  });

  it("shows the USDC trustline prompt and does not fund when the wallet lacks the trustline", async () => {
    mockCheckFundingTrustline.mockResolvedValue({
      status: "missing",
      asset: usdcAsset,
      reason: "no-trustline",
    });

    render(<FundEscrowForm />);
    enterAmountAndSubmit("25");

    expect(await screen.findByRole("alert")).toHaveTextContent("USDC trustline required");
    expect(screen.getByRole("button", { name: "Add USDC trustline" })).toBeInTheDocument();

    expect(mockCheckFundingTrustline).toHaveBeenCalledWith(WALLET, {
      address: "USDC-ADDRESS-574",
      name: "USDC",
    });
    expect(mockFundMutateAsync).not.toHaveBeenCalled();
  });

  it("tells the user to fund the account with XLM first when the wallet is not yet active", async () => {
    mockCheckFundingTrustline.mockResolvedValue({
      status: "missing",
      asset: usdcAsset,
      reason: "account-not-found",
    });

    render(<FundEscrowForm />);
    enterAmountAndSubmit("25");

    expect(await screen.findByRole("alert")).toHaveTextContent("Fund it with XLM first");
    expect(screen.queryByRole("button", { name: "Add USDC trustline" })).not.toBeInTheDocument();
    expect(mockFundMutateAsync).not.toHaveBeenCalled();
  });

  it("adds the trustline from the prompt and then lets the funding submit go through", async () => {
    mockCheckFundingTrustline
      .mockResolvedValueOnce({ status: "missing", asset: usdcAsset, reason: "no-trustline" })
      .mockResolvedValueOnce({ status: "present", asset: usdcAsset });
    mockEstablishTrustline.mockResolvedValue(undefined);

    render(<FundEscrowForm />);
    enterAmountAndSubmit("25");

    fireEvent.click(await screen.findByRole("button", { name: "Add USDC trustline" }));

    await waitFor(() => expect(mockEstablishTrustline).toHaveBeenCalledWith(WALLET, usdcAsset));
    await waitFor(() =>
      expect(screen.queryByRole("alert")).not.toBeInTheDocument(),
    );

    enterAmountAndSubmit("25");

    await waitFor(() => expect(mockFundMutateAsync).toHaveBeenCalledTimes(1));
    expect(mockFundMutateAsync).toHaveBeenCalledWith(
      expect.objectContaining({
        payload: expect.objectContaining({ amount: 25, contractId: "CONTRACT574", signer: WALLET }),
        type: "multi-release",
      }),
    );
  });

  it("funds directly when the wallet already holds the trustline", async () => {
    mockCheckFundingTrustline.mockResolvedValue({ status: "present", asset: usdcAsset });

    render(<FundEscrowForm />);
    enterAmountAndSubmit("10");

    await waitFor(() => expect(mockFundMutateAsync).toHaveBeenCalledTimes(1));
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });
});
