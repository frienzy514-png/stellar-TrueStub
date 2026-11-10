import {
  StellarWalletsKit,
  WalletNetwork,
  FREIGHTER_ID,
  AlbedoModule,
  FreighterModule,
} from "@creit.tech/stellar-wallets-kit";

/**
 * Stellar Wallet Kit
 *
 * @description The Stellar Wallet Kit is used to connect to the wallet
 * @description The Stellar Wallet Kit is used to sign transactions
 * @description The Stellar Wallet Kit is used to get the wallet address
 */
export const kit: StellarWalletsKit = new StellarWalletsKit({
  network: WalletNetwork.TESTNET,
  selectedWalletId: FREIGHTER_ID,
  modules: [new FreighterModule(), new AlbedoModule()],
});

export interface SignTransactionParams {
  unsignedTransaction: string;
  address: string;
}

export type TestSignTransactionHandler = (
  params: SignTransactionParams,
) => Promise<string> | string;

export const MOCK_SIGNED_XDR_STORAGE_KEY = "truestub:mockSignedXdr";

/**
 * Sign Transaction Params
 *
 * Supports a documented E2E/test signing seam (`window.__TRUESTUB_SIGN_XDR__`
 * or `localStorage.getItem("truestub:mockSignedXdr")`) so automated specs can
 * exercise the full escrow lifecycle without driving a live browser extension.
 *
 * @param unsignedTransaction - The unsigned transaction
 * @param address - The address of the wallet
 */
export const signTransaction = async ({
  unsignedTransaction,
  address,
}: SignTransactionParams): Promise<string> => {
  if (typeof window !== "undefined") {
    const customSigner = (
      window as unknown as {
        __TRUESTUB_SIGN_XDR__?: TestSignTransactionHandler;
      }
    ).__TRUESTUB_SIGN_XDR__;

    if (typeof customSigner === "function") {
      return await customSigner({ unsignedTransaction, address });
    }

    try {
      const mockSignedPrefix = window.localStorage.getItem(
        MOCK_SIGNED_XDR_STORAGE_KEY,
      );
      if (mockSignedPrefix) {
        if (mockSignedPrefix === "REJECT") {
          throw new Error("Wallet transaction signing was rejected");
        }
        return `${mockSignedPrefix}:${unsignedTransaction}`;
      }
    } catch (err) {
      if (
        err instanceof Error &&
        err.message.includes("signing was rejected")
      ) {
        throw err;
      }
    }
  }

  const { signedTxXdr } = await kit.signTransaction(unsignedTransaction, {
    address,
    networkPassphrase: WalletNetwork.TESTNET,
  });

  return signedTxXdr;
};
