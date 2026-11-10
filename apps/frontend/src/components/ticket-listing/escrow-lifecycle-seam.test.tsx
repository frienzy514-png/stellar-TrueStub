import React from "react";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import {
  hydrateWalletAuthFromStorage,
  useGlobalAuthenticationStore,
} from "@/core/store/data";
import {
  MOCK_SIGNED_XDR_STORAGE_KEY,
  signTransaction,
} from "@/components/tw-blocks/wallet-kit/wallet-kit";
import { getStoredLifecycleEscrows } from "@/lib/escrow-lifecycle-storage";
import { EscrowConfirmation } from "./EscrowConfirmation";
import EscrowPage from "@/app/dashboard/escrow/page";

jest.mock("@creit.tech/stellar-wallets-kit", () => ({
  StellarWalletsKit: jest.fn().mockImplementation(() => ({
    signTransaction: jest.fn(),
    setWallet: jest.fn(),
    getAddress: jest.fn(),
    disconnect: jest.fn(),
  })),
  WalletNetwork: {
    TESTNET: "Test SDF Network ; September 2015",
    PUBLIC: "Public Global Stellar Network ; September 2015",
  },
  FREIGHTER_ID: "freighter",
  allowAllModules: jest.fn(() => []),
  AlbedoModule: jest.fn(),
  FreighterModule: jest.fn(),
  xBullModule: jest.fn(),
  LobstrModule: jest.fn(),
  RabetModule: jest.fn(),
  HanaModule: jest.fn(),
}));

jest.mock("@stellar/freighter-api", () => ({
  signTransaction: jest.fn(),
}));

jest.mock(
  "@trustless-work/escrow",
  () => ({
    useGetMultipleEscrowBalances: () => ({
      getMultipleBalances: jest.fn().mockResolvedValue([]),
    }),
  }),
  { virtual: true },
);

const mockPush = jest.fn();

jest.mock("next/navigation", () => ({
  useRouter: () => ({
    push: mockPush,
    replace: jest.fn(),
  }),
}));

const mockFundMutateAsync = jest.fn();
const mockApproveMutateAsync = jest.fn();
const mockReleaseMutateAsync = jest.fn();

jest.mock("@/components/tw-blocks/tanstack/useEscrowsMutations", () => ({
  useEscrowsMutations: () => ({
    fundEscrow: { mutateAsync: mockFundMutateAsync },
    approveMilestone: { mutateAsync: mockApproveMutateAsync },
    releaseFunds: { mutateAsync: mockReleaseMutateAsync },
  }),
}));

const TEST_WALLET = "GBCXK3ZQWFWMQJXLSIMVCAHUKTJVWRJPB5XYGZGQCVBWKWVEPTSYLUHI";
const TEST_CONTRACT =
  "CA7QYNF7SOWQ3GLR2BGMZEHXAVIRZA4KVWLTJJFC7MGXUA74P7UJVSGZ";

const samplePurchase = {
  id: "purchase-e2e-full-001",
  listingId: "listing-001",
  eventId: "event-001",
  totalAmount: 450,
  currency: "USDC",
  quantity: 1,
  transferDate: "2026-06-01T00:00:00.000Z",
  eventDate: "2026-06-05T00:00:00.000Z",
  guestEmail: "buyer@truestub.example",
  guestName: "Alex Rivera",
  preferences: { milestonePayments: true },
};

const sampleEvent = {
  id: "event-001",
  name: "Grand Stellar Event",
  walletAddress: TEST_WALLET,
  location: "Downtown, New York City",
};

const sampleEscrow = {
  contractId: TEST_CONTRACT,
  status: "created" as const,
  createdAt: "2026-05-20T12:00:00.000Z",
};

describe("Escrow lifecycle wallet/signing seam & end-to-end state transitions (#502)", () => {
  beforeEach(() => {
    window.localStorage.clear();
    useGlobalAuthenticationStore.getState().clearAuth();
    mockPush.mockReset();
    mockFundMutateAsync.mockReset();
    mockApproveMutateAsync.mockReset();
    mockReleaseMutateAsync.mockReset();
    delete (
      window as unknown as { __TRUESTUB_SIGN_XDR__?: unknown }
    ).__TRUESTUB_SIGN_XDR__;
  });

  it("hydrates and persists connected wallet state via localStorage seam", () => {
    window.localStorage.setItem(
      "address-wallet",
      JSON.stringify({
        state: { address: TEST_WALLET, name: "Freighter", token: "jwt-1" },
      }),
    );

    hydrateWalletAuthFromStorage();

    const state = useGlobalAuthenticationStore.getState();
    expect(state.address).toBe(TEST_WALLET);
    expect(state.name).toBe("Freighter");

    state.disconnectWalletStore();
    expect(useGlobalAuthenticationStore.getState().address).toBe("");
    expect(window.localStorage.getItem("address-wallet")).toBeNull();
  });

  it("signs transactions deterministically via the mockSignedXdr seam and rejects when configured", async () => {
    window.localStorage.setItem(MOCK_SIGNED_XDR_STORAGE_KEY, "MOCK_SIGNED_XDR");

    const signed = await signTransaction({
      unsignedTransaction: "UNSIGNED_TX_PAYLOAD",
      address: TEST_WALLET,
    });
    expect(signed).toBe("MOCK_SIGNED_XDR:UNSIGNED_TX_PAYLOAD");

    window.localStorage.setItem(MOCK_SIGNED_XDR_STORAGE_KEY, "REJECT");
    await expect(
      signTransaction({
        unsignedTransaction: "UNSIGNED_TX_PAYLOAD",
        address: TEST_WALLET,
      }),
    ).rejects.toThrow("Wallet transaction signing was rejected");
  });

  it("progresses an escrow from Pending Funding -> Funded -> Transfer Confirmed -> Completed and renders Completed on the dashboard", async () => {
    await useGlobalAuthenticationStore
      .getState()
      .connectWalletStore(TEST_WALLET, "Freighter");

    mockFundMutateAsync.mockResolvedValue({ status: "SUCCESS" });
    mockApproveMutateAsync.mockResolvedValue({ status: "SUCCESS" });
    mockReleaseMutateAsync.mockResolvedValue({ status: "SUCCESS" });

    const onComplete = jest.fn();

    const { unmount } = render(
      <EscrowConfirmation
        purchase={samplePurchase}
        event={sampleEvent}
        escrowData={sampleEscrow}
        onComplete={onComplete}
      />,
    );

    expect(screen.getByTestId("escrow-lifecycle-status")).toHaveTextContent(
      "Pending Funding",
    );

    // Step 1: Fund Escrow
    fireEvent.click(screen.getByTestId("lifecycle-fund-btn"));
    await waitFor(() => {
      expect(screen.getByTestId("escrow-lifecycle-status")).toHaveTextContent(
        "Funded",
      );
    });
    expect(mockFundMutateAsync).toHaveBeenCalledWith({
      payload: {
        contractId: TEST_CONTRACT,
        amount: 450,
        signer: TEST_WALLET,
      },
      type: "multi-release",
      address: TEST_WALLET,
    });

    // Step 2: Confirm Transfer
    fireEvent.click(screen.getByTestId("lifecycle-confirm-transfer-btn"));
    await waitFor(() => {
      expect(screen.getByTestId("escrow-lifecycle-status")).toHaveTextContent(
        "Transfer Confirmed",
      );
    });
    expect(mockApproveMutateAsync).toHaveBeenCalledWith({
      payload: {
        contractId: TEST_CONTRACT,
        milestoneIndex: "0",
        approver: TEST_WALLET,
        newFlag: true,
      },
      type: "multi-release",
      address: TEST_WALLET,
    });

    // Step 3: Release Funds
    fireEvent.click(screen.getByTestId("lifecycle-release-funds-btn"));
    await waitFor(() => {
      expect(screen.getByTestId("escrow-lifecycle-status")).toHaveTextContent(
        "Completed",
      );
    });
    expect(mockReleaseMutateAsync).toHaveBeenCalledWith({
      payload: {
        contractId: TEST_CONTRACT,
        releaseSigner: TEST_WALLET,
        milestoneIndex: "0",
      },
      type: "multi-release",
      address: TEST_WALLET,
    });

    const stored = getStoredLifecycleEscrows();
    expect(stored[0]?.id).toBe(TEST_CONTRACT);
    expect(stored[0]?.status).toBe("COMPLETED");

    unmount();

    // Verify /dashboard/escrow displays the completed escrow
    render(<EscrowPage />);
    const row = await screen.findByTestId(`escrow-row-${TEST_CONTRACT}`);
    expect(row).toHaveTextContent("Grand Stellar Event");
    expect(row).toHaveTextContent("$450.00");
    expect(row).toHaveTextContent(/Completed/i);
  });

  it("surfaces an alert and prevents lifecycle advancement when a step fails", async () => {
    await useGlobalAuthenticationStore
      .getState()
      .connectWalletStore(TEST_WALLET, "Freighter");

    mockFundMutateAsync.mockRejectedValue(
      new Error("Simulated fund-escrow failure"),
    );

    render(
      <EscrowConfirmation
        purchase={samplePurchase}
        event={sampleEvent}
        escrowData={sampleEscrow}
        onComplete={jest.fn()}
      />,
    );

    fireEvent.click(screen.getByTestId("lifecycle-fund-btn"));

    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent("Simulated fund-escrow failure");
    expect(screen.getByTestId("escrow-lifecycle-status")).toHaveTextContent(
      "Pending Funding",
    );
    expect(
      screen.getByTestId("lifecycle-confirm-transfer-btn"),
    ).toBeDisabled();
  });
});
